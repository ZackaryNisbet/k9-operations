// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: breed-detect
// Two-model architecture: GPT-4.1 (breed) + GPT-4.1-mini (collar OCR)
// Uses describe-then-classify approach for maximum accuracy.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const PET_PHOTOS_BUCKET = 'pet-photos';

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function publicStorageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${PET_PHOTOS_BUCKET}/${encodeStoragePath(path)}`;
}

async function callOpenAI(model: string, systemPrompt: string, userContent: Array<Record<string, unknown>>, maxTokens = 1024): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { photo_id } = await req.json();
    if (!photo_id) {
      return new Response(JSON.stringify({ error: 'Missing photo_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: photo, error: fetchErr } = await supabase
      .from('photos')
      .select('id, storage_path, thumbnail_path, detected_breeds, breed_detection_status')
      .eq('id', photo_id)
      .single();

    if (fetchErr || !photo) {
      return new Response(JSON.stringify({ error: 'Photo not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (photo.breed_detection_status === 'completed' && photo.detected_breeds?.length > 0) {
      return new Response(JSON.stringify({ detected_breeds: photo.detected_breeds, status: 'completed', photo }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('photos').update({ breed_detection_status: 'processing' }).eq('id', photo_id);

    // Build image URL — send the stored image directly. Avoid Supabase's render/image
    // transformation endpoint here because each origin photo counts against the
    // Storage Image Transformations quota.
    const storagePath = photo.storage_path || photo.thumbnail_path;
    if (!storagePath) {
      await supabase.from('photos').update({ breed_detection_status: 'failed' }).eq('id', photo_id);
      return new Response(JSON.stringify({ error: 'No image path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageUrl = publicStorageUrl(storagePath);

    // ═══════════════════════════════════════════════════════════
    // PASS 1: GPT-4.1 — Describe then classify (breed + collar)
    // ═══════════════════════════════════════════════════════════

    const breedSystemPrompt = `You are an expert veterinary professional specializing in dog breed identification. You work at a pet boarding facility called K9 Operations.

YOUR TASK: For each dog visible in the photo, FIRST describe their physical appearance in detail, THEN classify their breed.

STEP 1 — DESCRIBE each dog's physical features:
- Coat: color, pattern, texture (smooth, wiry, curly, wavy, long, short)
- Head: shape (round, wedge, flat/brachycephalic, dolichocephalic), muzzle length, stop depth
- Ears: erect, floppy, rose, button, bat
- Body: proportions (compact, athletic, stocky, lean, tall), chest depth, leg length relative to body
- Size estimate: toy (<10 lbs), small (10-25), medium (25-50), large (50-80), giant (80+)
- Any distinctive markings: tuxedo pattern, brindle, merle, saddle, mask, blaze

STEP 2 — CLASSIFY the breed based on your description. Be specific:
- Boston Terrier (compact, tuxedo, flat face) is NOT an Italian Greyhound (slender, pointed face)
- Lab/Shepherd mixes with tan coats and dark muzzles are NOT purebred Labrador Retrievers
- Goldendoodles/Labradoodles have distinct curly/wavy coats — don't confuse with straight-coated retrievers
- If mixed breed, list the most likely 2-3 component breeds

STEP 3 — COLLAR analysis:
- Color of collar (green, blue, pink, red, yellow, teal, or null if none visible)
- Any text/numbers readable on the collar or tag
- These collar colors have specific meanings at this facility — accuracy is critical

Return ONLY a valid JSON array. Each entry:
{
  "description": "Short physical description used for classification",
  "breed": "Breed name",
  "confidence": 0.0-1.0,
  "collar_color": "green" | "blue" | "pink" | "red" | "yellow" | "teal" | null,
  "collar_text": "text if readable" | null,
  "size_category": "small" | "medium" | "large",
  "position": "foreground" | "background"
}`;

    const breedContent = await callOpenAI('gpt-4.1', breedSystemPrompt, [
      {
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'high' },
      },
      {
        type: 'text',
        text: 'Describe and classify every dog in this photo. For each dog: first describe physical features (coat, head, ears, body, markings), then identify the breed. Also note collar color and any text. Return JSON array only.',
      },
    ], 2048);

    // Parse the response
    let detectedBreeds: Array<Record<string, unknown>> = [];
    try {
      detectedBreeds = JSON.parse(breedContent);
    } catch {
      const match = breedContent.match(/\[[\s\S]*\]/);
      if (match) {
        try { detectedBreeds = JSON.parse(match[0]); } catch { /* skip */ }
      }
    }

    if (!Array.isArray(detectedBreeds)) detectedBreeds = [];

    // Normalize and validate
    detectedBreeds = detectedBreeds
      .filter((b) => b && typeof b.breed === 'string')
      .map((b) => ({
        breed: b.breed as string,
        confidence: typeof b.confidence === 'number' ? b.confidence : 0.7,
        collar_color: (b.collar_color as string) || null,
        collar_text: (b.collar_text as string) || null,
        size_category: (b.size_category as string) || null,
        position: (b.position as string) || null,
        description: (b.description as string) || null,
      }));

    // Determine top breed for backward compat
    const topBreed = detectedBreeds.length > 0
      ? detectedBreeds.reduce((best, cur) => ((cur.confidence as number) > (best.confidence as number) ? cur : best))
      : null;

    // Update photo row
    const updateData: Record<string, unknown> = {
      detected_breeds: detectedBreeds,
      breed_detection_status: detectedBreeds.length > 0 ? 'completed' : 'failed',
    };
    if (topBreed) {
      updateData.detected_breed = topBreed.breed;
      updateData.breed_confidence = topBreed.confidence;
    }

    const { data: updatedPhoto } = await supabase
      .from('photos')
      .update(updateData)
      .eq('id', photo_id)
      .select('*')
      .single();

    return new Response(
      JSON.stringify({ detected_breeds: detectedBreeds, status: updateData.breed_detection_status, photo: updatedPhoto }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    try {
      const { photo_id } = await req.clone().json().catch(() => ({ photo_id: null }));
      if (photo_id) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from('photos').update({ breed_detection_status: 'failed' }).eq('id', photo_id);
      }
    } catch { /* best effort */ }

    return new Response(
      JSON.stringify({ error: 'Breed detection failed', details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

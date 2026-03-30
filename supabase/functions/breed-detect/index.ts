// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: breed-detect
// AI-powered dog breed detection using Claude Haiku 3.5 vision.
// Receives a photo_id, fetches the image, calls Anthropic to detect breeds,
// and updates the photo row with detected_breeds JSONB array.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { photo_id } = await req.json();
    if (!photo_id) {
      return new Response(JSON.stringify({ error: 'Missing photo_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch photo row
    const { data: photo, error: fetchErr } = await supabase
      .from('photos')
      .select('id, storage_path, thumbnail_path, detected_breeds, breed_detection_status')
      .eq('id', photo_id)
      .single();

    if (fetchErr || !photo) {
      return new Response(JSON.stringify({ error: 'Photo not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. If already completed, return existing results
    if (photo.breed_detection_status === 'completed' && photo.detected_breeds?.length > 0) {
      return new Response(JSON.stringify({ detected_breeds: photo.detected_breeds, status: 'completed', photo }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Update status to processing
    await supabase
      .from('photos')
      .update({ breed_detection_status: 'processing' })
      .eq('id', photo_id);

    // 4. Build image URL — use Supabase Storage image transform to get ~800px version
    // Full-res (5-10MB) exceeds edge function memory; thumbnail (300px) loses breed detail
    // Supabase transform resizes server-side, giving us a good middle ground
    const storagePath = photo.storage_path || photo.thumbnail_path;
    if (!storagePath) {
      await supabase
        .from('photos')
        .update({ breed_detection_status: 'failed' })
        .eq('id', photo_id);
      return new Response(JSON.stringify({ error: 'No image path available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use Supabase image transform for ~800px wide version (much better than 300px thumbnail)
    // Falls back to public URL if transforms aren't available
    const imageUrl = photo.storage_path
      ? `${SUPABASE_URL}/storage/v1/render/image/public/pet-photos/${photo.storage_path}?width=800&quality=75`
      : `${SUPABASE_URL}/storage/v1/object/public/pet-photos/${storagePath}`;

    // 5. Download image and convert to base64 for Anthropic API
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      await supabase
        .from('photos')
        .update({ breed_detection_status: 'failed' })
        .eq('id', photo_id);
      return new Response(JSON.stringify({ error: 'Failed to download image' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const imgBuffer = await imgResponse.arrayBuffer();
    // Chunked base64 encoding to avoid max call stack on large images
    const bytes = new Uint8Array(imgBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64Image = btoa(binary);
    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
    // Anthropic accepts: image/jpeg, image/png, image/gif, image/webp
    const mediaType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType)
      ? contentType
      : 'image/jpeg';

    // 6. Call Anthropic Claude Haiku 3.5 with vision
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: `You are an expert dog breed identifier working at a pet boarding facility. You MUST identify the specific breed of each dog visible in the photo. Pay close attention to:
- Body proportions (height, leg length, body length, chest depth)
- Head shape and muzzle length
- Ear shape and position
- Coat type, color, and pattern
- Tail shape and carriage
- Overall size category (toy, small, medium, large, giant)

Common breeds at boarding facilities include sighthounds (Greyhound, Whippet, Italian Greyhound), bully breeds (Pit Bull, American Staffordshire Terrier, Boxer), retrievers (Golden, Labrador), shepherds (German Shepherd, Australian Shepherd), doodles (Goldendoodle, Labradoodle, Bernedoodle), spaniels, terriers, and many mixes.

Be specific. A tall, lean dog with long thin legs is likely a Greyhound or Whippet, NOT a Boxer. A stocky muscular dog with a wide head is a Pit Bull or Boxer.

Return ONLY a valid JSON array. No markdown, no explanation, no text outside the array.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: 'Identify every dog breed in this photo. For each dog visible, return the most likely breed using standard AKC breed names. If mixed, list the most likely parent breeds separately. Return JSON only: [{"breed": "Greyhound", "confidence": 0.95}]',
              },
            ],
          },
        ],
      }),
    });

    const anthropicData = await anthropicRes.json();

    // Debug: if Anthropic returned an error, surface it
    if (anthropicData.error) {
      console.error('Anthropic API error:', JSON.stringify(anthropicData.error));
      await supabase
        .from('photos')
        .update({ breed_detection_status: 'failed' })
        .eq('id', photo_id);
      return new Response(
        JSON.stringify({ error: 'AI detection failed', details: anthropicData.error }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = anthropicData.content?.[0]?.text || '';

    // 7. Parse the JSON array from the response
    let detectedBreeds: Array<{ breed: string; confidence: number }> = [];
    try {
      // Try direct parse first
      detectedBreeds = JSON.parse(content);
    } catch {
      // Try to extract JSON array from the response text
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          detectedBreeds = JSON.parse(match[0]);
        } catch {
          // Could not parse
        }
      }
    }

    // Validate structure
    if (!Array.isArray(detectedBreeds)) {
      detectedBreeds = [];
    }
    detectedBreeds = detectedBreeds.filter(
      (b) => b && typeof b.breed === 'string' && typeof b.confidence === 'number'
    );

    // 8. Determine highest confidence breed for backward compat
    const topBreed = detectedBreeds.length > 0
      ? detectedBreeds.reduce((best, cur) => (cur.confidence > best.confidence ? cur : best))
      : null;

    // 9. Update photo row
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
      JSON.stringify({
        detected_breeds: detectedBreeds,
        status: updateData.breed_detection_status,
        photo: updatedPhoto,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    // On any unhandled error, try to mark status as failed
    try {
      const { photo_id } = await req.clone().json().catch(() => ({ photo_id: null }));
      if (photo_id) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase
          .from('photos')
          .update({ breed_detection_status: 'failed' })
          .eq('id', photo_id);
      }
    } catch {
      // Best effort
    }

    return new Response(
      JSON.stringify({ error: 'Breed detection failed', details: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

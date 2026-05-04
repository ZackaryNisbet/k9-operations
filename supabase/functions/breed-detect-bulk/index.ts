// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: breed-detect-bulk
// Bulk breed detection using GPT-4.1 with describe-then-classify.
// Processes pending photos in batches.

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

const BREED_SYSTEM_PROMPT = `You are an expert veterinary professional specializing in dog breed identification at a pet boarding facility.

For each dog visible in the photo, FIRST describe their physical appearance, THEN classify their breed.

STEP 1 — DESCRIBE physical features: coat (color, pattern, texture), head shape, muzzle, ears, body proportions, size, distinctive markings.
STEP 2 — CLASSIFY the breed based on your description. If mixed breed, list the 2-3 most likely component breeds.
STEP 3 — COLLAR: color (green/blue/pink/red/yellow/teal/null) and any readable text.

Return ONLY a valid JSON array:
[{"description": "physical features", "breed": "breed name", "confidence": 0.0-1.0, "collar_color": "color"|null, "collar_text": "text"|null, "size_category": "small"|"medium"|"large", "position": "foreground"|"background"}]`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { location_id, batch_size = 5, allow_bulk = false } = await req.json();
    if (!location_id) {
      return new Response(JSON.stringify({ error: 'Missing location_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!allow_bulk) {
      return new Response(JSON.stringify({
        processed: 0,
        remaining: null,
        results: [],
        skipped: true,
        reason: 'Bulk breed detection is disabled by default to protect Supabase Storage egress. Use single-photo detection when a user opens a photo.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safeBatchSize = Math.min(Math.max(Number(batch_size) || 5, 1), 5);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get pending photos. Prefer ai_image_path to avoid serving full camera
    // originals for routine analysis.
    const { data: pendingPhotos, error: queryErr } = await supabase
      .from('photos')
      .select('id, storage_path, ai_image_path, thumbnail_path')
      .eq('location_id', location_id)
      .eq('breed_detection_status', 'pending')
      .not('storage_path', 'is', null)
      .limit(safeBatchSize);

    if (queryErr || !pendingPhotos || pendingPhotos.length === 0) {
      const { count } = await supabase
        .from('photos')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', location_id)
        .eq('breed_detection_status', 'pending');

      return new Response(JSON.stringify({ processed: 0, remaining: count || 0, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { count: remainingCount } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', location_id)
      .eq('breed_detection_status', 'pending');

    const results: Array<Record<string, unknown>> = [];

    for (const photo of pendingPhotos) {
      await supabase.from('photos').update({ breed_detection_status: 'processing' }).eq('id', photo.id);

      // Send the medium AI derivative when available instead of using Supabase
      // render/image or the full camera original.
      const storagePath = photo.ai_image_path || photo.storage_path || photo.thumbnail_path;
      if (!storagePath) {
        await supabase.from('photos').update({ breed_detection_status: 'failed' }).eq('id', photo.id);
        results.push({ photo_id: photo.id, status: 'failed', breeds: [] });
        continue;
      }
      const imageUrl = publicStorageUrl(storagePath);

      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4.1',
            max_tokens: 2048,
            temperature: 0.1,
            messages: [
              { role: 'system', content: BREED_SYSTEM_PROMPT },
              { role: 'user', content: [
                { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
                { type: 'text', text: 'Describe and classify every dog. Note collar color and text. Return JSON array.' },
              ]},
            ],
          }),
        });

        const data = await res.json();
        if (data.error) {
          console.error('OpenAI error for photo', photo.id, ':', JSON.stringify(data.error));
          await supabase.from('photos').update({ breed_detection_status: 'failed' }).eq('id', photo.id);
          results.push({ photo_id: photo.id, status: 'failed', breeds: [] });
          continue;
        }

        const content = data.choices?.[0]?.message?.content || '';
        let detectedBreeds: Array<Record<string, unknown>> = [];
        try {
          detectedBreeds = JSON.parse(content);
        } catch {
          const match = content.match(/\[[\s\S]*\]/);
          if (match) { try { detectedBreeds = JSON.parse(match[0]); } catch { /* skip */ } }
        }

        if (!Array.isArray(detectedBreeds)) detectedBreeds = [];
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

        const topBreed = detectedBreeds.length > 0
          ? detectedBreeds.reduce((best, cur) => ((cur.confidence as number) > (best.confidence as number) ? cur : best))
          : null;

        const updateData: Record<string, unknown> = {
          detected_breeds: detectedBreeds,
          breed_detection_status: detectedBreeds.length > 0 ? 'completed' : 'failed',
        };
        if (topBreed) {
          updateData.detected_breed = topBreed.breed;
          updateData.breed_confidence = topBreed.confidence;
        }

        await supabase.from('photos').update(updateData).eq('id', photo.id);
        results.push({ photo_id: photo.id, status: detectedBreeds.length > 0 ? 'completed' : 'failed', breeds: detectedBreeds });
      } catch (photoErr) {
        console.error('Error processing photo', photo.id, ':', (photoErr as Error).message);
        await supabase.from('photos').update({ breed_detection_status: 'failed' }).eq('id', photo.id);
        results.push({ photo_id: photo.id, status: 'failed', breeds: [] });
      }

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return new Response(
      JSON.stringify({ processed: results.length, remaining: (remainingCount || 0) - results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Bulk detection failed', details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

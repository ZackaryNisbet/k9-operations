// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: breed-detect-bulk
// Bulk AI-powered dog breed detection using Claude Haiku 4.5 vision.
// Processes pending photos in batches for a given location.

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
    const { location_id, batch_size = 10 } = await req.json();
    if (!location_id) {
      return new Response(JSON.stringify({ error: 'Missing location_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Query pending photos with thumbnails
    const { data: pendingPhotos, error: queryErr } = await supabase
      .from('photos')
      .select('id, storage_path, thumbnail_path')
      .eq('location_id', location_id)
      .eq('breed_detection_status', 'pending')
      .not('thumbnail_path', 'is', null)
      .limit(batch_size);

    if (queryErr) {
      return new Response(JSON.stringify({ error: 'Query failed', details: queryErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!pendingPhotos || pendingPhotos.length === 0) {
      // Check total remaining (including those without thumbnails)
      const { count } = await supabase
        .from('photos')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', location_id)
        .eq('breed_detection_status', 'pending');

      return new Response(JSON.stringify({ processed: 0, remaining: count || 0, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Count total remaining for progress
    const { count: totalRemaining } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', location_id)
      .eq('breed_detection_status', 'pending')
      .not('thumbnail_path', 'is', null);

    const results: Array<{ photo_id: string; status: string; breeds: unknown[] }> = [];

    // 2. Process each photo sequentially
    for (const photo of pendingPhotos) {
      try {
        // Mark as processing
        await supabase
          .from('photos')
          .update({ breed_detection_status: 'processing' })
          .eq('id', photo.id);

        // Build image URL — use Supabase image transform for ~800px version
        const imageUrl = photo.storage_path
          ? `${SUPABASE_URL}/storage/v1/render/image/public/pet-photos/${photo.storage_path}?width=800&quality=75`
          : `${SUPABASE_URL}/storage/v1/object/public/pet-photos/${photo.thumbnail_path || photo.storage_path}`;

        // Download image and convert to base64
        const imgResponse = await fetch(imageUrl);
        if (!imgResponse.ok) {
          await supabase
            .from('photos')
            .update({ breed_detection_status: 'failed' })
            .eq('id', photo.id);
          results.push({ photo_id: photo.id, status: 'failed', breeds: [] });
          continue;
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
        const mediaType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType)
          ? contentType
          : 'image/jpeg';

        // Call Anthropic Claude Haiku 4.5 with vision
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

        if (anthropicData.error) {
          console.error('Anthropic API error for photo', photo.id, ':', JSON.stringify(anthropicData.error));
          await supabase
            .from('photos')
            .update({ breed_detection_status: 'failed' })
            .eq('id', photo.id);
          results.push({ photo_id: photo.id, status: 'failed', breeds: [] });
          continue;
        }

        const content = anthropicData.content?.[0]?.text || '';

        // Parse the JSON array from the response
        let detectedBreeds: Array<{ breed: string; confidence: number }> = [];
        try {
          detectedBreeds = JSON.parse(content);
        } catch {
          const match = content.match(/\[[\s\S]*\]/);
          if (match) {
            try {
              detectedBreeds = JSON.parse(match[0]);
            } catch {
              // Could not parse
            }
          }
        }

        if (!Array.isArray(detectedBreeds)) {
          detectedBreeds = [];
        }
        detectedBreeds = detectedBreeds.filter(
          (b) => b && typeof b.breed === 'string' && typeof b.confidence === 'number'
        );

        // Determine highest confidence breed
        const topBreed = detectedBreeds.length > 0
          ? detectedBreeds.reduce((best, cur) => (cur.confidence > best.confidence ? cur : best))
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

        await supabase
          .from('photos')
          .update(updateData)
          .eq('id', photo.id);

        results.push({
          photo_id: photo.id,
          status: detectedBreeds.length > 0 ? 'completed' : 'failed',
          breeds: detectedBreeds,
        });

        // Small delay between calls to avoid rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.error('Error processing photo', photo.id, ':', (err as Error).message);
        await supabase
          .from('photos')
          .update({ breed_detection_status: 'failed' })
          .eq('id', photo.id);
        results.push({ photo_id: photo.id, status: 'failed', breeds: [] });
      }
    }

    const remaining = (totalRemaining || 0) - pendingPhotos.length;

    return new Response(
      JSON.stringify({
        processed: pendingPhotos.length,
        remaining: Math.max(0, remaining),
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Bulk breed detection failed', details: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

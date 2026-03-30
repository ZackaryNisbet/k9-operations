// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: breed-detect
// AI-powered dog breed detection using GPT-4.1-nano vision.
// Receives a photo_id, fetches the image, calls OpenAI to detect breeds,
// and updates the photo row with detected_breeds JSONB array.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = 'https://xuzvqcpthqikyroqhypw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

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

    // 4. Build image URL (prefer thumbnail — smaller, cheaper)
    const imagePath = photo.thumbnail_path || photo.storage_path;
    if (!imagePath) {
      await supabase
        .from('photos')
        .update({ breed_detection_status: 'failed' })
        .eq('id', photo_id);
      return new Response(JSON.stringify({ error: 'No image path available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/pet-photos/${imagePath}`;

    // 5. Call OpenAI GPT-4.1-nano with vision
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [
          {
            role: 'system',
            content: 'You are a dog breed identification expert. Analyze the photo and identify all dog breeds visible. Return ONLY a JSON array, nothing else.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Identify every dog breed in this photo. For each dog, return breed name (use common American Kennel Club names like \'Golden Retriever\', \'French Bulldog\', \'Labrador Retriever\'). If a dog appears to be a mix, include both parent breeds. Return JSON: [{"breed": "Golden Retriever", "confidence": 0.95}]',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'low' },
              },
            ],
          },
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content || '';

    // 6. Parse the JSON array from the response
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

    // 7. Determine highest confidence breed for backward compat
    const topBreed = detectedBreeds.length > 0
      ? detectedBreeds.reduce((best, cur) => (cur.confidence > best.confidence ? cur : best))
      : null;

    // 8. Update photo row
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

// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: breed-compare
// Visual comparison: compares a facility photo against dog profile photos
// to determine which dog is actually in the photo based on coat color,
// markings, body shape, and size.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const PET_PHOTOS_BUCKET = 'pet-photos';

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function publicStorageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${PET_PHOTOS_BUCKET}/${encodeStoragePath(path)}`;
}

function facilityPhotoUrl(photoUrl: string): string {
  if (photoUrl.startsWith('http')) return photoUrl;
  return publicStorageUrl(photoUrl);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { photo_url, candidates } = await req.json();
    // photo_url: the facility photo URL (from Supabase storage)
    // candidates: [{ name, breed, gingr_id, profile_photo_url }]

    if (!photo_url || !candidates?.length) {
      return new Response(JSON.stringify({ error: 'Missing photo_url or candidates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Limit to top 5 candidates to control cost
    const topCandidates = candidates.slice(0, 5);

    // Download the stored facility photo directly. Avoid Supabase render/image
    // here because every transformed origin photo counts against the monthly
    // Storage Image Transformations quota.
    const facilityImgUrl = facilityPhotoUrl(photo_url);

    const facilityRes = await fetch(facilityImgUrl);
    if (!facilityRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to download facility photo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const facilityBuffer = await facilityRes.arrayBuffer();
    const facilityBytes = new Uint8Array(facilityBuffer);
    let facilityBinary = '';
    for (let i = 0; i < facilityBytes.length; i += 8192) {
      facilityBinary += String.fromCharCode(...facilityBytes.subarray(i, i + 8192));
    }
    const facilityBase64 = btoa(facilityBinary);
    const facilityType = facilityRes.headers.get('content-type') || 'image/jpeg';
    const facilityMedia = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(facilityType)
      ? facilityType : 'image/jpeg';

    // Download each candidate's profile photo and build the comparison content
    const candidateImages: Array<{ name: string; breed: string; gingr_id: string; base64: string; mediaType: string }> = [];

    for (const c of topCandidates) {
      if (!c.profile_photo_url) continue;
      try {
        // Gingr photos are on Google Cloud Storage — fetch directly
        let url = c.profile_photo_url.replace(/ /g, '%20');
        // Ensure https
        if (!url.startsWith('http')) url = 'https://' + url;
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) {
          console.error(`Failed to download ${c.name} photo: ${res.status} ${url}`);
          continue;
        }
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // Skip if too large — base64 adds ~33% overhead, and Anthropic limit is 5MB base64
        // 3.5MB raw → ~4.7MB base64 (safe under 5MB)
        if (bytes.length > 3.5 * 1024 * 1024) {
          console.warn(`${c.name} photo too large (${(bytes.length/1024/1024).toFixed(1)}MB), skipping`);
          continue;
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        const base64 = btoa(binary);
        const ct = res.headers.get('content-type') || 'image/jpeg';
        const media = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(ct) ? ct : 'image/jpeg';
        candidateImages.push({ name: c.name, breed: c.breed, gingr_id: c.gingr_id, base64, mediaType: media });
      } catch {
        // Skip failed downloads
      }
    }

    if (candidateImages.length === 0) {
      // No profile photos available — can't do visual comparison
      return new Response(JSON.stringify({
        comparisons: topCandidates.map(c => ({
          gingr_id: c.gingr_id,
          name: c.name,
          visual_match: 0,
          visual_notes: 'No profile photo available',
        })),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build the multi-image message for Claude
    // Image 1: facility photo (the photo we're trying to match)
    // Images 2-N: candidate profile photos
    const messageContent: Array<Record<string, unknown>> = [
      {
        type: 'image',
        source: { type: 'base64', media_type: facilityMedia, data: facilityBase64 },
      },
      {
        type: 'text',
        text: `This is a photo taken at a dog boarding facility. The foreground dog is the one we need to identify.\n\nBelow are profile photos of ${candidateImages.length} candidate dogs. For EACH candidate, compare them to the foreground dog and score how likely it is that they are the SAME dog based on:\n- Coat color (most important — a gray dog cannot be a brown dog)\n- Coat pattern and markings\n- Body shape and proportions\n- Size\n- Face shape\n\nReturn ONLY a JSON array with one entry per candidate:\n[{"name": "Primo", "gingr_id": "2184", "visual_match": 85, "reason": "Same fawn/tan coat color, lean greyhound build, matching head shape"}]\n\nvisual_match is 0-100 where 100 = definitely the same dog, 0 = definitely not.\nBe STRICT about coat color — if colors don't match, score below 20.\n\nCandidate dogs:`,
      },
    ];

    // Add each candidate's profile photo
    for (const c of candidateImages) {
      messageContent.push({
        type: 'text',
        text: `\n--- ${c.name} (${c.breed}, gingr_id: ${c.gingr_id}) ---`,
      });
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: c.mediaType, data: c.base64 },
      });
    }

    // Call Claude
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: 'You are an expert at visually identifying individual dogs. Compare the facility photo to each candidate profile photo. Be STRICT about coat color matching — this is the #1 differentiator. A gray/silver dog is NOT the same as a brown/tan dog. Return ONLY valid JSON.',
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    const anthropicData = await anthropicRes.json();

    if (anthropicData.error) {
      return new Response(JSON.stringify({ error: 'AI comparison failed', details: anthropicData.error }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = anthropicData.content?.[0]?.text || '';

    // Parse JSON response
    let comparisons: Array<{ name: string; gingr_id: string; visual_match: number; reason: string }> = [];
    try {
      comparisons = JSON.parse(content);
    } catch {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try { comparisons = JSON.parse(match[0]); } catch { /* skip */ }
      }
    }

    if (!Array.isArray(comparisons)) comparisons = [];
    comparisons = comparisons.filter(c => c && typeof c.visual_match === 'number');

    // Include candidates without profile photos as 0 match
    for (const c of topCandidates) {
      if (!comparisons.find(comp => comp.gingr_id === c.gingr_id)) {
        comparisons.push({
          name: c.name,
          gingr_id: c.gingr_id,
          visual_match: 0,
          reason: 'No profile photo for visual comparison',
        });
      }
    }

    return new Response(
      JSON.stringify({ comparisons }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Visual comparison failed', details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: get-room-assignments
// Fetches room assignments from Gingr API for a given date.
// Returns a map of animal_name → room_name for all occupied rooms.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function loadGingrConfig(supabase: any, locationId: string) {
  const { data: settingsRows } = await supabase
    .from('lite_settings')
    .select('setting_value')
    .eq('location_id', locationId)
    .eq('setting_key', 'gingr_config')
    .limit(1);

  const gingrConfig = settingsRows?.[0]?.setting_value;
  if (gingrConfig?.api_key && gingrConfig?.subdomain) {
    return {
      apiKey: gingrConfig.api_key,
      subdomain: gingrConfig.subdomain,
      gingrLocationId: gingrConfig.gingr_location_id || '1',
    };
  }

  const { data: creds } = await supabase
    .from('k9_gingr_credentials')
    .select('gingr_subdomain, gingr_api_key, gingr_location_id')
    .eq('location_id', locationId)
    .maybeSingle();

  if (!creds?.gingr_api_key || !creds?.gingr_subdomain) {
    throw new Error(`No Gingr credentials found for location ${locationId}`);
  }

  return {
    apiKey: creds.gingr_api_key,
    subdomain: creds.gingr_subdomain,
    gingrLocationId: creds.gingr_location_id || '1',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { date, location_id: locationId } = await req.json(); // date in YYYY-MM-DD format
    if (!date || !locationId) {
      return new Response(JSON.stringify({ error: 'Missing date' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { apiKey, subdomain, gingrLocationId } = await loadGingrConfig(supabase, locationId);

    // Convert YYYY-MM-DD to MM-DD-YYYY for Gingr API
    const [year, month, day] = date.split('-');
    const gingrDate = `${month}-${day}-${year}`;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nd = nextDay.toISOString().split('T')[0].split('-');
    const gingrNextDate = `${nd[1]}-${nd[2]}-${nd[0]}`;

    // Gingr returns all boarding areas from any boarding type id. Use one call.
    const body = new URLSearchParams();
    body.append('key', apiKey);
    body.append('location_id', gingrLocationId);
    body.append('type_id', '5');
    body.append('reservation_dates[0][startDate]', gingrDate);
    body.append('reservation_dates[0][endDate]', gingrNextDate);

    const res = await fetch(`https://${subdomain}.gingrapp.com/api/v1/get_runs_and_reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Gingr get_runs_and_reservations error ${res.status}: ${await res.text()}`);
    }
    const results = await res.json();

    // Parse all runs to build animal_name → room_name map
    const roomMap: Record<string, string> = {};

    for (const area of Array.isArray(results) ? results : []) {
      for (const run of area.runs || []) {
        const runName = run.name || '';
        for (const rd of run.reservation_date || []) {
          if (rd.date === date && rd.occupied && rd.animal_name) {
            const animalEntries = rd.animal_name.split('<br>');
            for (const entry of animalEntries) {
              const match = entry.trim().match(/^([^(]+)/);
              if (match) {
                const dogName = match[1].trim();
                roomMap[dogName] = runName;
                roomMap[dogName.toLowerCase()] = runName;
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ date, location_id: locationId, rooms: roomMap, count: Object.keys(roomMap).length / 2 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch room assignments', details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

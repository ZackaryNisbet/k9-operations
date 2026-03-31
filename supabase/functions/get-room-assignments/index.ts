// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: get-room-assignments
// Fetches room assignments from Gingr API for a given date.
// Returns a map of animal_name → room_name for all occupied rooms.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GINGR_API_KEY = 'a0fec5e66b3c3be8b6085b2708b3806e';
const GINGR_BASE_URL = 'https://your-gingr-subdomain.gingrapp.com/api/v1';

// Lodging type IDs: 5=Luxury, 6=Executive, 7=Single, 8=Double
const LODGING_TYPE_IDS = [5, 6, 7, 8];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { date } = await req.json(); // date in YYYY-MM-DD format
    if (!date) {
      return new Response(JSON.stringify({ error: 'Missing date' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert YYYY-MM-DD to MM-DD-YYYY for Gingr API
    const [year, month, day] = date.split('-');
    const gingrDate = `${month}-${day}-${year}`;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nd = nextDay.toISOString().split('T')[0].split('-');
    const gingrNextDate = `${nd[1]}-${nd[2]}-${nd[0]}`;

    // Fetch all 4 lodging types in parallel
    const results = await Promise.all(
      LODGING_TYPE_IDS.map(async (typeId) => {
        const body = new URLSearchParams();
        body.append('key', GINGR_API_KEY);
        body.append('location_id', '1');
        body.append('type_id', String(typeId));
        body.append('reservation_dates[0][startDate]', gingrDate);
        body.append('reservation_dates[0][endDate]', gingrNextDate);

        const res = await fetch(`${GINGR_BASE_URL}/get_runs_and_reservations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        return res.json();
      })
    );

    // Parse all runs to build animal_name → room_name map
    const roomMap: Record<string, string> = {};

    for (const data of results) {
      const lodgingTypes = Array.isArray(data) ? data : [data];
      for (const lt of lodgingTypes) {
        const runs = lt.runs || [];
        for (const run of runs) {
          const runName = run.name || '';
          for (const rd of run.reservation_date || []) {
            if (rd.date === date && rd.occupied && rd.animal_name) {
              // animal_name can be "Mia (Michelle Mento)<br>Primo (Michelle Mento)"
              const animalEntries = rd.animal_name.split('<br>');
              for (const entry of animalEntries) {
                // Extract just the dog name (before the parenthetical owner)
                const match = entry.trim().match(/^([^(]+)/);
                if (match) {
                  const dogName = match[1].trim();
                  roomMap[dogName] = runName;
                  // Also store lowercase for fuzzy matching
                  roomMap[dogName.toLowerCase()] = runName;
                }
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ date, rooms: roomMap, count: Object.keys(roomMap).length / 2 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch room assignments', details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

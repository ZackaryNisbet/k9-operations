// ============================================================================
// Gingr Back-of-House Poll — K9 Operations Lite
// Polls Gingr BOH endpoint and upserts checking_in / checking_out into
// gingr_back_of_house table. Stale rows (>5 min) are deleted each run.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function gingrFetch(
  subdomain: string,
  endpoint: string,
  apiKey: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>
) {
  const url = `https://${subdomain}.gingrapp.com/api/v1/${endpoint}`;

  let resp: Response;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.append("key", apiKey);
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        params.append(k, v);
      }
    }
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });
  } else {
    const params = new URLSearchParams({ key: apiKey });
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        params.append(k, v);
      }
    }
    resp = await fetch(`${url}?${params.toString()}`);
  }

  if (!resp.ok) {
    throw new Error(`Gingr API error ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization") || "";
    const apiKeyHeader = req.headers.get("apikey") || "";
    const hasServiceAuth =
      authHeader === `Bearer ${supabaseServiceKey}` ||
      apiKeyHeader === supabaseServiceKey;

    if (!hasServiceAuth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { location_id } = await req.json();

    if (!location_id) {
      return new Response(JSON.stringify({ error: "location_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();

    // Initialize Supabase with service role for writes
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Gingr config from lite_settings
    const { data: settingsRows } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", location_id)
      .eq("setting_key", "gingr_config")
      .limit(1);

    const gingrConfig = settingsRows?.[0]?.setting_value;
    if (!gingrConfig?.api_key || !gingrConfig?.subdomain) {
      return new Response(
        JSON.stringify({ error: "Gingr not configured for this location." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { api_key, subdomain, gingr_location_id } = gingrConfig;

    // Call Gingr BOH endpoint
    const bohData = await gingrFetch(subdomain, "back_of_house", api_key, "GET", {
      location_id: String(gingr_location_id || 1),
      full_day: "true",
    });

    const checkingIn: any[] = bohData.checking_in || [];
    const checkingOut: any[] = bohData.checking_out || [];
    const nowIso = new Date().toISOString();

    // Build upsert rows
    const rows: any[] = [];

    for (const entry of checkingIn) {
      rows.push({
        location_id,
        gingr_reservation_id: entry.reservation_id ? Number(entry.reservation_id) : null,
        animal_name: entry.animal_name || null,
        animal_id: entry.animal_id ? Number(entry.animal_id) : null,
        owner_name: entry.owner_name || null,
        owner_id: entry.owner_id ? Number(entry.owner_id) : null,
        reservation_type_name: entry.reservation_type_name || entry.reservation_type || null,
        status: "checking_in",
        check_in_time: entry.check_in_time || entry.start_date || null,
        check_out_time: entry.check_out_time || entry.end_date || null,
        room_name: entry.room_name || entry.room || null,
        area_name: entry.area_name || entry.area || null,
        raw_data: entry,
        synced_at: nowIso,
      });
    }

    for (const entry of checkingOut) {
      rows.push({
        location_id,
        gingr_reservation_id: entry.reservation_id ? Number(entry.reservation_id) : null,
        animal_name: entry.animal_name || null,
        animal_id: entry.animal_id ? Number(entry.animal_id) : null,
        owner_name: entry.owner_name || null,
        owner_id: entry.owner_id ? Number(entry.owner_id) : null,
        reservation_type_name: entry.reservation_type_name || entry.reservation_type || null,
        status: "checking_out",
        check_in_time: entry.check_in_time || entry.start_date || null,
        check_out_time: entry.check_out_time || entry.end_date || null,
        room_name: entry.room_name || entry.room || null,
        area_name: entry.area_name || entry.area || null,
        raw_data: entry,
        synced_at: nowIso,
      });
    }

    // Upsert rows in batches
    let upsertedCount = 0;
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("gingr_back_of_house")
          .upsert(chunk, { onConflict: "location_id,gingr_reservation_id" });

        if (error) throw new Error(`BOH upsert error: ${error.message}`);
        upsertedCount += chunk.length;
      }
    }

    // Delete stale rows (synced_at older than 5 minutes)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: deleted } = await supabase
      .from("gingr_back_of_house")
      .delete()
      .eq("location_id", location_id)
      .lt("synced_at", fiveMinAgo)
      .select("id");

    const deletedCount = deleted?.length || 0;

    return new Response(
      JSON.stringify({
        success: true,
        checking_in_count: checkingIn.length,
        checking_out_count: checkingOut.length,
        upserted: upsertedCount,
        stale_deleted: deletedCount,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

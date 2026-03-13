// ============================================================================
// Gingr Sync Edge Function — K9 Operations Lite
// Fetches data from Gingr API and upserts into Supabase tables
// Supports: full sync, incremental sync, single-entity sync
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Gingr API helper ──────────────────────────────────────────────────────
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

// ─── Sync functions ────────────────────────────────────────────────────────

async function syncOwners(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "owners", apiKey);
  const owners = result.data || [];

  if (owners.length === 0) return { synced: 0 };

  // Batch upsert in chunks of 500
  const chunkSize = 500;
  let total = 0;

  for (let i = 0; i < owners.length; i += chunkSize) {
    const chunk = owners.slice(i, i + chunkSize);
    const rows = chunk.map((o: any) => ({
      gingr_id: String(o.id),
      location_id: locationId,
      first_name: o.first_name?.trim() || null,
      last_name: o.last_name?.trim() || null,
      email: o.email || null,
      cell_phone: o.cell_phone || null,
      home_phone: o.home_phone || null,
      emergency_contact_name: o.emergency_contact_name || null,
      emergency_contact_phone: o.emergency_contact_phone || null,
      address_1: o.address_1 || null,
      address_2: o.address_2 || null,
      city: o.city || null,
      state: o.state || null,
      zip: o.zip || null,
      current_balance: o.current_balance ? parseFloat(o.current_balance) : 0,
      home_location: o.home_location || null,
      animal_names: o.animal_names || null,
      last_reservation: o.last_reservation || null,
      next_reservation: o.next_reservation || null,
      number_reservations: o.number_reservations ? parseInt(o.number_reservations) : 0,
      owner_created_at: o.owner_created_at_iso || o.created_at || null,
      source: o.source || null,
      opt_out_email: o.opt_out_email === "1",
      opt_out_sms: o.opt_out_sms === "1",
      opt_out_marketing_email: o.opt_out_marketing_email === "1",
      opt_out_marketing_sms: o.opt_out_marketing_sms === "1",
      raw_data: o,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("gingr_owners")
      .upsert(rows, { onConflict: "location_id,gingr_id" });

    if (error) throw new Error(`Owner upsert error: ${error.message}`);
    total += chunk.length;
  }

  return { synced: total };
}

async function syncAnimals(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "animals", apiKey);
  const animals = result.data || [];

  // Also fetch breeds for name lookup
  const breedsResult = await gingrFetch(subdomain, "get_breeds", apiKey);
  const breedMap: Record<string, string> = {};
  if (Array.isArray(breedsResult)) {
    for (const b of breedsResult) {
      breedMap[b.value] = b.label;
    }
  }

  if (animals.length === 0) return { synced: 0 };

  const chunkSize = 500;
  let total = 0;

  for (let i = 0; i < animals.length; i += chunkSize) {
    const chunk = animals.slice(i, i + chunkSize);
    const rows = chunk.map((a: any) => ({
      gingr_id: String(a.id),
      location_id: locationId,
      owner_gingr_id: String(a.owner_id),
      name: a.first_name || null,
      breed_id: a.breed_id || null,
      breed_name: breedMap[a.breed_id] || null,
      species_id: a.species_id || null,
      gender: a.gender || null,
      fixed: a.fixed === "1",
      birthday: a.birthday ? parseInt(a.birthday) : null,
      weight: a.weight || null,
      image_url: a.image || null,
      vip: a.vip === "1",
      banned: a.banned === "1",
      medicines: a.medicines || null,
      allergies: a.allergies || null,
      notes: a.notes || null,
      grooming_notes: a.grooming_notes || null,
      next_immunization_expiration: a.next_immunization_expiration
        ? parseInt(a.next_immunization_expiration)
        : null,
      last_reservation: a.last_reservation || null,
      next_reservation: a.next_reservation || null,
      number_reservations: a.number_reservations ? parseInt(a.number_reservations) : 0,
      owner_first_name: a.owner_first_name || null,
      owner_last_name: a.owner_last_name || null,
      raw_data: a,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("gingr_animals")
      .upsert(rows, { onConflict: "location_id,gingr_id" });

    if (error) throw new Error(`Animal upsert error: ${error.message}`);
    total += chunk.length;
  }

  // Also sync breeds reference
  if (Array.isArray(breedsResult) && breedsResult.length > 0) {
    const breedRows = breedsResult.map((b: any) => ({
      gingr_id: String(b.value),
      location_id: locationId,
      name: b.label,
    }));
    for (let i = 0; i < breedRows.length; i += 500) {
      const chunk = breedRows.slice(i, i + 500);
      await supabase
        .from("gingr_breeds")
        .upsert(chunk, { onConflict: "location_id,gingr_id" });
    }
  }

  return { synced: total };
}

function mapReservationRow(r: any, locationId: string) {
  return {
    gingr_id: String(r.reservation_id),
    location_id: locationId,
    owner_gingr_id: r.owner?.id ? String(r.owner.id) : null,
    animal_gingr_id: r.animal?.id ? String(r.animal.id) : null,
    reservation_type_id: r.reservation_type?.id ? String(r.reservation_type.id) : null,
    reservation_type_name: r.reservation_type?.type || null,
    start_date: r.start_date || null,
    end_date: r.end_date || null,
    check_in_date: r.check_in_date || null,
    check_out_date: r.check_out_date || null,
    cancelled_date: r.cancelled_date || null,
    confirmed_date: r.confirmed_date || null,
    created_date: r.created_date || null,
    standing_reservation: r.standing_reservation || false,
    owner_first_name: r.owner?.first_name?.trim() || null,
    owner_last_name: r.owner?.last_name?.trim() || null,
    owner_email: r.owner?.email || null,
    animal_name: r.animal?.name || null,
    animal_breed: r.animal?.breed || null,
    notes_reservation: r.notes?.reservation_notes || null,
    notes_animal: r.notes?.animal_notes || null,
    notes_owner: r.notes?.owner_notes || null,
    services: r.services || null,
    deposit: r.deposit || null,
    transaction: r.transaction || null,
    raw_data: r,
    synced_at: new Date().toISOString(),
  };
}

async function syncReservations(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string,
  startDate?: string,
  endDate?: string
) {
  const now = new Date();
  const end = endDate || now.toISOString().split("T")[0];

  // Resumable: check where we left off from sync state
  let start = startDate || "2015-01-01";
  if (!startDate) {
    try {
      const { data: syncState } = await supabase
        .from("gingr_sync_state")
        .select("*")
        .eq("location_id", locationId)
        .eq("entity_type", "reservations")
        .limit(1);
      const cursor = syncState?.[0]?.backfill_cursor;
      if (cursor && cursor > "2015-01-01") {
        start = cursor;
      }
    } catch (_) {
      // backfill_cursor column may not exist yet — start from beginning
    }
  }

  // If we've already backfilled to today, just sync recent 90 days for updates
  const startD = new Date(start);
  const endD = new Date(end);
  const daysLeft = Math.round((endD.getTime() - startD.getTime()) / 86400000);
  const isBackfillComplete = daysLeft <= 90;

  if (isBackfillComplete) {
    // Normal ongoing sync: just last 90 days
    start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  }

  const chunks = getDateChunks(start, end, 30);
  let total = 0;
  const MAX_CHUNKS_PER_RUN = 4; // ~4 chunks per invocation to stay under timeout
  let chunksProcessed = 0;
  let lastChunkEnd = start;
  const errors: string[] = [];

  for (const [chunkStart, chunkEnd] of chunks) {
    if (!isBackfillComplete && chunksProcessed >= MAX_CHUNKS_PER_RUN) break;

    try {
      const result = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
        checked_in: "false",
        start_date: chunkStart,
        end_date: chunkEnd,
      });

      const resMap = result.data || {};
      const reservations = Object.values(resMap) as any[];
      lastChunkEnd = chunkEnd;
      chunksProcessed++;

      if (reservations.length === 0) continue;

      const batchSize = 500;
      for (let i = 0; i < reservations.length; i += batchSize) {
        const batch = reservations.slice(i, i + batchSize);
        const rows = batch.map((r: any) => mapReservationRow(r, locationId));

        const { error } = await supabase
          .from("gingr_reservations")
          .upsert(rows, { onConflict: "location_id,gingr_id" });

        if (error) throw new Error(`Reservation upsert error: ${error.message}`);
        total += batch.length;
      }
    } catch (chunkErr: any) {
      // Log but don't fail entire sync — skip this chunk and continue
      errors.push(`${chunkStart}-${chunkEnd}: ${chunkErr.message}`);
      lastChunkEnd = chunkEnd;
      chunksProcessed++;
    }
  }

  // Save backfill cursor so next run picks up where we left off
  try {
    if (!isBackfillComplete) {
      await supabase.from("gingr_sync_state").upsert(
        { location_id: locationId, entity_type: "reservations", backfill_cursor: lastChunkEnd },
        { onConflict: "location_id,entity_type" }
      );
    } else {
      // Backfill done — clear cursor
      await supabase.from("gingr_sync_state").upsert(
        { location_id: locationId, entity_type: "reservations", backfill_cursor: null },
        { onConflict: "location_id,entity_type" }
      );
    }
  } catch (_) {
    // backfill_cursor column may not exist — non-fatal
  }

  // Also sync currently checked-in
  const checkedInResult = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
    checked_in: "true",
  });
  const checkedInMap = checkedInResult.data || {};
  const checkedIn = Object.values(checkedInMap) as any[];

  if (checkedIn.length > 0) {
    const rows = checkedIn.map((r: any) => mapReservationRow(r, locationId));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await supabase
        .from("gingr_reservations")
        .upsert(chunk, { onConflict: "location_id,gingr_id" });
    }
    total += checkedIn.length;
  }

  return {
    synced: total,
    backfill_complete: isBackfillComplete,
    backfill_cursor: isBackfillComplete ? null : lastChunkEnd,
    chunks_processed: chunksProcessed,
    chunks_remaining: isBackfillComplete ? 0 : chunks.length - chunksProcessed,
    chunk_errors: errors.length > 0 ? errors : undefined,
  };
}

async function syncReservationTypes(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "reservation_types", apiKey);
  const types = result.data || [];

  if (types.length === 0) return { synced: 0 };

  const rows = types.map((t: any) => {
    const typeLower = (t.type || t.name || "").toLowerCase();
    return {
      gingr_id: String(t.id),
      location_id: locationId,
      name: t.name || t.reservation_type || t.type,
      type_label: t.type,
      color: t.color || null,
      is_boarding: typeLower.includes("boarding"),
      is_daycare: typeLower.includes("daycare") || typeLower.includes("day care"),
      is_grooming:
        typeLower.includes("groom") ||
        typeLower.includes("bath") ||
        typeLower.includes("bathing"),
      single_day: t.single_day === "1",
      status: t.status,
      raw_data: t,
      synced_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("gingr_reservation_types")
    .upsert(rows, { onConflict: "location_id,gingr_id" });

  if (error) throw new Error(`Reservation type upsert error: ${error.message}`);
  return { synced: types.length };
}

async function syncImmunizationTypes(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "get_immunization_types", apiKey, "GET", {
    species_id: "1",
  });
  const types = result.data || [];

  if (types.length === 0) return { synced: 0 };

  const rows = types.map((t: any) => ({
    gingr_id: String(t.id),
    location_id: locationId,
    name: t.type,
    required: t.required === "1",
  }));

  const { error } = await supabase
    .from("gingr_immunization_types")
    .upsert(rows, { onConflict: "location_id,gingr_id" });

  if (error) throw new Error(`Immunization type upsert error: ${error.message}`);
  return { synced: types.length };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDateChunks(start: string, end: string, maxDays: number): [string, string][] {
  const chunks: [string, string][] = [];
  let current = new Date(start);
  const endDate = new Date(end);

  while (current < endDate) {
    const chunkEnd = new Date(current.getTime() + maxDays * 24 * 60 * 60 * 1000);
    const actualEnd = chunkEnd > endDate ? endDate : chunkEnd;
    chunks.push([
      current.toISOString().split("T")[0],
      actualEnd.toISOString().split("T")[0],
    ]);
    current = new Date(actualEnd.getTime() + 1 * 24 * 60 * 60 * 1000);
  }

  return chunks;
}

function updateSyncState(
  supabase: any,
  locationId: string,
  entityType: string,
  data: Record<string, any>
) {
  return supabase.from("gingr_sync_state").upsert(
    {
      location_id: locationId,
      entity_type: entityType,
      ...data,
    },
    { onConflict: "location_id,entity_type" }
  );
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { location_id, sync_type = "full", entities, test_credentials } = await req.json();

    if (!location_id) {
      return new Response(JSON.stringify({ error: "location_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase with service role for writes
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Test mode: just verify Gingr connection, no DB writes ──
    if (sync_type === "test") {
      const creds = test_credentials;
      if (!creds?.api_key || !creds?.subdomain) {
        return new Response(
          JSON.stringify({ success: false, error: "Provide test_credentials with api_key and subdomain." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const testResult = await gingrFetch(creds.subdomain, "get_locations", creds.api_key);
        const locs = Array.isArray(testResult) ? testResult : testResult.data || [];
        return new Response(
          JSON.stringify({ success: true, locations: locs.length, location_names: locs.map((l: any) => l.label) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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
        JSON.stringify({
          error: "Gingr not configured. Set api_key and subdomain in Settings → Gingr Integration.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { api_key, subdomain, gingr_location_id } = gingrConfig;
    const results: Record<string, any> = {};
    const startTime = Date.now();

    // Determine which entities to sync
    const toSync =
      entities ||
      (sync_type === "full"
        ? ["reservation_types", "immunization_types", "owners", "animals", "reservations"]
        : ["owners", "animals", "reservations"]);

    for (const entity of toSync) {
      await updateSyncState(supabase, location_id, entity, {
        status: "syncing",
        last_sync_at: new Date().toISOString(),
      });

      try {
        switch (entity) {
          case "owners":
            results.owners = await syncOwners(supabase, subdomain, api_key, location_id);
            break;
          case "animals":
            results.animals = await syncAnimals(supabase, subdomain, api_key, location_id);
            break;
          case "reservations":
            results.reservations = await syncReservations(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "reservation_types":
            results.reservation_types = await syncReservationTypes(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "immunization_types":
            results.immunization_types = await syncImmunizationTypes(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
        }

        await updateSyncState(supabase, location_id, entity, {
          status: "idle",
          records_synced: results[entity]?.synced || 0,
          sync_duration_ms: Date.now() - startTime,
          error_message: null,
        });
      } catch (err: any) {
        await updateSyncState(supabase, location_id, entity, {
          status: "error",
          error_message: err.message,
        });
        results[entity] = { error: err.message };
      }
    }

    // Update full sync timestamp
    if (sync_type === "full") {
      for (const entity of toSync) {
        await updateSyncState(supabase, location_id, entity, {
          last_full_sync_at: new Date().toISOString(),
        });
      }
    }

    const totalDuration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        sync_type,
        location_id,
        duration_ms: totalDuration,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

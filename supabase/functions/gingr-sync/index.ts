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

// ─── Eastern Time helper ─────────────────────────────────────────────────────
// Edge functions run in UTC. All date-sensitive operations must use ET.
function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function dateStrET(d?: Date): string {
  const dt = d || nowET();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

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
  const MAX_CHUNKS_PER_RUN = 10; // ~10 chunks per invocation — empty chunks are fast
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

  // ── TV-007: Reconcile — mark checked-out dogs ──────────────────────────
  // Dogs that Supabase thinks are checked in but Gingr no longer reports
  // have been checked out. Stamp check_out_date so the TV picks it up.
  try {
    const { data: supaCheckedIn } = await supabase
      .from("gingr_reservations")
      .select("gingr_id")
      .eq("location_id", locationId)
      .not("check_in_date", "is", null)
      .is("check_out_date", null)
      .is("cancelled_date", null);

    const gingrCheckedInIds = new Set(
      checkedIn.map((r: any) => String(r.reservation_id))
    );
    const staleIds = (supaCheckedIn || [])
      .filter((r: any) => !gingrCheckedInIds.has(r.gingr_id))
      .map((r: any) => r.gingr_id);

    // Safety: if Gingr returned 0 but Supabase has 20+, likely an API error
    // — do not mass-checkout every dog
    const isLikelyApiError =
      checkedIn.length === 0 && (supaCheckedIn || []).length > 20;

    if (staleIds.length > 0 && !isLikelyApiError) {
      const nowIso = new Date().toISOString();
      for (let i = 0; i < staleIds.length; i += 100) {
        const chunk = staleIds.slice(i, i + 100);
        await supabase
          .from("gingr_reservations")
          .update({ check_out_date: nowIso, synced_at: nowIso })
          .eq("location_id", locationId)
          .in("gingr_id", chunk);
      }
    }
  } catch (_) {
    // Non-fatal — reconciliation is best-effort
  }

  // ── Catch cancellations: re-fetch recent window without checked_in filter ──
  // The checked_in:"false" query above excludes cancelled reservations.
  // Re-fetch the recent 7-day window with NO checked_in filter so we get
  // ALL reservation states including cancelled (which have cancelled_date set).
  try {
    const recentStart = dateStrET();
    const recentEnd = dateStrET();
    const allResult = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
      start_date: recentStart,
      end_date: recentEnd,
    });
    const allMap = allResult.data || {};
    const allReservations = Object.values(allMap) as any[];

    if (allReservations.length > 0) {
      const rows = allReservations.map((r: any) => mapReservationRow(r, locationId));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await supabase
          .from("gingr_reservations")
          .upsert(chunk, { onConflict: "location_id,gingr_id" });
      }
      console.log(`Re-synced ${allReservations.length} reservations (all states) for ${recentStart} to ${recentEnd}`);
    }
  } catch (allErr: any) {
    console.error("All-states reservation re-sync error:", allErr.message);
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

async function syncInvoices(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string,
  fullSync = false
) {
  const now = new Date();
  const toDate = now.toISOString().split("T")[0];

  // Resumable backfill: sync invoices in 90-day chunks from a cursor.
  // Once backfill reaches today, ongoing syncs just refresh the last 90 days.
  let fromDate = "2020-01-01"; // Start of business history
  if (!fullSync) {
    try {
      const { data: syncState } = await supabase
        .from("gingr_sync_state")
        .select("backfill_cursor")
        .eq("location_id", locationId)
        .eq("entity_type", "invoices")
        .limit(1);
      const cursor = syncState?.[0]?.backfill_cursor;
      if (cursor && cursor > "2020-01-01") {
        fromDate = cursor;
      }
    } catch (_) {}
  }

  // Check if backfill is complete (cursor is within 90 days of today)
  const fromD = new Date(fromDate);
  const toD = new Date(toDate);
  const daysLeft = Math.round((toD.getTime() - fromD.getTime()) / 86400000);
  const isBackfillComplete = daysLeft <= 90;

  if (isBackfillComplete) {
    fromDate = new Date(now.getTime() - 90 * 86400000).toISOString().split("T")[0];
  }

  // Process in 90-day date chunks to stay within edge function limits
  const chunks = getDateChunks(fromDate, toDate, 90);
  let total = 0;
  const MAX_CHUNKS_PER_RUN = 4; // ~4 chunks of 90 days per invocation
  let chunksProcessed = 0;
  let lastChunkEnd = fromDate;

  for (const [chunkStart, chunkEnd] of chunks) {
    if (!isBackfillComplete && chunksProcessed >= MAX_CHUNKS_PER_RUN) break;

    let page = 1;
    const perPage = 200;
    const seenIds = new Set<number>();

    while (true) {
      const result = await gingrFetch(subdomain, "list_invoices", apiKey, "GET", {
        from_date: chunkStart,
        to_date: chunkEnd,
        per_page: String(perPage),
        page: String(page),
      });

      const invoices = result.data || result;
      if (!Array.isArray(invoices) || invoices.length === 0) break;

      // Detect stuck pagination
      const newIds = invoices.filter((inv: any) => !seenIds.has(Number(inv.id)));
      if (newIds.length === 0) break;
      for (const inv of invoices) seenIds.add(Number(inv.id));

      const rows = invoices.map((inv: any) => ({
        id: Number(inv.id),
        location_id: locationId,
        owner_id: inv.owner_id ? Number(inv.owner_id) : null,
        first_name: inv.first_name?.trim() || null,
        last_name: inv.last_name?.trim() || null,
        email: inv.email || null,
        subtotal: inv.subtotal ? parseFloat(inv.subtotal) : null,
        tax_amount: inv.tax_amount ? parseFloat(inv.tax_amount) : null,
        total: inv.total ? parseFloat(inv.total) : null,
        is_returned: inv.is_returned === 1 || inv.is_returned === "1" || inv.is_returned === true,
        item_count: inv.item_count ? parseInt(inv.item_count) : null,
        voided_item_count: inv.voided_item_count ? parseInt(inv.voided_item_count) : null,
        username: inv.username || null,
        user_id: inv.user_id ? Number(inv.user_id) : null,
        payment_method: inv.payment_method || null,
        created_at: inv.create_stamp
          ? new Date(Number(inv.create_stamp) * 1000).toISOString()
          : inv.created_at || null,
        synced_at: new Date().toISOString(),
      }));

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("gingr_invoices")
          .upsert(chunk, { onConflict: "location_id,id" });
        if (error) throw new Error(`Invoice upsert error: ${error.message}`);
      }

      total += invoices.length;
      if (invoices.length < perPage) break;
      page++;
      if (page > 100) break; // Per-chunk safety
    }

    lastChunkEnd = chunkEnd;
    chunksProcessed++;
  }

  // Save backfill cursor
  try {
    await supabase.from("gingr_sync_state").upsert(
      {
        location_id: locationId,
        entity_type: "invoices",
        backfill_cursor: isBackfillComplete ? null : lastChunkEnd,
      },
      { onConflict: "location_id,entity_type" }
    );
  } catch (_) {}

  return { synced: total, backfill_complete: isBackfillComplete, backfill_cursor: isBackfillComplete ? null : lastChunkEnd };
}

async function syncInvoicePayments(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  // Three sets of invoices need transaction details:
  // 1. Recent invoices (last 2 days) — catches most same-day payments
  // 2. ALL returned invoices (lifetime) — catches refunds on any invoice
  // 3. Paid invoices missing payment records — catches payments on OLD invoices
  //    (e.g., boarding invoice created weeks ago, paid at checkout today)
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [recentRes, returnedRes] = await Promise.all([
    supabase
      .from("gingr_invoices")
      .select("id")
      .eq("location_id", locationId)
      .gte("created_at", `${twoDaysAgo}T00:00:00`),
    // ALL returned invoices — no date limit. Refunds can hit any invoice.
    supabase
      .from("gingr_invoices")
      .select("id")
      .eq("location_id", locationId)
      .eq("is_returned", true),
  ]);

  if (recentRes.error) throw new Error(`Invoice payments query error: ${recentRes.error.message}`);

  // Merge and deduplicate
  const allIds = new Set<number>();
  for (const inv of (recentRes.data || [])) allIds.add(inv.id);
  for (const inv of (returnedRes.data || [])) allIds.add(inv.id);

  // Set 3: Invoice IDs from today's reservations (via Gingr API).
  // Catches payments on OLD invoices — e.g., a boarding invoice created weeks ago
  // that gets paid at checkout today. One API call, extracts pos_transaction_id.
  try {
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const todayRes = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
      start_date: todayStr,
      end_date: todayStr,
    });
    const todayResMap = todayRes.data || {};
    for (const res of Object.values(todayResMap) as any[]) {
      const txnId = res.transaction?.pos_transaction_id;
      if (txnId) allIds.add(Number(txnId));
    }
  } catch (err) {
    // Non-fatal — we still have sets 1 and 2
    console.error("Failed to fetch today's reservations for invoice IDs:", err);
  }

  const invoicesToFetch = [...allIds].map(id => ({ id }));
  if (invoicesToFetch.length === 0) return { synced: 0 };

  let total = 0;

  // Process in batches of 10 concurrent API calls
  for (let i = 0; i < invoicesToFetch.length; i += 10) {
    const batch = invoicesToFetch.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (inv: any) => {
        try {
          const result = await gingrFetch(
            subdomain,
            "transaction",
            apiKey,
            "POST",
            { id: String(inv.id) }
          );
          return { invoiceId: inv.id, data: result.data };
        } catch (err: any) {
          console.error(`Transaction fetch error for invoice ${inv.id}:`, err.message);
          return { invoiceId: inv.id, data: null };
        }
      })
    );

    const rows: any[] = [];
    for (const { invoiceId, data } of results) {
      if (!data?.detailed_payments) continue;

      for (const [key, entry] of Object.entries(data.detailed_payments) as [string, any][]) {
        // Skip the "deposit" key — it's metadata, not a payment entry
        if (key === "deposit") continue;

        const paymentId = parseInt(key, 10);
        if (isNaN(paymentId)) continue;

        const txTime = entry.transaction_time
          ? new Date(Number(entry.transaction_time) * 1000).toISOString()
          : null;
        // Use Eastern Time for date assignment (Gingr reports use ET)
        const txDate = entry.transaction_time
          ? new Date(Number(entry.transaction_time) * 1000)
              .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
          : null;

        // Detect deposit payments — these are also counted in gingr_deposits
        // so they must be excluded from invoice payment totals to avoid double-counting
        const description = entry.description || "";
        const isDepositPayment = description.startsWith("Deposit for Reservation");

        rows.push({
          id: paymentId,
          location_id: locationId,
          invoice_id: invoiceId,
          payment_method_type: entry.payment_method_type || null,
          total_balance: parseFloat(entry.total_balance) || 0,
          transaction_time: txTime,
          transaction_date: txDate,
          is_zero_payment:
            entry.zero_payment === "1" || entry.zero_payment === 1,
          is_admin_comp: (entry.payment_method_type || "").includes("ADMIN"),
          is_deposit_payment: isDepositPayment,
          raw_data: entry,
          synced_at: new Date().toISOString(),
        });
      }
    }

    // Batch upsert
    if (rows.length > 0) {
      const chunkSize = 500;
      for (let j = 0; j < rows.length; j += chunkSize) {
        const chunk = rows.slice(j, j + chunkSize);
        const { error } = await supabase
          .from("gingr_invoice_payments")
          .upsert(chunk, { onConflict: "location_id,id" });

        if (error) throw new Error(`Invoice payment upsert error: ${error.message}`);
      }
      total += rows.length;
    }
  }

  return { synced: total };
}

async function syncDeposits(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  let total = 0;

  // Two-phase deposit sweep:
  //   Phase 1 (always): -7 to +90 days — covers most active/upcoming deposits
  //   Phase 2 (daily): +90 to +365 days — catches far-future bookings
  // Phase 2 only runs if it hasn't run in the last 6 hours (tracked via sync state).
  let maxOffset = 90; // Default: fast sweep only

  try {
    const { data: syncState } = await supabase
      .from("gingr_sync_state")
      .select("last_deep_sweep")
      .eq("location_id", locationId)
      .eq("entity_type", "deposits")
      .limit(1);

    const lastDeep = syncState?.[0]?.last_deep_sweep;
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    if (!lastDeep || lastDeep < sixHoursAgo) {
      maxOffset = 365; // Do the full sweep
    }
  } catch (_) {
    // If sync state check fails, just do fast sweep
  }

  for (let offset = -7; offset < maxOffset; offset += 30) {
    const chunkStart = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];
    const chunkEnd = new Date(now.getTime() + (offset + 30) * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];

    const result = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
      start_date: chunkStart,
      end_date: chunkEnd,
    });

    const resMap = result.data || {};
    const reservations = Object.entries(resMap) as [string, any][];

    const rows: any[] = [];
    for (const [resId, res] of reservations) {
      const dep = res.deposit;
      // deposit is sometimes an empty array [] when no deposit exists
      if (!dep || typeof dep !== "object" || Array.isArray(dep)) continue;

      const paidAmount = parseFloat(dep.paid_amount) || 0;
      if (paidAmount <= 0) continue;

      const ownerName = [res.owner?.first_name, res.owner?.last_name]
        .filter(Boolean)
        .join(" ") || null;

      rows.push({
        reservation_gingr_id: Number(res.reservation_id || resId),
        location_id: locationId,
        owner_id: res.owner?.id ? Number(res.owner.id) : null,
        owner_name: ownerName,
        animal_name: res.animal?.name || null,
        deposit_amount: dep.amount ? parseFloat(dep.amount) : null,
        paid_amount: paidAmount,
        last_payment: dep.last_payment || null,
        consumed_at: dep.consumed_at || null,
        forfeited_at: dep.forfeited_at || null,
        refunded_at: dep.refunded_at || null,
        last_email_sent: dep.last_email_sent || null,
        reservation_start: res.start_date || null,
        reservation_end: res.end_date || null,
        synced_at: new Date().toISOString(),
      });
    }

    // Batch upsert in 500-row chunks
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("gingr_deposits")
        .upsert(chunk, { onConflict: "location_id,reservation_gingr_id" });

      if (error) throw new Error(`Deposit upsert error: ${error.message}`);
    }

    total += rows.length;
  }

  // Record deep sweep timestamp if we did the full range
  if (maxOffset > 90) {
    try {
      await supabase.from("gingr_sync_state").upsert(
        {
          location_id: locationId,
          entity_type: "deposits",
          last_deep_sweep: new Date().toISOString(),
        },
        { onConflict: "location_id,entity_type" }
      );
    } catch (_) {}
  }

  // Targeted catch: find deposits paid today that we missed because the
  // reservation starts beyond our sweep window. Cross-reference invoice
  // payments flagged as deposit payments — their raw_data.description
  // contains "Deposit for Reservation #<id>" which gives us the reservation ID.
  try {
    const { data: todayDepPayments } = await supabase
      .from("gingr_invoice_payments")
      .select("raw_data")
      .eq("location_id", locationId)
      .eq("transaction_date", todayStr)
      .eq("is_deposit_payment", true);

    if (todayDepPayments && todayDepPayments.length > 0) {
      // Extract reservation IDs from descriptions like "Deposit for Reservation #12345"
      const missingResIds: number[] = [];
      for (const p of todayDepPayments) {
        const desc = p.raw_data?.description || "";
        const match = desc.match(/Reservation\s*#?\s*(\d+)/i);
        if (match) missingResIds.push(Number(match[1]));
      }

      if (missingResIds.length > 0) {
        // Check which ones we already have in gingr_deposits
        const { data: existing } = await supabase
          .from("gingr_deposits")
          .select("reservation_gingr_id")
          .eq("location_id", locationId)
          .in("reservation_gingr_id", missingResIds);

        const existingSet = new Set((existing || []).map((e: any) => e.reservation_gingr_id));
        const toFetch = missingResIds.filter(id => !existingSet.has(id));

        // Fetch missing reservations individually from Gingr
        for (const resId of toFetch) {
          try {
            const result = await gingrFetch(subdomain, "existing_reservation_estimate", apiKey, "GET", {
              id: String(resId),
            });
            const res = result.data;
            if (!res) continue;

            const dep = res.deposit || (res.deposits && res.deposits[0]);
            if (!dep || typeof dep !== "object" || Array.isArray(dep)) continue;

            const paidAmount = parseFloat(dep.paid_amount || dep.amount_paid) || 0;
            if (paidAmount <= 0) continue;

            const ownerName = [res.owner?.first_name, res.owner?.last_name]
              .filter(Boolean)
              .join(" ") || null;

            const row = {
              reservation_gingr_id: Number(resId),
              location_id: locationId,
              owner_id: res.owner?.id ? Number(res.owner.id) : null,
              owner_name: ownerName,
              animal_name: res.animal?.name || null,
              deposit_amount: dep.amount ? parseFloat(dep.amount) : null,
              paid_amount: paidAmount,
              last_payment: dep.last_payment || null,
              consumed_at: dep.consumed_at || null,
              forfeited_at: dep.forfeited_at || null,
              refunded_at: dep.refunded_at || null,
              last_email_sent: dep.last_email_sent || null,
              reservation_start: res.start_date || null,
              reservation_end: res.end_date || null,
              payment_method: dep.payment_method || null,
              payment_method_id: dep.payment_method_id ? Number(dep.payment_method_id) : null,
              deposit_gingr_id: dep.id ? Number(dep.id) : null,
              synced_at: new Date().toISOString(),
            };

            const { error } = await supabase
              .from("gingr_deposits")
              .upsert(row, { onConflict: "location_id,reservation_gingr_id" });

            if (!error) total++;
          } catch (err) {
            console.error(`Failed to fetch deposit for reservation ${resId}:`, err);
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal — the sweep already got most deposits
    console.error("Targeted deposit catch failed:", err);
  }

  return { synced: total };
}

async function computeCashBasisMetrics(
  supabase: any,
  locationId: string,
  subdomain: string,
  apiKey: string
) {
  const now = nowET();

  // Compute cash basis metrics for the last 7 days.
  const datesToCompute: string[] = [];
  for (let i = 6; i >= 0; i--) {
    datesToCompute.push(dateStrET(new Date(now.getTime() - i * 86400000)));
  }

  // Cash basis only counts real money: Cash, Check, Credit Card.
  const CASH_METHODS = ["Cash", "Check", "Credit Card"];

  for (const dateStr of datesToCompute) {
    // 1) Invoice payments — already have payment_method_type
    // Exclude is_deposit_payment to avoid double-counting with gingr_deposits
    const { data: paymentData } = await supabase
      .from("gingr_invoice_payments")
      .select("total_balance")
      .eq("location_id", locationId)
      .eq("transaction_date", dateStr)
      .in("payment_method_type", CASH_METHODS)
      .eq("is_zero_payment", false)
      .eq("is_admin_comp", false)
      .eq("is_deposit_payment", false);

    const entries = paymentData || [];
    const collectedPayments = entries
      .filter((e: any) => parseFloat(e.total_balance) > 0)
      .reduce((sum: number, e: any) => sum + parseFloat(e.total_balance), 0);
    const refunds = entries
      .filter((e: any) => parseFloat(e.total_balance) < 0)
      .reduce((sum: number, e: any) => sum + Math.abs(parseFloat(e.total_balance)), 0);

    // 2) Deposits — need to check payment_method via existing_reservation_estimate API
    const { data: depositData } = await supabase
      .from("gingr_deposits")
      .select("paid_amount, reservation_gingr_id, payment_method")
      .eq("location_id", locationId)
      .gte("last_payment", `${dateStr}T00:00:00`)
      .lt("last_payment", `${dateStr}T23:59:59`)
      .gt("paid_amount", 0);

    const deposits = depositData || [];

    // For deposits missing payment_method, fetch from Gingr API
    const needsLookup = deposits.filter((d: any) => !d.payment_method);
    if (needsLookup.length > 0 && subdomain && apiKey) {
      // Batch in groups of 5 concurrent calls
      for (let i = 0; i < needsLookup.length; i += 5) {
        const batch = needsLookup.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(async (dep: any) => {
            try {
              const result = await gingrFetch(
                subdomain, "existing_reservation_estimate", apiKey, "GET",
                { id: String(dep.reservation_gingr_id) }
              );
              const depInfo = (result.data?.deposits || [])[0];
              return {
                reservation_gingr_id: dep.reservation_gingr_id,
                payment_method: depInfo?.payment_method || null,
                payment_method_id: depInfo?.payment_method_id ? Number(depInfo.payment_method_id) : null,
                deposit_gingr_id: depInfo?.id ? Number(depInfo.id) : null,
              };
            } catch (err) {
              console.error(`Deposit lookup failed for res ${dep.reservation_gingr_id}:`, err);
              return { reservation_gingr_id: dep.reservation_gingr_id, payment_method: null, payment_method_id: null, deposit_gingr_id: null };
            }
          })
        );

        // Update deposit records with payment method
        for (const r of results) {
          if (r.payment_method) {
            await supabase
              .from("gingr_deposits")
              .update({
                payment_method: r.payment_method,
                payment_method_id: r.payment_method_id,
                deposit_gingr_id: r.deposit_gingr_id,
              })
              .eq("location_id", locationId)
              .eq("reservation_gingr_id", r.reservation_gingr_id);

            // Update the in-memory deposit object too
            const dep = deposits.find((d: any) => d.reservation_gingr_id === r.reservation_gingr_id);
            if (dep) dep.payment_method = r.payment_method;
          }
        }
      }
    }

    // Only count deposits paid via real money (Cash, Check, Credit Card)
    const collectedDeposits = deposits
      .filter((d: any) => {
        const method = d.payment_method;
        // If we have a payment method, filter strictly
        if (method) return CASH_METHODS.some(m => method.toLowerCase().includes(m.toLowerCase()));
        // If lookup failed and no method, include (safe default — matches old behavior)
        return true;
      })
      .reduce((sum: number, d: any) => sum + parseFloat(d.paid_amount || 0), 0);

    // 3) Compute and upsert
    const cashNetRevenue = collectedPayments + collectedDeposits - refunds;

    await supabase
      .from("dashboard_metrics_daily")
      .upsert(
        {
          location_id: locationId,
          metric_date: dateStr,
          cash_collected_payments: collectedPayments,
          cash_collected_deposits: collectedDeposits,
          cash_refunds: refunds,
          cash_net_revenue: cashNetRevenue,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "location_id,metric_date" }
      );
  }
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

// ─── Server-side room assignment ─────────────────────────────────────────

const ROOM_TYPES_ASSIGN = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"];

function classifyResType(typeName: string | null): string {
  if (!typeName) return "other";
  const t = typeName.toLowerCase();
  if (t.includes("evaluation") || t.includes("eval")) return "evaluation";
  if (t.includes("tour")) return "tour";
  if (t.includes("day boarding") || t === "day boarding") return "dayboarding";
  if (t.includes("daycare") || t.includes("day care")) return "daycare";
  if (t.includes("boarding")) return "boarding";
  if (t.includes("groom") || t.includes("bath")) return "grooming";
  return "other";
}

function extractRoomType(typeName: string | null): string | null {
  if (!typeName) return null;
  for (const rt of ROOM_TYPES_ASSIGN) {
    if (typeName.toLowerCase().includes(rt.toLowerCase())) return rt;
  }
  return null;
}

async function assignRoomsServerSide(
  supabase: any,
  locationId: string
) {
  // 1. Load room names config from lite_settings
  const { data: roomNamesRow } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", "room_names")
    .maybeSingle();

  let roomsMap: Record<string, string[]> = {};

  if (roomNamesRow?.setting_value && typeof roomNamesRow.setting_value === "object") {
    const names = roomNamesRow.setting_value as Record<string, string[]>;
    for (const [typeName, nameList] of Object.entries(names)) {
      if (Array.isArray(nameList) && nameList.length > 0) {
        roomsMap[typeName] = [...nameList];
      }
    }
  }

  // Fallback: generate numbered rooms from reservation types
  if (Object.keys(roomsMap).length === 0) {
    const { data: resTypes } = await supabase
      .from("gingr_reservation_types")
      .select("name, type_label, raw_data")
      .eq("location_id", locationId);

    const defaultCounts: Record<string, number> = {
      "Luxury Suite": 4, "Executive Room": 6,
      "Double Compartment": 8, "Single Compartment": 10,
    };

    const boardingTypes = (resTypes || []).filter((rt: any) => {
      const raw = rt.raw_data || {};
      const hasLodging = raw.capacity_by_lodging === "1" || raw.capacity_by_lodging === 1;
      const isSingleDay = raw.single_day === "1" || raw.single_day === 1;
      return hasLodging && !isSingleDay;
    });

    if (boardingTypes.length > 0) {
      for (const bt of boardingTypes) {
        const name = bt.name || bt.type_label || "";
        const clean = name.replace(/^Boarding\s*\|\s*/i, "").replace(/\s*\(All Inclusive\)\s*$/i, "").trim();
        if (!clean) continue;
        const count = defaultCounts[clean] ?? 6;
        roomsMap[clean] = [];
        for (let i = 1; i <= count; i++) {
          roomsMap[clean].push(`${clean} ${i}`);
        }
      }
    } else {
      for (const rt of ROOM_TYPES_ASSIGN) {
        const count = defaultCounts[rt] ?? 6;
        roomsMap[rt] = [];
        for (let i = 1; i <= count; i++) {
          roomsMap[rt].push(`${rt} ${i}`);
        }
      }
    }
  }

  // 2. Query boarding reservations in the assignment window (-30 to +90 days)
  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
  const windowEnd = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

  let reservations: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: pageData, error: resErr } = await supabase
      .from("gingr_reservations")
      .select("gingr_id, reservation_type_name, start_date, end_date")
      .eq("location_id", locationId)
      .gte("start_date", windowStart + "T00:00:00")
      .lte("start_date", windowEnd + "T23:59:59")
      .is("cancelled_date", null)
      .ilike("reservation_type_name", "%boarding%")
      .order("start_date", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (resErr) {
      console.error("Room assignment query error:", resErr.message);
      return { assigned: 0 };
    }
    if (!pageData || pageData.length === 0) break;
    reservations = reservations.concat(pageData);
    if (pageData.length < PAGE_SIZE) break;
    page++;
  }

  // 3. Classify and filter for assignable boarding reservations
  const boarding: Array<{
    gingr_id: string;
    roomType: string;
    checkIn: string;
    checkOut: string;
  }> = [];

  for (const r of reservations) {
    const type = classifyResType(r.reservation_type_name);
    const roomType = extractRoomType(r.reservation_type_name);

    if (type === "boarding" && roomType) {
      const checkIn = r.start_date ? r.start_date.split("T")[0] : "";
      const checkOut = r.end_date ? r.end_date.split("T")[0] : checkIn;
      boarding.push({ gingr_id: r.gingr_id, roomType, checkIn, checkOut });
    }
  }

  // 4. Group by room type
  const byType: Record<string, typeof boarding> = {};
  for (const r of boarding) {
    if (!byType[r.roomType]) byType[r.roomType] = [];
    byType[r.roomType].push(r);
  }

  // 5. Greedy interval scheduling per room type
  const assignments: Array<{ gingr_id: string; room: string }> = [];

  for (const [roomType, group] of Object.entries(byType)) {
    const rooms = roomsMap[roomType] || [];
    if (rooms.length === 0) continue;

    // Sort by start_date ASC, then gingr_id ASC for determinism
    group.sort((a, b) =>
      a.checkIn.localeCompare(b.checkIn) || a.gingr_id.localeCompare(b.gingr_id)
    );

    // Track occupancy per room
    const occ: Record<string, Array<{ checkIn: string; checkOut: string }>> = {};
    for (const rm of rooms) {
      occ[rm] = [];
    }

    for (const r of group) {
      let picked: string | null = null;
      for (const rm of rooms) {
        const overlap = occ[rm].some(
          (o) => o.checkIn < r.checkOut && r.checkIn < o.checkOut
        );
        if (!overlap) {
          picked = rm;
          break;
        }
      }
      if (!picked) picked = rooms[0]; // overflow fallback
      occ[picked].push({ checkIn: r.checkIn, checkOut: r.checkOut });
      assignments.push({ gingr_id: r.gingr_id, room: picked });
    }
  }

  // 6. Batch update room assignments — group by room name for efficiency
  let updated = 0;

  const byRoom: Record<string, string[]> = {};
  for (const { gingr_id, room } of assignments) {
    if (!byRoom[room]) byRoom[room] = [];
    byRoom[room].push(gingr_id);
  }

  for (const [room, ids] of Object.entries(byRoom)) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error } = await supabase
        .from("gingr_reservations")
        .update({ room_assignment: room })
        .eq("location_id", locationId)
        .in("gingr_id", chunk);
      if (!error) updated += chunk.length;
    }
  }

  return { assigned: updated };
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

    // ── TV-007: Lightweight tv-poll mode ────────────────────────────────────
    // Only fetches checked_in: "true" from Gingr and reconciles checkouts.
    // Called every 60s from the TV page for near-real-time checkout detection.
    if (sync_type === "tv-poll") {
      const startTime = Date.now();
      let checkedOutCount = 0;

      // 1. Fetch currently checked-in from Gingr (single API call)
      const checkedInResult = await gingrFetch(subdomain, "reservations", api_key, "POST", {
        checked_in: "true",
      });
      const checkedInMap = checkedInResult.data || {};
      const checkedIn = Object.values(checkedInMap) as any[];

      // 2. Upsert currently checked-in (updates any changed fields)
      if (checkedIn.length > 0) {
        const rows = checkedIn.map((r: any) => mapReservationRow(r, location_id));
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          await supabase
            .from("gingr_reservations")
            .upsert(chunk, { onConflict: "location_id,gingr_id" });
        }
      }

      // 3. Reconcile: mark dogs that Gingr no longer reports as checked out
      try {
        const { data: supaCheckedIn } = await supabase
          .from("gingr_reservations")
          .select("gingr_id")
          .eq("location_id", location_id)
          .not("check_in_date", "is", null)
          .is("check_out_date", null)
          .is("cancelled_date", null);

        const gingrCheckedInIds = new Set(
          checkedIn.map((r: any) => String(r.reservation_id))
        );
        const staleIds = (supaCheckedIn || [])
          .filter((r: any) => !gingrCheckedInIds.has(r.gingr_id))
          .map((r: any) => r.gingr_id);

        // Safety: skip if Gingr returned 0 but Supabase has 20+
        const isLikelyApiError =
          checkedIn.length === 0 && (supaCheckedIn || []).length > 20;

        if (staleIds.length > 0 && !isLikelyApiError) {
          const nowIso = new Date().toISOString();
          for (let i = 0; i < staleIds.length; i += 100) {
            const chunk = staleIds.slice(i, i + 100);
            await supabase
              .from("gingr_reservations")
              .update({ check_out_date: nowIso, synced_at: nowIso })
              .eq("location_id", location_id)
              .in("gingr_id", chunk);
          }
          checkedOutCount = staleIds.length;
        }
      } catch (_) {
        // Non-fatal — reconciliation is best-effort
      }

      // Run room assignment after tv-poll reservation sync
      let roomResult = { assigned: 0 };
      try {
        roomResult = await assignRoomsServerSide(supabase, location_id);
      } catch (roomErr: any) {
        console.error("Room assignment error (tv-poll):", roomErr.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          sync_type: "tv-poll",
          checked_in_count: checkedIn.length,
          checked_out_count: checkedOutCount,
          rooms_assigned: roomResult.assigned,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, any> = {};
    const startTime = Date.now();

    // Determine which entities to sync
    // Full sync: all entities. Incremental: only fast entities that fit within
    // the edge function timeout (~150s). Reservations and owners/animals are too
    // heavy for incremental — they run only on full sync.
    const toSync =
      entities ||
      (sync_type === "full"
        ? ["reservation_types", "immunization_types", "owners", "animals", "reservations", "invoices", "invoice_payments", "deposits"]
        : ["invoices", "invoice_payments", "deposits"]);

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
          case "invoices":
            results.invoices = await syncInvoices(
              supabase,
              subdomain,
              api_key,
              location_id,
              sync_type === "full"
            );
            break;
          case "invoice_payments":
            results.invoice_payments = await syncInvoicePayments(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "deposits":
            results.deposits = await syncDeposits(
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

    // ── Assign rooms server-side after all entities are synced ─────────────
    try {
      const roomResult = await assignRoomsServerSide(supabase, location_id);
      results["room_assignment"] = roomResult;
    } catch (roomErr: any) {
      console.error("Room assignment error:", roomErr.message);
      results["room_assignment"] = { error: roomErr.message };
    }

    // ── Recompute dashboard metrics after sync ────────────────────────────
    // Recomputes today + yesterday (catches late checkouts) in pure Postgres.
    // Adds ~100-200ms — negligible compared to the sync itself.
    try {
      const etNow = nowET();
      await supabase.rpc('compute_dashboard_metrics', {
        p_location_id: location_id,
        p_date_from: dateStrET(new Date(etNow.getTime() - 7 * 86400000)),
        p_date_to: dateStrET(etNow),
      });
    } catch (metricsErr: any) {
      // Non-fatal — dashboard metrics recompute is best-effort
      console.error('Dashboard metrics recompute error:', metricsErr.message);
    }

    // ── Compute cash basis metrics from synced invoices + deposits ───────
    // Updates cash_collected_payments, cash_collected_deposits, cash_refunds,
    // cash_net_revenue on dashboard_metrics_daily for today and yesterday.
    try {
      await computeCashBasisMetrics(supabase, location_id, subdomain, api_key);
    } catch (cashErr: any) {
      // Non-fatal — cash basis metrics are best-effort
      console.error('Cash basis metrics error:', cashErr.message);
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addDaysStr,
  computeSchedulingMatrixRows,
  dateStrET,
  upsertSchedulingMatrixRows,
} from "../_shared/scheduling-matrix.ts";
import {
  hasSchedulingBackfillLocationAccess,
  isSchedulingBackfillRangeAllowed,
  isSchedulingBackfillRunStale,
  SCHEDULING_MATRIX_BACKFILL_MAX_RANGE_DAYS,
} from "../_shared/scheduling-matrix-backfill-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHERRY_HILL_LOCATION_ID = "11111111-1111-1111-1111-111111111111";
const LOCATION_ID_ALIASES: Record<string, string> = {
  "cherry-hill": CHERRY_HILL_LOCATION_ID,
  your-gingr-subdomain: CHERRY_HILL_LOCATION_ID,
};
const DEFAULT_BATCH_SIZE = 14;
const MAX_BATCH_SIZE = 31;
const MAX_BATCHES_PER_INVOCATION = 3;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeLocationId(value: string) {
  const trimmed = String(value || "").trim();
  const alias = LOCATION_ID_ALIASES[trimmed.toLowerCase()];
  return alias || trimmed;
}

function parseDate(value: unknown) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function enumerateDates(dateFrom: string, dateTo: string) {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysStr(current, 1);
  }
  return dates;
}

function clampBatchSize(value: unknown) {
  const parsed = Number(value || DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.round(parsed)));
}

function minDate(a: string, b: string) {
  return a <= b ? a : b;
}

function isAllHistoryRequest(body: Record<string, unknown>) {
  const dateFrom = String(body.date_from || "").trim().toLowerCase();
  const range = String(body.range || "").trim().toLowerCase();
  return body.all_history === true
    || ["origin", "all-history", "all_history", "beginning", "beginning-of-time"].includes(dateFrom)
    || ["all-history", "all_history", "origin"].includes(range);
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function assertLocationAccess(
  req: Request,
  locationId: string,
  options: { write?: boolean; serviceRoleOnly?: boolean } = {},
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw Object.assign(new Error("Missing Authorization header"), { status: 401 });
  }

  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const client = serviceClient();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (bearerToken === serviceRoleKey) {
    return { client, userId: null, isServiceRole: true };
  }

  if (options.serviceRoleOnly) {
    throw Object.assign(new Error("Only service-role automation can process historical matrix backfill runs."), { status: 403 });
  }

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw Object.assign(new Error("Unable to authenticate request"), { status: 401 });
  }

  const { data: profiles, error: profileError } = await client
    .from("lite_profiles")
    .select("location_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (profileError) {
    throw Object.assign(profileError, { status: 500 });
  }

  const hasAccess = (profiles || []).some((profile: any) =>
    hasSchedulingBackfillLocationAccess(profile, locationId, Boolean(options.write)),
  );

  const { data: profileRow, error: ownerProfileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (ownerProfileError) {
    throw Object.assign(ownerProfileError, { status: 500 });
  }
  const hasOwnerAccess = ["owner", "role_owner"].includes(String(profileRow?.role || ""));

  if (!hasAccess && !hasOwnerAccess) {
    throw Object.assign(new Error("You do not have access to backfill this location's scheduling matrix."), { status: 403 });
  }

  return { client, userId: user.id, isServiceRole: false };
}

async function readCoverage(client: any, locationId: string, rangeStart: string, rangeEnd: string) {
  const expectedDates = enumerateDates(rangeStart, rangeEnd);
  const { data, error } = await client
    .from("scheduling_matrix_daily")
    .select("matrix_date")
    .eq("location_id", locationId)
    .gte("matrix_date", rangeStart)
    .lte("matrix_date", rangeEnd);

  if (error) throw error;

  const computed = new Set((data || []).map((row: any) => String(row.matrix_date).slice(0, 10)));
  const missing = expectedDates.filter((date) => !computed.has(date));
  return {
    expected_days: expectedDates.length,
    computed_days: computed.size,
    missing_days: missing.length,
    first_missing_date: missing[0] || null,
    missing_sample: missing.slice(0, 12),
    is_complete: missing.length === 0,
  };
}

async function fetchHistoricalMatrixOrigin(client: any, locationId: string) {
  const lastHistoricalDate = addDaysStr(dateStrET(), -1);
  const sql = [
    "SELECT",
    "  min(r.start_date::date)::text AS first_operational_date,",
    "  max(r.start_date::date)::text AS last_operational_start_date,",
    "  count(*)::int AS operational_reservation_count",
    "FROM public.gingr_reservations r",
    "LEFT JOIN public.gingr_reservation_types rt",
    "  ON rt.location_id = r.location_id",
    " AND rt.gingr_id::text = r.reservation_type_id::text",
    "WHERE r.location_id = ($1)::text",
    "  AND r.cancelled_date IS NULL",
    "  AND r.start_date IS NOT NULL",
    "  AND CASE",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%tour%' THEN false",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%groom%' THEN false",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%bath%' THEN false",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%evaluation%' THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%eval%' THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day boarding%' THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day board%' THEN true",
    "    WHEN coalesce(rt.is_daycare, false) THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%daycare%' THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day care%' THEN true",
    "    WHEN coalesce(rt.is_boarding, false) THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%boarding%' THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%lodge%' THEN true",
    "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%kennel%' THEN true",
    "    ELSE false",
    "  END",
  ].join("\n");

  const { data, error } = await client.rpc("exec_sql", {
    query: sql,
    params: [locationId],
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  const firstOperationalDate = parseDate(row?.first_operational_date);
  const lastOperationalStartDate = parseDate(row?.last_operational_start_date);
  return {
    location_id: locationId,
    source: "gingr_reservations",
    first_operational_date: firstOperationalDate,
    last_operational_start_date: lastOperationalStartDate,
    last_historical_date: lastHistoricalDate,
    operational_reservation_count: Number(row?.operational_reservation_count || 0),
  };
}

async function resolveBackfillRange(client: any, locationId: string, body: Record<string, unknown>) {
  const allHistory = isAllHistoryRequest(body);
  let origin = null;
  let rangeStart = parseDate(body.date_from);
  let rangeEnd = parseDate(body.date_to);

  if (allHistory) {
    origin = await fetchHistoricalMatrixOrigin(client, locationId);
    rangeStart = origin.first_operational_date;
    rangeEnd = rangeEnd || origin.last_historical_date;
    if (!rangeStart) {
      throw Object.assign(
        new Error("No operational Gingr reservation history was found for this location. Configure or sync Gingr history before starting an all-history Scheduling Demand Matrix backfill."),
        { status: 404 },
      );
    }
  }

  if (!rangeStart || !rangeEnd) throw Object.assign(new Error("date_from and date_to must be YYYY-MM-DD"), { status: 400 });
  if (rangeEnd < rangeStart) throw Object.assign(new Error("date_to must be on or after date_from"), { status: 400 });

  return { rangeStart, rangeEnd, origin };
}

async function fetchRun(client: any, runId: string) {
  const { data, error } = await client
    .from("scheduling_matrix_backfill_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Backfill run not found."), { status: 404 });
  return data;
}

async function startRun(req: Request, body: Record<string, unknown>) {
  const requestedLocationId = String(body.location_id || "").trim();
  const locationId = normalizeLocationId(requestedLocationId);
  if (!locationId) throw Object.assign(new Error("location_id required"), { status: 400 });
  const { client, userId } = await assertLocationAccess(req, locationId, { write: true });
  const { rangeStart, rangeEnd, origin } = await resolveBackfillRange(client, locationId, body);
  if (!isSchedulingBackfillRangeAllowed(rangeStart, rangeEnd)) {
    throw Object.assign(new Error(`Historical backfill is limited to ${SCHEDULING_MATRIX_BACKFILL_MAX_RANGE_DAYS} days per run.`), { status: 400 });
  }
  if (rangeEnd >= dateStrET()) {
    throw Object.assign(new Error("Historical backfill only supports dates before today. Current/future matrix rows stay on the rolling compute path."), { status: 400 });
  }

  const batchSize = clampBatchSize(body.batch_size);
  const mode = String(body.mode || "historical_location_bootstrap").trim() || "historical_location_bootstrap";
  const coverage = await readCoverage(client, locationId, rangeStart, rangeEnd);
  const totalDays = coverage.expected_days;

  const { data: activeRun, error: activeError } = await client
    .from("scheduling_matrix_backfill_runs")
    .select("*")
    .eq("location_id", locationId)
    .eq("range_start", rangeStart)
    .eq("range_end", rangeEnd)
    .eq("mode", mode)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (activeError) throw activeError;

  let run = activeRun;
  if (run && isSchedulingBackfillRunStale(run)) {
    await markRunFailed(client, run.id, "Historical matrix backfill worker stopped before completion. Start the backfill again to resume from the first missing date.", coverage);
    run = null;
  }
  if (!run) {
    const initialStatus = coverage.is_complete ? "complete" : "queued";
    const { data, error } = await client
      .from("scheduling_matrix_backfill_runs")
      .insert({
        location_id: locationId,
        range_start: rangeStart,
        range_end: rangeEnd,
        mode,
        status: initialStatus,
        requested_by: userId,
        batch_size: batchSize,
        total_days: totalDays,
        completed_days: coverage.computed_days,
        failed_days: 0,
        next_date: coverage.first_missing_date,
        coverage_snapshot: coverage,
        completed_at: coverage.is_complete ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    run = data;
  } else {
    const { data, error } = await client
      .from("scheduling_matrix_backfill_runs")
      .update({
        batch_size: batchSize,
        completed_days: coverage.computed_days,
        next_date: coverage.first_missing_date,
        coverage_snapshot: coverage,
      })
      .eq("id", run.id)
      .select("*")
      .single();
    if (error) throw error;
    run = data;
  }

  if (!coverage.is_complete && body.start_processing !== false) {
    queueBackgroundProcess(run.id);
  }

  return { run, coverage, origin };
}

async function updateRunCoverage(client: any, run: any, patch: Record<string, unknown> = {}) {
  const coverage = await readCoverage(client, run.location_id, run.range_start, run.range_end);
  const complete = coverage.is_complete;
  const update = {
    completed_days: coverage.computed_days,
    next_date: coverage.first_missing_date,
    coverage_snapshot: coverage,
    ...(complete ? { status: "complete", completed_at: new Date().toISOString(), current_chunk_start: null, current_chunk_end: null } : {}),
    ...patch,
  };
  const { data, error } = await client
    .from("scheduling_matrix_backfill_runs")
    .update(update)
    .eq("id", run.id)
    .select("*")
    .single();
  if (error) throw error;
  return { run: data, coverage };
}

async function markRunFailed(client: any, runId: string, message: string, coverage: any = null) {
  const update: Record<string, unknown> = {
    status: "failed",
    error_message: message,
    current_chunk_start: null,
    current_chunk_end: null,
  };
  if (coverage) update.coverage_snapshot = coverage;

  const { data, error } = await client
    .from("scheduling_matrix_backfill_runs")
    .update(update)
    .eq("id", runId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function processRun(runId: string, options: { continueInBackground?: boolean } = {}) {
  const client = serviceClient();
  let run = await fetchRun(client, runId);
  if (run.status === "complete" || run.status === "canceled") {
    return updateRunCoverage(client, run);
  }

  let coverage = await readCoverage(client, run.location_id, run.range_start, run.range_end);
  if (coverage.is_complete) {
    return updateRunCoverage(client, run, { status: "complete", completed_at: new Date().toISOString() });
  }

  const { data: started, error: startError } = await client
    .from("scheduling_matrix_backfill_runs")
    .update({
      status: "running",
      started_at: run.started_at || new Date().toISOString(),
      error_message: null,
      completed_days: coverage.computed_days,
      next_date: coverage.first_missing_date,
      coverage_snapshot: coverage,
    })
    .eq("id", run.id)
    .select("*")
    .single();
  if (startError) throw startError;
  run = started;

  let batchesProcessed = 0;
  let rowsUpserted = 0;
  while (!coverage.is_complete && batchesProcessed < MAX_BATCHES_PER_INVOCATION) {
    const chunkStart = coverage.first_missing_date || run.next_date || run.range_start;
    const chunkEnd = minDate(addDaysStr(chunkStart, Number(run.batch_size || DEFAULT_BATCH_SIZE) - 1), run.range_end);
    const { error: markError } = await client
      .from("scheduling_matrix_backfill_runs")
      .update({ current_chunk_start: chunkStart, current_chunk_end: chunkEnd })
      .eq("id", run.id);
    if (markError) throw markError;

    try {
      const rows = await computeSchedulingMatrixRows({
        supabase: client,
        locationId: run.location_id,
        dateFrom: chunkStart,
        dateTo: chunkEnd,
        projectionScopeDateFrom: chunkStart,
        projectionScopeDateTo: chunkEnd,
      });
      const result = await upsertSchedulingMatrixRows(client, rows);
      rowsUpserted += Number(result.count || 0);
      batchesProcessed += 1;
      coverage = await readCoverage(client, run.location_id, run.range_start, run.range_end);
      const nextDate = coverage.first_missing_date;
      const { data: updated, error: updateError } = await client
        .from("scheduling_matrix_backfill_runs")
        .update({
          completed_days: coverage.computed_days,
          next_date: nextDate,
          last_processed_date: chunkEnd,
          current_chunk_start: null,
          current_chunk_end: null,
          coverage_snapshot: coverage,
        })
        .eq("id", run.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      run = updated;
    } catch (error: any) {
      const message = error?.message || String(error || "Unknown backfill error");
      const failure = {
        from: chunkStart,
        to: chunkEnd,
        error: message,
        at: new Date().toISOString(),
      };
      const failures = Array.isArray(run.chunk_failures) ? run.chunk_failures : [];
      const { data: failedRun, error: failUpdateError } = await client
        .from("scheduling_matrix_backfill_runs")
        .update({
          status: "failed",
          error_message: message,
          failed_days: Number(run.failed_days || 0) + enumerateDates(chunkStart, chunkEnd).length,
          current_chunk_start: null,
          current_chunk_end: null,
          chunk_failures: [...failures, failure],
          coverage_snapshot: coverage,
        })
        .eq("id", run.id)
        .select("*")
        .single();
      if (failUpdateError) throw failUpdateError;
      return { run: failedRun, coverage, rows_upserted: rowsUpserted, batches_processed: batchesProcessed };
    }
  }

  const result = await updateRunCoverage(client, run);
  if (!result.coverage.is_complete && options.continueInBackground !== false) {
    queueBackgroundProcess(run.id);
  }

  return { ...result, rows_upserted: rowsUpserted, batches_processed: batchesProcessed };
}

function queueBackgroundProcess(runId: string) {
  const task = invokeSelfProcess(runId).catch((error) => {
    console.error("scheduling-matrix-backfill background process failed:", error);
    return markRunFailed(
      serviceClient(),
      runId,
      `Historical matrix backfill worker failed to continue: ${error?.message || String(error || "Unknown error")}`,
    ).catch((markError) => {
      console.error("scheduling-matrix-backfill failed to mark run failed:", markError);
    });
  });
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil(task);
  }
}

async function invokeSelfProcess(runId: string) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const response = await fetch(`${supabaseUrl}/functions/v1/scheduling-matrix-backfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ action: "process", run_id: runId, continue_in_background: true }),
  });
  if (!response.ok) {
    throw new Error(`Self-invocation failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "start").trim().toLowerCase();

    if (action === "start") {
      const result = await startRun(req, body);
      return jsonResponse({ ok: true, action, ...result }, result.coverage.is_complete ? 200 : 202);
    }

    if (action === "origin") {
      const requestedLocationId = String(body.location_id || "").trim();
      const locationId = normalizeLocationId(requestedLocationId);
      if (!locationId) throw Object.assign(new Error("location_id required"), { status: 400 });
      const { client } = await assertLocationAccess(req, locationId);
      const origin = await fetchHistoricalMatrixOrigin(client, locationId);
      return jsonResponse({ ok: true, action, origin });
    }

    if (action === "status") {
      const runId = String(body.run_id || "").trim();
      if (!runId) throw Object.assign(new Error("run_id required"), { status: 400 });
      const client = serviceClient();
      const run = await fetchRun(client, runId);
      await assertLocationAccess(req, run.location_id);
      const coverage = await readCoverage(client, run.location_id, run.range_start, run.range_end);
      if (coverage.is_complete && run.status !== "complete") {
        const updated = await updateRunCoverage(client, run, {
          status: "complete",
          completed_at: new Date().toISOString(),
        });
        return jsonResponse({ ok: true, action, ...updated });
      }
      if (!coverage.is_complete && isSchedulingBackfillRunStale(run)) {
        const failedRun = await markRunFailed(
          client,
          run.id,
          "Historical matrix backfill worker stopped before completion. Start the backfill again to resume from the first missing date.",
          coverage,
        );
        return jsonResponse({ ok: true, action, run: failedRun, coverage });
      }
      return jsonResponse({ ok: true, action, run, coverage });
    }

    if (action === "process") {
      const runId = String(body.run_id || "").trim();
      if (!runId) throw Object.assign(new Error("run_id required"), { status: 400 });
      const client = serviceClient();
      const run = await fetchRun(client, runId);
      await assertLocationAccess(req, run.location_id, { serviceRoleOnly: true });
      const result = await processRun(runId, { continueInBackground: body.continue_in_background !== false });
      return jsonResponse({ ok: true, action, ...result }, result.coverage.is_complete ? 200 : 202);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error: any) {
    console.error("scheduling-matrix-backfill error:", error);
    return jsonResponse({ error: error?.message || String(error || "Unknown error") }, error?.status || 500);
  }
});

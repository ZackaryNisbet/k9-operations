import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHERRY_HILL_LOCATION_ID = "11111111-1111-1111-1111-111111111111";

const LOCATION_ALIASES: Record<string, string> = {
  "cherry-hill": CHERRY_HILL_LOCATION_ID,
  your-gingr-subdomain: CHERRY_HILL_LOCATION_ID,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPORT_CHECKS = [
  {
    key: "bathing",
    idPrefix: "ops_bathing",
    label: "Bathing Report",
    warnMinutes: 5,
    failMinutes: 10,
  },
  {
    key: "room_cleaning",
    idPrefix: "ops_room_cleaning",
    label: "Room Cleaning + Setups",
    warnMinutes: 5,
    failMinutes: 10,
  },
  {
    key: "room_occupancy",
    idPrefix: "ops_room_occupancy",
    label: "Room Occupancy",
    warnMinutes: 5,
    failMinutes: 10,
  },
];

const CRON_CHECKS = [
  {
    jobname: "ops-compute-poll",
    label: "Ops Compute",
    functionName: "ops-compute",
    cadenceMinutes: 1,
    failMinutes: 4,
    criticality: "critical",
    affects: ["Bathing", "Room cleaning", "Room occupancy", "Private play"],
  },
  {
    jobname: "gingr-tv-poll",
    label: "GINGR TV Poll",
    functionName: "gingr-sync",
    syncType: "tv-poll",
    cadenceMinutes: 1,
    failMinutes: 4,
    criticality: "critical",
    affects: ["Live checked-in dogs", "Today reservations"],
  },
  {
    jobname: "gingr-boh-poll-a",
    label: "GINGR BOH Poll",
    functionName: "gingr-boh-poll",
    cadenceMinutes: 1,
    failMinutes: 4,
    criticality: "warning",
    affects: ["Back-of-house check-in/check-out cache"],
  },
  {
    jobname: "gingr-today-sync",
    label: "GINGR Today Sync",
    functionName: "gingr-sync",
    syncType: "today-sync",
    cadenceMinutes: 5,
    failMinutes: 12,
    criticality: "critical",
    affects: ["Today reservations", "Runs", "Occupancy"],
  },
  {
    jobname: "gingr-today-notes-refresh",
    label: "GINGR Notes Refresh",
    functionName: "gingr-today-notes",
    cadenceMinutes: 5,
    failMinutes: 12,
    criticality: "warning",
    affects: ["Checkout notes"],
  },
  {
    jobname: "compute-scheduling-matrix-cherry-hill-current-week",
    label: "Scheduling Matrix",
    functionName: "compute-scheduling-matrix",
    cadenceMinutes: 5,
    failMinutes: 15,
    criticality: "warning",
    affects: ["Scheduling matrix"],
  },
  {
    jobname: "gingr-incremental-sync",
    label: "GINGR Incremental Sync",
    functionName: "gingr-sync",
    syncType: "incremental",
    cadenceMinutes: 15,
    failMinutes: 45,
    criticality: "warning",
    affects: ["Source data backfill"],
  },
];

function nowEtDate() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeLocationId(value: string | null | undefined) {
  const key = String(value || "cherry-hill").trim();
  return LOCATION_ALIASES[key] || key;
}

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

function freshnessStatus(age: number | null, warnMinutes: number, failMinutes: number) {
  if (age == null) return "unknown";
  if (age >= failMinutes) return "critical";
  if (age >= warnMinutes) return "warning";
  return "healthy";
}

function severityRank(value: string) {
  if (value === "critical") return 3;
  if (value === "warning") return 2;
  if (value === "unknown") return 1;
  return 0;
}

function worstStatus(values: string[]) {
  return values.reduce((worst, value) => (severityRank(value) > severityRank(worst) ? value : worst), "healthy");
}

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectPayloadErrors(value: any, prefix = "", output: string[] = []) {
  if (output.length >= 5 || value == null) return output;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectPayloadErrors(entry, `${prefix}[${index}]`, output));
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, nested] of Object.entries(value)) {
    if (output.length >= 5) break;
    const path = prefix ? `${prefix}.${key}` : key;
    if (key === "error" && typeof nested === "string" && nested.trim()) {
      output.push(`${path}: ${nested.trim()}`);
    } else if (key === "success" && nested === false) {
      output.push(`${prefix || "payload"} reported success=false`);
    } else {
      collectPayloadErrors(nested, path, output);
    }
  }
  return output;
}

function payloadFailureMessages(content: string | null | undefined) {
  const payload = safeJsonParse(content);
  if (!payload) return [];
  return collectPayloadErrors(payload).slice(0, 5);
}

function responseErrorSummary(row: any) {
  if (row?.timed_out) return "Request timed out.";
  if (row?.error_msg) return String(row.error_msg);
  const payload = safeJsonParse(row?.content);
  if (payload?.message) return String(payload.message);
  if (payload?.error) return String(payload.error);
  const nested = payloadFailureMessages(row?.content);
  if (nested.length) return nested.join("; ");
  if (row?.status_code && row.status_code >= 400) return `HTTP ${row.status_code}`;
  return null;
}

function isResponseFailure(row: any) {
  return Boolean(
    row?.timed_out ||
      row?.error_msg ||
      (row?.status_code != null && Number(row.status_code) >= 400) ||
      payloadFailureMessages(row?.content).length,
  );
}

function identifyJobFromContent(content: string | null | undefined) {
  const payload = safeJsonParse(content);
  if (!payload || typeof payload !== "object") return null;
  if (payload.sync_type === "tv-poll") return "gingr-tv-poll";
  if (payload.sync_type === "today-sync") return "gingr-today-sync";
  if (payload.sync_type === "incremental") return "gingr-incremental-sync";
  if (payload.computed && payload.date) return "ops-compute-poll";
  if (payload.checking_in_count != null || payload.checking_out_count != null) return "gingr-boh-poll-a";
  if (payload.refreshed_at && payload.requested_location_id) return "gingr-today-notes-refresh";
  if (payload.date_range && payload.rows_upserted != null) return "compute-scheduling-matrix-cherry-hill-current-week";
  return null;
}

function inferJobFromRunTiming(row: any, runs: any[]) {
  const createdAt = new Date(row?.created || "").getTime();
  if (Number.isNaN(createdAt)) return null;
  const candidates = runs
    .map((run) => {
      const startTime = new Date(run.start_time || "").getTime();
      return {
        jobname: run.jobname,
        diffMs: Math.abs(createdAt - startTime),
        startedBeforeResponse: startTime <= createdAt + 50,
      };
    })
    .filter((entry) => entry.startedBeforeResponse && entry.diffMs <= 2000)
    .sort((a, b) => a.diffMs - b.diffMs);
  return candidates[0]?.jobname || null;
}

function deriveReportTotal(key: string, computedItems: any) {
  if (!computedItems || typeof computedItems !== "object") return null;
  if (key === "bathing") return Array.isArray(computedItems.dogs) ? computedItems.dogs.length : null;
  if (key === "room_cleaning") {
    const taskSummary = computedItems.task_summary || {};
    const summaryTotal = Number(taskSummary.total_tasks ?? computedItems.summary?.totalTasks);
    if (Number.isFinite(summaryTotal)) return summaryTotal;
    if (Array.isArray(computedItems.task_instances)) return computedItems.task_instances.length;
    if (Array.isArray(computedItems.rooms)) return computedItems.rooms.length;
  }
  if (key === "room_occupancy") {
    const summaryTotal = Number(computedItems.summary?.totalRooms);
    if (Number.isFinite(summaryTotal)) return summaryTotal;
    if (Array.isArray(computedItems.rooms)) return computedItems.rooms.length;
  }
  return null;
}

async function execSql(sb: any, query: string, params: string[] = []) {
  const { data, error } = await sb.rpc("exec_sql", { query, params });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchLatestAndCount(
  sb: any,
  table: string,
  locationId: string,
  columns: string,
  orderColumn: string,
) {
  const [{ data: latestRow, error: latestError }, { count, error: countError }] = await Promise.all([
    sb.from(table).select(columns).eq("location_id", locationId).order(orderColumn, { ascending: false }).limit(1).maybeSingle(),
    sb.from(table).select("id", { count: "exact", head: true }).eq("location_id", locationId),
  ]);

  if (latestError) throw latestError;
  if (countError) throw countError;

  return {
    latest: latestRow || null,
    count: count ?? 0,
  };
}

async function fetchReportHealth(sb: any, locationId: string, date: string) {
  const ids = REPORT_CHECKS.map((check) => `${check.idPrefix}_${date}`);
  const { data, error } = await sb
    .from("lite_daily_ops")
    .select("id, type_sub, date, updated_at, computed_at, computed_items")
    .eq("location_id", locationId)
    .in("id", ids);

  if (error) throw error;

  const byId = new Map((data || []).map((row: any) => [row.id, row]));
  const reports = REPORT_CHECKS.map((check) => {
    const id = `${check.idPrefix}_${date}`;
    const row: any = byId.get(id) || null;
    const computedAt = row?.computed_at || null;
    const updatedAt = row?.updated_at || null;
    const freshestAt = computedAt || updatedAt;
    const age = ageMinutes(freshestAt);
    const status = row ? freshnessStatus(age, check.warnMinutes, check.failMinutes) : "critical";
    return {
      key: check.key,
      id,
      label: check.label,
      status,
      age_minutes: age,
      updated_at: updatedAt,
      computed_at: computedAt,
      total: deriveReportTotal(check.key, row?.computed_items),
    };
  });

  return {
    status: worstStatus(reports.map((report) => report.status)),
    reports,
  };
}

async function fetchBohCacheHealth(sb: any, locationId: string) {
  const { data, error } = await sb
    .from("gingr_back_of_house")
    .select("synced_at")
    .eq("location_id", locationId)
    .order("synced_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const latestSyncedAt = data?.[0]?.synced_at || null;
  const age = ageMinutes(latestSyncedAt);
  return {
    rows: data?.length || 0,
    latest_synced_at: latestSyncedAt,
    age_minutes: age,
    freshness_status: latestSyncedAt ? freshnessStatus(age, 3, 8) : "unknown",
  };
}

async function fetchCronHealth(sb: any) {
  const [liveJobs, recentRuns, recentResponses] = await Promise.all([
    execSql(
      sb,
      "select jobid::text, jobname, schedule, active, command from cron.job order by jobname",
    ),
    execSql(
      sb,
      [
        "select j.jobname, r.status, r.start_time::text, r.end_time::text, r.return_message",
        "from cron.job_run_details r",
        "join cron.job j on j.jobid = r.jobid",
        "where r.start_time >= now() - interval '45 minutes'",
        "order by r.start_time desc",
        "limit 200",
      ].join(" "),
    ),
    execSql(
      sb,
      [
        "select id::text, status_code, created::text, timed_out, error_msg, coalesce(content, '') as content",
        "from net._http_response",
        "where created >= now() - interval '45 minutes'",
        "order by id desc",
        "limit 250",
      ].join(" "),
    ),
  ]);

  const liveByName = new Map(liveJobs.map((job: any) => [job.jobname, job]));
  const runsByName = new Map<string, any[]>();
  for (const run of recentRuns) {
    if (!runsByName.has(run.jobname)) runsByName.set(run.jobname, []);
    runsByName.get(run.jobname)!.push(run);
  }

  const matchedResponses = recentResponses.map((row: any) => ({
    ...row,
    jobname: identifyJobFromContent(row.content) || inferJobFromRunTiming(row, recentRuns),
    error_summary: responseErrorSummary(row),
    payload_errors: payloadFailureMessages(row.content),
  }));

  const responsesByName = new Map<string, any[]>();
  for (const response of matchedResponses) {
    if (!response.jobname) continue;
    if (!responsesByName.has(response.jobname)) responsesByName.set(response.jobname, []);
    responsesByName.get(response.jobname)!.push(response);
  }

  const jobs = CRON_CHECKS.map((check) => {
    const live = liveByName.get(check.jobname);
    const runs = runsByName.get(check.jobname) || [];
    const responses = responsesByName.get(check.jobname) || [];
    const successes = responses.filter((row) => !isResponseFailure(row) && row.status_code >= 200 && row.status_code < 300);
    const failures = responses.filter((row) => isResponseFailure(row));
    const lastRun = runs[0] || null;
    const lastSuccess = successes[0] || null;
    const lastFailure = failures[0] || null;
    const lastSuccessAge = ageMinutes(lastSuccess?.created || null);
    const lastFailureAge = ageMinutes(lastFailure?.created || null);
    const lastSuccessTime = lastSuccess ? new Date(lastSuccess.created).getTime() : 0;
    const lastFailureTime = lastFailure ? new Date(lastFailure.created).getTime() : 0;
    const latestObservedFailure = lastFailure && (!lastSuccess || lastFailureTime > lastSuccessTime);

    let status = "healthy";
    let message = "Recent scheduled responses are healthy.";

    if (!live) {
      status = "critical";
      message = "Expected cron job is missing.";
    } else if (!live.active) {
      status = "critical";
      message = "Expected cron job is inactive.";
    } else if (lastRun && lastRun.status !== "succeeded") {
      status = "critical";
      message = `Cron run status is ${lastRun.status}.`;
    } else if (latestObservedFailure && lastFailureAge != null && lastFailureAge <= Math.max(check.cadenceMinutes * 3, 6)) {
      status = check.criticality;
      message = lastFailure.error_summary || `Recent HTTP ${lastFailure.status_code} response.`;
    } else if (!lastSuccess || lastSuccessAge == null || lastSuccessAge >= check.failMinutes) {
      status = check.criticality;
      message = lastSuccess
        ? `No successful HTTP response in ${lastSuccessAge} minutes.`
        : "No successful HTTP response found in the recent response window.";
    }

    return {
      jobname: check.jobname,
      label: check.label,
      function_name: check.functionName,
      cadence_minutes: check.cadenceMinutes,
      criticality: check.criticality,
      affects: check.affects,
      status,
      message,
      schedule: live?.schedule || null,
      active: live?.active ?? false,
      last_run_at: lastRun?.start_time || null,
      last_run_status: lastRun?.status || null,
      last_success_at: lastSuccess?.created || null,
      last_success_age_minutes: lastSuccessAge,
      last_failure_at: lastFailure?.created || null,
      last_failure_status_code: lastFailure?.status_code ?? null,
      last_failure_message: lastFailure?.error_summary || null,
      recent_failure_count: failures.length,
    };
  });

  const unmatchedFailures = matchedResponses
    .filter((row: any) => !row.jobname && isResponseFailure(row))
    .slice(0, 5)
    .map((row: any) => ({
      id: row.id,
      created: row.created,
      status_code: row.status_code,
      message: row.error_summary || "Unmatched scheduled HTTP failure.",
    }));

  return {
    status: worstStatus(jobs.map((job: any) => job.status).concat(unmatchedFailures.length ? ["warning"] : [])),
    jobs,
    recent_unmatched_failures: unmatchedFailures,
    response_window_minutes: 45,
  };
}

async function fetchSupabaseStatus() {
  try {
    const response = await fetch("https://status.supabase.com/api/v2/status.json");
    if (!response.ok) {
      throw new Error(`Status page returned ${response.status}`);
    }
    const payload = await response.json();
    return {
      indicator: payload?.status?.indicator || "unknown",
      description: payload?.status?.description || "Unknown",
      page_url: "https://status.supabase.com/",
    };
  } catch (error: any) {
    return {
      indicator: "unknown",
      description: error?.message || "Unable to reach Supabase status page.",
      page_url: "https://status.supabase.com/",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { location_id = "cherry-hill", date = nowEtDate() } = await req.json().catch(() => ({}));
    const requestedLocationId = String(location_id || "cherry-hill");
    const locationId = normalizeLocationId(requestedLocationId);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const todayNotesId = `ops_gingr_notes_${date}`;
    const [
      syncStateRes,
      ownersMetric,
      animalsMetric,
      reservationsMetric,
      latestOpsMetric,
      todayNotesMetric,
      reportHealth,
      bohCache,
      cronHealthResult,
      supabaseStatus,
    ] = await Promise.all([
      sb.from("gingr_sync_state").select("*").eq("location_id", locationId).order("entity_type", { ascending: true }),
      fetchLatestAndCount(sb, "gingr_owners", locationId, "updated_at, synced_at, first_name, last_name", "updated_at"),
      fetchLatestAndCount(sb, "gingr_animals", locationId, "updated_at, synced_at, name", "updated_at"),
      fetchLatestAndCount(sb, "gingr_reservations", locationId, "updated_at, synced_at, animal_name, start_date, end_date", "updated_at"),
      sb.from("lite_daily_ops").select("id, type_sub, updated_at, computed_at, date").eq("location_id", locationId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("lite_daily_ops").select("id, updated_at, computed_at, date").eq("location_id", locationId).eq("id", todayNotesId).maybeSingle(),
      fetchReportHealth(sb, locationId, date),
      fetchBohCacheHealth(sb, locationId),
      fetchCronHealth(sb).then((cronHealth) => ({ cronHealth })).catch((error: any) => ({ cronError: error?.message || "Failed to load cron health." })),
      fetchSupabaseStatus(),
    ]);

    if (syncStateRes.error) throw syncStateRes.error;
    if (latestOpsMetric.error) throw latestOpsMetric.error;
    if (todayNotesMetric.error) throw todayNotesMetric.error;

    const syncState = (syncStateRes.data || []).map((row: any) => {
      const age = ageMinutes(row.last_sync_at);
      return {
        entity_type: row.entity_type,
        status: row.status || "idle",
        records_synced: row.records_synced ?? 0,
        last_sync_at: row.last_sync_at || null,
        last_full_sync_at: row.last_full_sync_at || null,
        sync_duration_ms: row.sync_duration_ms ?? null,
        error_message: row.error_message || null,
        age_minutes: age,
        freshness_status: row.status === "error" ? "critical" : freshnessStatus(age, 45, 120),
      };
    });

    const latestDailyOpsAt = latestOpsMetric.data?.computed_at || latestOpsMetric.data?.updated_at || null;
    const todayNotesAt = todayNotesMetric.data?.computed_at || todayNotesMetric.data?.updated_at || null;
    const freshness = {
      owners: {
        count: ownersMetric.count,
        updated_at: ownersMetric.latest?.updated_at || null,
        synced_at: ownersMetric.latest?.synced_at || null,
        age_minutes: ageMinutes(ownersMetric.latest?.updated_at || ownersMetric.latest?.synced_at || null),
        freshness_status: freshnessStatus(ageMinutes(ownersMetric.latest?.updated_at || ownersMetric.latest?.synced_at || null), 60, 180),
      },
      animals: {
        count: animalsMetric.count,
        updated_at: animalsMetric.latest?.updated_at || null,
        synced_at: animalsMetric.latest?.synced_at || null,
        age_minutes: ageMinutes(animalsMetric.latest?.updated_at || animalsMetric.latest?.synced_at || null),
        freshness_status: freshnessStatus(ageMinutes(animalsMetric.latest?.updated_at || animalsMetric.latest?.synced_at || null), 60, 180),
      },
      reservations: {
        count: reservationsMetric.count,
        updated_at: reservationsMetric.latest?.updated_at || null,
        synced_at: reservationsMetric.latest?.synced_at || null,
        age_minutes: ageMinutes(reservationsMetric.latest?.updated_at || reservationsMetric.latest?.synced_at || null),
        freshness_status: freshnessStatus(ageMinutes(reservationsMetric.latest?.updated_at || reservationsMetric.latest?.synced_at || null), 20, 60),
      },
      daily_ops: {
        latest_id: latestOpsMetric.data?.id || null,
        latest_type_sub: latestOpsMetric.data?.type_sub || null,
        updated_at: latestOpsMetric.data?.updated_at || null,
        computed_at: latestOpsMetric.data?.computed_at || null,
        date: latestOpsMetric.data?.date || null,
        age_minutes: ageMinutes(latestDailyOpsAt),
        freshness_status: freshnessStatus(ageMinutes(latestDailyOpsAt), 45, 180),
      },
      gingr_notes_today: {
        id: todayNotesMetric.data?.id || null,
        updated_at: todayNotesMetric.data?.updated_at || null,
        computed_at: todayNotesMetric.data?.computed_at || null,
        date: todayNotesMetric.data?.date || date,
        age_minutes: ageMinutes(todayNotesAt),
        freshness_status: freshnessStatus(ageMinutes(todayNotesAt), 90, 240),
      },
    };

    const cronHealth = "cronHealth" in cronHealthResult
      ? cronHealthResult.cronHealth
      : {
          status: "warning",
          jobs: [],
          recent_unmatched_failures: [],
          response_window_minutes: 45,
          error: cronHealthResult.cronError,
        };

    const alerts: Array<{ severity: string; message: string }> = [];
    for (const job of cronHealth.jobs || []) {
      if (job.status === "critical" || job.status === "warning") {
        alerts.push({
          severity: job.status,
          message: `${job.label} is ${job.status}: ${job.message}`,
        });
      }
    }
    if (cronHealth.error) {
      alerts.push({
        severity: "warning",
        message: `Cron HTTP health could not be checked: ${cronHealth.error}`,
      });
    }
    for (const row of syncState) {
      if (row.status === "error") {
        alerts.push({
          severity: "critical",
          message: `${row.entity_type} sync is in error: ${row.error_message || "No error text returned."}`,
        });
      } else if (row.freshness_status === "critical") {
        alerts.push({
          severity: "warning",
          message: `${row.entity_type} sync is stale (${row.age_minutes} minutes since the last successful sync).`,
        });
      }
    }

    for (const report of reportHealth.reports) {
      if (report.status === "critical") {
        alerts.push({
          severity: "critical",
          message: `${report.label} is missing or stale for ${date}.`,
        });
      } else if (report.status === "warning") {
        alerts.push({
          severity: "warning",
          message: `${report.label} has not refreshed in ${report.age_minutes} minutes.`,
        });
      }
    }

    if (freshness.gingr_notes_today.freshness_status === "critical") {
      alerts.push({
        severity: "warning",
        message: `Today's GINGR notes have not refreshed recently for ${date}.`,
      });
    }

    if (!["none", "minor"].includes(supabaseStatus.indicator)) {
      alerts.push({
        severity: "warning",
        message: `Supabase status page is reporting ${supabaseStatus.description}.`,
      });
    }

    const overall_status = alerts.some((alert) => alert.severity === "critical")
      ? "critical"
      : alerts.length > 0
        ? "warning"
        : "healthy";

    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(),
      location_id: locationId,
      requested_location_id: requestedLocationId,
      today: date,
      overall_status,
      alerts,
      supabase_status: supabaseStatus,
      sync_state: syncState,
      freshness,
      reports: reportHealth,
      cron_health: cronHealth,
      boh_cache: bohCache,
      pitr: {
        status: "manual-check-required",
        note: "PITR is configured at the Supabase project level. This app can monitor data freshness and Supabase public status, but it cannot confirm restore points without separate management credentials.",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("ops-platform-health error:", error);
    return new Response(JSON.stringify({
      error: error?.message || "Failed to load platform health.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

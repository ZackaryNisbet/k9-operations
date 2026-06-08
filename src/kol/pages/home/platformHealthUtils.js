import { C } from "../../../shared/theme";

export async function buildPlatformHealthFailure(error, previousHealth) {
  const statusCode = typeof error?.context?.status === "number" ? error.context.status : null;
  let responsePayload = null;
  if (error?.context && typeof error.context.clone === "function") {
    try {
      responsePayload = await error.context.clone().json();
    } catch {
      responsePayload = null;
    }
  }
  const responseAlert = Array.isArray(responsePayload?.alerts) ? responsePayload.alerts[0] : null;
  const detail = responseAlert?.message || responsePayload?.error || responsePayload?.message || error?.message || "Platform health unavailable.";
  const lastKnownGeneratedAt = previousHealth?.overall_status === "warning" || previousHealth?.overall_status === "critical"
    ? previousHealth.last_known_generated_at || null
    : previousHealth?.generated_at || null;

  return {
    overall_status: "warning",
    generated_at: new Date().toISOString(),
    last_known_generated_at: lastKnownGeneratedAt,
    function_name: "ops-platform-health",
    alerts: [{
      severity: "warning",
      kind: "edge_function",
      label: "Platform Health",
      function_name: "ops-platform-health",
      affects: ["Platform health details", "Data freshness visibility"],
      last_success_at: lastKnownGeneratedAt,
      last_failure_status_code: statusCode,
      message: `ops-platform-health returned ${statusCode ? `HTTP ${statusCode}` : "a non-2xx status"}: ${detail}`,
      action: "The dashboard cannot verify report freshness until this function succeeds.",
    }],
    cron_health: previousHealth?.cron_health || null,
    reports: previousHealth?.reports || null,
    health_factors: previousHealth?.health_factors || null,
  };
}

export function homeHealthTone(status) {
  if (status === "healthy" || status === "none" || status === "minor") {
    return { label: "Healthy", color: C.suc, bg: C.sucLt, border: "rgba(22,163,74,0.28)", glow: "rgba(22,163,74,0.12)" };
  }
  if (status === "critical") {
    return { label: "Critical", color: C.dan, bg: C.danLt, border: "rgba(220,38,38,0.28)", glow: "rgba(220,38,38,0.12)" };
  }
  if (status === "checking") {
    return { label: "Checking", color: C.info, bg: C.infoLt, border: "rgba(37,99,235,0.24)", glow: "rgba(37,99,235,0.10)" };
  }
  return { label: "Warning", color: C.warn, bg: C.warnLt, border: "rgba(217,119,6,0.28)", glow: "rgba(217,119,6,0.12)" };
}

export function buildHomeFallbackHealthFactors(health) {
  const jobs = health?.cron_health?.jobs || [];
  const reports = health?.reports?.reports || [];
  return [
    {
      key: "scheduled_edge_functions",
      label: "Scheduled Edge Functions",
      status: health?.cron_health?.status || health?.overall_status || "unknown",
      summary: `${jobs.filter((job) => job.status === "healthy").length}/${jobs.length} scheduled jobs healthy`,
      description: "Checks scheduled Edge Function runs and recent HTTP responses.",
      healthy_criteria: "Expected jobs are active and recently successful.",
    },
    {
      key: "canonical_reports",
      label: "Canonical Report Freshness",
      status: health?.reports?.status || health?.overall_status || "unknown",
      summary: `${reports.filter((report) => report.status === "healthy").length}/${reports.length} reports fresh`,
      description: "Checks today's canonical report rows.",
      healthy_criteria: "Report outputs have recent refresh timestamps.",
    },
  ];
}

export function uniqueHomeHealthList(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function formatHomeHealthTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatHomeHealthAge(minutes) {
  if (minutes == null) return "Unknown";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatHomeHealthCadence(minutes) {
  if (!minutes) return "On demand";
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

export function formatHomeHealthEta(minutes) {
  if (minutes == null) return "pending";
  if (minutes <= 1) return "in <1m";
  return `in ${minutes}m`;
}

export function getHomeNextRun(job) {
  if (job?.next_run_at) {
    return { at: job.next_run_at, eta: job.next_run_eta_minutes };
  }
  if (!job?.cadence_minutes || job.active === false) return null;
  const cadenceMs = job.cadence_minutes * 60000;
  const baseValue = job.last_run_at || job.last_success_at;
  const baseMs = baseValue ? new Date(baseValue).getTime() : NaN;
  if (Number.isNaN(baseMs)) return null;
  const nowMs = Date.now();
  let nextMs = baseMs + cadenceMs;
  if (nextMs <= nowMs) {
    nextMs = baseMs + (Math.floor((nowMs - baseMs) / cadenceMs) + 1) * cadenceMs;
  }
  return { at: new Date(nextMs).toISOString(), eta: Math.max(0, Math.ceil((nextMs - nowMs) / 60000)) };
}

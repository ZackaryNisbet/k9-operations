import React, { useEffect } from "react";
import { C } from "../../../../shared/theme";
import { I } from "../../../../shared/icons";

export function PlatformHealthStatusButton({ platformHealth, onClick }) {
  const tone = getDashboardPlatformHealthTone(platformHealth?.overall_status);
  const alertCount = platformHealth?.alerts?.length || 0;
  const label = platformHealth?.overall_status === "critical"
    ? `Platform Critical · ${alertCount || 1}`
    : platformHealth?.overall_status === "warning"
      ? `Health Warning · ${alertCount || 1}`
      : "Healthy";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        fontSize: 8,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
      title={platformHealth?.alerts?.[0]?.message || "Open platform health"}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone.color, boxShadow: `0 0 0 3px ${tone.glow}` }} />
      {label}
    </button>
  );
}

export function PlatformHealthModal({ platformHealth, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tone = getDashboardPlatformHealthTone(platformHealth?.overall_status);
  const jobs = platformHealth?.cron_health?.jobs || [];
  const reports = platformHealth?.reports?.reports || [];
  const factors = platformHealth?.health_factors || buildFallbackHealthFactors(platformHealth);
  const generated = formatDashboardHealthTime(platformHealth?.generated_at);
  const healthyJobs = jobs.filter((job) => job.status === "healthy").length;
  const healthyReports = reports.filter((report) => report.status === "healthy").length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Platform health breakdown"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(15,23,42,0.34)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "healthBackdropIn 0.16s ease-out both",
      }}
    >
      <div style={{
        width: "min(980px, 96vw)",
        maxHeight: "88vh",
        overflow: "hidden",
        borderRadius: 14,
        background: "#FFFFFF",
        border: "1px solid rgba(15,23,42,0.10)",
        boxShadow: "0 24px 80px rgba(15,23,42,0.22)",
        animation: "healthModalIn 0.2s cubic-bezier(0.22,1,0.36,1) both",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{
          padding: "18px 22px",
          borderBottom: "1px solid rgba(15,23,42,0.08)",
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "flex-start",
          background: `linear-gradient(135deg, ${tone.bg}, #FFFFFF 62%)`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
              <span style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: tone.color,
                boxShadow: `0 0 0 5px ${tone.glow}`,
                flexShrink: 0,
              }} />
              <div style={{ fontSize: 18, fontWeight: 850, color: C.text, lineHeight: 1 }}>
                Platform Health: {tone.label}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5, maxWidth: 760 }}>
              Healthy means the scheduled data-pull Edge Functions are running, their HTTP responses are clean,
              and the canonical Supabase report outputs are fresh enough to trust.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <PlatformHealthStat label="Jobs" value={`${healthyJobs}/${jobs.length || 0}`} tone={tone} />
              <PlatformHealthStat label="Reports" value={`${healthyReports}/${reports.length || 0}`} tone={tone} />
              <PlatformHealthStat label="Alerts" value={String(platformHealth?.alerts?.length || 0)} tone={tone} />
              <PlatformHealthStat label="Generated" value={generated || "Unknown"} tone={tone} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close platform health"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.84)",
              color: C.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <I.X />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 22 }}>
          <PlatformHealthSection title="Health Factors">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {factors.map((factor) => {
                const factorTone = getDashboardPlatformHealthTone(factor.status);
                return (
                  <div key={factor.key || factor.label} style={{
                    border: `1px solid ${factorTone.border}`,
                    background: factorTone.bg,
                    borderRadius: 10,
                    padding: 12,
                    minHeight: 132,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: factorTone.color }} />
                      <div style={{ fontSize: 12, fontWeight: 800, color: factorTone.color }}>{factor.label}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 750, color: C.text, lineHeight: 1.25 }}>{factor.summary}</div>
                    <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45, marginTop: 7 }}>{factor.description}</div>
                    {factor.healthy_criteria && (
                      <div style={{ fontSize: 10.5, color: C.textSec, lineHeight: 1.35, marginTop: 7, fontWeight: 650 }}>
                        Healthy: {factor.healthy_criteria}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </PlatformHealthSection>

          <PlatformHealthSection title="Scheduled Edge Functions">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobs.map((job) => (
                <PlatformFunctionRow key={job.jobname || job.function_name} job={job} />
              ))}
              {platformHealth?.self_check && (
                <PlatformFunctionRow
                  job={{
                    ...platformHealth.self_check,
                    jobname: "client-dashboard-poll",
                    schedule: "Client refresh",
                    cadence_label: platformHealth.self_check.cadence_label,
                    message: "Health payload loaded successfully.",
                  }}
                />
              )}
            </div>
          </PlatformHealthSection>

          <PlatformHealthSection title="Report Outputs">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {reports.map((report) => {
                const reportTone = getDashboardPlatformHealthTone(report.status);
                return (
                  <div key={report.id || report.key} style={{
                    border: `1px solid ${reportTone.border}`,
                    borderRadius: 10,
                    padding: 12,
                    background: "#FFFFFF",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{report.label}</div>
                      <StatusPill status={report.status} />
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.45, marginTop: 7 }}>
                      {report.description || "Canonical daily report output."}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 10 }}>
                      <PlatformHealthFact label="Items" value={report.total != null ? report.total.toLocaleString("en-US") : "Unknown"} />
                      <PlatformHealthFact label="Age" value={formatDashboardHealthAge(report.age_minutes)} />
                      <PlatformHealthFact label="Computed" value={formatDashboardHealthTime(report.computed_at) || "Not seen"} />
                      <PlatformHealthFact label="Updated" value={formatDashboardHealthTime(report.updated_at) || "Not seen"} />
                    </div>
                  </div>
                );
              })}
            </div>
          </PlatformHealthSection>

          {platformHealth?.alerts?.length ? (
            <PlatformHealthSection title="Active Alerts">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {platformHealth.alerts.map((alert, index) => {
                  const alertTone = getDashboardPlatformHealthTone(alert.severity);
                  return (
                    <div key={`${alert.message}_${index}`} style={{
                      border: `1px solid ${alertTone.border}`,
                      background: alertTone.bg,
                      borderRadius: 10,
                      padding: 12,
                      color: C.text,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 850, color: alertTone.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {alert.label || alert.kind || "Alert"}
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 5 }}>{alert.message}</div>
                      {alert.action && <div style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.4, marginTop: 5 }}>{alert.action}</div>}
                    </div>
                  );
                })}
              </div>
            </PlatformHealthSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlatformFunctionRow({ job }) {
  const tone = getDashboardPlatformHealthTone(job.status);
  const usedFor = compactDashboardHealthList([...(job.used_for || []), ...(job.affects || [])]).slice(0, 5);
  const nextRunInfo = getDashboardNextRun(job);
  const nextRun = nextRunInfo
    ? `${formatDashboardHealthTime(nextRunInfo.at)} (${formatDashboardHealthEta(nextRunInfo.eta)})`
    : "Not scheduled";

  return (
    <div style={{
      border: `1px solid ${tone.border}`,
      borderRadius: 10,
      padding: 13,
      background: "#FFFFFF",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: 14,
      alignItems: "start",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: tone.color, flexShrink: 0 }} />
          <div style={{ fontSize: 13, fontWeight: 850, color: C.text, lineHeight: 1.15 }}>{job.label || job.function_name}</div>
          <StatusPill status={job.status} />
        </div>
        <div style={{ fontSize: 11, color: C.textMut, fontWeight: 700, marginTop: 5 }}>
          {job.function_name || "Unknown function"}{job.sync_type ? ` · ${job.sync_type}` : ""}
        </div>
        <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.45, marginTop: 8 }}>
          {job.description || job.message || "Scheduled Edge Function health check."}
        </div>
        {usedFor.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
            {usedFor.map((label) => (
              <span key={`${job.jobname}_${label}`} style={{
                padding: "3px 6px",
                borderRadius: 999,
                background: "rgba(20,83,45,0.06)",
                color: C.pri,
                fontSize: 10,
                fontWeight: 750,
              }}>
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8 }}>
        <PlatformHealthFact label="Frequency" value={job.cadence_label || formatDashboardHealthCadence(job.cadence_minutes)} />
        <PlatformHealthFact label="Last run" value={formatDashboardHealthTime(job.last_run_at) || "No run"} />
        <PlatformHealthFact label="Last success" value={formatDashboardHealthTime(job.last_success_at) || "No success"} />
        <PlatformHealthFact label="Next run" value={nextRun} />
        <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: tone.color, fontWeight: 700, lineHeight: 1.35 }}>
          {job.message || "Recent scheduled responses are healthy."}
        </div>
      </div>
    </div>
  );
}

function PlatformHealthSection({ title, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ margin: "0 0 10px", color: C.text, fontSize: 14, fontWeight: 850 }}>{title}</h3>
      {children}
    </section>
  );
}

function PlatformHealthStat({ label, value, tone }) {
  return (
    <div style={{
      border: `1px solid ${tone.border}`,
      background: "rgba(255,255,255,0.76)",
      borderRadius: 8,
      padding: "6px 9px",
      minWidth: 86,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 850, color: C.text, marginTop: 2, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function PlatformHealthFact({ label, value }) {
  return (
    <div style={{
      borderRadius: 8,
      background: "#F8FAFC",
      border: "1px solid rgba(15,23,42,0.06)",
      padding: "7px 8px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 8.5, fontWeight: 850, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.text, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(value || "")}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const tone = getDashboardPlatformHealthTone(status);
  return (
    <span style={{
      padding: "2px 6px",
      borderRadius: 999,
      border: `1px solid ${tone.border}`,
      background: tone.bg,
      color: tone.color,
      fontSize: 9,
      fontWeight: 850,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {tone.label}
    </span>
  );
}

function getDashboardPlatformHealthTone(status) {
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

function buildFallbackHealthFactors(platformHealth) {
  const jobs = platformHealth?.cron_health?.jobs || [];
  const reports = platformHealth?.reports?.reports || [];
  return [
    {
      key: "scheduled_edge_functions",
      label: "Scheduled Edge Functions",
      status: platformHealth?.cron_health?.status || platformHealth?.overall_status || "unknown",
      summary: `${jobs.filter((job) => job.status === "healthy").length}/${jobs.length} scheduled jobs healthy`,
      description: "Checks scheduled Edge Function runs and recent HTTP responses.",
      healthy_criteria: "Expected jobs are active and recently successful.",
    },
    {
      key: "canonical_reports",
      label: "Canonical Report Freshness",
      status: platformHealth?.reports?.status || platformHealth?.overall_status || "unknown",
      summary: `${reports.filter((report) => report.status === "healthy").length}/${reports.length} reports fresh`,
      description: "Checks today's canonical report rows.",
      healthy_criteria: "Report outputs have recent refresh timestamps.",
    },
  ];
}

function compactDashboardHealthList(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function formatDashboardHealthTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDashboardHealthAge(minutes) {
  if (minutes == null) return "Unknown";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDashboardHealthEta(minutes) {
  if (minutes == null) return "pending";
  if (minutes <= 1) return "in <1m";
  return `in ${minutes}m`;
}

function formatDashboardHealthCadence(minutes) {
  if (!minutes) return "On demand";
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

function getDashboardNextRun(job) {
  if (job?.next_run_at) {
    return {
      at: job.next_run_at,
      eta: job.next_run_eta_minutes,
    };
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
  return {
    at: new Date(nextMs).toISOString(),
    eta: Math.max(0, Math.ceil((nextMs - nowMs) / 60000)),
  };
}

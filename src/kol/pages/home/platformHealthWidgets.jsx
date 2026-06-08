import React, { useEffect } from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import {
  homeHealthTone,
  buildHomeFallbackHealthFactors,
  uniqueHomeHealthList,
  formatHomeHealthTime,
  formatHomeHealthAge,
  formatHomeHealthCadence,
  formatHomeHealthEta,
  getHomeNextRun,
} from "./platformHealthUtils";

export function HomePlatformHealthButton({ health, loading, onClick }) {
  if (!health && !loading) return null;
  const tone = homeHealthTone(health?.overall_status || "checking");
  const alertCount = health?.alerts?.length || 0;
  const label = health?.overall_status === "critical"
    ? `Critical · ${alertCount || 1}`
    : health?.overall_status === "warning"
      ? `Warning · ${alertCount || 1}`
      : loading && !health
        ? "Checking"
        : "Healthy";

  return (
    <button
      type="button"
      onClick={onClick}
      title={health?.alerts?.[0]?.message || "Open platform health"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        padding: "7px 11px",
        fontSize: 11,
        fontWeight: 850,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: tone.color, boxShadow: `0 0 0 4px ${tone.glow}` }} />
      {label}
    </button>
  );
}

export function HomePlatformHealthModal({ health, loading, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const tone = homeHealthTone(health?.overall_status || (loading ? "checking" : "warning"));
  const jobs = health?.cron_health?.jobs || [];
  const reports = health?.reports?.reports || [];
  const factors = health?.health_factors || buildHomeFallbackHealthFactors(health);
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
      }}
    >
      <style>{`
        @keyframes homeHealthModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div style={{
        width: "min(980px, 96vw)",
        maxHeight: "88vh",
        overflow: "hidden",
        borderRadius: 14,
        background: "#FFFFFF",
        border: "1px solid rgba(15,23,42,0.10)",
        boxShadow: "0 24px 80px rgba(15,23,42,0.22)",
        animation: "homeHealthModalIn 0.2s cubic-bezier(0.22,1,0.36,1) both",
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
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: tone.color, boxShadow: `0 0 0 5px ${tone.glow}` }} />
              <div style={{ fontSize: 18, fontWeight: 850, color: C.text, lineHeight: 1 }}>
                Platform Health: {tone.label}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5, maxWidth: 760 }}>
              Healthy means scheduled data-pull Edge Functions are running, their HTTP responses are clean, and the canonical Supabase report outputs are fresh enough to trust.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <HomeHealthStat label="Jobs" value={`${healthyJobs}/${jobs.length || 0}`} tone={tone} />
              <HomeHealthStat label="Reports" value={`${healthyReports}/${reports.length || 0}`} tone={tone} />
              <HomeHealthStat label="Alerts" value={String(health?.alerts?.length || 0)} tone={tone} />
              <HomeHealthStat label="Generated" value={formatHomeHealthTime(health?.generated_at) || "Unknown"} tone={tone} />
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
          <HomeHealthSection title="Health Factors">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {factors.map((factor) => {
                const factorTone = homeHealthTone(factor.status);
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
                    {factor.healthy_criteria ? (
                      <div style={{ fontSize: 10.5, color: C.textSec, lineHeight: 1.35, marginTop: 7, fontWeight: 650 }}>
                        Healthy: {factor.healthy_criteria}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </HomeHealthSection>

          <HomeHealthSection title="Scheduled Edge Functions">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobs.map((job) => <HomeFunctionRow key={job.jobname || job.function_name} job={job} />)}
              {health?.self_check ? (
                <HomeFunctionRow
                  job={{
                    ...health.self_check,
                    jobname: "client-dashboard-poll",
                    schedule: "Client refresh",
                    message: "Health payload loaded successfully.",
                  }}
                />
              ) : null}
            </div>
          </HomeHealthSection>

          <HomeHealthSection title="Report Outputs">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {reports.map((report) => {
                const reportTone = homeHealthTone(report.status);
                return (
                  <div key={report.id || report.key} style={{ border: `1px solid ${reportTone.border}`, borderRadius: 10, padding: 12, background: "#FFFFFF" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{report.label}</div>
                      <HomeStatusPill status={report.status} />
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.45, marginTop: 7 }}>
                      {report.description || "Canonical daily report output."}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 10 }}>
                      <HomeHealthFact label="Items" value={report.total != null ? report.total.toLocaleString("en-US") : "Unknown"} />
                      <HomeHealthFact label="Age" value={formatHomeHealthAge(report.age_minutes)} />
                      <HomeHealthFact label="Computed" value={formatHomeHealthTime(report.computed_at) || "Not seen"} />
                      <HomeHealthFact label="Updated" value={formatHomeHealthTime(report.updated_at) || "Not seen"} />
                    </div>
                  </div>
                );
              })}
            </div>
          </HomeHealthSection>

          {health?.alerts?.length ? (
            <HomeHealthSection title="Active Alerts">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {health.alerts.map((alert, index) => {
                  const alertTone = homeHealthTone(alert.severity);
                  return (
                    <div key={`${alert.message}_${index}`} style={{ border: `1px solid ${alertTone.border}`, background: alertTone.bg, borderRadius: 10, padding: 12, color: C.text }}>
                      <div style={{ fontSize: 11, fontWeight: 850, color: alertTone.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {alert.label || alert.kind || "Alert"}
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 5 }}>{alert.message}</div>
                      {alert.action ? <div style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.4, marginTop: 5 }}>{alert.action}</div> : null}
                    </div>
                  );
                })}
              </div>
            </HomeHealthSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HomeFunctionRow({ job }) {
  const tone = homeHealthTone(job.status);
  const usedFor = uniqueHomeHealthList([...(job.used_for || []), ...(job.affects || [])]).slice(0, 5);
  const nextRun = getHomeNextRun(job);
  return (
    <div style={{ border: `1px solid ${tone.border}`, borderRadius: 10, padding: 13, background: "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: tone.color, flexShrink: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 850, color: C.text, lineHeight: 1.15 }}>{job.label || job.function_name}</div>
        <HomeStatusPill status={job.status} />
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
            <span key={`${job.jobname}_${label}`} style={{ padding: "3px 6px", borderRadius: 999, background: "rgba(20,83,45,0.06)", color: C.pri, fontSize: 10, fontWeight: 750 }}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8, marginTop: 10 }}>
        <HomeHealthFact label="Frequency" value={job.cadence_label || formatHomeHealthCadence(job.cadence_minutes)} />
        <HomeHealthFact label="Last run" value={formatHomeHealthTime(job.last_run_at) || "No run"} />
        <HomeHealthFact label="Last success" value={formatHomeHealthTime(job.last_success_at) || "No success"} />
        <HomeHealthFact label="Next run" value={nextRun ? `${formatHomeHealthTime(nextRun.at)} (${formatHomeHealthEta(nextRun.eta)})` : "Not scheduled"} />
        <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: tone.color, fontWeight: 700, lineHeight: 1.35 }}>
          {job.message || "Recent scheduled responses are healthy."}
        </div>
      </div>
    </div>
  );
}

function HomeHealthSection({ title, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ margin: "0 0 10px", color: C.text, fontSize: 14, fontWeight: 850 }}>{title}</h3>
      {children}
    </section>
  );
}

function HomeHealthStat({ label, value, tone }) {
  return (
    <div style={{ border: `1px solid ${tone.border}`, background: "rgba(255,255,255,0.76)", borderRadius: 8, padding: "6px 9px", minWidth: 86 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 850, color: C.text, marginTop: 2, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function HomeHealthFact({ label, value }) {
  return (
    <div style={{ borderRadius: 8, background: "#F8FAFC", border: "1px solid rgba(15,23,42,0.06)", padding: "7px 8px", minWidth: 0 }}>
      <div style={{ fontSize: 8.5, fontWeight: 850, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.text, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(value || "")}>
        {value}
      </div>
    </div>
  );
}

function HomeStatusPill({ status }) {
  const tone = homeHealthTone(status);
  return (
    <span style={{ padding: "2px 6px", borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 9, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", flexShrink: 0 }}>
      {tone.label}
    </span>
  );
}

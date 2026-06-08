// K9 Operations — HomePage
// Role-aware landing page. Staff roles see a clean "My Shift" summary
// directing them into My Work; managers/admins see an oversight dashboard
// aligned to the shared mobile dashboard snapshot contract.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import { useEnrichmentWorkflow } from "../../hooks/useEnrichmentWorkflow";
import { useWeatherData } from "../../hooks/useWeatherData";
import { useWeatherDisplaySettings } from "../../hooks/useWeatherDisplaySettings";
import WeatherHourlyGraph from "../../shared/WeatherHourlyGraph";
import TodayEnrichmentCard from "../enrichments/TodayEnrichmentCard";
import {
  buildWeatherDetailMetrics,
  buildWeatherDataFields,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherBrief,
  formatWeatherDateLabel,
  formatWeatherFreshnessLabel,
  getWeatherRefreshIssueLabel,
  formatWeatherSource,
  formatWeatherSummary,
  getWeatherIconUrl,
  getWeatherOperationalNote,
  getWeatherTone,
  isWeatherCurrentRead,
  isWeatherAvailable,
} from "../../shared/weather";
import { DEFAULT_INVENTORY_SCHEDULE, getInventoryCycleStart, getInventoryOverdueInfo, normalizeInventorySchedule } from "./inventorySchedule";
import { classifyRole } from "./home/roleClassification";
import { getWorkflowNavTarget } from "./home/workflowRoutes";
import { formatBoardingDaycareSubtext, formatRoomsOccupiedSubtext } from "./home/dashboardMetrics";

function HomeHeader({ greeting, subtitle, rightSlot }) {
  return (
    <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: C.text,
            margin: 0,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
          }}
        >
          {greeting}
        </h1>
        {subtitle ? (
          <p style={{ fontSize: 14, color: C.textMut, marginTop: 6, fontWeight: 500 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {rightSlot ? <div style={{ flexShrink: 0 }}>{rightSlot}</div> : null}
    </div>
  );
}

function QuickCard({ label, desc, icon, onClick, accent, badge }) {
  const IconComp = I[icon];
  return (
    <div
      onClick={onClick}
      style={{
        padding: "20px 22px",
        borderRadius: 14,
        cursor: "pointer",
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        transition: "all 0.2s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 110,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = `${accent || C.pri}50`;
        event.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.06)";
        event.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = C.border;
        event.currentTarget.style.boxShadow = "none";
        event.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${accent || C.pri}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {IconComp ? <IconComp style={{ width: 18, height: 18, color: accent || C.pri }} /> : null}
        </div>
        {badge ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 20,
              background: badge.bg || C.warnLt,
              color: badge.color || C.warn,
            }}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</div>
        {desc ? <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{desc}</div> : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtext, color, live }) {
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 12,
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        position: "relative",
      }}
    >
      {live ? (
        <span style={{ position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: "50%", background: C.suc }} />
      ) : null}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: C.textMut,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {subtext ? <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{subtext}</div> : null}
    </div>
  );
}

function WorkflowProgressPanel({ rows, nav }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div
      style={{
        padding: "18px 22px",
        borderRadius: 14,
        background: C.surface,
        border: `1.5px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Workflow Progress</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => {
          const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
          const isComplete = row.total > 0 && row.completed >= row.total;
          const navTarget = getWorkflowNavTarget(row.id, row.title);
          return (
            <button
              key={row.id}
              type="button"
              disabled={!navTarget}
              onClick={() => {
                if (!navTarget) return;
                nav(navTarget.page, navTarget.params || {});
              }}
              style={{
                cursor: navTarget ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
                textAlign: "left",
                opacity: navTarget ? 1 : 0.7,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{row.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? C.suc : C.textMut }}>
                    {row.completed}/{row.total}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: isComplete ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildInventoryQuickAccessState(snapshot, overdueInfo) {
  const isCompleted = !!snapshot?.completed_at || snapshot?.status === "completed";
  if (isCompleted) {
    return {
      desc: "Current cycle complete",
      badge: { label: "Complete", bg: C.sucLt, color: C.suc },
    };
  }
  if (overdueInfo.isOverdue) {
    return {
      desc: "Inventory count overdue",
      badge: { label: `${overdueInfo.daysOverdue}d overdue`, bg: "#FEF2F2", color: "#DC2626" },
    };
  }
  if (overdueInfo.isDueToday) {
    return {
      desc: "Inventory count due today",
      badge: { label: "Due today", bg: C.warnLt, color: C.warn },
    };
  }
  return {
    desc: "Current cycle in progress",
    badge: { label: "On track", bg: C.priLt, color: C.pri },
  };
}

async function buildPlatformHealthFailure(error, previousHealth) {
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

function usePlatformHealth(locationId, date) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId) return undefined;
    let cancelled = false;
    let previousHealth = health;

    const loadHealth = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ops-platform-health", {
          body: { location_id: locationId, date },
        });
        if (error) throw error;
        if (!cancelled) {
          previousHealth = data || null;
          setHealth(data || null);
        }
      } catch (error) {
        const fallback = await buildPlatformHealthFailure(error, previousHealth);
        if (!cancelled) {
          previousHealth = fallback;
          setHealth(fallback);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadHealth();
    const interval = setInterval(loadHealth, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [locationId, date]);

  return { health, loading };
}

function homeHealthTone(status) {
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

function HomePlatformHealthButton({ health, loading, onClick }) {
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

function HomeWeatherIcon({ weather, size = 42 }) {
  const iconUrl = getWeatherIconUrl(weather);
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        aria-hidden="true"
        style={{ width: size, height: size, objectFit: "contain", flex: `0 0 ${size}px` }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#E0F2FE",
        color: C.info,
        fontSize: Math.max(14, size * 0.44),
        fontWeight: 900,
        flex: `0 0 ${size}px`,
      }}
    >
      °
    </span>
  );
}

function HomeWeatherButton({ weather, loading, error, onClick }) {
  const available = isWeatherAvailable(weather);
  const tone = getWeatherTone(weather);
  const label = loading
    ? "Weather"
    : available
      ? `${formatTemperature(weather.current_temp_f || weather.high_temp_f)} · ${tone.label}`
      : error
        ? "Weather Error"
        : "Weather";

  return (
    <button
      type="button"
      onClick={onClick}
      title={error || formatWeatherSummary(weather)}
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
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        whiteSpace: "nowrap",
      }}
    >
      <HomeWeatherIcon weather={weather} size={18} />
      {label}
    </button>
  );
}

function HomeWeatherCard({ weather, loading, error, limitations, targetDate, onOpen }) {
  const available = isWeatherAvailable(weather);
  const tone = getWeatherTone(weather);
  const details = buildWeatherDetailMetrics(weather);
  const compactMetrics = details.slice(0, 3);
  const weatherDateLabel = formatWeatherDateLabel(weather, targetDate);
  const freshnessLabel = formatWeatherFreshnessLabel(weather, limitations);
  const brief = formatWeatherBrief(weather);
  const visibleMetrics = compactMetrics.length ? compactMetrics : [
    { label: "Source", value: loading ? "Loading" : formatWeatherSource(weather) },
    { label: "High/Low", value: available ? formatTemperatureRange(weather) : "--" },
    { label: "Risk", value: tone.label },
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: "100%",
        marginBottom: 24,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: "linear-gradient(135deg, #FFFFFF 0%, #FFFFFF 52%, #F7FEE7 100%)",
        boxShadow: "0 4px 6px rgba(15,23,42,0.05)",
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 300px)", alignItems: "center", gap: 16, minHeight: 118, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <HomeWeatherIcon weather={weather} size={40} />
          <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.text, fontWeight: 900 }}>Weather for {weatherDateLabel}</span>
              <span style={{ padding: "3px 9px", borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 11, fontWeight: 900 }}>
                {loading ? "Loading" : tone.label}
              </span>
              {freshnessLabel ? <span style={{ fontSize: 11, color: C.textMut, fontWeight: 750 }}>{freshnessLabel}</span> : null}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ fontSize: 30, lineHeight: 1, color: available ? C.pri : C.textMut, fontWeight: 950 }}>
                {available ? formatTemperature(weather.current_temp_f || weather.high_temp_f) : "--"}
              </span>
              <span style={{ fontSize: 14, color: available ? C.text : C.textMut, fontWeight: 900 }}>
                {available ? formatTemperatureRange(weather) : "Weather not cached"}
              </span>
              <span style={{ fontSize: 12, color: error ? C.dan : C.textSec, fontWeight: 750, lineHeight: 1.35, whiteSpace: "normal", maxWidth: 680 }}>
                {error || brief}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              {visibleMetrics.slice(0, 3).map((metric) => (
                <span
                  key={metric.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: 5,
                    padding: "5px 8px",
                    borderRadius: 999,
                    border: `1px solid ${metric.tone === "caution" ? "#FDE68A" : C.borderLight}`,
                    background: metric.tone === "caution" ? C.warnLt : "rgba(255,255,255,0.78)",
                    color: metric.tone === "caution" ? C.warn : C.text,
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 9, color: C.textMut, fontWeight: 850, whiteSpace: "nowrap" }}>{metric.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {metric.value}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <WeatherHourlyGraph weather={weather} loading={loading} compact />
        </div>
      </div>
    </button>
  );
}

function HomeWeatherMetric({ metric }) {
  const caution = metric.tone === "caution";
  return (
    <div style={{
      border: `1px solid ${caution ? "#FDE68A" : C.borderLight}`,
      borderRadius: 10,
      background: caution ? C.warnLt : "#F8FAFC",
      padding: 12,
      minHeight: 76,
      display: "grid",
      alignContent: "center",
      gap: 5,
    }}>
      <div style={{ fontSize: 10, color: C.textMut, fontWeight: 850 }}>{metric.label}</div>
      <div style={{ fontSize: 18, color: caution ? C.warn : C.text, fontWeight: 950, lineHeight: 1 }}>{metric.value}</div>
    </div>
  );
}

function HomeWeatherDataFields({ fields }) {
  if (!fields.length) return null;
  return (
    <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, background: "#FFFFFF", padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 10 }}>Cached Fields</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))", gap: 8 }}>
        {fields.map((field) => (
          <div key={field.key} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, background: "#F8FAFC", padding: "8px 9px", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>{field.label}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.text, fontWeight: 850, lineHeight: 1.4, overflowWrap: "anywhere" }}>{field.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeWeatherModal({ weather, loading, error, limitations, targetDate, onClose, onRefresh }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const available = isWeatherAvailable(weather);
  const tone = getWeatherTone(weather);
  const details = buildWeatherDetailMetrics(weather);
  const dataFields = buildWeatherDataFields(weather);
  const weatherDateLabel = formatWeatherDateLabel(weather, targetDate);
  const freshnessLabel = formatWeatherFreshnessLabel(weather, limitations);
  const refreshIssueLabel = getWeatherRefreshIssueLabel(limitations);
  const currentRead = isWeatherCurrentRead(weather);
  const brief = formatWeatherBrief(weather);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Weather details"
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
      <div style={{
        width: "min(980px, 96vw)",
        maxHeight: "calc(100vh - 48px)",
        minHeight: 0,
        overflow: "hidden",
        borderRadius: 8,
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        boxShadow: "0 20px 25px rgba(15,23,42,0.16)",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{
          padding: "20px 22px",
          borderBottom: `1px solid ${C.borderLight}`,
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "flex-start",
          background: "#FFFFFF",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <HomeWeatherIcon weather={weather} size={64} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1 }}>Weather for {weatherDateLabel}</div>
                <span style={{ padding: "3px 9px", borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 11, fontWeight: 900 }}>
                  {loading ? "Loading" : tone.label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 11, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 38, fontWeight: 950, color: available ? C.pri : C.textMut, lineHeight: 1 }}>
                  {available ? formatTemperature(weather.current_temp_f || weather.high_temp_f) : "--"}
                </span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                  {available ? formatTemperatureRange(weather) : "No cached weather"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 750, color: C.textSec }}>{brief}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close weather details"
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "#FFFFFF",
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
        <div style={{ overflowY: "auto", minHeight: 0, overscrollBehavior: "contain", padding: 22, display: "grid", gap: 16 }}>
          {error ? (
            <div style={{ border: `1px solid ${C.dan}`, borderRadius: 10, background: C.danLt, padding: 12, color: C.dan, fontSize: 12, fontWeight: 800 }}>
              {error}
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 16, background: "#FFFFFF" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 9, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{currentRead ? "AI Weather Read" : "Cached Forecast Read"}</div>
                <span style={{ padding: "3px 9px", borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {tone.label}
                </span>
              </div>
              {refreshIssueLabel ? (
                <div style={{ marginBottom: 8, fontSize: 12, color: C.warn, lineHeight: 1.45, fontWeight: 800 }}>
                  {refreshIssueLabel}. Showing the latest cached forecast until OpenWeather accepts new requests.
                </div>
              ) : null}
              <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.65, fontWeight: 650 }}>{getWeatherOperationalNote(weather)}</div>
            </div>
            <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 14, background: "#F8FAFC" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 9 }}>Source</div>
              <div style={{ display: "grid", gap: 6, fontSize: 12, color: C.textSec, fontWeight: 700, lineHeight: 1.45 }}>
                <span>{formatWeatherSource(weather)}</span>
                {freshnessLabel ? <span>{freshnessLabel}</span> : null}
                {limitations?.daily_forecast_horizon_days ? <span>Forecast horizon: {limitations.daily_forecast_horizon_days} days</span> : null}
                {limitations?.historical_coverage ? <span>{limitations.historical_coverage}</span> : null}
                {limitations?.future_note ? <span>{limitations.future_note}</span> : null}
              </div>
            </div>
          </div>
          {details.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10 }}>
              {details.map((metric) => <HomeWeatherMetric key={metric.label} metric={metric} />)}
            </div>
          ) : null}
          <WeatherHourlyGraph weather={weather} loading={loading} />
          <HomeWeatherDataFields fields={dataFields} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${C.borderLight}`, paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45, fontWeight: 700 }}>
              Weather is cached in Supabase so closed dates stay available after they enter the cache.
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 11px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: "#FFFFFF",
                color: C.text,
                cursor: loading ? "default" : "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 850,
                opacity: loading ? 0.55 : 1,
              }}
            >
              <span style={{ display: "flex" }}><I.RefreshCw /></span>
              Refresh Weather
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomePlatformHealthModal({ health, loading, onClose }) {
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

function buildHomeFallbackHealthFactors(health) {
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

function uniqueHomeHealthList(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function formatHomeHealthTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatHomeHealthAge(minutes) {
  if (minutes == null) return "Unknown";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatHomeHealthCadence(minutes) {
  if (!minutes) return "On demand";
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

function formatHomeHealthEta(minutes) {
  if (minutes == null) return "pending";
  if (minutes <= 1) return "in <1m";
  return `in ${minutes}m`;
}

function getHomeNextRun(job) {
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

function useHomeDashboardSnapshot(locationId, userRole) {
  const [snapshot, setSnapshot] = useState({
    metrics: null,
    liveSnapshot: null,
    workflowProgress: [],
    loading: true,
  });

  const loadSnapshot = useCallback(async () => {
    if (!locationId) {
      setSnapshot({ metrics: null, liveSnapshot: null, workflowProgress: [], loading: false });
      return;
    }

    const { data, error } = await supabase.rpc("dashboard_mobile_snapshot", {
      p_location_id: locationId,
      p_view_date: todayStr(),
      p_user_role: userRole || "employee",
    });

    if (error) {
      console.error("dashboard_mobile_snapshot failed:", error);
      setSnapshot((current) => ({ ...current, loading: false }));
      return;
    }

    const payload = data || {};
    setSnapshot({
      metrics: payload.metrics && Object.keys(payload.metrics).length > 0 ? payload.metrics : null,
      liveSnapshot: payload.liveSnapshot || null,
      workflowProgress: Array.isArray(payload.workflowProgress) ? payload.workflowProgress : [],
      loading: false,
    });
  }, [locationId, userRole]);

  useEffect(() => {
    loadSnapshot();
    const interval = setInterval(loadSnapshot, 10_000);
    return () => clearInterval(interval);
  }, [loadSnapshot]);

  return snapshot;
}

function StaffHome({
  nav,
  profile,
  roleCode,
  locationId,
  workflowProgress,
  healthButton,
  weatherCard,
  enrichmentEvents,
  enrichmentLoading,
  enrichmentWorkflow,
  enrichmentWorkflowLoading,
}) {
  const td = todayStr();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Team";
  const roleName = roleCode === "csr" ? "CSR" : "PCT";
  const [taskStats, setTaskStats] = useState({ total: 0, done: 0 });

  const loadTaskStats = useCallback(() => {
    const taskLocationId = profile?.location_id || locationId;
    if (!taskLocationId) return;
    Promise.all([
      supabase.from("role_page_config").select("task_id").eq("location_id", taskLocationId).eq("role", roleCode || "pct").eq("is_active", true),
      supabase.from("role_page_task_state").select("task_id, completed").eq("location_id", taskLocationId).eq("role", roleCode || "pct").eq("task_date", td),
    ]).then(([configRes, stateRes]) => {
      const total = configRes.data?.length || 0;
      const done = (stateRes.data || []).filter((row) => row.completed).length;
      setTaskStats({ total, done });
    });
  }, [locationId, profile?.location_id, roleCode, td]);

  useEffect(() => {
    loadTaskStats();
  }, [loadTaskStats]);

  useEffect(() => {
    const taskLocationId = profile?.location_id || locationId;
    if (!taskLocationId) return undefined;

    const channel = supabase
      .channel(`home-task-stats-${taskLocationId}-${roleCode || "pct"}-${td}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_page_task_state", filter: `location_id=eq.${taskLocationId}` },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (row?.role === (roleCode || "pct") && row?.task_date === td) {
            loadTaskStats();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_page_config", filter: `location_id=eq.${taskLocationId}` },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (String(row?.role || "").toLowerCase() === String(roleCode || "pct").toLowerCase()) {
            loadTaskStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTaskStats, locationId, profile?.location_id, roleCode, td]);

  const pct = taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <HomeHeader
        greeting={`${greeting}, ${name}`}
        subtitle={`${roleName} shift — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
        rightSlot={healthButton}
      />

      <div
        style={{
          padding: "20px 24px",
          borderRadius: 16,
          marginBottom: 24,
          background: `linear-gradient(135deg, ${C.pri}08, ${C.acc}12)`,
          border: `1.5px solid ${C.pri}20`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Today's Progress</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? C.suc : C.pri }}>
            {taskStats.done}/{taskStats.total} tasks
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: C.borderLight, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 5,
              background: pct === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <button
          onClick={() => nav("role-page")}
          style={{
            marginTop: 14,
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            background: C.pri,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = C.priL;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = C.pri;
          }}
        >
          {taskStats.done === 0 ? "Start My Shift" : pct === 100 ? "Review Completed Work" : "Continue My Work"} →
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <TodayEnrichmentCard
          events={enrichmentEvents}
          nav={nav}
          loading={enrichmentLoading}
          enrichmentWorkflow={enrichmentWorkflow}
          workflowLoading={enrichmentWorkflowLoading}
          dashboardPreview
        />
      </div>

      {weatherCard}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
        <QuickCard label="My Work" desc="View and complete today's tasks" icon="Clipboard" onClick={() => nav("role-page")} accent={C.pri} />
        <QuickCard label="Enrichments" desc="Daily event, SOP, and calendar" icon="Sparkle" onClick={() => nav("enrichments")} accent="#F97316" />
        <QuickCard label="Bathing" desc="Bath schedule and progress" icon="Droplet" onClick={() => nav("ops-bathing")} accent="#3B82F6" />
        <QuickCard label="Room Cleaning" desc="Room status and assignments" icon="Home" onClick={() => nav("ops-rooms")} accent="#8B5CF6" />
      </div>

      <WorkflowProgressPanel rows={workflowProgress} nav={nav} />
    </div>
  );
}

function ManagerHome({
  nav,
  profile,
  inventorySummary,
  locationId,
  snapshot,
  healthButton,
  weatherCard,
  enrichmentEvents,
  enrichmentLoading,
  enrichmentWorkflow,
  enrichmentWorkflowLoading,
}) {
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Manager";
  const live = snapshot.liveSnapshot || {};
  const metrics = snapshot.metrics || {};
  const arrivalsSubtext = formatBoardingDaycareSubtext({
    boarding: live.expected_boarding ?? live.arrivals_boarding ?? metrics.expected_boarding ?? metrics.arrivals_boarding,
    daycare: live.expected_daycare ?? live.arrivals_daycare ?? metrics.expected_daycare ?? metrics.arrivals_daycare,
    total: live.expected ?? metrics.dogs_expected,
    fallbackLabel: "expected today",
  });
  const departuresSubtext = formatBoardingDaycareSubtext({
    boarding: live.going_home_boarding ?? live.departures_boarding ?? metrics.going_home_boarding ?? metrics.departures_boarding,
    daycare: live.going_home_daycare ?? live.departures_daycare ?? metrics.going_home_daycare ?? metrics.departures_daycare,
    total: live.going_home ?? metrics.dogs_going_home,
    fallbackLabel: "going home today",
  });
  const roomsSubtext = formatRoomsOccupiedSubtext({
    occupied: live.rooms_occupied ?? metrics.accrual_rooms_occupied,
    total: live.total_rooms ?? live.total_room_count ?? metrics.total_room_count,
    occupancyPct: live.occupancy_pct ?? metrics.occupancy_pct,
  });

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        rightSlot={healthButton}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard
          label="In House"
          value={live.in_house ?? metrics.dogs_in_house ?? "—"}
          subtext={`${live.boarding ?? metrics.boarding_in_house ?? 0}B · ${live.daycare ?? metrics.daycare_in_house ?? 0}D`}
          color={C.pri}
          live={!!snapshot.liveSnapshot}
        />
        <MetricCard label="Arrivals" value={live.expected ?? metrics.dogs_expected ?? "—"} subtext={arrivalsSubtext} color="#3B82F6" live={!!snapshot.liveSnapshot} />
        <MetricCard label="Departures" value={live.going_home ?? metrics.dogs_going_home ?? "—"} subtext={departuresSubtext} color="#8B5CF6" live={!!snapshot.liveSnapshot} />
        <MetricCard
          label="Occupancy"
          value={`${live.occupancy_pct ?? metrics.occupancy_pct ?? 0}%`}
          subtext={roomsSubtext}
          color={C.warn}
          live={!!snapshot.liveSnapshot}
        />
      </div>

      <div style={{ marginBottom: 28 }}>
        <TodayEnrichmentCard
          events={enrichmentEvents}
          nav={nav}
          loading={enrichmentLoading}
          enrichmentWorkflow={enrichmentWorkflow}
          workflowLoading={enrichmentWorkflowLoading}
          dashboardPreview
        />
      </div>

      {weatherCard}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="My Work" desc="Your personal task list" icon="Clipboard" onClick={() => nav("role-page")} accent="#3B82F6" />
        <QuickCard label="Enrichments" desc="Calendar, SOP, and product prep" icon="Sparkle" onClick={() => nav("enrichments")} accent="#F97316" />
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Today's Notes" desc="Owner and dog notes from Gingr" icon="Clipboard" onClick={() => nav("checkout-notes")} accent="#0EA5E9" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Marketing" desc="Events, visits, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
        <QuickCard label="Calendar" desc="Aggregated schedule across the resort" icon="Calendar" onClick={() => nav("calendar")} accent="#6366F1" />
        <QuickCard label="CRM" desc="Booking and employment inquiries" icon="MessageSquare" onClick={() => nav("crm")} accent="#0891B2" />
        <QuickCard label="Marketing Directory" desc="Organizations and contacts" icon="Users" onClick={() => nav("marketing-directory")} accent="#DB2777" />
      </div>

      <WorkflowProgressPanel rows={snapshot.workflowProgress} nav={nav} />
    </div>
  );
}

function AdminHome({
  nav,
  profile,
  analyticsMode,
  inventorySummary,
  snapshot,
  healthButton,
  weatherCard,
  enrichmentEvents,
  enrichmentLoading,
  enrichmentWorkflow,
  enrichmentWorkflowLoading,
}) {
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Admin";
  const live = snapshot.liveSnapshot || {};
  const metrics = snapshot.metrics || {};
  const arrivalsSubtext = formatBoardingDaycareSubtext({
    boarding: live.expected_boarding ?? live.arrivals_boarding ?? metrics.expected_boarding ?? metrics.arrivals_boarding,
    daycare: live.expected_daycare ?? live.arrivals_daycare ?? metrics.expected_daycare ?? metrics.arrivals_daycare,
    total: live.expected ?? metrics.dogs_expected,
    fallbackLabel: "expected today",
  });
  const departuresSubtext = formatBoardingDaycareSubtext({
    boarding: live.going_home_boarding ?? live.departures_boarding ?? metrics.going_home_boarding ?? metrics.departures_boarding,
    daycare: live.going_home_daycare ?? live.departures_daycare ?? metrics.going_home_daycare ?? metrics.departures_daycare,
    total: live.going_home ?? metrics.dogs_going_home,
    fallbackLabel: "going home today",
  });
  const roomsSubtext = formatRoomsOccupiedSubtext({
    occupied: live.rooms_occupied ?? metrics.accrual_rooms_occupied,
    total: live.total_rooms ?? live.total_room_count ?? metrics.total_room_count,
    occupancyPct: live.occupancy_pct ?? metrics.occupancy_pct,
  });

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        rightSlot={healthButton}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard
          label="In House"
          value={live.in_house ?? metrics.dogs_in_house ?? "—"}
          subtext={`${live.boarding ?? metrics.boarding_in_house ?? 0}B · ${live.daycare ?? metrics.daycare_in_house ?? 0}D`}
          color={C.pri}
          live={!!snapshot.liveSnapshot}
        />
        <MetricCard label="Arrivals" value={live.expected ?? metrics.dogs_expected ?? "—"} subtext={arrivalsSubtext} color="#3B82F6" live={!!snapshot.liveSnapshot} />
        <MetricCard label="Departures" value={live.going_home ?? metrics.dogs_going_home ?? "—"} subtext={departuresSubtext} color="#8B5CF6" live={!!snapshot.liveSnapshot} />
        <MetricCard
          label="Occupancy"
          value={`${live.occupancy_pct ?? metrics.occupancy_pct ?? 0}%`}
          subtext={roomsSubtext}
          color={C.warn}
          live={!!snapshot.liveSnapshot}
        />
      </div>

      <div style={{ marginBottom: 28 }}>
        <TodayEnrichmentCard
          events={enrichmentEvents}
          nav={nav}
          loading={enrichmentLoading}
          enrichmentWorkflow={enrichmentWorkflow}
          workflowLoading={enrichmentWorkflowLoading}
          dashboardPreview
        />
      </div>

      {weatherCard}

      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: C.textMut,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 14,
        }}
      >
        Quick Access
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Enrichments" desc="Calendar, SOP, and product prep" icon="Sparkle" onClick={() => nav("enrichments")} accent="#F97316" />
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Today's Notes" desc="Owner and dog notes from Gingr" icon="Clipboard" onClick={() => nav("checkout-notes")} accent="#0EA5E9" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Marketing" desc="Events, visits, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
        <QuickCard label="Calendar" desc="Aggregated schedule across the resort" icon="Calendar" onClick={() => nav("calendar")} accent="#6366F1" />
        <QuickCard label="CRM" desc="Booking and employment inquiries" icon="MessageSquare" onClick={() => nav("crm")} accent="#0891B2" />
        <QuickCard label="Marketing Directory" desc="Organizations and contacts" icon="Users" onClick={() => nav("marketing-directory")} accent="#DB2777" />
        <QuickCard label="Resort Upkeep" desc="Cleaning and facility checklists" icon="ClipboardCheck" onClick={() => nav("resort-upkeep")} accent="#0D9488" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Photos" desc="Customer photo gallery" icon="Image" onClick={() => nav("photos")} accent="#EC4899" />
        <QuickCard label="Cash Tips" desc="Tip tracking" icon="DollarSign" onClick={() => nav("cash-tips")} accent="#F59E0B" />
        {analyticsMode ? (
          <QuickCard label="Customer Lifecycle" desc="Leads, active, lapsed clients" icon="Users" onClick={() => nav("lifecycle")} accent="#3B82F6" />
        ) : null}
      </div>

      <WorkflowProgressPanel rows={snapshot.workflowProgress} nav={nav} />
    </div>
  );
}

function HomePage({ nav, profile, analyticsMode, currentLocation }) {
  const roleCode = profile?.role;
  const tier = classifyRole(roleCode, profile?.role);
  const today = todayStr();
  const locationId = profile?.location_id || currentLocation;
  const snapshot = useHomeDashboardSnapshot(locationId, roleCode);
  const { events: enrichmentEvents, loading: enrichmentLoading } = useEnrichmentEvents(locationId, today);
  const enrichmentWorkflowState = useEnrichmentWorkflow(locationId, today, {
    actorName: profile?.full_name || profile?.name || "Staff",
    autoCompute: Boolean(locationId),
  });
  const { health: platformHealth, loading: platformHealthLoading } = usePlatformHealth(locationId, today);
  const [showPlatformHealth, setShowPlatformHealth] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const { showDashboardWeather } = useWeatherDisplaySettings(locationId || "cherry-hill");
  const {
    getWeatherForDate,
    loading: weatherLoading,
    error: weatherError,
    limitations: weatherLimitations,
    refresh: refreshWeather,
  } = useWeatherData(locationId || "cherry-hill", today, today, {
    enabled: showDashboardWeather && Boolean(locationId || "cherry-hill"),
  });
  const weather = getWeatherForDate(today);
  const [inventorySummary, setInventorySummary] = useState({
    desc: "Current cycle in progress",
    badge: { label: "On track", bg: C.priLt, color: C.pri },
  });

  useEffect(() => {
    let cancelled = false;

    async function loadInventorySummary() {
      if (!locationId) return;

      const { data: scheduleRow } = await supabase
        .from("lite_settings")
        .select("setting_value")
        .eq("location_id", locationId)
        .eq("setting_key", "inventory_schedule")
        .maybeSingle();

      if (cancelled) return;

      const schedule = normalizeInventorySchedule(scheduleRow?.setting_value || DEFAULT_INVENTORY_SCHEDULE, today);
      const cycleStart = getInventoryCycleStart(today, schedule);
      const { data: snapshotRow } = await supabase
        .from("inventory_snapshots")
        .select("status,completed_at")
        .eq("location_id", locationId)
        .eq("week_start", cycleStart)
        .maybeSingle();

      if (cancelled) return;

      const overdueInfo = getInventoryOverdueInfo(today, schedule, !!snapshotRow?.completed_at || snapshotRow?.status === "completed");
      setInventorySummary(buildInventoryQuickAccessState(snapshotRow, overdueInfo));
    }

    loadInventorySummary();
    return () => {
      cancelled = true;
    };
  }, [locationId, today]);

  const healthButton = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {showDashboardWeather ? (
        <HomeWeatherButton
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
          onClick={() => setShowWeather(true)}
        />
      ) : null}
      <HomePlatformHealthButton
        health={platformHealth}
        loading={platformHealthLoading}
        onClick={() => setShowPlatformHealth(true)}
      />
    </div>
  );
  const weatherCard = showDashboardWeather ? (
    <HomeWeatherCard
      weather={weather}
      loading={weatherLoading}
      error={weatherError}
      limitations={weatherLimitations}
      targetDate={today}
      onOpen={() => setShowWeather(true)}
    />
  ) : null;

  let content;
  if (tier === "staff") {
    content = (
      <StaffHome
        nav={nav}
        profile={profile}
        roleCode={roleCode}
        locationId={locationId}
        workflowProgress={snapshot.workflowProgress}
        healthButton={healthButton}
        weatherCard={weatherCard}
        enrichmentEvents={enrichmentEvents}
        enrichmentLoading={enrichmentLoading}
        enrichmentWorkflow={enrichmentWorkflowState.workflow}
        enrichmentWorkflowLoading={enrichmentWorkflowState.loading || enrichmentWorkflowState.refreshing}
      />
    );
  } else if (tier === "manager") {
    content = (
      <ManagerHome
        nav={nav}
        profile={profile}
        inventorySummary={inventorySummary}
        locationId={locationId}
        snapshot={snapshot}
        healthButton={healthButton}
        weatherCard={weatherCard}
        enrichmentEvents={enrichmentEvents}
        enrichmentLoading={enrichmentLoading}
        enrichmentWorkflow={enrichmentWorkflowState.workflow}
        enrichmentWorkflowLoading={enrichmentWorkflowState.loading || enrichmentWorkflowState.refreshing}
      />
    );
  } else {
    content = (
      <AdminHome
        nav={nav}
        profile={profile}
        analyticsMode={analyticsMode}
        inventorySummary={inventorySummary}
        snapshot={snapshot}
        healthButton={healthButton}
        weatherCard={weatherCard}
        enrichmentEvents={enrichmentEvents}
        enrichmentLoading={enrichmentLoading}
        enrichmentWorkflow={enrichmentWorkflowState.workflow}
        enrichmentWorkflowLoading={enrichmentWorkflowState.loading || enrichmentWorkflowState.refreshing}
      />
    );
  }

  return (
    <>
      {showPlatformHealth ? (
        <HomePlatformHealthModal
          health={platformHealth}
          loading={platformHealthLoading}
          onClose={() => setShowPlatformHealth(false)}
        />
      ) : null}
      {showDashboardWeather && showWeather ? (
        <HomeWeatherModal
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
          limitations={weatherLimitations}
          targetDate={today}
          onClose={() => setShowWeather(false)}
          onRefresh={refreshWeather}
        />
      ) : null}
      {content}
    </>
  );
}

export default HomePage;

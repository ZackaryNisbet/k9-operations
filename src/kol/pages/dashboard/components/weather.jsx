import React, { useEffect } from "react";
import { C } from "../../../../shared/theme";
import { I } from "../../../../shared/icons";
import WeatherHourlyGraph from "../../../../shared/WeatherHourlyGraph";
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
} from "../../../../shared/weather";

function DashboardWeatherIcon({ weather, size = 42 }) {
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

export function DashboardWeatherStatusButton({ weather, loading, error, onClick }) {
  const available = isWeatherAvailable(weather);
  const tone = getWeatherTone(weather);
  const label = loading
    ? "Weather Loading"
    : available
      ? `${formatTemperature(weather.current_temp_f || weather.high_temp_f)} · ${tone.label}`
      : error
        ? "Weather Error"
        : "Weather Pending";

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
        whiteSpace: "nowrap",
      }}
      title={error || formatWeatherSummary(weather)}
    >
      <DashboardWeatherIcon weather={weather} size={14} />
      {label}
    </button>
  );
}

export function DashboardWeatherStrip({ weather, loading, error, limitations, targetDate, onOpen }) {
  const available = isWeatherAvailable(weather);
  const tone = getWeatherTone(weather);
  const details = buildWeatherDetailMetrics(weather);
  const compactMetrics = details.slice(0, 4);
  const weatherDateLabel = formatWeatherDateLabel(weather, targetDate);
  const freshnessLabel = formatWeatherFreshnessLabel(weather, limitations);
  const brief = formatWeatherBrief(weather);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        margin: "0 14px 10px",
        flexShrink: 0,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: "linear-gradient(135deg, #FFFFFF 0%, #FFFFFF 52%, #F7FEE7 100%)",
        boxShadow: "0 4px 6px rgba(15,23,42,0.05)",
        cursor: "pointer",
        padding: 0,
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 300px)", alignItems: "center", gap: 14, minHeight: 112, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <DashboardWeatherIcon weather={weather} size={42} />
          <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.text }}>
                Weather for {weatherDateLabel}
              </span>
              <span style={{ padding: "2px 7px", borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 10, fontWeight: 850 }}>
                {loading ? "Loading" : tone.label}
              </span>
              {freshnessLabel && (
                <span style={{ fontSize: 10, color: C.textMut, fontWeight: 750 }}>{freshnessLabel}</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ fontSize: 28, lineHeight: 1, fontWeight: 950, color: available ? C.pri : C.textMut }}>
                {available ? formatTemperature(weather.current_temp_f || weather.high_temp_f) : "--"}
              </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: available ? C.text : C.textMut }}>
                {available ? formatTemperatureRange(weather) : "Weather not cached"}
              </span>
              <span style={{ fontSize: 12, fontWeight: 750, color: error ? C.dan : C.textSec, minWidth: 0, lineHeight: 1.45 }}>
                {error || brief}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              {(compactMetrics.length ? compactMetrics.slice(0, 3) : [
                { label: "Source", value: loading ? "Loading" : formatWeatherSource(weather) },
                { label: "High/Low", value: available ? formatTemperatureRange(weather) : "--" },
                { label: "Risk", value: tone.label },
              ]).map((metric) => (
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
                  <span style={{ fontSize: 11, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metric.value}</span>
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

export function DashboardWeatherModal({ weather, loading, error, limitations, onClose, onRefresh }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const available = isWeatherAvailable(weather);
  const tone = getWeatherTone(weather);
  const details = buildWeatherDetailMetrics(weather);
  const dataFields = buildWeatherDataFields(weather);
  const weatherDateLabel = formatWeatherDateLabel(weather, todayStr());
  const freshnessLabel = formatWeatherFreshnessLabel(weather, limitations);
  const refreshIssueLabel = getWeatherRefreshIssueLabel(limitations);
  const currentRead = isWeatherCurrentRead(weather);
  const brief = formatWeatherBrief(weather);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard weather details"
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
        maxHeight: "calc(100vh - 48px)",
        minHeight: 0,
        overflow: "hidden",
        borderRadius: 8,
        background: "#FFFFFF",
        border: `1px solid ${C.border}`,
        boxShadow: "0 20px 25px rgba(15,23,42,0.16)",
        animation: "healthModalIn 0.2s cubic-bezier(0.22,1,0.36,1) both",
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
            <DashboardWeatherIcon weather={weather} size={64} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1 }}>
                  Weather for {weatherDateLabel}
                </div>
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
                <span style={{ fontSize: 13, fontWeight: 750, color: C.textSec }}>
                  {brief}
                </span>
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
          {error && (
            <div style={{ border: `1px solid ${C.dan}`, borderRadius: 10, background: C.danLt, padding: 12, color: C.dan, fontSize: 12, fontWeight: 800 }}>
              {error}
            </div>
          )}

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
              <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.65, fontWeight: 650 }}>
                {getWeatherOperationalNote(weather)}
              </div>
            </div>
            <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 14, background: "#F8FAFC" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 9 }}>Source</div>
              <div style={{ display: "grid", gap: 6, fontSize: 12, color: C.textSec, fontWeight: 700, lineHeight: 1.45 }}>
                <span>{formatWeatherSource(weather)}</span>
                {freshnessLabel && <span>{freshnessLabel}</span>}
                {limitations?.daily_forecast_horizon_days && <span>Forecast horizon: {limitations.daily_forecast_horizon_days} days</span>}
                {limitations?.historical_coverage && <span>{limitations.historical_coverage}</span>}
                {limitations?.future_note && <span>{limitations.future_note}</span>}
              </div>
            </div>
          </div>

          {details.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10 }}>
              {details.map((metric) => (
                <DashboardWeatherMetric key={metric.label} metric={metric} />
              ))}
            </div>
          )}

          <WeatherHourlyGraph weather={weather} loading={loading} />
          <DashboardWeatherDataFields fields={dataFields} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${C.borderLight}`, paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45, fontWeight: 700 }}>
              Weather is cached in Supabase so old dates stay available after they enter the cache.
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

function DashboardWeatherMetric({ metric }) {
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
      <div style={{ fontSize: 18, color: caution ? C.warn : C.text, fontWeight: 950, lineHeight: 1 }}>
        {metric.value}
      </div>
    </div>
  );
}

function DashboardWeatherDataFields({ fields }) {
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

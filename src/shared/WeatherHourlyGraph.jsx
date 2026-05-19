import React, { useId, useMemo, useRef, useState } from "react";
import { C } from "./theme";
import {
  formatTemperature,
  getWeatherDisplayHourlyPoints,
  getWeatherMinutelyPoints,
  isWeatherAvailable,
} from "./weather";

const WIDTH = 1000;
const HEIGHT = 330;
const PLOT = { left: 48, right: 28, top: 38, bottom: 74 };
const COMPACT_PLOT = { left: 0, right: 0, top: 48, bottom: 44 };
const GRAPH_SURFACE = "#FFFFFF";
const GRAPH_PANEL = "#F8FAFC";
const GRAPH_INK = "#0F172A";
const TEMP_LINE = "#14532D";
const FEELS_LINE = "#84CC16";
const RAIN_BLUE = "#3B82F6";
const GRID = "#F1F5F9";
const AXIS = "#475569";
const DISPLAY_HOURS = 24;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumbers(values) {
  return values.filter((value) => Number.isFinite(Number(value))).map(Number);
}

function lerp(a, b, t) {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  return a + (b - a) * t;
}

function yScale(value, min, max, plot = PLOT) {
  if (!Number.isFinite(value)) return HEIGHT - plot.bottom;
  const span = max - min || 1;
  const pct = (value - min) / span;
  return (HEIGHT - plot.bottom) - pct * ((HEIGHT - plot.bottom) - plot.top);
}

function xScale(index, count, plot = PLOT) {
  if (count <= 1) return plot.left;
  return plot.left + (index / (count - 1)) * (WIDTH - plot.left - plot.right);
}

function tempValue(point) {
  return Number(point?.tempF);
}

function feelsValue(point) {
  const feels = Number(point?.feelsLikeF);
  return Number.isFinite(feels) ? feels : tempValue(point);
}

function buildPath(points, minTemp, maxTemp, valueAccessor = tempValue, plot = PLOT) {
  return points
    .map((point, index) => {
      const x = xScale(index, points.length, plot);
      const y = yScale(valueAccessor(point), minTemp, maxTemp, plot);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(points, minTemp, maxTemp, plot = PLOT) {
  if (!points.length) return "";
  const baseY = HEIGHT - plot.bottom;
  const line = buildPath(points, minTemp, maxTemp, tempValue, plot);
  const lastX = xScale(points.length - 1, points.length, plot);
  return `${line} L ${lastX.toFixed(2)} ${baseY} L ${plot.left} ${baseY} Z`;
}

function formatHourLabel(point) {
  if (!point?.iso) return point?.label || "";
  const dt = new Date(point.iso);
  if (Number.isNaN(dt.getTime())) return point.label || "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatSelectedTime(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDayLabel(pointOrIso) {
  const iso = typeof pointOrIso === "string" ? pointOrIso : pointOrIso?.iso;
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isSameCalendarDay(a, b) {
  if (!a || !b) return true;
  const aDate = new Date(a);
  const bDate = new Date(b);
  if (Number.isNaN(aDate.getTime()) || Number.isNaN(bDate.getTime())) return true;
  return aDate.toDateString() === bDate.toDateString();
}

function formatAxisLabel(point, index, points) {
  if (index === 0) return "Now";
  const hour = formatHourLabel(point).replace(":00", "");
  if (!points[0]?.iso || isSameCalendarDay(point?.iso, points[0]?.iso)) return hour;
  const dt = new Date(point.iso);
  const day = Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${hour}`;
}

function getTickIndexes(count) {
  if (count <= 6) return Array.from({ length: count }, (_, index) => index);
  return [0, 6, 12, 18, count - 1].filter((index, position, values) => index < count && values.indexOf(index) === position);
}

function interpolateAt(points, plotX, minTemp, maxTemp, plot = PLOT) {
  if (!points.length) return null;
  const minX = plot.left;
  const maxX = WIDTH - plot.right;
  const selectedX = clamp(plotX, minX, maxX);
  const pct = clamp((selectedX - minX) / (maxX - minX), 0, 1);
  const rawIndex = pct * (points.length - 1);
  const leftIndex = Math.floor(rawIndex);
  const rightIndex = Math.min(points.length - 1, leftIndex + 1);
  const fraction = rawIndex - leftIndex;
  const left = points[leftIndex];
  const right = points[rightIndex];
  const tempF = lerp(tempValue(left), tempValue(right), fraction);
  const feelsLikeF = lerp(feelsValue(left), feelsValue(right), fraction);
  const selectedY = yScale(tempF, minTemp, maxTemp, plot);
  const leftTime = new Date(left.iso || 0).getTime();
  const rightTime = new Date(right.iso || left.iso || 0).getTime();
  const isoMs = lerp(leftTime, rightTime, fraction);
  const closer = fraction < 0.5 ? left : right;
  const iso = Number.isFinite(isoMs) ? new Date(isoMs).toISOString() : closer.iso;

  return {
    x: selectedX,
    y: selectedY,
    pct,
    iso,
    label: formatSelectedTime(iso) || formatHourLabel(closer),
    dayLabel: formatDayLabel(iso || closer.iso),
    description: closer.description,
    iconUrl: closer.iconUrl,
    tempF,
    feelsLikeF,
    rainPct: lerp(Number(left.rainPct), Number(right.rainPct), fraction),
    windMph: lerp(Number(left.windMph), Number(right.windMph), fraction),
    gustMph: lerp(Number(left.gustMph), Number(right.gustMph), fraction),
    humidityPct: lerp(Number(left.humidityPct), Number(right.humidityPct), fraction),
    cloudCoverPct: lerp(Number(left.cloudCoverPct), Number(right.cloudCoverPct), fraction),
    uvIndex: lerp(Number(left.uvIndex), Number(right.uvIndex), fraction),
  };
}

function valueLabel(value, suffix = "", digits = 0) {
  if (!Number.isFinite(Number(value))) return "No data";
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function WeatherLegendSwatch({ type, color }) {
  if (type === "bar") {
    return <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: "inline-block", opacity: 0.82 }} />;
  }
  return (
    <span
      style={{
        width: 18,
        height: 0,
        borderTop: type === "dash" ? `2px dashed ${color}` : `2px solid ${color}`,
        display: "inline-block",
      }}
    />
  );
}

export default function WeatherHourlyGraph({ weather, loading = false, compact = false }) {
  const svgRef = useRef(null);
  const reactId = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);
  const plot = compact ? COMPACT_PLOT : PLOT;
  const points = useMemo(() => getWeatherDisplayHourlyPoints(weather, DISPLAY_HOURS), [weather]);
  const minutely = useMemo(() => getWeatherMinutelyPoints(weather), [weather]);
  const derivedMode = points.length > 1 && points.every((point) => point.derived);
  const temps = finiteNumbers(points.flatMap((point) => [tempValue(point), feelsValue(point)]));
  const minTemp = temps.length ? Math.floor(Math.min(...temps) - 4) : 0;
  const maxTemp = temps.length ? Math.ceil(Math.max(...temps) + 4) : 100;
  const path = useMemo(() => buildPath(points, minTemp, maxTemp, tempValue, plot), [points, minTemp, maxTemp, plot]);
  const feelsPath = useMemo(() => buildPath(points, minTemp, maxTemp, feelsValue, plot), [points, minTemp, maxTemp, plot]);
  const areaPath = useMemo(() => buildAreaPath(points, minTemp, maxTemp, plot), [points, minTemp, maxTemp, plot]);
  const selected = hover || interpolateAt(points, plot.left, minTemp, maxTemp, plot);
  const maxRain = Math.max(10, ...finiteNumbers(points.map((point) => point.rainPct)));
  const hasData = isWeatherAvailable(weather) && points.length > 1;
  const tickIndexes = getTickIndexes(points.length);
  const tempFillId = `weatherTempFill${reactId}`;
  const rainFillId = `weatherRainFill${reactId}`;

  function handlePointerMove(event) {
    if (!svgRef.current || points.length < 2) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const relativeX = clamp(event.clientX - bounds.left, 0, bounds.width);
    const svgX = (relativeX / bounds.width) * WIDTH;
    setHover(interpolateAt(points, svgX, minTemp, maxTemp, plot));
  }

  function handlePointerLeave() {
    setHover(null);
  }

  if (loading && !points.length) {
    return (
      <div style={{
        borderRadius: 8,
        border: `1px solid ${C.borderLight}`,
        background: GRAPH_PANEL,
        minHeight: compact ? 76 : 248,
        display: "grid",
        placeItems: "center",
        color: C.textMut,
        fontSize: 12,
        fontWeight: 850,
      }}>
        Loading hourly weather
      </div>
    );
  }

  if (!hasData) {
    return (
      <div style={{
        borderRadius: 8,
        border: `1px solid ${C.borderLight}`,
        background: GRAPH_PANEL,
        minHeight: compact ? 76 : 248,
        display: "grid",
        alignContent: "center",
        justifyItems: "center",
        gap: 6,
        color: C.textMut,
        fontSize: 12,
        fontWeight: 850,
        textAlign: "center",
        padding: 18,
      }}>
        <span style={{ color: C.text, fontWeight: 950 }}>Weather graph unavailable</span>
        <span>No cached temperature fields are available for this date.</span>
      </div>
    );
  }

  const selectedLeft = selected?.x || plot.left;
  const selectedLabel = selected?.label || "";
  const selectedDay = selected?.dayLabel || "";
  const selectedXLabel = Math.min(Math.max(selectedLeft, 98), WIDTH - 130);
  const rainPoints = points.filter((point) => Number(point.rainPct) > 0);
  const cardMetrics = [
    { label: "Temp", value: formatTemperature(selected?.tempF) },
    { label: "Feels", value: formatTemperature(selected?.feelsLikeF) },
    { label: "Rain chance", value: valueLabel(selected?.rainPct, "%") },
    { label: "Wind", value: valueLabel(selected?.windMph, " mph") },
    { label: "Humidity", value: valueLabel(selected?.humidityPct, "%") },
  ];

  return (
    <div
      data-weather-graph
      data-weather-hour-count={points.length}
      data-weather-graph-mode={derivedMode ? "daily-curve" : "hourly"}
      style={{
        borderRadius: 8,
        border: `1px solid ${C.borderLight}`,
        background: GRAPH_SURFACE,
        overflow: "hidden",
        cursor: "crosshair",
        userSelect: "none",
        touchAction: "none",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      {!compact && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "14px 16px 2px", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {derivedMode ? "Cached 24-hour curve" : "Next 24 hours"}
            </div>
            <div style={{ fontSize: 18, color: GRAPH_INK, fontWeight: 950, marginTop: 3 }}>
              {selectedDay} {selectedLabel}
            </div>
            {selected?.description ? (
              <div style={{ marginTop: 4, fontSize: 12, color: C.textSec, fontWeight: 750, lineHeight: 1.35 }}>
                {selected.description}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            {[
              { label: "Temp", type: "line", color: TEMP_LINE },
              { label: "Feels like", type: "dash", color: FEELS_LINE },
              { label: "Rain chance", type: "bar", color: RAIN_BLUE },
            ].map((item) => (
              <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: C.textMut, fontWeight: 850 }}>
                <WeatherLegendSwatch type={item.type} color={item.color} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Interactive next 24 hour weather graph"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: compact ? 78 : 270 }}
      >
        <defs>
          <linearGradient id={tempFillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#14532D" stopOpacity="0.18" />
            <stop offset="78%" stopColor="#14532D" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#14532D" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={rainFillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={RAIN_BLUE} stopOpacity="0.62" />
            <stop offset="100%" stopColor={RAIN_BLUE} stopOpacity="0.18" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill={GRAPH_SURFACE} />

        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = plot.top + tick * (HEIGHT - plot.top - plot.bottom);
          const temp = maxTemp - tick * (maxTemp - minTemp);
          return (
            <g key={tick}>
              <line x1={plot.left} x2={WIDTH - plot.right} y1={y} y2={y} stroke={GRID} strokeWidth="1" opacity={compact ? 0.48 : 1} />
              {!compact && (
                <text x={plot.left - 14} y={y + 4} textAnchor="end" fontSize="18" fontWeight="800" fill={AXIS}>
                  {Math.round(temp)}°
                </text>
              )}
            </g>
          );
        })}

        {rainPoints.map((point) => {
          const index = points.indexOf(point);
          const barX = xScale(index, points.length, plot);
          const barWidth = Math.max(5, (WIDTH - plot.left - plot.right) / points.length - 6);
          const pct = Number.isFinite(point.rainPct) ? point.rainPct : 0;
          const barHeight = Math.max(2, (pct / maxRain) * 46);
          return (
            <rect
              key={`${point.iso}-rain`}
              x={barX - barWidth / 2}
              y={HEIGHT - plot.bottom - barHeight}
              width={barWidth}
              height={barHeight}
              rx="3"
              fill={`url(#${rainFillId})`}
            />
          );
        })}

        <path d={areaPath} fill={`url(#${tempFillId})`} />
        <path d={feelsPath} fill="none" stroke={FEELS_LINE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 9" opacity="0.82" />
        <path d={path} fill="none" stroke={TEMP_LINE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />

        {!compact && tickIndexes.map((index) => {
          const point = points[index];
          return (
            <text key={`${point.iso}-label`} x={xScale(index, points.length, plot)} y={HEIGHT - 28} textAnchor="middle" fontSize="18" fontWeight="850" fill={AXIS}>
              {formatAxisLabel(point, index, points)}
            </text>
          );
        })}

        {selected && (
          <g>
            <line data-weather-crosshair x1={selectedLeft} x2={selectedLeft} y1={plot.top - 8} y2={HEIGHT - plot.bottom + (compact ? 12 : 60)} stroke="#1E293B" strokeWidth={compact ? "2" : "1.5"} strokeDasharray="6 8" opacity="0.72" />
            <circle cx={selectedLeft} cy={selected.y} r="8" fill={GRAPH_SURFACE} stroke={TEMP_LINE} strokeWidth="4" />
            <g transform={`translate(${selectedXLabel - 96} 10)`}>
              <rect width="192" height="58" rx="8" fill="#0F172A" opacity="0.94" />
              <text x="14" y="22" fontSize="16" fontWeight="900" fill="#FFFFFF">{selectedLabel}</text>
              <text x="14" y="44" fontSize="20" fontWeight="950" fill="#D9F99D">{formatTemperature(selected.tempF)}</text>
              <text x="72" y="44" fontSize="14" fontWeight="850" fill="#E2E8F0">{formatTemperature(selected.feelsLikeF)} feels</text>
              <text x="143" y="44" fontSize="14" fontWeight="850" fill="#BFDBFE">{valueLabel(selected.rainPct, "%")}</text>
            </g>
          </g>
        )}

        {compact && selected ? <title>{formatTemperature(selected.tempF)} at {selectedLabel}</title> : null}
      </svg>

      {!compact && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, padding: "0 16px 16px" }}>
          {cardMetrics.map((metric) => (
            <div key={metric.label} style={{ borderRadius: 8, border: `1px solid ${C.borderLight}`, background: GRAPH_PANEL, padding: "8px 9px" }}>
              <div style={{ fontSize: 9, color: C.textMut, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>{metric.label}</div>
              <div style={{ fontSize: 15, color: C.text, fontWeight: 950, marginTop: 2 }}>{metric.value}</div>
            </div>
          ))}
          <div style={{ borderRadius: 8, border: `1px solid ${C.borderLight}`, background: GRAPH_PANEL, padding: "8px 9px" }}>
            <div style={{ fontSize: 9, color: C.textMut, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>Minute Rain</div>
            <div style={{ fontSize: 15, color: C.text, fontWeight: 950, marginTop: 2 }}>{minutely.length ? `${minutely.length} pts` : "None"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useMemo, useRef, useState } from "react";
import { C } from "./theme";
import {
  formatTemperature,
  getWeatherHourlyPoints,
  getWeatherMinutelyPoints,
  isWeatherAvailable,
} from "./weather";

const WIDTH = 1000;
const HEIGHT = 330;
const PLOT = { left: 46, right: 22, top: 34, bottom: 72 };
const GRAPH_SURFACE = "oklch(99% 0.006 152)";
const GRAPH_INK = "oklch(20% 0.035 250)";
const TEMP_LINE = "oklch(62% 0.16 42)";
const RAIN_BLUE = "oklch(58% 0.16 244)";
const HUMID_GREEN = "oklch(56% 0.12 154)";

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

function yScale(value, min, max) {
  if (!Number.isFinite(value)) return HEIGHT - PLOT.bottom;
  const span = max - min || 1;
  const pct = (value - min) / span;
  return (HEIGHT - PLOT.bottom) - pct * ((HEIGHT - PLOT.bottom) - PLOT.top);
}

function xScale(index, count) {
  if (count <= 1) return PLOT.left;
  return PLOT.left + (index / (count - 1)) * (WIDTH - PLOT.left - PLOT.right);
}

function buildPath(points, minTemp, maxTemp) {
  return points
    .map((point, index) => {
      const x = xScale(index, points.length);
      const y = yScale(point.tempF, minTemp, maxTemp);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(points, minTemp, maxTemp) {
  if (!points.length) return "";
  const baseY = HEIGHT - PLOT.bottom;
  const line = buildPath(points, minTemp, maxTemp);
  const lastX = xScale(points.length - 1, points.length);
  return `${line} L ${lastX.toFixed(2)} ${baseY} L ${PLOT.left} ${baseY} Z`;
}

function formatHourLabel(point) {
  if (!point?.iso) return point?.label || "";
  const dt = new Date(point.iso);
  if (Number.isNaN(dt.getTime())) return point.label || "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDayLabel(point) {
  if (!point?.iso) return "";
  const dt = new Date(point.iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function interpolateAt(points, plotX, minTemp, maxTemp) {
  if (!points.length) return null;
  const minX = PLOT.left;
  const maxX = WIDTH - PLOT.right;
  const pct = clamp((plotX - minX) / (maxX - minX), 0, 1);
  const rawIndex = pct * (points.length - 1);
  const leftIndex = Math.floor(rawIndex);
  const rightIndex = Math.min(points.length - 1, leftIndex + 1);
  const fraction = rawIndex - leftIndex;
  const left = points[leftIndex];
  const right = points[rightIndex];
  const tempF = lerp(left.tempF, right.tempF, fraction);
  const selectedY = yScale(tempF, minTemp, maxTemp);
  const isoMs = lerp(new Date(left.iso || 0).getTime(), new Date(right.iso || left.iso || 0).getTime(), fraction);
  return {
    x: plotX,
    y: selectedY,
    pct,
    leftIndex,
    rightIndex,
    fraction,
    iso: Number.isFinite(isoMs) ? new Date(isoMs).toISOString() : left.iso,
    label: fraction < 0.5 ? formatHourLabel(left) : formatHourLabel(right),
    dayLabel: fraction < 0.5 ? formatDayLabel(left) : formatDayLabel(right),
    description: fraction < 0.5 ? left.description : right.description,
    iconUrl: fraction < 0.5 ? left.iconUrl : right.iconUrl,
    tempF,
    feelsLikeF: lerp(left.feelsLikeF, right.feelsLikeF, fraction),
    rainPct: lerp(left.rainPct, right.rainPct, fraction),
    windMph: lerp(left.windMph, right.windMph, fraction),
    gustMph: lerp(left.gustMph, right.gustMph, fraction),
    humidityPct: lerp(left.humidityPct, right.humidityPct, fraction),
    cloudCoverPct: lerp(left.cloudCoverPct, right.cloudCoverPct, fraction),
    uvIndex: lerp(left.uvIndex, right.uvIndex, fraction),
  };
}

function valueLabel(value, suffix = "", digits = 0) {
  if (!Number.isFinite(Number(value))) return "No data";
  return `${Number(value).toFixed(digits)}${suffix}`;
}

export default function WeatherHourlyGraph({ weather, loading = false, compact = false }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const points = useMemo(() => getWeatherHourlyPoints(weather), [weather]);
  const minutely = useMemo(() => getWeatherMinutelyPoints(weather), [weather]);
  const temps = finiteNumbers(points.map((point) => point.tempF));
  const minTemp = temps.length ? Math.floor(Math.min(...temps) - 4) : 0;
  const maxTemp = temps.length ? Math.ceil(Math.max(...temps) + 4) : 100;
  const path = useMemo(() => buildPath(points, minTemp, maxTemp), [points, minTemp, maxTemp]);
  const areaPath = useMemo(() => buildAreaPath(points, minTemp, maxTemp), [points, minTemp, maxTemp]);
  const selected = hover || interpolateAt(points, PLOT.left, minTemp, maxTemp);
  const maxRain = Math.max(10, ...finiteNumbers(points.map((point) => point.rainPct)));
  const hasData = isWeatherAvailable(weather) && points.length > 1;

  function handlePointerMove(event) {
    if (!wrapRef.current || points.length < 2) return;
    const bounds = wrapRef.current.getBoundingClientRect();
    const relativeX = clamp(event.clientX - bounds.left, 0, bounds.width);
    const svgX = (relativeX / bounds.width) * WIDTH;
    setHover(interpolateAt(points, clamp(svgX, PLOT.left, WIDTH - PLOT.right), minTemp, maxTemp));
  }

  function handlePointerLeave() {
    setHover(null);
  }

  if (loading && !points.length) {
    return (
      <div style={{
        borderRadius: 12,
        border: `1px solid ${C.borderLight}`,
        background: GRAPH_SURFACE,
        minHeight: compact ? 132 : 248,
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
        borderRadius: 12,
        border: `1px solid ${C.borderLight}`,
        background: GRAPH_SURFACE,
        minHeight: compact ? 132 : 248,
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
        <span style={{ color: C.text, fontWeight: 950 }}>Hourly graph pending</span>
        <span>OpenWeather hourly points appear after the current forecast cache refreshes.</span>
      </div>
    );
  }

  const selectedLeft = selected?.x || PLOT.left;
  const selectedLabel = selected?.label || "";
  const selectedDay = selected?.dayLabel || "";
  const selectedXLabel = Math.min(Math.max(selectedLeft, 94), WIDTH - 116);
  const cardMetrics = [
    { label: "Temp", value: formatTemperature(selected?.tempF) },
    { label: "Feels", value: formatTemperature(selected?.feelsLikeF) },
    { label: "Rain", value: valueLabel(selected?.rainPct, "%") },
    { label: "Wind", value: valueLabel(selected?.windMph, " mph") },
    { label: "Humidity", value: valueLabel(selected?.humidityPct, "%") },
  ];

  return (
    <div
      ref={wrapRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        borderRadius: 12,
        border: `1px solid ${C.borderLight}`,
        background: `linear-gradient(180deg, ${GRAPH_SURFACE}, oklch(96.5% 0.018 232))`,
        overflow: "hidden",
        cursor: "crosshair",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {!compact && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "14px 16px 2px", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Hour-by-hour forecast
            </div>
            <div style={{ fontSize: 18, color: GRAPH_INK, fontWeight: 950, marginTop: 3 }}>
              {selectedDay} {selectedLabel}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {cardMetrics.slice(0, 4).map((metric) => (
              <div key={metric.label} style={{ minWidth: 72, borderRadius: 8, border: "1px solid oklch(88% 0.018 232)", background: "oklch(99% 0.004 152 / 0.82)", padding: "7px 8px" }}>
                <div style={{ fontSize: 9, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>{metric.label}</div>
                <div style={{ fontSize: 15, color: C.text, fontWeight: 950, marginTop: 2 }}>{metric.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Interactive hourly weather graph" style={{ display: "block", width: "100%", height: compact ? 148 : 270 }}>
        <defs>
          <linearGradient id="weatherTempFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(72% 0.18 48 / 0.35)" />
            <stop offset="72%" stopColor="oklch(72% 0.18 48 / 0.07)" />
            <stop offset="100%" stopColor="oklch(72% 0.18 48 / 0)" />
          </linearGradient>
          <linearGradient id="weatherRainFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(72% 0.14 240 / 0.58)" />
            <stop offset="100%" stopColor="oklch(72% 0.14 240 / 0.12)" />
          </linearGradient>
          <filter id="weatherLineGlow" x="-20%" y="-80%" width="140%" height="260%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.96 0 0.48 0 0 0.3 0 0 0.18 0 0.05 0 0 0 0.36 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = PLOT.top + tick * (HEIGHT - PLOT.top - PLOT.bottom);
          const temp = maxTemp - tick * (maxTemp - minTemp);
          return (
            <g key={tick}>
              <line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y} y2={y} stroke="oklch(88% 0.014 232)" strokeWidth="1" />
              <text x={PLOT.left - 14} y={y + 4} textAnchor="end" fontSize="20" fontWeight="800" fill="oklch(45% 0.035 250)">
                {Math.round(temp)}°
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const barX = xScale(index, points.length);
          const barWidth = Math.max(5, (WIDTH - PLOT.left - PLOT.right) / points.length - 5);
          const pct = Number.isFinite(point.rainPct) ? point.rainPct : 0;
          const barHeight = (pct / maxRain) * 54;
          return (
            <rect
              key={`${point.iso}-rain`}
              x={barX - barWidth / 2}
              y={HEIGHT - PLOT.bottom - barHeight + 54}
              width={barWidth}
              height={barHeight}
              rx="3"
              fill="url(#weatherRainFill)"
              opacity={pct > 0 ? 1 : 0.16}
            />
          );
        })}

        <path d={areaPath} fill="url(#weatherTempFill)" />
        <path d={path} fill="none" stroke={TEMP_LINE} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#weatherLineGlow)" />
        <path
          d={points.map((point, index) => {
            const x = xScale(index, points.length);
            const y = yScale(point.humidityPct, 0, 100);
            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
          }).join(" ")}
          fill="none"
          stroke={HUMID_GREEN}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="5 8"
          opacity="0.58"
        />

        {points.map((point, index) => index % 6 === 0 ? (
          <text key={`${point.iso}-label`} x={xScale(index, points.length)} y={HEIGHT - 26} textAnchor="middle" fontSize="20" fontWeight="850" fill="oklch(42% 0.035 250)">
            {formatHourLabel(point).replace(":00", "")}
          </text>
        ) : null)}

        {selected && (
          <g>
            <line x1={selectedLeft} x2={selectedLeft} y1={PLOT.top - 8} y2={HEIGHT - PLOT.bottom + 62} stroke="oklch(22% 0.05 250)" strokeWidth="2" strokeDasharray="7 8" opacity="0.72" />
            <circle cx={selectedLeft} cy={selected.y} r="9" fill={GRAPH_SURFACE} stroke={TEMP_LINE} strokeWidth="5" />
            <g transform={`translate(${selectedXLabel - 83} 10)`}>
              <rect width="166" height="56" rx="10" fill="oklch(18% 0.04 250 / 0.92)" />
              <text x="16" y="23" fontSize="18" fontWeight="900" fill="oklch(98% 0.005 152)">{selectedLabel}</text>
              <text x="16" y="43" fontSize="20" fontWeight="950" fill="oklch(86% 0.16 78)">{formatTemperature(selected.tempF)}</text>
              <text x="72" y="43" fontSize="15" fontWeight="850" fill="oklch(90% 0.035 232)">{valueLabel(selected.rainPct, "%")} rain</text>
            </g>
          </g>
        )}

        {compact && selected && (
          <text x={PLOT.left} y="30" fontSize="22" fontWeight="950" fill={GRAPH_INK}>
            {formatTemperature(selected.tempF)} at {selectedLabel}
          </text>
        )}
      </svg>

      {!compact && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, padding: "0 16px 16px" }}>
          {cardMetrics.map((metric) => (
            <div key={metric.label} style={{ borderRadius: 8, border: "1px solid oklch(88% 0.018 232)", background: "oklch(99% 0.004 152 / 0.8)", padding: "8px 9px" }}>
              <div style={{ fontSize: 9, color: C.textMut, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>{metric.label}</div>
              <div style={{ fontSize: 15, color: C.text, fontWeight: 950, marginTop: 2 }}>{metric.value}</div>
            </div>
          ))}
          <div style={{ borderRadius: 8, border: "1px solid oklch(88% 0.018 232)", background: "oklch(99% 0.004 152 / 0.8)", padding: "8px 9px" }}>
            <div style={{ fontSize: 9, color: C.textMut, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>Minute Rain</div>
            <div style={{ fontSize: 15, color: C.text, fontWeight: 950, marginTop: 2 }}>{minutely.length ? `${minutely.length} pts` : "None"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

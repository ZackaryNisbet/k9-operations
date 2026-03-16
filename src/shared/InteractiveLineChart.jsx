// K9 Operations — Interactive Line Chart

import React, { useState, useRef, useMemo, useCallback, memo } from "react";
import { C, CHART_PTS } from "./theme";

const _chartFmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
const _chartFmt$k = (v) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : _chartFmt$(v);

// ── Revenue Intelligence: Animated Line Chart (module-level for animation persistence) ──
const InteractiveLineChart = React.memo(({
  chartData, color = "#14532D", compareColor = "#84CC16", showCompare, height = 240,
  id = "chart", animationEpoch, dateLabels,
  // New redesign props
  useRawPoints = false,   // true = use actual data points (no interpolation to CHART_PTS)
  lineType = "spline",    // "linear" | "spline"
  solidFill = false,      // true = opaque solid fill, false = gradient (legacy)
  fillColor,              // override fill color (defaults to `color`)
  fillOpacity = 0.18,     // opacity for solid fill
  showGuideLines = false, // subtle vertical lines from x-axis to data points
  guideLineColor = "#D1D5DB",
  showDots = false,       // always-visible dot markers
  dotRadius = 5,
}) => {
  const svgRef = React.useRef(null);
  const [display, setDisplay] = React.useState(null);
  const [hover, setHover] = React.useState(null);

  // Number of rendered points: raw data length or CHART_PTS
  const n = useRawPoints && chartData && chartData.length > 1 ? chartData.length : CHART_PTS;

  const normalize = (raw, accessor, pts) => {
    if (!raw || raw.length === 0) return Array(pts).fill(0);
    const vals = raw.map(accessor);
    if (vals.length === 1) return Array(pts).fill(vals[0]);
    if (useRawPoints) return vals; // no interpolation — use values directly
    return Array.from({ length: pts }, (_, i) => {
      const t = i / (pts - 1) * (vals.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(lo + 1, vals.length - 1);
      return vals[lo] + (vals[hi] - vals[lo]) * (t - lo);
    });
  };

  const targetMain = React.useMemo(() => normalize(chartData, d => d.value, n), [chartData, n]);
  const targetComp = React.useMemo(() => normalize(chartData, d => d.prevValue || 0, n), [chartData, n]);
  const targetMax = React.useMemo(() => Math.max(...targetMain, ...(showCompare ? targetComp : [0]), 1), [targetMain, targetComp, showCompare]);

  React.useEffect(() => {
    const prev = display || { main: Array(n).fill(0), comp: Array(n).fill(0), max: targetMax };
    // Pad/trim prev arrays to match current n
    const padArr = (arr, len) => {
      if (arr.length === len) return arr;
      if (arr.length > len) return arr.slice(0, len);
      return [...arr, ...Array(len - arr.length).fill(0)];
    };
    const prevMain = padArr(prev.main, n);
    const prevComp = padArr(prev.comp, n);
    let start;
    const dur = 600;
    const animate = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay({
        main: targetMain.map((v, i) => (prevMain[i] || 0) + (v - (prevMain[i] || 0)) * ease),
        comp: targetComp.map((v, i) => (prevComp[i] || 0) + (v - (prevComp[i] || 0)) * ease),
        max: prev.max + (targetMax - prev.max) * ease,
      });
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [targetMain, targetComp, targetMax, animationEpoch]);

  const mainVals = display ? display.main : targetMain;
  const cmpVals = display ? display.comp : targetComp;
  const curMax = display ? display.max : targetMax;

  if (!chartData || chartData.length === 0) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#8B95A5", fontSize: 12 }}>No data for this period</div>
  );

  const pad = { top: 20, right: 16, bottom: 28, left: 50 };
  const w = 500, h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const x = (i) => pad.left + (i / (n - 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / (curMax || 1)) * plotH;

  const buildPath = (vals) => {
    if (lineType === "linear") {
      let d = `M ${x(0)} ${y(vals[0])}`;
      for (let i = 1; i < n; i++) d += ` L ${x(i)} ${y(vals[i])}`;
      return d;
    }
    // spline (cubic bezier — legacy behavior)
    let d = `M ${x(0)} ${y(vals[0])}`;
    for (let i = 0; i < n - 1; i++) {
      const cx1 = x(i) + (x(i + 1) - x(i)) / 3;
      const cx2 = x(i + 1) - (x(i + 1) - x(i)) / 3;
      d += ` C ${cx1} ${y(vals[i])}, ${cx2} ${y(vals[i + 1])}, ${x(i + 1)} ${y(vals[i + 1])}`;
    }
    return d;
  };

  const gridLines = 4;
  const hoverIdx = hover !== null ? hover : null;
  // For raw points mode, the hover index maps 1:1 to chartData
  const hoverData = hoverIdx !== null && chartData.length > 0
    ? (useRawPoints
        ? chartData[Math.min(hoverIdx, chartData.length - 1)]
        : chartData[Math.min(Math.round(hoverIdx / (n - 1) * (chartData.length - 1)), chartData.length - 1)])
    : null;

  const actualFill = fillColor || color;

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = (e.clientX - rect.left) / rect.width * w;
          const idx = Math.round((mx - pad.left) / plotW * (n - 1));
          if (idx >= 0 && idx < n) setHover(idx);
        }}
        onMouseLeave={() => setHover(null)}>
        {/* Horizontal grid lines */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const val = (curMax / gridLines) * i;
          const yPos = y(val);
          return (
            <g key={i}>
              <line x1={pad.left} y1={yPos} x2={w - pad.right} y2={yPos} stroke="#E5E7EB" strokeWidth="0.5" />
              <text x={pad.left - 6} y={yPos + 3} textAnchor="end" fill="#8B95A5" fontSize="9" fontFamily="'Outfit', sans-serif">{_chartFmt$k(val)}</text>
            </g>
          );
        })}
        {/* Subtle vertical guide lines from x-axis to data point */}
        {showGuideLines && mainVals.map((v, i) => (
          <line key={`guide-${i}`} x1={x(i)} y1={h - pad.bottom} x2={x(i)} y2={y(v)} stroke={guideLineColor} strokeWidth="0.7" strokeDasharray="3 2" opacity="0.5" />
        ))}
        {/* Fill area */}
        {solidFill ? (
          <path d={`${buildPath(mainVals)} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={actualFill} opacity={fillOpacity} />
        ) : (
          <>
            <defs>
              <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${buildPath(mainVals)} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={`url(#${id}-grad)`} />
          </>
        )}
        {/* Main line */}
        <path d={buildPath(mainVals)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Compare line */}
        {showCompare && <path d={buildPath(cmpVals)} fill="none" stroke={compareColor} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" opacity="0.6" />}
        {/* Always-visible dot markers */}
        {showDots && mainVals.map((v, i) => (
          <circle key={`dot-${i}`} cx={x(i)} cy={y(v)} r={dotRadius} fill="white" stroke={color} strokeWidth="2" />
        ))}
        {/* Hover indicator */}
        {hoverIdx !== null && (
          <g>
            <line x1={x(hoverIdx)} y1={pad.top} x2={x(hoverIdx)} y2={h - pad.bottom} stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
            <circle cx={x(hoverIdx)} cy={y(mainVals[hoverIdx])} r={showDots ? dotRadius + 1.5 : 4} fill="white" stroke={color} strokeWidth="2.5" />
            {showCompare && <circle cx={x(hoverIdx)} cy={y(cmpVals[hoverIdx])} r="3" fill="white" stroke={compareColor} strokeWidth="1.5" />}
          </g>
        )}
        {/* X-axis date labels */}
        {dateLabels && dateLabels.length > 0 && (() => {
          const total = dateLabels.length;
          // When using raw points, show all labels if ≤ 14, otherwise step
          const step = useRawPoints
            ? (total <= 14 ? 1 : total <= 30 ? 2 : total <= 60 ? 7 : total <= 180 ? 14 : 30)
            : (total <= 7 ? 1 : total <= 14 ? 2 : total <= 30 ? 3 : total <= 60 ? 7 : total <= 180 ? 14 : 30);
          const indices = [];
          for (let i = 0; i < total; i += step) indices.push(i);
          return indices.map(i => {
            // Position labels based on rendered points (n), not dateLabels length
            const xPos = useRawPoints
              ? x(i)
              : pad.left + (i / (total - 1 || 1)) * plotW;
            const dt = new Date(dateLabels[i] + "T00:00:00");
            const lbl = `${dt.getMonth() + 1}/${dt.getDate()}`;
            return (
              <text key={i} x={xPos} y={h - pad.bottom + 14} textAnchor="middle" fill="#8B95A5" fontSize="8" fontFamily="'Outfit', sans-serif">{lbl}</text>
            );
          });
        })()}
      </svg>
      {hoverData && hoverIdx !== null && (
        <div style={{
          position: "absolute", top: 4, right: 4, background: "white", border: "1px solid #E5E7EB", borderRadius: 8,
          padding: "6px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", fontSize: 11, pointerEvents: "none", zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, color: "#1A2233", marginBottom: 2 }}>{hoverData.label}</div>
          <div style={{ color, fontWeight: 600 }}>{_chartFmt$(hoverData.value)}</div>
          {showCompare && hoverData.prevValue !== undefined && <div style={{ color: compareColor, fontSize: 10 }}>Prev: {_chartFmt$(hoverData.prevValue)}</div>}
        </div>
      )}
    </div>
  );
});

// ─── Operations Constants ──────────────────────────────────────────────────

export default InteractiveLineChart;

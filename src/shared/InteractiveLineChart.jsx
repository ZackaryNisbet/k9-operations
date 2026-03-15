// K9 Operations — Interactive Line Chart

import React, { useState, useRef, useMemo, useCallback, memo } from "react";
import { C, CHART_PTS } from "./theme";

const _chartFmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
const _chartFmt$k = (v) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : _chartFmt$(v);

// ── Revenue Intelligence: Animated Line Chart (module-level for animation persistence) ──
const InteractiveLineChart = React.memo(({ chartData, color = "#14532D", compareColor = "#84CC16", showCompare, height = 240, id = "chart", animationEpoch, dateLabels }) => {
  const svgRef = React.useRef(null);
  const [display, setDisplay] = React.useState(null);
  const [hover, setHover] = React.useState(null);

  const normalize = (raw, accessor) => {
    if (!raw || raw.length === 0) return Array(CHART_PTS).fill(0);
    const vals = raw.map(accessor);
    if (vals.length === 1) return Array(CHART_PTS).fill(vals[0]);
    return Array.from({ length: CHART_PTS }, (_, i) => {
      const t = i / (CHART_PTS - 1) * (vals.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(lo + 1, vals.length - 1);
      return vals[lo] + (vals[hi] - vals[lo]) * (t - lo);
    });
  };

  const targetMain = React.useMemo(() => normalize(chartData, d => d.value), [chartData]);
  const targetComp = React.useMemo(() => normalize(chartData, d => d.prevValue || 0), [chartData]);
  const targetMax = React.useMemo(() => Math.max(...targetMain, ...(showCompare ? targetComp : [0]), 1), [targetMain, targetComp, showCompare]);

  React.useEffect(() => {
    const prev = display || { main: Array(CHART_PTS).fill(0), comp: Array(CHART_PTS).fill(0), max: targetMax };
    let start;
    const dur = 600;
    const animate = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay({
        main: targetMain.map((v, i) => prev.main[i] + (v - prev.main[i]) * ease),
        comp: targetComp.map((v, i) => (prev.comp[i] || 0) + (v - (prev.comp[i] || 0)) * ease),
        max: prev.max + (targetMax - prev.max) * ease,
      });
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [targetMain, targetComp, targetMax, animationEpoch]);

  const mainVals = display ? display.main : targetMain;
  const cmpVals = display ? display.comp : targetComp;
  const curMax = display ? display.max : targetMax;
  const n = CHART_PTS;

  if (!chartData || chartData.length === 0) return (
    <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#8B95A5", fontSize: 12 }}>No data for this period</div>
  );

  const pad = { top: 20, right: 16, bottom: 28, left: 50 };
  const w = 500, h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const x = (i) => pad.left + (i / (n - 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / (curMax || 1)) * plotH;

  const spline = (vals) => {
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
  const hoverData = hoverIdx !== null && chartData.length > 0 ? chartData[Math.min(Math.round(hoverIdx / (n - 1) * (chartData.length - 1)), chartData.length - 1)] : null;

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
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${spline(mainVals)} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={`url(#${id}-grad)`} />
        <path d={spline(mainVals)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {showCompare && <path d={spline(cmpVals)} fill="none" stroke={compareColor} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" opacity="0.6" />}
        {hoverIdx !== null && (
          <g>
            <line x1={x(hoverIdx)} y1={pad.top} x2={x(hoverIdx)} y2={h - pad.bottom} stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
            <circle cx={x(hoverIdx)} cy={y(mainVals[hoverIdx])} r="4" fill="white" stroke={color} strokeWidth="2" />
            {showCompare && <circle cx={x(hoverIdx)} cy={y(cmpVals[hoverIdx])} r="3" fill="white" stroke={compareColor} strokeWidth="1.5" />}
          </g>
        )}
        {dateLabels && dateLabels.length > 0 && (() => {
          const total = dateLabels.length;
          const step = total <= 7 ? 1 : total <= 14 ? 2 : total <= 30 ? 3 : total <= 60 ? 7 : total <= 180 ? 14 : 30;
          const indices = [];
          for (let i = 0; i < total; i += step) indices.push(i);
          return indices.map(i => {
            const xPos = pad.left + (i / (total - 1 || 1)) * plotW;
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

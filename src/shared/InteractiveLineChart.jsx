// K9 Operations — Interactive Line Chart

import React, { useState, useRef, useMemo, useCallback, memo } from "react";
import { C, CHART_PTS } from "./theme";

const _chartFmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
const _chartFmt$k = (v) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : _chartFmt$(v);

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  dotRadius = 2,
  // L1: Today highlight — last point connected by dotted line with value badge
  todayHighlight = false,
  // L4: Prior period data and display
  priorData,              // array of { date, label, value } for prior period
  showPriorLine = false,  // whether to render the prior period line
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

  // L4: Prior period values mapped to same x-axis positions
  const targetPrior = React.useMemo(() => {
    if (!priorData || priorData.length === 0) return Array(n).fill(0);
    return normalize(priorData, d => d.value, n);
  }, [priorData, n]);

  const targetMax = React.useMemo(() => {
    const priorVals = showPriorLine ? targetPrior : [0];
    return Math.max(...targetMain, ...(showCompare ? targetComp : [0]), ...priorVals, 1);
  }, [targetMain, targetComp, targetPrior, showCompare, showPriorLine]);

  React.useEffect(() => {
    const prev = display || { main: Array(n).fill(0), comp: Array(n).fill(0), prior: Array(n).fill(0), max: targetMax };
    // Pad/trim prev arrays to match current n
    const padArr = (arr, len) => {
      if (arr.length === len) return arr;
      if (arr.length > len) return arr.slice(0, len);
      return [...arr, ...Array(len - arr.length).fill(0)];
    };
    const prevMain = padArr(prev.main, n);
    const prevComp = padArr(prev.comp, n);
    const prevPrior = padArr(prev.prior || Array(n).fill(0), n);
    let start;
    const dur = 600;
    const animate = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay({
        main: targetMain.map((v, i) => (prevMain[i] || 0) + (v - (prevMain[i] || 0)) * ease),
        comp: targetComp.map((v, i) => (prevComp[i] || 0) + (v - (prevComp[i] || 0)) * ease),
        prior: targetPrior.map((v, i) => (prevPrior[i] || 0) + (v - (prevPrior[i] || 0)) * ease),
        max: prev.max + (targetMax - prev.max) * ease,
      });
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [targetMain, targetComp, targetPrior, targetMax, animationEpoch]);

  const mainVals = display ? display.main : targetMain;
  const cmpVals = display ? display.comp : targetComp;
  const priorVals = display ? (display.prior || targetPrior) : targetPrior;
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

  // L1: Build path for all points except the last (for todayHighlight mode)
  const buildPath = (vals, endIdx) => {
    const end = endIdx !== undefined ? endIdx : vals.length;
    if (end <= 0) return "";
    if (lineType === "linear") {
      let d = `M ${x(0)} ${y(vals[0])}`;
      for (let i = 1; i < end; i++) d += ` L ${x(i)} ${y(vals[i])}`;
      return d;
    }
    // spline (cubic bezier — legacy behavior)
    let d = `M ${x(0)} ${y(vals[0])}`;
    for (let i = 0; i < end - 1; i++) {
      const cx1 = x(i) + (x(i + 1) - x(i)) / 3;
      const cx2 = x(i + 1) - (x(i + 1) - x(i)) / 3;
      d += ` C ${cx1} ${y(vals[i])}, ${cx2} ${y(vals[i + 1])}, ${x(i + 1)} ${y(vals[i + 1])}`;
    }
    return d;
  };

  // Full path (all points)
  const buildFullPath = (vals) => buildPath(vals, vals.length);

  const gridLines = 4;
  const hoverIdx = hover !== null ? hover : null;
  // For raw points mode, the hover index maps 1:1 to chartData
  const hoverData = hoverIdx !== null && chartData.length > 0
    ? (useRawPoints
        ? chartData[Math.min(hoverIdx, chartData.length - 1)]
        : chartData[Math.min(Math.round(hoverIdx / (n - 1) * (chartData.length - 1)), chartData.length - 1)])
    : null;

  // Prior period hover data
  const hoverPriorValue = hoverIdx !== null && priorData && priorData.length > 0
    ? (useRawPoints
        ? (priorData[Math.min(hoverIdx, priorData.length - 1)]?.value || 0)
        : (priorData[Math.min(Math.round(hoverIdx / (n - 1) * (priorData.length - 1)), priorData.length - 1)]?.value || 0))
    : null;

  const actualFill = fillColor || color;

  // L1: todayHighlight — split the main line into solid (all but last) and dotted (last segment)
  const lastIdx = n - 1;
  const solidEndIdx = todayHighlight ? n - 1 : n; // for solid main line
  const mainSolidPath = todayHighlight ? buildPath(mainVals, n - 1) : buildFullPath(mainVals);
  const mainDottedPath = todayHighlight && n >= 2
    ? `M ${x(n - 2)} ${y(mainVals[n - 2])} L ${x(n - 1)} ${y(mainVals[n - 1])}`
    : null;

  // L1: Fill path — covers all points including today
  const fillPath = `${buildFullPath(mainVals)} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  // Today's value label for badge
  const todayValue = todayHighlight && chartData.length > 0 ? chartData[chartData.length - 1].value : null;

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
          <path d={fillPath} fill={actualFill} opacity={fillOpacity} />
        ) : (
          <>
            <defs>
              <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={fillPath} fill={`url(#${id}-grad)`} />
          </>
        )}
        {/* Main line — solid portion */}
        <path d={mainSolidPath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* L1: Dotted segment from yesterday to today */}
        {todayHighlight && mainDottedPath && (
          <path d={mainDottedPath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
        )}
        {/* L4: Prior period comparison line — dashed, 40% opacity */}
        {showPriorLine && priorVals.length > 0 && (
          <path d={buildFullPath(priorVals)} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="6 4" strokeLinecap="round" opacity="0.4" />
        )}
        {/* Compare line (legacy) */}
        {showCompare && <path d={buildFullPath(cmpVals)} fill="none" stroke={compareColor} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" opacity="0.6" />}
        {/* L3: Always-visible dots — small & semi-transparent (radius 2) */}
        {showDots && mainVals.map((v, i) => (
          <circle key={`dot-${i}`} cx={x(i)} cy={y(v)} r={dotRadius} fill="white" stroke={color} strokeWidth="1.5" opacity="0.5" />
        ))}
        {/* L1: Today highlight dot — always visible, with badge */}
        {todayHighlight && n >= 1 && (
          <g>
            {/* Pulsing ring */}
            <circle cx={x(lastIdx)} cy={y(mainVals[lastIdx])} r="7" fill="none" stroke={color} strokeWidth="1" opacity="0.3">
              <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
            </circle>
            {/* Solid today dot */}
            <circle cx={x(lastIdx)} cy={y(mainVals[lastIdx])} r="4" fill="white" stroke={color} strokeWidth="2.5" />
            {/* Value badge */}
            {todayValue !== null && (() => {
              const label = _chartFmt$k(todayValue);
              const bx = x(lastIdx);
              const by = y(mainVals[lastIdx]) - 14;
              const bw = label.length * 6.5 + 12;
              return (
                <g>
                  <rect x={bx - bw / 2} y={by - 9} width={bw} height={18} rx="4" fill={color} />
                  <text x={bx} y={by + 3} textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="'Outfit', sans-serif">{label}</text>
                </g>
              );
            })()}
          </g>
        )}
        {/* Hover indicator */}
        {hoverIdx !== null && (
          <g>
            <line x1={x(hoverIdx)} y1={pad.top} x2={x(hoverIdx)} y2={h - pad.bottom} stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
            {/* L3: Hover dot on main line */}
            <circle cx={x(hoverIdx)} cy={y(mainVals[hoverIdx])} r={4} fill="white" stroke={color} strokeWidth="2.5" />
            {/* Hover dot on prior line */}
            {showPriorLine && <circle cx={x(hoverIdx)} cy={y(priorVals[hoverIdx])} r="3" fill="white" stroke={color} strokeWidth="1.5" opacity="0.6" />}
            {showCompare && <circle cx={x(hoverIdx)} cy={y(cmpVals[hoverIdx])} r="3" fill="white" stroke={compareColor} strokeWidth="1.5" />}
          </g>
        )}
        {/* L2: X-axis date labels with day-of-week */}
        {dateLabels && dateLabels.length > 0 && (() => {
          const total = dateLabels.length;
          // When using raw points, show all labels if ≤ 10, otherwise step
          const step = useRawPoints
            ? (total <= 10 ? 1 : total <= 14 ? 2 : total <= 30 ? 3 : total <= 60 ? 7 : total <= 180 ? 14 : 30)
            : (total <= 7 ? 1 : total <= 14 ? 2 : total <= 30 ? 3 : total <= 60 ? 7 : total <= 180 ? 14 : 30);
          const indices = [];
          for (let i = 0; i < total; i += step) indices.push(i);
          return indices.map(i => {
            // Position labels based on rendered points (n), not dateLabels length
            const xPos = useRawPoints
              ? x(i)
              : pad.left + (i / (total - 1 || 1)) * plotW;
            const dt = new Date(dateLabels[i] + "T00:00:00");
            // L2: Show day abbreviation for shorter timeframes (≤ 14 points)
            const dayAbbr = total <= 14 ? DAY_ABBR[dt.getDay()] + " " : "";
            const lbl = `${dayAbbr}${dt.getMonth() + 1}/${dt.getDate()}`;
            return (
              <text key={i} x={xPos} y={h - pad.bottom + 14} textAnchor="middle" fill="#8B95A5" fontSize="8" fontFamily="'Outfit', sans-serif">{lbl}</text>
            );
          });
        })()}
        {/* L4: Legend when prior period is shown */}
        {showPriorLine && (
          <g>
            <line x1={w - pad.right - 100} y1={pad.top - 6} x2={w - pad.right - 82} y2={pad.top - 6} stroke={color} strokeWidth="2" />
            <text x={w - pad.right - 78} y={pad.top - 3} fill="#8B95A5" fontSize="8" fontFamily="'Outfit', sans-serif">Current</text>
            <line x1={w - pad.right - 48} y1={pad.top - 6} x2={w - pad.right - 30} y2={pad.top - 6} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
            <text x={w - pad.right - 26} y={pad.top - 3} fill="#8B95A5" fontSize="8" fontFamily="'Outfit', sans-serif">Prior</text>
          </g>
        )}
      </svg>
      {hoverData && hoverIdx !== null && (
        <div style={{
          position: "absolute", top: 4, right: 4, background: "white", border: "1px solid #E5E7EB", borderRadius: 8,
          padding: "6px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", fontSize: 11, pointerEvents: "none", zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, color: "#1A2233", marginBottom: 2 }}>{hoverData.label}</div>
          <div style={{ color, fontWeight: 600 }}>{_chartFmt$(hoverData.value)}</div>
          {showPriorLine && hoverPriorValue !== null && <div style={{ color, fontSize: 10, opacity: 0.5 }}>Prior: {_chartFmt$(hoverPriorValue)}</div>}
          {showCompare && hoverData.prevValue !== undefined && <div style={{ color: compareColor, fontSize: 10 }}>Prev: {_chartFmt$(hoverData.prevValue)}</div>}
        </div>
      )}
    </div>
  );
});

// ─── Operations Constants ──────────────────────────────────────────────────

export default InteractiveLineChart;

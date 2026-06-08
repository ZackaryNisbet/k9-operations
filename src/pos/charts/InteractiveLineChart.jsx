import React, { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../constants/colors";
import { CHART_PTS, _chartFmt$, _chartFmt$k } from "../lib/chartFmt";

const InteractiveLineChart = ({ chartData, color = C.pri, compareColor = C.acc, showCompare, height = 240, id = "chart", animationEpoch = 0 }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [display, setDisplay] = useState(null);
  const liveRef = useRef(null);
  const rafRef = useRef(null);

  const normalize = (raw, accessor) => {
    if (!raw || raw.length === 0) return Array(CHART_PTS).fill(0);
    const vals = raw.map(accessor);
    if (vals.length === 1) return Array(CHART_PTS).fill(vals[0]);
    return Array.from({ length: CHART_PTS }, (_, i) => {
      const t = i / (CHART_PTS - 1) * (vals.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(lo + 1, vals.length - 1);
      const frac = t - lo;
      return vals[lo] + (vals[hi] - vals[lo]) * frac;
    });
  };

  const targetMain = useMemo(() => normalize(chartData, d => d.value), [chartData]);
  const targetComp = useMemo(() => normalize(chartData, d => d.prevValue || 0), [chartData]);
  const targetMax = useMemo(() => Math.max(...targetMain, ...(showCompare ? targetComp : []), 1), [targetMain, targetComp, showCompare]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!liveRef.current) {
      liveRef.current = { main: [...targetMain], comp: [...targetComp], max: targetMax };
      setDisplay({ main: [...targetMain], comp: [...targetComp], max: targetMax });
      return;
    }
    const fM = [...liveRef.current.main];
    const fC = [...liveRef.current.comp];
    const fMax = liveRef.current.max;
    const dur = 750; // 750ms — best-practice for data visualization morphs (Material Design / Apple HIG sweet spot)
    let startTs = null;
    const tick = (ts) => {
      if (!startTs) startTs = ts;
      const t = Math.min((ts - startTs) / dur, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const newMain = targetMain.map((v, i) => fM[i] + (v - fM[i]) * ease);
      const newComp = targetComp.map((v, i) => fC[i] + (v - fC[i]) * ease);
      const newMax = fMax + (targetMax - fMax) * ease;
      liveRef.current = { main: newMain, comp: newComp, max: newMax };
      setDisplay({ main: newMain, comp: newComp, max: newMax });
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [targetMain, targetComp, targetMax, animationEpoch]);

  const vals = display ? display.main : targetMain;
  const cmpVals = display ? display.comp : targetComp;
  const curMax = display ? display.max : targetMax;
  const n = CHART_PTS;

  if (!chartData || chartData.length === 0) return (
    React.createElement("div", { style: { height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13 } }, "No data for this period")
  );

  const W = 560, H = height;
  const pad = { top: 16, right: 16, bottom: 32, left: 50 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const yTicks = 4;
  const xS = (i) => pad.left + (i / (n - 1)) * cw;
  const yS = (v) => pad.top + ch - (v / curMax) * ch;

  const buildSpline = (arr) => {
    if (arr.length < 2) return `M${xS(0).toFixed(1)},${yS(arr[0] || 0).toFixed(1)}`;
    let d = `M${xS(0).toFixed(1)},${yS(arr[0]).toFixed(1)}`;
    for (let i = 0; i < arr.length - 1; i++) {
      const x0 = xS(i), y0 = yS(arr[i]);
      const x1 = xS(i + 1), y1 = yS(arr[i + 1]);
      const cpx = (x1 - x0) * 0.35;
      d += ` C${(x0 + cpx).toFixed(1)},${y0.toFixed(1)} ${(x1 - cpx).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  };
  const buildSplineArea = (arr) => buildSpline(arr) + ` L${xS(n - 1).toFixed(1)},${(pad.top + ch).toFixed(1)} L${pad.left},${(pad.top + ch).toFixed(1)} Z`;

  const mainPath = buildSpline(vals);
  const mainArea = buildSplineArea(vals);
  const compPath = showCompare ? buildSpline(cmpVals) : "";
  const compArea = showCompare ? buildSplineArea(cmpVals) : "";

  const srcStep = chartData.length / n;
  const getLabel = (i) => { const si = Math.min(Math.floor(i * srcStep), chartData.length - 1); return chartData[si]; };
  const xLabelStep = Math.max(1, Math.ceil(n / 6));
  const tooltipLeftPct = (i) => ((xS(i) / W) * 100);

  return (
    React.createElement("div", { style: { position: "relative", width: "100%" } },
      React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, preserveAspectRatio: "xMidYMid meet", style: { display: "block", fontFamily: "'Outfit', sans-serif" } },
        React.createElement("defs", null,
          React.createElement("linearGradient", { id: `${id}-grad`, x1: "0", x2: "0", y1: "0", y2: "1" },
            React.createElement("stop", { offset: "0%", stopColor: color, stopOpacity: "0.15" }),
            React.createElement("stop", { offset: "100%", stopColor: color, stopOpacity: "0.01" })
          ),
          showCompare && React.createElement("linearGradient", { id: `${id}-comp-grad`, x1: "0", x2: "0", y1: "0", y2: "1" },
            React.createElement("stop", { offset: "0%", stopColor: compareColor, stopOpacity: "0.08" }),
            React.createElement("stop", { offset: "100%", stopColor: compareColor, stopOpacity: "0.01" })
          )
        ),
        Array.from({ length: yTicks + 1 }).map((_, i) => {
          const ratio = i / yTicks;
          const y = pad.top + ch - ratio * ch;
          return React.createElement("g", { key: `grid-${i}` },
            React.createElement("line", { x1: pad.left, x2: W - pad.right, y1: y, y2: y, stroke: C.borderLight, strokeWidth: "0.7" }),
            React.createElement("text", { x: pad.left - 6, y: y + 3.5, textAnchor: "end", fontSize: "9", fill: C.textMut }, _chartFmt$k(curMax * ratio))
          );
        }),
        Array.from({ length: n }).map((_, i) => {
          if (i % xLabelStep !== 0 || i >= n) return null;
          const src = getLabel(i);
          return React.createElement("text", { key: `xl-${i}`, x: xS(i), y: H - 6, textAnchor: "middle", fontSize: "9", fill: C.textMut }, src?.label || "");
        }),
        showCompare && React.createElement(React.Fragment, null,
          React.createElement("path", { d: compArea, fill: `url(#${id}-comp-grad)` }),
          React.createElement("path", { d: compPath, stroke: compareColor, strokeWidth: "1.5", strokeDasharray: "5,3", fill: "none", opacity: "0.55" })
        ),
        React.createElement("path", { d: mainArea, fill: `url(#${id}-grad)` }),
        React.createElement("path", { d: mainPath, stroke: color, strokeWidth: "2.2", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
        vals.map((v, i) => {
          const show = hoverIdx === i || i === 0 || i === n - 1;
          if (!show) return null;
          return React.createElement("circle", { key: `dot-${i}`, cx: xS(i), cy: yS(v), r: hoverIdx === i ? 4.5 : 2, fill: hoverIdx === i ? color : "white", stroke: color, strokeWidth: "1.5" });
        }),
        hoverIdx !== null && React.createElement("g", null,
          React.createElement("line", { x1: xS(hoverIdx), x2: xS(hoverIdx), y1: pad.top, y2: pad.top + ch, stroke: color, strokeWidth: "0.8", strokeDasharray: "3,2", opacity: "0.5" }),
          React.createElement("line", { x1: pad.left, x2: W - pad.right, y1: yS(vals[hoverIdx]), y2: yS(vals[hoverIdx]), stroke: color, strokeWidth: "0.5", opacity: "0.2" })
        ),
        vals.map((_, i) => React.createElement("rect", { key: `hc-${i}`, x: xS(i) - cw / n / 2, y: pad.top, width: cw / n, height: ch, fill: "transparent", style: { cursor: "crosshair" }, onMouseEnter: () => setHoverIdx(i), onMouseLeave: () => setHoverIdx(null) }))
      ),
      hoverIdx !== null && (() => {
        const src = getLabel(hoverIdx);
        const pctLeft = tooltipLeftPct(hoverIdx);
        return React.createElement("div", { style: { position: "absolute", left: `${Math.min(pctLeft + 2, 75)}%`, top: 8, background: C.text, color: "white", padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, pointerEvents: "none", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", minWidth: 100, whiteSpace: "nowrap" } },
          React.createElement("div", { style: { fontSize: 9, opacity: 0.7, marginBottom: 3 } }, `${src?.label} · ${src?.date}`),
          React.createElement("div", { style: { fontSize: 15 } }, _chartFmt$(vals[hoverIdx])),
          showCompare && React.createElement("div", { style: { marginTop: 3, fontSize: 10, color: compareColor, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 3 } }, `Prev: ${_chartFmt$(cmpVals[hoverIdx])}`)
        );
      })()
    )
  );
};

export { InteractiveLineChart };

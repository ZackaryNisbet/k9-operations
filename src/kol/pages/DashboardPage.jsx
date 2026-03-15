// K9 Operations — Command Center Dashboard v4
// 9×11 Grid, viewport-locked, world-class data density.
// Forest green depth, link indicators, maximum visual sophistication.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import {
  C, todayStr, addDays, fmtDate, fmtDateShort,
} from "../../shared/theme";
import { I } from "../../shared/icons";
import { Tip } from "../../shared/ui";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import SkeletonShimmer from "../../shared/SkeletonShimmer";
import { getCachedData, setCachedData } from "../../shared/dashboardCache";
import { useLazyCompute, useSectionVisibility } from "../../hooks/useLazyCompute";
import {
  computeOccupancyMetrics, computeServiceMetrics, computeLifecycleMetrics,
  computeRefundMetrics, computeCashRevenueMetrics, computeAccrualRevenueMetrics,
  computeDiscountBreakdown, computeOpsProgress,
} from "../../shared/metricsHelpers";

/* ═══════════════════════════════════════════════════════════════════════════
   CSS — injected once
   ═══════════════════════════════════════════════════════════════════════════ */
const DASH_CSS = `
@keyframes dashSlideIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dashFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes dashCountUp {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dashBarGrow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes dashPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(20,83,45,0.15); }
  50%      { box-shadow: 0 0 0 4px rgba(20,83,45,0); }
}
@keyframes calFadeIn {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* ── Cell styles ── */
.dash-grid-cell {
  background: #FFFFFF;
  border-radius: 8px;
  border: 1px solid rgba(20,83,45,0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  overflow: hidden;
  transition: all 0.15s ease;
  cursor: default;
  min-width: 0;
  min-height: 0;
  box-shadow: 0 1px 3px rgba(20,83,45,0.06), 0 1px 2px rgba(20,83,45,0.04);
}
.dash-grid-cell:hover {
  box-shadow: 0 3px 12px rgba(20,83,45,0.10), 0 1px 3px rgba(20,83,45,0.06);
  transform: translateY(-1px);
}
.dash-grid-cell.clickable {
  cursor: pointer;
}
.dash-grid-cell.clickable:hover {
  border-color: rgba(20,83,45,0.2);
  box-shadow: 0 4px 16px rgba(20,83,45,0.12), 0 1px 4px rgba(20,83,45,0.06);
}
.dash-grid-cell.hero-cell {
  background: linear-gradient(135deg, #14532D 0%, #166534 100%);
  border: 1px solid rgba(132,204,22,0.15);
  box-shadow: 0 2px 8px rgba(20,83,45,0.20), 0 1px 3px rgba(20,83,45,0.10);
}
.dash-grid-cell.hero-cell:hover {
  box-shadow: 0 4px 20px rgba(20,83,45,0.25), 0 2px 6px rgba(20,83,45,0.12);
  transform: translateY(-1px);
}
.dash-grid-cell.empty-cell {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}
.dash-grid-cell.empty-cell:hover {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  transform: none !important;
}
.dash-section-label {
  font-size: 9px;
  font-weight: 800;
  color: ${C.pri};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  line-height: 1;
  white-space: nowrap;
  padding: 0 2px;
  opacity: 0.6;
}
.dash-cell-value {
  font-size: 22px;
  font-weight: 800;
  color: ${C.text};
  line-height: 1;
  font-variant-numeric: tabular-nums lining-nums;
  white-space: nowrap;
}
.dash-cell-label {
  font-size: 9px;
  font-weight: 600;
  color: ${C.textMut};
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  margin-top: 3px;
}
.dash-pill-track {
  position: relative;
  display: inline-flex;
  gap: 0;
  background: ${C.bg};
  border-radius: 6px;
  padding: 2px;
  border: 1px solid rgba(20,83,45,0.1);
}
.dash-pill-btn {
  position: relative;
  z-index: 1;
  padding: 3px 8px;
  border: none;
  background: transparent;
  color: ${C.textMut};
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  border-radius: 4px;
  transition: color 0.15s;
  white-space: nowrap;
}
.dash-pill-btn.active {
  color: #fff;
}
.dash-pill-slider {
  position: absolute;
  top: 2px;
  height: calc(100% - 4px);
  background: ${C.pri};
  border-radius: 4px;
  transition: left 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 0;
}
.dash-chart-cell {
  background: #FFFFFF;
  border-radius: 8px;
  border: 1px solid rgba(20,83,45,0.08);
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  overflow: hidden;
  transition: all 0.15s ease;
  min-width: 0;
  min-height: 0;
  box-shadow: 0 1px 3px rgba(20,83,45,0.06), 0 1px 2px rgba(20,83,45,0.04);
}
.dash-chart-cell:hover {
  box-shadow: 0 3px 12px rgba(20,83,45,0.10), 0 1px 3px rgba(20,83,45,0.06);
}
.dash-checklist-cell {
  background: #FFFFFF;
  border-radius: 8px;
  border: 1px solid rgba(20,83,45,0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  overflow: hidden;
  transition: all 0.15s ease;
  cursor: pointer;
  min-width: 0;
  min-height: 0;
  box-shadow: 0 1px 3px rgba(20,83,45,0.06), 0 1px 2px rgba(20,83,45,0.04);
}
.dash-checklist-cell:hover {
  border-color: rgba(20,83,45,0.2);
  box-shadow: 0 4px 16px rgba(20,83,45,0.12), 0 1px 4px rgba(20,83,45,0.06);
  transform: translateY(-1px);
}
.manager-badge {
  font-size: 8px;
  font-weight: 700;
  color: ${C.acc};
  background: rgba(132,204,22,0.12);
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.3;
}
.dash-link-icon {
  width: 10px;
  height: 10px;
  color: ${C.textMut};
  opacity: 0;
  transition: opacity 0.15s;
  position: absolute;
  top: 5px;
  right: 5px;
}
.dash-grid-cell:hover .dash-link-icon,
.dash-checklist-cell:hover .dash-link-icon {
  opacity: 0.6;
}
.dash-quick-link {
  background: rgba(255,255,255,0.55);
  border-radius: 8px;
  border: 1.5px dashed rgba(20,83,45,0.18);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  gap: 3px;
  overflow: hidden;
  transition: all 0.15s ease;
  cursor: pointer;
  min-width: 0;
  min-height: 0;
}
.dash-quick-link:hover {
  background: rgba(247,254,231,0.85);
  border-color: rgba(20,83,45,0.3);
  box-shadow: 0 2px 8px rgba(20,83,45,0.10);
  transform: translateY(-1px);
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Timeframe config
   ═══════════════════════════════════════════════════════════════════════════ */
const RANGES = [
  { key: "wtd",      label: "WTD" },
  { key: "past-week", label: "Past Week" },
  { key: "mtd",      label: "MTD" },
  { key: "past-30",  label: "Past 30" },
  { key: "qtd",      label: "QTD" },
  { key: "ytd",      label: "YTD" },
  { key: "lifetime", label: "Lifetime" },
  { key: "custom",   label: "Custom" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   AnimatedNumber — smooth counting via rAF
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0, duration = 600 }) {
  const ref = useRef(null);
  const prevVal = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prevVal.current;
    const to = typeof value === "number" ? value : 0;
    prevVal.current = to;
    if (from === to) { el.textContent = prefix + fmt(to) + suffix; return; }
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cur = from + (to - from) * ease;
      el.textContent = prefix + fmt(cur) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    function fmt(n) {
      if (decimals === 0) return Math.round(n).toLocaleString("en-US");
      return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
  }, [value, prefix, suffix, decimals, duration]);
  const fmt = (n) => {
    if (decimals === 0) return Math.round(n).toLocaleString("en-US");
    return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };
  return <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>{prefix}{fmt(typeof value === "number" ? value : 0)}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */
const fmt$ = (v) => `${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
const fmt$k = (v) => v >= 10000 ? `${(v / 1000).toFixed(1)}k` : v >= 1000 ? `${(v / 1000).toFixed(2)}k` : fmt$(v);
const fmtDateLabel = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* Link arrow icon — small SVG */
const LinkIcon = () => (
  <svg className="dash-link-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 2.5h5v5" /><path d="M9.5 2.5L2.5 9.5" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   TrendBadge
   ═══════════════════════════════════════════════════════════════════════════ */
function TrendBadge({ value, invert = false, size = "sm" }) {
  if (value == null || !isFinite(value) || value === 0) return null;
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? C.suc : C.dan;
  const bg = positive ? C.sucLt : C.danLt;
  const arrow = value > 0 ? "↑" : "↓";
  const fs = size === "xs" ? 8 : 9;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 1, fontSize: fs, fontWeight: 700, color, background: bg, padding: "1px 5px", borderRadius: 3, lineHeight: 1.3 }}>
      {arrow}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DateRangePicker
   ═══════════════════════════════════════════════════════════════════════════ */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DateRangePicker({ customFrom, customTo, setCustomFrom, setCustomTo }) {
  const today = todayStr();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [hovered, setHovered] = useState(null);
  const labelStyle = { fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" };

  const presets = [
    { label: "Last 7 days", fn: () => { setCustomFrom(addDays(today, -6)); setCustomTo(today); } },
    { label: "Last 14 days", fn: () => { setCustomFrom(addDays(today, -13)); setCustomTo(today); } },
    { label: "Last 30 days", fn: () => { setCustomFrom(addDays(today, -29)); setCustomTo(today); } },
    { label: "Last 90 days", fn: () => { setCustomFrom(addDays(today, -89)); setCustomTo(today); } },
    { label: "This month", fn: () => {
      const now = new Date();
      setCustomFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
      setCustomTo(today);
    }},
    { label: "Last month", fn: () => {
      const now = new Date();
      const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      setCustomFrom(`${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, "0")}-01`);
      setCustomTo(`${pmEnd.getFullYear()}-${String(pmEnd.getMonth() + 1).padStart(2, "0")}-${String(pmEnd.getDate()).padStart(2, "0")}`);
    }},
  ];

  const calDays = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handleDayClick = (iso) => {
    if (!customFrom || (customFrom && customTo)) {
      setCustomFrom(iso); setCustomTo("");
    } else {
      if (iso < customFrom) { setCustomTo(customFrom); setCustomFrom(iso); }
      else { setCustomTo(iso); }
    }
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const isInRange = (iso) => {
    if (!iso) return false;
    const rangeEnd = customTo || hovered;
    if (!customFrom || !rangeEnd) return false;
    const start = customFrom < rangeEnd ? customFrom : rangeEnd;
    const end = customFrom < rangeEnd ? rangeEnd : customFrom;
    return iso >= start && iso <= end;
  };
  const isStart = (iso) => iso && iso === customFrom;
  const isEnd = (iso) => iso && (customTo ? iso === customTo : iso === hovered && customFrom && !customTo);
  const isToday = (iso) => iso === today;
  const isFuture = (iso) => iso > today;

  return (
    <div style={{
      position: "absolute", top: "100%", right: 0, zIndex: 100, marginTop: 4,
      display: "flex", gap: 12, padding: "12px 14px",
      background: C.surface, borderRadius: 10, border: `1px solid ${C.borderLight}`,
      animation: "calFadeIn 0.25s cubic-bezier(0.22,1,0.36,1)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 100, borderRight: `1px solid ${C.borderLight}`, paddingRight: 12 }}>
        <div style={{ ...labelStyle, fontSize: 9, marginBottom: 2 }}>Quick Select</div>
        {presets.map(p => (
          <button key={p.label} onClick={p.fn} style={{
            padding: "3px 6px", borderRadius: 4, border: "none",
            background: "transparent", color: C.textSec,
            fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            textAlign: "left", transition: "all 0.1s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.priLt; e.currentTarget.style.color = C.pri; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSec; }}
          >{p.label}</button>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <button onClick={prevMonth} style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${C.borderLight}`, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.textSec, fontFamily: "inherit" }}>‹</button>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${C.borderLight}`, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.textSec, fontFamily: "inherit" }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 2 }}>
          {DOW.map(d => (<div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.textMut, letterSpacing: "0.04em", padding: "1px 0" }}>{d}</div>))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
          {calDays.map((iso, idx) => {
            if (!iso) return <div key={`b-${idx}`} />;
            const dayNum = parseInt(iso.split("-")[2], 10);
            const inR = isInRange(iso), st = isStart(iso), en = isEnd(iso), fut = isFuture(iso), td = isToday(iso);
            return (
              <button key={iso} onClick={() => !fut && handleDayClick(iso)}
                onMouseEnter={() => !fut && setHovered(iso)} onMouseLeave={() => setHovered(null)}
                style={{
                  width: "100%", aspectRatio: "1", borderRadius: st || en ? 5 : inR ? 0 : 5,
                  border: td ? `1.5px solid ${C.pri}` : "1.5px solid transparent",
                  background: (st || en) ? C.pri : inR ? `${C.pri}15` : "transparent",
                  color: (st || en) ? "#fff" : fut ? `${C.textMut}60` : C.text,
                  fontSize: 10, fontWeight: (st || en || td) ? 700 : 500,
                  cursor: fut ? "default" : "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.08s", opacity: fut ? 0.4 : 1,
                }}
              >{dayNum}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <div style={{ flex: 1, padding: "3px 6px", borderRadius: 5, border: `1px solid ${customFrom ? C.pri : C.border}`, background: customFrom ? `${C.pri}08` : C.bg, fontSize: 10, fontWeight: 600, color: customFrom ? C.text : C.textMut, textAlign: "center" }}>
            {customFrom ? fmtDateLabel(customFrom) : "Start"}
          </div>
          <span style={{ fontSize: 9, color: C.textMut }}>→</span>
          <div style={{ flex: 1, padding: "3px 6px", borderRadius: 5, border: `1px solid ${customTo ? C.pri : C.border}`, background: customTo ? `${C.pri}08` : C.bg, fontSize: 10, fontWeight: 600, color: customTo ? C.text : C.textMut, textAlign: "center" }}>
            {customTo ? fmtDateLabel(customTo) : "End"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AnimatedPillSelector — sliding highlight timeframe selector
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedPillSelector({ ranges, activeKey, onChange }) {
  const trackRef = useRef(null);
  const btnRefs = useRef({});
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const updateSlider = useCallback(() => {
    const btn = btnRefs.current[activeKey];
    const track = trackRef.current;
    if (btn && track) {
      const trackRect = track.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setSliderStyle({
        left: btnRect.left - trackRect.left,
        width: btnRect.width,
      });
      if (!ready) setReady(true);
    }
  }, [activeKey, ready]);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(updateSlider));
  }, [activeKey, updateSlider]);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(updateSlider));
  }, []);

  return (
    <div className="dash-pill-track" ref={trackRef}>
      <div className="dash-pill-slider" style={{ left: sliderStyle.left, width: sliderStyle.width, opacity: ready ? 1 : 0 }} />
      {ranges.map(r => (
        <button
          key={r.key}
          ref={el => btnRefs.current[r.key] = el}
          className={`dash-pill-btn${r.key === activeKey ? " active" : ""}`}
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sparkline — thin inline chart
   ═══════════════════════════════════════════════════════════════════════════ */
function Sparkline({ data, width = 200, height = 32, color = C.pri }) {
  if (!data || data.length === 0) return null;
  const values = data.map(d => d.value || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const w = width, h = height;
  const stepX = (w - pad * 2) / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => `${pad + i * stepX},${h - pad - ((v - min) / range) * (h - pad * 2)}`);
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${pad + (values.length - 1) * stepX},${h} L${pad},${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${color.replace("#","")})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DashGrid — viewport-filling grid, 2:1 cell aspect ratio
   Stretches to fill available height — no wasted whitespace
   ═══════════════════════════════════════════════════════════════════════════ */
function DashGrid({ children }) {
  const COL_GAP = 4;
  const ROW_GAP = 3;
  const LABEL_H = 16;
  const COLS = 9;

  // 11 rows: 4 label rows + 7 data rows
  // Use 1fr for data rows so they stretch to fill viewport
  const templateRows = `${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr 1fr 1fr 1fr`;

  return (
    <div
      style={{
        flex: 1, minHeight: 0, overflow: "hidden",
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: templateRows,
        gap: `${ROW_GAP}px ${COL_GAP}px`,
        padding: "0 8px 8px",
      }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Chart container — measures height, renders InteractiveLineChart
   ═══════════════════════════════════════════════════════════════════════════ */
function ChartFill({ chartData, color, compareColor, animEpoch, id, dateLabels }) {
  const containerRef = useRef(null);
  const [containerH, setContainerH] = useState(120);
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const h = containerRef.current.clientHeight;
        if (h > 30) setContainerH(h);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <InteractiveLineChart
        chartData={chartData}
        color={color}
        compareColor={compareColor}
        showCompare={false}
        height={containerH}
        id={id}
        animationEpoch={animEpoch}
        dateLabels={dateLabels}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage({
  data, save, nav, profile, addGlobalToast,
  showSnapshot, showRevenue, showFunnel, showLTV,
  showRevenueComposition, showRevenueByCategory, showDiscountAnalysis,
  showTopClients, showOps, showFunnelMetrics, showHeroKPIs,
}) {
  const [range, setRange] = useState("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [animEpoch, setAnimEpoch] = useState(0);
  const [showPriorPeriod, setShowPriorPeriod] = useState(true);
  const today = todayStr();

  /* ─── localStorage cache: show stale data instantly, update when fresh ── */
  const hasFreshData = !!(data && data.reservations);

  /* ─── Lazy-compute refs for below-fold sections ───────────────────── */
  const { ref: financialRef } = useSectionVisibility();

  useEffect(() => { setAnimEpoch(e => e + 1); }, [range]);

  const calRef = useRef(null);
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const handleRangeChange = (key) => {
    setRange(key);
    if (key === "custom") setShowCalendar(true);
    else setShowCalendar(false);
  };

  /* ─── Date range computation ──────────────────────────────────────── */
  const { dateFrom, dateTo, days, prevFrom, prevTo } = useMemo(() => {
    const now = new Date();
    const end = today;
    let start;
    switch (range) {
      case "wtd": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); start = d.toISOString().split("T")[0]; break; }
      case "past-week": start = addDays(today, -7); break;
      case "mtd": start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; break;
      case "past-30": start = addDays(today, -30); break;
      case "qtd": { const qm = Math.floor(now.getMonth() / 3) * 3; start = `${now.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`; break; }
      case "ytd": start = `${now.getFullYear()}-01-01`; break;
      case "lifetime": start = "2020-01-01"; break;
      case "custom": start = customFrom || today; break;
      default: start = addDays(today, -30);
    }
    const to = range === "custom" && customTo ? customTo : end;
    const d1 = new Date(start + "T00:00:00");
    const d2 = new Date(to + "T00:00:00");
    const dayCount = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    const pTo = addDays(start, -1);
    const pFrom = addDays(pTo, -(dayCount - 1));
    return { dateFrom: start, dateTo: to, days: dayCount, prevFrom: pFrom, prevTo: pTo };
  }, [range, today, customFrom, customTo]);

  /* ─── Today's Snapshot (shared helpers) ──────────────────────────── */
  const occupancyMetrics = useMemo(() => computeOccupancyMetrics(data, today), [data, today]);
  const serviceMetrics = useMemo(() => computeServiceMetrics(data, today), [data, today]);
  const todaySnapshot = useMemo(() => ({
    ...occupancyMetrics,
    tours: serviceMetrics.tours, evals: serviceMetrics.evals, bookingsToday: serviceMetrics.bookingsToday,
    bathsTotal: serviceMetrics.bathsTotal, bathsDone: serviceMetrics.bathsDone,
    roomsToClean: serviceMetrics.roomsToClean, roomsCleaned: serviceMetrics.roomsCleaned,
    ppTotal: serviceMetrics.ppTotal, ppCompleted: serviceMetrics.ppCompleted,
  }), [occupancyMetrics, serviceMetrics]);

  /* ─── Cash-basis revenue (shared helper) ─────────────────────────── */
  const cashBasisData = useMemo(() =>
    computeCashRevenueMetrics(data.reservations, dateFrom, dateTo, prevFrom, prevTo, today),
  [data.reservations, dateFrom, dateTo, prevFrom, prevTo, today]);

  /* ─── Accrual revenue (shared helper) ────────────────────────────── */
  const reservationsRef = data.reservations;
  const roomsRef = data.rooms;
  const accrualData = useMemo(() =>
    computeAccrualRevenueMetrics({ reservations: reservationsRef, rooms: roomsRef }, dateFrom, dateTo, prevFrom, prevTo),
  [reservationsRef, roomsRef, dateFrom, dateTo, prevFrom, prevTo]);

  const revenue = accrualData.current.totals.totalRevenue;
  const prevRevenue = accrualData.previous.totals.totalRevenue;
  const revenueTrend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

  /* ─── Revenue Composition ──────────────────────────────────────────── */
  const accrualTotalRevenue = accrualData.current.totals.totalRevenue;
  const accrualBoardingRevenue = accrualData.current.totals.boardingRevenue;
  const accrualDaycareRevenue = accrualData.current.totals.daycareRevenue;
  const revenueComposition = useMemo(() => {
    const boardingPct = accrualTotalRevenue > 0 ? (accrualBoardingRevenue / accrualTotalRevenue) * 100 : 0;
    const daycarePct = accrualTotalRevenue > 0 ? (accrualDaycareRevenue / accrualTotalRevenue) * 100 : 0;
    return { boarding: accrualBoardingRevenue, daycare: accrualDaycareRevenue, total: accrualTotalRevenue, boardingPct, daycarePct };
  }, [accrualTotalRevenue, accrualBoardingRevenue, accrualDaycareRevenue]);

  /* ─── Discount breakdown (shared helper) ─────────────────────────── */
  const discountBreakdown = useMemo(() =>
    computeDiscountBreakdown(data.reservations, dateFrom, dateTo),
  [data.reservations, dateFrom, dateTo]);

  /* ─── Chart data bucketing ────────────────────────────────────────── */
  const bucketMode = useMemo(() => {
    if (range === "ytd" || range === "lifetime" || days > 180) return "monthly";
    if (range === "qtd" || days > 60) return "weekly";
    return "daily";
  }, [range, days]);

  const bucketDays = useCallback((daysList, getValueForDay) => {
    if (bucketMode === "daily") {
      return daysList.map(d => ({ date: d, label: fmtDateLabel(d), value: getValueForDay(d), prevValue: 0 }));
    }
    if (bucketMode === "monthly") {
      const buckets = {};
      daysList.forEach(d => {
        const key = d.slice(0, 7);
        if (!buckets[key]) buckets[key] = { date: key, label: new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short" }), value: 0, prevValue: 0 };
        buckets[key].value += getValueForDay(d);
      });
      return Object.values(buckets);
    }
    const buckets = {};
    daysList.forEach(d => {
      const dt = new Date(d + "T00:00:00");
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - dt.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!buckets[key]) buckets[key] = { date: key, label: fmtDateLabel(key), value: 0, prevValue: 0 };
      buckets[key].value += getValueForDay(d);
    });
    return Object.values(buckets);
  }, [bucketMode]);

  const cashChartData = useMemo(() => {
    const byDate = cashBasisData.current.byDate || {};
    const daysList = [];
    let cur = dateFrom;
    while (cur <= dateTo) { daysList.push(cur); cur = addDays(cur, 1); }
    return bucketDays(daysList, d => byDate[d] || 0);
  }, [cashBasisData, dateFrom, dateTo, bucketDays]);

  const accrualChartData = useMemo(() => {
    const dayData = accrualData.current.dayData;
    return bucketDays(accrualData.days, d => dayData[d]?.totalRevenue || 0);
  }, [accrualData, bucketDays]);

  /* ─── Funnel metrics (shared helper) ─────────────────────────────── */
  const clientsRef = data.clients;
  const serverStatsRef = data.serverStats;
  const resortPoliciesRef = data.resortPolicies;
  const funnelMetrics = useMemo(() =>
    computeLifecycleMetrics(data, dateFrom, dateTo, today),
  [clientsRef, serverStatsRef, reservationsRef, resortPoliciesRef, dateFrom, dateTo, today]);

  /* ─── Ops progress (lazy — deferred until checklist section is visible) ── */
  const { ref: opsVisRef, value: lazyOpsProgress, isVisible: opsVisible } = useLazyCompute(
    () => computeOpsProgress(data, today),
    [data, today]
  );
  const opsProgress = lazyOpsProgress || [];

  const getChecklistProgress = (id) => {
    const op = opsProgress.find(o => o.id === id);
    return op ? op.progress : 0;
  };
  const getChecklistCount = (id) => {
    const op = opsProgress.find(o => o.id === id);
    return op ? op.countLabel : "";
  };

  /* ─── Refund tracker (shared helper) ─────────────────────────────── */
  const refundData = useMemo(() =>
    computeRefundMetrics(data.reservations, dateFrom, dateTo),
  [data.reservations, dateFrom, dateTo]);

  /* ─── Service data (shared helper) ───────────────────────────────── */
  const svcData = useMemo(() => {
    const sm = computeServiceMetrics(data, today);
    return {
      bathsTotal: sm.bathsTotal, bathsDone: sm.bathsDone,
      ppTotal: sm.ppTotal, ppCompleted: sm.ppCompleted,
      pamperTotal: 0, pamperDone: 0,
      iceCreamTotal: sm.iceCreamTotal, iceCreamDone: sm.iceCreamDone,
    };
  }, [data, today]);

  /* ─── Prior-period snapshot (yesterday) ─────────────────────────── */
  const yesterday = addDays(today, -1);
  const prevOccupancy = useMemo(() => computeOccupancyMetrics(data, yesterday), [data, yesterday]);
  const prevService = useMemo(() => computeServiceMetrics(data, yesterday), [data, yesterday]);

  /* ─── Prior-period refunds ─────────────────────────────────────── */
  const prevRefundData = useMemo(() =>
    computeRefundMetrics(data.reservations, prevFrom, prevTo),
  [data.reservations, prevFrom, prevTo]);

  /* ─── Prior-period funnel metrics ──────────────────────────────── */
  const prevFunnelMetrics = useMemo(() =>
    computeLifecycleMetrics(data, prevFrom, prevTo, yesterday),
  [clientsRef, serverStatsRef, reservationsRef, resortPoliciesRef, prevFrom, prevTo, yesterday]);

  /* ─── Trend helper ─────────────────────────────────────────────── */
  const pctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  /* ─── Cache fresh metrics when available ──────────────────────────── */
  const cacheableMetrics = useMemo(() => {
    if (!hasFreshData) return null;
    return {
      occupancyMetrics, serviceMetrics, todaySnapshot,
      cashTotal: cashBasisData.current.total,
      cashCount: cashBasisData.current.count,
    };
  }, [hasFreshData, occupancyMetrics, serviceMetrics, todaySnapshot, cashBasisData]);

  useEffect(() => {
    if (cacheableMetrics) setCachedData(cacheableMetrics);
  }, [cacheableMetrics]);

  /* ─── Loading gate — skeleton shimmer instead of K9 animation ───── */
  if (!data || !data.reservations) {
    return <SkeletonShimmer />;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */
  const bookingsTrend = cashBasisData.previous.count > 0 ? ((cashBasisData.current.count - cashBasisData.previous.count) / cashBasisData.previous.count) * 100 : 0;

  return (
    <div style={{
      height: "calc(100vh - 64px)", overflow: "hidden",
      display: "flex", flexDirection: "column",
      fontFamily: "inherit", padding: "0",
      background: "linear-gradient(180deg, #F7FEE7 0%, #ECFDF5 50%, #F0FDF4 100%)",
    }}>
      <style>{DASH_CSS}</style>

      {/* ═══ HEADER BAR ═══ */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px 6px", flexShrink: 0,
      }}>
        {/* Left: Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/k9_mark.svg" alt="K9 Operations" style={{ height: 28, width: "auto", opacity: 0.85 }} />
          <h1 style={{ fontSize: 16, fontWeight: 800, color: C.pri, margin: 0, lineHeight: 1 }}>
            Command Center
          </h1>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.suc, animation: "dashPulse 2s infinite" }} />
          <span style={{ fontSize: 9, color: C.textMut, fontWeight: 500 }}>
            {fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)} · {days}d
          </span>
        </div>

        {/* Right: Timeframe pills + prior period toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }} ref={calRef}>
          <AnimatedPillSelector ranges={RANGES} activeKey={range} onChange={handleRangeChange} />

          <button
            onClick={() => setShowPriorPeriod(!showPriorPeriod)}
            style={{
              padding: "3px 8px", borderRadius: 4,
              border: `1px solid ${showPriorPeriod ? C.acc : "rgba(20,83,45,0.1)"}`,
              background: showPriorPeriod ? C.accLt : "rgba(255,255,255,0.7)",
              color: showPriorPeriod ? C.accDk : C.textMut,
              fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.12s", whiteSpace: "nowrap",
            }}
          >
            vs Prior
          </button>

          {showCalendar && range === "custom" && (
            <DateRangePicker customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
          )}
        </div>
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <DashGrid>
        {/* ─── Section Label: Gingr Data ─── */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <span className="dash-section-label">Today's Snapshot</span>
        </div>
        <div ref={opsVisRef} style={{ gridColumn: "8", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
          <span className="dash-section-label">Checklists</span>
        </div>
        <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
          <span className="dash-section-label">Services</span>
        </div>

        {/* ═══ ROW 1: Gingr Data ═══ */}
        <MetricCell label="Expected" value={todaySnapshot.expected} hero onClick={() => nav && nav("checkout-tv")} trend={showPriorPeriod ? pctChange(todaySnapshot.expected, prevOccupancy.expected) : null} />
        <MetricCell label="In House" value={todaySnapshot.dogsInHouse} hero sub={`${todaySnapshot.boardingInHouse}B · ${todaySnapshot.daycareInHouse}D`} onClick={() => nav && nav("checkout-tv")} trend={showPriorPeriod ? pctChange(todaySnapshot.dogsInHouse, prevOccupancy.dogsInHouse) : null} />
        <MetricCell label="Going Home" value={todaySnapshot.goingHome} hero onClick={() => nav && nav("ops-bathing")} trend={showPriorPeriod ? pctChange(todaySnapshot.goingHome, prevOccupancy.goingHome) : null} />
        <MetricCell label="Occupancy" value={`${todaySnapshot.occupancyPct}%`} hero onClick={() => nav && nav("settings")} trend={showPriorPeriod ? pctChange(todaySnapshot.occupancyPct, prevOccupancy.occupancyPct) : null} />
        <MetricCell label="Bookings" value={todaySnapshot.bookingsToday} hero />
        <MetricCell label="Tours" value={todaySnapshot.tours} hero onClick={() => nav && nav("lifecycle")} trend={showPriorPeriod ? pctChange(todaySnapshot.tours, prevService.tours) : null} />
        <MetricCell label="Evals" value={todaySnapshot.evals} hero onClick={() => nav && nav("lifecycle")} />
        <ChecklistCell label="Opening" progress={getChecklistProgress("ops-opening")} count={getChecklistCount("ops-opening")} onClick={() => nav && nav("ops-opening")} />
        <ServiceCell label="Baths" done={svcData.bathsDone} total={svcData.bathsTotal} onClick={() => nav && nav("ops-bathing")} />

        {/* ─── Section Label: Customer Lifecycle ─── */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <span className="dash-section-label">Customer Lifecycle</span>
        </div>
        <div style={{ gridColumn: "8 / 10" }} />

        {/* ═══ ROW 2: Customer Lifecycle ═══ */}
        <MetricCell label="Remaining Leads" value={funnelMetrics.remainingLeads} onClick={() => nav && nav("funnel")} trend={showPriorPeriod ? pctChange(funnelMetrics.remainingLeads, prevFunnelMetrics.remainingLeads) : null} />
        <MetricCell label="At-Risk" value={funnelMetrics.remainingAtRisk} onClick={() => nav && nav("lifecycle")} color={funnelMetrics.remainingAtRisk > 0 ? C.warn : undefined} />
        <MetricCell label="Outreaches" value={funnelMetrics.todayOutreaches} onClick={() => nav && nav("lifecycle")} trend={showPriorPeriod ? pctChange(funnelMetrics.todayOutreaches, prevFunnelMetrics.todayOutreaches) : null} />
        <MetricCell label="Converted" value={funnelMetrics.todayConversions} color={funnelMetrics.todayConversions > 0 ? C.suc : undefined} onClick={() => nav && nav("lifecycle")} trend={showPriorPeriod ? pctChange(funnelMetrics.todayConversions, prevFunnelMetrics.todayConversions) : null} />
        <MetricCell label="First-Time Spenders" value={funnelMetrics.firstTimePayers} onClick={() => nav && nav("lifecycle")} />
        <MetricCell label="Conversion Rate" value={`${funnelMetrics.conversionRate.toFixed(1)}%`} onClick={() => nav && nav("funnel")} trend={showPriorPeriod ? pctChange(funnelMetrics.conversionRate, prevFunnelMetrics.conversionRate) : null} />
        <MetricCell label="New Leads" value={funnelMetrics.todayNewLeads} onClick={() => nav && nav("funnel")} trend={showPriorPeriod ? pctChange(funnelMetrics.todayNewLeads, prevFunnelMetrics.todayNewLeads) : null} />
        <ChecklistCell label="Front-End" progress={getChecklistProgress("ops-fe")} count={getChecklistCount("ops-fe")} onClick={() => nav && nav("ops-fe")} />
        <ServiceCell label="Pamper" done={svcData.pamperDone} total={svcData.pamperTotal} onClick={() => nav && nav("ops-pamper")} />

        {/* ─── Section Label: Daily Tasks ─── */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <span className="dash-section-label">Daily Tasks</span>
        </div>
        <div style={{ gridColumn: "8 / 10" }} />

        {/* ═══ ROW 3: Daily Tasks (quick-link nav shortcuts) ═══ */}
        <QuickLinkCell label="EOD Report" icon={<I.FileText />} onClick={() => nav && nav("eod")} />
        <QuickLinkCell label="Checkout TV" icon={<I.Monitor />} onClick={() => nav && nav("checkout-tv")} />
        <QuickLinkCell label="Photos" icon={<I.Camera />} onClick={() => nav && nav("photos")} />
        <QuickLinkCell label="Cash Tips" icon={<I.DollarSign />} onClick={() => nav && nav("cash-tips")} />
        <QuickLinkCell label="Checkout Notes" icon={<I.Clipboard />} onClick={() => nav && nav("checkout-notes")} />
        <MetricCell label="Avg LTV" value={`$${funnelMetrics.avgLTV.toFixed(0)}`} onClick={() => nav && nav("lifecycle")} />
        <MetricCell label="Total Clients" value={funnelMetrics.spendingClientsCount} onClick={() => nav && nav("lifecycle")} />
        <ChecklistCell label="Back-End" progress={getChecklistProgress("ops-be")} count={getChecklistCount("ops-be")} onClick={() => nav && nav("ops-be")} />
        <ServiceCell label="Ice Cream" done={svcData.iceCreamDone} total={svcData.iceCreamTotal} onClick={() => nav && nav("ops-svc")} />

        {/* ─── Section Label: Reporting ─── */}
        <div ref={financialRef} style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <span className="dash-section-label">Financial Reporting</span>
        </div>
        <div style={{ gridColumn: "8" }} />
        <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
          <span className="manager-badge">Manager Only</span>
        </div>

        {/* ═══ ROW 4: Reporting/Financial ═══ */}
        <MetricCell label="Transactions" value={cashBasisData.current.count} trend={showPriorPeriod ? bookingsTrend : null} />
        <MetricCell label="Avg Ticket" value={`$${cashBasisData.current.avgTransaction.toFixed(0)}`} trend={showPriorPeriod ? cashBasisData.trendAvg : null} />
        <MetricCell label="Rev/PAR" value={`$${accrualData.revPAR.toFixed(0)}`} trend={showPriorPeriod ? (() => { const prevRevPAR = accrualData.totalRoomCount > 0 && accrualData.previous.days.length > 0 ? accrualData.previous.totals.boardingRevenue / (accrualData.totalRoomCount * accrualData.previous.days.length) : 0; return pctChange(accrualData.revPAR, prevRevPAR); })() : null} />
        <MetricCell label="Refunds" value={refundData.count} color={refundData.count > 0 ? C.dan : undefined} trend={showPriorPeriod ? pctChange(refundData.count, prevRefundData.count) : null} />
        <MetricCell label="$ Refunded" value={`$${fmt$k(refundData.total)}`} color={refundData.total > 0 ? C.dan : undefined} />
        <MetricCell label="Discounted" value={discountBreakdown.discounted} color={discountBreakdown.discounted > 0 ? C.warn : undefined} />
        <MetricCell label="$ Discounted" value={`$${fmt$k(discountBreakdown.totalDiscounts)}`} color={discountBreakdown.totalDiscounts > 0 ? C.warn : undefined} />
        <ChecklistCell label="Room Clean" progress={getChecklistProgress("ops-rooms")} count={getChecklistCount("ops-rooms")} onClick={() => nav && nav("ops-rooms")} />
        <MetricCell label="Attendance" value="—" onClick={() => nav && nav("enterprise-attendance")} />

        {/* ═══ ROWS 5-7: Charts ═══ */}
        <div className="dash-chart-cell" style={{ gridColumn: "1 / 4", gridRow: "span 3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cash Basis Revenue</span>
              <Tip text="Cash basis revenue from Gingr's GET /transactions endpoint. Shows actual money collected per day."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(cashBasisData.current.total)}</span>
          </div>
          <ChartFill chartData={cashChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="cash-main" dateLabels={cashChartData.map(d => d.date)} />
        </div>

        {/* Col 4 Toggle area */}
        <div style={{
          gridColumn: "4", gridRow: "span 3",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 8, padding: "6px 4px",
          background: "#FFFFFF", borderRadius: 8, border: "1px solid rgba(20,83,45,0.08)",
          boxShadow: "0 1px 3px rgba(20,83,45,0.06), 0 1px 2px rgba(20,83,45,0.04)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>Revenue Split</div>
            <div style={{ width: "80%", height: 5, borderRadius: 3, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${revenueComposition.boardingPct}%`, height: "100%", background: C.pri }} />
              <div style={{ width: `${revenueComposition.daycarePct}%`, height: "100%", background: C.acc }} />
            </div>
            <div style={{ fontSize: 8, color: C.textMut, textAlign: "center", lineHeight: 1.4 }}>
              <div><span style={{ color: C.pri, fontWeight: 700 }}>{revenueComposition.boardingPct.toFixed(0)}%</span> Board</div>
              <div><span style={{ color: C.acc, fontWeight: 700 }}>{revenueComposition.daycarePct.toFixed(0)}%</span> Day</div>
            </div>
          </div>
          <div style={{ width: "60%", height: 1, background: "rgba(20,83,45,0.08)" }} />
          <div style={{ fontSize: 8, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>Accrual Total</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>${fmt$k(revenue)}</div>
          {showPriorPeriod && <TrendBadge value={revenueTrend} size="xs" />}
        </div>

        {/* Accrual Revenue */}
        <div className="dash-chart-cell" style={{ gridColumn: "5 / 8", gridRow: "span 3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.accDk, textTransform: "uppercase", letterSpacing: "0.06em" }}>Accrual Revenue</span>
              <Tip text="Revenue recognized per night. Each reservation's per-night rate is spread across the nights stayed."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.acc, fontVariantNumeric: "tabular-nums" }}>${fmt$k(revenue)}</span>
          </div>
          <ChartFill chartData={accrualChartData} color={C.acc} compareColor={C.pri} animEpoch={animEpoch} id="accrual-main" dateLabels={accrualChartData.map(d => d.date)} />
        </div>

        {/* Col 8: Private Play (row 5) */}
        <ServiceCell label="Private Play" done={svcData.ppCompleted} total={svcData.ppTotal} onClick={() => nav && nav("ops-pp")} />

        {/* Col 9: Inventory (row 5) */}
        <MetricCell label="Inventory" value="—" onClick={() => nav && nav("inventory")} />

        {/* Col 8: Closing (row 6) */}
        <ChecklistCell label="Closing" progress={getChecklistProgress("ops-closing")} count={getChecklistCount("ops-closing")} onClick={() => nav && nav("ops-closing")} />

        {/* Col 9: Test Health (row 6) */}
        <MetricCell label="Test Health" value="172" sub="100% pass" onClick={() => nav && nav("test-health")} color={C.suc} />

        {/* Row 7: Col 8 empty, Col 9 empty */}
        <div className="dash-grid-cell empty-cell" />
        <div className="dash-grid-cell empty-cell" />
      </DashGrid>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Grid Cell Components
   ═══════════════════════════════════════════════════════════════════════════ */

/* MetricCell — standard data cell */
function MetricCell({ label, value, sub, color, trend, onClick, hero }) {
  return (
    <div
      className={`dash-grid-cell${onClick ? " clickable" : ""}${hero ? " hero-cell" : ""}`}
      onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both", position: "relative" }}
    >
      {onClick && <LinkIcon />}
      <div className="dash-cell-value" style={{
        color: hero ? "#FFFFFF" : (color || C.text),
        fontSize: hero ? 26 : 22,
      }}>
        {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
      </div>
      {trend != null && <TrendBadge value={trend} size="xs" />}
      <div className="dash-cell-label" style={hero ? { color: "rgba(217,249,157,0.8)" } : undefined}>{label}</div>
      {sub && <div style={{ fontSize: 8, color: hero ? "rgba(255,255,255,0.5)" : C.textMut, lineHeight: 1, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/* ChecklistCell — progress bar + percentage */
function ChecklistCell({ label, progress, count, onClick }) {
  const pct = Math.round(progress);
  const done = pct === 100;
  const barColor = done ? C.suc : C.pri;
  return (
    <div className="dash-checklist-cell" onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both", position: "relative" }}
    >
      {onClick && <LinkIcon />}
      <div style={{ fontSize: 9, fontWeight: 700, color: done ? C.suc : C.text, lineHeight: 1, marginBottom: 4, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
        {label}
      </div>
      <div style={{ width: "80%", height: 5, background: "rgba(20,83,45,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3,
          transformOrigin: "left", animation: "dashBarGrow 0.4s 0.1s cubic-bezier(0.22,1,0.36,1) both",
        }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: barColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {pct}%
      </div>
      {count && <div style={{ fontSize: 8, color: C.textMut, lineHeight: 1, marginTop: 1 }}>{count}</div>}
    </div>
  );
}

/* ServiceCell — done/total count */
function ServiceCell({ label, done, total, onClick }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done >= total;
  const barColor = allDone ? C.suc : C.acc;
  return (
    <div className="dash-checklist-cell" onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both", position: "relative" }}
    >
      {onClick && <LinkIcon />}
      <div style={{ fontSize: 9, fontWeight: 700, color: allDone ? C.suc : C.text, lineHeight: 1, marginBottom: 4, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
        {label}
      </div>
      <div style={{ width: "80%", height: 5, background: "rgba(20,83,45,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3,
          transformOrigin: "left", animation: "dashBarGrow 0.4s 0.1s cubic-bezier(0.22,1,0.36,1) both",
        }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: barColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {done}/{total}
      </div>
    </div>
  );
}

/* QuickLinkCell — compact navigation shortcut (no data value) */
function QuickLinkCell({ label, icon, onClick }) {
  return (
    <div
      className="dash-quick-link"
      onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both" }}
    >
      <div style={{ color: C.pri, opacity: 0.55, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.pri, lineHeight: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", opacity: 0.7 }}>
        {label}
      </div>
    </div>
  );
}

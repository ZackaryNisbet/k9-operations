// K9 Operations — Dashboard v6
// Server-side pre-computed metrics. Zero client-side 136K iteration.
// Timeframe changes = Supabase query returning ~1-365 pre-computed rows.
// 9×11 Grid, viewport-locked, world-class data density.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo, startTransition } from "react";
import {
  C, todayStr, addDays, fmtDate, fmtDateShort,
} from "../../shared/theme";
import { I } from "../../shared/icons";
import { Tip } from "../../shared/ui";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useDashboardMetrics } from "../../hooks/useDashboardMetrics";
import { useLazyCompute, useSectionVisibility } from "../../hooks/useLazyCompute";
import { computeOpsProgress, computeServiceMetrics, computeLifecycleMetrics } from "../../shared/metricsHelpers";

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
@keyframes cancelStrikethrough {
  0% { width: 0; }
  100% { width: 100%; }
}
@keyframes cancelFadeIn {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes cancelFadeOut {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes dashSkeleton {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}
.dash-skeleton-line {
  height: 18px;
  width: 60%;
  border-radius: 4px;
  background: linear-gradient(90deg, rgba(20,83,45,0.04) 25%, rgba(20,83,45,0.08) 50%, rgba(20,83,45,0.04) 75%);
  background-size: 200px 100%;
  animation: dashSkeleton 1.2s ease-in-out infinite;
}
.dash-skeleton-label {
  height: 9px;
  width: 50%;
  border-radius: 3px;
  margin-top: 5px;
  background: linear-gradient(90deg, rgba(20,83,45,0.03) 25%, rgba(20,83,45,0.06) 50%, rgba(20,83,45,0.03) 75%);
  background-size: 200px 100%;
  animation: dashSkeleton 1.2s ease-in-out infinite;
}
/* ── Cell styles ── */
.dash-grid-cell {
  background: #FFFFFF;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  overflow: hidden;
  transition: all 0.18s ease;
  cursor: default;
  min-width: 0;
  min-height: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
}
.dash-grid-cell:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);
  transform: translateY(-1px);
}
.dash-grid-cell.clickable {
  cursor: pointer;
}
.dash-grid-cell.clickable:hover {
  border-color: rgba(0,0,0,0.10);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
}
.dash-grid-cell.hero-cell {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
}
.dash-grid-cell.hero-cell:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);
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
  font-weight: 600;
  color: #14532D;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  line-height: 1;
  white-space: nowrap;
  padding: 0 2px;
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
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  overflow: hidden;
  transition: all 0.18s ease;
  min-width: 0;
  min-height: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
}
.dash-chart-cell:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);
}
.dash-checklist-cell {
  background: #FFFFFF;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  overflow: hidden;
  transition: all 0.18s ease;
  cursor: pointer;
  min-width: 0;
  min-height: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
}
.dash-checklist-cell:hover {
  border-color: rgba(0,0,0,0.10);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
  transform: translateY(-1px);
}
.manager-badge {
  font-size: 8px;
  font-weight: 600;
  color: #9CA3AF;
  background: rgba(0,0,0,0.04);
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
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
  background: rgba(255,255,255,0.65);
  border-radius: 10px;
  border: 1.5px dashed rgba(0,0,0,0.10);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  gap: 3px;
  overflow: hidden;
  transition: all 0.18s ease;
  cursor: pointer;
  min-width: 0;
  min-height: 0;
}
.dash-quick-link:hover {
  background: rgba(255,255,255,0.95);
  border-color: rgba(0,0,0,0.18);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transform: translateY(-1px);
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Timeframe config
   ═══════════════════════════════════════════════════════════════════════════ */
const RANGES = [
  { key: "today",     label: "Today" },
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
   ═══════════════════════════════════════════════════════════════════════════ */
function DashGrid({ children }) {
  const COL_GAP = 6;
  const ROW_GAP = 5;
  const LABEL_H = 16;
  const COLS = 9;
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
function ChartFill({ chartData, color, compareColor, animEpoch, id, dateLabels,
  useRawPoints, lineType, solidFill, fillColor, fillOpacity, showGuideLines, showDots, dotRadius,
}) {
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
        useRawPoints={useRawPoints}
        lineType={lineType}
        solidFill={solidFill}
        fillColor={fillColor}
        fillOpacity={fillOpacity}
        showGuideLines={showGuideLines}
        showDots={showDots}
        dotRadius={dotRadius}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WRAPPER — shows loading while metrics fetch (instant from Supabase)
   ═══════════════════════════════════════════════════════════════════════════ */

export default function DashboardPage(props) {
  const { data, locationId } = props;

  // Show loader only if we have no data context at all
  if (!data) {
    return (
      <div style={{
        height: "calc(100vh - 64px)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#FAFAF9",
      }}>
        <K9LoadingAnimation size={64} message="Loading dashboard..." subMessage="Connecting to server" />
      </div>
    );
  }

  return <DashboardContent {...props} locationId={locationId} refreshOptions={props.refreshOptions} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT — reads from pre-computed dashboard_metrics_daily.
   No 136K iteration. No useMemo compute chains. Pure view layer.
   ═══════════════════════════════════════════════════════════════════════════ */

function DashboardContent({
  data, save, nav, profile, addGlobalToast, locationId, refreshOptions,
  showSnapshot, showRevenue, showFunnel, showLTV,
  showRevenueComposition, showRevenueByCategory, showDiscountAnalysis,
  showTopClients, showOps, showFunnelMetrics, showHeroKPIs,
}) {
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [animEpoch, setAnimEpoch] = useState(0);
  const [showPriorPeriod, setShowPriorPeriod] = useState(true);
  const today = todayStr();

  /* ─── Stable nav callbacks ─── */
  const navTo = useMemo(() => {
    if (!nav) return {};
    const pages = ["checkout-tv", "ops-bathing", "settings", "lifecycle", "funnel",
      "ops-opening", "ops-fe", "ops-be", "ops-rooms", "ops-closing",
      "ops-pamper", "ops-pp", "ops-svc", "eod", "photos", "cash-tips",
      "checkout-notes", "inventory", "test-health", "reports",
      "enterprise-ops"];
    const map = {};
    pages.forEach(p => { map[p] = () => nav(p); });
    return map;
  }, [nav]);

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
    // Decouple animation from data loading: update range in a transition
    // so the pill slider animates immediately while data loads in background
    startTransition(() => {
      setRange(key);
    });
    if (key === "custom") setShowCalendar(true);
    else setShowCalendar(false);
  };

  /* ─── Date range computation ──────────────────────────────────────── */
  const { dateFrom, dateTo, days, prevFrom, prevTo } = useMemo(() => {
    const now = new Date();
    const end = today;
    let start;
    switch (range) {
      case "today": start = today; break;
      case "wtd": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); start = d.toISOString().split("T")[0]; break; }
      case "past-week": start = addDays(today, -6); break;
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

  /* ─── SERVER-SIDE METRICS (the magic — no client-side iteration) ─── */
  const { metrics, prevMetrics, dailyRows, prevDailyRows, loading: metricsLoading, lastUpdated, lastFetchedAt, refresh } = useDashboardMetrics(
    locationId, dateFrom, dateTo, prevFrom, prevTo, refreshOptions
  );

  const m = metrics || {};
  const pm = prevMetrics || {};
  const showSkeleton = !metrics && metricsLoading;

  /* ─── Lifecycle metrics — still from client data (these need client state) ─── */
  // Lifecycle/funnel metrics require client lifecycle state which isn't in the daily table.
  // These are lightweight — only counting client records, not iterating 136K reservations.
  const emptyFunnel = { remainingLeads: 0, remainingAtRisk: 0, todayOutreaches: 0, todayConversions: 0, firstTimePayers: 0, todayNewLeads: 0, conversionRate: 0, avgLTV: 0, totalLTV: 0, spendingClientsCount: 0 };

  const funnelMetrics = useMemo(() => {
    if (!data?.clients) return emptyFunnel;
    return computeLifecycleMetrics(data, dateFrom, dateTo, today);
  }, [data?.clients, data?.serverStats, data?.reservations, data?.resortPolicies, dateFrom, dateTo, today]);

  const prevFunnelMetrics = useMemo(() => {
    if (!data?.clients) return emptyFunnel;
    const yesterday = addDays(today, -1);
    return computeLifecycleMetrics(data, prevFrom, prevTo, yesterday);
  }, [data?.clients, data?.serverStats, data?.reservations, data?.resortPolicies, prevFrom, prevTo, today]);

  /* ─── Ops progress (lazy — deferred until checklist section is visible) ── */
  const dataProxy = useMemo(() => ({
    reservations: data?.reservations,
    clients: data?.clients,
    serverStats: data?.serverStats,
    resortPolicies: data?.resortPolicies,
    rooms: data?.rooms,
    dogs: data?.dogs,
    dailyOps: data?.dailyOps,
  }), [data?.reservations, data?.clients, data?.serverStats, data?.resortPolicies, data?.rooms, data?.dogs, data?.dailyOps]);

  const { ref: opsVisRef, value: lazyOpsProgress, isVisible: opsVisible } = useLazyCompute(
    () => computeOpsProgress(dataProxy, today),
    [dataProxy, today]
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

  /* ─── Service data (today only — matches OperationsHub Services section) ─── */
  const svcData = useMemo(() => {
    if (!data?.reservations) return { bathsTotal: 0, bathsDone: 0, ppTotal: 0, ppCompleted: 0, pamperTotal: 0, pamperDone: 0, iceCreamTotal: 0, iceCreamDone: 0 };
    const sm = computeServiceMetrics(dataProxy, today);
    return {
      bathsTotal: sm.bathsTotal, bathsDone: sm.bathsDone,
      ppTotal: sm.ppTotal, ppCompleted: sm.ppCompleted,
      pamperTotal: sm.pamperTotal, pamperDone: sm.pamperDone,
      iceCreamTotal: sm.iceCreamTotal, iceCreamDone: sm.iceCreamDone,
    };
  }, [dataProxy, today]);

  /* ─── Chart data from pre-computed daily rows ─── */
  const bucketMode = useMemo(() => {
    if (range === "ytd" || range === "lifetime" || days > 180) return "monthly";
    if (range === "qtd" || days > 60) return "weekly";
    return "daily";
  }, [range, days]);

  const bucketRows = useCallback((rows, valueField) => {
    if (!rows || rows.length === 0) return [];
    if (bucketMode === "daily") {
      return rows.map(r => ({
        date: r.metric_date,
        label: fmtDateLabel(r.metric_date),
        value: Number(r[valueField]) || 0,
        prevValue: 0,
      }));
    }
    if (bucketMode === "monthly") {
      const buckets = {};
      rows.forEach(r => {
        const key = r.metric_date.slice(0, 7);
        if (!buckets[key]) buckets[key] = { date: key, label: new Date(r.metric_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" }), value: 0, prevValue: 0 };
        buckets[key].value += Number(r[valueField]) || 0;
      });
      return Object.values(buckets);
    }
    // weekly
    const buckets = {};
    rows.forEach(r => {
      const dt = new Date(r.metric_date + "T00:00:00");
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - dt.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!buckets[key]) buckets[key] = { date: key, label: fmtDateLabel(key), value: 0, prevValue: 0 };
      buckets[key].value += Number(r[valueField]) || 0;
    });
    return Object.values(buckets);
  }, [bucketMode]);

  const cashChartData = useMemo(() => bucketRows(dailyRows, "cash_total_revenue"), [dailyRows, bucketRows]);
  const accrualChartData = useMemo(() => bucketRows(dailyRows, "accrual_total_revenue"), [dailyRows, bucketRows]);

  /* ─── Trend helper ─── */
  const pctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  /* ─── "Updated X min ago" ─── */
  const updatedAgo = useMemo(() => {
    if (!lastUpdated) return "";
    const diff = Math.round((Date.now() - new Date(lastUpdated).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.round(diff / 60)}h ago`;
  }, [lastUpdated]);

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */
  const bookingsTrend = pctChange(m.cashTransactionCount, pm.cashTransactionCount);

  // Revenue values from server metrics
  const revenue = m.accrualTotalRevenue || 0;
  const prevRevenue = pm.accrualTotalRevenue || 0;
  const revenueTrend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const boardingPct = m.boardingPct || 0;
  const daycarePct = m.daycarePct || 0;

  return (
    <div style={{
      height: "calc(100vh - 64px)", overflow: "hidden",
      display: "flex", flexDirection: "column",
      fontFamily: "inherit", padding: "0",
      background: "#FAFAF9",
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
            Dashboard
          </h1>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: metricsLoading ? C.warn : C.suc, animation: metricsLoading ? "dashPulse 1s infinite" : "dashPulse 2s infinite" }} />
          <span style={{ fontSize: 9, color: C.textMut, fontWeight: 500 }}>
            {dateFrom === dateTo ? fmtDateLabel(dateFrom) : `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)} · ${days}d`}
          </span>
          {updatedAgo && (
            <span style={{ fontSize: 8, color: C.textMut, fontWeight: 500, opacity: 0.7 }}>
              Updated {updatedAgo}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={metricsLoading}
            style={{
              padding: "2px 6px", borderRadius: 4,
              border: `1px solid rgba(20,83,45,0.12)`,
              background: "rgba(255,255,255,0.8)",
              color: C.textMut, fontSize: 8, fontWeight: 600,
              cursor: metricsLoading ? "default" : "pointer",
              fontFamily: "inherit", opacity: metricsLoading ? 0.5 : 1,
              transition: "all 0.12s",
            }}
            title="Refresh data from Gingr"
          >
            ↻ Refresh
          </button>
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
          <span className="dash-section-label">{
            range === "today" ? "Today's Snapshot" :
            range === "wtd" ? "WTD Snapshot" :
            range === "past-week" ? "Past Week Snapshot" :
            range === "mtd" ? "MTD Snapshot" :
            range === "past-30" ? "Past 30 Days Snapshot" :
            range === "qtd" ? "QTD Snapshot" :
            range === "ytd" ? "YTD Snapshot" :
            range === "lifetime" ? "Lifetime Snapshot" :
            range === "custom" ? "Custom Range Snapshot" :
            "Today's Snapshot"
          }</span>
        </div>
        <div ref={opsVisRef} style={{ gridColumn: "8", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
          <span className="dash-section-label">Checklists</span>
        </div>
        <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
          <span className="dash-section-label">Services</span>
        </div>

        {/* ═══ ROW 1: Gingr Data ═══ */}
        <MetricCell label="Expected" value={m.dogsExpected} hero onClick={navTo["checkout-tv"]} trend={showPriorPeriod ? pctChange(m.dogsExpected, pm.dogsExpected) : null} skeleton={showSkeleton} />
        <MetricCell label="In House" value={m.dogsInHouse} hero sub={`${m.boardingInHouse}B · ${m.daycareInHouse}D`} onClick={navTo["checkout-tv"]} trend={showPriorPeriod ? pctChange(m.dogsInHouse, pm.dogsInHouse) : null} skeleton={showSkeleton} />
        {days > 1
          ? <CanceledCell key={animEpoch} value={Math.max(0, (m.dogsExpected || 0) - (m.dogsInHouse || 0))} onClick={navTo["ops-bathing"]} animKey={animEpoch} />
          : <MetricCell label="Going Home" value={m.dogsGoingHome} hero onClick={navTo["ops-bathing"]} trend={showPriorPeriod ? pctChange(m.dogsGoingHome, pm.dogsGoingHome) : null} skeleton={showSkeleton} />
        }
        <MetricCell label="Occupancy" value={`${days > 1 ? Math.round(m.occupancyRate || 0) : (m.occupancyPct || 0)}%`} hero onClick={navTo["settings"]} trend={showPriorPeriod ? pctChange(days > 1 ? Math.round(m.occupancyRate || 0) : (m.occupancyPct || 0), days > 1 ? Math.round(pm.occupancyRate || 0) : (pm.occupancyPct || 0)) : null} skeleton={showSkeleton} />
        <MetricCell label="Bookings" value={m.bookingsToday} hero skeleton={showSkeleton} />
        <MetricCell label="Tours" value={m.toursToday} hero onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(m.toursToday, pm.toursToday) : null} skeleton={showSkeleton} />
        <MetricCell label="Evals" value={m.evalsToday} hero onClick={navTo["lifecycle"]} skeleton={showSkeleton} />
        <ChecklistCell label="Opening" progress={getChecklistProgress("ops-opening")} count={getChecklistCount("ops-opening")} onClick={navTo["ops-opening"]} />
        <ServiceCell label="Baths" done={svcData.bathsDone} total={svcData.bathsTotal} onClick={navTo["ops-bathing"]} />

        {/* ─── Section Label: Customer Lifecycle ─── */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <span className="dash-section-label">Customer Lifecycle</span>
        </div>
        <div style={{ gridColumn: "8 / 10" }} />

        {/* ═══ ROW 2: Customer Lifecycle ═══ */}
        <MetricCell label="Remaining Leads" value={funnelMetrics.remainingLeads} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.remainingLeads, prevFunnelMetrics.remainingLeads) : null} />
        <MetricCell label="Lapsed" value={funnelMetrics.remainingAtRisk} onClick={navTo["lifecycle"]} />
        <MetricCell label="Outreaches" value={funnelMetrics.todayOutreaches} onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayOutreaches, prevFunnelMetrics.todayOutreaches) : null} />
        <MetricCell label="Converted" value={funnelMetrics.todayConversions} color={funnelMetrics.todayConversions > 0 ? C.suc : undefined} onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayConversions, prevFunnelMetrics.todayConversions) : null} />
        <MetricCell label="First-Time Spenders" value={funnelMetrics.firstTimePayers} onClick={navTo["lifecycle"]} />
        <MetricCell label="Conversion Rate" value={`${funnelMetrics.conversionRate.toFixed(1)}%`} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.conversionRate, prevFunnelMetrics.conversionRate) : null} />
        <MetricCell label="New Leads" value={funnelMetrics.todayNewLeads} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayNewLeads, prevFunnelMetrics.todayNewLeads) : null} />
        <ChecklistCell label="Front-End" progress={getChecklistProgress("ops-fe")} count={getChecklistCount("ops-fe")} onClick={navTo["ops-fe"]} />
        <ServiceCell label="Pamper" done={svcData.pamperDone} total={svcData.pamperTotal} onClick={navTo["ops-pamper"]} />

        {/* ─── Section Label: Daily Tasks ─── */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <span className="dash-section-label">Daily Tasks</span>
        </div>
        <div style={{ gridColumn: "8 / 10" }} />

        {/* ═══ ROW 3: Daily Tasks (quick-link nav shortcuts) ═══ */}
        <QuickLinkCell label="EOD Report" icon={<I.FileText />} onClick={navTo["eod"]} />
        <QuickLinkCell label="Checkout TV" icon={<I.Monitor />} onClick={navTo["checkout-tv"]} />
        <QuickLinkCell label="Photos" icon={<I.Camera />} onClick={navTo["photos"]} />
        <QuickLinkCell label="Cash Tips" icon={<I.DollarSign />} onClick={navTo["cash-tips"]} />
        <QuickLinkCell label="Checkout Notes" icon={<I.Clipboard />} onClick={navTo["checkout-notes"]} />
        <MetricCell label="LTV" value={`$${Math.round(funnelMetrics.avgLTV).toLocaleString("en-US")}`} onClick={navTo["lifecycle"]} />
        <MetricCell label="Total Clients" value={funnelMetrics.spendingClientsCount} onClick={navTo["lifecycle"]} />
        <ChecklistCell label="Back-End" progress={getChecklistProgress("ops-be")} count={getChecklistCount("ops-be")} onClick={navTo["ops-be"]} />
        <ServiceCell label="Ice Cream" done={svcData.iceCreamDone} total={svcData.iceCreamTotal} onClick={navTo["ops-svc"]} />

        {/* ─── Section Label: Reporting ─── */}
        <div ref={financialRef} style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <span className="dash-section-label">Financial Reporting</span>
        </div>
        <div style={{ gridColumn: "8" }} />
        <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
          <span className="manager-badge">Manager Only</span>
        </div>

        {/* ═══ ROW 4: Reporting/Financial ═══ */}
        <MetricCell label="Transactions" value={m.cashTransactionCount} trend={showPriorPeriod ? bookingsTrend : null} skeleton={showSkeleton} />
        <MetricCell label="Average Transaction Price" value={`$${Math.round(m.cashAvgTransaction || 0).toLocaleString("en-US")}`} trend={showPriorPeriod ? pctChange(m.cashAvgTransaction, pm.cashAvgTransaction) : null} skeleton={showSkeleton} />
        <MetricCell label="Rev/PAR" value={`$${Math.round(m.revPAR || 0).toLocaleString("en-US")}`} trend={showPriorPeriod ? pctChange(m.revPAR, pm.revPAR) : null} skeleton={showSkeleton} />
        <MetricCell label="Refunds" value={m.refundCount} color={m.refundCount > 0 ? C.dan : undefined} trend={showPriorPeriod ? pctChange(m.refundCount, pm.refundCount) : null} skeleton={showSkeleton} />
        <MetricCell label="$ Refunded" value={`$${fmt$k(m.refundTotal)}`} color={m.refundTotal > 0 ? C.dan : undefined} skeleton={showSkeleton} />
        <MetricCell label="Discounted" value={m.discountedCount} color={m.discountedCount > 0 ? C.warn : undefined} skeleton={showSkeleton} />
        <MetricCell label="$ Discounted" value={`$${fmt$k(m.discountTotal)}`} color={m.discountTotal > 0 ? C.warn : undefined} skeleton={showSkeleton} />
        <ChecklistCell label="Room Clean" progress={getChecklistProgress("ops-rooms")} count={getChecklistCount("ops-rooms")} onClick={navTo["ops-rooms"]} />
        <MetricCell label="Outstanding Invoices" value={m.outstandingInvoiceCount || 0} sub={`$${fmt$k(m.outstandingInvoiceTotal || 0)}`} color={(m.outstandingInvoiceCount || 0) > 0 ? C.warn : undefined} skeleton={showSkeleton} />

        {/* ═══ ROWS 5-7: Charts ═══ */}
        <div className="dash-chart-cell" style={{ gridColumn: "1 / 4", gridRow: "span 3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cash Basis Revenue</span>
              <Tip text="Cash basis revenue from Gingr's GET /transactions endpoint. Shows actual money collected per day."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(m.cashTotalRevenue)}</span>
          </div>
          <ChartFill chartData={cashChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="cash-main" dateLabels={cashChartData.map(d => d.date)}
            useRawPoints lineType="linear" solidFill fillOpacity={0.18} showGuideLines showDots dotRadius={5} />
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
              <div style={{ width: `${boardingPct}%`, height: "100%", background: C.pri }} />
              <div style={{ width: `${daycarePct}%`, height: "100%", background: C.acc }} />
            </div>
            <div style={{ fontSize: 8, color: C.textMut, textAlign: "center", lineHeight: 1.4 }}>
              <div><span style={{ color: C.pri, fontWeight: 700 }}>{boardingPct.toFixed(0)}%</span> Board</div>
              <div><span style={{ color: C.acc, fontWeight: 700 }}>{daycarePct.toFixed(0)}%</span> Day</div>
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
              <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Accrual Revenue</span>
              <Tip text="Accrual revenue recognizes the full reservation cost divided evenly by the number of nights in the stay."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(revenue)}</span>
          </div>
          <ChartFill chartData={accrualChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="accrual-main" dateLabels={accrualChartData.map(d => d.date)}
            useRawPoints lineType="linear" solidFill fillOpacity={0.18} showGuideLines showDots dotRadius={5} />
        </div>

        {/* Col 8: Private Play (row 5) */}
        <ServiceCell label="Private Play" done={svcData.ppCompleted} total={svcData.ppTotal} onClick={navTo["ops-pp"]} />

        {/* Col 9: Inventory (row 5) */}
        <QuickLinkCell label="Inventory" icon={<I.Package />} onClick={navTo["inventory"]} />

        {/* Col 8: Closing (row 6) */}
        <ChecklistCell label="Closing" progress={getChecklistProgress("ops-closing")} count={getChecklistCount("ops-closing")} onClick={navTo["ops-closing"]} />

        {/* Col 9: Test Health (row 6) */}
        <MetricCell label="Test Health" value="172" sub="100% pass" onClick={navTo["test-health"]} color={C.suc} />

        {/* Row 7: Col 8-9 empty */}
        <div className="dash-grid-cell empty-cell" />
        <div className="dash-grid-cell empty-cell" />
      </DashGrid>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Grid Cell Components
   ═══════════════════════════════════════════════════════════════════════════ */

/* CanceledCell — animated transition from "Going Home" to "Canceled" for multi-day views */
const CanceledCell = memo(function CanceledCell({ value, onClick, animKey }) {
  return (
    <div
      className="dash-grid-cell hero-cell clickable"
      onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both", position: "relative" }}
    >
      {onClick && <LinkIcon />}
      {/* Phase 1: "Going Home" with strikethrough, then fade out */}
      <div key={`strike-${animKey}`} style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        animation: "cancelFadeOut 0.2s 0.4s forwards",
      }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: C.pri, lineHeight: 1, fontVariantNumeric: "tabular-nums lining-nums" }}>—</span>
          <div key={`bar-${animKey}`} style={{
            position: "absolute", top: "50%", left: 0, height: 2,
            background: C.dan, borderRadius: 1,
            animation: "cancelStrikethrough 0.35s 0.05s forwards",
            width: 0,
          }} />
        </div>
        <div className="dash-cell-label" style={{ color: C.textMut, position: "relative" }}>
          Going Home
          <div key={`lbar-${animKey}`} style={{
            position: "absolute", top: "50%", left: 0, height: 1.5,
            background: C.dan, borderRadius: 1,
            animation: "cancelStrikethrough 0.35s 0.05s forwards",
            width: 0,
          }} />
        </div>
      </div>
      {/* Phase 2: "Canceled" fades in after strikethrough */}
      <div key={`cancel-${animKey}`} style={{
        animation: "cancelFadeIn 0.3s 0.6s both",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <div className="dash-cell-value" style={{ color: C.dan, fontSize: 26 }}>
          <AnimatedNumber value={value} />
        </div>
        <div className="dash-cell-label" style={{ color: C.dan }}>Canceled</div>
      </div>
    </div>
  );
});

/* MetricCell — standard data cell with skeleton loading state */
const MetricCell = memo(function MetricCell({ label, value, sub, color, trend, onClick, hero, skeleton }) {
  return (
    <div
      className={`dash-grid-cell${onClick ? " clickable" : ""}${hero ? " hero-cell" : ""}`}
      onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both", position: "relative" }}
    >
      {onClick && <LinkIcon />}
      {skeleton ? (
        <>
          <div className="dash-skeleton-line" />
          <div className="dash-skeleton-label" />
        </>
      ) : (
        <>
          <div className="dash-cell-value" style={{
            color: color || C.pri,
            fontSize: 26,
          }}>
            {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
          </div>
          {trend != null && <TrendBadge value={trend} size="xs" />}
          <div className="dash-cell-label" style={hero ? { color: C.textMut } : undefined}>{label}</div>
          {sub && <div style={{ fontSize: 8, color: hero ? C.textMut : C.textMut, lineHeight: 1, marginTop: 1 }}>{sub}</div>}
        </>
      )}
    </div>
  );
});

/* ChecklistCell — progress bar + percentage */
const ChecklistCell = memo(function ChecklistCell({ label, progress, count, onClick }) {
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
});

/* ServiceCell — done/total count */
const ServiceCell = memo(function ServiceCell({ label, done, total, onClick }) {
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
});

/* QuickLinkCell — compact navigation shortcut (no data value) */
const QuickLinkCell = memo(function QuickLinkCell({ label, icon, onClick }) {
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
});

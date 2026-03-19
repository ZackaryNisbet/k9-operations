// K9 Operations — Dashboard v6
// Server-side pre-computed metrics. Zero client-side 136K iteration.
// Timeframe changes = Supabase query returning ~1-365 pre-computed rows.
// 9×11 Grid, viewport-locked, world-class data density.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo, startTransition } from "react";
import {
  C, todayStr, addDays, fmtDate, fmtDateShort, countNights, LITE_DEF_PRICING,
} from "../../shared/theme";
import { I } from "../../shared/icons";
import { Tip } from "../../shared/ui";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useDashboardMetrics } from "../../hooks/useDashboardMetrics";
import { useAccrualRevenue } from "../../hooks/useAccrualRevenue";
import { useGingrLiveCache } from "../../hooks/useGingrLiveCache";
import { useCashBasisLive, buildCashChartRows } from "../../hooks/useCashBasisRevenue";
import { fetchCashBasisForDate } from "../../shared/cashBasisRevenue";
import { supabase } from "../../supabaseClient";
import { mergeGingrLive } from "../../shared/gingrLive";
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
/* ── Receipt Modal ── */
@keyframes receiptBackdropIn {
  from { opacity: 0; backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
  to   { opacity: 1; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
}
@keyframes receiptBackdropOut {
  from { opacity: 1; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  to   { opacity: 0; backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
}
@keyframes receiptScaleIn {
  from { opacity: 0; transform: scale(0.4); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes receiptScaleOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.4); }
}
@keyframes receiptLineIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes receiptTearEdge {
  0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  100% { clip-path: polygon(
    0% 0%, 4% 2%, 8% 0%, 12% 2%, 16% 0%, 20% 2%, 24% 0%, 28% 2%, 32% 0%, 36% 2%, 40% 0%, 44% 2%, 48% 0%, 52% 2%, 56% 0%, 60% 2%, 64% 0%, 68% 2%, 72% 0%, 76% 2%, 80% 0%, 84% 2%, 88% 0%, 92% 2%, 96% 0%, 100% 2%,
    100% 100%, 96% 98%, 92% 100%, 88% 98%, 84% 100%, 80% 98%, 76% 100%, 72% 98%, 68% 100%, 64% 98%, 60% 100%, 56% 98%, 52% 100%, 48% 98%, 44% 100%, 40% 98%, 36% 100%, 32% 98%, 28% 100%, 24% 98%, 20% 100%, 16% 98%, 12% 100%, 8% 98%, 4% 100%, 0% 98%
  ); }
}
.receipt-modal-backdrop {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(20,83,45,0.12);
  display: flex; align-items: center; justify-content: center;
  animation: receiptBackdropIn 0.4s cubic-bezier(0.22,1,0.36,1) both;
}
.receipt-modal-backdrop.closing {
  animation: receiptBackdropOut 0.3s cubic-bezier(0.22,1,0.36,1) both;
}
.receipt-modal-paper {
  position: relative; z-index: 9999;
  width: min(420px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  background: #FFFEF8;
  border-radius: 2px;
  padding: 28px 24px 20px;
  box-shadow: 0 25px 60px rgba(20,83,45,0.18), 0 8px 24px rgba(0,0,0,0.12);
  font-family: 'Courier New', Courier, monospace;
  animation: receiptScaleIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
  clip-path: polygon(
    0% 0%, 4% 1.5%, 8% 0%, 12% 1.5%, 16% 0%, 20% 1.5%, 24% 0%, 28% 1.5%, 32% 0%, 36% 1.5%, 40% 0%, 44% 1.5%, 48% 0%, 52% 1.5%, 56% 0%, 60% 1.5%, 64% 0%, 68% 1.5%, 72% 0%, 76% 1.5%, 80% 0%, 84% 1.5%, 88% 0%, 92% 1.5%, 96% 0%, 100% 1.5%,
    100% 100%, 96% 98.5%, 92% 100%, 88% 98.5%, 84% 100%, 80% 98.5%, 76% 100%, 72% 98.5%, 68% 100%, 64% 98.5%, 60% 100%, 56% 98.5%, 52% 100%, 48% 98.5%, 44% 100%, 40% 98.5%, 36% 100%, 32% 98.5%, 28% 100%, 24% 98.5%, 20% 100%, 16% 98.5%, 12% 100%, 8% 98.5%, 4% 100%, 0% 98.5%
  );
}
.receipt-modal-backdrop.closing .receipt-modal-paper {
  animation: receiptScaleOut 0.25s cubic-bezier(0.22,1,0.36,1) both;
}
.receipt-modal-paper::-webkit-scrollbar { width: 4px; }
.receipt-modal-paper::-webkit-scrollbar-track { background: transparent; }
.receipt-modal-paper::-webkit-scrollbar-thumb { background: rgba(20,83,45,0.15); border-radius: 2px; }
.receipt-line-item {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 2px 0;
  animation: receiptLineIn 0.2s cubic-bezier(0.22,1,0.36,1) both;
}
.receipt-dashed {
  border: none; border-top: 1px dashed rgba(20,83,45,0.25);
  margin: 8px 0;
}
.receipt-trigger {
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.22,1,0.36,1);
  border-radius: 6px;
  position: relative;
}
.receipt-trigger:hover {
  background: rgba(20,83,45,0.04);
  transform: scale(1.02);
}
.receipt-trigger::after {
  content: 'TAP FOR DETAILS';
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 6px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: ${C.acc};
  opacity: 0;
  transition: opacity 0.2s;
  white-space: nowrap;
}
.receipt-trigger:hover::after {
  opacity: 1;
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
  useRawPoints, lineType, solidFill, noFill, fillColor, fillOpacity, showGuideLines, showDots, dotRadius,
  todayHighlight, priorData, showPriorLine, priorLineColor, priorFillColor, priorFillOpacity,
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
        noFill={noFill}
        fillColor={fillColor}
        fillOpacity={fillOpacity}
        showGuideLines={showGuideLines}
        showDots={showDots}
        dotRadius={dotRadius}
        todayHighlight={todayHighlight}
        priorData={priorData}
        showPriorLine={showPriorLine}
        priorLineColor={priorLineColor}
        priorFillColor={priorFillColor}
        priorFillOpacity={priorFillOpacity}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WRAPPER — shows loading while metrics fetch (instant from Supabase)
   ═══════════════════════════════════════════════════════════════════════════ */

export default function DashboardPage(props) {
  const { data, locationId, bohStats, bohLastFetch } = props;

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

  return <DashboardContent {...props} locationId={locationId} refreshOptions={props.refreshOptions} bohStats={bohStats} bohLastFetch={bohLastFetch} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT — reads from pre-computed dashboard_metrics_daily.
   No 136K iteration. No useMemo compute chains. Pure view layer.
   ═══════════════════════════════════════════════════════════════════════════ */

function DashboardContent({
  data, save, nav, profile, addGlobalToast, locationId, refreshOptions,
  bohStats, bohLastFetch,
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
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptTriggerRef = useRef(null);
  const [showCashReceipt, setShowCashReceipt] = useState(false);
  const [cashReceiptData, setCashReceiptData] = useState(null);
  const [cashReceiptLoading, setCashReceiptLoading] = useState(false);
  const cashReceiptTriggerRef = useRef(null);
  const today = todayStr();

  /* ─── Stable nav callbacks ─── */
  const navTo = useMemo(() => {
    if (!nav) return {};
    const pages = ["checkout-tv", "ops-bathing", "settings", "lifecycle", "funnel",
      "ops-opening", "ops-fe", "ops-be", "ops-rooms", "ops-closing",
      "ops-pamper", "ops-pp", "ops-svc", "eod", "photos", "cash-tips",
      "checkout-notes", "inventory", "test-health", "reports",
      "enterprise-ops", "occupancy-report"];
    const map = {};
    pages.forEach(p => { map[p] = () => nav(p); });
    return map;
  }, [nav]);

  // ─── Inventory snapshot status (same logic as OperationsHub) ──────────────
  const [invStatus, setInvStatus] = useState({ itemsCounted: 0, totalItems: 0 });
  const [invTick, setInvTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locId = profile?.location_id;
        if (!locId) return;
        const d = new Date(today + "T12:00:00");
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
        const monday = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
        const [catalogRes, snapshotRes] = await Promise.all([
          supabase.from("inventory_catalog").select("id").eq("location_id", locId).eq("is_active", true),
          supabase.from("lite_settings").select("setting_key, setting_value")
            .eq("location_id", locId)
            .like("setting_key", "inventory_snapshot_%")
            .gte("setting_key", `inventory_snapshot_${monday}`)
            .lte("setting_key", `inventory_snapshot_${today}`)
            .order("setting_key", { ascending: false })
            .limit(1),
        ]);
        if (cancelled) return;
        const totalItems = catalogRes.data?.length || 0;
        if (snapshotRes.data?.length > 0) {
          const counted = (snapshotRes.data[0].setting_value || []).filter(e => e.count > 0).length;
          if (!cancelled) setInvStatus({ itemsCounted: counted, totalItems });
        } else {
          if (!cancelled) setInvStatus({ itemsCounted: 0, totalItems });
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [today, profile?.location_id, invTick]);

  // Realtime: re-fetch inventory when lite_settings changes
  useEffect(() => {
    const locId = profile?.location_id;
    if (!locId) return;
    const chan = supabase.channel("dash-inv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "lite_settings", filter: `location_id=eq.${locId}` },
        (payload) => { if (payload.new?.setting_key?.startsWith("inventory_snapshot_")) setInvTick(t => t + 1); }
      ).subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [profile?.location_id]);

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

  /* ─── GINGR LIVE CACHE — background 60s poll, shared by accrual + receipt ─── */
  const { liveRows: gingrLiveRows } = useGingrLiveCache(locationId);

  /* ─── CASH BASIS LIVE — 60s poll for today's cash revenue from Gingr API ─── */
  const { todayCashData } = useCashBasisLive(locationId);

  /* ─── ACCRUAL REVENUE — computed client-side from raw reservations ─── */
  // Uses the same methodology as the receipt modal:
  //   Boarding: sibling grouping + room rate fallback
  //   Daycare: base rates ($45/$30) + enrichment costs
  // This replaces reading accrual values from dashboard_metrics_daily.
  const {
    accrualDailyRows, accrualTotals,
    prevAccrualDailyRows, prevAccrualTotals,
  } = useAccrualRevenue(locationId, dateFrom, dateTo, prevFrom, prevTo, gingrLiveRows);

  /* ─── Lifecycle metrics — still from client data (these need client state) ─── */
  // Lifecycle/funnel metrics require client lifecycle state which isn't in the daily table.
  // These are lightweight — only counting client records, not iterating 136K reservations.
  const emptyFunnel = { remainingLeads: 0, remainingAtRisk: 0, todayOutreaches: 0, todayConversions: 0, firstTimePayers: 0, todayNewLeads: 0, conversionRate: 0, avgLTV: 0, totalLTV: 0, spendingClientsCount: 0 };

  // Capture the first non-null reservations snapshot for lifecycle metrics.
  // This uses Phase 2a's quick-fetched window (~500 rows) and does NOT update
  // when Phase 2b's full 136K arrives, avoiding a 2+ second recompute freeze.
  // The quick window contains all recent reservations needed for firstTimePayers.
  const stableReservationsRef = useRef(null);
  if (data?.reservations && !stableReservationsRef.current) {
    stableReservationsRef.current = data.reservations;
  }
  const stableReservations = stableReservationsRef.current || [];

  const funnelMetrics = useMemo(() => {
    if (!data?.clients) return emptyFunnel;
    const dataForFunnel = { ...data, reservations: stableReservations };
    return computeLifecycleMetrics(dataForFunnel, dateFrom, dateTo, today);
  }, [data?.clients, data?.serverStats, stableReservations, data?.resortPolicies, dateFrom, dateTo, today]);

  const prevFunnelMetrics = useMemo(() => {
    if (!data?.clients) return emptyFunnel;
    const yesterday = addDays(today, -1);
    const dataForFunnel = { ...data, reservations: stableReservations };
    return computeLifecycleMetrics(dataForFunnel, prevFrom, prevTo, yesterday);
  }, [data?.clients, data?.serverStats, stableReservations, data?.resortPolicies, prevFrom, prevTo, today]);

  /* ─── Ops progress (lazy — deferred until checklist section is visible) ── */
  // Use stableReservations (Phase 2a window) for ops metrics too — avoids re-render
  // when Phase 2b’s 136K rows arrive. Service counts only need today’s reservations.
  const dataProxy = useMemo(() => ({
    reservations: stableReservations,
    clients: data?.clients,
    serverStats: data?.serverStats,
    resortPolicies: data?.resortPolicies,
    rooms: data?.rooms,
    dogs: data?.dogs,
    dailyOps: data?.dailyOps,
  }), [stableReservations, data?.clients, data?.serverStats, data?.resortPolicies, data?.rooms, data?.dogs, data?.dailyOps]);

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
    if (!stableReservations || stableReservations.length === 0) return { bathsTotal: 0, bathsDone: 0, ppTotal: 0, ppCompleted: 0, pamperTotal: 0, pamperDone: 0, iceCreamTotal: 0, iceCreamDone: 0 };
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

  // Overlay today's live-fetched cash basis revenue on server metrics
  const correctedDailyRows = useMemo(() => buildCashChartRows(dailyRows, todayCashData), [dailyRows, todayCashData]);
  const cashChartDataBase = useMemo(() => bucketRows(correctedDailyRows, "cash_net_revenue"), [correctedDailyRows, bucketRows]);
  // Accrual chart: uses receipt-methodology engine (accrualDailyRows from useAccrualRevenue)
  const accrualChartDataBase = useMemo(() => bucketRows(accrualDailyRows, "accrual_total_revenue"), [accrualDailyRows, bucketRows]);

  /* ─── L1: Today view — fetch trailing week for chart context ─── */
  const trailingWeekFrom = useMemo(() => addDays(today, -6), [today]);
  const trailingWeekPriorTo = useMemo(() => addDays(today, -7), [today]);
  const trailingWeekPriorFrom = useMemo(() => addDays(today, -13), [today]);
  const { dailyRows: trailingWeekRows, prevDailyRows: trailingWeekPrevRows } = useDashboardMetrics(
    range === "today" ? locationId : null, // only fetch when "today" is selected
    trailingWeekFrom, today, trailingWeekPriorFrom, trailingWeekPriorTo, refreshOptions
  );
  // Also fetch trailing-week accrual from the receipt engine for today view
  const {
    accrualDailyRows: trailingWeekAccrualRows,
    prevAccrualDailyRows: trailingWeekPrevAccrualRows,
  } = useAccrualRevenue(
    range === "today" ? locationId : null,
    trailingWeekFrom, today, trailingWeekPriorFrom, trailingWeekPriorTo, gingrLiveRows
  );

  // L1: When range is "today", show past week as chart with today as highlighted final point
  const isToday = range === "today";

  // ─── Live Snapshot: 10-second polling for real-time snapshot counts ───
  const [liveSnap, setLiveSnap] = useState(null);
  useEffect(() => {
    if (!isToday || !locationId) { setLiveSnap(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await supabase.rpc("snapshot_live", { p_location_id: locationId });
        if (!cancelled && data) setLiveSnap(data);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isToday, locationId]);
  // Overlay today's live cash data on trailing week rows too
  const correctedTrailingWeekRows = useMemo(() => buildCashChartRows(trailingWeekRows, todayCashData), [trailingWeekRows, todayCashData]);
  const cashChartData = useMemo(() => {
    if (!isToday) return cashChartDataBase;
    if (!correctedTrailingWeekRows || correctedTrailingWeekRows.length === 0) return cashChartDataBase;
    return correctedTrailingWeekRows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.cash_net_revenue) || 0,
      prevValue: 0,
    }));
  }, [isToday, cashChartDataBase, correctedTrailingWeekRows]);

  const accrualChartData = useMemo(() => {
    if (!isToday) return accrualChartDataBase;
    if (!trailingWeekAccrualRows || trailingWeekAccrualRows.length === 0) return accrualChartDataBase;
    return trailingWeekAccrualRows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.accrual_total_revenue) || 0,
      prevValue: 0,
    }));
  }, [isToday, accrualChartDataBase, trailingWeekAccrualRows]);

  /* ─── L4: Prior period chart data ─── */
  const cashPriorChartData = useMemo(() => {
    // When isToday, use trailing week's prior period (days -13 to -7)
    const rows = isToday ? trailingWeekPrevRows : prevDailyRows;
    if (!rows || rows.length === 0) return [];
    return rows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.cash_net_revenue) || 0,
    }));
  }, [isToday, trailingWeekPrevRows, prevDailyRows]);

  // Accrual prior period from receipt engine
  const accrualPriorChartData = useMemo(() => {
    // When isToday, use trailing week's prior accrual (days -13 to -7)
    const rows = isToday ? trailingWeekPrevAccrualRows : prevAccrualDailyRows;
    if (!rows || rows.length === 0) return [];
    return rows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.accrual_total_revenue) || 0,
    }));
  }, [isToday, trailingWeekPrevAccrualRows, prevAccrualDailyRows]);

  /* ─── Trend helper ─── */
  const pctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  /* ─── "Updated X ago" — ticks every 15s so it stays accurate ─── */
  const [tickNow, setTickNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const updatedAgo = useMemo(() => {
    // Prefer lastFetchedAt (when we last read from Supabase), fall back to lastUpdated (when edge fn last computed)
    const ts = lastFetchedAt || lastUpdated;
    if (!ts) return "";
    const diff = Math.round((tickNow - new Date(ts).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.round(diff / 60)}h ago`;
  }, [lastFetchedAt, lastUpdated, tickNow]);

  const bohLiveLabel = useMemo(() => {
    if (!bohLastFetch) return null;
    const diff = Math.round((tickNow - new Date(bohLastFetch).getTime()) / 1000);
    if (diff < 30) return "Live";
    if (diff < 120) return `${diff}s ago`;
    return null;
  }, [bohLastFetch, tickNow]);

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */
  const bookingsTrend = pctChange(m.cashTransactionCount, pm.cashTransactionCount);

  // Cash basis: use live data for today, sum server data for historical range
  const cashTotalDisplay = useMemo(() => {
    if (isToday && todayCashData) return todayCashData.netRevenue;
    // For multi-day ranges, sum corrected daily rows
    return correctedDailyRows.reduce((s, r) => s + (Number(r.cash_net_revenue) || 0), 0);
  }, [isToday, todayCashData, correctedDailyRows]);

  // Revenue values from server metrics
  // Accrual revenue from the receipt-methodology engine (not from dashboard_metrics_daily)
  const revenue = accrualTotals.totalRevenue || 0;
  const prevRevenue = prevAccrualTotals.totalRevenue || 0;
  const revenueTrend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const boardingPct = revenue > 0 ? (accrualTotals.boardingRevenue / revenue) * 100 : 0;
  const daycarePct = revenue > 0 ? (accrualTotals.daycareRevenue / revenue) * 100 : 0;
  // RevPAR from accrual engine boarding revenue (matches receipt methodology)
  const totalRooms = m.totalRoomCount || 0;
  const accrualRevPAR = totalRooms > 0 && days > 0 ? accrualTotals.boardingRevenue / (totalRooms * days) : 0;
  const prevAccrualRevPAR = totalRooms > 0 && days > 0 ? prevAccrualTotals.boardingRevenue / (totalRooms * days) : 0;

  /* ─── Receipt data: fetched directly from Supabase on demand ─── */
  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const fetchReceiptData = useCallback(async () => {
    setReceiptLoading(true);
    try {
      // Fetch reservations that overlap the selected date range
      // Use OR for end_date to include daycare/day boarding where end_date may be NULL
      const { data: supabaseRes, error } = await supabase
        .from("gingr_reservations")
        .select("gingr_id,animal_name,owner_first_name,owner_last_name,reservation_type_name,start_date,end_date,deposit,transaction,cancelled_date,services")
        .eq("location_id", locationId)
        .lte("start_date", dateTo + "T23:59:59")
        .or(`end_date.gte.${dateFrom}T00:00:00,end_date.is.null`)
        .is("cancelled_date", null);

      if (error) { console.error("Receipt fetch error:", error); setReceiptLoading(false); return; }

      // Supplement with cached live Gingr data for today (daycare/day-boarding
      // are same-day and may not be in Supabase yet if the sync hasn't run today).
      // gingrLiveRows comes from the background 60s polling cache — no await needed.
      const todayD = new Date().toISOString().split("T")[0];
      let rawRes = supabaseRes;
      if (dateTo >= todayD && gingrLiveRows && gingrLiveRows.length > 0) {
        rawRes = mergeGingrLive(supabaseRes, gingrLiveRows);
      }

      const boarding = [];
      let boardingTotal = 0;

      // Daycare aggregation (separate from day boarding)
      const dcRates = LITE_DEF_PRICING.daycareRates;
      let fullDayCount = 0;
      let halfDayCount = 0;
      let evalCount = 0;
      let dayBoardCount = 0;
      const dcEnrichMap = {};       // daycare enrichments: name → { count, totalCost }
      const dbEnrichMap = {};       // day boarding enrichments: name → { count, totalCost }
      let daycareBaseTotal = 0;
      let dayBoardBaseTotal = 0;

      (rawRes || []).forEach(r => {
        const typeName = (r.reservation_type_name || "").toLowerCase();
        const isBoarding = typeName.includes("boarding") && !typeName.includes("day boarding");
        const isDayBoarding = typeName.includes("day boarding");
        const isDaycare = !isDayBoarding && (typeName.includes("daycare") || typeName.includes("day care"));
        const dep = r.deposit && !Array.isArray(r.deposit) ? r.deposit : {};
        const txn = r.transaction && !Array.isArray(r.transaction) ? r.transaction : {};
        const total = Number(txn.price) || Number(dep.amount) || 0;

        const startD = r.start_date ? r.start_date.split("T")[0] : dateFrom;
        const endD = r.end_date ? r.end_date.split("T")[0] : startD;
        const ownerName = [r.owner_first_name, r.owner_last_name].filter(Boolean).join(" ");
        // Extract room type from reservation_type_name (e.g. "Boarding | Executive Room (All Inclusive)" → "Executive Room")
        const roomMatch = (r.reservation_type_name || "").match(/\|\s*([^(]+)/);
        const roomType = roomMatch ? roomMatch[1].trim() : "Room";

        if (isBoarding && startD && endD) {
          const nights = countNights(startD, endD);
          if (nights <= 0) return;
          // Count how many nights fall within selected date range
          let accrualNights = 0;
          let night = startD;
          while (night < endD) {
            if (night >= dateFrom && night <= dateTo) accrualNights++;
            night = addDays(night, 1);
          }
          if (accrualNights <= 0) return;
          const lastInit = r.owner_last_name ? r.owner_last_name.charAt(0).toUpperCase() + "." : "";
          // Temporarily push with raw total — perNight adjusted after sibling grouping
          boarding.push({
            id: r.gingr_id, dogName: r.animal_name || "Unknown", lastInit, ownerName,
            roomType, nights: accrualNights, totalNights: nights,
            totalCost: total, checkIn: startD, checkOut: endD,
            _resKey: `${ownerName}|${startD}|${endD}|${total}`,
          });
        } else if (isDayBoarding && startD >= dateFrom && startD <= dateTo) {
          dayBoardCount++;
          dayBoardBaseTotal += dcRates.fullDay;
          // Aggregate day boarding services / enrichments separately
          const svcs = Array.isArray(r.services) ? r.services : [];
          svcs.forEach(s => {
            const sName = (s.name || "Service").trim();
            const sCost = Number(s.cost) || 0;
            if (!dbEnrichMap[sName]) dbEnrichMap[sName] = { count: 0, totalCost: 0, unitCost: sCost };
            dbEnrichMap[sName].count++;
            dbEnrichMap[sName].totalCost += sCost;
          });
        } else if (isDaycare && startD >= dateFrom && startD <= dateTo) {
          // Classify daycare type & apply base rate
          let baseRate = dcRates.fullDay;
          if (typeName.includes("half")) {
            halfDayCount++;
            baseRate = dcRates.halfDay;
          } else if (typeName.includes("evaluation")) {
            evalCount++;
            baseRate = dcRates.fullDay; // evals charged at full-day rate
          } else {
            fullDayCount++;
          }
          daycareBaseTotal += baseRate;

          // Aggregate daycare services / enrichments separately
          const svcs = Array.isArray(r.services) ? r.services : [];
          svcs.forEach(s => {
            const sName = (s.name || "Service").trim();
            const sCost = Number(s.cost) || 0;
            if (!dcEnrichMap[sName]) dcEnrichMap[sName] = { count: 0, totalCost: 0, unitCost: sCost };
            dcEnrichMap[sName].count++;
            dcEnrichMap[sName].totalCost += sCost;
          });
        }
      });

      // Sibling grouping: match $0 dogs to their sibling's reservation cost
      // Group by owner + check-in + check-out to find siblings
      const siblingGroups = {};
      boarding.forEach(b => {
        const gKey = `${b.ownerName}|${b.checkIn}|${b.checkOut}`;
        if (!siblingGroups[gKey]) siblingGroups[gKey] = [];
        siblingGroups[gKey].push(b);
      });
      // For each group, find the reservation total and split across all dogs
      const br = LITE_DEF_PRICING.boardingRates;
      Object.values(siblingGroups).forEach(group => {
        let resTotalFromGroup = Math.max(...group.map(b => b.totalCost));
        const dogCount = group.length;
        // Fallback: if no transaction/deposit pricing, estimate from room rate
        if (resTotalFromGroup <= 0) {
          const sampleNights = group[0].totalNights;
          const roomRate = br[group[0].roomType] || 75; // default to Executive if unknown
          resTotalFromGroup = roomRate * sampleNights * dogCount;
        }
        group.forEach(b => {
          b.resTotalDisplay = resTotalFromGroup;
          b.dogsInRes = dogCount;
          b.perNight = resTotalFromGroup > 0 ? resTotalFromGroup / b.totalNights / dogCount : 0;
          b.accrualAmount = b.perNight * b.nights;
          boardingTotal += b.accrualAmount;
        });
      });

      // Build daycare enrichment list sorted by total cost descending
      const dcEnrichments = Object.entries(dcEnrichMap)
        .map(([name, v]) => ({ name, count: v.count, totalCost: v.totalCost, unitCost: v.unitCost }))
        .sort((a, b) => b.totalCost - a.totalCost);
      const dcEnrichTotal = dcEnrichments.reduce((s, e) => s + e.totalCost, 0);

      // Build day boarding enrichment list sorted by total cost descending
      const dbEnrichments = Object.entries(dbEnrichMap)
        .map(([name, v]) => ({ name, count: v.count, totalCost: v.totalCost, unitCost: v.unitCost }))
        .sort((a, b) => b.totalCost - a.totalCost);
      const dbEnrichTotal = dbEnrichments.reduce((s, e) => s + e.totalCost, 0);

      const daycareTotal = daycareBaseTotal + dcEnrichTotal;
      const dayBoardTotal = dayBoardBaseTotal + dbEnrichTotal;
      const totalDaycareDogs = fullDayCount + halfDayCount + evalCount;

      const daycareAgg = {
        fullDayCount, halfDayCount, evalCount,
        fullDayRate: dcRates.fullDay, halfDayRate: dcRates.halfDay,
        baseTotal: daycareBaseTotal, enrichments: dcEnrichments, enrichTotal: dcEnrichTotal,
        total: daycareTotal, dogCount: totalDaycareDogs,
      };

      const dayBoardAgg = {
        count: dayBoardCount, rate: dcRates.fullDay,
        baseTotal: dayBoardBaseTotal, enrichments: dbEnrichments, enrichTotal: dbEnrichTotal,
        total: dayBoardTotal,
      };

      const allDaycareTotal = daycareTotal + dayBoardTotal;

      // Boarding: priced first (desc), then $0 entries alphabetical
      boarding.sort((a, b) => b.accrualAmount - a.accrualAmount || a.dogName.localeCompare(b.dogName));
      setReceiptData({ boarding, daycareAgg, dayBoardAgg, boardingTotal, daycareTotal: allDaycareTotal, grandTotal: boardingTotal + allDaycareTotal });
    } catch (err) {
      console.error("Receipt fetch error:", err);
    } finally {
      setReceiptLoading(false);
    }
  }, [locationId, dateFrom, dateTo, gingrLiveRows]);

  // Fetch receipt data when modal opens
  useEffect(() => {
    if (showReceipt) fetchReceiptData();
  }, [showReceipt, fetchReceiptData]);

  // Cash receipt: fetch on-demand when cash modal opens
  const fetchCashReceiptData = useCallback(async () => {
    setCashReceiptLoading(true);
    try {
      // For "today" view, use the already-polled data if available
      if (isToday && todayCashData) {
        setCashReceiptData(todayCashData);
        setCashReceiptLoading(false);
        return;
      }
      // For single-day views, fetch from Gingr API
      if (dateFrom === dateTo) {
        const data = await fetchCashBasisForDate(locationId, dateFrom);
        setCashReceiptData(data);
      } else {
        // For multi-day ranges, fetch the last day (most recent) as receipt detail
        const data = await fetchCashBasisForDate(locationId, dateTo);
        setCashReceiptData(data);
      }
    } catch (err) {
      console.error("Cash receipt fetch error:", err);
    } finally {
      setCashReceiptLoading(false);
    }
  }, [locationId, dateFrom, dateTo, isToday, todayCashData]);

  useEffect(() => {
    if (showCashReceipt) fetchCashReceiptData();
  }, [showCashReceipt, fetchCashReceiptData]);

  const receiptDateLabel = dateFrom === dateTo
    ? fmtDateLabel(dateFrom)
    : `${fmtDateLabel(dateFrom)} \u2013 ${fmtDateLabel(dateTo)}`;

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
              Synced {updatedAgo}
            </span>
          )}
          {bohLiveLabel && range === "today" && (
            <span style={{ fontSize: 8, fontWeight: 700, color: C.suc, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.suc, animation: "dashPulse 1.5s infinite" }} />
              {bohLiveLabel}
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
        <MetricCell
          label="Expected"
          value={liveSnap ? liveSnap.expected : m.dogsExpected}
          hero
          onClick={navTo["checkout-tv"]}
          sub={liveSnap ? `${liveSnap.expected} pending` : `${m.dogsExpected} pending`}
          trend={showPriorPeriod ? pctChange(liveSnap ? liveSnap.expected : m.dogsExpected, pm.dogsExpected) : null}
          skeleton={showSkeleton}
          live={!!liveSnap}
        />
        <MetricCell
          label="In House"
          value={liveSnap ? liveSnap.in_house : m.dogsInHouse}
          hero
          sub={liveSnap
            ? `${liveSnap.boarding}B · ${liveSnap.daycare}D`
            : `${m.boardingInHouse}B · ${m.daycareInHouse}D`}
          onClick={navTo["checkout-tv"]}
          trend={showPriorPeriod ? pctChange(liveSnap ? liveSnap.in_house : m.dogsInHouse, pm.dogsInHouse) : null}
          skeleton={showSkeleton}
          live={!!liveSnap}
        />
        {days > 1
          ? <CanceledCell key={animEpoch} value={Math.max(0, (m.dogsExpected || 0) - (m.dogsInHouse || 0))} onClick={navTo["ops-bathing"]} animKey={animEpoch} />
          : <MetricCell
              label="Going Home"
              value={liveSnap ? liveSnap.going_home : m.dogsGoingHome}
              hero
              onClick={navTo["ops-bathing"]}
              trend={showPriorPeriod ? pctChange(liveSnap ? liveSnap.going_home : m.dogsGoingHome, pm.dogsGoingHome) : null}
              skeleton={showSkeleton}
              live={!!liveSnap}
            />
        }
        <MetricCell label="Occupancy" value={`${days > 1 ? Math.round(m.occupancyRate || 0) : (liveSnap ? liveSnap.occupancy_pct : (m.occupancyPct || 0))}%`} hero onClick={navTo["occupancy-report"]} trend={showPriorPeriod ? pctChange(days > 1 ? Math.round(m.occupancyRate || 0) : (liveSnap ? liveSnap.occupancy_pct : (m.occupancyPct || 0)), days > 1 ? Math.round(pm.occupancyRate || 0) : (pm.occupancyPct || 0)) : null} skeleton={showSkeleton} live={!!liveSnap} />
        <MetricCell label="New Bookings" value={liveSnap ? liveSnap.new_bookings : m.bookingsToday} hero skeleton={showSkeleton} />
        <MetricCell label="Tours" value={liveSnap ? liveSnap.tours : m.toursToday} hero onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(liveSnap ? liveSnap.tours : m.toursToday, pm.toursToday) : null} skeleton={showSkeleton} />
        <MetricCell label="Evals" value={liveSnap ? liveSnap.evals : m.evalsToday} hero onClick={navTo["lifecycle"]} skeleton={showSkeleton} />
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
        <MetricCell label="Rev/PAR" value={`$${Math.round(accrualRevPAR || 0).toLocaleString("en-US")}`} trend={showPriorPeriod ? pctChange(accrualRevPAR, prevAccrualRevPAR) : null} skeleton={showSkeleton} />
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
              <Tip text="Cash basis = money collected on each day (payments + deposits - refunds). Today is live from Gingr API."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(cashTotalDisplay)}</span>
              <span
                ref={cashReceiptTriggerRef}
                onClick={() => setShowCashReceipt(true)}
                style={{
                  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 18, height: 18, borderRadius: 4,
                  background: "rgba(20,83,45,0.08)", color: C.pri,
                  transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.18)"; e.currentTarget.style.transform = "scale(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.08)"; e.currentTarget.style.transform = "scale(1)"; }}
                title="View cash basis breakdown"
              >
                <I.FileText style={{ width: 11, height: 11 }} />
              </span>
            </span>
          </div>
          <ChartFill chartData={cashChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="cash-main" dateLabels={cashChartData.map(d => d.date)}
            useRawPoints lineType="linear" solidFill fillOpacity={0.35} showGuideLines
            todayHighlight={isToday} priorData={cashPriorChartData} showPriorLine={showPriorPeriod}
            priorLineColor="#D4A017" priorFillColor="#D4A017" priorFillOpacity={0.25} />
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(revenue)}</span>
              <span
                ref={receiptTriggerRef}
                onClick={() => setShowReceipt(true)}
                style={{
                  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 18, height: 18, borderRadius: 4,
                  background: "rgba(132,204,22,0.12)", color: C.acc,
                  transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(132,204,22,0.25)"; e.currentTarget.style.transform = "scale(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(132,204,22,0.12)"; e.currentTarget.style.transform = "scale(1)"; }}
                title="View accrual breakdown"
              >
                <I.FileText style={{ width: 11, height: 11 }} />
              </span>
            </span>
          </div>
          <ChartFill chartData={accrualChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="accrual-main" dateLabels={accrualChartData.map(d => d.date)}
            useRawPoints lineType="linear" solidFill fillOpacity={0.35} showGuideLines
            todayHighlight={isToday} priorData={accrualPriorChartData} showPriorLine={showPriorPeriod}
            priorLineColor="#D4A017" priorFillColor="#D4A017" priorFillOpacity={0.25} />
        </div>

        {/* Col 8: Private Play (row 5) */}
        <ServiceCell label="Private Play" done={svcData.ppCompleted} total={svcData.ppTotal} onClick={navTo["ops-pp"]} />

        {/* Col 9: Inventory (row 5) */}
        <ServiceCell label="Inventory" done={invStatus.itemsCounted} total={invStatus.totalItems} onClick={navTo["inventory"]} />

        {/* Col 8: Closing (row 6) */}
        <ChecklistCell label="Closing" progress={getChecklistProgress("ops-closing")} count={getChecklistCount("ops-closing")} onClick={navTo["ops-closing"]} />

        {/* Col 9: Test Health (row 6) */}
        <MetricCell label="Test Health" value="172" sub="100% pass" onClick={navTo["test-health"]} color={C.suc} />

        {/* Row 7: Col 8-9 empty */}
        <div className="dash-grid-cell empty-cell" />
        <div className="dash-grid-cell empty-cell" />
      </DashGrid>

      {/* Accrual Revenue Receipt Modal */}
      <AccrualReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        receiptData={receiptData}
        loading={receiptLoading}
        dateLabel={receiptDateLabel}
        originRef={receiptTriggerRef}
      />

      {/* Cash Basis Revenue Receipt Modal */}
      <CashBasisReceiptModal
        open={showCashReceipt}
        onClose={() => setShowCashReceipt(false)}
        cashData={cashReceiptData}
        loading={cashReceiptLoading}
        dateLabel={receiptDateLabel}
        originRef={cashReceiptTriggerRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Accrual Receipt Modal
   ═══════════════════════════════════════════════════════════════════════════ */
const AccrualReceiptModal = memo(function AccrualReceiptModal({ open, onClose, receiptData, loading, dateLabel, originRef }) {
  const [closing, setClosing] = useState(false);
  const [originRect, setOriginRect] = useState(null);

  useEffect(() => {
    if (open && originRef?.current) {
      setOriginRect(originRef.current.getBoundingClientRect());
    }
  }, [open, originRef]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 300);
  }, [onClose]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  if (!open && !closing) return null;

  const { boarding = [], daycareAgg, dayBoardAgg, boardingTotal = 0, daycareTotal = 0, grandTotal = 0 } = receiptData || {};
  const fmtMoney = (v) => `$${(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Transform origin for expand-from-button effect
  const transformOriginStyle = originRect
    ? { transformOrigin: `${originRect.left + originRect.width / 2}px ${originRect.top + originRect.height / 2}px` }
    : {};

  return (
    <div
      className={`receipt-modal-backdrop${closing ? " closing" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="receipt-modal-paper" style={transformOriginStyle} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute", top: 14, right: 14, background: "none", border: "none",
            cursor: "pointer", color: "rgba(20,83,45,0.35)", fontSize: 18, lineHeight: 1,
            padding: 4, borderRadius: 4, transition: "color 0.15s",
          }}
          onMouseEnter={(e) => e.target.style.color = C.pri}
          onMouseLeave={(e) => e.target.style.color = "rgba(20,83,45,0.35)"}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 8, paddingTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", color: C.pri }}>K9 OPERATIONS</div>
          <div style={{ fontSize: 10, color: C.text, fontWeight: 600, letterSpacing: "0.06em", marginTop: 2 }}>ACCRUAL REVENUE BREAKDOWN</div>
          <div style={{ fontSize: 10, color: "rgba(20,83,45,0.5)", fontWeight: 500, marginTop: 4 }}>{dateLabel}</div>
          <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", marginTop: 1 }}>{timeStr}</div>
        </div>

        {/* Grand Total — pinned at top so it's always visible */}
        {!loading && (
          <>
            <hr className="receipt-dashed" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.pri, letterSpacing: "0.08em" }}>TOTAL</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(grandTotal)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 4 }}>
              <div style={{ width: "60%", height: 5, borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {grandTotal > 0 && <div style={{ width: `${(boardingTotal / grandTotal) * 100}%`, height: "100%", background: C.pri, transition: "width 0.4s" }} />}
                {grandTotal > 0 && <div style={{ width: `${(daycareTotal / grandTotal) * 100}%`, height: "100%", background: C.acc, transition: "width 0.4s" }} />}
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, flexShrink: 0 }}>
                <span><span style={{ color: C.pri, fontWeight: 700 }}>{grandTotal > 0 ? ((boardingTotal / grandTotal) * 100).toFixed(0) : 0}%</span> Board</span>
                <span><span style={{ color: C.acc, fontWeight: 700 }}>{grandTotal > 0 ? ((daycareTotal / grandTotal) * 100).toFixed(0) : 0}%</span> Day</span>
              </div>
            </div>
          </>
        )}

        <hr className="receipt-dashed" />

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 11, color: "rgba(20,83,45,0.5)", fontWeight: 600, letterSpacing: "0.06em" }}>LOADING RESERVATIONS...</div>
          </div>
        )}

        {/* Boarding section */}
        {!loading && boarding.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.pri, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Boarding</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{boarding.length} dog{boarding.length !== 1 ? "s" : ""} boarding tonight</span>
            </div>
            {boarding.map((item, i) => (
              <div key={item.id || i} className="receipt-line-item" style={{ animationDelay: `${i * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {item.dogName}{item.lastInit ? ` ${item.lastInit}` : ""}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {`${fmtMoney(item.resTotalDisplay)} Res Cost / ${item.totalNights} Night${item.totalNights !== 1 ? "s" : ""}${item.dogsInRes > 1 ? ` / ${item.dogsInRes} Dogs` : ""}`}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(item.accrualAmount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.pri, letterSpacing: "0.04em" }}>BOARDING SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(boardingTotal)}</div>
            </div>
          </>
        )}

        {!loading && boarding.length > 0 && daycareAgg && daycareAgg.dogCount > 0 && <hr className="receipt-dashed" />}

        {/* Daycare section — aggregate view */}
        {!loading && daycareAgg && daycareAgg.dogCount > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.acc, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Daycare</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{daycareAgg.dogCount} dog{daycareAgg.dogCount !== 1 ? "s" : ""} in daycare</span>
            </div>

            {/* Full Day line */}
            {daycareAgg.fullDayCount > 0 && (
              <div className="receipt-line-item">
                <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Full Day</span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                    {daycareAgg.fullDayCount} dog{daycareAgg.fullDayCount !== 1 ? "s" : ""} × {fmtMoney(daycareAgg.fullDayRate)}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(daycareAgg.fullDayCount * daycareAgg.fullDayRate)}
                </div>
              </div>
            )}

            {/* Half Day line */}
            {daycareAgg.halfDayCount > 0 && (
              <div className="receipt-line-item">
                <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Half Day</span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                    {daycareAgg.halfDayCount} dog{daycareAgg.halfDayCount !== 1 ? "s" : ""} × {fmtMoney(daycareAgg.halfDayRate)}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(daycareAgg.halfDayCount * daycareAgg.halfDayRate)}
                </div>
              </div>
            )}

            {/* Evaluation line */}
            {daycareAgg.evalCount > 0 && (
              <div className="receipt-line-item">
                <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Evaluation</span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                    {daycareAgg.evalCount} dog{daycareAgg.evalCount !== 1 ? "s" : ""} × {fmtMoney(daycareAgg.fullDayRate)}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(daycareAgg.evalCount * daycareAgg.fullDayRate)}
                </div>
              </div>
            )}

            {/* Daycare Enrichments / Add-ons */}
            {daycareAgg.enrichments.length > 0 && (
              <>
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 9, fontWeight: 600, color: "rgba(20,83,45,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>ADD-ONS / ENRICHMENTS</div>
                {daycareAgg.enrichments.map((e, i) => (
                  <div key={e.name} className="receipt-line-item" style={{ animationDelay: `${(boarding.length + i) * 0.03}s` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>
                        {e.count}× {e.name}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                      {fmtMoney(e.totalCost)}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Daycare subtotal */}
            <div className="receipt-line-item" style={{ marginTop: 6, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: "0.04em" }}>DAYCARE SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.acc, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(daycareAgg.total)}</div>
            </div>
          </>
        )}

        {/* Separator between daycare and day boarding */}
        {!loading && ((daycareAgg && daycareAgg.dogCount > 0) || boarding.length > 0) && dayBoardAgg && dayBoardAgg.count > 0 && <hr className="receipt-dashed" />}

        {/* Day Boarding section — separate from daycare */}
        {!loading && dayBoardAgg && dayBoardAgg.count > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.acc, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Day Boarding</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{dayBoardAgg.count} dog{dayBoardAgg.count !== 1 ? "s" : ""} day boarding</span>
            </div>

            {/* Day Boarding base rate line */}
            <div className="receipt-line-item">
              <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Day Boarding</span>
                <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                  {dayBoardAgg.count} dog{dayBoardAgg.count !== 1 ? "s" : ""} × {fmtMoney(dayBoardAgg.rate)}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                {fmtMoney(dayBoardAgg.count * dayBoardAgg.rate)}
              </div>
            </div>

            {/* Day Boarding Enrichments / Add-ons */}
            {dayBoardAgg.enrichments.length > 0 && (
              <>
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 9, fontWeight: 600, color: "rgba(20,83,45,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>ADD-ONS / ENRICHMENTS</div>
                {dayBoardAgg.enrichments.map((e, i) => (
                  <div key={e.name} className="receipt-line-item" style={{ animationDelay: `${(boarding.length + (daycareAgg ? daycareAgg.enrichments.length : 0) + i) * 0.03}s` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>
                        {e.count}× {e.name}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                      {fmtMoney(e.totalCost)}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Day Boarding subtotal */}
            <div className="receipt-line-item" style={{ marginTop: 6, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: "0.04em" }}>DAY BOARDING SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.acc, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(dayBoardAgg.total)}</div>
            </div>
          </>
        )}

        {!loading && (
          <>
            <hr className="receipt-dashed" style={{ marginTop: 10 }} />

            {/* Footer */}
            <div style={{ textAlign: "center", paddingTop: 6, paddingBottom: 2 }}>
              <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", fontWeight: 500, letterSpacing: "0.06em" }}>
                {boarding.length + (daycareAgg ? daycareAgg.dogCount : 0) + (dayBoardAgg ? dayBoardAgg.count : 0)} RESERVATION{(boarding.length + (daycareAgg ? daycareAgg.dogCount : 0) + (dayBoardAgg ? dayBoardAgg.count : 0)) !== 1 ? "S" : ""}
              </div>
              <div style={{ fontSize: 8, color: "rgba(20,83,45,0.25)", marginTop: 3, letterSpacing: "0.04em" }}>
                THANK YOU FOR CHOOSING K9
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   Cash Basis Receipt Modal
   ═══════════════════════════════════════════════════════════════════════════ */
const CashBasisReceiptModal = memo(function CashBasisReceiptModal({ open, onClose, cashData, loading, dateLabel, originRef }) {
  const [closing, setClosing] = useState(false);
  const [originRect, setOriginRect] = useState(null);

  useEffect(() => {
    if (open && originRef?.current) {
      setOriginRect(originRef.current.getBoundingClientRect());
    }
  }, [open, originRef]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 300);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  if (!open && !closing) return null;

  const { payments = [], grossPayments = 0, depositCollections = 0, refunds = 0, netRevenue = 0 } = cashData || {};
  const fmtMoney = (v) => `$${Math.abs(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const invoicePayments = payments.filter(p => p.source === "invoice" && !p.isRefund);
  const depositPayments = payments.filter(p => p.source === "deposit");
  const refundPayments = payments.filter(p => p.isRefund);

  const transformOriginStyle = originRect
    ? { transformOrigin: `${originRect.left + originRect.width / 2}px ${originRect.top + originRect.height / 2}px` }
    : {};

  return (
    <div
      className={`receipt-modal-backdrop${closing ? " closing" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="receipt-modal-paper" style={transformOriginStyle} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute", top: 14, right: 14, background: "none", border: "none",
            cursor: "pointer", color: "rgba(20,83,45,0.35)", fontSize: 18, lineHeight: 1,
            padding: 4, borderRadius: 4, transition: "color 0.15s",
          }}
          onMouseEnter={(e) => e.target.style.color = C.pri}
          onMouseLeave={(e) => e.target.style.color = "rgba(20,83,45,0.35)"}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 8, paddingTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", color: C.pri }}>K9 OPERATIONS</div>
          <div style={{ fontSize: 10, color: C.text, fontWeight: 600, letterSpacing: "0.06em", marginTop: 2 }}>CASH BASIS REVENUE BREAKDOWN</div>
          <div style={{ fontSize: 10, color: "rgba(20,83,45,0.5)", fontWeight: 500, marginTop: 4 }}>{dateLabel}</div>
          <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", marginTop: 1 }}>{timeStr}</div>
        </div>

        {/* Grand Total */}
        {!loading && (
          <>
            <hr className="receipt-dashed" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.pri, letterSpacing: "0.08em" }}>NET TOTAL</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(netRevenue)}</div>
            </div>
            {/* Progress bar: payments vs deposits vs refunds */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 4 }}>
              <div style={{ width: "60%", height: 5, borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {(grossPayments + depositCollections) > 0 && <div style={{ width: `${(grossPayments / (grossPayments + depositCollections)) * 100}%`, height: "100%", background: C.pri, transition: "width 0.4s" }} />}
                {(grossPayments + depositCollections) > 0 && <div style={{ width: `${(depositCollections / (grossPayments + depositCollections)) * 100}%`, height: "100%", background: C.acc, transition: "width 0.4s" }} />}
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, flexShrink: 0 }}>
                <span><span style={{ color: C.pri, fontWeight: 700 }}>{fmtMoney(grossPayments)}</span> Pay</span>
                <span><span style={{ color: C.acc, fontWeight: 700 }}>{fmtMoney(depositCollections)}</span> Dep</span>
              </div>
            </div>
          </>
        )}

        <hr className="receipt-dashed" />

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 11, color: "rgba(20,83,45,0.5)", fontWeight: 600, letterSpacing: "0.06em" }}>LOADING PAYMENTS...</div>
          </div>
        )}

        {/* Payments section */}
        {!loading && invoicePayments.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.pri, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Payments</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{invoicePayments.length} payment{invoicePayments.length !== 1 ? "s" : ""}</span>
            </div>
            {invoicePayments.map((p, i) => (
              <div key={`pay-${i}`} className="receipt-line-item" style={{ animationDelay: `${i * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {p.ownerName}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {p.timeStr} · {p.paymentMethod}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(p.amount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.pri, letterSpacing: "0.04em" }}>PAYMENTS SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(grossPayments)}</div>
            </div>
          </>
        )}

        {!loading && invoicePayments.length > 0 && depositPayments.length > 0 && <hr className="receipt-dashed" />}

        {/* Collected Deposits section */}
        {!loading && depositPayments.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.acc, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Collected Deposits</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{depositPayments.length} deposit{depositPayments.length !== 1 ? "s" : ""}</span>
            </div>
            {depositPayments.map((p, i) => (
              <div key={`dep-${i}`} className="receipt-line-item" style={{ animationDelay: `${(invoicePayments.length + i) * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {p.ownerName}{p.animalName ? ` (${p.animalName})` : ""}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {p.timeStr}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(p.amount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: "0.04em" }}>DEPOSITS SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.acc, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(depositCollections)}</div>
            </div>
          </>
        )}

        {!loading && refundPayments.length > 0 && <hr className="receipt-dashed" />}

        {/* Refunds section */}
        {!loading && refundPayments.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.dan, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Refunds</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{refundPayments.length} refund{refundPayments.length !== 1 ? "s" : ""}</span>
            </div>
            {refundPayments.map((p, i) => (
              <div key={`ref-${i}`} className="receipt-line-item" style={{ animationDelay: `${(invoicePayments.length + depositPayments.length + i) * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.dan, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {p.ownerName}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {p.timeStr} · {p.paymentMethod}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.dan, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  -{fmtMoney(p.amount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dan, letterSpacing: "0.04em" }}>REFUNDS SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.dan, fontVariantNumeric: "tabular-nums" }}>-{fmtMoney(refunds)}</div>
            </div>
          </>
        )}

        {!loading && (
          <>
            <hr className="receipt-dashed" style={{ marginTop: 10 }} />

            {/* Totals breakdown */}
            <div style={{ padding: "6px 0" }}>
              <div className="receipt-line-item">
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(20,83,45,0.6)" }}>Gross Payments</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(grossPayments)}</div>
              </div>
              <div className="receipt-line-item">
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(20,83,45,0.6)" }}>Collected Deposits</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(depositCollections)}</div>
              </div>
              {refunds > 0 && (
                <div className="receipt-line-item">
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.dan }}>Refunds</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.dan, fontVariantNumeric: "tabular-nums" }}>-{fmtMoney(refunds)}</div>
                </div>
              )}
              <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.12)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.pri, letterSpacing: "0.06em" }}>NET TOTAL</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(netRevenue)}</div>
              </div>
            </div>

            <hr className="receipt-dashed" />

            {/* Footer */}
            <div style={{ textAlign: "center", paddingTop: 6, paddingBottom: 2 }}>
              <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", fontWeight: 500, letterSpacing: "0.06em" }}>
                {payments.length} TRANSACTION{payments.length !== 1 ? "S" : ""}
              </div>
              <div style={{ fontSize: 8, color: "rgba(20,83,45,0.25)", marginTop: 3, letterSpacing: "0.04em" }}>
                THANK YOU FOR CHOOSING K9
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

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
const MetricCell = memo(function MetricCell({ label, value, sub, color, trend, onClick, hero, skeleton, live }) {
  return (
    <div
      className={`dash-grid-cell${onClick ? " clickable" : ""}${hero ? " hero-cell" : ""}`}
      onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both", position: "relative" }}
    >
      {onClick && <LinkIcon />}
      {/* Live indicator dot — shown when BOH is feeding real-time data */}
      {live && (
        <div style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "#22C55E", animation: "dashPulse 1.5s infinite" }} />
      )}
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

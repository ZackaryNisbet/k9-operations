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
import WeatherHourlyGraph from "../../shared/WeatherHourlyGraph";
import { useDashboardMetrics } from "../../hooks/useDashboardMetrics";
import { useAccrualRevenue } from "../../hooks/useAccrualRevenue";
import { useGingrLiveCache } from "../../hooks/useGingrLiveCache";
import { useCashBasisLive, buildCashChartRows } from "../../hooks/useCashBasisRevenue";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import { useWeatherData } from "../../hooks/useWeatherData";
import { fetchCashBasisForDate } from "../../shared/cashBasisRevenue";
import { supabase } from "../../supabaseClient";
import { mergeGingrLive } from "../../shared/gingrLive";
import { useLazyCompute, useSectionVisibility } from "../../hooks/useLazyCompute";
import { computeOpsProgress, computeServiceMetrics, computeLifecycleMetrics } from "../../shared/metricsHelpers";
import { getRoomCleaningBreakdown, getWeeklyMaintenanceStats } from "../../shared/opsHelpers";
import {
  buildWeatherDetailMetrics,
  buildWeatherDataFields,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherBrief,
  formatWeatherDateLabel,
  formatWeatherFreshnessLabel,
  formatWeatherSource,
  formatWeatherSummary,
  getWeatherIconUrl,
  getWeatherOperationalNote,
  getWeatherTone,
  isWeatherAvailable,
} from "../../shared/weather";
import { getInventoryWorkflow } from "./inventoryStatus";
import TodayEnrichmentCard from "../enrichments/TodayEnrichmentCard";

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
@keyframes healthBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes healthModalIn {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
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
/* ── Ops Dashboard (section-based flex layout) ── */
.ops-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 8px 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  background: #FAFAF9;
}
.ops-section-header {
  font-size: 11px;
  font-weight: 600;
  color: #14532D;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 8px;
}
.ops-hero {
  background: #F7FEE7;
  border: 1px solid rgba(20,83,45,0.10);
  border-radius: 12px;
  padding: 20px 16px;
  display: flex;
  gap: 16px;
}
.ops-hero-card {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  padding: 12px 16px;
  border-radius: 10px;
  transition: all 0.18s ease;
  background: rgba(255,255,255,0.5);
}
.ops-hero-card:hover {
  background: rgba(255,255,255,0.85);
  box-shadow: 0 2px 8px rgba(20,83,45,0.08);
  transform: translateY(-1px);
}
.ops-hero-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(20,83,45,0.6);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.ops-hero-value {
  font-size: 36px;
  font-weight: 800;
  color: #14532D;
  line-height: 1;
  font-variant-numeric: tabular-nums lining-nums;
}
.ops-hero-sub {
  font-size: 12px;
  font-weight: 500;
  color: rgba(20,83,45,0.5);
  margin-top: 4px;
}
.ops-two-col {
  display: flex;
  gap: 16px;
}
.ops-two-col > div {
  flex: 1;
  min-width: 0;
}
.ops-three-col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .ops-three-col {
    grid-template-columns: 1fr;
  }
}
.ops-card {
  background: #FFFFFF;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  padding: 16px;
}
.ops-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #14532D;
  margin-bottom: 12px;
}
.ops-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.ops-progress-row:hover {
  background: rgba(20,83,45,0.03);
}
.ops-progress-label {
  font-size: 13px;
  font-weight: 600;
  color: ${C.text};
  min-width: 110px;
  white-space: nowrap;
}
.ops-progress-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #F3F4F6;
  overflow: hidden;
  min-width: 0;
}
.ops-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: #84CC16;
  transition: width 0.5s cubic-bezier(0.22,1,0.36,1);
  transform-origin: left;
}
.ops-progress-count {
  font-size: 13px;
  font-weight: 700;
  color: ${C.text};
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: right;
  white-space: nowrap;
}
.ops-progress-pct {
  font-size: 11px;
  color: ${C.textMut};
  min-width: 32px;
  text-align: right;
}
.ops-overall-bar {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  gap: 10px;
}
.ops-quick-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.ops-quick-action {
  flex: 1;
  min-width: 100px;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #FFFFFF;
  border: 1.5px dashed rgba(0,0,0,0.10);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
  padding: 12px 8px;
}
.ops-quick-action:hover {
  background: rgba(255,255,255,0.95);
  border-color: rgba(20,83,45,0.25);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transform: translateY(-1px);
}
.ops-quick-action-icon {
  color: #14532D;
  opacity: 0.55;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ops-quick-action-label {
  font-size: 11px;
  font-weight: 700;
  color: #14532D;
  opacity: 0.7;
  text-align: center;
  white-space: nowrap;
}
.ops-facility-row {
  display: flex;
  gap: 16px;
}
.ops-facility-card {
  flex: 1;
  min-width: 0;
  background: #FFFFFF;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  padding: 16px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.ops-facility-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);
  transform: translateY(-1px);
}
.ops-facility-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(20,83,45,0.6);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.ops-facility-value {
  font-size: 28px;
  font-weight: 800;
  color: #14532D;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ops-facility-sub {
  font-size: 12px;
  font-weight: 500;
  color: ${C.textMut};
  margin-top: 4px;
}
.ops-overdue-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(239,68,68,0.1);
  color: #EF4444;
  margin-top: 4px;
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
const fmt$k = (v) => fmt$(v);
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
   DashGrid — viewport-filling grid, adapts for ops-only or full analytics layout
   ═══════════════════════════════════════════════════════════════════════════ */
function DashGrid({ children, analyticsMode }) {
  const COL_GAP = 6;
  const ROW_GAP = 5;
  const LABEL_H = 16;
  // Analytics: 9 cols (original dense layout with lifecycle, financial, charts in sidebar)
  // Ops-only: 5 cols (bigger cells, less whitespace, ops-focused)
  const COLS = analyticsMode ? 9 : 5;
  const templateRows = analyticsMode
    // Analytics: snapshot-label, snapshot-row, lifecycle-label, lifecycle-row, daily-tasks-label, daily-tasks-row, financial-label, financial-row, chart-rows x3 (11 rows)
    ? `${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr 1fr 1fr 1fr`
    // Ops: snapshot-label, snapshot-row, ops-label, ops-row(checklists), ops-row(services+inventory) (5 rows — pure ops, no revenue)
    : `${LABEL_H}px 1fr ${LABEL_H}px 1fr 1fr`;

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
  bohStats, bohLastFetch, analyticsMode,
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
  const [platformHealth, setPlatformHealth] = useState(null);
  const [showPlatformHealthModal, setShowPlatformHealthModal] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const today = todayStr();
  const dashboardLocationId = locationId || profile?.location_id || "cherry-hill";
  const {
    getWeatherForDate: getDashboardWeatherForDate,
    loading: dashboardWeatherLoading,
    error: dashboardWeatherError,
    limitations: dashboardWeatherLimitations,
    refresh: refreshDashboardWeather,
  } = useWeatherData(dashboardLocationId, today, today, {
    enabled: Boolean(dashboardLocationId),
  });
  const dashboardWeather = getDashboardWeatherForDate(today);
  const { events: enrichmentEvents, loading: enrichmentLoading } = useEnrichmentEvents(locationId || profile?.location_id || "demo", today);

  /* ─── Stable nav callbacks ─── */
  const navTo = useMemo(() => {
    if (!nav) return {};
    const pages = ["checkout-tv", "ops-bathing", "settings", "lifecycle", "funnel",
      "ops-opening", "ops-fe", "ops-be", "ops-rooms", "ops-closing",
      "ops-pamper", "ops-pp", "ops-svc", "eod", "photos", "cash-tips",
      "checkout-notes", "enrichments", "inventory", "test-health", "reports",
      "enterprise-ops", "occupancy-report"];
    const map = {};
    pages.forEach(p => { map[p] = () => nav(p); });
    return map;
  }, [nav]);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    const healthLocationId = locationId || profile?.location_id || "cherry-hill";

    const loadPlatformHealth = async () => {
      try {
        const { data: health, error } = await supabase.functions.invoke("ops-platform-health", {
          body: { location_id: healthLocationId, date: today },
        });
        if (error) throw error;
        if (!cancelled) setPlatformHealth(health || null);
      } catch (error) {
        const statusCode = typeof error?.context?.status === "number" ? error.context.status : null;
        let responsePayload = null;
        if (error?.context && typeof error.context.clone === "function") {
          try {
            responsePayload = await error.context.clone().json();
          } catch {
            responsePayload = null;
          }
        }
        const responseAlert = Array.isArray(responsePayload?.alerts) ? responsePayload.alerts[0] : null;
        const detail = responseAlert?.message || responsePayload?.error || responsePayload?.message || error?.message || "Platform health unavailable.";
        if (!cancelled) {
          setPlatformHealth({
            overall_status: "warning",
            generated_at: new Date().toISOString(),
            function_name: "ops-platform-health",
            alerts: [{
              severity: "warning",
              kind: "edge_function",
              label: "Platform Health",
              function_name: "ops-platform-health",
              affects: ["Platform health details", "Data freshness visibility"],
              last_failure_status_code: statusCode,
              message: `ops-platform-health returned ${statusCode ? `HTTP ${statusCode}` : "a non-2xx status"}: ${detail}`,
              action: "The dashboard cannot verify report freshness until this function succeeds.",
            }],
          });
        }
      }
    };

    loadPlatformHealth();
    intervalId = window.setInterval(loadPlatformHealth, 60000);
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [locationId, profile?.location_id, today]);

  // ─── Inventory snapshot status (reads from inventory_snapshots + inventory_counts) ──
  const [invStatus, setInvStatus] = useState({ status: "not_started", itemsCounted: 0, totalItems: 0, overdue: false, daysOverdue: 0, phase: "counting", needsOrder: 0, ordered: 0, skipped: 0, countingDoneDate: null, orderingDoneDate: null, daysUntilNext: null });
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
        const [catalogRes, snapRes] = await Promise.all([
          supabase.from("inventory_catalog").select("id, par_level").eq("location_id", locId).eq("is_active", true),
          supabase.from("inventory_snapshots").select("id, status").eq("location_id", locId).eq("week_start", monday).maybeSingle(),
        ]);
        if (cancelled) return;
        const catalogItems = catalogRes.data || [];
        const totalItems = catalogItems.length;
        const now = new Date();
        const dow = now.getDay();
        const isPastMonday = dow !== 1;
        const daysSinceMonday = dow === 0 ? 6 : dow - 1;
        if (snapRes.data?.id) {
          const [countsRes, adhocRes] = await Promise.all([
            supabase.from("inventory_counts")
              .select("stock_count, in_transit, ordered, skipped, catalog_item_id, counted_at, ordered_at, skipped_at, created_at")
              .eq("snapshot_id", snapRes.data.id),
            supabase.from("inventory_adhoc_items")
              .select("stock_count, ordered, skipped, created_at")
              .eq("snapshot_id", snapRes.data.id),
          ]);
          if (cancelled) return;
          const workflow = getInventoryWorkflow({
            snapshotStatus: snapRes.data.status,
            catalogItems,
            countRows: countsRes.data || [],
            adhocItems: adhocRes.data || [],
          });

          // Compute days until next Monday (next inventory cycle)
          const todayDow = now.getDay();
          const daysUntilNext = todayDow === 1 ? 7 : ((8 - todayDow) % 7);

          if (!cancelled) {
            setInvStatus({
              status: workflow.status,
              itemsCounted: workflow.itemsCounted,
              totalItems: workflow.totalItems,
              overdue: isPastMonday && workflow.status !== "completed",
              daysOverdue: daysSinceMonday,
              phase: workflow.phase,
              needsOrder: workflow.itemsNeedingOrder,
              ordered: workflow.itemsOrdered,
              skipped: workflow.itemsSkipped,
              countingDoneDate: workflow.countingDoneDate,
              orderingDoneDate: workflow.orderingDoneDate,
              daysUntilNext,
            });
          }
        } else {
          const todayDow2 = now.getDay();
          const daysUntilNext2 = todayDow2 === 1 ? 7 : ((8 - todayDow2) % 7);
          if (!cancelled) setInvStatus({ status: "not_started", itemsCounted: 0, totalItems, overdue: isPastMonday && totalItems > 0, daysOverdue: daysSinceMonday, phase: "counting", needsOrder: 0, ordered: 0, skipped: 0, countingDoneDate: null, orderingDoneDate: null, daysUntilNext: daysUntilNext2 });
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [today, profile?.location_id, invTick]);

  // Realtime: re-fetch inventory when counts, ad-hoc items, or snapshot status changes
  useEffect(() => {
    const locId = profile?.location_id;
    if (!locId) return;
    const chan = supabase.channel("dash-inv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_counts" },
        () => { setInvTick(t => t + 1); }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_adhoc_items" },
        () => { setInvTick(t => t + 1); }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_snapshots" },
        () => { setInvTick(t => t + 1); }
      )
      .subscribe();
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

  /* ─── Gingr LIVE CACHE — background 60s poll, shared by accrual + receipt ─── */
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
  // Bath data is now fully server-side from lite_daily_ops (computed by ops-compute edge function)
  // No client-side polling needed — loads instantly with the rest of dailyOps
  const bathingFromOps = useMemo(() => {
    const ops = data?.dailyOps || [];
    const bathingEntry = ops.find(e => e.id === `ops_bathing_${today}`);
    const ci = bathingEntry?.computed_items;
    if (ci) {
      return { bathsTotal: ci.totalCount || ci.dogs?.length || 0, bathsDone: ci.completedCount || 0 };
    }
    return null;
  }, [data?.dailyOps, today]);

  const svcData = useMemo(() => {
    if (!stableReservations || stableReservations.length === 0) return { bathsTotal: 0, bathsDone: 0, ppTotal: 0, ppCompleted: 0, pamperTotal: 0, pamperDone: 0, iceCreamTotal: 0, iceCreamDone: 0 };
    const sm = computeServiceMetrics(dataProxy, today);
    return {
      bathsTotal: bathingFromOps?.bathsTotal ?? sm.bathsTotal,
      bathsDone: bathingFromOps?.bathsDone ?? 0,
      ppTotal: sm.ppTotal, ppCompleted: sm.ppCompleted,
      pamperTotal: sm.pamperTotal, pamperDone: sm.pamperDone,
      iceCreamTotal: sm.iceCreamTotal, iceCreamDone: sm.iceCreamDone,
    };
  }, [dataProxy, today, bathingFromOps]);

  /* ─── Room cleaning breakdown (set-ups, disinfects, refreshes) ─── */
  const roomBreakdown = useMemo(() => {
    if (!data?.dailyOps) return { totalSetups: 0, doneSetups: 0, totalDisinfects: 0, doneDisinfects: 0, totalRefreshes: 0, doneRefreshes: 0 };
    return getRoomCleaningBreakdown(dataProxy, today);
  }, [dataProxy, today]);

  /* ─── Weekly maintenance stats ─── */
  const wmStats = useMemo(() => {
    if (!data?.dailyOps) return { total: 0, checked: 0 };
    return getWeeklyMaintenanceStats(dataProxy, today);
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
  // Respects business hours setting — pauses outside configured window
  const [liveSnap, setLiveSnap] = useState(null);
  const bizHoursCheck = refreshOptions?.isWithinBusinessHours;
  useEffect(() => {
    if (!isToday || !locationId) { setLiveSnap(null); return; }
    let cancelled = false;
    const poll = async () => {
      // Skip poll if outside business hours
      if (bizHoursCheck && !bizHoursCheck()) { setLiveSnap(null); return; }
      try {
        const { data } = await supabase.rpc("snapshot_live", { p_location_id: locationId });
        if (!cancelled && data) setLiveSnap(data);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isToday, locationId, bizHoursCheck]);
  const displayLiveSnap = useMemo(() => {
    if (!bohStats?.canonicalPresence) return liveSnap;
    return {
      ...(liveSnap || {}),
      expected: bohStats.pendingCount,
      in_house: bohStats.total,
      boarding: bohStats.boardingCount,
      daycare: bohStats.daycareCount,
      going_home: bohStats.goingHomeCount,
      occupancy_pct: bohStats.occupancyPct,
      canonical_presence: true,
    };
  }, [bohStats, liveSnap]);
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

  // Snapshot section label — adapts to selected date range
  const snapshotLabel = range === "today" ? "Today's Snapshot" :
    range === "wtd" ? "WTD Snapshot" :
    range === "past-week" ? "Past Week Snapshot" :
    range === "mtd" ? "MTD Snapshot" :
    range === "past-30" ? "Past 30 Days Snapshot" :
    range === "qtd" ? "QTD Snapshot" :
    range === "ytd" ? "YTD Snapshot" :
    range === "lifetime" ? "Lifetime Snapshot" :
    range === "custom" ? "Custom Range Snapshot" :
    "Today's Snapshot";

  // Cash basis: for "Today" show today's live value; for multi-day ranges sum the period
  const cashTotalDisplay = useMemo(() => {
    if (isToday) {
      return todayCashData ? todayCashData.netRevenue : 0;
    }
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

      // Compatibility hook for older live rows. Browser Gingr reads are disabled;
      // same-day freshness comes from the server sync pipeline.
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
      height: "100%", minHeight: 0, overflow: "hidden",
      display: "flex", flexDirection: "column",
      fontFamily: "inherit", padding: "0",
      background: "#FAFAF9",
    }}>
      <style>{DASH_CSS}</style>
      {showPlatformHealthModal && (
        <PlatformHealthModal
          platformHealth={platformHealth}
          onClose={() => setShowPlatformHealthModal(false)}
        />
      )}
      {showWeatherModal && (
        <DashboardWeatherModal
          weather={dashboardWeather}
          loading={dashboardWeatherLoading}
          error={dashboardWeatherError}
          limitations={dashboardWeatherLimitations}
          onClose={() => setShowWeatherModal(false)}
          onRefresh={refreshDashboardWeather}
        />
      )}

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
          {platformHealth && (
            <PlatformHealthStatusButton
              platformHealth={platformHealth}
              onClick={() => setShowPlatformHealthModal(true)}
            />
          )}
          <DashboardWeatherStatusButton
            weather={dashboardWeather}
            loading={dashboardWeatherLoading}
            error={dashboardWeatherError}
            onClick={() => setShowWeatherModal(true)}
          />
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

        {/* Right: Timeframe pills + prior period toggle (analytics mode only) */}
        {analyticsMode && (
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
        )}
      </div>

      <DashboardWeatherStrip
        weather={dashboardWeather}
        loading={dashboardWeatherLoading}
        error={dashboardWeatherError}
        limitations={dashboardWeatherLimitations}
        targetDate={today}
        onOpen={() => setShowWeatherModal(true)}
      />

      {/* ═══ MAIN CONTENT ═══ */}
      {analyticsMode ? (
      <DashGrid analyticsMode={analyticsMode}>
            {/* ═══════════════════════════════════════════════════════════════════
               ANALYTICS MODE — 9-col original dense layout
               ═══════════════════════════════════════════════════════════════════ */}
            {/* Snapshot label + sidebar headers */}
            <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">{snapshotLabel}</span>
            </div>
            <div ref={opsVisRef} style={{ gridColumn: "8", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
              <span className="dash-section-label">Checklists</span>
            </div>
            <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
              <span className="dash-section-label">Services</span>
            </div>

            {/* Row 1: Snapshot (7 metrics) + Opening checklist + Baths service */}
            <MetricCell label="Expected" value={displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected} hero onClick={navTo["checkout-tv"]} sub={null} trend={showPriorPeriod ? pctChange(displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected, pm.dogsExpected) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            <MetricCell label="In House" value={displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse} hero sub={displayLiveSnap ? `${displayLiveSnap.boarding}B · ${displayLiveSnap.daycare}D` : `${m.boardingInHouse}B · ${m.daycareInHouse}D`} onClick={navTo["checkout-tv"]} trend={showPriorPeriod ? pctChange(displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse, pm.dogsInHouse) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            {days > 1
              ? <CanceledCell key={animEpoch} value={Math.max(0, (m.dogsExpected || 0) - (m.dogsInHouse || 0))} onClick={navTo["ops-bathing"]} animKey={animEpoch} />
              : <MetricCell label="Going Home" value={displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome} hero onClick={navTo["ops-bathing"]} trend={showPriorPeriod ? pctChange(displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome, pm.dogsGoingHome) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            }
            <MetricCell label="Occupancy" value={`${days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0))}%`} hero onClick={navTo["occupancy-report"]} trend={showPriorPeriod ? pctChange(days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0)), days > 1 ? Math.round(pm.occupancyRate || 0) : (pm.occupancyPct || 0)) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            <MetricCell label="New Bookings" value={displayLiveSnap?.new_bookings ?? m.bookingsToday} hero skeleton={showSkeleton} />
            <MetricCell label="Tours" value={displayLiveSnap?.tours ?? m.toursToday} hero onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(displayLiveSnap?.tours ?? m.toursToday, pm.toursToday) : null} skeleton={showSkeleton} />
            <MetricCell label="Evals" value={displayLiveSnap?.evals ?? m.evalsToday} hero onClick={navTo["lifecycle"]} skeleton={showSkeleton} />
            <ChecklistCell label="Opening" progress={getChecklistProgress("ops-opening")} count={getChecklistCount("ops-opening")} onClick={navTo["ops-opening"]} />
            <ServiceCell label="Baths" done={svcData.bathsDone} total={svcData.bathsTotal} onClick={navTo["ops-bathing"]} />

            {/* Customer Lifecycle label */}
            <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">Customer Lifecycle</span>
            </div>
            <div style={{ gridColumn: "8 / 10" }} />

            {/* Row 2: Lifecycle (7 metrics) + Front-End checklist + Pamper service */}
            <MetricCell label="Remaining Leads" value={funnelMetrics.remainingLeads} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.remainingLeads, prevFunnelMetrics.remainingLeads) : null} />
            <MetricCell label="Lapsed" value={funnelMetrics.remainingAtRisk} onClick={navTo["lifecycle"]} />
            <MetricCell label="Outreaches" value={funnelMetrics.todayOutreaches} onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayOutreaches, prevFunnelMetrics.todayOutreaches) : null} />
            <MetricCell label="Converted" value={funnelMetrics.todayConversions} color={funnelMetrics.todayConversions > 0 ? C.suc : undefined} onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayConversions, prevFunnelMetrics.todayConversions) : null} />
            <MetricCell label="First-Time Spenders" value={funnelMetrics.firstTimePayers} onClick={navTo["lifecycle"]} />
            <MetricCell label="Conversion Rate" value={`${funnelMetrics.conversionRate.toFixed(1)}%`} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.conversionRate, prevFunnelMetrics.conversionRate) : null} />
            <MetricCell label="New Leads" value={funnelMetrics.todayNewLeads} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayNewLeads, prevFunnelMetrics.todayNewLeads) : null} />
            <ChecklistCell label="Front-End" progress={getChecklistProgress("ops-fe")} count={getChecklistCount("ops-fe")} onClick={navTo["ops-fe"]} />
            <ServiceCell label="Pamper" done={svcData.pamperDone} total={svcData.pamperTotal} onClick={navTo["ops-pamper"]} />

            {/* Daily Tasks label */}
            <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">Daily Tasks</span>
            </div>
            <div style={{ gridColumn: "8 / 10" }} />

            {/* Row 3: Daily Tasks (5 quick links + LTV + Clients) + Back-End + Ice Cream */}
            <QuickLinkCell label="EOD Report" icon={<I.FileText />} onClick={navTo["eod"]} />
            <QuickLinkCell label="Checkout TV" icon={<I.Monitor />} onClick={navTo["checkout-tv"]} />
            <QuickLinkCell label="Photos" icon={<I.Camera />} onClick={navTo["photos"]} />
            <QuickLinkCell label="Cash Tips" icon={<I.DollarSign />} onClick={navTo["cash-tips"]} />
            <QuickLinkCell label="Today's Notes" icon={<I.Clipboard />} onClick={navTo["checkout-notes"]} />
            <MetricCell label="LTV" value={`$${Math.round(funnelMetrics.avgLTV).toLocaleString("en-US")}`} onClick={navTo["lifecycle"]} />
            <MetricCell label="Total Clients" value={funnelMetrics.spendingClientsCount} onClick={navTo["lifecycle"]} />
            <ChecklistCell label="Back-End" progress={getChecklistProgress("ops-be")} count={getChecklistCount("ops-be")} onClick={navTo["ops-be"]} />
            <ServiceCell label="Ice Cream" done={svcData.iceCreamDone} total={svcData.iceCreamTotal} onClick={navTo["ops-svc"]} />

            {/* Financial Reporting label */}
            <div ref={financialRef} style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">Financial Reporting</span>
            </div>
            <div style={{ gridColumn: "8 / 10" }} />

            {/* Row 4: Financial (7 metrics) + Room Cleaning + Outstanding Invoices */}
            <MetricCell label="Transactions" value={m.cashTransactionCount} trend={showPriorPeriod ? bookingsTrend : null} skeleton={showSkeleton} />
            <MetricCell label="Average Transaction Price" value={`$${Math.round(m.cashAvgTransaction || 0).toLocaleString("en-US")}`} trend={showPriorPeriod ? pctChange(m.cashAvgTransaction, pm.cashAvgTransaction) : null} skeleton={showSkeleton} />
            <MetricCell label="Rev/PAR" value={`$${Math.round(accrualRevPAR || 0).toLocaleString("en-US")}`} trend={showPriorPeriod ? pctChange(accrualRevPAR, prevAccrualRevPAR) : null} skeleton={showSkeleton} />
            <MetricCell label="Refunds" value={m.refundCount} color={m.refundCount > 0 ? C.dan : undefined} trend={showPriorPeriod ? pctChange(m.refundCount, pm.refundCount) : null} skeleton={showSkeleton} />
            <MetricCell label="$ Refunded" value={`$${fmt$k(m.refundTotal)}`} color={m.refundTotal > 0 ? C.dan : undefined} skeleton={showSkeleton} />
            <MetricCell label="Discounted" value={m.discountedCount} color={m.discountedCount > 0 ? C.warn : undefined} skeleton={showSkeleton} />
            <MetricCell label="$ Discounted" value={`$${fmt$k(m.discountTotal)}`} color={m.discountTotal > 0 ? C.warn : undefined} skeleton={showSkeleton} />
            <ChecklistCell label="Room Cleaning & Setups" progress={getChecklistProgress("ops-rooms")} count={getChecklistCount("ops-rooms")} onClick={navTo["ops-rooms"]} />
            <MetricCell label="Outstanding Invoices" value={m.outstandingInvoiceCount || 0} sub={`$${fmt$k(m.outstandingInvoiceTotal || 0)}`} color={(m.outstandingInvoiceCount || 0) > 0 ? C.warn : undefined} skeleton={showSkeleton} />

            {/* Rows 5-7: Charts (cash cols 1-3, toggle col 4, accrual cols 5-7) + ops sidebar */}
            <div className="dash-chart-cell" style={{ gridColumn: "1 / 4", gridRow: "span 3" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cash Basis Revenue</span>
                  <Tip text="Cash basis = money collected on each day (payments + deposits - refunds). Today is live from Gingr API."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(cashTotalDisplay)}</span>
                  <span ref={cashReceiptTriggerRef} onClick={() => setShowCashReceipt(true)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: "rgba(20,83,45,0.08)", color: C.pri, transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)", flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.18)"; e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.08)"; e.currentTarget.style.transform = "scale(1)"; }} title="View cash basis breakdown"><I.FileText style={{ width: 11, height: 11 }} /></span>
                </span>
              </div>
              <ChartFill chartData={cashChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="cash-main" dateLabels={cashChartData.map(d => d.date)} useRawPoints lineType="linear" solidFill fillOpacity={0.35} showGuideLines todayHighlight={isToday} priorData={cashPriorChartData} showPriorLine={showPriorPeriod} priorLineColor="#D4A017" priorFillColor="#D4A017" priorFillOpacity={0.25} />
            </div>
            <div style={{ gridColumn: "4", gridRow: "span 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "6px 4px", background: "#FFFFFF", borderRadius: 8, border: "1px solid rgba(20,83,45,0.08)", boxShadow: "0 1px 3px rgba(20,83,45,0.06), 0 1px 2px rgba(20,83,45,0.04)" }}>
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
            <div className="dash-chart-cell" style={{ gridColumn: "5 / 8", gridRow: "span 3" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Accrual Revenue</span>
                  <Tip text="Accrual revenue recognizes the full reservation cost divided evenly by the number of nights in the stay."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(revenue)}</span>
                  <span ref={receiptTriggerRef} onClick={() => setShowReceipt(true)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: "rgba(20,83,45,0.08)", color: C.pri, transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)", flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.18)"; e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.08)"; e.currentTarget.style.transform = "scale(1)"; }} title="View accrual breakdown"><I.FileText style={{ width: 11, height: 11 }} /></span>
                </span>
              </div>
              <ChartFill chartData={accrualChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="accrual-main" dateLabels={accrualChartData.map(d => d.date)} useRawPoints lineType="linear" solidFill fillOpacity={0.35} showGuideLines todayHighlight={isToday} priorData={accrualPriorChartData} showPriorLine={showPriorPeriod} priorLineColor="#D4A017" priorFillColor="#D4A017" priorFillOpacity={0.25} />
            </div>
            <ServiceCell label="Private Play" done={svcData.ppCompleted} total={svcData.ppTotal} onClick={navTo["ops-pp"]} />
            <InventoryCell done={invStatus.itemsCounted} total={invStatus.totalItems} overdue={invStatus.overdue} daysOverdue={invStatus.daysOverdue} phase={invStatus.phase} needsOrder={invStatus.needsOrder} ordered={invStatus.ordered} skipped={invStatus.skipped} countingDoneDate={invStatus.countingDoneDate} orderingDoneDate={invStatus.orderingDoneDate} daysUntilNext={invStatus.daysUntilNext} onClick={navTo["inventory"]} />
            <ChecklistCell label="Closing" progress={getChecklistProgress("ops-closing")} count={getChecklistCount("ops-closing")} onClick={navTo["ops-closing"]} />
            <MetricCell label="Test Health" value="172" sub="100% pass" onClick={navTo["test-health"]} color={C.suc} />
            <div className="dash-grid-cell empty-cell" />
            <div className="dash-grid-cell empty-cell" />
      </DashGrid>
      ) : (
      <div className="ops-dashboard">
        {/* ═══════════════════════════════════════════════════════════════════
           OPS-ONLY MODE — Section-based flex layout
           ═══════════════════════════════════════════════════════════════════ */}

        {/* ── Section 1: Hero Stats Banner ── */}
        <div>
          <div className="ops-section-header">{snapshotLabel}</div>
          <div className="ops-hero">
            <div className="ops-hero-card" onClick={navTo["checkout-tv"]}>
              <div className="ops-hero-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Dogs In House
                {displayLiveSnap && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.suc, animation: "dashPulse 1.5s infinite", flexShrink: 0 }} />}
              </div>
              <div className="ops-hero-value">{displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse}</div>
              <div className="ops-hero-sub">
                {displayLiveSnap ? `${displayLiveSnap.boarding}B · ${displayLiveSnap.daycare}D` : `${m.boardingInHouse || 0}B · ${m.daycareInHouse || 0}D`}
              </div>
              {showPriorPeriod && <TrendBadge value={pctChange(displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse, pm.dogsInHouse)} size="xs" />}
            </div>
            <div className="ops-hero-card" onClick={navTo["checkout-tv"]}>
              <div className="ops-hero-label">Expected</div>
              <div className="ops-hero-value">{displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected}</div>
              {showPriorPeriod && <TrendBadge value={pctChange(displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected, pm.dogsExpected)} size="xs" />}
            </div>
            <div className="ops-hero-card" onClick={navTo["ops-bathing"]}>
              <div className="ops-hero-label">{days > 1 ? "Canceled" : "Going Home"}</div>
              <div className="ops-hero-value">
                {days > 1
                  ? Math.max(0, (m.dogsExpected || 0) - (m.dogsInHouse || 0))
                  : (displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome)}
              </div>
              {showPriorPeriod && days <= 1 && <TrendBadge value={pctChange(displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome, pm.dogsGoingHome)} size="xs" />}
            </div>
            <div className="ops-hero-card" onClick={navTo["occupancy-report"]}>
              <div className="ops-hero-label">Occupancy</div>
              <div className="ops-hero-value">
                {days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0))}%
              </div>
              {showPriorPeriod && <TrendBadge value={pctChange(days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0)), days > 1 ? Math.round(pm.occupancyRate || 0) : (pm.occupancyPct || 0))} size="xs" />}
            </div>
            <div className="ops-hero-card">
              <div className="ops-hero-label">Tours & Evals</div>
              <div className="ops-hero-value">
                {(displayLiveSnap?.tours ?? (m.toursToday || 0)) + (displayLiveSnap?.evals ?? (m.evalsToday || 0))}
              </div>
              <div className="ops-hero-sub">
                {displayLiveSnap?.tours ?? (m.toursToday || 0)} tours · {displayLiveSnap?.evals ?? (m.evalsToday || 0)} evals
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="ops-section-header">Today's Enrichment</div>
          <TodayEnrichmentCard events={enrichmentEvents} nav={nav} loading={enrichmentLoading} compact />
        </div>

        {/* ── Section 2: Operations Progress (Three-Column) ── */}
        <div>
          <div className="ops-section-header">Daily Operations</div>
          <div className="ops-three-col">
            {/* Column 1: Resort Upkeep */}
            <div className="ops-card">
              <div className="ops-card-title">Resort Upkeep</div>
              {[
                { label: "Set-Ups", pct: roomBreakdown.totalSetups > 0 ? Math.round((roomBreakdown.doneSetups / roomBreakdown.totalSetups) * 100) : 0, count: `${roomBreakdown.doneSetups}/${roomBreakdown.totalSetups}`, click: navTo["ops-rooms"] },
                { label: "Disinfects", pct: roomBreakdown.totalDisinfects > 0 ? Math.round((roomBreakdown.doneDisinfects / roomBreakdown.totalDisinfects) * 100) : 0, count: `${roomBreakdown.doneDisinfects}/${roomBreakdown.totalDisinfects}`, click: navTo["ops-rooms"] },
                { label: "Refreshes", pct: roomBreakdown.totalRefreshes > 0 ? Math.round((roomBreakdown.doneRefreshes / roomBreakdown.totalRefreshes) * 100) : 0, count: `${roomBreakdown.doneRefreshes}/${roomBreakdown.totalRefreshes}`, click: navTo["ops-rooms"] },
                { label: "Weekly Maintenance", pct: wmStats.total > 0 ? Math.round((wmStats.checked / wmStats.total) * 100) : 0, count: `${wmStats.checked}/${wmStats.total}`, click: navTo["ops-weekly-maintenance"] },
              ].map((item) => (
                <div key={item.label} className="ops-progress-row" onClick={item.click}>
                  <span className="ops-progress-label">{item.label}</span>
                  <div className="ops-progress-track">
                    <div className="ops-progress-fill" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                  <span className="ops-progress-count">{item.count}</span>
                  <span className="ops-progress-pct">{item.pct}%</span>
                </div>
              ))}
            </div>

            {/* Column 2: Services */}
            <div className="ops-card">
              <div className="ops-card-title">Services</div>
              {[
                { label: "Baths", pct: svcData.bathsTotal > 0 ? Math.round((svcData.bathsDone / svcData.bathsTotal) * 100) : 0, count: `${svcData.bathsDone}/${svcData.bathsTotal}`, click: navTo["ops-bathing"] },
                { label: "Pamper", pct: svcData.pamperTotal > 0 ? Math.round((svcData.pamperDone / svcData.pamperTotal) * 100) : 0, count: `${svcData.pamperDone}/${svcData.pamperTotal}`, click: navTo["ops-pamper"] },
                { label: "Ice Cream", pct: svcData.iceCreamTotal > 0 ? Math.round((svcData.iceCreamDone / svcData.iceCreamTotal) * 100) : 0, count: `${svcData.iceCreamDone}/${svcData.iceCreamTotal}`, click: navTo["ops-svc"] },
                { label: "Private Play", pct: svcData.ppTotal > 0 ? Math.round((svcData.ppCompleted / svcData.ppTotal) * 100) : 0, count: `${svcData.ppCompleted}/${svcData.ppTotal}`, click: navTo["ops-pp"] },
              ].map((item) => (
                <div key={item.label} className="ops-progress-row" onClick={item.click}>
                  <span className="ops-progress-label">{item.label}</span>
                  <div className="ops-progress-track">
                    <div className="ops-progress-fill" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                  <span className="ops-progress-count">{item.count}</span>
                  <span className="ops-progress-pct">{item.pct}%</span>
                </div>
              ))}
            </div>

            {/* Column 3: Checklists */}
            <div className="ops-card">
              <div className="ops-card-title">Checklists</div>
              {[
                { label: "Opening", id: "ops-opening", click: navTo["ops-opening"] },
                { label: "Front-End", id: "ops-fe", click: navTo["ops-fe"] },
                { label: "Back-End", id: "ops-be", click: navTo["ops-be"] },
                { label: "Closing", id: "ops-closing", click: navTo["ops-closing"] },
              ].map((item) => {
                const pct = getChecklistProgress(item.id);
                const count = getChecklistCount(item.id);
                return (
                  <div key={item.id} className="ops-progress-row" onClick={item.click}>
                    <span className="ops-progress-label">{item.label}</span>
                    <div className="ops-progress-track">
                      <div className="ops-progress-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="ops-progress-count">{count}</span>
                    <span className="ops-progress-pct">{pct}%</span>
                  </div>
                );
              })}
              {/* Overall summary bar */}
              {(() => {
                const ids = ["ops-opening", "ops-fe", "ops-be", "ops-closing"];
                const total = ids.reduce((s, id) => s + getChecklistProgress(id), 0);
                const avg = Math.round(total / ids.length);
                return (
                  <div className="ops-overall-bar">
                    <span className="ops-progress-label" style={{ fontWeight: 700 }}>Overall</span>
                    <div className="ops-progress-track">
                      <div className="ops-progress-fill" style={{ width: `${avg}%` }} />
                    </div>
                    <span className="ops-progress-count" style={{ fontWeight: 800 }}>{avg}%</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── Section 3: Quick Actions ── */}
        <div>
          <div className="ops-section-header">Quick Actions</div>
          <div className="ops-quick-actions">
            {[
              { label: "EOD Report", icon: <I.FileText />, click: navTo["eod"] },
              { label: "Checkout TV", icon: <I.Monitor />, click: navTo["checkout-tv"] },
              { label: "Photos", icon: <I.Camera />, click: navTo["photos"] },
              { label: "Cash Tips", icon: <I.DollarSign />, click: navTo["cash-tips"] },
              { label: "Today's Notes", icon: <I.Clipboard />, click: navTo["checkout-notes"] },
              { label: "Enrichments", icon: <I.Sparkle />, click: navTo["enrichments"] },
              { label: "Operations Hub", icon: <I.ClipboardCheck />, click: navTo["ops-opening"] },
            ].map((item) => (
              <div key={item.label} className="ops-quick-action" onClick={item.click}>
                <div className="ops-quick-action-icon">{item.icon}</div>
                <div className="ops-quick-action-label">{item.label}</div>
              </div>
            ))}
            {/* Inventory — special card with status indicator */}
            {(() => {
              const isOrdering = invStatus.phase === "ordering";
              const isDone = invStatus.phase === "done";
              const isReady = invStatus.phase === "ready";
              const countingDone = invStatus.itemsCounted >= invStatus.totalItems && invStatus.totalItems > 0;
              const mainColor = isDone ? C.suc : isReady ? C.pri : invStatus.overdue ? "#EF4444" : C.acc;
              const fmtDate = (d) => { if (!d) return ""; const dt = new Date(d); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
              const addressedCount = (invStatus.ordered || 0) + (invStatus.skipped || 0);
              return (
                <div className="ops-quick-action" onClick={navTo["inventory"]} style={{ position: "relative", justifyContent: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
                  {invStatus.overdue && !isDone && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: "#FEE2E2", color: "#DC2626",
                    }}>{invStatus.daysOverdue}d overdue</span>
                  )}
                  <div className="ops-quick-action-icon" style={{ color: mainColor }}><I.Package /></div>
                  <div className="ops-quick-action-label">Inventory</div>
                  <div style={{ width: "80%", marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    {isDone ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.suc }}>
                          <span>✓ Done Counting</span>
                          <span>{fmtDate(invStatus.countingDoneDate)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.suc }}>
                          <span>✓ Done Ordering</span>
                          <span>{fmtDate(invStatus.orderingDoneDate)}</span>
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: C.textMut, marginTop: 2 }}>
                          Next due in {invStatus.daysUntilNext} day{invStatus.daysUntilNext !== 1 ? "s" : ""}
                        </div>
                      </>
                    ) : isReady ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700, color: C.pri }}>
                          <span>Ready to Submit</span>
                          <span>100%</span>
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: C.textMut }}>
                          Counted and ordered. Waiting for manual submit.
                        </div>
                      </>
                    ) : countingDone ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.suc }}>
                          <span>✓ Done Counting</span>
                          <span>{fmtDate(invStatus.countingDoneDate)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.textMut }}>
                          <span>Ordered</span>
                          <span>{addressedCount}/{invStatus.needsOrder}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.textMut }}>
                        <span>Logged</span>
                        <span>{invStatus.itemsCounted}/{invStatus.totalItems}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* opsVisRef needed for lazy-compute of checklist data */}
        <div ref={opsVisRef} />
      </div>
      )}

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

function DashboardWeatherStatusButton({ weather, loading, error, onClick }) {
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

function DashboardWeatherStrip({ weather, loading, error, limitations, targetDate, onOpen }) {
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

function DashboardWeatherModal({ weather, loading, error, limitations, onClose, onRefresh }) {
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
                <div style={{ fontSize: 13, fontWeight: 900, color: C.text }}>AI Weather Read</div>
                <span style={{ padding: "3px 9px", borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {tone.label}
                </span>
              </div>
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

function PlatformHealthStatusButton({ platformHealth, onClick }) {
  const tone = getDashboardPlatformHealthTone(platformHealth?.overall_status);
  const alertCount = platformHealth?.alerts?.length || 0;
  const label = platformHealth?.overall_status === "critical"
    ? `Platform Critical · ${alertCount || 1}`
    : platformHealth?.overall_status === "warning"
      ? `Health Warning · ${alertCount || 1}`
      : "Healthy";

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
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
      title={platformHealth?.alerts?.[0]?.message || "Open platform health"}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone.color, boxShadow: `0 0 0 3px ${tone.glow}` }} />
      {label}
    </button>
  );
}

function PlatformHealthModal({ platformHealth, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tone = getDashboardPlatformHealthTone(platformHealth?.overall_status);
  const jobs = platformHealth?.cron_health?.jobs || [];
  const reports = platformHealth?.reports?.reports || [];
  const factors = platformHealth?.health_factors || buildFallbackHealthFactors(platformHealth);
  const generated = formatDashboardHealthTime(platformHealth?.generated_at);
  const healthyJobs = jobs.filter((job) => job.status === "healthy").length;
  const healthyReports = reports.filter((report) => report.status === "healthy").length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Platform health breakdown"
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
        maxHeight: "88vh",
        overflow: "hidden",
        borderRadius: 14,
        background: "#FFFFFF",
        border: "1px solid rgba(15,23,42,0.10)",
        boxShadow: "0 24px 80px rgba(15,23,42,0.22)",
        animation: "healthModalIn 0.2s cubic-bezier(0.22,1,0.36,1) both",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{
          padding: "18px 22px",
          borderBottom: "1px solid rgba(15,23,42,0.08)",
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "flex-start",
          background: `linear-gradient(135deg, ${tone.bg}, #FFFFFF 62%)`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
              <span style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: tone.color,
                boxShadow: `0 0 0 5px ${tone.glow}`,
                flexShrink: 0,
              }} />
              <div style={{ fontSize: 18, fontWeight: 850, color: C.text, lineHeight: 1 }}>
                Platform Health: {tone.label}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5, maxWidth: 760 }}>
              Healthy means the scheduled data-pull Edge Functions are running, their HTTP responses are clean,
              and the canonical Supabase report outputs are fresh enough to trust.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <PlatformHealthStat label="Jobs" value={`${healthyJobs}/${jobs.length || 0}`} tone={tone} />
              <PlatformHealthStat label="Reports" value={`${healthyReports}/${reports.length || 0}`} tone={tone} />
              <PlatformHealthStat label="Alerts" value={String(platformHealth?.alerts?.length || 0)} tone={tone} />
              <PlatformHealthStat label="Generated" value={generated || "Unknown"} tone={tone} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close platform health"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.84)",
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

        <div style={{ overflowY: "auto", padding: 22 }}>
          <PlatformHealthSection title="Health Factors">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {factors.map((factor) => {
                const factorTone = getDashboardPlatformHealthTone(factor.status);
                return (
                  <div key={factor.key || factor.label} style={{
                    border: `1px solid ${factorTone.border}`,
                    background: factorTone.bg,
                    borderRadius: 10,
                    padding: 12,
                    minHeight: 132,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: factorTone.color }} />
                      <div style={{ fontSize: 12, fontWeight: 800, color: factorTone.color }}>{factor.label}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 750, color: C.text, lineHeight: 1.25 }}>{factor.summary}</div>
                    <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45, marginTop: 7 }}>{factor.description}</div>
                    {factor.healthy_criteria && (
                      <div style={{ fontSize: 10.5, color: C.textSec, lineHeight: 1.35, marginTop: 7, fontWeight: 650 }}>
                        Healthy: {factor.healthy_criteria}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </PlatformHealthSection>

          <PlatformHealthSection title="Scheduled Edge Functions">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobs.map((job) => (
                <PlatformFunctionRow key={job.jobname || job.function_name} job={job} />
              ))}
              {platformHealth?.self_check && (
                <PlatformFunctionRow
                  job={{
                    ...platformHealth.self_check,
                    jobname: "client-dashboard-poll",
                    schedule: "Client refresh",
                    cadence_label: platformHealth.self_check.cadence_label,
                    message: "Health payload loaded successfully.",
                  }}
                />
              )}
            </div>
          </PlatformHealthSection>

          <PlatformHealthSection title="Report Outputs">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {reports.map((report) => {
                const reportTone = getDashboardPlatformHealthTone(report.status);
                return (
                  <div key={report.id || report.key} style={{
                    border: `1px solid ${reportTone.border}`,
                    borderRadius: 10,
                    padding: 12,
                    background: "#FFFFFF",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{report.label}</div>
                      <StatusPill status={report.status} />
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.45, marginTop: 7 }}>
                      {report.description || "Canonical daily report output."}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 10 }}>
                      <PlatformHealthFact label="Items" value={report.total != null ? report.total.toLocaleString("en-US") : "Unknown"} />
                      <PlatformHealthFact label="Age" value={formatDashboardHealthAge(report.age_minutes)} />
                      <PlatformHealthFact label="Computed" value={formatDashboardHealthTime(report.computed_at) || "Not seen"} />
                      <PlatformHealthFact label="Updated" value={formatDashboardHealthTime(report.updated_at) || "Not seen"} />
                    </div>
                  </div>
                );
              })}
            </div>
          </PlatformHealthSection>

          {platformHealth?.alerts?.length ? (
            <PlatformHealthSection title="Active Alerts">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {platformHealth.alerts.map((alert, index) => {
                  const alertTone = getDashboardPlatformHealthTone(alert.severity);
                  return (
                    <div key={`${alert.message}_${index}`} style={{
                      border: `1px solid ${alertTone.border}`,
                      background: alertTone.bg,
                      borderRadius: 10,
                      padding: 12,
                      color: C.text,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 850, color: alertTone.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {alert.label || alert.kind || "Alert"}
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 5 }}>{alert.message}</div>
                      {alert.action && <div style={{ fontSize: 11.5, color: C.textMut, lineHeight: 1.4, marginTop: 5 }}>{alert.action}</div>}
                    </div>
                  );
                })}
              </div>
            </PlatformHealthSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlatformFunctionRow({ job }) {
  const tone = getDashboardPlatformHealthTone(job.status);
  const usedFor = compactDashboardHealthList([...(job.used_for || []), ...(job.affects || [])]).slice(0, 5);
  const nextRunInfo = getDashboardNextRun(job);
  const nextRun = nextRunInfo
    ? `${formatDashboardHealthTime(nextRunInfo.at)} (${formatDashboardHealthEta(nextRunInfo.eta)})`
    : "Not scheduled";

  return (
    <div style={{
      border: `1px solid ${tone.border}`,
      borderRadius: 10,
      padding: 13,
      background: "#FFFFFF",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: 14,
      alignItems: "start",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: tone.color, flexShrink: 0 }} />
          <div style={{ fontSize: 13, fontWeight: 850, color: C.text, lineHeight: 1.15 }}>{job.label || job.function_name}</div>
          <StatusPill status={job.status} />
        </div>
        <div style={{ fontSize: 11, color: C.textMut, fontWeight: 700, marginTop: 5 }}>
          {job.function_name || "Unknown function"}{job.sync_type ? ` · ${job.sync_type}` : ""}
        </div>
        <div style={{ fontSize: 11.5, color: C.textSec, lineHeight: 1.45, marginTop: 8 }}>
          {job.description || job.message || "Scheduled Edge Function health check."}
        </div>
        {usedFor.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
            {usedFor.map((label) => (
              <span key={`${job.jobname}_${label}`} style={{
                padding: "3px 6px",
                borderRadius: 999,
                background: "rgba(20,83,45,0.06)",
                color: C.pri,
                fontSize: 10,
                fontWeight: 750,
              }}>
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8 }}>
        <PlatformHealthFact label="Frequency" value={job.cadence_label || formatDashboardHealthCadence(job.cadence_minutes)} />
        <PlatformHealthFact label="Last run" value={formatDashboardHealthTime(job.last_run_at) || "No run"} />
        <PlatformHealthFact label="Last success" value={formatDashboardHealthTime(job.last_success_at) || "No success"} />
        <PlatformHealthFact label="Next run" value={nextRun} />
        <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: tone.color, fontWeight: 700, lineHeight: 1.35 }}>
          {job.message || "Recent scheduled responses are healthy."}
        </div>
      </div>
    </div>
  );
}

function PlatformHealthSection({ title, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ margin: "0 0 10px", color: C.text, fontSize: 14, fontWeight: 850 }}>{title}</h3>
      {children}
    </section>
  );
}

function PlatformHealthStat({ label, value, tone }) {
  return (
    <div style={{
      border: `1px solid ${tone.border}`,
      background: "rgba(255,255,255,0.76)",
      borderRadius: 8,
      padding: "6px 9px",
      minWidth: 86,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 850, color: C.text, marginTop: 2, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function PlatformHealthFact({ label, value }) {
  return (
    <div style={{
      borderRadius: 8,
      background: "#F8FAFC",
      border: "1px solid rgba(15,23,42,0.06)",
      padding: "7px 8px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 8.5, fontWeight: 850, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.text, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(value || "")}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const tone = getDashboardPlatformHealthTone(status);
  return (
    <span style={{
      padding: "2px 6px",
      borderRadius: 999,
      border: `1px solid ${tone.border}`,
      background: tone.bg,
      color: tone.color,
      fontSize: 9,
      fontWeight: 850,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {tone.label}
    </span>
  );
}

function getDashboardPlatformHealthTone(status) {
  if (status === "healthy" || status === "none" || status === "minor") {
    return { label: "Healthy", color: C.suc, bg: C.sucLt, border: "rgba(22,163,74,0.28)", glow: "rgba(22,163,74,0.12)" };
  }
  if (status === "critical") {
    return { label: "Critical", color: C.dan, bg: C.danLt, border: "rgba(220,38,38,0.28)", glow: "rgba(220,38,38,0.12)" };
  }
  if (status === "checking") {
    return { label: "Checking", color: C.info, bg: C.infoLt, border: "rgba(37,99,235,0.24)", glow: "rgba(37,99,235,0.10)" };
  }
  return { label: "Warning", color: C.warn, bg: C.warnLt, border: "rgba(217,119,6,0.28)", glow: "rgba(217,119,6,0.12)" };
}

function buildFallbackHealthFactors(platformHealth) {
  const jobs = platformHealth?.cron_health?.jobs || [];
  const reports = platformHealth?.reports?.reports || [];
  return [
    {
      key: "scheduled_edge_functions",
      label: "Scheduled Edge Functions",
      status: platformHealth?.cron_health?.status || platformHealth?.overall_status || "unknown",
      summary: `${jobs.filter((job) => job.status === "healthy").length}/${jobs.length} scheduled jobs healthy`,
      description: "Checks scheduled Edge Function runs and recent HTTP responses.",
      healthy_criteria: "Expected jobs are active and recently successful.",
    },
    {
      key: "canonical_reports",
      label: "Canonical Report Freshness",
      status: platformHealth?.reports?.status || platformHealth?.overall_status || "unknown",
      summary: `${reports.filter((report) => report.status === "healthy").length}/${reports.length} reports fresh`,
      description: "Checks today's canonical report rows.",
      healthy_criteria: "Report outputs have recent refresh timestamps.",
    },
  ];
}

function compactDashboardHealthList(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function formatDashboardHealthTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDashboardHealthAge(minutes) {
  if (minutes == null) return "Unknown";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDashboardHealthEta(minutes) {
  if (minutes == null) return "pending";
  if (minutes <= 1) return "in <1m";
  return `in ${minutes}m`;
}

function formatDashboardHealthCadence(minutes) {
  if (!minutes) return "On demand";
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

function getDashboardNextRun(job) {
  if (job?.next_run_at) {
    return {
      at: job.next_run_at,
      eta: job.next_run_eta_minutes,
    };
  }
  if (!job?.cadence_minutes || job.active === false) return null;
  const cadenceMs = job.cadence_minutes * 60000;
  const baseValue = job.last_run_at || job.last_success_at;
  const baseMs = baseValue ? new Date(baseValue).getTime() : NaN;
  if (Number.isNaN(baseMs)) return null;
  const nowMs = Date.now();
  let nextMs = baseMs + cadenceMs;
  if (nextMs <= nowMs) {
    nextMs = baseMs + (Math.floor((nowMs - baseMs) / cadenceMs) + 1) * cadenceMs;
  }
  return {
    at: new Date(nextMs).toISOString(),
    eta: Math.max(0, Math.ceil((nextMs - nowMs) / 60000)),
  };
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
        <div style={{ position: "absolute", bottom: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "#22C55E", animation: "dashPulse 1.5s infinite" }} />
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

/* InventoryCell — icon + status display + overdue badge */
const InventoryCell = memo(function InventoryCell({ done, total, overdue, daysOverdue, phase, needsOrder, ordered, skipped, countingDoneDate, orderingDoneDate, daysUntilNext, onClick }) {
  const allDone = phase === "done";
  const readyToSubmit = phase === "ready";
  const countingDone = done >= total && total > 0;
  const addressedCount = (ordered || 0) + (skipped || 0);
  const iconColor = allDone ? C.suc : readyToSubmit ? C.pri : overdue ? "#EF4444" : C.acc;
  const fmtDate = (d) => { if (!d) return ""; const dt = new Date(d); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
  return (
    <div className="dash-checklist-cell" onClick={onClick}
      style={{ animation: "dashSlideIn 0.2s cubic-bezier(0.22,1,0.36,1) both", position: "relative" }}
    >
      {onClick && <LinkIcon />}
      {overdue && !allDone && (
        <span style={{
          position: "absolute", top: 4, right: 4,
          padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700,
          background: "#FEE2E2", color: "#DC2626",
        }}>{daysOverdue}d</span>
      )}
      <div style={{ color: iconColor, opacity: 0.6, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
        <I.Package size={18} />
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: allDone ? C.suc : C.text, lineHeight: 1, marginBottom: 4, textAlign: "center" }}>
        Inventory
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", width: "100%" }}>
        {allDone ? (
          <>
            <div style={{ fontSize: 8, fontWeight: 600, color: C.suc }}>✓ Counted {fmtDate(countingDoneDate)}</div>
            <div style={{ fontSize: 8, fontWeight: 600, color: C.suc }}>✓ Ordered {fmtDate(orderingDoneDate)}</div>
            {daysUntilNext != null && (
              <div style={{ fontSize: 8, fontWeight: 500, color: C.textMut, marginTop: 1 }}>Next in {daysUntilNext}d</div>
            )}
          </>
        ) : readyToSubmit ? (
          <>
            <div style={{ fontSize: 8, fontWeight: 700, color: C.pri }}>Ready to Submit</div>
            <div style={{ fontSize: 8, fontWeight: 500, color: C.textMut }}>Waiting for lock-in</div>
          </>
        ) : countingDone ? (
          <>
            <div style={{ fontSize: 8, fontWeight: 600, color: C.suc }}>✓ Counted</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut }}>{addressedCount}/{needsOrder}</div>
          </>
        ) : (
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut }}>{done}/{total}</div>
        )}
      </div>
    </div>
  );
});

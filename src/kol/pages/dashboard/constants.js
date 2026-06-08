import { C } from "../../../shared/theme";

/* ═══════════════════════════════════════════════════════════════════════════
   CSS — injected once
   ═══════════════════════════════════════════════════════════════════════════ */
export const DASH_CSS = `
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
export const RANGES = [
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

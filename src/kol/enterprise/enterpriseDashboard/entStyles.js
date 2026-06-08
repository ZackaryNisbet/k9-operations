import { C } from "../../../shared/theme";

/* ═══════════════════════════════════════════════════════════════════════════
   CSS Animations
   ═══════════════════════════════════════════════════════════════════════════ */
export const ENT_CSS = `
@keyframes entSlideIn {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes entFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes entCountUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes entBarGrow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes entPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(20,83,45,0.12); }
  50%      { box-shadow: 0 0 0 8px rgba(20,83,45,0); }
}
@keyframes entShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes entScaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
.ent-card {
  background: ${C.surface};
  border-radius: 16px;
  border: 1.5px solid ${C.border};
  padding: 22px;
  animation: entSlideIn 0.45s cubic-bezier(0.22,1,0.36,1) both;
  transition: box-shadow 0.22s, transform 0.22s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}
.ent-card:hover {
  box-shadow: 0 8px 28px rgba(20,83,45,0.10), 0 2px 6px rgba(0,0,0,0.04);
  transform: translateY(-2px);
}
.ent-hero-num {
  animation: entCountUp 0.5s cubic-bezier(0.22,1,0.36,1) both;
}
.ent-bar-fill {
  transform-origin: left;
  animation: entBarGrow 0.7s cubic-bezier(0.22,1,0.36,1) both;
}
.ent-snapshot-stat {
  padding: 14px 16px;
  border-radius: 12px;
  background: ${C.surface};
  border: 1.5px solid ${C.border};
  text-align: center;
  transition: all 0.2s;
  cursor: default;
}
.ent-snapshot-stat:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(20,83,45,0.08);
}
.ent-loc-row {
  transition: all 0.15s;
  cursor: pointer;
}
.ent-loc-row:hover {
  background: ${C.priLt} !important;
}
.ent-alert-card {
  padding: 14px 18px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  transition: all 0.2s;
  cursor: default;
}
.ent-alert-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(20,83,45,0.06);
}
.ent-toggle-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1.5px solid transparent;
  font-family: inherit;
  user-select: none;
}
.ent-toggle-chip:hover {
  transform: scale(1.03);
}
@media (max-width: 768px) {
  .ent-report-grid { grid-template-columns: 1fr !important; }
}
`;

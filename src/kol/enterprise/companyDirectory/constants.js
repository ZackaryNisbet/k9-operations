import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";

export const VIEWS = [
  { key: "people", label: "People", icon: I.Users },
  { key: "org", label: "Org Chart", icon: I.Layers },
  { key: "resorts", label: "Resorts", icon: I.Home },
  { key: "gaps", label: "Data Gaps", icon: I.AlertTriangle },
];

export const HIGHLIGHT_OPTIONS = [
  { value: "parents", label: "Leadership path" },
  { value: "children", label: "Direct reports" },
  { value: "sameLevel", label: "Same level" },
  { value: "none", label: "Off" },
];

export const NAVIGATION_OPTIONS = [
  { value: "zoom", label: "Scroll to zoom" },
  { value: "scroll", label: "Scroll to move" },
  { value: "ctrl_zoom", label: "Control-scroll zoom" },
  { value: "vertical_scroll", label: "Vertical scroll" },
];

export const LAYOUT_OPTIONS = [
  { value: "balanced_tree", label: "Balanced tree" },
  { value: "standard_tree", label: "Standard tree" },
  { value: "compact_tree", label: "Compact tree" },
];

export const BRANCH_LAYOUT_OPTIONS = [
  { value: "standard_tree", label: "Standard tree branch" },
  { value: "compact_tree", label: "Compact branch" },
  { value: "compact_list", label: "Compact list branch" },
];

export const DIRECTORY_CSS = `
.dir-shell { min-height: calc(100vh - 72px); background: #F7FAF5; color: ${C.text}; }
.dir-wrap { max-width: 1680px; margin: 0 auto; padding: 24px; }
.dir-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 22px; align-items: end; margin-bottom: 16px; }
.dir-eyebrow { font-size: 12px; font-weight: 850; color: ${C.pri}; text-transform: uppercase; letter-spacing: 0; margin-bottom: 8px; }
.dir-title { font-size: 34px; line-height: 1.06; margin: 0; color: ${C.text}; letter-spacing: 0; }
.dir-subtitle { margin: 9px 0 0; color: ${C.textSec}; max-width: 860px; font-size: 15px; line-height: 1.5; }
.dir-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(128px, 1fr)); gap: 10px; }
.dir-stat { background: #fff; border: 1px solid ${C.border}; border-radius: 8px; padding: 12px 14px; min-width: 0; }
.dir-stat strong { display: block; font-size: 24px; color: ${C.pri}; line-height: 1; }
.dir-stat span { display: block; margin-top: 6px; color: ${C.textSec}; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0; }
.dir-tabs { display: flex; gap: 8px; padding: 6px; background: #fff; border: 1px solid ${C.border}; border-radius: 8px; width: fit-content; margin-bottom: 16px; }
.dir-tab { border: none; border-radius: 6px; background: transparent; color: ${C.textSec}; font: inherit; font-size: 13px; font-weight: 850; padding: 10px 13px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; }
.dir-tab svg { width: 17px; height: 17px; flex: 0 0 auto; }
.dir-tab.active { background: ${C.pri}; color: #fff; }
.dir-panel { background: #fff; border: 1px solid ${C.border}; border-radius: 8px; overflow: hidden; }
.dir-toolbar { display: grid; grid-template-columns: minmax(260px, 1.35fr) repeat(3, minmax(150px, .9fr)) auto; gap: 10px; padding: 14px; border-bottom: 1px solid ${C.border}; background: #fff; align-items: center; }
.dir-toolbar.resorts { grid-template-columns: minmax(260px, 1.35fr) repeat(3, minmax(150px, .9fr)); }
.dir-search-wrap { position: relative; min-width: 0; }
.dir-search-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: ${C.textSec}; width: 16px; height: 16px; }
.dir-search, .dir-select, .dir-input { height: 40px; border: 1px solid ${C.border}; border-radius: 8px; padding: 0 12px; font: inherit; font-size: 13px; color: ${C.text}; background: #fff; min-width: 0; width: 100%; }
.dir-search { padding-left: 38px; }
.dir-input.textarea { min-height: 78px; padding-top: 10px; resize: vertical; }
.dir-action { height: 40px; border: 1px solid ${C.border}; border-radius: 8px; background: #fff; color: ${C.text}; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font: inherit; font-size: 13px; font-weight: 850; padding: 0 12px; white-space: nowrap; }
.dir-action:hover { border-color: ${C.pri}; color: ${C.pri}; background: ${C.priLt}; }
.dir-action.primary { background: ${C.pri}; border-color: ${C.pri}; color: #fff; }
.dir-action.primary:hover { background: #084B18; color: #fff; }
.dir-action.danger { color: ${C.dan}; }
.dir-action:disabled { opacity: .5; cursor: not-allowed; }
.dir-add-action { min-width: 130px; box-shadow: 0 1px 3px rgba(20,83,45,.24); }
.dir-table-wrap { overflow-x: auto; }
.dir-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 940px; }
.dir-table.resorts { min-width: 1100px; }
.dir-table th { text-align: left; color: ${C.textSec}; font-size: 11px; text-transform: uppercase; letter-spacing: 0; padding: 12px 14px; background: #F8FAF7; border-bottom: 1px solid ${C.border}; white-space: nowrap; }
.dir-table td { padding: 13px 14px; border-bottom: 1px solid ${C.border}; vertical-align: middle; }
.dir-row { cursor: pointer; transition: background .12s; }
.dir-row:hover { background: ${C.priLt}; }
.dir-cell-main { font-weight: 850; color: ${C.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px; }
.dir-person { display: flex; align-items: center; gap: 11px; min-width: 0; }
.dir-avatar { width: 38px; height: 38px; border-radius: 8px; background: ${C.pri}; color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 13px; flex: 0 0 auto; border: 1px solid rgba(11,93,30,.12); overflow: hidden; }
.dir-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dir-avatar.large { width: 68px; height: 68px; font-size: 20px; border-radius: 10px; }
.dir-name { font-weight: 850; color: ${C.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dir-muted { color: ${C.textSec}; font-size: 12px; line-height: 1.45; }
.dir-strong-muted { color: ${C.text}; font-size: 12px; font-weight: 750; }
.dir-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 999px; font-size: 11px; line-height: 15px; font-weight: 850; background: ${C.priLt}; color: ${C.pri}; white-space: nowrap; border: 1px solid rgba(11,93,30,.08); }
.dir-pill.warn { background: ${C.warnLt}; color: ${C.warn}; border-color: rgba(204,124,0,.16); }
.dir-pill.neutral { background: #F3F4F6; color: #4B5563; border-color: #E5E7EB; }
.dir-pill.status-inactive { background: #F3F4F6; color: #6B7280; border-color: #D1D5DB; }
.dir-pill.status-needs_data { background: ${C.warnLt}; color: ${C.warn}; }
.dir-switch-chip { min-height: 32px; display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 999px; border: 1px solid ${C.border}; background: #fff; color: ${C.textSec}; font-size: 11px; font-weight: 850; cursor: pointer; white-space: nowrap; }
.dir-switch-chip input { position: absolute; opacity: 0; pointer-events: none; }
.dir-switch-chip.active { border-color: ${C.pri}; background: ${C.pri}; color: #fff; }
.dir-switch-track { width: 34px; height: 20px; border-radius: 999px; background: #CBD5E1; position: relative; transition: background .16s ease; flex: 0 0 auto; }
.dir-switch-track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(15,23,42,.25); transition: transform .16s ease; }
.dir-switch-chip.active .dir-switch-track { background: ${C.acc}; }
.dir-switch-chip.active .dir-switch-track::after { transform: translateX(14px); }
.dir-empty { padding: 42px; text-align: center; color: ${C.textSec}; }
.dir-meta-label { font-size: 11px; font-weight: 850; color: ${C.textSec}; text-transform: uppercase; letter-spacing: 0; margin-bottom: 4px; }
.dir-gap-list { display: grid; gap: 10px; padding: 14px; }
.dir-gap { border: 1px solid ${C.border}; border-left: 4px solid ${C.warn}; border-radius: 8px; padding: 14px; background: #fff; }
.dir-gap h3 { margin: 0 0 5px; font-size: 15px; color: ${C.text}; }
.dir-chart-head { padding: 14px; border-bottom: 1px solid ${C.border}; display: grid; grid-template-columns: minmax(260px, 1fr) auto; gap: 12px; background: #fff; align-items: center; overflow: visible; }
.dir-chart-title h2 { margin: 0; font-size: 20px; line-height: 1.15; color: ${C.text}; }
.dir-chart-title p { margin: 5px 0 0; color: ${C.textSec}; font-size: 13px; line-height: 1.35; max-width: 820px; }
.dir-chart-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.dir-chart-search { width: min(340px, 36vw); }
.dir-settings { position: relative; }
.dir-settings-panel { position: absolute; right: 0; top: calc(100% + 8px); width: min(720px, 92vw); z-index: 70; border: 1px solid ${C.border}; border-radius: 8px; background: rgba(255,255,255,.98); box-shadow: 0 24px 60px rgba(15,23,42,.16); padding: 14px; display: grid; gap: 12px; }
.dir-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dir-settings-row { display: grid; gap: 6px; min-width: 0; }
.dir-settings-row label { font-size: 11px; font-weight: 850; color: ${C.textSec}; text-transform: uppercase; letter-spacing: 0; }
.dir-settings-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.dir-chart-shell { padding: 12px; background: #fff; }
.dir-chart-card { height: clamp(720px, calc(100vh - 170px), 1040px); border: 1px solid ${C.border}; border-radius: 8px; background: #FCFEFB; overflow: hidden; }
.dir-chart-card svg { display: block; }
.dir-chart-card .highlighted rect.boc-hoverable { stroke: ${C.pri}; stroke-width: 2.5; }
.dir-chart-card .not-highlighted { opacity: .34; }
.dir-tree-list { display: grid; gap: 8px; padding: 14px; }
.dir-tree-row { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid ${C.border}; }
.dir-tree-contact { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 5px; font-size: 11px; font-weight: 750; color: ${C.textSec}; }
.dir-tree-contact span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir-drawer-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.30); z-index: 2000; }
.dir-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: #fff; z-index: 2001; box-shadow: -24px 0 70px rgba(15,23,42,.22); display: flex; flex-direction: column; }
.dir-drawer-head { padding: 22px; border-bottom: 1px solid ${C.border}; display: flex; gap: 14px; align-items: center; }
.dir-drawer-body { padding: 18px 22px 26px; overflow: auto; display: grid; gap: 16px; }
.dir-close { margin-left: auto; width: 34px; height: 34px; border-radius: 8px; border: 1px solid ${C.border}; background: #fff; cursor: pointer; color: ${C.textSec}; display: grid; place-items: center; flex: 0 0 auto; }
.dir-detail-block { border: 1px solid ${C.border}; border-radius: 8px; padding: 14px; }
.dir-detail-block h4 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0; color: ${C.textSec}; }
.dir-form { display: grid; gap: 14px; }
.dir-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dir-field { display: grid; gap: 6px; min-width: 0; }
.dir-field label { font-size: 11px; font-weight: 850; color: ${C.textSec}; text-transform: uppercase; letter-spacing: 0; }
.dir-photo-edit { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 14px; align-items: center; padding: 12px; border: 1px solid ${C.border}; border-radius: 8px; background: #F8FAF7; }
.dir-file { width: 100%; font: inherit; font-size: 12px; color: ${C.textSec}; }
.dir-inline-error { border: 1px solid rgba(185, 28, 28, .22); background: #FEF2F2; color: #991B1B; border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.35; }
.dir-inline-note { border: 1px solid ${C.border}; background: #F8FAF7; color: ${C.textSec}; border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.35; }
.dir-mobile-only { display: none; }
@media (max-width: 1080px) {
  .dir-wrap { padding: 18px; }
  .dir-hero { grid-template-columns: 1fr; }
  .dir-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dir-toolbar { grid-template-columns: 1fr 1fr; }
  .dir-toolbar.resorts { grid-template-columns: 1fr 1fr; }
  .dir-toolbar .dir-action.primary { grid-column: span 2; }
  .dir-chart-head { grid-template-columns: 1fr; }
  .dir-chart-actions { justify-content: flex-start; }
  .dir-chart-search { width: min(100%, 420px); }
  .dir-settings-panel { left: 0; right: auto; }
}
@media (max-width: 760px) {
  .dir-title { font-size: 28px; }
  .dir-tabs { width: 100%; overflow-x: auto; }
  .dir-tab { flex: 1 0 auto; }
  .dir-toolbar { grid-template-columns: 1fr; }
  .dir-toolbar.resorts { grid-template-columns: 1fr; }
  .dir-toolbar .dir-action.primary { grid-column: auto; }
  .dir-form-grid { grid-template-columns: 1fr; }
  .dir-table { min-width: 860px; }
  .dir-settings-grid { grid-template-columns: 1fr; }
  .dir-settings-panel { position: fixed; left: 12px; right: 12px; top: 86px; width: auto; max-height: calc(100vh - 110px); overflow: auto; }
  .dir-chart-card { display: none; }
  .dir-mobile-only { display: block; }
  .dir-tree-row { grid-template-columns: 38px minmax(0, 1fr); }
  .dir-tree-row .dir-action { grid-column: 2; width: fit-content; }
}
`;

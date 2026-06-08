import { C } from "../../../shared/theme";
import { K9_FONT_STACK } from "./constants";

export const PAGE_CSS = `
@keyframes enrichmentPanelIn{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes enrichmentFloatIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes enrichmentHealthPulse{0%,100%{transform:scale(1);box-shadow:0 0 12px currentColor}50%{transform:scale(1.32);box-shadow:0 0 24px currentColor}}
@keyframes enrichmentHealthSweep{0%{transform:translateX(-100%);opacity:.16}45%{opacity:.75}100%{transform:translateX(100%);opacity:.16}}
@keyframes enrichmentProgressSheen{0%{transform:translateX(-120%);opacity:0}25%{opacity:.62}100%{transform:translateX(140%);opacity:0}}
@keyframes enrichmentSoftGlow{0%,100%{transform:translate3d(-12%,0,0) rotate(10deg);opacity:.22}50%{transform:translate3d(18%,4%,0) rotate(10deg);opacity:.42}}
@keyframes enrichmentOrbit{to{transform:rotate(360deg)}}
.page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:16px;font-family:${K9_FONT_STACK}}
.back-link{display:inline-flex;align-items:center;gap:7px;border:1px solid transparent;background:transparent;color:${C.textMut};font-family:${K9_FONT_STACK};font-size:13px;line-height:18px;font-weight:800;letter-spacing:0;cursor:pointer;margin:0 0 10px;padding:7px 9px 7px 6px;border-radius:999px;transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease}
.back-link span{font-weight:800}
.back-link svg{width:17px;height:17px;stroke-width:2.2}
.back-link:hover{background:#fff;border-color:rgba(20,83,45,.16);color:${C.pri};transform:translateX(-1px)}
.eyebrow,.panel-eyebrow{font-size:10px;line-height:14px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:${C.pri}}
.page-header h1{font-size:32px;line-height:38px;font-weight:850;margin:4px 0;color:${C.text};letter-spacing:0}
.page-header p{font-size:14px;line-height:22px;font-weight:400;color:${C.textSec};max-width:680px;margin:0}
.header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.month-control{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid ${C.border};border-radius:6px;padding:6px}
.month-control button{width:36px;height:36px;border-radius:6px;border:0;background:${C.surfaceHover};color:${C.text};display:flex;align-items:center;justify-content:center;cursor:pointer}
.month-control span{font-size:14px;line-height:20px;font-weight:600;color:${C.text};min-width:132px;text-align:center}
.primary-btn,.secondary-btn,.danger-btn{border-radius:6px;padding:10px 14px;font:900 14px/20px ${K9_FONT_STACK};letter-spacing:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}
.primary-btn:hover,.secondary-btn:hover,.danger-btn:hover{transform:translateY(-1px)}
.primary-btn{border:1px solid ${C.pri};background:${C.pri};color:#fff;box-shadow:0 10px 24px rgba(20,83,45,.18)}
.secondary-btn{background:#fff;color:${C.pri};border:1px solid rgba(20,83,45,.22);box-shadow:0 8px 18px rgba(15,23,42,.06)}
.danger-btn{background:${C.dan};color:#fff;border:1px solid ${C.dan};box-shadow:0 1px 2px rgba(0,0,0,.05)}
.wide{width:100%}
.storage-pill{font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;padding:6px 9px;background:#fff;color:${C.textMut};border:1px solid ${C.border}}
.storage-pill.settings{color:${C.warn};background:${C.warnLt}}.storage-pill.seed{color:${C.textMut};background:${C.surfaceHover}}
.enrichment-daily-surface{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px;align-items:stretch}
.daily-module-card,.calendar-shell,.detail-panel,.sop-card,.sop-admin-card,.builder-form,.builder-preview,.handoff-controls,.handoff-main,.graphic-upload-card,.workflow-command,.workflow-side>div{background:#fff;border:1px solid rgba(148,163,184,.24);border-radius:8px;box-shadow:0 14px 36px rgba(15,23,42,.08);animation:enrichmentPanelIn .42s cubic-bezier(.16,1,.3,1) both}
.daily-module-card{min-height:214px;padding:16px;display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden;font-family:${K9_FONT_STACK};text-align:left;color:${C.text};transition:transform .22s cubic-bezier(.16,1,.3,1),box-shadow .22s ease,border-color .22s ease}
button.daily-module-card{width:100%;cursor:pointer}
.daily-module-card:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(15,23,42,.1)}
.daily-module-card:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,${C.pri},${C.acc});opacity:.9}
.daily-module-card>*{position:relative;z-index:1}
.event-plan-card{border-color:color-mix(in srgb,var(--event-color,${C.pri}) 28%,rgba(148,163,184,.24));background:linear-gradient(135deg,#fff 0%,#fff 50%,var(--event-soft,#F8FAFC) 100%)}
.event-plan-card:before{background:linear-gradient(90deg,var(--event-color,${C.pri}),${C.acc})}
.event-plan-card.empty,.event-plan-card.loading{cursor:pointer;background:linear-gradient(135deg,#fff 0%,#F8FAFC 100%)}
.queue-card{background:linear-gradient(135deg,#fff 0%,#fff 52%,rgba(247,254,231,.72) 100%)}
.queue-card.has-review:before{background:linear-gradient(90deg,${C.warn},${C.acc})}
.queue-card:after{content:"";position:absolute;inset:-42% auto auto -28%;width:58%;height:170%;background:linear-gradient(90deg,transparent,rgba(132,204,22,.16),transparent);filter:blur(8px);animation:enrichmentSoftGlow 6.4s ease-in-out infinite;pointer-events:none}
.sop-snapshot-card{background:linear-gradient(135deg,#fff 0%,#fff 56%,#F8FAFC 100%)}
.daily-module-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.daily-module-head h2,.daily-module-head h3{font-size:22px;line-height:28px;font-weight:900;color:${C.text};letter-spacing:0;margin:0 0 3px}
.event-plan-meta{font-size:12px;line-height:16px;font-weight:800;color:${C.textMut};margin-top:-4px}
.event-plan-card p{font-size:14px;line-height:21px;font-weight:650;color:${C.textSec};margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.event-plan-chip-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto}
.event-plan-chip-row span,.module-price{border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.07);font-size:10px;line-height:14px;font-weight:900;color:${C.textSec};padding:5px 8px;white-space:nowrap}
.module-price{color:var(--event-color,${C.pri})}
.module-skeleton{border-radius:999px;background:#E5E7EB}
.module-skeleton.short{height:13px;width:130px}
.module-skeleton.title{height:26px;width:72%}
.module-skeleton.body{height:14px;width:88%}
.queue-main{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:72px;margin-top:auto}
.daily-run-completion{display:flex;align-items:baseline;gap:10px;min-width:0}
.daily-run-completion span{font-size:12px;line-height:16px;font-weight:900;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em}
.daily-run-completion strong{font-size:46px;line-height:48px;font-weight:900;color:${C.text};letter-spacing:0;font-variant-numeric:tabular-nums}
.daily-run-review{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(217,119,6,.24);background:${C.warnLt};color:${C.warn};border-radius:999px;padding:8px 10px;font:900 12px/16px ${K9_FONT_STACK};white-space:nowrap;box-shadow:0 8px 20px rgba(217,119,6,.08)}
.daily-run-review svg{width:15px;height:15px;stroke-width:2.2}
.daily-run-progress{height:7px;border-radius:999px;background:rgba(20,83,45,.1);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(20,83,45,.04)}
.daily-run-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,${C.pri},${C.acc});transition:width .48s cubic-bezier(.16,1,.3,1);position:relative;overflow:hidden}
.daily-run-progress span:after{content:"";position:absolute;inset:0;width:42%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);animation:enrichmentProgressSheen 2.1s cubic-bezier(.16,1,.3,1) infinite}
.daily-module-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:auto}
.daily-module-foot .workflow-health-btn{min-height:44px;min-width:158px;border-radius:10px;padding:0 12px}
.daily-module-head .secondary-btn{min-height:36px;padding:7px 10px;font-size:12px;line-height:16px}
.daily-sop-list{display:grid;gap:8px;min-height:0}
.daily-sop-list article{border:1px solid;border-radius:8px;padding:10px;animation:enrichmentFloatIn .28s ease both}
.daily-sop-list article strong{display:block;font-size:13px;line-height:18px;font-weight:900}
.daily-sop-list article span,.daily-sop-list p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:18px;color:${C.textSec};margin:4px 0 0}
.pill-list span{font-size:10px;line-height:14px;font-weight:600;border-radius:999px;background:${C.priLt};color:${C.pri};padding:5px 8px}
.inline-warning{margin-top:12px;border:1px solid rgba(217,119,6,.28);background:${C.warnLt};color:#92400E;border-radius:6px;padding:10px 12px;font-size:12px;line-height:16px;font-weight:500}
.inline-warning.top-warning{margin:0 0 12px}
.tab-row{display:flex;gap:8px;margin:8px 0 12px;flex-wrap:wrap}
.tab{border:1px solid ${C.border};background:#fff;color:${C.textSec};border-radius:999px;padding:9px 14px;font:900 14px/20px ${K9_FONT_STACK};letter-spacing:0;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}
.tab:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.07);border-color:rgba(20,83,45,.18)}
.tab.active{background:${C.pri};color:#fff;border-color:${C.pri}}
.main-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}
.calendar-shell{padding:14px}
.weekday-row{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px}
.weekday-row div{background:${C.pri};color:#fff;border-radius:6px;padding:9px 0;text-align:center;font-size:12px;line-height:16px;font-weight:600}
.weekday-row div:first-child,.weekday-row div:last-child{background:${C.accLt};color:${C.pri}}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.calendar-day{position:relative;min-height:132px;border:1px solid ${C.border};background:#fff;border-radius:6px;padding:10px;text-align:left;font-family:inherit;cursor:pointer;transition:border-color .15s, box-shadow .15s}
.calendar-day:hover{border-color:rgba(20,83,45,.36);box-shadow:0 4px 6px rgba(0,0,0,.07)}
.calendar-day.muted{opacity:.42}.calendar-day.selected{outline:2px solid ${C.pri};outline-offset:0}
.day-number{font-size:14px;line-height:20px;font-weight:600;color:${C.text}}
.day-events{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.day-event{border:1px solid;border-radius:6px;padding:5px 6px;font-size:12px;line-height:16px;font-weight:600;white-space:normal}
.day-event.active{box-shadow:inset 0 0 0 1px currentColor}
.more-events{font-size:10px;line-height:14px;font-weight:600;color:${C.textMut}}
.add-day-event{position:absolute;right:8px;top:8px;font-size:10px;line-height:14px;font-weight:600;color:${C.pri};opacity:0}
.calendar-day:hover .add-day-event{opacity:1}
.detail-panel{padding:14px;position:sticky;top:12px}
.detail-hero{border-radius:8px;border:1px solid ${C.border};padding:18px}
.detail-topline{display:flex;justify-content:space-between;gap:10px;font-size:11px;line-height:16px;font-weight:500;text-transform:uppercase;letter-spacing:.05em}
.detail-hero h2{font-size:24px;line-height:32px;font-weight:700;margin:8px 0 4px;color:${C.text}}
.detail-date{font-size:12px;line-height:16px;font-weight:500;color:${C.textMut}}
.detail-hero p,.detail-section p,.sop-card p,.handoff-controls p,.graphic-upload-head p,.handoff-event p,.graphic-empty p{font-size:14px;line-height:22px;font-weight:400;color:${C.textSec};margin:10px 0 0}
.detail-chips,.pill-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.detail-chips span{font-size:10px;line-height:14px;font-weight:600;border-radius:999px;background:#fff;color:${C.textSec};padding:5px 8px;border:1px solid ${C.border}}
.same-day-list,.detail-section{padding:14px 2px;border-bottom:1px solid ${C.border}}
.section-title{font-family:${K9_FONT_STACK};font-size:11px;line-height:16px;font-weight:900;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em;margin-bottom:9px}
.same-day{border:1px solid ${C.border};background:#fff;border-radius:6px;padding:8px 10px;margin:0 6px 6px 0;font:600 12px/16px inherit;color:${C.textSec};cursor:pointer}
.same-day.active{background:${C.pri};color:#fff}
.product-list{display:flex;flex-direction:column;gap:8px}
.product-reference-card,.prep-list div{border:1px solid ${C.border};border-radius:6px;padding:10px;background:${C.surfaceHover}}
.product-reference-card{display:flex;align-items:center;justify-content:space-between;gap:12px;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
.product-reference-card.linked:hover{border-color:rgba(37,99,235,.24);box-shadow:0 10px 22px rgba(37,99,235,.08);transform:translateY(-1px)}
.product-reference-main{min-width:0}
.product-reference-main strong,.prep-list strong{display:block;font-size:14px;line-height:20px;font-weight:850;color:${C.text}}
.product-reference-main span,.prep-list span{display:block;font-size:12px;line-height:16px;font-weight:650;color:${C.textMut};margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.product-reference-action,.product-inline-links a,.product-link-panel a,.resource-link-list a{display:inline-flex;align-items:center;gap:6px;color:${C.info};font-size:13px;line-height:18px;font-weight:850;text-decoration:none}
.product-reference-action{flex-shrink:0;border:1px solid rgba(37,99,235,.18);background:#fff;border-radius:999px;padding:6px 9px}
.product-reference-action:hover,.product-inline-links a:hover,.product-link-panel a:hover,.resource-link-list a:hover{border-color:rgba(37,99,235,.32);background:${C.infoLt};text-decoration:none}
.product-reference-action svg,.product-inline-links svg,.product-link-panel svg,.resource-link-list svg{width:15px;height:15px;stroke-width:1.8;flex-shrink:0}
.product-inline-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.product-inline-links a,.product-inline-links .product-text{border:1px solid ${C.border};background:#fff;border-radius:999px;padding:6px 9px}
.product-inline-links .product-text{display:inline-flex;font-size:12px;line-height:16px;font-weight:750;color:${C.textMut}}
.checklist-list{display:flex;flex-direction:column;gap:8px}
.checklist-list div{display:flex;gap:8px;align-items:flex-start;font-size:14px;line-height:22px;color:${C.textSec}}
.checklist-list svg{color:${C.pri};flex-shrink:0;margin-top:2px;stroke-width:1.5}
.empty-state{text-align:center;padding:60px 20px;color:${C.textMut}}
.empty-state.compact{padding:34px 20px}
.empty-state svg{color:${C.pri};width:38px;height:38px;stroke-width:1.5}
.empty-state h2{font-size:18px;line-height:26px;font-weight:700;color:${C.text};margin:14px 0 6px}
.detail-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.sop-grid{display:grid;grid-template-columns:1.1fr 1fr .9fr;gap:16px;align-items:start}
.sop-admin-card{grid-column:1/-1;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(135deg,#fff,${C.priLt})}
.sop-admin-card p{font-size:13px;line-height:20px;color:${C.textSec};margin:0;max-width:760px}
.sop-admin-card small{display:block;margin-top:5px;font-size:11px;line-height:15px;color:${C.warn}}
.sop-admin-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.enterprise-lock-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgba(20,83,45,.18);background:#fff;color:${C.textMut};padding:7px 10px;font:900 10px/14px ${K9_FONT_STACK};text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.sop-card{padding:18px}.sop-card h2{font-size:24px;line-height:32px;font-weight:700;color:${C.text};margin:0 0 8px}
.sop-card.span-two{grid-column:span 2}
.resource-link-list{display:flex;flex-direction:column;gap:9px;margin-top:14px}
.resource-link-list a{border:1px solid ${C.border};background:${C.surfaceHover};border-radius:6px;padding:10px 12px;justify-content:flex-start;transition:border-color .18s ease,background .18s ease,transform .18s ease,box-shadow .18s ease}
.resource-link-list a:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(37,99,235,.08)}
.resource-editor{display:grid;gap:9px;margin-top:14px}
.resource-editor-row{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:8px;align-items:center}
.resource-editor-row input:first-child{grid-column:1/-1}
.resource-editor-row input,.program-sop-editor input,.program-sop-editor textarea{width:100%;border:1px solid ${C.border};border-radius:6px;background:#fff;color:${C.text};font:700 13px/20px ${K9_FONT_STACK};padding:10px 11px;transition:border-color .16s ease,box-shadow .16s ease}
.program-sop-editor textarea{resize:vertical;font-weight:600;line-height:19px;min-height:58px}
.resource-editor-row input:focus,.program-sop-editor input:focus,.program-sop-editor textarea:focus{outline:0;border-color:${C.pri};box-shadow:0 0 0 3px rgba(20,83,45,.09)}
.resource-editor-row>button,.program-sop-editor-head>button,.program-sop-editor-item>button{width:36px;height:36px;border-radius:8px;border:1px solid rgba(220,38,38,.18);background:#FEF2F2;color:${C.dan};display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.resource-editor-row>button svg,.program-sop-editor-head>button svg,.program-sop-editor-item>button svg{width:16px;height:16px;stroke-width:1.8}
.sop-section-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.sop-section-list section{border-top:1px solid ${C.border};padding-top:12px}
.sop-section-list h3{font-size:15px;line-height:22px;font-weight:700;color:${C.text};margin:0 0 8px}
.program-sop-editor{display:grid;gap:12px}
.program-sop-editor-section{border:1px solid ${C.border};border-radius:8px;background:${C.surfaceHover};padding:12px}
.program-sop-editor-head{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:8px;align-items:center;margin-bottom:10px}
.program-sop-editor-head input{font-size:15px;line-height:22px;font-weight:900}
.program-sop-editor-items{display:grid;gap:8px}
.program-sop-editor-item{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:8px;align-items:start}
.script-list{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.script-block{border:1px solid ${C.border};border-radius:6px;background:${C.surfaceHover};padding:12px}
.script-block strong{display:block;font-size:13px;line-height:18px;font-weight:700;color:${C.text};margin-bottom:4px}
.script-block p{margin:0;color:${C.textSec}}
.prep-list{display:flex;flex-direction:column;gap:9px}
.builder-grid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start}
.builder-form,.builder-preview{padding:18px}
.builder-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}
.builder-header h2{margin:0;font-size:24px;line-height:32px;font-weight:700;color:${C.text}}
.field-grid{display:grid;gap:12px}.field-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.field span{font-size:12px;line-height:16px;font-weight:500;color:${C.textSec}}
.field input,.field textarea,.field select{border:1px solid ${C.border};border-radius:6px;padding:12px;font-family:${K9_FONT_STACK};font-size:14px;line-height:22px;font-weight:700;color:${C.text};background:#fff;letter-spacing:0}
.field input:focus,.field textarea:focus,.field select:focus{outline:2px solid rgba(20,83,45,.16);border-color:${C.pri}}
.field textarea{resize:vertical}
.field-help{font-size:12px;line-height:16px;color:${C.textMut};margin-top:2px}
.product-editor{display:grid;gap:8px}
.product-editor-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(120px,.42fr) minmax(0,1.15fr) 38px;gap:8px;align-items:center}
.product-editor-row input{min-width:0}
.product-editor-row>button{width:38px;height:38px;border-radius:8px;border:1px solid rgba(220,38,38,.18);background:#FEF2F2;color:${C.dan};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .16s ease,opacity .16s ease}
.product-editor-row>button:disabled{opacity:.34;cursor:not-allowed}
.product-editor-row>button:not(:disabled):hover{transform:translateY(-1px)}
.product-editor-row>button svg{width:16px;height:16px;stroke-width:1.9}
.toggle-row{display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;font-weight:500;color:${C.text};margin:4px 0 14px}
.form-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.handoff-grid{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start}
.handoff-controls{padding:18px;position:sticky;top:12px}
.handoff-controls h2{font-size:24px;line-height:32px;font-weight:700;color:${C.text};margin:0 0 8px}
.audience-options{display:flex;flex-direction:column;gap:8px;margin:18px 0}
.audience{border:1px solid ${C.border};background:#fff;color:${C.text};border-radius:6px;padding:11px 12px;text-align:left;font:600 14px/20px inherit;cursor:pointer}
.audience.active{border-color:${C.pri};background:${C.priLt};color:${C.pri}}
.notes-box,.product-link-panel{margin-top:14px;border-radius:6px;background:${C.surfaceHover};border:1px solid ${C.border};padding:12px}
.notes-box p,.product-link-panel p{font-size:12px;line-height:16px;margin:0 0 8px;color:${C.textMut}}
.product-link-panel{display:flex;flex-direction:column;gap:8px}
.product-link-panel a{border:1px solid ${C.border};background:#fff;border-radius:999px;padding:7px 10px;width:max-content;max-width:100%}
.handoff-main{padding:18px}
.graphic-upload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
.graphic-upload-card{padding:16px;box-shadow:none}
.graphic-upload-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.graphic-status{font-size:10px;line-height:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;background:${C.sucLt};color:${C.suc};padding:5px 8px;white-space:nowrap}
.graphic-status.missing{background:${C.surfaceHover};color:${C.textMut}}
.graphic-viewer{margin-top:12px;border:1px solid ${C.border};border-radius:6px;background:${C.surfaceHover};min-height:220px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.graphic-viewer img{display:block;width:100%;height:100%;max-height:420px;object-fit:contain;background:#fff}
.graphic-viewer a{display:inline-flex;align-items:center;gap:8px;color:${C.info};font-size:14px;line-height:20px;font-weight:700;text-decoration:none}
.graphic-empty{margin-top:12px;border:1px dashed ${C.border};border-radius:6px;background:${C.surfaceHover};min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px}
.graphic-empty svg{width:32px;height:32px;color:${C.textMut};stroke-width:1.5}
.graphic-file-meta{display:flex;justify-content:space-between;gap:10px;margin:10px 0;color:${C.textMut};font-size:12px;line-height:16px}
.upload-btn{position:relative;overflow:hidden;margin-top:12px}.upload-btn input{position:absolute;inset:0;opacity:0;cursor:pointer}
.handoff-event-list{display:flex;flex-direction:column;gap:10px}
.handoff-event{display:flex;justify-content:space-between;gap:14px;border:1px solid ${C.border};border-radius:6px;background:${C.surfaceHover};padding:12px}
.handoff-event strong{display:block;font-size:14px;line-height:20px;font-weight:700;color:${C.text}}
.handoff-event p{margin-top:4px}
.handoff-event-meta{display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0}
.handoff-event-meta span{font-size:10px;line-height:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;background:#fff;border:1px solid ${C.border};color:${C.textSec};padding:5px 8px;white-space:nowrap}
.workflow-health-btn{position:relative;overflow:hidden;border:2px solid;border-radius:12px;padding:0 16px;font:900 14px/15px ${K9_FONT_STACK};letter-spacing:0;display:inline-flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;min-height:64px;min-width:154px;transition:filter .2s ease,transform .2s ease,box-shadow .2s ease}
.workflow-health-btn:hover{filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 12px 30px rgba(15,23,42,.09)}
.workflow-health-sweep{position:absolute;inset:0;width:60%;pointer-events:none}
.workflow-health-progressbar{position:absolute;left:0;bottom:0;height:3px;transition:width .35s ease;pointer-events:none}
.workflow-health-dot{width:10px;height:10px;border-radius:999px;display:inline-block;flex-shrink:0;position:relative;z-index:1}
.workflow-health-copy{display:grid;gap:2px;min-width:0;line-height:1.05;position:relative;z-index:1;text-align:left}
.workflow-health-copy>span{white-space:nowrap}
.workflow-health-copy small{font-size:10px;line-height:12px;color:${C.textMut};font-weight:850;font-variant-numeric:tabular-nums;white-space:nowrap}
.workflow-mini-status{position:relative;margin-top:16px;border:1px solid rgba(20,83,45,.14);background:linear-gradient(135deg,#fff,${C.priLt});border-radius:8px;padding:14px;display:grid;grid-template-columns:1fr auto;gap:12px;overflow:hidden}
.workflow-mini-status strong{display:block;font-size:20px;line-height:26px;font-weight:850;color:${C.text};margin-top:3px}
.workflow-mini-status p{font-size:12px;line-height:18px;color:${C.textSec};margin:3px 0 0}
.workflow-mini-health{display:flex;align-items:center;gap:8px;font:900 12px/16px ${K9_FONT_STACK};white-space:nowrap}
.workflow-mini-health small{display:block;color:${C.textMut};font-size:10px;font-weight:700;margin-left:2px}
.workflow-mini-bar{grid-column:1/-1;height:6px;border-radius:999px;background:rgba(20,83,45,.1);overflow:hidden}
.workflow-mini-bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,${C.pri},${C.acc});transition:width .45s cubic-bezier(.16,1,.3,1)}
.workflow-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
.workflow-command{padding:20px}
.workflow-command.workflow-command-tight{padding:0;background:transparent;border:0;box-shadow:none}
.workflow-command-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.workflow-command-head h2{font-size:28px;line-height:36px;font-weight:850;color:${C.text};margin:0 0 4px}
.workflow-command-head p,.workflow-reconcile-card p,.workflow-today-events p,.workflow-health-card p{font-size:14px;line-height:22px;color:${C.textSec};margin:0}
.workflow-date-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.workflow-date-nav>button:not(.secondary-btn){width:38px;height:38px;border:1px solid ${C.border};border-radius:6px;background:#fff;color:${C.text};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-family:${K9_FONT_STACK};font-weight:900;transition:transform .18s ease,box-shadow .18s ease}
.workflow-date-nav>button:not(.secondary-btn):hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.08)}
.workflow-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
.workflow-health-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;border:1px solid rgba(148,163,184,.24);background:${C.surfaceHover};border-radius:8px;padding:14px;margin-bottom:14px}
.workflow-health-card strong{display:block;font-size:18px;line-height:24px;font-weight:850}
.workflow-health-facts{display:flex;flex-direction:column;gap:4px;font-size:11px;line-height:16px;font-weight:700;color:${C.textMut};white-space:nowrap}
.workflow-table-card{border:1px solid rgba(148,163,184,.24);border-radius:8px;overflow:hidden;background:#fff}
.workflow-table-wrap{overflow:auto}
.workflow-table-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid ${C.borderLight};background:#fff}
.workflow-table-toolbar p{font-size:12px;line-height:18px;color:${C.textSec};margin:2px 0 0;max-width:780px}
.workflow-table-controls{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;min-width:280px}
.workflow-filter-pills{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.workflow-filter-pills button{border:1px solid ${C.border};background:#fff;color:${C.textSec};border-radius:999px;padding:6px 9px;font:850 11px/14px ${K9_FONT_STACK};cursor:pointer;white-space:nowrap}
.workflow-filter-pills button.active{background:${C.pri};border-color:${C.pri};color:#fff;box-shadow:0 8px 18px rgba(20,83,45,.14)}
.workflow-filter-pills button span{font-variant-numeric:tabular-nums;opacity:.78}
.workflow-sort-select{display:flex;align-items:center;gap:6px;color:${C.textMut};font:850 11px/14px ${K9_FONT_STACK};text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.workflow-sort-select select{height:32px;border:1px solid ${C.border};border-radius:6px;background:#fff;color:${C.text};font:800 12px/16px ${K9_FONT_STACK};padding:0 26px 0 9px}
.workflow-table{width:100%;border-collapse:collapse;font-size:13px}
.workflow-table th{background:${C.surfaceHover};border-bottom:1px solid ${C.border};text-align:left;padding:11px 14px;font-size:11px;line-height:16px;font-weight:850;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em}
.workflow-table td{padding:13px 14px;border-bottom:1px solid ${C.borderLight};vertical-align:middle;color:${C.textSec}}
.workflow-table tr{transition:background .2s ease}
.workflow-table tr.complete{background:${C.sucLt}}
.workflow-table tr.review{background:${C.warnLt}}
.workflow-dog-cell{display:flex;align-items:flex-start;gap:10px;min-width:220px}
.workflow-dog-avatar{width:40px;height:40px;border-radius:999px;object-fit:cover;flex-shrink:0}
.workflow-dog-avatar.fallback{display:inline-flex;align-items:center;justify-content:center;background:#DCFCE7;color:#374151;font-size:16px;line-height:1;font-weight:900}
.workflow-dog-name-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.workflow-dog-cell strong{display:block;font-size:15px;line-height:20px;font-weight:900;color:${C.text}}
.workflow-dog-cell span,.workflow-dog-cell small,.workflow-table td:last-child small{display:block;font-size:11px;line-height:16px;color:${C.textMut};margin-top:2px}
.workflow-reservation-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}
.workflow-reservation-kind{display:inline-flex!important;align-items:center;width:max-content;border-radius:999px;padding:3px 7px;font:900 9px/12px ${K9_FONT_STACK};letter-spacing:.02em;text-transform:uppercase;margin:0!important;border:1px solid rgba(148,163,184,.28);background:#fff;color:${C.textMut}}
.workflow-reservation-kind.boarding{background:#EEF2FF;color:#3730A3;border-color:#C7D2FE}
.workflow-reservation-kind.daycare{background:#ECFDF5;color:#166534;border-color:#BBF7D0}
.workflow-reservation-kind.day_boarding{background:#EFF6FF;color:#1D4ED8;border-color:#BFDBFE}
.workflow-reservation-kind.evaluation{background:#FEFCE8;color:#854D0E;border-color:#FEF08A}
.workflow-reservation-window{display:inline-flex!important;align-items:center;width:max-content;margin:0!important;color:${C.textSec}!important;font:800 11px/15px ${K9_FONT_STACK}!important;letter-spacing:0}
.workflow-service-line{font-weight:650}
.workflow-review-reason{max-width:560px;color:#92400E!important;font:850 11px/16px ${K9_FONT_STACK}!important;margin-top:6px!important}
.workflow-room-cell{display:grid;gap:2px;min-width:112px}
.workflow-room-cell strong{font-size:13px;line-height:18px;color:${C.text};font-weight:900}
.workflow-room-cell span{font-size:10px;line-height:13px;color:${C.textMut};font-weight:850;text-transform:uppercase;letter-spacing:.04em}
.workflow-timing-cell{display:grid;gap:4px;min-width:112px}
.workflow-timing-cell span{display:flex;align-items:center;justify-content:space-between;gap:8px;font:900 12px/15px ${K9_FONT_STACK};color:${C.text};font-variant-numeric:tabular-nums}
.workflow-timing-cell span strong{font-size:9px;line-height:12px;color:${C.textMut};text-transform:uppercase;letter-spacing:.04em}
.workflow-timing-cell small{font:800 10px/13px ${K9_FONT_STACK};color:${C.warn};white-space:nowrap}
.workflow-playgroup-badges{display:inline-flex!important;align-items:center;gap:4px;margin-top:0!important}
.workflow-playgroup-badge{display:inline-flex!important;align-items:center;justify-content:center;min-width:22px;height:18px;border-radius:999px;padding:0 6px;font:900 9px/18px ${K9_FONT_STACK};text-transform:uppercase;letter-spacing:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.42)}
.workflow-playgroup-legend{display:flex;align-items:center;justify-content:flex-end;gap:8px 10px;flex-wrap:wrap}
.workflow-playgroup-legend-item{display:inline-flex;align-items:center;gap:5px;font:850 10px/14px ${K9_FONT_STACK};color:${C.textMut};white-space:nowrap}
.workflow-playgroup-legend-item .workflow-playgroup-badge{height:17px;min-width:21px;font-size:8px;line-height:17px}
.workflow-status{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:10px;line-height:14px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;border:1px solid ${C.border};color:${C.pri};background:${C.priLt};white-space:nowrap}
.workflow-status.needs_review{color:${C.warn};background:${C.warnLt};border-color:rgba(217,119,6,.22)}
.workflow-check{width:32px;height:32px;border-radius:8px;border:2px solid ${C.border};background:#fff;color:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease}
.workflow-check:hover{transform:scale(1.06);border-color:${C.pri};box-shadow:0 0 0 3px rgba(20,83,45,.08)}
.workflow-check.complete{background:${C.suc};border-color:${C.suc};color:#fff}
.workflow-loading{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:${C.textMut};font-size:13px;font-weight:800}
.workflow-loading-orbit{width:40px;height:40px;border-radius:999px;border:3px solid ${C.border};border-top-color:${C.pri};animation:enrichmentOrbit .9s linear infinite}
.workflow-side{display:flex;flex-direction:column;gap:16px;position:sticky;top:12px}
.workflow-side>div{padding:16px}
.workflow-today-events{display:flex;flex-direction:column;gap:10px}
.workflow-today-events article{border:1px solid;border-radius:8px;padding:12px;animation:enrichmentFloatIn .28s ease both}
.workflow-today-events article strong{display:block;font-size:14px;line-height:20px;font-weight:850}
.workflow-today-events article span{display:block;font-size:12px;line-height:18px;color:${C.textSec};margin-top:5px}
.workflow-reconcile-card strong{display:block;font-size:22px;line-height:28px;font-weight:850;color:${C.text};margin-bottom:6px}
.enrichment-health-modal{position:fixed;inset:0;z-index:500;background:rgba(0,10,26,.72);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:24px}
.enrichment-health-shell{width:min(980px,100%);max-height:calc(100vh - 48px);overflow:auto;border-radius:18px;background:linear-gradient(180deg,rgba(7,27,51,.98),rgba(2,15,32,.98));border:1px solid rgba(255,255,255,.12);box-shadow:0 28px 80px rgba(0,0,0,.45);animation:enrichmentPanelIn .18s ease-out both}
.enrichment-health-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:24px 26px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
.enrichment-health-head h2{font-size:24px;line-height:30px;font-weight:900;color:#fff;margin:0}
.enrichment-health-head p{margin:4px 0 0;font-size:13px;line-height:19px;color:rgba(255,255,255,.5)}
.enrichment-health-head button{width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:rgba(255,255,255,.8);cursor:pointer;font:900 20px/1 ${K9_FONT_STACK}}
.enrichment-health-body{padding:26px;display:grid;gap:14px}
.enrichment-health-section{padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);display:grid;gap:14px}
.enrichment-health-section-title{display:flex;align-items:center;gap:10px}
.enrichment-health-section-title span{width:10px;height:10px;border-radius:99px}
.enrichment-health-section-title strong{font-size:17px;line-height:22px;font-weight:900;color:#fff}
.enrichment-health-fact-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.enrichment-health-fact{min-width:0;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06);padding:9px 10px}
.enrichment-health-fact span{display:block;font-size:9px;line-height:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.35)}
.enrichment-health-fact strong{display:block;margin-top:3px;font-size:13px;line-height:18px;font-weight:900;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.enrichment-health-refresh{justify-self:start;border:1px solid rgba(132,204,22,.42);background:rgba(132,204,22,.14);color:#84CC16;border-radius:10px;padding:11px 14px;font:900 13px/18px ${K9_FONT_STACK};display:inline-flex;align-items:center;gap:8px;cursor:pointer}
.enrichment-health-refresh:disabled{opacity:.65;cursor:wait}
.enrichment-audit-list{display:grid;gap:8px;max-height:320px;overflow:auto}
.enrichment-audit-list>p{font-size:12px;line-height:18px;color:rgba(255,255,255,.42);margin:0}
.enrichment-audit-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.8fr);gap:12px;align-items:start;padding:10px 11px;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06)}
.enrichment-audit-row strong{display:block;font-size:13px;line-height:18px;font-weight:900;color:#fff}
.enrichment-audit-row span,.enrichment-audit-row small{display:block;margin-top:3px;font-size:11px;line-height:15px;color:rgba(255,255,255,.48)}
.enrichment-audit-row small{color:#FCA5A5}
.enrichment-audit-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
@media(max-width:1100px){.page-header,.enrichment-daily-surface,.main-grid,.sop-grid,.builder-grid,.handoff-grid,.workflow-grid{grid-template-columns:1fr;display:grid}.sop-card.span-two{grid-column:auto}.sop-admin-card{align-items:flex-start;flex-direction:column}.sop-section-list,.graphic-upload-grid{grid-template-columns:1fr}.detail-panel,.handoff-controls,.workflow-side{position:static}.workflow-stat-grid{grid-template-columns:repeat(2,1fr)}.workflow-health-card{grid-template-columns:1fr}.workflow-command-head,.daily-module-head{flex-direction:column}.workflow-date-nav{justify-content:flex-start}.workflow-mini-status{grid-template-columns:1fr}.workflow-table-toolbar{align-items:flex-start;flex-direction:column}.workflow-playgroup-legend{justify-content:flex-start}.queue-main{align-items:flex-start;flex-direction:column;min-height:auto}.daily-run-completion strong{font-size:38px;line-height:40px}.daily-module-foot{align-items:flex-start;justify-content:flex-start}}
`;

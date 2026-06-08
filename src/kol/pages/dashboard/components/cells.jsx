import React, { memo } from "react";
import { C } from "../../../../shared/theme";
import { I } from "../../../../shared/icons";
import { LinkIcon } from "./LinkIcon";
import { AnimatedNumber } from "./AnimatedNumber";
import { TrendBadge } from "./TrendBadge";

/* ═══════════════════════════════════════════════════════════════════════════
   Grid Cell Components
   ═══════════════════════════════════════════════════════════════════════════ */

/* CanceledCell — animated transition from "Going Home" to "Canceled" for multi-day views */
export const CanceledCell = memo(function CanceledCell({ value, onClick, animKey }) {
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
export const MetricCell = memo(function MetricCell({ label, value, sub, color, trend, onClick, hero, skeleton, live }) {
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
export const ChecklistCell = memo(function ChecklistCell({ label, progress, count, onClick }) {
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
export const ServiceCell = memo(function ServiceCell({ label, done, total, onClick }) {
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
export const QuickLinkCell = memo(function QuickLinkCell({ label, icon, onClick }) {
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
export const InventoryCell = memo(function InventoryCell({ done, total, overdue, daysOverdue, phase, needsOrder, ordered, skipped, countingDoneDate, orderingDoneDate, daysUntilNext, onClick }) {
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

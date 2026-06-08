import React, { useState } from "react";
import { C } from "../constants/colors";
import { I } from "../icons";
import { Tip } from "./ui";
import { VACCINES, DEF_REQUIRED_VACCINES } from "../constants/vaccines";
import { getVaxStatus } from "../lib/vaccines";
import { gid } from "../lib/format";

// ─── Itemized Receipt ───────────────────────────────────────────────────────
function FeedMedBreakdown({ detail, label }) {
  if (!detail || detail.length === 0) return null;
  const hasNoon = detail.some(d => d.noon);
  const shortDate = (d) => { const dt = new Date(d + "T12:00:00"); return dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }); };
  const cell = (active, skipped) => (
    <span style={{ fontSize: 10, fontWeight: 700, color: active ? C.suc : C.textMut, textAlign: "center" }}>
      {active ? "\u2713" : "\u2717"}
    </span>
  );
  return (
    <div style={{ margin: "4px 0 2px", padding: "6px 8px", borderRadius: 8, background: C.bg, border: `1px solid ${C.borderLight}` }}>
      <div style={{ display: "grid", gridTemplateColumns: hasNoon ? "48px 1fr 1fr 1fr" : "48px 1fr 1fr", gap: 0, fontSize: 10 }}>
        <span style={{ fontWeight: 700, color: C.textMut, padding: "2px 4px" }}>Date</span>
        <span style={{ fontWeight: 700, color: C.textMut, padding: "2px 4px", textAlign: "center" }}>AM</span>
        {hasNoon && <span style={{ fontWeight: 700, color: C.textMut, padding: "2px 4px", textAlign: "center" }}>Noon</span>}
        <span style={{ fontWeight: 700, color: C.textMut, padding: "2px 4px", textAlign: "center" }}>PM</span>
        {detail.map((row, i) => (
          <React.Fragment key={i}>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.text, padding: "2px 4px", borderTop: `1px solid ${C.borderLight}` }}>{shortDate(row.date)}</span>
            <span style={{ textAlign: "center", padding: "2px 4px", borderTop: `1px solid ${C.borderLight}` }}>{cell(row.am)}</span>
            {hasNoon && <span style={{ textAlign: "center", padding: "2px 4px", borderTop: `1px solid ${C.borderLight}` }}>{cell(row.noon)}</span>}
            <span style={{ textAlign: "center", padding: "2px 4px", borderTop: `1px solid ${C.borderLight}` }}>{cell(row.pm)}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ItemizedReceipt({ pricingResult }) {
  if (!pricingResult || pricingResult.lineItems.length === 0) return null;
  const pr = pricingResult;
  const fmt = (v) => `$${Math.abs(v).toFixed(2)}`;
  const [expandedLines, setExpandedLines] = useState({});
  const toggleLine = (i) => setExpandedLines(prev => ({ ...prev, [i]: !prev[i] }));
  return (
    <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 14, overflow: "hidden", background: C.surface }}>
      <div style={{ padding: "14px 20px", background: `linear-gradient(135deg, ${C.priLt}, ${C.surface})`, borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.pri, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Pricing Breakdown
        </div>
      </div>
      <div style={{ padding: "12px 20px" }}>
        {pr.lineItems.map((line, i) => {
          const hasDetail = line.feedDetail || line.medDetail;
          const expanded = expandedLines[i];
          return (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: (!hasDetail || !expanded) && i < pr.lineItems.length - 1 ? `1px solid ${C.borderLight}` : "none", cursor: hasDetail ? "pointer" : "default" }} onClick={() => hasDetail && toggleLine(i)}>
                <span style={{ fontSize: 13, color: line.isDiscount ? C.suc : line.isAddon ? C.textSec : C.text, fontWeight: line.isDiscount ? 600 : 500, fontStyle: line.isAddon ? "italic" : "normal", display: "flex", alignItems: "center", gap: 4 }}>
                  {line.isDiscount && "↓ "}{line.label}
                  {hasDetail && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" style={{ transition: "transform 0.15s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9"/></svg>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: line.isDiscount ? C.suc : C.text, whiteSpace: "nowrap" }}>
                  {line.total < 0 ? `−${fmt(line.total)}` : fmt(line.total)}
                </span>
              </div>
              {hasDetail && expanded && (
                <div style={{ paddingBottom: 6, borderBottom: i < pr.lineItems.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                  <FeedMedBreakdown detail={line.feedDetail || line.medDetail} label={line.feedDetail ? "Feeding" : "Medication"} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "14px 20px", background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
        {pr.discountTotal > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: C.suc, fontWeight: 600 }}>Discount</span>
            <span style={{ fontSize: 12, color: C.suc, fontWeight: 700 }}>−{fmt(pr.discountTotal)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: pr.deposit > 0 ? 8 : 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{fmt(pr.total)}</span>
        </div>
        {pr.deposit > 0 && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: C.accLt, border: `1px solid ${C.acc}30` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.acc }}>Deposit Due ({pr.depositPercent}%{!pr.depositRefundable ? " non-refundable" : ""})</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.acc }}>{fmt(pr.deposit)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Balance due at {pr.payAt === "checkout" ? "checkout" : "check-in"}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textSec }}>{fmt(pr.balance)}</span>
            </div>
          </div>
        )}
        {pr.deposit === 0 && pr.total > 0 && (
          <div style={{ fontSize: 12, color: C.textSec, fontWeight: 600, marginTop: 4 }}>
            {pr.payAt === "checkout" ? "Payment due at checkout" : pr.payAt === "free" ? "No charge" : "Payment due at booking"}
          </div>
        )}
        {pr.total === 0 && (
          <div style={{ fontSize: 12, color: C.suc, fontWeight: 600, marginTop: 4 }}>No charge</div>
        )}
      </div>
    </div>
  );
}

// ─── Vaccine Status Icon (always visible) ──────────────────────────────────
function VaxIcon({ dog, requiredVaccines, policies, size = 16 }) {
  const vs = getVaxStatus(dog, requiredVaccines, policies);
  const rv = requiredVaccines || DEF_REQUIRED_VACCINES;
  const pol = policies || {};
  const graceDays = pol.vaccineGraceDays ?? 7;
  const warningDays = pol.vaccineWarningDays ?? 30;
  const ok = vs.ok && vs.graceperiod.length === 0;
  const now = new Date();
  const lines = rv.map(vId => {
    const vax = VACCINES.find(v => v.id === vId);
    const name = vax ? vax.name : vId;
    const val = dog.fields[vId];
    if (!val) return `${name}: Never input`;
    const d = new Date(val + "T00:00:00");
    const diffDays = (d - now) / 86400000;
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (diffDays < 0 && graceDays > 0 && Math.abs(diffDays) <= graceDays) return `${name}: Grace period — expired ${dateStr}`;
    if (diffDays < 0) return `${name}: Expired ${dateStr}`;
    if (diffDays < warningDays) return `${name}: Expiring soon — ${dateStr}`;
    return `${name}: Valid until ${dateStr}`;
  });
  const statusLabel = ok ? "✓ All vaccines current" : vs.graceperiod.length > 0 && vs.expired.length === 0 && vs.missing.length === 0 ? "⚡ Grace period" : "⚠ Vaccines need attention";
  const title = statusLabel + "\n" + lines.join("\n");
  // Color logic: green=ok, amber=grace-period-only, yellow=expiring-soon-only, red=expired/missing
  const color = ok ? C.suc : vs.expired.length > 0 || vs.missing.length > 0 ? C.dan : vs.graceperiod.length > 0 ? C.acc : C.warn;
  return (
    <Tip text={title}>
      <span style={{ display: "inline-flex", color, flexShrink: 0, cursor: "default" }}>
        {ok ? <I.VaxOk /> : <I.VaxBad />}
      </span>
    </Tip>
  );
}

function DogAvatar({ dog, size = 32 }) {
  const name = dog?.fields?.name || "?";
  const pic = dog?.profilePic;
  if (pic) return <img src={pic} alt={name} style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: "cover", flexShrink: 0 }} />;
  const iconSz = Math.round(size * 0.45);
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG HELPER
// ═══════════════════════════════════════════════════════════════════════════
function buildAuditEntry(reservationId, action, details, profile) {
  const name = profile ? (profile.full_name || profile.email || "Staff") : "System";
  return {
    id: gid(),
    reservationId,
    timestamp: new Date().toISOString(),
    userName: name,
    changedBy: name,
    action,
    details: details || [],
  };
}

export { FeedMedBreakdown, ItemizedReceipt, VaxIcon, DogAvatar, buildAuditEntry };

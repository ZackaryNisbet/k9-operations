import React from "react";
import { C } from "../../../shared/theme";

export function SectionCard({ title, subtitle, icon, children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 16 }}>
        {icon && <span style={{ color: C.pri, display: "flex" }}>{icon}</span>}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h3>
      </div>
      {subtitle && <p style={{ fontSize: 12, color: C.textMut, margin: "0 0 16px 0" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

export function MetricPill({ label, value, sub, warn }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 56 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: warn ? C.dan : C.text, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>{label}</span>
      {sub !== undefined && <span style={{ fontSize: 10, color: warn ? C.dan : C.textMut }}>{sub}</span>}
    </div>
  );
}

export function StatusChip({ status }) {
  const map = {
    ok: { bg: C.sucLt, color: C.suc, label: "Covered" },
    short: { bg: C.danLt, color: C.dan, label: "Short" },
    borderline: { bg: C.warnLt, color: C.warn, label: "Borderline" },
    no_plan: { bg: "#F1F5F9", color: C.textMut, label: "No Plan" },
    draft: { bg: C.warnLt, color: C.warn, label: "Draft" },
  };
  const s = map[status] || map.ok;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>;
}

export function TrustBadge({ state, blocked }) {
  const effective = blocked ? "blocked" : state;
  const map = {
    trusted: { bg: C.sucLt, color: C.suc, label: "Ready" },
    estimated: { bg: C.warnLt, color: C.warn, label: "Projected" },
    missing: { bg: "#FEE2E2", color: "#991B1B", label: "Missing" },
    blocked: { bg: "#FEE2E2", color: "#991B1B", label: "Blocked" },
  };
  const chip = map[effective] || map.missing;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: chip.bg, color: chip.color }}>
      {chip.label}
    </span>
  );
}

const CAPACITY_STYLE = {
  over: { bg: C.danLt, border: "#FCA5A5", text: C.dan, label: "At cap" },
  near: { bg: C.warnLt, border: "#FCD34D", text: C.warn, label: "Near cap" },
  ok: { bg: C.sucLt, border: "#86EFAC", text: C.suc, label: "Open" },
  unset: { bg: "#F8FAFC", border: C.border, text: C.textMut, label: "No cap" },
};

export function CapacityPill({ indicator, compact = false }) {
  const style = CAPACITY_STYLE[indicator?.status] || CAPACITY_STYLE.unset;
  return (
    <span
      title={`${indicator.label}: ${indicator.text}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "3px 6px" : "5px 8px",
        borderRadius: 8,
        border: `1px solid ${style.border}`,
        background: style.bg,
        color: style.text,
        fontSize: compact ? 9 : 10,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {!compact && <span>{indicator.label}</span>}
      <span>{indicator.text}</span>
    </span>
  );
}

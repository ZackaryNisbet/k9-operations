// Extracted booking-form fields, rendered as distinct labeled cells instead of
// run-together "Label: value" text. Shared by the CRM table (compact) and the
// row expander (full) — and previewable in isolation.
import React from "react";
import { C } from "../../shared/theme";
import { buildFormFieldEntries } from "../crmData";

export const LONG_FIELD = 48; // values longer than this get their own full-width row

export function orderedFormEntries(lead) {
  // Short, scannable fields first; long "details"-style notes last.
  return [...buildFormFieldEntries(lead)].sort(
    (a, b) => (a.value.length > LONG_FIELD ? 1 : 0) - (b.value.length > LONG_FIELD ? 1 : 0)
  );
}

function FieldCell({ label, value, href, full }) {
  return (
    <div style={{ flex: full ? "1 1 100%" : "0 1 auto", minWidth: 0, maxWidth: "100%", background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px" }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45, wordBreak: "break-word" }}>
        {href ? <a href={href} onClick={(e) => e.stopPropagation()} style={{ color: C.pri, textDecoration: "none", fontWeight: 600 }}>{value}</a> : value}
      </div>
    </div>
  );
}

export function FormFields({ lead, compact = false }) {
  const all = orderedFormEntries(lead);
  if (!all.length) return <span style={{ fontSize: 12.5, color: C.textMut }}>{compact ? "—" : "No form fields captured."}</span>;
  const shown = compact ? all.filter((e) => e.value.length <= LONG_FIELD).slice(0, 4) : all;
  const extra = all.length - shown.length;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
      {shown.map((e) => (
        <FieldCell key={e.key} label={e.label} value={e.value} href={e.key === "email" ? `mailto:${e.value}` : undefined} full={!compact && e.value.length > LONG_FIELD} />
      ))}
      {compact && extra > 0 ? <span style={{ alignSelf: "center", fontSize: 11, fontWeight: 700, color: C.pri }}>+{extra} more</span> : null}
    </div>
  );
}

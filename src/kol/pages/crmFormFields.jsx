// Extracted booking-form fields, rendered as a clean definition grid (label above
// value) for the expanded row detail. Distinct + scannable, no heavy chrome.
// In the table the column is a "Booking form details" toggle button; the fields
// live here, in the expanded area where there's room.
import React from "react";
import { C } from "../../shared/theme";
import { buildFormFieldEntries } from "../crmData";

export const LONG_FIELD = 48; // values longer than this span the full width

export function orderedFormEntries(lead) {
  // Short, scannable fields first; long "details"-style notes last.
  return [...buildFormFieldEntries(lead)].sort(
    (a, b) => (a.value.length > LONG_FIELD ? 1 : 0) - (b.value.length > LONG_FIELD ? 1 : 0)
  );
}

export function FormFields({ lead }) {
  const all = orderedFormEntries(lead);
  if (!all.length) return <span style={{ fontSize: 12.5, color: C.textMut }}>No form fields captured.</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px 20px" }}>
      {all.map((e) => {
        const long = e.value.length > LONG_FIELD;
        return (
          <div key={e.key} style={{ gridColumn: long ? "1 / -1" : "auto", minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 2 }}>{e.label}</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45, wordBreak: "break-word" }}>
              {e.key === "email"
                ? <a href={`mailto:${e.value}`} onClick={(ev) => ev.stopPropagation()} style={{ color: C.pri, textDecoration: "none", fontWeight: 600 }}>{e.value}</a>
                : e.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

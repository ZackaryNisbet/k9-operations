// One canonical, ordered field list per category (see canonicalFormFields in
// crmData), rendered as a clean definition grid (label above value). Every
// expanded record shows the SAME fields in the SAME order; synonym keys are
// already normalized upstream; long free-text fields span the full width; a
// field the record didn't capture shows a muted "—" rather than disappearing.
import React from "react";
import { C } from "../../shared/theme";
import { canonicalFormFields } from "../crmData";

const LABEL_STYLE = { fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 2 };

export function FormFields({ lead }) {
  const fields = canonicalFormFields(lead);
  if (!fields.length) return <span style={{ fontSize: 12.5, color: C.textMut }}>No form fields captured.</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px 20px" }}>
      {fields.map((f) => (
        <div key={f.key} style={{ gridColumn: f.long ? "1 / -1" : "auto", minWidth: 0 }}>
          <div style={LABEL_STYLE}>{f.label}</div>
          <div style={{ fontSize: 13, color: f.value ? C.text : C.textMut, lineHeight: 1.45, wordBreak: "break-word" }}>
            {f.value
              ? (f.key === "email"
                  ? <a href={`mailto:${f.value}`} onClick={(ev) => ev.stopPropagation()} style={{ color: C.pri, textDecoration: "none", fontWeight: 600 }}>{f.value}</a>
                  : f.value)
              : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

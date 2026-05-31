// Canonical fields grouped into Contact → Location → Request (see groupedFormFields
// in crmData) and rendered with a deliberate visual hierarchy so anyone can read a
// submission in a couple of seconds without training:
//   • Contact — how to reach them (email / phone are tap targets).
//   • Location — de-emphasized address (muted, smaller).
//   • Request — what they actually want: service + dates bolded, and the customer's
//     message shown as a callout. Always the same sections in the same order, so
//     every record looks identical; fields the record didn't capture show "—".
import React from "react";
import { C } from "../../shared/theme";
import { groupedFormFields } from "../crmData";

const GROUP_HEADER = { fontSize: 11.5, fontWeight: 700, color: C.textSec, letterSpacing: "0.01em", marginBottom: 9 };
const LABEL = { fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 3 };

function ScalarValue({ f, groupId }) {
  if (!f.value) return <span style={{ fontSize: 13, color: C.textMut }}>—</span>;
  if (f.key === "email") {
    return <a href={`mailto:${f.value}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 13, color: C.pri, textDecoration: "none", fontWeight: 600, wordBreak: "break-word" }}>{f.value}</a>;
  }
  if (f.key === "phone") {
    const digits = String(f.value).replace(/[^\d+]/g, "");
    return <a href={`tel:${digits}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 13.5, color: C.pri, textDecoration: "none", fontWeight: 700, whiteSpace: "nowrap" }}>{f.value}</a>;
  }
  if (groupId === "location") return <span style={{ fontSize: 12.5, color: C.textSec }}>{f.value}</span>;
  if (f.emphasis) return <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{f.value}</span>;
  return <span style={{ fontSize: 13, color: C.text }}>{f.value}</span>;
}

function FieldCell({ f, groupId }) {
  if (f.long) {
    return (
      <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
        <div style={LABEL}>{f.label}</div>
        {f.value ? (
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, padding: "9px 12px", background: C.surfaceHover, borderLeft: `3px solid ${C.pri}`, borderRadius: 7, wordBreak: "break-word" }}>{f.value}</div>
        ) : (
          <span style={{ fontSize: 13, color: C.textMut }}>—</span>
        )}
      </div>
    );
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={LABEL}>{f.label}</div>
      <div style={{ lineHeight: 1.4 }}><ScalarValue f={f} groupId={groupId} /></div>
    </div>
  );
}

export function FormFields({ lead }) {
  const groups = groupedFormFields(lead);
  if (!groups.length) return <span style={{ fontSize: 12.5, color: C.textMut }}>No form fields captured.</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {groups.map((g) => (
        <div key={g.id}>
          <div style={GROUP_HEADER}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "11px 18px" }}>
            {g.fields.map((f) => <FieldCell key={f.key} f={f} groupId={g.id} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

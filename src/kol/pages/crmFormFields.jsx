// Canonical fields grouped into Contact → Location → Request (see groupedFormFields
// in crmData) and rendered flat-by-default, the K9 way: calm, scannable, no
// decoration. Groups are set apart by a hairline and the values' own weight —
// contact reads as green tap-targets, the address recedes in muted grey, the
// request lands in bold with the customer's message as plain prose. One schema per
// category keeps every record identical; uncaptured fields show "—".
import React from "react";
import { C } from "../../shared/theme";
import { groupedFormFields } from "../crmData";

const LABEL = { fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 4 };
const LINK = { color: C.pri, textDecoration: "none", fontWeight: 600 };

function ScalarValue({ f, groupId }) {
  if (!f.value) return <span style={{ fontSize: 14, color: C.textMut }}>—</span>;
  if (f.key === "email") {
    return <a href={`mailto:${f.value}`} onClick={(e) => e.stopPropagation()} style={{ ...LINK, fontSize: 14, wordBreak: "break-word" }}>{f.value}</a>;
  }
  if (f.key === "phone") {
    const digits = String(f.value).replace(/[^\d+]/g, "");
    return <a href={`tel:${digits}`} onClick={(e) => e.stopPropagation()} style={{ ...LINK, fontSize: 14, whiteSpace: "nowrap" }}>{f.value}</a>;
  }
  if (groupId === "location") return <span style={{ fontSize: 13.5, color: C.textMut }}>{f.value}</span>;
  if (f.emphasis) return <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{f.value}</span>;
  return <span style={{ fontSize: 14, color: C.text }}>{f.value}</span>;
}

function FieldCell({ f, groupId }) {
  if (f.long) {
    return (
      <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
        <div style={LABEL}>{f.label}</div>
        {f.value
          ? <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55, maxWidth: "70ch", wordBreak: "break-word" }}>{f.value}</div>
          : <span style={{ fontSize: 14, color: C.textMut }}>—</span>}
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
  if (!groups.length) return <span style={{ fontSize: 13, color: C.textMut }}>No form fields captured.</span>;
  return (
    <div>
      {groups.map((g, i) => (
        <div key={g.id} style={i > 0 ? { marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` } : undefined}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "13px 20px" }}>
            {g.fields.map((f) => <FieldCell key={f.key} f={f} groupId={g.id} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

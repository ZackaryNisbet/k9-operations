import React from "react";
import { C } from "../../../../shared/theme";

export function SectionHeading({ title, detail, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>{title}</h3>
        {detail && <div style={{ marginTop: 3, color: C.textMut, fontSize: 13 }}>{detail}</div>}
      </div>
      {action}
    </div>
  );
}

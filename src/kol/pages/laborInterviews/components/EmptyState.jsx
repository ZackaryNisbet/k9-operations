import React from "react";
import { C } from "../../../../shared/theme";

export function EmptyState({ title, body }) {
  return (
    <div style={{ padding: 38, border: `1.5px dashed ${C.border}`, borderRadius: 12, background: C.surfaceHover, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</div>
      <div style={{ fontSize: 13, color: C.textMut, marginTop: 6, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

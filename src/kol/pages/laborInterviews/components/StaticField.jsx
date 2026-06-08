import React from "react";
import { C } from "../../../../shared/theme";

export function StaticField({ label, value }) {
  const isLink = /^https?:\/\//i.test(String(value || ""));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, color: C.text, fontWeight: 700, minHeight: 20, overflowWrap: "anywhere" }}>
        {isLink ? <a href={value} target="_blank" rel="noreferrer" style={{ color: C.pri, textDecoration: "none" }}>{value}</a> : (value || "-")}
      </div>
    </div>
  );
}

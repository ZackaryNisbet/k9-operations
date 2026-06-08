import React from "react";
import { C } from "../../../shared/theme";

/* ═══════════════════════════════════════════════════════════════════════════
   Trend badge
   ═══════════════════════════════════════════════════════════════════════════ */
export function TrendBadge({ value, invert = false }) {
  if (value == null || !isFinite(value) || value === 0) return null;
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? C.suc : C.dan;
  const bg = positive ? C.sucLt : C.danLt;
  const arrow = value > 0 ? "↑" : "↓";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color, background: bg, padding: "2px 7px", borderRadius: 6 }}>
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

import React from "react";
import { C } from "../../../shared/theme";
import { normalizeGrassrootsStatus, getGrassrootsStatusLabel } from "../../grassrootsData";

export function StatusBadge({ status }) {
  const colors = {
    identified: C.info,
    corresponding: "#7C3AED",
    booked: C.suc,
    abandoned: C.dan,
  };
  const normalizedStatus = normalizeGrassrootsStatus(status);
  const color = colors[normalizedStatus] || C.textMut;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 10, background: `${color}12`, color, border: `1px solid ${color}30`, fontSize: 11, fontWeight: 900 }}>
      {getGrassrootsStatusLabel(normalizedStatus)}
    </span>
  );
}

export function BusinessCategoryBadge({ value }) {
  const label = value || "Uncategorized";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", width: "fit-content", padding: "4px 10px", borderRadius: 10, background: value ? C.priLt : C.bg, color: value ? C.pri : C.textMut, border: `1px solid ${value ? `${C.pri}30` : C.borderLight}`, fontSize: 11, fontWeight: 900 }}>
      {label}
    </span>
  );
}

export function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

// K9 Operations — DailyOps shared checkbox control.
// Extracted verbatim from DailyOpsPage.jsx (pure presentational, no page state).
import React from "react";
import { C } from "../../../shared/theme";

export const K9Check = ({ checked, disabled, onChange, color = C.pri, size = 18 }) => (
  <div onClick={disabled ? undefined : () => onChange({ target: { checked: !checked } })}
    style={{
      width: size, height: size, borderRadius: 5, cursor: disabled ? "default" : "pointer",
      border: `2px solid ${checked ? color : C.border}`,
      background: checked ? color : "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s ease", opacity: disabled ? 0.5 : 1,
      boxShadow: checked ? `0 0 0 2px ${color}25` : "none",
      flexShrink: 0,
    }}>
    {checked && <svg width={size - 6} height={size - 6} viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </div>
);

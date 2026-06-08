import React from "react";
import { C } from "../../../../shared/theme";

export function IconButton({ label, onClick, disabled, children, variant = "default", style = {} }) {
  const colors = {
    default: { bg: "#fff", color: C.textSec, border: C.border },
    primary: { bg: C.pri, color: "#fff", border: C.pri },
    danger: { bg: C.danLt, color: C.dan, border: "#fecaca" },
  };
  const tone = colors[variant] || colors.default;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.48 : 1,
        fontWeight: 900,
        fontSize: 15,
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

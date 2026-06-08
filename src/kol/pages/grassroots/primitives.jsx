import React from "react";
import { C } from "../../../shared/theme";

export const INPUT_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: `1.5px solid ${C.border}`,
  background: "#fff",
  color: C.text,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};

export function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

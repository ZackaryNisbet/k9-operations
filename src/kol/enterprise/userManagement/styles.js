import { C } from "../../../shared/theme";

export const INPUT = {
  width: "100%",
  height: 41,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: C.surface,
  color: C.text,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const BUTTON = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  height: 41,
  padding: "0 13px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const PILL_BUTTON = {
  ...BUTTON,
  height: 34,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
};

export function primaryButton(disabled = false) {
  return {
    ...BUTTON,
    background: C.pri,
    borderColor: C.pri,
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

export function pillButton(active, disabled = false) {
  return {
    ...PILL_BUTTON,
    background: active ? C.priLt : C.surface,
    borderColor: active ? C.pri : C.border,
    color: active ? C.pri : C.textSec,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

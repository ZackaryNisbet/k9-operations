// Shared inline-style constants for the Marketing Directory page
// (src/kol/pages/MarketingDirectoryPage.jsx).
import { C } from "../../../shared/theme";

export const MUTED = { color: C.textMut, fontSize: 11 };

export const LABEL_STYLE = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: C.textSec,
  marginBottom: 4,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

export const INLINE_INPUT = {
  flex: 1,
  minWidth: 0,
  width: "100%",
  padding: "7px 10px",
  border: `1.5px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  color: C.text,
  background: C.surface,
  outline: "none",
  boxSizing: "border-box",
};

export const ICON_BTN_SM = {
  border: `1px solid ${C.border}`,
  background: C.surface,
  borderRadius: 8,
  cursor: "pointer",
  color: C.textMut,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  padding: 0,
  flexShrink: 0,
};

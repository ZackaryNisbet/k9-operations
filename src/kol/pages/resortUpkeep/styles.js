import { C } from "../../../shared/theme";

export const SmallPillStyle = { borderRadius: 999, padding: "4px 8px", background: C.borderLight, color: C.textMut, fontSize: 11, fontWeight: 900 };

export const panel = {
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  background: "#fff",
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

export const eyebrow = {
  fontSize: 11,
  fontWeight: 950,
  color: C.pri,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

export const workspaceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: 16,
  alignItems: "start",
};

export const leftRail = {
  display: "grid",
  gap: 10,
  alignContent: "start",
  minWidth: 0,
};

export const detailPanel = {
  ...panel,
  minHeight: 460,
  minWidth: 0,
};

export const subPanel = {
  ...panel,
  padding: 12,
};

export const sectionLabel = {
  fontSize: 11,
  fontWeight: 950,
  color: C.textMut,
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

export const cardButton = {
  appearance: "none",
  width: "100%",
  textAlign: "left",
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  background: "#fff",
  color: C.text,
  padding: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

export const rowButton = {
  ...cardButton,
  borderRadius: 12,
  padding: 13,
};

export const selectedRowButton = {
  ...rowButton,
  borderColor: C.pri,
  background: "#F8FAFC",
  boxShadow: "inset 3px 0 0 #14532D",
};

export const compactRowButton = {
  ...cardButton,
  padding: 10,
  borderRadius: 10,
};

export const selectedCompactRowButton = {
  ...compactRowButton,
  borderColor: C.pri,
  background: "#F8FAFC",
};

export const maintenanceItem = {
  border: `1px solid ${C.border}`,
  background: "#fff",
  borderRadius: 12,
  padding: 12,
};

export const checkedMaintenanceItem = {
  ...maintenanceItem,
  borderColor: "#BBF7D0",
  background: "#F0FDF4",
};

export const articleCard = {
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 13,
  background: "#fff",
};

export const primaryBtn = {
  appearance: "none",
  border: 0,
  borderRadius: 10,
  background: C.pri,
  color: "#fff",
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

export const secondaryBtn = {
  appearance: "none",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  background: "#fff",
  color: C.text,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

export const chipButton = {
  ...secondaryBtn,
  borderRadius: 999,
  padding: "6px 9px",
  background: C.surfaceHover,
};

export const dangerBtn = { ...primaryBtn, background: C.dan };
export const checkRow = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, fontWeight: 800 };
export const inlineLinkButton = {
  appearance: "none",
  border: 0,
  background: "transparent",
  color: "inherit",
  fontWeight: 950,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
  fontFamily: "inherit",
};

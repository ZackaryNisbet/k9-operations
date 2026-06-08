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

export const muOverlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", zIndex: 1000, overflowY: "auto" };
export const muCard = { background: "#fff", borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,0.28)" };
export const muHead = { padding: "16px 20px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 };
export const muBody = { padding: "16px 20px", overflowY: "auto" };
export const muFoot = { padding: "12px 20px", borderTop: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 12 };
export const muProgressTrack = { marginTop: 10, height: 6, borderRadius: 999, background: C.borderLight, overflow: "hidden" };
export const muSmallBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text, padding: "5px 10px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" };
export const muSmallPrimary = { border: 0, borderRadius: 8, background: C.pri, color: "#fff", padding: "5px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
export const muItem = { display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff" };
export const muItemDone = { ...muItem, borderColor: "#BBF7D0", background: "#F0FDF4" };
export const muToggle = { width: 26, height: 26, flexShrink: 0, borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", color: "transparent", cursor: "pointer", fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" };
export const muToggleOn = { ...muToggle, border: `1.5px solid ${C.suc}`, background: C.suc, color: "#fff" };
export const impTh = { textAlign: "left", padding: "7px 9px", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.textMut, whiteSpace: "nowrap" };
export const impTd = { padding: "4px 6px", color: C.text, verticalAlign: "middle" };
export const impCellInput = { width: "100%", minWidth: 70, boxSizing: "border-box", border: `1px solid ${C.borderLight}`, borderRadius: 6, background: "transparent", padding: "4px 6px", fontSize: 11.5, fontFamily: "inherit", color: C.text };
export const impCellFocus = (e) => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.background = "#fff"; };
export const impCellBlur = (e) => { e.currentTarget.style.borderColor = C.borderLight; e.currentTarget.style.background = "transparent"; };

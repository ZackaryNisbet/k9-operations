/* ═══════════════════════════════════════════════════════════════════════════
   Tiny helpers
   ═══════════════════════════════════════════════════════════════════════════ */
export const fmt$ = (v) => typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
export const fmt$k = (v) => "$" + fmt$(v);
export const fmtMoney = (n) => "$" + Math.round(n).toLocaleString();
export const fmtDateLabel = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

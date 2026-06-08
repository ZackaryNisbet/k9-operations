// K9 Operations — shared operations helpers (extracted from OperationsHub)
// Self-contained pure helpers. See AGENTS.md for development contract.

// Format timestamp for display
export const fmtCompletionTime = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h > 12 ? h - 12 : h || 12;
  return `${hr}:${m} ${ampm}`;
};

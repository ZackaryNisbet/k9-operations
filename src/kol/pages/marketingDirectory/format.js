// Date/time formatting helpers for the Marketing Directory page
// (src/kol/pages/MarketingDirectoryPage.jsx).

export function fmtDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// Stamp like the tracker's update rows: "May 31, 2026 · 9:50 PM".
export function fmtUpdateStamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  return `${fmtDate(value)} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

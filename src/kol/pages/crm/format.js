// Date/time formatting helpers for the CRM page (src/kol/pages/CrmPage.jsx).

export function fmtDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

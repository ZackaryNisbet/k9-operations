// Pure formatting and number helpers extracted from InventoryPage.jsx.

export function fmtWeekLabel(weekStart) {
  const dt = new Date(weekStart + "T12:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtCurrency(val) {
  if (val == null || val === "") return "$0.00";
  const n = parseFloat(val) || 0;
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function clampPositive(val) {
  if (val === "" || val == null) return "";
  const s = String(val).replace(/[^0-9]/g, ""); // digits only
  if (s === "") return "";
  return String(parseInt(s, 10)); // strips leading zeros: "02" → "2"
}

export function catalogSortPayload(items) {
  return (items || []).map((item) => ({
    id: item.id,
    category: item.category || "",
    subcategory: item.subcategory || "",
    sort_order: item.sort_order,
  }));
}

export function normalizeCatalogNumber(value, integer = false) {
  if (value === "" || value == null) return null;
  const parsed = integer ? parseInt(value, 10) : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const fmtAuditTime = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${day} ${time}`;
};

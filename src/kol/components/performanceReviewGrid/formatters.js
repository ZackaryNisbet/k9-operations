export const defaultFormatter = (value) => value || "-";
export const identity = (value) => value;

export function formatCellDate(value, formatDate = defaultFormatter) {
  const text = String(value || "").trim();
  return text ? formatDate(text.slice(0, 10)) : "-";
}

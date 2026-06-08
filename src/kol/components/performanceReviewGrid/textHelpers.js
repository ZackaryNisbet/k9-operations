export function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDateText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.includes("T") ? text.split("T")[0] : text;
}

import { fmtDateFull } from "../../../shared/theme";

export function formatTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateOnly(value) {
  return value ? fmtDateFull(value) : "—";
}

export function normalizeAttendancePositionTitle(value = "") {
  const title = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!title) return "";
  if (/^(gm|general manager)$/.test(title)) return "general manager";
  if (/^(am|agm|assistant manager|assistant general manager)$/.test(title)) return "assistant manager";
  if (/^(csr|customer service representative|front desk|guest service representative)$/.test(title)) return "customer service representative";
  if (/^(pct|pet care technician|pet care tech|technician|kennel technician)$/.test(title)) return "pet care technician";
  if (/^(supervisor|shift supervisor|shift lead|lead)$/.test(title)) return "supervisor";
  return title;
}

export function formatAttendancePositionTitle(value = "") {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  const normalized = normalizeAttendancePositionTitle(raw);
  if (normalized === "general manager") return "General Manager";
  if (normalized === "assistant manager") return "Assistant Manager";
  if (normalized === "supervisor") return "Supervisor";
  if (normalized === "customer service representative") return "Customer Service Representative";
  if (normalized === "pet care technician") return "Pet Care Technician";
  return raw;
}

export function compareAttendanceSortValues(left, right) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export function attendanceMarkNeedsValue(op) {
  return !["today"].includes(op);
}

export function parseAttendanceDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.includes("T") ? raw.split("T")[0] : raw;
}

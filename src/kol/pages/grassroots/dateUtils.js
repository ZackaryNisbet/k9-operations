export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const base = new Date(`${dateStr}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function fmtDate(value) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtMonthYear(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return "This Month";
  return new Date(`${value}-01T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Rich event-date display (date + weekday + time, multi-day aware) ──────────
export function fmtEventDayLine(dateStr) {
  if (!dateStr) return "—";
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function fmtWeekdayLong(dateStr) {
  if (!dateStr) return "";
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}
export function fmtWeekdayShort(dateStr) {
  if (!dateStr) return "";
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}
export function fmtClock(hhmm) {
  if (!hhmm) return "";
  const [h, m] = String(hhmm).split(":");
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export function fmtClockRange(start, end) {
  const s = fmtClock(start);
  const e = fmtClock(end);
  if (s && e) return `${s}–${e}`;
  return s || e || "";
}
export function fmtEventDateRange(startStr, endStr) {
  if (!startStr) return "—";
  const sameYear = String(startStr).slice(0, 4) === String(endStr).slice(0, 4);
  const start = new Date(`${startStr}T12:00:00`).toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  const end = new Date(`${endStr}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}

export function fmtDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function parseNumberField(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function fmtCurrencyNumber(value) {
  if (value === "" || value == null) return "";
  const num = Number(value);
  return Number.isNaN(num) ? "" : num.toFixed(2);
}

// Pure date + grid helpers for the aggregated calendar.
//
// Intentionally free of React, DOM, and theme imports so the whole module is
// safe to unit-test under the `node` test environment. All dates are handled as
// `YYYY-MM-DD` string keys; they sort lexicographically, which keeps the range
// math simple (`key >= startKey`). Date objects are only used internally and are
// anchored at noon to dodge DST/timezone drift, matching the codebase's addDays.

export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Default horizon for the agenda (the default view): a forward 2-week window —
// long enough to give procurement/scheduling lead time, short enough to scan.
export const AGENDA_DAYS = 14;

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(v) {
  return typeof v === "string" && KEY_RE.test(v);
}

// monthIndex is 0-based (0 = January) to mirror JS Date semantics.
export function makeKey(year, monthIndex, day) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseKey(key) {
  if (!isDateKey(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, monthIndex: m - 1, day: d };
}

function asDate(key) {
  return new Date(key + "T12:00:00");
}

export function addDaysKey(key, n) {
  const dt = asDate(key);
  dt.setDate(dt.getDate() + n);
  return makeKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function diffDaysKey(fromKey, toKey) {
  return Math.round((asDate(toKey).getTime() - asDate(fromKey).getTime()) / 86400000);
}

// 0 = Sunday … 6 = Saturday
export function weekdayOf(key) {
  return asDate(key).getDay();
}

export function startOfWeekKey(key, weekStartsOn = 0) {
  const diff = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDaysKey(key, -diff);
}

export function getWeekDays(key, weekStartsOn = 0) {
  const start = startOfWeekKey(key, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

export function addMonths(year, monthIndex, delta) {
  const total = year * 12 + monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

// Returns an array of weeks (each a 7-element array) of day cells:
//   { key, day, monthIndex, inMonth }
// The grid always begins on `weekStartsOn` and spans whole weeks (5 or 6 rows).
export function getMonthMatrix(year, monthIndex, weekStartsOn = 0) {
  const gridStart = startOfWeekKey(makeKey(year, monthIndex, 1), weekStartsOn);
  const next = addMonths(year, monthIndex, 1);
  const lastOfMonth = addDaysKey(makeKey(next.year, next.monthIndex, 1), -1);
  const gridEnd = addDaysKey(startOfWeekKey(lastOfMonth, weekStartsOn), 6);
  const totalDays = diffDaysKey(gridStart, gridEnd) + 1;

  const weeks = [];
  for (let w = 0; w * 7 < totalDays; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const key = addDaysKey(gridStart, w * 7 + d);
      const p = parseKey(key);
      row.push({ key, day: p.day, monthIndex: p.monthIndex, inMonth: p.monthIndex === monthIndex });
    }
    weeks.push(row);
  }
  return weeks;
}

export function monthWindow(year, monthIndex, weekStartsOn = 0) {
  const weeks = getMonthMatrix(year, monthIndex, weekStartsOn);
  return { startKey: weeks[0][0].key, endKey: weeks[weeks.length - 1][6].key };
}

export function weekWindow(key, weekStartsOn = 0) {
  const days = getWeekDays(key, weekStartsOn);
  return { startKey: days[0], endKey: days[6] };
}

export function agendaWindow(anchorKey, days = 42) {
  return { startKey: anchorKey, endKey: addDaysKey(anchorKey, Math.max(1, days) - 1) };
}

// The visible/fetch window for a given view + cursor. Shared by the page (to scope
// its reads) and the component (to lay out the body), so they never drift apart.
export function viewWindow(view, cursorKey, todayKey, weekStartsOn = 0) {
  const anchor = isDateKey(cursorKey) ? cursorKey : todayKey;
  if (view === "week") return weekWindow(anchor, weekStartsOn);
  if (view === "agenda") return agendaWindow(anchor, AGENDA_DAYS);
  const p = parseKey(anchor) || parseKey(todayKey);
  return monthWindow(p.year, p.monthIndex, weekStartsOn);
}

export function isWithin(key, startKey, endKey) {
  return isDateKey(key) && key >= startKey && key <= endKey;
}

export function compareEvents(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time || "";
  const tb = b.time || "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

export function groupByDay(events) {
  const map = new Map();
  for (const ev of events) {
    if (!ev || !isDateKey(ev.date)) continue;
    if (!map.has(ev.date)) map.set(ev.date, []);
    map.get(ev.date).push(ev);
  }
  for (const list of map.values()) list.sort(compareEvents);
  return map;
}

export function filterByActiveSources(events, activeSources) {
  if (!activeSources) return events.slice();
  const set = activeSources instanceof Set ? activeSources : new Set(activeSources);
  return events.filter((ev) => set.has(ev.source));
}

export function countBySource(events) {
  const counts = {};
  for (const ev of events) counts[ev.source] = (counts[ev.source] || 0) + 1;
  return counts;
}

export function monthLabel(year, monthIndex) {
  return `${MONTHS_LONG[monthIndex]} ${year}`;
}

// Human range label, collapsing shared month/year ends ("May 3 – 9, 2026").
export function rangeLabel(startKey, endKey) {
  const a = parseKey(startKey);
  const b = parseKey(endKey);
  if (!a || !b) return "";
  if (a.year === b.year && a.monthIndex === b.monthIndex) {
    return `${MONTHS_SHORT[a.monthIndex]} ${a.day} – ${b.day}, ${a.year}`;
  }
  if (a.year === b.year) {
    return `${MONTHS_SHORT[a.monthIndex]} ${a.day} – ${MONTHS_SHORT[b.monthIndex]} ${b.day}, ${a.year}`;
  }
  return `${MONTHS_SHORT[a.monthIndex]} ${a.day}, ${a.year} – ${MONTHS_SHORT[b.monthIndex]} ${b.day}, ${b.year}`;
}

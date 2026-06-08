import { isWeekendDate } from "./rotationStudioDates";

export const ROLE_CONFIG = [
  { key: "pct", label: "PCT", short: "PCT", position: "pct" },
  { key: "supervisor", label: "Supervisor", short: "SUP", position: "supervisor" },
  { key: "csr", label: "CSR", short: "CSR", position: "csr" },
  { key: "manager", label: "MOD", short: "MOD", position: "mod" },
];

export const SHIFT_CONFIG = [
  { key: "opening", label: "Opening", short: "AM" },
  { key: "closing", label: "Closing", short: "PM" },
];

export function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(24, Math.round(number))) : 0;
}

export function getShiftWindows(day, config = {}) {
  const weekend = Boolean(day?.isWeekend ?? isWeekendDate(day?.date));
  const siteHours = weekend
    ? config.weekend_site_hours || ["07:00", "18:00"]
    : config.weekday_site_hours || ["06:00", "19:30"];
  return {
    opening: { start: siteHours[0] || (weekend ? "07:00" : "06:00"), end: "13:00" },
    closing: { start: "13:00", end: siteHours[1] || (weekend ? "18:00" : "19:30") },
  };
}

export function buildDefaultStaffingMatrix(day, rotation) {
  return {
    opening: {
      manager: 1,
      supervisor: 1,
      csr: 0,
      pct: 4,
    },
    closing: {
      manager: 1,
      supervisor: 1,
      csr: 0,
      pct: 4,
    },
  };
}

export function countShiftTotal(counts = {}) {
  return ROLE_CONFIG.reduce((sum, role) => sum + toCount(counts[role.key]), 0);
}

export function buildRowsForShift({ shiftKey, counts, day, config, previousRows = [] }) {
  const windows = getShiftWindows(day, config);
  const rows = [];
  for (const role of ROLE_CONFIG) {
    const count = toCount(counts?.[role.key]);
    const prior = previousRows.filter((row) => row.roleKey === role.key);
    for (let index = 0; index < count; index += 1) {
      const existing = prior[index] || {};
      rows.push({
        id: `${shiftKey}-${role.position}-${index + 1}`,
        shiftKey,
        roleKey: role.key,
        position: role.position,
        label: `${role.short} ${index + 1}`,
        name: existing.name || "",
        shift_start: existing.shift_start || windows[shiftKey].start,
        shift_end: existing.shift_end || windows[shiftKey].end,
      });
    }
  }
  return rows;
}

export function reconcileShiftDetails(current, matrix, day, config) {
  return Object.fromEntries(SHIFT_CONFIG.map((shift) => [
    shift.key,
    buildRowsForShift({
      shiftKey: shift.key,
      counts: matrix?.[shift.key] || {},
      day,
      config,
      previousRows: current?.[shift.key] || [],
    }),
  ]));
}

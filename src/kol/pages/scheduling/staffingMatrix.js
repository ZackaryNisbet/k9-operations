// K9 Operations — Staffing matrix → shift entry builders
// Pure helpers and constants extracted verbatim from SchedulingPage.jsx.

export function createDefaultShiftEntry(day, position = "pct") {
  const defaultStart = day?.isWeekend ? "07:00" : "06:00";
  const defaultEnd = "13:00";
  return {
    id: `${position}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    position,
    name: "",
    shift_start: defaultStart,
    shift_end: defaultEnd,
  };
}

export const STAFFING_MATRIX_ROLES = [
  { key: "manager", label: "Manager", position: "mod" },
  { key: "supervisor", label: "Supervisor", position: "supervisor" },
  { key: "csr", label: "CSR", position: "csr" },
  { key: "pct", label: "PCT", position: "pct" },
];

export const STAFFING_MATRIX_SHIFTS = [
  { key: "opening", label: "Opening" },
  { key: "closing", label: "Closing" },
];

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

export function buildShiftEntriesFromStaffingMatrix(day, matrix) {
  const openingStart = day?.isWeekend ? "07:00" : "06:00";
  const closingEnd = day?.isWeekend ? "18:00" : "19:30";
  const windows = {
    opening: { start: openingStart, end: "13:00" },
    closing: { start: "13:00", end: closingEnd },
  };
  const entries = [];
  for (const shift of STAFFING_MATRIX_SHIFTS) {
    for (const role of STAFFING_MATRIX_ROLES) {
      const count = Math.max(0, Math.round(Number(matrix?.[shift.key]?.[role.key]) || 0));
      for (let index = 0; index < count; index += 1) {
        entries.push({
          id: `${shift.key}-${role.position}-${index + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          position: role.position,
          name: "",
          shift_start: windows[shift.key].start,
          shift_end: windows[shift.key].end,
        });
      }
    }
  }
  return entries.length ? entries : [createDefaultShiftEntry(day)];
}

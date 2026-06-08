import { ATTENDANCE_INCIDENT_OPTIONS } from "../../attendanceData";

export const INCIDENT_COLOR_BY_VALUE = Object.fromEntries(
  ATTENDANCE_INCIDENT_OPTIONS.map((option) => [option.value, option.color]),
);
export const ATTENDANCE_MARK_FILTER_FIELDS = [
  { section: "Employee", key: "employee", label: "Employee", type: "custom_select", ops: ["is", "isNot"] },
  { section: "Mark Details", key: "type", label: "Mark Type", type: "select", ops: ["is", "isNot"], options: ATTENDANCE_INCIDENT_OPTIONS.map((option) => option.value) },
  { section: "Mark Details", key: "coverage", label: "Coverage", type: "select", ops: ["is", "isNot"], options: ["yes", "no"] },
  { section: "Timing", key: "shift_date", label: "Shift Date", type: "date", ops: ["today", "on", "after", "before", "inLastDays"] },
];
export const DEFAULT_ATTENDANCE_POSITION_ORDER = [
  "General Manager",
  "Assistant Manager",
  "Supervisor",
  "Customer Service Representative",
  "Pet Care Technician",
];
export const ATTENDANCE_DEFAULT_SORT = { key: "hierarchy", direction: "asc" };
export const ATTENDANCE_ROSTER_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "employee", label: "Employee" },
  { key: "status", label: "Status" },
  { key: "position", label: "Position" },
  { key: "start", label: "Start Date" },
  { key: "end", label: "End Date" },
  { key: "marks30", label: "30 Days" },
  { key: "last", label: "Last Mark" },
];

export const ATTENDANCE_SUMMARY_DEFAULT_SORT = { key: "totalAll", direction: "desc" };
// Thicker rule that brackets each mark-type group (its 30-day + all-time pair)
// in the Attendance Summary grid.
export const ATTENDANCE_SUMMARY_GROUP_DIVIDER = "2.5px solid #CBD5E1";

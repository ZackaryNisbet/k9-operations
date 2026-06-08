// K9 Operations — Scheduling date + range helpers
// Pure date math and formatting extracted verbatim from SchedulingPage.jsx.

import { addDays } from "../../../shared/theme";

export function formatMatrixDate(date) {
  const dt = new Date(`${date}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

export function formatMatrixHeaderDate(date) {
  const dt = new Date(`${date}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export function formatMatrixDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  if (startDate === endDate) return formatMatrixDate(startDate);
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  const startText = start.toLocaleDateString("en-US", sameMonth ? { month: "short", day: "numeric" } : { month: "short", day: "numeric" });
  const endText = end.toLocaleDateString("en-US", { month: sameMonth ? undefined : "short", day: "numeric" });
  return `${startText} - ${endText}`;
}

export function formatWeekRange(startDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function getMondayStart(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function getDayIndexFromMonday(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function getMonthStart(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getMonthEnd(dateStr) {
  const start = new Date(`${getMonthStart(dateStr)}T12:00:00`);
  start.setMonth(start.getMonth() + 1);
  start.setDate(0);
  return start.toISOString().slice(0, 10);
}

export function getYearStart(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return `${date.getFullYear()}-01-01`;
}

export function getYearEnd(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return `${date.getFullYear()}-12-31`;
}

export function shiftMonth(dateStr, delta) {
  const date = new Date(`${getMonthStart(dateStr)}T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return date.toISOString().slice(0, 10);
}

export function shiftYear(dateStr, delta) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setFullYear(date.getFullYear() + delta);
  return date.toISOString().slice(0, 10);
}

export function getDemandRange(mode, anchorDate, customStartDate, customEndDate) {
  if (mode === "month") {
    return { startDate: getMonthStart(anchorDate), endDate: getMonthEnd(anchorDate) };
  }
  if (mode === "year") {
    return { startDate: getYearStart(anchorDate), endDate: getYearEnd(anchorDate) };
  }
  if (mode === "custom") {
    const startDate = customStartDate || anchorDate;
    const endDate = customEndDate && customEndDate >= startDate ? customEndDate : startDate;
    return { startDate, endDate };
  }
  const startDate = getMondayStart(anchorDate);
  return { startDate, endDate: addDays(startDate, 6) };
}

export function shiftDemandAnchor(mode, anchorDate, delta) {
  if (mode === "month") return shiftMonth(anchorDate, delta);
  if (mode === "year") return shiftYear(anchorDate, delta);
  if (mode === "custom") return addDays(anchorDate, delta * 7);
  return addDays(anchorDate, delta * 7);
}

export function formatDemandRangeLabel(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function dateIndexInRange(startDate, endDate, dateStr) {
  if (!startDate || !dateStr || dateStr < startDate || dateStr > endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const date = new Date(`${dateStr}T12:00:00`);
  return Math.max(0, Math.round((date.getTime() - start.getTime()) / 86400000));
}

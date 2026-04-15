export const DEFAULT_INVENTORY_SCHEDULE = {
  cadenceDays: 7,
  dueWeekday: 1,
  dueTime: "09:00",
  anchorDate: null,
};

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function diffDays(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T12:00:00`);
  const to = new Date(`${toDateStr}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function getPreviousWeekday(dateStr, dueWeekday) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay();
  const diff = (day - dueWeekday + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split("T")[0];
}

export function normalizeInventorySchedule(value, referenceDate) {
  const cadenceDays = [7, 14, 28].includes(Number(value?.cadenceDays))
    ? Number(value.cadenceDays)
    : DEFAULT_INVENTORY_SCHEDULE.cadenceDays;
  const dueWeekday = Number.isFinite(Number(value?.dueWeekday))
    ? Math.min(6, Math.max(0, Number(value.dueWeekday)))
    : DEFAULT_INVENTORY_SCHEDULE.dueWeekday;
  const dueTime = /^\d{2}:\d{2}$/.test(String(value?.dueTime || ""))
    ? String(value.dueTime)
    : DEFAULT_INVENTORY_SCHEDULE.dueTime;
  const baseDate = referenceDate || new Date().toISOString().split("T")[0];
  const anchorDate = isValidDateKey(value?.anchorDate)
    ? String(value.anchorDate)
    : getPreviousWeekday(baseDate, dueWeekday);

  return { cadenceDays, dueWeekday, dueTime, anchorDate };
}

export function getInventoryCycleStart(dateStr, scheduleInput) {
  const schedule = normalizeInventorySchedule(scheduleInput, dateStr);
  const diff = diffDays(schedule.anchorDate, dateStr);
  const cycleOffset = Math.floor(diff / schedule.cadenceDays) * schedule.cadenceDays;
  return shiftDate(schedule.anchorDate, cycleOffset);
}

export function getInventoryCycleEnd(cycleStart, scheduleInput) {
  const schedule = normalizeInventorySchedule(scheduleInput, cycleStart);
  return shiftDate(cycleStart, schedule.cadenceDays - 1);
}

export function formatInventoryCadenceLabel(scheduleInput) {
  const schedule = normalizeInventorySchedule(scheduleInput);
  const weekdayLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][schedule.dueWeekday] || "Monday";
  const timeLabel = new Date(`2026-01-01T${schedule.dueTime}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const cadenceLabel = schedule.cadenceDays === 7
    ? "Weekly"
    : schedule.cadenceDays === 14
      ? "Biweekly"
      : "Every 4 weeks";
  return `${cadenceLabel} cadence · Due ${weekdayLabel}s at ${timeLabel}`;
}

export function getInventoryOverdueInfo(today, scheduleInput, isCompleted = false) {
  const cycleStart = getInventoryCycleStart(today, scheduleInput);
  const daysOverdue = Math.max(0, diffDays(cycleStart, today));
  const isDueToday = daysOverdue === 0;
  const isOverdue = !isCompleted && daysOverdue > 0;

  return {
    cycleStart,
    isDueToday,
    isOverdue,
    daysOverdue,
  };
}

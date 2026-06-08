export function isWeekendDate(date) {
  const parsed = new Date(`${date || ""}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && [0, 6].includes(parsed.getDay());
}

export function formatDayLabel(day) {
  if (!day?.date) return "Fresh schedule";
  const parsed = new Date(`${day.date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return day.date;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function parseScheduleDate(date) {
  const parsed = new Date(`${date || ""}T12:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function dateToIso(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addScheduleDays(date, offset) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return date;
  parsed.setDate(parsed.getDate() + offset);
  return dateToIso(parsed);
}

export function getScheduleMonthStart(date) {
  const parsed = parseScheduleDate(date) || new Date();
  parsed.setDate(1);
  return dateToIso(parsed);
}

export function shiftScheduleMonth(date, offset) {
  const parsed = parseScheduleDate(getScheduleMonthStart(date)) || new Date();
  parsed.setMonth(parsed.getMonth() + offset);
  parsed.setDate(1);
  return dateToIso(parsed);
}

export function getScheduleWeekStart(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return date;
  const day = parsed.getDay();
  parsed.setDate(parsed.getDate() + (day === 0 ? -6 : 1 - day));
  return dateToIso(parsed);
}

export function getScheduleCalendarDates(monthDate) {
  const start = getScheduleWeekStart(getScheduleMonthStart(monthDate));
  return Array.from({ length: 42 }, (_, index) => addScheduleDays(start, index));
}

export function getCalendarMonthLabel(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return "Calendar";
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function getFullScheduleDateLabel(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return "Select a date";
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getCompactScheduleDateLabel(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return date || "";
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function getRelativeScheduleDateLabel(date, today) {
  if (!date || !today) return "";
  const selected = parseScheduleDate(date);
  const current = parseScheduleDate(today);
  if (!selected || !current) return "";
  const diff = Math.round((selected.getTime() - current.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return selected.toLocaleDateString("en-US", { weekday: "short" });
}

export function getNextSaturday(today) {
  const parsed = parseScheduleDate(today);
  if (!parsed) return today;
  const day = parsed.getDay();
  const offset = ((6 - day + 7) % 7) || 7;
  return addScheduleDays(today, offset);
}

export function getDateScheduleState({ date, today, visibleDay, summary }) {
  if (summary?.published > 0) {
    return {
      tone: "published",
      label: "Published",
      detail: `${summary.published} published schedule${summary.published === 1 ? "" : "s"}${summary.draft ? `, ${summary.draft} draft${summary.draft === 1 ? "" : "s"}` : ""}`,
    };
  }
  if (summary?.draft > 0) {
    return {
      tone: "draft",
      label: "Draft",
      detail: `${summary.draft} draft version${summary.draft === 1 ? "" : "s"} ready to review`,
    };
  }
  if (visibleDay?.staffPlan) {
    return {
      tone: "staffed",
      label: "Staffed",
      detail: "Actual staffing has been saved for this day",
    };
  }
  if (visibleDay?.canGenerate) {
    return {
      tone: "ready",
      label: "Ready",
      detail: "Demand matrix is ready for schedule generation",
    };
  }
  if (visibleDay?.hasNoData || visibleDay?.matrixTrustState === "missing") {
    return {
      tone: "missing",
      label: date < today ? "No matrix" : "Pending",
      detail: date < today ? "No computed Demand Matrix row for this historical day" : "Demand Matrix compute has not returned for this day yet",
    };
  }
  return {
    tone: date < today ? "past" : "open",
    label: date < today ? "No submission" : "Open",
    detail: date < today ? "No saved rotation schedule found for this day" : "Future rotation schedule can be started here",
  };
}

export function formatTimeLabel(time) {
  const [hourRaw, minute = "00"] = String(time || "00:00").split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute} ${suffix}`;
}

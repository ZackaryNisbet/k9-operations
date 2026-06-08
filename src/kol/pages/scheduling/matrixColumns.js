// K9 Operations — Demand matrix column builders
// Pure column-layout helpers extracted verbatim from SchedulingPage.jsx.

import { addDays } from "../../../shared/theme";
import { MATRIX_PAGE_SIZE, getDayColumnLabel } from "../schedulingDemandMatrixModel";
import { formatMatrixDateRange, formatMatrixHeaderDate, getMondayStart } from "./schedulingDates";

export function buildMonthWeekSegments(days, rangeStart, rangeEnd) {
  const sortedDays = [...(days || [])]
    .filter((day) => day?.date && (!rangeStart || day.date >= rangeStart) && (!rangeEnd || day.date <= rangeEnd))
    .sort((a, b) => a.date.localeCompare(b.date));
  const segments = new Map();
  sortedDays.forEach((day) => {
    const rawWeekStart = getMondayStart(day.date);
    const rawWeekEnd = addDays(rawWeekStart, 6);
    const startDate = rangeStart && rawWeekStart < rangeStart ? rangeStart : rawWeekStart;
    const endDate = rangeEnd && rawWeekEnd > rangeEnd ? rangeEnd : rawWeekEnd;
    const id = `${startDate}:${endDate}`;
    if (!segments.has(id)) {
      segments.set(id, {
        id,
        startDate,
        endDate,
        days: [],
      });
    }
    segments.get(id).days.push(day);
  });

  return [...segments.values()].map((segment, index) => ({
    ...segment,
    label: `Week ${index + 1}`,
    dateLabel: formatMatrixDateRange(segment.startDate, segment.endDate),
  }));
}

function dayToMatrixColumn(day, absoluteIndex, extra = {}) {
  return {
    type: "day",
    id: `day:${day.date}`,
    key: `day:${day.date}`,
    day,
    days: [day],
    absoluteIndex,
    label: day.dayName || getDayColumnLabel(day.date),
    dateLabel: formatMatrixHeaderDate(day.date),
    ...extra,
  };
}

export function buildMatrixColumns({
  days,
  rangeMode,
  rangeStart,
  rangeEnd,
  expandedMonthSegments = new Set(),
  page = 0,
  pageSize = MATRIX_PAGE_SIZE,
}) {
  const indexedDays = (days || []).map((day, index) => ({ day, index }));
  if (rangeMode === "month") {
    const indexByDate = new Map(indexedDays.map(({ day, index }) => [day.date, index]));
    const segments = buildMonthWeekSegments(indexedDays.map(({ day }) => day), rangeStart, rangeEnd);
    const columns = segments.flatMap((segment) => {
      const aggregateColumn = {
        type: "segment",
        id: segment.id,
        key: `segment:${segment.id}`,
        segment,
        days: segment.days,
        absoluteIndex: indexByDate.get(segment.days[0]?.date) ?? 0,
        label: segment.label,
        dateLabel: segment.dateLabel,
      };
      if (!expandedMonthSegments.has(segment.id)) return [aggregateColumn];
      return [
        aggregateColumn,
        ...segment.days.map((day) => dayToMatrixColumn(day, indexByDate.get(day.date) ?? 0, {
          parentSegmentId: segment.id,
          compact: true,
        })),
      ];
    });
    return {
      columns,
      visibleDays: indexedDays.map(({ day }) => day),
      pageCount: 1,
      segments,
    };
  }

  const start = page * pageSize;
  const pageDays = indexedDays.slice(start, start + pageSize);
  return {
    columns: pageDays.map(({ day, index }) => dayToMatrixColumn(day, index)),
    visibleDays: pageDays.map(({ day }) => day),
    pageCount: Math.max(1, Math.ceil(indexedDays.length / pageSize)),
    segments: [],
  };
}

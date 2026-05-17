import { DAY_NAMES_SHORT, todayStr } from "../../shared/theme";
import {
  getMatrixDisplay,
  getMatrixProjectedDisplay,
  getMatrixProjection,
  getMatrixComparison,
  getMatrixTrust,
} from "../../shared/schedulingEngine";

export const MATRIX_PAGE_SIZE = 14;
export const DEMAND_MATRIX_EXPORT_MODE = "actual_current";

export const MATRIX_GROUP_TEMPLATES = [
  {
    section: "Gingr Source Counts",
    hideRowsWhenCollapsed: true,
    rows: [
      { key: "source.check_ins", label: "Gingr Check-Ins", source: true },
      { key: "source.check_outs", label: "Gingr Check-Outs", source: true },
      { key: "source.overnight", label: "Gingr Overnight", source: true },
      { key: "source.boarding_opening", label: "Boarding Dogs Opening", total: true, source: true },
      { key: "source.boarding_closing", label: "Boarding Dogs Closing", total: true, source: true },
      { key: "source.daytime_total", label: "Gingr Daytime Dogs", total: true, source: true },
      { key: "source.total", label: "Gingr Total Volume", total: true, source: true },
    ],
  },
  {
    section: "Historical",
    rows: [
      { key: "comparison.yoy_overnight", label: "YOY Overnight", comparison: true },
      { key: "comparison.yoy_daytime", label: "YOY Daytime", comparison: true },
      { key: "comparison.yoy_total", label: "YOY Total", total: true, comparison: true },
      { key: "comparison.yoy_total_pct_vs_current_year", label: "YOY Total % vs Current Year", comparison: true, format: "percent" },
    ],
  },
  {
    section: "Opening Boarding",
    rows: [
      { key: "opening.large_boarding", label: "Large Boarding Opening" },
      { key: "opening.small_boarding", label: "Small Boarding Opening" },
      { key: "opening.private_play_boarding", label: "Private Play Boarding Opening" },
      { key: "opening.half_and_half_boarding", label: "Half and Half Boarding Opening", optional: true },
      { key: "opening.evaluation_boarding", label: "Evaluation Boarding Opening", optional: true },
      { key: "opening.unclassified_boarding", label: "Unresolved Boarding Opening", optional: true },
      { key: "opening.total_boarding", label: "Total Boarding Dogs Opening", total: true },
    ],
  },
  {
    section: "Closing Boarding",
    rows: [
      { key: "closing.large_boarding", label: "Large Boarding Closing" },
      { key: "closing.small_boarding", label: "Small Boarding Closing" },
      { key: "closing.private_play_boarding", label: "Private Play Boarding Closing" },
      { key: "closing.half_and_half_boarding", label: "Half and Half Boarding Closing", optional: true },
      { key: "closing.evaluation_boarding", label: "Evaluation Boarding Closing", optional: true },
      { key: "closing.unclassified_boarding", label: "Unresolved Boarding Closing", optional: true },
      { key: "closing.total_boarding", label: "Total Boarding Dogs Closing", total: true },
    ],
  },
  {
    section: "Daytime Volume",
    rows: [
      { key: "daycare.evaluations", label: "Evaluations" },
      { key: "daycare.private_play_dayboarding", label: "Private Play Dayboarding" },
      { key: "daycare.half_and_half_daytime", label: "Half and Half Daytime Dogs", optional: true },
      { key: "daycare.large_daycare", label: "Large Daycare" },
      { key: "daycare.small_daycare", label: "Small Daycare" },
      { key: "daycare.unclassified_daycare", label: "Unresolved Daytime Dogs", optional: true },
      { key: "daycare.total_daycare", label: "Total Daycare Dogs", total: true },
    ],
  },
  {
    section: "Support Workload",
    rows: [
      { key: "support.departure_baths", label: "Departure Baths", alwaysVisible: true },
      { key: "support.total_dog_volume", label: "Total Dog Volume", total: true },
      { key: "play_yard.large_play_dogs", label: "Large Play Demand", alwaysVisible: true },
      { key: "play_yard.small_play_dogs", label: "Small Play Demand", alwaysVisible: true },
      { key: "play_yard.private_play_dogs", label: "Private Play Demand", alwaysVisible: true },
      { key: "play_yard.split_play_dogs", label: "Split Play Demand", optional: true, alwaysVisible: true },
      { key: "support.tours", label: "Tours" },
    ],
  },
];

export const SCHEDULING_NARRATIVE_ROWS = [
  { key: "opening.total_boarding", label: "Total opening boarding dogs" },
  { key: "support.departure_baths", label: "Total departure baths" },
  { key: "closing.total_boarding", label: "Total closing boarding dogs" },
  { key: "daycare.total_daycare", label: "Total daycare dogs" },
];

export function getNestedValue(obj, key) {
  return key.split(".").reduce((acc, part) => acc?.[part], obj);
}

export function getDayCurrentDisplay(day) {
  return day?.currentDisplay || getMatrixDisplay(day?.matrix || day || {});
}

export function getDayProjectedDisplay(day) {
  return day?.projectedDisplay || getMatrixProjectedDisplay(day?.matrix || day || {});
}

export function getDayProjection(day) {
  return day?.projection || getMatrixProjection(day?.matrix || day || {});
}

export function getDayComparison(day) {
  return day?.comparison || getMatrixComparison(day?.matrix || day || {});
}

export function getDayMatrixValue(day, row, mode = "current") {
  if (row.comparison) {
    return getNestedValue({ comparison: getDayComparison(day) }, row.key);
  }

  const source = (row.source || mode === "current") ? getDayCurrentDisplay(day) : getDayProjectedDisplay(day);
  return getNestedValue(source, row.key);
}

function hasAnyNonZeroValue(days, key) {
  return days.some((day) => {
    const value = key.startsWith("comparison.")
      ? getNestedValue({ comparison: getDayComparison(day) }, key)
      : (
        getNestedValue(getDayCurrentDisplay(day), key)
        ?? getNestedValue(getDayProjectedDisplay(day), key)
      );
    return value !== null && value !== undefined && Number(value) !== 0;
  });
}

export function buildDemandMatrixRowGroups(days) {
  return MATRIX_GROUP_TEMPLATES.map((group) => ({
    ...group,
    rows: group.rows.filter((row) => !row.optional || hasAnyNonZeroValue(days || [], row.key)),
  }));
}

const DEMAND_MATRIX_EXPORT_EXCLUDED_SECTIONS = new Set(["Gingr Source Counts", "Historical"]);

export function buildDemandMatrixExportRowGroups(days) {
  return buildDemandMatrixRowGroups(days).filter((group) => !DEMAND_MATRIX_EXPORT_EXCLUDED_SECTIONS.has(group.section));
}

export function formatDemandMatrixValue(value, format) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (format === "percent") return `${numeric.toFixed(Number.isInteger(numeric) ? 0 : 1)}%`;
  return Math.round(numeric);
}

export function getFiniteMatrixValues(days, row, mode) {
  return days
    .map((day) => getDayMatrixValue(day, row, mode))
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

export function sumMatrixValues(days, row, mode) {
  const values = getFiniteMatrixValues(days, row, mode);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function totalHistoricalPct(days) {
  const currentValues = days
    .map((day) => Number(getDayComparison(day)?.current_total))
    .filter((value) => Number.isFinite(value));
  const lastYearValues = days
    .map((day) => Number(getDayComparison(day)?.yoy_total))
    .filter((value) => Number.isFinite(value));
  const currentTotal = currentValues.reduce((sum, value) => sum + value, 0);
  const lastYearTotal = lastYearValues.reduce((sum, value) => sum + value, 0);
  if (currentTotal <= 0 || !lastYearValues.length) return null;
  return Number(((lastYearTotal / currentTotal) * 100).toFixed(1));
}

export function summarizeAggregateMatrixCell(days, row, mode = "current") {
  if (row.format === "percent") {
    const value = totalHistoricalPct(days || []);
    return {
      value,
      hasValue: value !== null && value !== undefined,
      unavailableLabel: "No history",
      unavailableTitle: "No canonical prior-year total is available for this aggregate.",
    };
  }

  const value = sumMatrixValues(days || [], row, mode);
  const isComparison = Boolean(row.comparison);
  return {
    value,
    hasValue: value !== null && value !== undefined,
    unavailableLabel: isComparison ? "No history" : "No data",
    unavailableTitle: isComparison
      ? "No canonical year-over-year source count is available for this aggregate."
      : "No canonical source count is available for this aggregate.",
  };
}

export function buildHistoricalRangeSummary(days) {
  const currentOvernight = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.current_overnight) || 0), 0);
  const currentDaytime = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.current_daytime) || 0), 0);
  const currentTotal = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.current_total) || 0), 0);
  const yoyOvernight = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.yoy_overnight) || 0), 0);
  const yoyDaytime = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.yoy_daytime) || 0), 0);
  const yoyTotal = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.yoy_total) || 0), 0);
  return {
    currentOvernight,
    currentDaytime,
    currentTotal,
    yoyOvernight,
    yoyDaytime,
    yoyTotal,
    yoyTotalPctVsCurrentYear: currentTotal > 0 ? Number(((yoyTotal / currentTotal) * 100).toFixed(1)) : null,
  };
}

export function getDayColumnLabel(date) {
  const dt = new Date(`${date}T12:00:00`);
  return DAY_NAMES_SHORT[dt.getDay()] || dt.toLocaleDateString("en-US", { weekday: "short" });
}

function formatNarrativeDate(date) {
  const dt = new Date(`${date}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function formatNarrativeDay(date, fallbackDayName) {
  if (date) {
    const dt = new Date(`${date}T12:00:00`);
    return dt.toLocaleDateString("en-US", { weekday: "long" });
  }

  const map = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday",
  };
  return map[fallbackDayName] || fallbackDayName || "Day";
}

function formatNarrativeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return String(Math.round(numeric));
}

function getSchedulingNarrativeDay(day) {
  const heading = `${formatNarrativeDay(day?.date, day?.dayName)}, ${formatNarrativeDate(day?.date || todayStr())}`;
  const items = SCHEDULING_NARRATIVE_ROWS.map((row) => {
    const currentValue = getDayMatrixValue(day, row, "current");
    const projectedValue = getDayMatrixValue(day, row, "projected");
    return `${row.label}: ${formatNarrativeNumber(currentValue)} current → ${formatNarrativeNumber(projectedValue ?? currentValue)} projected`;
  });
  return { heading, items };
}

export function buildSchedulingNarrative(days) {
  return (days || [])
    .map((day) => {
      const { heading, items } = getSchedulingNarrativeDay(day);
      return [heading, ...items.map((item) => `• ${item}`)].join("\n");
    })
    .join("\n\n");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildSchedulingNarrativeHtml(days) {
  return (days || [])
    .map((day) => {
      const { heading, items } = getSchedulingNarrativeDay(day);
      return [
        '<div style="margin:0 0 24px 0;">',
        `<p style="margin:0 0 8px 0;"><strong>${escapeHtml(heading)}</strong></p>`,
        '<ul style="margin:0 0 0 22px; padding:0;">',
        ...items.map((item) => `<li style="margin:0 0 4px 0;">${escapeHtml(item)}</li>`),
        "</ul>",
        "</div>",
      ].join("");
    })
    .join("");
}

function isFutureStale(day, today) {
  if (!day?.date || day.date < today) return false;
  const asOfDate = String(getDayProjection(day)?.as_of_date || day?.matrix?.detail_json?.projection?.as_of_date || "").slice(0, 10);
  return Boolean(asOfDate && asOfDate < today);
}

function getTrust(day) {
  return day?.trust || getMatrixTrust(day?.matrix || day || null);
}

function summarizeDates(dates, limit = 8) {
  if (!dates.length) return "";
  const shown = dates.slice(0, limit).join(", ");
  return dates.length > limit ? `${shown}, +${dates.length - limit} more` : shown;
}

export function buildDemandMatrixRangeReadiness({
  days,
  expectedDates,
  loading = false,
  error = null,
  today = todayStr(),
} = {}) {
  const orderedExpectedDates = [...(expectedDates || [])].filter(Boolean).sort();
  const daysByDate = new Map((days || []).filter((day) => day?.date).map((day) => [day.date, day]));
  const expectedDayCount = orderedExpectedDates.length;
  const computedMatrixRowCount = orderedExpectedDates.filter((date) => {
    const day = daysByDate.get(date);
    return Boolean(day?.hasLiveMatrix);
  }).length;

  const missingDays = orderedExpectedDates.filter((date) => {
    const day = daysByDate.get(date);
    return !day || !day.hasLiveMatrix || day.matrixTrustState === "missing" || day.hasNoData;
  });

  const knownLimitationRows = orderedExpectedDates.flatMap((date) => {
    const day = daysByDate.get(date);
    if (!day) return [];
    const trust = getTrust(day);
    const limitationDetails = Array.isArray(trust.limitation_details) ? trust.limitation_details : [];
    const limitations = Array.isArray(trust.limitations) ? trust.limitations : [];
    return [
      ...limitationDetails.map((detail) => ({ date, label: detail.label || detail.kind || "Known demand limitation", detail })),
      ...limitations.map((label) => ({ date, label: String(label), detail: null })),
    ];
  });

  const blockingReasons = [];
  if (missingDays.length) blockingReasons.push(`${missingDays.length} missing day${missingDays.length === 1 ? "" : "s"} (${summarizeDates(missingDays)})`);

  if (error) {
    return {
      status: "failed",
      expectedDayCount,
      computedMatrixRowCount,
      missingDays,
      untrustedDays: [],
      unreconciledDays: [],
      staleDays: [],
      problemRows: [],
      knownLimitationRows,
      blockingReasons,
      reason: `Scheduling data check failed: ${error}`,
    };
  }

  if (loading) {
    return {
      status: "checking",
      expectedDayCount,
      computedMatrixRowCount,
      missingDays,
      untrustedDays: [],
      unreconciledDays: [],
      staleDays: [],
      problemRows: [],
      knownLimitationRows,
      blockingReasons,
      reason: `Checking ${expectedDayCount} day${expectedDayCount === 1 ? "" : "s"} for computed Demand Matrix coverage.`,
    };
  }

  if (!expectedDayCount) {
    return {
      status: "blocked",
      expectedDayCount,
      computedMatrixRowCount,
      missingDays,
      untrustedDays: [],
      unreconciledDays: [],
      staleDays: [],
      problemRows: [],
      knownLimitationRows,
      blockingReasons: ["No dates are selected."],
      reason: "No dates are selected.",
    };
  }

  if (blockingReasons.length) {
    return {
      status: "blocked",
      expectedDayCount,
      computedMatrixRowCount,
      missingDays,
      untrustedDays: [],
      unreconciledDays: [],
      staleDays: [],
      problemRows: [],
      knownLimitationRows,
      blockingReasons,
      reason: `Export blocked until every selected day has a computed Demand Matrix row: ${blockingReasons.join("; ")}.`,
    };
  }

  return {
    status: "ready",
    expectedDayCount,
    computedMatrixRowCount,
    missingDays,
    untrustedDays: [],
    unreconciledDays: [],
    staleDays: [],
    problemRows: [],
    knownLimitationRows,
    blockingReasons: [],
    reason: `Ready: all ${expectedDayCount} selected day${expectedDayCount === 1 ? "" : "s"} have computed Demand Matrix rows. Export uses actual/current values only.`,
  };
}

export function buildDemandMatrixExportModel({
  days,
  expectedDates,
  startDate,
  endDate,
  locationId,
  locationName,
  generatedAt = new Date().toISOString(),
  readiness,
} = {}) {
  const sortedDays = [...(days || [])]
    .filter((day) => day?.date && (!startDate || day.date >= startDate) && (!endDate || day.date <= endDate))
    .sort((a, b) => a.date.localeCompare(b.date));
  const expected = expectedDates || sortedDays.map((day) => day.date);
  const rowGroups = buildDemandMatrixExportRowGroups(sortedDays);
  const rows = rowGroups.flatMap((group) => [
    { type: "section", section: group.section, label: group.section, cells: [] },
    ...group.rows.map((row) => ({
      type: "metric",
      section: group.section,
      key: row.key,
      label: row.label,
      total: Boolean(row.total),
      optional: Boolean(row.optional),
      format: row.format || null,
      cells: sortedDays.map((day) => {
        const value = getDayMatrixValue(day, row, "current");
        const missingValue = value === null || value === undefined;
        return {
          date: day.date,
          value: missingValue ? null : Number(value),
          displayValue: missingValue
            ? (row.comparison ? "No history" : "No data")
            : formatDemandMatrixValue(value, row.format),
          missingValue,
        };
      }),
    })),
  ]);

  return {
    worksheetName: "Demand Matrix",
    mode: DEMAND_MATRIX_EXPORT_MODE,
    modeLabel: "Actual/current canonical values",
    locationId: locationId || sortedDays[0]?.matrix?.location_id || "",
    locationName: locationName || locationId || sortedDays[0]?.matrix?.location_id || "Unknown location",
    startDate: startDate || expected[0] || "",
    endDate: endDate || expected[expected.length - 1] || "",
    generatedAt,
    days: sortedDays.map((day) => ({
      date: day.date,
      dayName: day.dayName || getDayColumnLabel(day.date),
      computedAt: day?.matrix?.computed_at || null,
    })),
    expectedDates: expected,
    readiness,
    rows,
  };
}

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
    section: "Opening Boarding",
    summaryKey: "opening.total_boarding",
    summaryLabel: "Opening Boarding",
    summaryTitle: "Total boarding dogs in the building at opening.",
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
    summaryKey: "closing.total_boarding",
    summaryLabel: "Closing Boarding",
    summaryTitle: "Dogs staying overnight after this operating day.",
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
    section: "Total Daytime Dogs",
    summaryKey: "daycare.total_daycare",
    summaryLabel: "Total Daytime Dogs",
    summaryTitle: "Daycare, dayboarding, evaluations, and other same-day daytime demand.",
    rows: [
      { key: "daycare.evaluations", label: "Evaluations" },
      { key: "daycare.private_play_dayboarding", label: "Private Play Dayboarding" },
      { key: "daycare.half_and_half_daytime", label: "Half and Half Daytime Dogs", optional: true },
      { key: "daycare.large_daycare", label: "Large Daycare" },
      { key: "daycare.small_daycare", label: "Small Daycare" },
      { key: "daycare.unclassified_daycare", label: "Unresolved Daytime Dogs", optional: true },
      { key: "daycare.total_daycare", label: "Total Daytime Dogs", total: true },
    ],
  },
  {
    section: "Daily Dog Volume",
    summaryKey: "support.total_dog_volume",
    summaryLabel: "Daily Dog Volume",
    summaryTitle: "Closing boarding plus total daytime dogs. This is the default planning volume.",
    rows: [
      { key: "support.total_dog_volume", label: "Daily Dog Volume", total: true },
    ],
  },
  {
    section: "Boarding Dogs Departing Today",
    summaryKey: "departing.total_boarding",
    summaryLabel: "Boarding Dogs Departing Today",
    summaryTitle: "Boarding check-outs that can be considered on top of Daily Dog Volume.",
    rows: [
      { key: "departing.total_boarding", label: "Total Boarding Dogs Departing Today", total: true },
    ],
  },
  {
    section: "Total Daily Dog Volume",
    summaryKey: "support.total_daily_dog_volume",
    summaryLabel: "Total Daily Dog Volume",
    summaryTitle: "Daily Dog Volume plus Boarding Dogs Departing Today.",
    rows: [
      { key: "support.total_daily_dog_volume", label: "Total Daily Dog Volume", total: true },
    ],
  },
  {
    section: "Play Yard Demand",
    defaultExpanded: true,
    rows: [
      { key: "play_yard.large_total_play_dogs", label: "Large Play Demand", total: true, alwaysVisible: true },
      { key: "play_yard.large_play_dogs", label: "Large Play from Daily Dog Volume", detail: true },
      { key: "play_yard.large_departing_play_dogs", label: "Large Play from Departing Volume", detail: true },
      { key: "play_yard.small_total_play_dogs", label: "Small Play Demand", total: true, alwaysVisible: true },
      { key: "play_yard.small_play_dogs", label: "Small Play from Daily Dog Volume", detail: true },
      { key: "play_yard.small_departing_play_dogs", label: "Small Play from Departing Volume", detail: true },
      { key: "play_yard.private_total_play_dogs", label: "Private Play Demand", total: true, alwaysVisible: true },
      { key: "play_yard.private_play_dogs", label: "Private Play from Daily Dog Volume", detail: true },
      { key: "play_yard.private_departing_play_dogs", label: "Private Play from Departing Volume", detail: true },
      { key: "play_yard.split_total_play_dogs", label: "Split Play Demand", optional: true, total: true, alwaysVisible: true },
      { key: "play_yard.split_play_dogs", label: "Split Play from Daily Dog Volume", optional: true, detail: true },
      { key: "play_yard.split_departing_play_dogs", label: "Split Play from Departing Volume", detail: true },
      { key: "play_yard.unassigned_departing_play_dogs", label: "Unassigned Departing Play", optional: true, detail: true },
    ],
  },
  {
    section: "Ancillary",
    defaultExpanded: true,
    rows: [
      { key: "support.departure_baths", label: "Departure Baths", alwaysVisible: true },
      { key: "support.tours", label: "Tours", alwaysVisible: true },
    ],
  },
  {
    section: "Historical Comparison",
    defaultExpanded: false,
    buildRows: buildHistoricalComparisonRows,
  },
  {
    section: "Gingr Source Counts",
    hideRowsWhenCollapsed: true,
    rows: [
      { key: "source.check_ins", label: "Gingr Check-Ins", source: true },
      { key: "source.check_outs", label: "Gingr Check-Outs", source: true },
      { key: "source.overnight", label: "Gingr Overnight", source: true },
      { key: "source.boarding_opening", label: "Boarding Dogs Opening", total: true, source: true },
      { key: "source.boarding_closing", label: "Boarding Dogs Closing", total: true, source: true },
      { key: "source.boarding_departing", label: "Boarding Dogs Departing", total: true, source: true },
      { key: "source.daytime_total", label: "Gingr Daytime Dogs", total: true, source: true },
      { key: "source.default_dog_volume", label: "Gingr Daytime + Overnight", total: true, source: true },
      { key: "source.total", label: "Gingr Raw Check-Outs + Overnight", source: true },
    ],
  },
];

export const SCHEDULING_NARRATIVE_ROWS = [
  { key: "opening.total_boarding", label: "Total opening boarding dogs" },
  { key: "support.departure_baths", label: "Total departure baths" },
  { key: "closing.total_boarding", label: "Total closing boarding dogs" },
  { key: "daycare.total_daycare", label: "Total daytime dogs" },
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
  const comparison = day?.comparison || getMatrixComparison(day?.matrix || day || {});
  if (!comparison) return comparison;

  const currentBoardingDeparting = toNullableNumber(comparison.current_boarding_departing);
  const currentTotal = toNullableNumber(comparison.current_total);
  const currentTotalDailyVolume = toNullableNumber(comparison.current_total_daily_volume)
    ?? (
      currentTotal !== null && currentBoardingDeparting !== null
        ? currentTotal + currentBoardingDeparting
        : null
    );
  const priorYears = Array.isArray(comparison.prior_years)
    ? comparison.prior_years
      .map((entry) => {
        const yearOffset = Number(entry?.year_offset);
        if (!Number.isFinite(yearOffset) || yearOffset < 1) return null;
        const metrics = entry?.metrics || entry || {};
        const total = toNullableNumber(metrics.total ?? entry.total);
        const boardingDeparting = toNullableNumber(metrics.boarding_departing ?? entry.boarding_departing);
        const totalDailyVolume = toNullableNumber(metrics.total_daily_volume ?? entry.total_daily_volume)
          ?? (
            total !== null && boardingDeparting !== null
              ? total + boardingDeparting
              : null
          );
        return {
          ...entry,
          year_offset: yearOffset,
          label: entry.label || getHistoricalComparisonLabel(yearOffset),
          overnight: toNullableNumber(metrics.overnight ?? entry.overnight),
          daytime: toNullableNumber(metrics.daytime ?? entry.daytime),
          total,
          boarding_departing: boardingDeparting,
          total_daily_volume: totalDailyVolume,
          total_pct_vs_current_year: toNullableNumber(entry.total_pct_vs_current_year),
          total_daily_volume_pct_vs_current_year: toNullableNumber(entry.total_daily_volume_pct_vs_current_year),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.year_offset - b.year_offset)
    : [];

  if (
    !priorYears.some((entry) => entry.year_offset === 1)
    && (comparison.yoy_total !== undefined || comparison.last_year_total_dog_volume !== undefined)
  ) {
    const yoyTotal = toNullableNumber(comparison.yoy_total ?? comparison.last_year_total_dog_volume);
    const yoyBoardingDeparting = toNullableNumber(comparison.yoy_boarding_departing);
    priorYears.unshift({
      year_offset: 1,
      label: "YOY",
      overnight: toNullableNumber(comparison.yoy_overnight),
      daytime: toNullableNumber(comparison.yoy_daytime),
      total: yoyTotal,
      boarding_departing: yoyBoardingDeparting,
      total_daily_volume: toNullableNumber(comparison.yoy_total_daily_volume)
        ?? (
          yoyTotal !== null && yoyBoardingDeparting !== null
            ? yoyTotal + yoyBoardingDeparting
            : null
        ),
      total_pct_vs_current_year: toNullableNumber(comparison.yoy_total_pct_vs_current_year),
      total_daily_volume_pct_vs_current_year: toNullableNumber(comparison.yoy_total_daily_volume_pct_vs_current_year),
    });
  }

  const result = {
    ...comparison,
    current_boarding_departing: currentBoardingDeparting,
    current_total_daily_volume: currentTotalDailyVolume,
    prior_years: priorYears,
  };

  for (const entry of priorYears) {
    const prefix = `prior_year_${entry.year_offset}`;
    result[`${prefix}_overnight`] = result[`${prefix}_overnight`] ?? entry.overnight;
    result[`${prefix}_daytime`] = result[`${prefix}_daytime`] ?? entry.daytime;
    result[`${prefix}_total`] = result[`${prefix}_total`] ?? entry.total;
    result[`${prefix}_boarding_departing`] = result[`${prefix}_boarding_departing`] ?? entry.boarding_departing;
    result[`${prefix}_total_daily_volume`] = result[`${prefix}_total_daily_volume`] ?? entry.total_daily_volume;
    result[`${prefix}_total_pct_vs_current_year`] = result[`${prefix}_total_pct_vs_current_year`] ?? entry.total_pct_vs_current_year;
    result[`${prefix}_total_daily_volume_pct_vs_current_year`] = result[`${prefix}_total_daily_volume_pct_vs_current_year`] ?? entry.total_daily_volume_pct_vs_current_year;
  }

  if (result.prior_year_1_total !== undefined || result.yoy_total === undefined) {
    result.yoy_overnight = result.yoy_overnight ?? result.prior_year_1_overnight;
    result.yoy_daytime = result.yoy_daytime ?? result.prior_year_1_daytime;
    result.yoy_total = result.yoy_total ?? result.prior_year_1_total;
    result.yoy_boarding_departing = result.yoy_boarding_departing ?? result.prior_year_1_boarding_departing;
    result.yoy_total_daily_volume = result.yoy_total_daily_volume ?? result.prior_year_1_total_daily_volume;
    result.yoy_total_pct_vs_current_year = result.yoy_total_pct_vs_current_year ?? result.prior_year_1_total_pct_vs_current_year;
    result.yoy_total_daily_volume_pct_vs_current_year = result.yoy_total_daily_volume_pct_vs_current_year ?? result.prior_year_1_total_daily_volume_pct_vs_current_year;
    return result;
  }

  return {
    ...result,
    prior_year_1_overnight: comparison.yoy_overnight,
    prior_year_1_daytime: comparison.yoy_daytime,
    prior_year_1_total: comparison.yoy_total,
    prior_year_1_boarding_departing: comparison.yoy_boarding_departing,
    prior_year_1_total_daily_volume: comparison.yoy_total_daily_volume,
    prior_year_1_total_pct_vs_current_year: comparison.yoy_total_pct_vs_current_year,
    prior_year_1_total_daily_volume_pct_vs_current_year: comparison.yoy_total_daily_volume_pct_vs_current_year,
  };
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getUnassignedDepartingPlay(display) {
  const total = toNullableNumber(display?.departing?.total_boarding);
  if (total === null) return Number(display?.departing?.unclassified_boarding || 0);
  const typedTotal = [
    display?.departing?.large_boarding,
    display?.departing?.small_boarding,
    display?.departing?.private_play_boarding,
    display?.departing?.half_and_half_boarding,
    display?.departing?.evaluation_boarding,
  ].reduce((sum, value) => sum + Number(value || 0), 0);
  return Math.max(0, total - typedTotal);
}

function getDerivedMatrixValue(display, key) {
  if (!display) return undefined;
  switch (key) {
    case "support.total_daily_dog_volume":
      return (
        toNullableNumber(display.support?.total_daily_dog_volume)
        ?? (
          Number(display.support?.total_dog_volume || 0)
          + Number(display.departing?.total_boarding || 0)
        )
      );
    case "departing.unclassified_boarding": {
      return getUnassignedDepartingPlay(display);
    }
    case "play_yard.large_departing_play_dogs":
      return Number(display.departing?.large_boarding || 0);
    case "play_yard.small_departing_play_dogs":
      return Number(display.departing?.small_boarding || 0);
    case "play_yard.private_departing_play_dogs":
      return Number(display.departing?.private_play_boarding || 0);
    case "play_yard.split_departing_play_dogs":
      return Number(display.departing?.half_and_half_boarding || 0);
    case "play_yard.unassigned_departing_play_dogs":
      return getUnassignedDepartingPlay(display);
    case "play_yard.large_total_play_dogs":
      return Number(display.play_yard?.large_play_dogs || 0) + Number(display.departing?.large_boarding || 0);
    case "play_yard.small_total_play_dogs":
      return Number(display.play_yard?.small_play_dogs || 0) + Number(display.departing?.small_boarding || 0);
    case "play_yard.private_total_play_dogs":
      return Number(display.play_yard?.private_play_dogs || 0) + Number(display.departing?.private_play_boarding || 0);
    case "play_yard.split_total_play_dogs":
      return Number(display.play_yard?.split_play_dogs || 0) + Number(display.departing?.half_and_half_boarding || 0);
    default:
      return undefined;
  }
}

export function getDayMatrixValue(day, row, mode = "current") {
  if (row.comparison) {
    return getComparisonMatrixValue(getDayComparison(day), row.key);
  }

  const source = (row.source || mode === "current") ? getDayCurrentDisplay(day) : getDayProjectedDisplay(day);
  const derivedValue = getDerivedMatrixValue(source, row.key);
  return derivedValue ?? getNestedValue(source, row.key);
}

function getComparisonMatrixValue(comparison, key) {
  const value = getNestedValue({ comparison }, key);
  if (value !== null && value !== undefined && value !== "") return value;
  const metricKey = String(key || "").replace(/^comparison\./, "");
  const priorPctMatch = metricKey.match(/^prior_year_(\d+)_(total|total_daily_volume)_pct_vs_current_year$/);
  if (priorPctMatch) {
    const [, offset, metric] = priorPctMatch;
    const historicalValue = toNullableNumber(comparison?.[`prior_year_${offset}_${metric}`]);
    const currentKey = metric === "total_daily_volume" ? "current_total_daily_volume" : "current_total";
    const currentValue = toNullableNumber(comparison?.[currentKey]);
    if (historicalValue !== null && currentValue !== null && currentValue > 0) {
      return Number(((historicalValue / currentValue) * 100).toFixed(1));
    }
  }
  return value;
}

function hasAnyPopulatedValue(days, row) {
  return days.some((day) => {
    const value = getDayMatrixValue(day, row, "current")
      ?? getDayMatrixValue(day, row, "projected");
    return value !== null && value !== undefined && value !== "";
  });
}

function hasAnyNonZeroValue(days, row) {
  return days.some((day) => {
    const value = getDayMatrixValue(day, row, "current")
      ?? getDayMatrixValue(day, row, "projected");
    return value !== null && value !== undefined && Number(value) !== 0;
  });
}

function getHistoricalComparisonLabel(yearOffset) {
  return yearOffset === 1 ? "YOY" : `YO${yearOffset}Y`;
}

function getHistoricalComparisonOffsets(days) {
  const offsets = new Set();
  for (const day of days || []) {
    const comparison = getDayComparison(day);
    if (Number(comparison?.yoy_total) > 0) offsets.add(1);
    for (const entry of comparison?.prior_years || []) {
      const offset = Number(entry?.year_offset);
      if (Number.isFinite(offset) && offset >= 1) offsets.add(offset);
    }
    for (const key of Object.keys(comparison || {})) {
      const match = key.match(/^prior_year_(\d+)_(?:total|total_daily_volume)$/);
      if (match && Number(comparison[key]) > 0) offsets.add(Number(match[1]));
    }
  }
  return Array.from(offsets).sort((a, b) => a - b);
}

function buildHistoricalComparisonRows(days) {
  return getHistoricalComparisonOffsets(days).flatMap((yearOffset) => {
    const label = getHistoricalComparisonLabel(yearOffset);
    const prefix = `comparison.prior_year_${yearOffset}`;
    const rows = [
      { key: `${prefix}_total`, label: `${label} Dog Volume`, total: true, alwaysVisible: true, comparison: true },
      { key: `${prefix}_total_daily_volume`, label: `${label} Total Daily Dog Volume`, total: true, alwaysVisible: true, comparison: true },
      { key: `${prefix}_overnight`, label: `${label} Overnight Dogs`, comparison: true },
      { key: `${prefix}_daytime`, label: `${label} Daytime Dogs`, comparison: true },
      { key: `${prefix}_boarding_departing`, label: `${label} Boarding Dogs Departing`, comparison: true },
      { key: `${prefix}_total_pct_vs_current_year`, label: `${label} Dog Volume % of Current Year`, comparison: true, format: "percent" },
      { key: `${prefix}_total_daily_volume_pct_vs_current_year`, label: `${label} Total Daily Dog Volume % of Current Year`, comparison: true, format: "percent" },
    ];
    return rows.filter((row) => hasAnyPopulatedValue(days || [], row));
  });
}

export function buildDemandMatrixRowGroups(days) {
  return MATRIX_GROUP_TEMPLATES.map((group) => ({
    ...group,
    rows: (typeof group.buildRows === "function" ? group.buildRows(days || []) : group.rows)
      .filter((row) => !row.optional || hasAnyNonZeroValue(days || [], row)),
  }));
}

const DEMAND_MATRIX_EXPORT_EXCLUDED_SECTIONS = new Set(["Gingr Source Counts", "Historical Comparison"]);

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

function getHistoricalPercentKeys(row) {
  const totalDailyMatch = row?.key?.match(/^comparison\.prior_year_(\d+)_total_daily_volume_pct_vs_current_year$/);
  if (totalDailyMatch) {
    return {
      historicalTotalKey: `prior_year_${totalDailyMatch[1]}_total_daily_volume`,
      currentTotalKey: "current_total_daily_volume",
    };
  }
  const priorYearMatch = row?.key?.match(/^comparison\.prior_year_(\d+)_total_pct_vs_current_year$/);
  if (priorYearMatch) {
    return {
      historicalTotalKey: `prior_year_${priorYearMatch[1]}_total`,
      currentTotalKey: "current_total",
    };
  }
  if (row?.key === "comparison.yoy_total_daily_volume_pct_vs_current_year") {
    return {
      historicalTotalKey: "yoy_total_daily_volume",
      currentTotalKey: "current_total_daily_volume",
    };
  }
  if (row?.key === "comparison.yoy_total_pct_vs_current_year") {
    return {
      historicalTotalKey: "yoy_total",
      currentTotalKey: "current_total",
    };
  }
  return {
    historicalTotalKey: "prior_year_1_total",
    currentTotalKey: "current_total",
  };
}

function totalHistoricalPct(days, row) {
  const { historicalTotalKey, currentTotalKey } = getHistoricalPercentKeys(row);
  const currentValues = days
    .map((day) => Number(getDayComparison(day)?.[currentTotalKey]))
    .filter((value) => Number.isFinite(value));
  const lastYearValues = days
    .map((day) => Number(getDayComparison(day)?.[historicalTotalKey]))
    .filter((value) => Number.isFinite(value));
  const currentTotal = currentValues.reduce((sum, value) => sum + value, 0);
  const lastYearTotal = lastYearValues.reduce((sum, value) => sum + value, 0);
  if (currentTotal <= 0 || !lastYearValues.length) return null;
  return Number(((lastYearTotal / currentTotal) * 100).toFixed(1));
}

export function summarizeAggregateMatrixCell(days, row, mode = "current") {
  if (row.format === "percent") {
    const value = totalHistoricalPct(days || [], row);
    return {
      value,
      hasValue: value !== null && value !== undefined,
      unavailableLabel: "Not populated",
      unavailableTitle: "No populated prior-year comparison total is available for this aggregate.",
    };
  }

  const value = sumMatrixValues(days || [], row, mode);
  const isComparison = Boolean(row.comparison);
  return {
    value,
    hasValue: value !== null && value !== undefined,
    unavailableLabel: isComparison ? "Not populated" : "No data",
    unavailableTitle: isComparison
      ? "No populated prior-year source count is available for this aggregate."
      : "No canonical source count is available for this aggregate.",
  };
}

export function buildHistoricalRangeSummary(days) {
  const currentOvernight = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.current_overnight) || 0), 0);
  const currentDaytime = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.current_daytime) || 0), 0);
  const currentTotal = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.current_total) || 0), 0);
  const currentTotalDailyVolume = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.current_total_daily_volume) || 0), 0);
  const yoyOvernight = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.yoy_overnight) || 0), 0);
  const yoyDaytime = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.yoy_daytime) || 0), 0);
  const yoyTotal = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.yoy_total) || 0), 0);
  const yoyTotalDailyVolume = (days || []).reduce((sum, day) => sum + (Number(getDayComparison(day)?.yoy_total_daily_volume) || 0), 0);
  return {
    currentOvernight,
    currentDaytime,
    currentTotal,
    currentTotalDailyVolume,
    yoyOvernight,
    yoyDaytime,
    yoyTotal,
    yoyTotalDailyVolume,
    yoyTotalPctVsCurrentYear: currentTotal > 0 ? Number(((yoyTotal / currentTotal) * 100).toFixed(1)) : null,
    yoyTotalDailyVolumePctVsCurrentYear: currentTotalDailyVolume > 0 ? Number(((yoyTotalDailyVolume / currentTotalDailyVolume) * 100).toFixed(1)) : null,
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
            ? (row.comparison ? "Not populated" : "No data")
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

import { describe, expect, it } from "vitest";
import {
  buildSchedulingNarrative,
  buildSchedulingNarrativeHtml,
  buildMatrixColumns,
  buildMonthWeekSegments,
  buildHistoricalRangeSummary,
  getProjectionHistoryPoints,
  getProjectionFormulaLine,
  getProjectionHeadline,
  getProjectionMethodologySteps,
  getProjectionSummaryLines,
  summarizeAggregateMatrixCell,
} from "../kol/pages/SchedulingPage.jsx";

function makeProjectedDay() {
  return {
    date: "2026-05-11",
    dayName: "Mon",
    projection: {
      lead_days: 7,
      calibration: {
        weekly_pace: {
          factor: 0.6629,
          raw_week_projected: 1062,
          weekly_target: 704,
          current_week_booked: 511,
          prior_year_week_as_of: 345,
          prior_year_week_final: 618,
          recent_completed_week_yoy_factor: 0.9918,
          sample_count: 6,
        },
      },
      capacity: {
        constraints: [
          {
            key: "boarding_practical",
            label: "Practical boarding dog capacity",
            demand: 52,
            capacity: 103,
            status: "within_capacity",
          },
        ],
      },
      explanations: {
        support_total_dog_volume: {
          lead_days: 7,
          current_value: 27,
          projected_value: 31,
          raw_projected_value: 40,
          completion_rate: 0.68,
          exact_prior_year_as_of: 34,
          exact_prior_year_final: 50,
          baseline_as_of_average: 34,
          baseline_final_average: 50,
          weekly_pace_adjustment_factor: 0.6629,
          fallback_mode: "weighted_comparable_blend",
          sample_count: 7,
          yoy_adjustment_factor: 1.18,
          yoy_adjustment: {
            lookback_days: 28,
            sample_count: 28,
          },
        },
      },
    },
  };
}

function makeNarrativeDay(date, dayName, current, projected) {
  return {
    date,
    dayName,
    currentDisplay: {
      opening: { total_boarding: current.opening },
      support: { departure_baths: current.baths },
      closing: { total_boarding: current.closing },
      daycare: { total_daycare: current.daycare },
    },
    projectedDisplay: {
      opening: { total_boarding: projected.opening },
      support: { departure_baths: projected.baths },
      closing: { total_boarding: projected.closing },
      daycare: { total_daycare: projected.daycare },
    },
  };
}

describe("scheduling projection explanation copy", () => {
  it("keeps the selected-day headline and formula auditable", () => {
    expect(getProjectionHeadline(makeProjectedDay())).toBe("7 days out. On this same date last year, 34 of 50 final dogs were already booked by this point (68%).");
    expect(getProjectionFormulaLine(makeProjectedDay())).toContain("27 currently booked / 68% historical completion = 40 raw demand");
    expect(getProjectionFormulaLine(makeProjectedDay())).toContain("40 x 1.18x recent pickup x 0.66x full-week check = 31 demand");
  });

  it("keeps column header summaries compact and specific", () => {
    const lines = getProjectionSummaryLines(makeProjectedDay());

    expect(lines).toContain("7 days out: last year 34/50 dogs were already booked (68%).");
    expect(lines).toContain("Also blends 7 same-season / same-weekday samples.");
    expect(lines).toContain("Recent completed days adjust the forecast 1.18x (+18%) using 28 completed days.");
    expect(lines).toContain("Full-week check scales 1062 raw dog-days to 704. Recent completed weeks are 0.99x vs last year.");
  });

  it("explains the selected-day methodology as traceable steps", () => {
    const steps = getProjectionMethodologySteps(makeProjectedDay());
    const detail = steps.map((step) => `${step.label} ${step.detail}`).join("\n");

    expect(detail).toContain("Gingr reservations.created_date");
    expect(detail).toContain("34 of 50 final dogs were booked");
    expect(detail).toContain("different weekday");
    expect(detail).toContain("Same-weekday samples get extra weight");
    expect(detail).toContain("last 28 completed days");
    expect(detail).toContain("same lead time");
    expect(detail).toContain("prior-year completion divided by current-year completion");
    expect(detail).toContain("511 currently booked");
    expect(detail).toContain("345 booked by the same point last year");
    expect(detail).toContain("visible-week target to 704 dog-days");
    expect(detail).toContain("Practical boarding dog capacity: demand 52, cap 103");
  });

  it("builds a plain-text weekly scheduling narrative", () => {
    const text = buildSchedulingNarrative([
      makeNarrativeDay(
        "2026-05-11",
        "Mon",
        { opening: 41, baths: 14, closing: 28, daycare: 16 },
        { opening: 52, baths: 18, closing: 35, daycare: 20 },
      ),
      makeNarrativeDay(
        "2026-05-12",
        "Tue",
        { opening: 28, baths: 5, closing: 33, daycare: 16 },
        { opening: 42, baths: 8, closing: 50, daycare: 24 },
      ),
    ]);

    expect(text).toBe([
      "Monday, 5/11",
      "• Total opening boarding dogs: 41 current → 52 projected",
      "• Total departure baths: 14 current → 18 projected",
      "• Total closing boarding dogs: 28 current → 35 projected",
      "• Total daytime dogs: 16 current → 20 projected",
      "",
      "Tuesday, 5/12",
      "• Total opening boarding dogs: 28 current → 42 projected",
      "• Total departure baths: 5 current → 8 projected",
      "• Total closing boarding dogs: 33 current → 50 projected",
      "• Total daytime dogs: 16 current → 24 projected",
    ].join("\n"));
  });

  it("builds rich clipboard HTML with bold day headers and list items", () => {
    const html = buildSchedulingNarrativeHtml([
      makeNarrativeDay(
        "2026-05-11",
        "Mon",
        { opening: 41, baths: 14, closing: 28, daycare: 16 },
        { opening: 52, baths: 18, closing: 35, daycare: 20 },
      ),
    ]);

    expect(html).toContain("<strong>Monday, 5/11</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("Total opening boarding dogs: 41 current → 52 projected");
  });

  it("aggregates historical range cards from canonical comparison fields", () => {
    const summary = buildHistoricalRangeSummary([
      {
        comparison: {
          current_overnight: 50,
          current_daytime: 30,
          current_total: 80,
          yoy_overnight: 45,
          yoy_daytime: 25,
          yoy_total: 70,
        },
      },
      {
        comparison: {
          current_overnight: 40,
          current_daytime: 20,
          current_total: 60,
          yoy_overnight: 36,
          yoy_daytime: 24,
          yoy_total: 60,
        },
      },
    ]);

    expect(summary.currentTotal).toBe(140);
    expect(summary.yoyOvernight).toBe(81);
    expect(summary.yoyDaytime).toBe(49);
    expect(summary.yoyTotal).toBe(130);
    expect(summary.yoyTotalPctVsCurrentYear).toBe(92.9);
  });

  it("aggregates YOY total cells and shows unavailable state when history is absent", () => {
    const row = { key: "comparison.yoy_total", label: "YOY Total", comparison: true };
    const withHistory = summarizeAggregateMatrixCell([
      { comparison: { yoy_total: 70 } },
      { comparison: { yoy_total: 60 } },
    ], row, "current");
    const withoutHistory = summarizeAggregateMatrixCell([
      { comparison: { yoy_total: null, current_total: 80 } },
      { comparison: {} },
    ], row, "current");
    const withLegacyHistoricalTotal = summarizeAggregateMatrixCell([
      {
        matrix: {
          detail_json: {
            projection: {
              comparisons: {
                current_year: { total: 82 },
                yoy_total: null,
                last_year_total_dog_volume: 76,
              },
            },
          },
        },
      },
    ], row, "current");

    expect(withHistory).toMatchObject({ hasValue: true, value: 130 });
    expect(withLegacyHistoricalTotal).toMatchObject({ hasValue: true, value: 76 });
    expect(withoutHistory).toMatchObject({
      hasValue: false,
      unavailableLabel: "Not populated",
    });
  });

  it("builds month columns as week-segment aggregates by default", () => {
    const days = Array.from({ length: 31 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return { date: `2026-05-${day}` };
    });
    const segments = buildMonthWeekSegments(days, "2026-05-01", "2026-05-31");
    const columns = buildMatrixColumns({
      days,
      rangeMode: "month",
      rangeStart: "2026-05-01",
      rangeEnd: "2026-05-31",
    });

    expect(segments.map((segment) => [segment.startDate, segment.endDate, segment.days.length])).toEqual([
      ["2026-05-01", "2026-05-03", 3],
      ["2026-05-04", "2026-05-10", 7],
      ["2026-05-11", "2026-05-17", 7],
      ["2026-05-18", "2026-05-24", 7],
      ["2026-05-25", "2026-05-31", 7],
    ]);
    expect(columns.columns).toHaveLength(5);
    expect(columns.columns.every((column) => column.type === "segment")).toBe(true);
  });

  it("expands a month week segment into daily columns after the aggregate column", () => {
    const days = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return { date: `2026-05-${day}` };
    });
    const segments = buildMonthWeekSegments(days, "2026-05-01", "2026-05-31");
    const columns = buildMatrixColumns({
      days,
      rangeMode: "month",
      rangeStart: "2026-05-01",
      rangeEnd: "2026-05-31",
      expandedMonthSegments: new Set([segments[1].id]),
    });

    expect(columns.columns.map((column) => column.type)).toEqual([
      "segment",
      "segment",
      "day",
      "day",
      "day",
      "day",
      "day",
      "day",
      "day",
    ]);
    expect(columns.columns[2]).toMatchObject({
      type: "day",
      parentSegmentId: segments[1].id,
      day: { date: "2026-05-04" },
      dateLabel: "05/04/2026",
    });
  });

  it("maps projection history snapshots for interactive hover details", () => {
    const points = getProjectionHistoryPoints({
      date: "2026-05-17",
      projectionHistory: [
        {
          target_date: "2026-05-17",
          as_of_date: "2026-05-11",
          lead_days: 6,
          current_display: { support: { total_dog_volume: 90 } },
          projected_display: { support: { total_dog_volume: 99 } },
          actual_display: { support: { total_dog_volume: 101 } },
          projection_json: {
            demand_display: { support: { total_dog_volume: 105 } },
            capacity: { has_capacity_constrained_projection: true },
          },
        },
      ],
    });

    expect(points).toEqual([
      expect.objectContaining({
        asOfDate: "2026-05-11",
        leadDays: 6,
        booked: 90,
        projected: 99,
        demand: 105,
        actual: 101,
        delta: 2,
        capacityConstrained: true,
      }),
    ]);
  });
});

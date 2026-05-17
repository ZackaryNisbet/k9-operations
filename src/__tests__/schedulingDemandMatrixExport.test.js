import { describe, expect, it } from "vitest";
import { buildSchedulingDateRange } from "../hooks/useSchedulingData.js";
import {
  buildDemandMatrixExportModel,
  buildDemandMatrixRangeReadiness,
  buildDemandMatrixRowGroups,
} from "../kol/pages/schedulingDemandMatrixModel.js";
import { createDemandMatrixXlsxBlob } from "../kol/pages/schedulingDemandMatrixXlsx.js";

function makeDisplay(seed = 1) {
  return {
    source: {
      check_ins: 2 + seed,
      check_outs: 3 + seed,
      overnight: 8 + seed,
      boarding_opening: 7 + seed,
      boarding_closing: 8 + seed,
      daytime_total: 5 + seed,
      total: 11 + seed,
    },
    opening: {
      large_boarding: 3 + seed,
      small_boarding: 2 + seed,
      private_play_boarding: 1,
      half_and_half_boarding: 0,
      evaluation_boarding: 0,
      unclassified_boarding: 0,
      total_boarding: 6 + seed,
    },
    closing: {
      large_boarding: 4 + seed,
      small_boarding: 2 + seed,
      private_play_boarding: 1,
      half_and_half_boarding: 0,
      evaluation_boarding: 0,
      unclassified_boarding: 0,
      total_boarding: 7 + seed,
    },
    daycare: {
      evaluations: 1,
      private_play_dayboarding: 2,
      half_and_half_daytime: 0,
      large_daycare: 6 + seed,
      small_daycare: 3 + seed,
      unclassified_daycare: 0,
      total_daycare: 12 + seed,
    },
    support: {
      departure_baths: 4 + seed,
      morning_feeding_dogs: 6 + seed,
      evening_feeding_dogs: 7 + seed,
      medication_dogs: 2,
      total_dog_volume: 19 + seed,
      tours: 1,
    },
    play_yard: {
      large_play_dogs: 10 + seed,
      small_play_dogs: 6 + seed,
      private_play_dogs: 3,
      split_play_dogs: 0,
    },
  };
}

function makeDay(date, overrides = {}) {
  const display = overrides.display || makeDisplay(overrides.seed || 1);
  const projectedDisplay = overrides.projectedDisplay || {
    ...display,
    opening: { ...display.opening, total_boarding: 999 },
    support: { ...display.support, total_dog_volume: 999 },
  };
  const sourceReconciliation = overrides.sourceReconciliation ?? {
    is_reconciled: true,
    deltas: { opening_boarding: 0, closing_boarding: 0, daytime_total: 0, total_dog_volume: 0 },
  };
  const trust = overrides.trust || {
    state: "trusted",
    can_generate: true,
    blockers: [],
    blocker_details: [],
  };
  return {
    date,
    dayName: "Wed",
    hasLiveMatrix: overrides.hasLiveMatrix ?? true,
    hasNoData: overrides.hasNoData ?? false,
    matrixTrustState: overrides.matrixTrustState || trust.state,
    trust,
    currentDisplay: display,
    projectedDisplay,
    projection: overrides.projection || { state: "actual", as_of_date: date, lead_days: 0 },
    comparison: overrides.comparison || {
      current_overnight: 10,
      current_daytime: 8,
      current_total: 18,
      yoy_overnight: 9,
      yoy_daytime: 7,
      yoy_total: 16,
      yoy_total_pct_vs_current_year: 88.9,
    },
    matrix: {
      location_id: "cherry-hill",
      matrix_date: date,
      computed_at: `${date}T12:00:00.000Z`,
      detail_json: {
        display,
        projection: overrides.projection || { state: "actual", as_of_date: date, lead_days: 0 },
        source_reconciliation: sourceReconciliation,
        trust: {
          ...trust,
          source_reconciliation: sourceReconciliation,
        },
      },
    },
  };
}

describe("Scheduling Demand Matrix export model", () => {
  it("builds a 365-day range model and XLSX artifact without client-side scheduling compute", async () => {
    const dates = buildSchedulingDateRange("2025-01-01", "2025-12-31");
    expect(dates).toHaveLength(365);
    const days = dates.map((date, index) => makeDay(date, { seed: (index % 7) + 1 }));
    const readiness = buildDemandMatrixRangeReadiness({ days, expectedDates: dates, today: "2026-05-17" });
    expect(readiness.status).toBe("ready");

    const model = buildDemandMatrixExportModel({
      days,
      expectedDates: dates,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      locationId: "cherry-hill",
      locationName: "Adair Forsythe",
      readiness,
      generatedAt: "2026-05-17T12:00:00.000Z",
    });

    expect(model.days).toHaveLength(365);
    expect(model.rows.filter((row) => row.type === "metric").every((row) => row.cells.length === 365)).toBe(true);
    const blob = await createDemandMatrixXlsxBlob(model);
    expect(blob.size).toBeGreaterThan(10_000);
  });

  it("blocks readiness when any selected day is missing", () => {
    const dates = ["2025-01-01", "2025-01-02", "2025-01-03"];
    const days = [
      makeDay("2025-01-01"),
      makeDay("2025-01-02", {
        hasLiveMatrix: false,
        hasNoData: true,
        matrixTrustState: "missing",
        trust: {
          state: "missing",
          can_generate: false,
          blockers: ["No scheduling matrix has been computed for this day yet."],
          blocker_details: [],
        },
      }),
      makeDay("2025-01-03"),
    ];

    const readiness = buildDemandMatrixRangeReadiness({ days, expectedDates: dates, today: "2026-05-17" });
    expect(readiness.status).toBe("blocked");
    expect(readiness.missingDays).toEqual(["2025-01-02"]);
    expect(readiness.reason).toContain("missing");
  });

  it("exports actual/current values only even when projected values differ", () => {
    const date = "2025-03-15";
    const day = makeDay(date, {
      display: makeDisplay(2),
      projectedDisplay: {
        ...makeDisplay(2),
        opening: { ...makeDisplay(2).opening, total_boarding: 999 },
      },
    });
    const readiness = buildDemandMatrixRangeReadiness({ days: [day], expectedDates: [date], today: "2026-05-17" });
    const model = buildDemandMatrixExportModel({
      days: [day],
      expectedDates: [date],
      startDate: date,
      endDate: date,
      locationId: "cherry-hill",
      locationName: "Adair Forsythe",
      readiness,
    });

    const totalOpeningRow = model.rows.find((row) => row.key === "opening.total_boarding");
    expect(model.mode).toBe("actual_current");
    expect(totalOpeningRow.cells[0].value).toBe(8);
    expect(totalOpeningRow.cells[0].value).not.toBe(999);
  });

  it("keeps row labels and order aligned with Demand Matrix semantics", () => {
    const groups = buildDemandMatrixRowGroups([makeDay("2025-01-01")]);
    expect(groups.map((group) => group.section)).toEqual([
      "Gingr Source Counts",
      "Historical",
      "Opening Boarding",
      "Closing Boarding",
      "Daytime Volume",
      "Support Workload",
    ]);
    expect(groups[0].rows.map((row) => row.label)).toEqual([
      "Gingr Check-Ins",
      "Gingr Check-Outs",
      "Gingr Overnight",
      "Boarding Dogs Opening",
      "Boarding Dogs Closing",
      "Gingr Daytime Dogs",
      "Gingr Total Volume",
    ]);
    expect(groups[2].rows.at(-1).label).toBe("Total Boarding Dogs Opening");
    expect(groups[5].rows.map((row) => row.label)).toContain("Total Dog Volume");
  });

  it("does not block computed export rows for trust or reconciliation limitations", () => {
    const dates = ["2025-02-01", "2025-02-02"];
    const days = [
      makeDay("2025-02-01", { sourceReconciliation: { is_reconciled: false, deltas: { total_dog_volume: 1 } } }),
      makeDay("2025-02-02", {
        matrixTrustState: "trusted",
        trust: {
          state: "trusted",
          can_generate: false,
          blockers: ["1 dog missing actionable play icon in daytime volume"],
          blocker_details: [{ kind: "missing_actionable_play_icon", label: "1 dog missing actionable play icon in daytime volume" }],
        },
      }),
    ];

    const readiness = buildDemandMatrixRangeReadiness({ days, expectedDates: dates, today: "2026-05-17" });
    expect(readiness.status).toBe("ready");
    expect(readiness.unreconciledDays).toEqual([]);
    expect(readiness.untrustedDays).toEqual([]);
    expect(readiness.problemRows).toEqual([]);
    expect(readiness.reason).toContain("actual/current");
  });

  it("blocks a 365-day sparse range only for days without computed matrix rows", () => {
    const dates = buildSchedulingDateRange("2025-01-01", "2025-12-31");
    const days = [
      makeDay("2025-12-29", { sourceReconciliation: { is_reconciled: false, deltas: { total_dog_volume: 3 } } }),
      makeDay("2025-12-30", { sourceReconciliation: { is_reconciled: false, deltas: { total_dog_volume: 2 } } }),
      makeDay("2025-12-31", { sourceReconciliation: { is_reconciled: false, deltas: { total_dog_volume: 1 } } }),
    ];

    const readiness = buildDemandMatrixRangeReadiness({ days, expectedDates: dates, today: "2026-05-17" });
    expect(readiness.status).toBe("blocked");
    expect(readiness.computedMatrixRowCount).toBe(3);
    expect(readiness.missingDays).toHaveLength(362);
    expect(readiness.reason).toContain("computed Demand Matrix row");
    expect(readiness.reason).not.toContain("reconciled");
    expect(readiness.reason).not.toContain("untrusted");
  });
});

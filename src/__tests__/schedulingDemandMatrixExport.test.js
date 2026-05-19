import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildSchedulingDateRange } from "../hooks/useSchedulingData.js";
import {
  buildDemandMatrixExportModel,
  buildDemandMatrixExportRowGroups,
  buildDemandMatrixRangeReadiness,
  buildDemandMatrixRowGroups,
  getDayMatrixValue,
} from "../kol/pages/schedulingDemandMatrixModel.js";
import {
  buildDemandMatrixExportFilename,
  createDemandMatrixXlsxBlob,
} from "../kol/pages/schedulingDemandMatrixXlsx.js";

function makeDisplay(seed = 1) {
  return {
    source: {
      check_ins: 2 + seed,
      check_outs: 3 + seed,
      overnight: 8 + seed,
      boarding_opening: 7 + seed,
      boarding_closing: 8 + seed,
      boarding_departing: 3 + seed,
      daytime_total: 5 + seed,
      default_dog_volume: 13 + (2 * seed),
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
    departing: {
      large_boarding: 2 + seed,
      small_boarding: 1,
      private_play_boarding: 0,
      half_and_half_boarding: 0,
      evaluation_boarding: 0,
      unclassified_boarding: 0,
      total_boarding: 3 + seed,
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
      total_dog_volume: 19 + (2 * seed),
      total_daily_dog_volume: 22 + (3 * seed),
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

async function loadWorkbookXml(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const parts = {};
  for (const path of [
    "xl/worksheets/sheet1.xml",
    "xl/sharedStrings.xml",
    "xl/styles.xml",
    "docProps/core.xml",
  ]) {
    parts[path] = await zip.file(path).async("string");
  }
  return { zip, parts };
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
      locationName: "Cherry Hill",
      readiness,
      generatedAt: "2026-05-17T12:00:00.000Z",
    });

    expect(model.days).toHaveLength(365);
    expect(model.rows.filter((row) => row.type === "metric").every((row) => row.cells.length === 365)).toBe(true);
    const blob = await createDemandMatrixXlsxBlob(model);
    expect(blob.size).toBeGreaterThan(10_000);
  });

  it("writes readable workbook metadata, real date headers, operational rows, historical trends, and K9 Operations branding", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
    });

    try {
      const dates = ["2025-01-01", "2025-01-02"];
      const days = dates.map((date, index) => makeDay(date, { seed: index + 1 }));
      const readiness = buildDemandMatrixRangeReadiness({ days, expectedDates: dates, today: "2026-05-17" });
      const model = buildDemandMatrixExportModel({
        days,
        expectedDates: dates,
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        locationId: "8ea382b0-63f7-44ac-b6f8-83243c03d946",
        locationName: "Cherry Hill",
        readiness,
        generatedAt: "2026-05-17T12:00:00.000Z",
      });

      expect(buildDemandMatrixExportFilename(model)).toBe("scheduling-demand-matrix-cherry-hill-2025-01-01-to-2025-01-02.xlsx");
      expect(model.rows.some((row) => row.section === "Gingr Source Counts")).toBe(false);
      expect(model.rows.some((row) => row.section === "Historical Comparison")).toBe(true);
      expect(model.rows.find((row) => row.key === "opening.total_boarding")).toBeTruthy();
      expect(model.rows.find((row) => row.key === "closing.total_boarding")).toBeTruthy();
      expect(model.rows.find((row) => row.key === "comparison.prior_year_1_total")).toBeTruthy();
      expect(model.rows.find((row) => row.key === "comparison.prior_year_1_total")?.aggregate?.value).toBe(32);

      const blob = await createDemandMatrixXlsxBlob(model);
      const { zip, parts } = await loadWorkbookXml(blob);
      const sheetXml = parts["xl/worksheets/sheet1.xml"];
      const sharedStringsXml = parts["xl/sharedStrings.xml"];
      const stylesXml = parts["xl/styles.xml"];
      const coreXml = parts["docProps/core.xml"];

      expect(sharedStringsXml).toContain("K9 Operations");
      expect(sharedStringsXml).toContain("The operating system for pet care facilities");
      expect(sharedStringsXml).toContain("Location");
      expect(sharedStringsXml).toContain("Start Date");
      expect(sharedStringsXml).toContain("End Date");
      expect(sharedStringsXml).toContain("Generated At");
      expect(sharedStringsXml).not.toContain("Location ID");
      expect(sharedStringsXml).not.toContain("Mode");
      expect(sharedStringsXml).not.toContain("Readiness");
      expect(sharedStringsXml).not.toContain("Gingr Source Counts");
      expect(sharedStringsXml).toContain("Historical Comparison");
      expect(sharedStringsXml).toContain("YOY Dog Volume");
      expect(sharedStringsXml).toContain("Range Total");
      expect(sharedStringsXml).toContain("88.9%");
      expect(coreXml).toContain("<dc:creator>K9 Operations LLC</dc:creator>");
      expect(stylesXml).toContain('formatCode="ddd mmm d yyyy"');
      expect(sheetXml).toContain('<c r="B9" s="7"><v>45658</v></c>');
      expect(sheetXml).toContain('<drawing r:id="rId1"/>');
      expect(zip.file("xl/media/k9-logo.png")).toBeTruthy();
    } finally {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      } else {
        delete globalThis.fetch;
      }
    }
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
      locationName: "Cherry Hill",
      readiness,
    });

    const totalOpeningRow = model.rows.find((row) => row.key === "opening.total_boarding");
    expect(model.mode).toBe("actual_current");
    expect(totalOpeningRow.cells[0].value).toBe(8);
    expect(totalOpeningRow.cells[0].value).not.toBe(999);
  });

  it("keeps row labels and order aligned with Demand Matrix semantics", () => {
    const groups = buildDemandMatrixRowGroups([makeDay("2025-01-01")]);
    const exportGroups = buildDemandMatrixExportRowGroups([makeDay("2025-01-01")]);
    expect(groups.map((group) => group.section)).toEqual([
      "Opening Boarding",
      "Closing Boarding",
      "Total Daytime Dogs",
      "Daily Dog Volume",
      "Boarding Dogs Departing Today",
      "Total Daily Dog Volume",
      "Play Yard Demand",
      "Ancillary",
      "Historical Comparison",
      "Gingr Source Counts",
      "Weather Data",
    ]);
    expect(groups.find((group) => group.section === "Gingr Source Counts").rows.map((row) => row.label)).toEqual([
      "Gingr Check-Ins",
      "Gingr Check-Outs",
      "Gingr Overnight",
      "Boarding Dogs Opening",
      "Boarding Dogs Closing",
      "Boarding Dogs Departing",
      "Gingr Daytime Dogs",
      "Gingr Daytime + Overnight",
      "Gingr Raw Check-Outs + Overnight",
    ]);
    expect(exportGroups.map((group) => group.section)).toEqual([
      "Opening Boarding",
      "Closing Boarding",
      "Total Daytime Dogs",
      "Daily Dog Volume",
      "Boarding Dogs Departing Today",
      "Total Daily Dog Volume",
      "Play Yard Demand",
      "Ancillary",
      "Historical Comparison",
      "Weather Data",
    ]);
    expect(groups.at(-1).rows[0].label).toBe("Weather Data");
    expect(groups[0].rows.at(-1).label).toBe("Total Boarding Dogs Opening");
    expect(groups[3].rows.map((row) => row.label)).toContain("Daily Dog Volume");
    expect(groups[4].rows.map((row) => row.label)).toEqual(["Total Boarding Dogs Departing Today"]);
    expect(groups[5].rows.map((row) => row.label)).toContain("Total Daily Dog Volume");
    expect(groups[6].defaultExpanded).toBe(true);
    expect(groups[6].rows.map((row) => row.label)).toContain("Large Play Demand");
    expect(groups[6].rows.map((row) => row.label)).toContain("Small Play Demand");
    expect(groups[7].defaultExpanded).toBe(true);
  });

  it("keeps departing play splits in Play Yard Demand instead of the departures total row", () => {
    const display = makeDisplay(1);
    display.departing = {
      ...display.departing,
      large_boarding: 0,
      small_boarding: 0,
      private_play_boarding: 0,
      half_and_half_boarding: 0,
      evaluation_boarding: 0,
      unclassified_boarding: 0,
      total_boarding: 22,
    };
    const day = makeDay("2026-05-18", { display });
    const departingGroup = buildDemandMatrixRowGroups([day]).find((group) => group.section === "Boarding Dogs Departing Today");
    const playGroup = buildDemandMatrixRowGroups([day]).find((group) => group.section === "Play Yard Demand");
    const departingLabels = departingGroup.rows.map((row) => row.label);
    const labels = playGroup.rows.map((row) => row.label);
    expect(labels).not.toContain("Large Play from Departing Boarding");
    expect(labels).not.toContain("Small Play from Departing Boarding");
    expect(labels).not.toContain("Departing Boarding Pending Play Type");
    expect(departingLabels).toEqual(["Total Boarding Dogs Departing Today"]);
    expect(labels).toContain("Unassigned Departing Play");

    const pendingRow = playGroup.rows.find((row) => row.label === "Unassigned Departing Play");
    expect(getDayMatrixValue(day, pendingRow)).toBe(22);
  });

  it("hides historical comparison rows that are not populated and derives available percent cells", () => {
    const groups = buildDemandMatrixRowGroups([
      makeDay("2026-05-18", {
        comparison: {
          current_total: 18,
          yoy_total: 16,
        },
      }),
    ]);

    const historical = groups.find((group) => group.section === "Historical Comparison");
    expect(historical.rows.map((row) => row.label)).toEqual([
      "YOY Dog Volume",
      "YOY Dog Volume % of Current Year",
    ]);

    const pctRow = historical.rows.find((row) => row.label === "YOY Dog Volume % of Current Year");
    expect(getDayMatrixValue(makeDay("2026-05-18", {
      comparison: {
        current_total: 18,
        yoy_total: 16,
      },
    }), pctRow)).toBe(88.9);
  });

  it("builds historical comparison rows for every populated prior-year offset", () => {
    const groups = buildDemandMatrixRowGroups([
      makeDay("2026-05-18", {
        comparison: {
          current_total: 90,
          prior_years: [
            { year_offset: 1, total: 80, boarding_departing: 12, total_daily_volume: 92 },
            { year_offset: 2, total: 74, boarding_departing: 10, total_daily_volume: 84 },
            { year_offset: 3, total: 68, boarding_departing: 9, total_daily_volume: 77 },
          ],
          prior_year_1_total: 80,
          prior_year_1_total_daily_volume: 92,
          prior_year_1_overnight: 48,
          prior_year_1_daytime: 32,
          prior_year_1_boarding_departing: 12,
          prior_year_1_total_pct_vs_current_year: 88.9,
          prior_year_1_total_daily_volume_pct_vs_current_year: 90.2,
          prior_year_2_total: 74,
          prior_year_2_total_daily_volume: 84,
          prior_year_2_overnight: 45,
          prior_year_2_daytime: 29,
          prior_year_2_boarding_departing: 10,
          prior_year_2_total_pct_vs_current_year: 82.2,
          prior_year_2_total_daily_volume_pct_vs_current_year: 82.4,
          prior_year_3_total: 68,
          prior_year_3_total_daily_volume: 77,
          prior_year_3_overnight: 41,
          prior_year_3_daytime: 27,
          prior_year_3_boarding_departing: 9,
          prior_year_3_total_pct_vs_current_year: 75.6,
          prior_year_3_total_daily_volume_pct_vs_current_year: 75.5,
        },
      }),
    ]);

    const historical = groups.find((group) => group.section === "Historical Comparison");
    expect(historical.rows.map((row) => row.label)).toEqual([
      "YOY Dog Volume",
      "YOY Total Daily Dog Volume",
      "YOY Overnight Dogs",
      "YOY Daytime Dogs",
      "YOY Boarding Dogs Departing",
      "YOY Dog Volume % of Current Year",
      "YOY Total Daily Dog Volume % of Current Year",
      "YO2Y Dog Volume",
      "YO2Y Total Daily Dog Volume",
      "YO2Y Overnight Dogs",
      "YO2Y Daytime Dogs",
      "YO2Y Boarding Dogs Departing",
      "YO2Y Dog Volume % of Current Year",
      "YO2Y Total Daily Dog Volume % of Current Year",
      "YO3Y Dog Volume",
      "YO3Y Total Daily Dog Volume",
      "YO3Y Overnight Dogs",
      "YO3Y Daytime Dogs",
      "YO3Y Boarding Dogs Departing",
      "YO3Y Dog Volume % of Current Year",
      "YO3Y Total Daily Dog Volume % of Current Year",
    ]);
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

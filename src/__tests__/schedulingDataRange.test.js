import { describe, expect, it } from "vitest";
import {
  buildSchedulingDateRange,
  findStaleSchedulingMatrixDates,
  shouldRecomputeSchedulingMatrixRange,
} from "../hooks/useSchedulingData.js";

describe("scheduling data range helpers", () => {
  it("preserves the default seven-day range and supports longer ranges", () => {
    expect(buildSchedulingDateRange("2026-05-11")).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
    ]);
    expect(buildSchedulingDateRange("2026-05-11", "2026-05-31")).toHaveLength(21);
    expect(buildSchedulingDateRange("2019-01-01", "2025-12-31")).toHaveLength(2557);
  });

  it("flags future matrix rows whose projection as-of date is stale", () => {
    const staleDates = findStaleSchedulingMatrixDates(
      [
        {
          matrix_date: "2026-05-17",
          detail_json: { projection: { as_of_date: "2026-05-04" } },
        },
        {
          matrix_date: "2026-05-12",
          detail_json: { projection: { as_of_date: "2026-05-11", comparisons: { yoy_total: 80 } } },
        },
      ],
      ["2026-05-12", "2026-05-17"],
      "2026-05-11",
    );

    expect(staleDates).toEqual(["2026-05-17"]);
  });

  it("does not allow browser-triggered recompute for fully historical ranges", () => {
    expect(shouldRecomputeSchedulingMatrixRange(
      buildSchedulingDateRange("2025-01-01", "2025-01-07"),
      { today: "2026-05-17", recomputeLimitDays: 14 },
    )).toBe(false);

    expect(shouldRecomputeSchedulingMatrixRange(
      buildSchedulingDateRange("2026-05-11", "2026-05-17"),
      { today: "2026-05-17", recomputeLimitDays: 14 },
    )).toBe(true);

    expect(shouldRecomputeSchedulingMatrixRange(
      buildSchedulingDateRange("2026-05-17", "2026-05-31"),
      { today: "2026-05-17", recomputeLimitDays: 14 },
    )).toBe(false);
  });
});

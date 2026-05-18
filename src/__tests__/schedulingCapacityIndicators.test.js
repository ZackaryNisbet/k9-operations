import { describe, expect, it } from "vitest";
import {
  buildDayCapacityIndicators,
  getHighestCapacityStatus,
} from "../kol/scheduling/capacityIndicators";

const day = {
  matrix: {
    matrix_date: "2026-05-18",
    detail_json: {
      display: {
        opening: {
          large_boarding: 10,
          small_boarding: 5,
          private_play_boarding: 1,
          half_and_half_boarding: 2,
        },
        closing: {
          large_boarding: 15,
          small_boarding: 3,
          private_play_boarding: 2,
          half_and_half_boarding: 4,
        },
        daycare: {
          large_daycare: 25,
          small_daycare: 10,
          private_play_dayboarding: 4,
          half_and_half_daytime: 2,
        },
        support: {},
      },
    },
  },
};

describe("scheduling capacity indicators", () => {
  it("uses operating-day play demand rather than only same-night boarding", () => {
    const indicators = buildDayCapacityIndicators(day, {
      large_daycare_capacity: 40,
      small_daycare_capacity: 20,
      private_play_capacity: 10,
      split_play_capacity: 8,
    });

    const large = indicators.find((indicator) => indicator.key === "large_play");
    const split = indicators.find((indicator) => indicator.key === "split_play");

    expect(large.count).toBe(40);
    expect(large.status).toBe("over");
    expect(split.count).toBe(6);
    expect(split.text).toBe("6 / 8");
  });

  it("marks near-capacity days before they breach the cap", () => {
    const indicators = buildDayCapacityIndicators(day, {
      large_daycare_capacity: 50,
      small_daycare_capacity: 20,
      capacity_warning_threshold: 0.8,
    });

    expect(indicators.find((indicator) => indicator.key === "large_play").status).toBe("near");
    expect(getHighestCapacityStatus(indicators)).toBe("near");
  });
});

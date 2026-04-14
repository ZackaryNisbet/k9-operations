import { describe, expect, it } from "vitest";
import {
  buildRotationSchedulePayload,
  normalizeRotationConfig,
} from "../../supabase/functions/_shared/rotation-schedule.ts";

function makeMatrix(overrides = {}) {
  return {
    matrix_date: "2026-04-14",
    location_id: "cherry_hill",
    boarding_large: 14,
    boarding_small: 10,
    boarding_unknown_size: 1,
    daycare_large: 24,
    daycare_small: 12,
    daycare_unknown_size: 0,
    pp_dayboarders: 2,
    pp_overnight_boarders: 3,
    departure_baths: 7,
    evaluations: 1,
    tours: 0,
    gross_dogs_in_building: 62,
    feeding_dogs: 18,
    medication_dogs: 4,
    dogs_arriving: 8,
    dogs_departing: 6,
    detail_json: {
      projection: {
        state: "projected",
        lead_days: 7,
        explanations: {
          support_total_dog_volume: {
            lead_days: 7,
            exact_prior_year_as_of: 83,
            exact_prior_year_final: 97,
          },
        },
        display: {
          opening: {
            large_boarding: 16,
            small_boarding: 11,
            private_play_boarding: 3,
            half_and_half_boarding: 1,
            evaluation_boarding: 1,
            unclassified_boarding: 1,
            total_boarding: 33,
          },
          closing: {
            large_boarding: 16,
            small_boarding: 11,
            private_play_boarding: 3,
            half_and_half_boarding: 1,
            evaluation_boarding: 1,
            unclassified_boarding: 1,
            total_boarding: 33,
          },
          daycare: {
            evaluations: 2,
            private_play_dayboarding: 2,
            half_and_half_daytime: 1,
            large_daycare: 24,
            small_daycare: 12,
            unclassified_daycare: 0,
            total_daycare: 41,
          },
          support: {
            departure_baths: 7,
            morning_feeding_dogs: 33,
            evening_feeding_dogs: 18,
            medication_dogs: 4,
            total_dog_volume: 74,
            tours: 0,
          },
        },
      },
    },
    computed_at: "2026-04-14T12:00:00Z",
    ...overrides,
  };
}

describe("buildRotationSchedulePayload", () => {
  it("builds an optimal weekday schedule with mixed slot sizes", () => {
    const payload = buildRotationSchedulePayload({
      matrix: makeMatrix(),
      config: normalizeRotationConfig({}),
      mode: "optimal",
    });

    expect(payload.schedule_kind).toBe("optimal");
    expect(payload.shift_recommendations.opening_shift.headcount).toBeGreaterThan(0);
    expect(payload.shift_recommendations.closing_shift.headcount).toBeGreaterThan(0);
    expect(payload.workload_breakdown.length).toBeGreaterThanOrEqual(7);

    const firstSlots = payload.grid.slots.slice(0, 6);
    expect(firstSlots.every((slot) => slot.interval_minutes === 10)).toBe(true);
    expect(payload.grid.slots.some((slot) => slot.time === "19:00")).toBe(true);
    expect(payload.grid.slots[payload.grid.slots.length - 1].time).toBe("19:00");
  });

  it("uses staff_names for actual staffing and keeps csr/mod lanes visible", () => {
    const payload = buildRotationSchedulePayload({
      matrix: makeMatrix(),
      config: normalizeRotationConfig({}),
      mode: "actual_staffing",
      staffPlan: {
        staff_names: [
          { position: "pct", name: "Samara", shift_start: "06:00", shift_end: "13:00" },
          { position: "pct", name: "Gianna", shift_start: "06:00", shift_end: "13:00" },
          { position: "csr", name: "Front Desk", shift_start: "06:00", shift_end: "13:00" },
          { position: "mod", name: "Zack", shift_start: "07:00", shift_end: "13:00" },
        ],
      },
    });

    expect(payload.schedule_kind).toBe("actual_staffing");
    expect(payload.grid.lanes.some((lane) => lane.position === "csr")).toBe(true);
    expect(payload.grid.lanes.some((lane) => lane.position === "mod")).toBe(true);
    expect(payload.saveable_payload.staff_input.staff_names).toHaveLength(4);
  });

  it("surfaces unresolved dogs as warnings, not blockers", () => {
    const payload = buildRotationSchedulePayload({
      matrix: makeMatrix({ boarding_unknown_size: 2 }),
      config: normalizeRotationConfig({}),
      mode: "optimal",
    });

    expect(payload.warnings.some((warning) => warning.includes("warning, not a hard blocker"))).toBe(true);
  });
});

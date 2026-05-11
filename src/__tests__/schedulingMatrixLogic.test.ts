import { describe, it, expect, vi } from "vitest";
import {
  annotateReservationsWithOperationalHistory,
  applyGingrWidgetSourceCountsToDisplay,
  buildBlockerDetails,
  buildGingrWidgetSourceCountsByDate,
  buildProjectionForDate,
  buildWeeklyPaceCalibration,
  buildReservationTypeMaps,
  buildTrustPayload,
  computeDemandSnapshotForDate,
  normalizeGingrReservationWidgetPayload,
  upsertSchedulingProjectionSnapshots,
} from "../../supabase/functions/_shared/scheduling-matrix.ts";

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    gingr_id: String(overrides.gingr_id || `res-${Math.random()}`),
    animal_gingr_id: String(overrides.animal_gingr_id || overrides.animalId || `animal-${Math.random()}`),
    animalId: String(overrides.animalId || overrides.animal_gingr_id || `animal-${Math.random()}`),
    animal_name: String(overrides.animal_name || "Dog"),
    reservation_type_name: String(overrides.reservation_type_name || "Daycare"),
    cls: overrides.cls || "daycare",
    startKey: String(overrides.startKey || "2026-04-20"),
    endKey: String(overrides.endKey || "2026-04-20"),
    bookedDateKey: String(overrides.bookedDateKey || "2026-04-01"),
    check_in_date: overrides.check_in_date == null ? null : String(overrides.check_in_date),
    check_out_date: overrides.check_out_date == null ? null : String(overrides.check_out_date),
    playgroup: overrides.playgroup || "large",
    isHalfAndHalf: Boolean(overrides.isHalfAndHalf || false),
    unresolvedPlaygroupReason: overrides.unresolvedPlaygroupReason || null,
    playgroupAssignment: overrides.playgroupAssignment || null,
    services: Array.isArray(overrides.services) ? overrides.services : [],
    isFirstEverDaycareVisit: Boolean(overrides.isFirstEverDaycareVisit || false),
  };
}

function makeReservationsForDate({
  prefix,
  date,
  count,
  bookedDateKey,
  cls = "daycare",
}: {
  prefix: string;
  date: string;
  count: number;
  bookedDateKey: string;
  cls?: string;
}) {
  return Array.from({ length: count }, (_, index) =>
    makeReservation({
      gingr_id: `${prefix}-${date}-${index}`,
      animalId: `${prefix}-dog-${date}-${index}`,
      animal_gingr_id: `${prefix}-dog-${date}-${index}`,
      cls,
      startKey: date,
      endKey: date,
      playgroup: "large",
      bookedDateKey,
    }),
  );
}

function fromSupabaseMock(from: any) {
  return { from } as any;
}

describe("scheduling matrix logic", () => {
  it("normalizes GINGR Calendar Details widget totals and derives opening boarding from source counts", () => {
    const widgetRow = normalizeGingrReservationWidgetPayload({
      locationId: "ch",
      widgetDate: "2026-04-27",
      payload: {
        data: {
          totals: {
            check_in_total: 22,
            check_out_total: 37,
            active_total: 59,
          },
          per_type: {
            "Daycare | Full Day": { check_ins: 16, check_outs: 16, active: 16 },
            "Boarding | Executive Room (All Inclusive)": { check_ins: 2, check_outs: 11, active: 24 },
            "Boarding | Single Compartment (All Inclusive)": { check_ins: 1, check_outs: 3, active: 8 },
            "Boarding | Double Compartment (All Inclusive)": { check_ins: 0, check_outs: 2, active: 4 },
            "Day Boarding": { check_ins: 3, check_outs: 3, active: 3 },
            "Boarding | Luxury Suite (All Inclusive)": { check_ins: 0, check_outs: 2, active: 4 },
          },
        },
      },
    });
    const sourceByDate = buildGingrWidgetSourceCountsByDate(
      [widgetRow],
      buildReservationTypeMaps([]),
    );
    const source = sourceByDate.get("2026-04-27");

    expect(widgetRow.check_in_total).toBe(22);
    expect(widgetRow.check_out_total).toBe(37);
    expect(widgetRow.overnight_total).toBe(22);
    expect(widgetRow.total_reservation_volume).toBe(59);
    expect(source?.boarding.check_ins).toBe(3);
    expect(source?.boarding.check_outs).toBe(18);
    expect(source?.boarding.overnight).toBe(22);
    expect(source?.boarding.opening).toBe(37);
    expect(source?.daytime.total).toBe(19);
  });

  it("uses GINGR widget source totals for displayed top-line matrix counts", () => {
    const widgetRow = normalizeGingrReservationWidgetPayload({
      locationId: "ch",
      widgetDate: "2026-04-27",
      payload: {
        data: {
          totals: { check_in_total: 22, check_out_total: 37, active_total: 59 },
          per_type: {
            "Daycare | Full Day": { check_ins: 16, check_outs: 16, active: 16 },
            "Boarding | Executive Room (All Inclusive)": { check_ins: 2, check_outs: 11, active: 24 },
            "Boarding | Single Compartment (All Inclusive)": { check_ins: 1, check_outs: 3, active: 8 },
            "Boarding | Double Compartment (All Inclusive)": { check_ins: 0, check_outs: 2, active: 4 },
            "Day Boarding": { check_ins: 3, check_outs: 3, active: 3 },
            "Boarding | Luxury Suite (All Inclusive)": { check_ins: 0, check_outs: 2, active: 4 },
          },
        },
      },
    });
    const source = buildGingrWidgetSourceCountsByDate([widgetRow], buildReservationTypeMaps([])).get("2026-04-27");
    const adjustment = applyGingrWidgetSourceCountsToDisplay({
      opening: {
        large_boarding: 4,
        small_boarding: 0,
        private_play_boarding: 0,
        half_and_half_boarding: 0,
        evaluation_boarding: 0,
        unclassified_boarding: 0,
        total_boarding: 4,
      },
      closing: {
        large_boarding: 12,
        small_boarding: 7,
        private_play_boarding: 3,
        half_and_half_boarding: 0,
        evaluation_boarding: 0,
        unclassified_boarding: 0,
        total_boarding: 22,
      },
      daycare: {
        evaluations: 2,
        private_play_dayboarding: 3,
        half_and_half_daytime: 1,
        large_daycare: 12,
        small_daycare: 3,
        unclassified_daycare: 0,
        total_daycare: 21,
      },
      support: {
        departure_baths: 0,
        morning_feeding_dogs: 4,
        evening_feeding_dogs: 22,
        medication_dogs: 0,
        tours: 0,
        total_dog_volume: 43,
      },
      play_yard: {
        large_play_dogs: 24,
        small_play_dogs: 10,
        private_play_dogs: 6,
        split_play_dogs: 1,
      },
    }, source);

    expect(adjustment.display.opening.total_boarding).toBe(37);
    expect(adjustment.display.closing.total_boarding).toBe(22);
    expect(adjustment.display.daycare.total_daycare).toBe(19);
    expect(adjustment.display.support.total_dog_volume).toBe(59);
    expect(adjustment.display.source.check_ins).toBe(22);
    expect(adjustment.reconciliation?.deltas.opening_boarding).toBe(33);
    expect(adjustment.reconciliation?.deltas.daytime_total).toBe(-2);
    expect(adjustment.reconciliation?.deltas.total_dog_volume).toBe(16);
  });

  it("treats first-ever daycare visits as evaluations instead of standard daycare", () => {
    const baseRows = [
      makeReservation({
        gingr_id: "eval-1",
        animalId: "dog-1",
        animal_gingr_id: "dog-1",
        cls: "daycare",
        startKey: "2026-04-20",
        endKey: "2026-04-20",
        playgroup: "large",
      }),
      makeReservation({
        gingr_id: "daycare-2",
        animalId: "dog-2",
        animal_gingr_id: "dog-2",
        cls: "daycare",
        startKey: "2026-04-20",
        endKey: "2026-04-20",
        playgroup: "small",
      }),
    ];

    const reservations = annotateReservationsWithOperationalHistory(
      baseRows,
      new Map([
        ["dog-1", "2026-04-20"],
        ["dog-2", "2026-04-10"],
      ]),
    );

    const snapshot = computeDemandSnapshotForDate({
      targetDate: "2026-04-20",
      reservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(snapshot.display.daycare.evaluations).toBe(1);
    expect(snapshot.display.daycare.large_daycare).toBe(0);
    expect(snapshot.display.daycare.small_daycare).toBe(1);
  });

  it("counts evaluation-only boarders as evaluation boarding on day 1 and unresolved after", () => {
    const reservations = [
      makeReservation({
        gingr_id: "board-1",
        animalId: "dog-3",
        animal_gingr_id: "dog-3",
        cls: "boarding",
        startKey: "2026-04-20",
        endKey: "2026-04-22",
        check_in_date: "2026-04-20T08:00:00-04:00",
        playgroup: "unknown",
        unresolvedPlaygroupReason: "evaluation_only",
      }),
    ];

    const dayOne = computeDemandSnapshotForDate({
      targetDate: "2026-04-20",
      reservations,
      roomByDate: {},
      totalRooms: 0,
    });
    const dayTwo = computeDemandSnapshotForDate({
      targetDate: "2026-04-21",
      reservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(dayOne.display.closing.evaluation_boarding).toBe(1);
    expect(dayOne.display.closing.unclassified_boarding).toBe(0);
    expect(dayTwo.display.opening.evaluation_boarding).toBe(0);
    expect(dayTwo.display.opening.unclassified_boarding).toBe(1);
    expect(dayTwo.display.closing.unclassified_boarding).toBe(1);

    const blockerDetails = buildBlockerDetails(dayTwo.openingBoarding, "2026-04-21", "opening_boarding");
    const trust = buildTrustPayload({ blockerDetails, roomCountsEstimated: false });
    expect(trust.can_generate).toBe(false);
    expect(trust.blockers[0]).toContain("evaluation boarder");
    expect(trust.blockers[0]).toContain("opening boarding");
  });

  it("projects using exact prior year completion first when available", () => {
    const currentReservations = Array.from({ length: 8 }, (_, index) =>
      makeReservation({
        gingr_id: `current-${index}`,
        animalId: `current-dog-${index}`,
        animal_gingr_id: `current-dog-${index}`,
        cls: "daycare",
        startKey: "2026-04-20",
        endKey: "2026-04-20",
        playgroup: "large",
        bookedDateKey: "2026-04-09",
      }),
    );
    const currentSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-04-20",
      reservations: currentReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    const historicalReservations = [
      ...Array.from({ length: 5 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-early-${index}`,
          animalId: `hist-early-dog-${index}`,
          animal_gingr_id: `hist-early-dog-${index}`,
          cls: "daycare",
          startKey: "2025-04-20",
          endKey: "2025-04-20",
          playgroup: "large",
          bookedDateKey: "2025-04-08",
        }),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-late-${index}`,
          animalId: `hist-late-dog-${index}`,
          animal_gingr_id: `hist-late-dog-${index}`,
          cls: "daycare",
          startKey: "2025-04-20",
          endKey: "2025-04-20",
          playgroup: "large",
          bookedDateKey: "2025-04-15",
        }),
      ),
    ];

    const projection = buildProjectionForDate({
      targetDate: "2026-04-20",
      currentDate: "2026-04-10",
      currentSnapshot,
      historicalReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(projection.display.support.total_dog_volume).toBe(16);
    expect(projection.explanations.support_total_dog_volume.exact_prior_year_as_of).toBe(5);
    expect(projection.explanations.support_total_dog_volume.exact_prior_year_final).toBe(10);
    expect(projection.explanations.support_total_dog_volume.fallback_mode).toBe("exact_prior_year");
  });

  it("blends exact prior-year date with same-weekday comparables when weekdays differ", () => {
    const currentReservations = Array.from({ length: 10 }, (_, index) =>
      makeReservation({
        gingr_id: `current-dow-${index}`,
        animalId: `current-dow-dog-${index}`,
        animal_gingr_id: `current-dow-dog-${index}`,
        cls: "daycare",
        startKey: "2026-05-13",
        endKey: "2026-05-13",
        playgroup: "large",
        bookedDateKey: "2026-05-01",
      }),
    );
    const currentSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-05-13",
      reservations: currentReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    const historicalReservations = [
      ...Array.from({ length: 5 }, (_, index) =>
        makeReservation({
          gingr_id: `exact-early-${index}`,
          animalId: `exact-early-dog-${index}`,
          animal_gingr_id: `exact-early-dog-${index}`,
          cls: "daycare",
          startKey: "2025-05-13",
          endKey: "2025-05-13",
          playgroup: "large",
          bookedDateKey: "2025-05-05",
        }),
      ),
      ...Array.from({ length: 15 }, (_, index) =>
        makeReservation({
          gingr_id: `exact-late-${index}`,
          animalId: `exact-late-dog-${index}`,
          animal_gingr_id: `exact-late-dog-${index}`,
          cls: "daycare",
          startKey: "2025-05-13",
          endKey: "2025-05-13",
          playgroup: "large",
          bookedDateKey: "2025-05-09",
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        makeReservation({
          gingr_id: `weekday-early-${index}`,
          animalId: `weekday-early-dog-${index}`,
          animal_gingr_id: `weekday-early-dog-${index}`,
          cls: "daycare",
          startKey: "2025-05-14",
          endKey: "2025-05-14",
          playgroup: "large",
          bookedDateKey: "2025-05-06",
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        makeReservation({
          gingr_id: `weekday-late-${index}`,
          animalId: `weekday-late-dog-${index}`,
          animal_gingr_id: `weekday-late-dog-${index}`,
          cls: "daycare",
          startKey: "2025-05-14",
          endKey: "2025-05-14",
          playgroup: "large",
          bookedDateKey: "2025-05-10",
        }),
      ),
    ];

    const projection = buildProjectionForDate({
      targetDate: "2026-05-13",
      currentDate: "2026-05-05",
      currentSnapshot,
      historicalReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(projection.explanations.support_total_dog_volume.fallback_mode).toBe("weighted_comparable_blend");
    expect(projection.display.support.total_dog_volume).toBeGreaterThan(20);
    expect(projection.display.support.total_dog_volume).toBeLessThan(30);
    expect(projection.explanations.support_total_dog_volume.sample_modes.same_weekday_prior_year).toBe(1);
  });

  it("applies recent YOY pickup calibration when completed days are picking up slower than last year", () => {
    const currentReservations = Array.from({ length: 20 }, (_, index) =>
      makeReservation({
        gingr_id: `target-current-${index}`,
        animalId: `target-current-dog-${index}`,
        animal_gingr_id: `target-current-dog-${index}`,
        cls: "daycare",
        startKey: "2026-06-10",
        endKey: "2026-06-10",
        playgroup: "large",
        bookedDateKey: "2026-06-01",
      }),
    );
    const currentSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-06-10",
      reservations: currentReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    const historicalReservations = [
      ...Array.from({ length: 20 }, (_, index) =>
        makeReservation({
          gingr_id: `target-hist-early-${index}`,
          animalId: `target-hist-early-dog-${index}`,
          animal_gingr_id: `target-hist-early-dog-${index}`,
          cls: "daycare",
          startKey: "2025-06-10",
          endKey: "2025-06-10",
          playgroup: "large",
          bookedDateKey: "2025-06-02",
        }),
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        makeReservation({
          gingr_id: `target-hist-late-${index}`,
          animalId: `target-hist-late-dog-${index}`,
          animal_gingr_id: `target-hist-late-dog-${index}`,
          cls: "daycare",
          startKey: "2025-06-10",
          endKey: "2025-06-10",
          playgroup: "large",
          bookedDateKey: "2025-06-06",
        }),
      ),
    ];
    const sampleDates = ["2026-05-28", "2026-05-29", "2026-05-30"];
    const calibrationReservations = sampleDates.flatMap((sampleDate, sampleIndex) => [
      ...Array.from({ length: 30 }, (_, index) =>
        makeReservation({
          gingr_id: `cal-current-early-${sampleIndex}-${index}`,
          animalId: `cal-current-early-dog-${sampleIndex}-${index}`,
          animal_gingr_id: `cal-current-early-dog-${sampleIndex}-${index}`,
          cls: "daycare",
          startKey: sampleDate,
          endKey: sampleDate,
          playgroup: "large",
          bookedDateKey: "2026-05-20",
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        makeReservation({
          gingr_id: `cal-current-late-${sampleIndex}-${index}`,
          animalId: `cal-current-late-dog-${sampleIndex}-${index}`,
          animal_gingr_id: `cal-current-late-dog-${sampleIndex}-${index}`,
          cls: "daycare",
          startKey: sampleDate,
          endKey: sampleDate,
          playgroup: "large",
          bookedDateKey: "2026-05-25",
        }),
      ),
    ]);
    const calibrationHistoricalReservations = sampleDates.flatMap((sampleDate, sampleIndex) => {
      const priorDate = sampleDate.replace("2026", "2025");
      return [
        ...Array.from({ length: 20 }, (_, index) =>
          makeReservation({
            gingr_id: `cal-hist-early-${sampleIndex}-${index}`,
            animalId: `cal-hist-early-dog-${sampleIndex}-${index}`,
            animal_gingr_id: `cal-hist-early-dog-${sampleIndex}-${index}`,
            cls: "daycare",
            startKey: priorDate,
            endKey: priorDate,
            playgroup: "large",
            bookedDateKey: "2025-05-20",
          }),
        ),
        ...Array.from({ length: 20 }, (_, index) =>
          makeReservation({
            gingr_id: `cal-hist-late-${sampleIndex}-${index}`,
            animalId: `cal-hist-late-dog-${sampleIndex}-${index}`,
            animal_gingr_id: `cal-hist-late-dog-${sampleIndex}-${index}`,
            cls: "daycare",
            startKey: priorDate,
            endKey: priorDate,
            playgroup: "large",
            bookedDateKey: "2025-05-25",
          }),
        ),
      ];
    });

    const projection = buildProjectionForDate({
      targetDate: "2026-06-10",
      currentDate: "2026-06-02",
      currentSnapshot,
      historicalReservations,
      calibrationReservations,
      calibrationHistoricalReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(projection.explanations.support_total_dog_volume.raw_projected_value).toBe(40);
    expect(projection.explanations.support_total_dog_volume.yoy_adjustment_factor).toBe(0.75);
    expect(projection.display.support.total_dog_volume).toBe(30);
    expect(projection.calibration.yoy_pickup.sample_count).toBe(3);
  });

  it("calibrates a visible week projection against last-year week volume and recent completed week pace", () => {
    const targetDates = [
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
    ];
    const priorDates = targetDates.map((date) => date.replace("2026", "2025"));
    const priorFinalCounts = [80, 88, 90, 92, 91, 88, 89];
    const priorAsOfCounts = [50, 55, 58, 60, 60, 58, 59];
    const rawProjectionCounts = [120, 125, 128, 130, 132, 132, 132];

    const historicalReservations = priorDates.flatMap((date, dateIndex) => [
      ...makeReservationsForDate({
        prefix: "prior-early",
        date,
        count: priorAsOfCounts[dateIndex],
        bookedDateKey: "2025-05-01",
      }),
      ...makeReservationsForDate({
        prefix: "prior-late",
        date,
        count: priorFinalCounts[dateIndex] - priorAsOfCounts[dateIndex],
        bookedDateKey: "2025-05-09",
      }),
    ]);
    const currentDisplaysByDate = Object.fromEntries(targetDates.map((date, index) => [
      date,
      { support: { total_dog_volume: priorAsOfCounts[index] } },
    ]));
    const firstPassProjectionsByDate = Object.fromEntries(targetDates.map((date, index) => [
      date,
      { demand_display: { support: { total_dog_volume: rawProjectionCounts[index] } } },
    ]));

    const completedWeekDates = [
      "2026-04-27",
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-04-20",
      "2026-04-21",
      "2026-04-22",
      "2026-04-23",
      "2026-04-24",
      "2026-04-25",
      "2026-04-26",
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
      "2026-04-18",
      "2026-04-19",
    ];
    const calibrationReservations = completedWeekDates.flatMap((date) =>
      makeReservationsForDate({
        prefix: "cal-current",
        date,
        count: 10,
        bookedDateKey: "2026-04-01",
      }),
    );
    const calibrationHistoricalReservations = completedWeekDates.flatMap((date) =>
      makeReservationsForDate({
        prefix: "cal-prior",
        date: date.replace("2026", "2025"),
        count: 10,
        bookedDateKey: "2025-04-01",
      }),
    );

    const calibration = buildWeeklyPaceCalibration({
      targetDates,
      currentDate: "2026-05-04",
      currentDisplaysByDate,
      firstPassProjectionsByDate,
      historicalReservations,
      calibrationReservations,
      calibrationHistoricalReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(calibration.raw_week_projected).toBe(899);
    expect(calibration.prior_year_week_final).toBe(618);
    expect(calibration.prior_year_week_as_of).toBe(400);
    expect(calibration.current_week_booked).toBe(400);
    expect(calibration.recent_completed_week_yoy_factor).toBe(1);
    expect(calibration.weekly_target).toBe(618);
    expect(calibration.factor).toBeCloseTo(618 / 899, 4);
    expect(calibration.confidence).toBe("high");
  });

  it("exposes practical boarding and play-yard capacity risk without hiding demand", () => {
    const reservations = Array.from({ length: 90 }, (_, index) =>
      makeReservation({
        gingr_id: `capacity-boarder-${index}`,
        animalId: `capacity-boarder-dog-${index}`,
        animal_gingr_id: `capacity-boarder-dog-${index}`,
        cls: "boarding",
        startKey: "2026-07-01",
        endKey: "2026-07-02",
        playgroup: "large",
        bookedDateKey: "2026-06-20",
      }),
    );
    const snapshot = computeDemandSnapshotForDate({
      targetDate: "2026-07-01",
      reservations,
      roomByDate: {},
      totalRooms: 70,
    });

    const projection = buildProjectionForDate({
      targetDate: "2026-07-01",
      currentDate: "2026-07-01",
      currentSnapshot: snapshot,
      historicalReservations: [],
      roomByDate: {},
      totalRooms: 70,
      capacityConfig: {
        multiDogFactor: 1.25,
        practicalBoardingDogCapacity: 87.5,
        theoreticalBoardingDogCapacity: 171,
        largeDaycareCapacity: 50,
        smallDaycareCapacity: 36,
        groupPlayCapacity: 86,
      },
    });

    expect(projection.capacity.has_capacity_risk).toBe(true);
    expect(projection.capacity.overnight_rooms.practical_dog_capacity).toBe(87.5);
    expect(projection.capacity.unconstrained_forecast.boarding_dogs).toBe(90);
    expect(projection.capacity.constraints.find((c: any) => c.key === "large_play").overflow).toBe(40);
    expect(projection.display.support.total_dog_volume).toBe(90);
  });

  it("applies capacity constraints to future achievable projections while preserving unconstrained demand", () => {
    const currentReservations = Array.from({ length: 60 }, (_, index) =>
      makeReservation({
        gingr_id: `future-capacity-current-${index}`,
        animalId: `future-capacity-current-dog-${index}`,
        animal_gingr_id: `future-capacity-current-dog-${index}`,
        cls: "boarding",
        startKey: "2026-07-10",
        endKey: "2026-07-11",
        playgroup: "large",
        bookedDateKey: "2026-07-01",
      }),
    );
    const currentSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-07-10",
      reservations: currentReservations,
      roomByDate: {},
      totalRooms: 70,
    });

    const historicalReservations = [
      ...Array.from({ length: 60 }, (_, index) =>
        makeReservation({
          gingr_id: `future-capacity-hist-early-${index}`,
          animalId: `future-capacity-hist-early-dog-${index}`,
          animal_gingr_id: `future-capacity-hist-early-dog-${index}`,
          cls: "boarding",
          startKey: "2025-07-10",
          endKey: "2025-07-11",
          playgroup: "large",
          bookedDateKey: "2025-07-01",
        }),
      ),
      ...Array.from({ length: 30 }, (_, index) =>
        makeReservation({
          gingr_id: `future-capacity-hist-late-${index}`,
          animalId: `future-capacity-hist-late-dog-${index}`,
          animal_gingr_id: `future-capacity-hist-late-dog-${index}`,
          cls: "boarding",
          startKey: "2025-07-10",
          endKey: "2025-07-11",
          playgroup: "large",
          bookedDateKey: "2025-07-06",
        }),
      ),
    ];

    const projection = buildProjectionForDate({
      targetDate: "2026-07-10",
      currentDate: "2026-07-03",
      currentSnapshot,
      historicalReservations,
      roomByDate: {},
      totalRooms: 70,
      capacityConfig: {
        multiDogFactor: 1.25,
        practicalBoardingDogCapacity: 87.5,
        theoreticalBoardingDogCapacity: 171,
        largeDaycareCapacity: 50,
        smallDaycareCapacity: 36,
        groupPlayCapacity: 86,
      },
    });

    expect(projection.demand_display.support.total_dog_volume).toBe(90);
    expect(projection.display.support.total_dog_volume).toBe(50);
    expect(projection.display.play_yard.large_play_dogs).toBe(50);
    expect(projection.capacity.has_capacity_constrained_projection).toBe(true);
    expect(projection.capacity.demand_forecast.boarding_dogs).toBe(90);
    expect(projection.capacity.achievable_forecast.boarding_dogs).toBe(50);
    expect(projection.explanations.support_total_dog_volume.unconstrained_projected_value).toBe(90);
    expect(projection.explanations.support_total_dog_volume.capacity_constrained_value).toBe(50);
  });

  it("stores projection snapshots and actualizes prior target-date history", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn();
    let updateEqCount = 0;
    const updateChain = {
      eq: updateEq,
    };
    updateEq.mockImplementation(() => {
      updateEqCount += 1;
      return updateEqCount >= 2 ? Promise.resolve({ error: null }) : updateChain;
    });
    const update = vi.fn(() => updateChain);
    const from = vi.fn(() => ({ upsert, update }));

    const projectedDisplay = {
      opening: { total_boarding: 8 },
      closing: { total_boarding: 10 },
      play_yard: { large_play_dogs: 12, small_play_dogs: 4 },
      support: { total_dog_volume: 25 },
    };
    const actualDisplay = {
      opening: { total_boarding: 9 },
      closing: { total_boarding: 11 },
      play_yard: { large_play_dogs: 13, small_play_dogs: 5 },
      support: { total_dog_volume: 28 },
    };

    const result = await upsertSchedulingProjectionSnapshots(fromSupabaseMock(from), [
      {
        location_id: "cherry-hill",
        matrix_date: "2026-07-10",
        computed_at: "2026-07-03T12:00:00.000Z",
        detail_json: {
          display: {
            opening: { total_boarding: 6 },
            closing: { total_boarding: 6 },
            play_yard: { large_play_dogs: 7, small_play_dogs: 2 },
            support: { total_dog_volume: 14 },
          },
          projection: {
            as_of_date: "2026-07-03",
            lead_days: 7,
            state: "projected",
            model_version: "booking_curve_v2_dow_yoy_capacity",
            display: projectedDisplay,
            capacity: { has_capacity_risk: false },
          },
        },
      },
      {
        location_id: "cherry-hill",
        matrix_date: "2026-07-10",
        computed_at: "2026-07-10T12:00:00.000Z",
        detail_json: {
          display: actualDisplay,
          projection: {
            as_of_date: "2026-07-10",
            lead_days: 0,
            state: "actual",
            model_version: "booking_curve_v2_dow_yoy_capacity",
            display: actualDisplay,
            capacity: { has_capacity_risk: true },
          },
        },
      },
    ]);

    expect(result.count).toBe(2);
    expect(from).toHaveBeenCalledWith("scheduling_projection_snapshots");
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          location_id: "cherry-hill",
          target_date: "2026-07-10",
          as_of_date: "2026-07-03",
          lead_days: 7,
          projected_display: projectedDisplay,
          capacity_json: { has_capacity_risk: false },
        }),
        expect.objectContaining({
          location_id: "cherry-hill",
          target_date: "2026-07-10",
          as_of_date: "2026-07-10",
          lead_days: 0,
          actual_display: actualDisplay,
          capacity_json: { has_capacity_risk: true },
        }),
      ]),
      { onConflict: "location_id,target_date,as_of_date,model_version" },
    );
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ actual_display: actualDisplay }));
    expect(updateEq).toHaveBeenCalledWith("location_id", "cherry-hill");
    expect(updateEq).toHaveBeenCalledWith("target_date", "2026-07-10");
  });

  it("projects source-backed top-line counts as current divided by total dog completion rate", () => {
    const baseSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-04-27",
      reservations: [],
      roomByDate: {},
      totalRooms: 0,
    });
    const adjusted = applyGingrWidgetSourceCountsToDisplay(baseSnapshot.display, {
      date: "2026-04-27",
      check_ins: 22,
      check_outs: 37,
      overnight: 22,
      total: 59,
      boarding: { check_ins: 3, check_outs: 18, overnight: 22, opening: 37, total: 40 },
      daytime: { check_ins: 19, check_outs: 19, overnight: 0, total: 19 },
      other: { check_ins: 0, check_outs: 0, overnight: 0, total: 0 },
      per_type: [],
      synced_at: null,
    });

    const historicalReservations = [
      ...Array.from({ length: 33 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-early-${index}`,
          animalId: `hist-early-dog-${index}`,
          animal_gingr_id: `hist-early-dog-${index}`,
          cls: "daycare",
          startKey: "2025-04-27",
          endKey: "2025-04-27",
          playgroup: "large",
          bookedDateKey: "2025-04-20",
        }),
      ),
      ...Array.from({ length: 11 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-late-${index}`,
          animalId: `hist-late-dog-${index}`,
          animal_gingr_id: `hist-late-dog-${index}`,
          cls: "daycare",
          startKey: "2025-04-27",
          endKey: "2025-04-27",
          playgroup: "large",
          bookedDateKey: "2025-04-24",
        }),
      ),
    ];

    const projection = buildProjectionForDate({
      targetDate: "2026-04-27",
      currentDate: "2026-04-22",
      currentSnapshot: { ...baseSnapshot, display: adjusted.display },
      historicalReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(projection.explanations.support_total_dog_volume.completion_rate).toBe(0.75);
    expect(projection.display.opening.total_boarding).toBe(49);
    expect(projection.display.closing.total_boarding).toBe(29);
    expect(projection.display.daycare.total_daycare).toBe(25);
    expect(projection.display.support.total_dog_volume).toBe(79);
    expect(projection.explanations.opening_total_boarding.completion_basis).toBe("support_total_dog_volume");
  });

  it("uses total dog completion rate for baths so sparse bath history cannot triple the count", () => {
    const currentReservations = Array.from({ length: 49 }, (_, index) =>
      makeReservation({
        gingr_id: `current-dog-${index}`,
        animalId: `current-dog-${index}`,
        animal_gingr_id: `current-dog-${index}`,
        cls: "daycare",
        startKey: "2026-05-03",
        endKey: "2026-05-03",
        playgroup: "large",
        bookedDateKey: "2026-04-20",
        services: index < 21 ? [{ name: "Bath", scheduled_at: "2026-05-03T09:00:00-04:00" }] : [],
      }),
    );
    const currentSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-05-03",
      reservations: currentReservations,
      roomByDate: {},
      totalRooms: 0,
    });
    currentSnapshot.display.support.departure_baths = 21;

    const historicalReservations = [
      ...Array.from({ length: 61 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-early-${index}`,
          animalId: `hist-early-dog-${index}`,
          animal_gingr_id: `hist-early-dog-${index}`,
          cls: "daycare",
          startKey: "2025-05-03",
          endKey: "2025-05-03",
          playgroup: "large",
          bookedDateKey: "2025-04-20",
        }),
      ),
      ...Array.from({ length: 33 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-late-${index}`,
          animalId: `hist-late-dog-${index}`,
          animal_gingr_id: `hist-late-dog-${index}`,
          cls: "daycare",
          startKey: "2025-05-03",
          endKey: "2025-05-03",
          playgroup: "large",
          bookedDateKey: "2025-04-25",
        }),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-bath-early-${index}`,
          animalId: `hist-bath-early-dog-${index}`,
          animal_gingr_id: `hist-bath-early-dog-${index}`,
          cls: "boarding",
          startKey: "2025-05-02",
          endKey: "2025-05-03",
          playgroup: "large",
          bookedDateKey: "2025-04-20",
        }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-bath-late-${index}`,
          animalId: `hist-bath-late-dog-${index}`,
          animal_gingr_id: `hist-bath-late-dog-${index}`,
          cls: "boarding",
          startKey: "2025-05-02",
          endKey: "2025-05-03",
          playgroup: "large",
          bookedDateKey: "2025-04-25",
        }),
      ),
    ];

    const projection = buildProjectionForDate({
      targetDate: "2026-05-03",
      currentDate: "2026-04-22",
      currentSnapshot,
      historicalReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(projection.display.support.departure_baths).toBe(32);
    expect(projection.explanations.support_departure_baths.exact_prior_year_as_of).toBe(2);
    expect(projection.explanations.support_departure_baths.exact_prior_year_final).toBe(6);
    expect(projection.explanations.support_departure_baths.completion_rate).toBe(0.6489);
    expect(projection.explanations.support_departure_baths.completion_basis).toBe("support_total_dog_volume");
  });

  it("keeps direct projected dog volume separate from projected playgroup components", () => {
    const currentReservations = Array.from({ length: 10 }, (_, index) =>
      makeReservation({
        gingr_id: `current-boarding-${index}`,
        animalId: `current-boarding-dog-${index}`,
        animal_gingr_id: `current-boarding-dog-${index}`,
        cls: "boarding",
        startKey: "2026-04-20",
        endKey: "2026-04-21",
        playgroup: "large",
        bookedDateKey: "2026-04-09",
      }),
    );
    const currentSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-04-20",
      reservations: currentReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    const historicalReservations = [
      ...Array.from({ length: 10 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-boarding-${index}`,
          animalId: `hist-boarding-dog-${index}`,
          animal_gingr_id: `hist-boarding-dog-${index}`,
          cls: "boarding",
          startKey: "2025-04-20",
          endKey: "2025-04-21",
          playgroup: "large",
          bookedDateKey: "2025-04-01",
        }),
      ),
      makeReservation({
        gingr_id: "hist-daycare-early",
        animalId: "hist-daycare-dog-early",
        animal_gingr_id: "hist-daycare-dog-early",
        cls: "daycare",
        startKey: "2025-04-20",
        endKey: "2025-04-20",
        playgroup: "large",
        bookedDateKey: "2025-04-08",
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        makeReservation({
          gingr_id: `hist-daycare-late-${index}`,
          animalId: `hist-daycare-dog-late-${index}`,
          animal_gingr_id: `hist-daycare-dog-late-${index}`,
          cls: "daycare",
          startKey: "2025-04-20",
          endKey: "2025-04-20",
          playgroup: "large",
          bookedDateKey: "2025-04-15",
        }),
      ),
    ];

    const projection = buildProjectionForDate({
      targetDate: "2026-04-20",
      currentDate: "2026-04-10",
      currentSnapshot,
      historicalReservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(projection.explanations.support_total_dog_volume.projected_value).toBe(projection.display.support.total_dog_volume);
    expect(projection.display.support.total_dog_volume).toBeGreaterThanOrEqual(currentSnapshot.display.support.total_dog_volume);
    expect(projection.display.play_yard.large_play_dogs).toBe(
      Math.max(projection.display.opening.large_boarding, projection.display.closing.large_boarding)
      + projection.display.daycare.large_daycare,
    );
  });

  it("uses checked-in prior-night dogs for opening boarding and ignores stale checked-out rows", () => {
    const reservations = [
      makeReservation({
        gingr_id: "valid-opening",
        animalId: "dog-valid",
        cls: "boarding",
        startKey: "2026-04-19",
        endKey: "2026-04-21",
        check_in_date: "2026-04-19T15:00:00-04:00",
        playgroup: "large",
      }),
      makeReservation({
        gingr_id: "not-checked-in",
        animalId: "dog-no-checkin",
        cls: "boarding",
        startKey: "2026-04-19",
        endKey: "2026-04-21",
        check_in_date: null,
        playgroup: "small",
      }),
      makeReservation({
        gingr_id: "stale-checked-out",
        animalId: "dog-stale",
        cls: "boarding",
        startKey: "2026-04-18",
        endKey: "2026-04-21",
        check_in_date: "2026-04-18T15:00:00-04:00",
        check_out_date: "2026-04-19T10:00:00-04:00",
        playgroup: "private_play",
      }),
    ];

    const snapshot = computeDemandSnapshotForDate({
      targetDate: "2026-04-20",
      reservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(snapshot.display.opening.total_boarding).toBe(1);
    expect(snapshot.display.opening.large_boarding).toBe(1);
    expect(snapshot.display.closing.total_boarding).toBe(2);
  });

  it("counts one-night boarding departures without bath services as Fresh N Clean departure baths", () => {
    const reservations = [
      makeReservation({
        gingr_id: "fresh-clean",
        animalId: "dog-fnc",
        cls: "boarding",
        startKey: "2026-04-19",
        endKey: "2026-04-20",
        check_in_date: "2026-04-19T15:00:00-04:00",
        playgroup: "large",
        services: [],
      }),
      makeReservation({
        gingr_id: "scheduled-bath",
        animalId: "dog-bath",
        cls: "boarding",
        startKey: "2026-04-18",
        endKey: "2026-04-20",
        check_in_date: "2026-04-18T15:00:00-04:00",
        playgroup: "small",
        services: [{ name: "Premium Bath", scheduled_at: "2026-04-20T09:00:00-04:00" }],
      }),
    ];

    const snapshot = computeDemandSnapshotForDate({
      targetDate: "2026-04-20",
      reservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(snapshot.display.support.departure_baths).toBe(2);
  });

  it("exposes play yard demand as daycare plus the larger of opening or closing boarding", () => {
    const reservations = [
      makeReservation({
        gingr_id: "opening-large",
        animalId: "dog-opening-large",
        cls: "boarding",
        startKey: "2026-04-19",
        endKey: "2026-04-20",
        check_in_date: "2026-04-19T15:00:00-04:00",
        playgroup: "large",
      }),
      makeReservation({
        gingr_id: "closing-large-a",
        animalId: "dog-closing-large-a",
        cls: "boarding",
        startKey: "2026-04-20",
        endKey: "2026-04-21",
        check_in_date: "2026-04-20T10:00:00-04:00",
        playgroup: "large",
      }),
      makeReservation({
        gingr_id: "closing-large-b",
        animalId: "dog-closing-large-b",
        cls: "boarding",
        startKey: "2026-04-20",
        endKey: "2026-04-21",
        check_in_date: "2026-04-20T11:00:00-04:00",
        playgroup: "large",
      }),
      ...Array.from({ length: 3 }, (_, index) =>
        makeReservation({
          gingr_id: `daycare-large-${index}`,
          animalId: `daycare-large-dog-${index}`,
          cls: "daycare",
          startKey: "2026-04-20",
          endKey: "2026-04-20",
          playgroup: "large",
        }),
      ),
    ];

    const snapshot = computeDemandSnapshotForDate({
      targetDate: "2026-04-20",
      reservations,
      roomByDate: {},
      totalRooms: 0,
    });

    expect(snapshot.display.play_yard.large_play_dogs).toBe(5);
  });

  it("uses calendar-day lead math and canonical widget source fields for historical comparisons", () => {
    const baseSnapshot = computeDemandSnapshotForDate({
      targetDate: "2026-05-17",
      reservations: [],
      roomByDate: {},
      totalRooms: 0,
    });
    const currentAdjusted = applyGingrWidgetSourceCountsToDisplay(baseSnapshot.display, {
      date: "2026-05-17",
      check_ins: 14,
      check_outs: 10,
      overnight: 52,
      total: 90,
      boarding: { check_ins: 7, check_outs: 8, overnight: 52, opening: 60, total: 67 },
      daytime: { check_ins: 7, check_outs: 2, overnight: 0, total: 38 },
      other: { check_ins: 0, check_outs: 0, overnight: 0, total: 0 },
      per_type: [],
      synced_at: "2026-05-11T15:25:28.112Z",
    });

    const projection = buildProjectionForDate({
      targetDate: "2026-05-17",
      currentDate: "2026-05-11",
      currentSnapshot: { ...baseSnapshot, display: currentAdjusted.display },
      historicalReservations: [
        makeReservation({
          gingr_id: "last-year-anchor",
          animalId: "last-year-anchor-dog",
          cls: "daycare",
          startKey: "2025-05-17",
          endKey: "2025-05-17",
          bookedDateKey: "2025-05-10",
        }),
      ],
      historicalWidgetSourceByDate: new Map([
        ["2025-05-17", {
          date: "2025-05-17",
          check_ins: 12,
          check_outs: 9,
          overnight: 48,
          total: 80,
          boarding: { check_ins: 6, check_outs: 7, overnight: 48, opening: 55, total: 61 },
          daytime: { check_ins: 6, check_outs: 2, overnight: 0, total: 32 },
          other: { check_ins: 0, check_outs: 0, overnight: 0, total: 0 },
          per_type: [],
          synced_at: "2025-05-17T12:00:00.000Z",
        }],
      ]),
      roomByDate: {},
      totalRooms: 0,
    });

    expect(projection.lead_days).toBe(6);
    expect(projection.comparisons.current_year.total).toBe(90);
    expect(projection.comparisons.current_year.overnight).toBe(52);
    expect(projection.comparisons.current_year.daytime).toBe(38);
    expect(projection.comparisons.yoy_total).toBe(80);
    expect(projection.comparisons.yoy_overnight).toBe(48);
    expect(projection.comparisons.yoy_daytime).toBe(32);
    expect(projection.comparisons.yoy_total_pct_vs_current_year).toBe(88.9);
    expect(projection.comparisons.source_available).toBe(true);
  });
});

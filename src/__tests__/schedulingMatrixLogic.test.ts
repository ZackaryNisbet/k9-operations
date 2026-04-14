import { describe, it, expect } from "vitest";
import {
  annotateReservationsWithOperationalHistory,
  buildBlockerDetails,
  buildProjectionForDate,
  buildTrustPayload,
  computeDemandSnapshotForDate,
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
    playgroup: overrides.playgroup || "large",
    isHalfAndHalf: Boolean(overrides.isHalfAndHalf || false),
    unresolvedPlaygroupReason: overrides.unresolvedPlaygroupReason || null,
    playgroupAssignment: overrides.playgroupAssignment || null,
    services: Array.isArray(overrides.services) ? overrides.services : [],
    isFirstEverDaycareVisit: Boolean(overrides.isFirstEverDaycareVisit || false),
  };
}

describe("scheduling matrix logic", () => {
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
});

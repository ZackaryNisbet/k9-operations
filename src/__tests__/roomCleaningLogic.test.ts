import { describe, expect, it } from "vitest";
import cherryHillFixture from "./fixtures/cherryHillRoomCleaning2026-04-15.json";
import {
  buildRoomCleaningDisplayMap,
  buildRoomCleaningPayload,
  summarizeRoomCleaningDisplayCounts,
} from "../../supabase/functions/_shared/room-cleaning.ts";

const TARGET_DATE = "2026-04-15";
const NEXT_DATE = "2026-04-16";
const PREV_DATE = "2026-04-14";
const TWO_DAYS_PRIOR = "2026-04-13";

function makeRun(runName: string, overrides: Record<string, unknown> = {}) {
  return {
    gingr_run_id: String(overrides.gingr_run_id || `run-${runName}`),
    run_name: runName,
    area_name: String(overrides.area_name || "Boarding"),
    run_type: String(overrides.run_type || "Boarding"),
  };
}

function makeReservation(overrides: Record<string, unknown> = {}) {
  const reservationId = String(overrides.reservation_id || `res-${Math.random()}`);
  const animalId = String(overrides.animal_id || `animal-${Math.random()}`);
  return {
    reservation_id: reservationId,
    animal_id: animalId,
    animal_name: String(overrides.animal_name || `Dog ${animalId}`),
    owner_first_name: String(overrides.owner_first_name || "Owner"),
    owner_last_name: String(overrides.owner_last_name || "Owner"),
    reservation_type_name: String(overrides.reservation_type_name || "Boarding | Standard"),
    start_date: String(overrides.start_date || TARGET_DATE),
    end_date: String(overrides.end_date || TARGET_DATE),
    check_in_date: overrides.check_in_date == null ? null : String(overrides.check_in_date),
    check_out_date: overrides.check_out_date == null ? null : String(overrides.check_out_date),
    cancelled_date: overrides.cancelled_date == null ? null : String(overrides.cancelled_date),
    raw_data: overrides.raw_data || {},
    room_assignment: overrides.room_assignment == null ? null : String(overrides.room_assignment),
    photo_url: overrides.photo_url == null ? null : String(overrides.photo_url),
    dog_weight: overrides.dog_weight == null ? null : Number(overrides.dog_weight),
  };
}

function buildFixtureInput() {
  const runs = Object.keys(cherryHillFixture.rooms).map((roomCode) => makeRun(roomCode));
  const reservations = Object.entries(cherryHillFixture.rooms).flatMap(([roomCode, roomFixture], index) => {
    const common = {
      reservation_id: `fixture-${roomCode}`,
      animal_id: `fixture-animal-${index + 1}`,
      animal_name: `Dog ${roomCode}`,
      owner_last_name: `Owner ${index + 1}`,
      raw_data: { run_name: roomCode },
      room_assignment: roomCode,
    };

    switch (roomFixture.type) {
      case "Room Refresh":
        return [makeReservation({
          ...common,
          start_date: PREV_DATE,
          end_date: NEXT_DATE,
          check_in_date: `${PREV_DATE}T10:00:00`,
        })];
      case "Full Disinfect":
        return [makeReservation({
          ...common,
          start_date: TWO_DAYS_PRIOR,
          end_date: TARGET_DATE,
          check_in_date: `${TWO_DAYS_PRIOR}T10:00:00`,
          check_out_date: `${TARGET_DATE}T09:00:00`,
        })];
      case "Set Up":
        return [makeReservation({
          ...common,
          start_date: TARGET_DATE,
          end_date: NEXT_DATE,
        })];
      case "Sanitize + Set Up":
        return [makeReservation({
          ...common,
          reservation_type_name: "Day Boarding",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
        })];
      default:
        return [];
    }
  });

  return {
    date: TARGET_DATE,
    runs,
    occupancyRows: [],
    bohDogs: [],
    reservations,
  };
}

describe("room cleaning logic", () => {
  it("matches the frozen Adair Forsythe workbook room map and summary", () => {
    const payload = buildRoomCleaningPayload(buildFixtureInput());
    const expectedMap = Object.fromEntries(
      Object.entries(cherryHillFixture.rooms).map(([roomCode, roomFixture]) => [roomCode, roomFixture.type]),
    );

    expect(buildRoomCleaningDisplayMap(payload)).toEqual(expectedMap);

    const counts = summarizeRoomCleaningDisplayCounts(payload);
    expect(counts["Room Refresh"]).toBe(cherryHillFixture.summary["Room Refresh"]);
    expect(counts["Full Disinfect"]).toBe(cherryHillFixture.summary["Full Disinfect"]);
    expect(counts["Set Up"]).toBe(cherryHillFixture.summary["Set Up"]);
    expect(counts["Sanitize + Set Up"]).toBe(cherryHillFixture.summary["Sanitize + Set Up"]);
    expect(payload.classification_summary).toMatchObject({
      room_refresh: 24,
      full_disinfect: 4,
      setup: 8,
      sanitize_and_setup: 6,
    });
    expect(payload.task_summary).toMatchObject({
      room_refresh: 24,
      full_disinfect: 4,
      setup: 14,
      sanitize: 6,
      blocked_setup: 0,
    });
  });

  it("creates a room refresh for a mid-stay multi-night guest", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("101")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "refresh",
          animal_id: "dog-1",
          animal_name: "Parker",
          start_date: PREV_DATE,
          end_date: NEXT_DATE,
          raw_data: { run_name: "101" },
          room_assignment: "101",
        }),
      ],
    });

    expect(payload.classification_summary.room_refresh).toBe(1);
    expect(payload.task_instances).toHaveLength(1);
    expect(payload.task_instances[0].task_type).toBe("room_refresh");
    expect(payload.task_instances[0].scope).toBe("room");
  });

  it("creates a full disinfect for a multi-night checkout day", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("102")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "disinfect",
          animal_id: "dog-2",
          animal_name: "Milo",
          start_date: TWO_DAYS_PRIOR,
          end_date: TARGET_DATE,
          check_out_date: `${TARGET_DATE}T08:00:00`,
          raw_data: { run_name: "102" },
          room_assignment: "102",
        }),
      ],
    });

    expect(payload.classification_summary.full_disinfect).toBe(1);
    expect(payload.task_instances).toHaveLength(1);
    expect(payload.task_instances[0].task_type).toBe("full_disinfect");
    expect(payload.task_instances[0].scope).toBe("room");
  });

  it("creates setup only for the first day of a multi-night reservation", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("103")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "setup",
          animal_id: "dog-3",
          animal_name: "Juniper",
          start_date: TARGET_DATE,
          end_date: NEXT_DATE,
          raw_data: { run_name: "103" },
          room_assignment: "103",
        }),
      ],
    });

    expect(payload.classification_summary.setup).toBe(1);
    expect(payload.task_summary).toMatchObject({ setup: 1, sanitize: 0 });
    expect(payload.task_instances.map((task) => task.task_type)).toEqual(["setup"]);
  });

  it("creates separate setup and sanitize tasks for same-day stays", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("104")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "same-day",
          animal_id: "dog-4",
          animal_name: "Hazel",
          reservation_type_name: "Day Boarding",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
          raw_data: { run_name: "104" },
          room_assignment: "104",
        }),
      ],
    });

    expect(payload.classification_summary.sanitize_and_setup).toBe(1);
    expect(payload.task_summary).toMatchObject({ setup: 1, sanitize: 1 });
    expect(payload.task_instances.map((task) => task.task_type)).toEqual(["setup", "sanitize"]);
    expect(payload.task_instances.every((task) => task.scope === "reservation")).toBe(true);
  });

  it("blocks setup behind full disinfect for same-room multi-night turnover", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("105")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "departing-multi",
          animal_id: "dog-5",
          animal_name: "Summer",
          start_date: TWO_DAYS_PRIOR,
          end_date: TARGET_DATE,
          check_out_date: `${TARGET_DATE}T09:00:00`,
          raw_data: { run_name: "105" },
          room_assignment: "105",
        }),
        makeReservation({
          reservation_id: "arriving-multi",
          animal_id: "dog-6",
          animal_name: "Sadie",
          start_date: TARGET_DATE,
          end_date: NEXT_DATE,
          raw_data: { run_name: "105" },
          room_assignment: "105",
        }),
      ],
    });

    expect(payload.classification_summary.full_disinfect_then_setup).toBe(1);
    expect(payload.task_summary).toMatchObject({
      full_disinfect: 1,
      setup: 1,
      sanitize: 0,
      blocked_setup: 1,
    });
    const setupTask = payload.task_instances.find((task) => task.task_type === "setup");
    const disinfectTask = payload.task_instances.find((task) => task.task_type === "full_disinfect");
    expect(setupTask?.blocked_by_task_id).toBe(disinfectTask?.task_id);
  });

  it("adds trailing sanitize for same-room turnover into a same-day stay", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("106")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "departing-multi",
          animal_id: "dog-7",
          animal_name: "Atlas",
          start_date: TWO_DAYS_PRIOR,
          end_date: TARGET_DATE,
          check_out_date: `${TARGET_DATE}T09:00:00`,
          raw_data: { run_name: "106" },
          room_assignment: "106",
        }),
        makeReservation({
          reservation_id: "arriving-day",
          animal_id: "dog-8",
          animal_name: "Winnie",
          reservation_type_name: "Day Boarding",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
          raw_data: { run_name: "106" },
          room_assignment: "106",
        }),
      ],
    });

    expect(payload.classification_summary.full_disinfect_then_setup_and_sanitize).toBe(1);
    expect(payload.task_summary).toMatchObject({
      full_disinfect: 1,
      setup: 1,
      sanitize: 1,
      blocked_setup: 1,
    });
  });

  it("emits one room-scoped refresh for shared-room multi-dog stays", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("107")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "shared-1",
          animal_id: "dog-9",
          animal_name: "Nova",
          start_date: PREV_DATE,
          end_date: NEXT_DATE,
          raw_data: { run_name: "107" },
          room_assignment: "107",
        }),
        makeReservation({
          reservation_id: "shared-2",
          animal_id: "dog-10",
          animal_name: "Luca",
          start_date: PREV_DATE,
          end_date: NEXT_DATE,
          raw_data: { run_name: "107" },
          room_assignment: "107",
        }),
      ],
    });

    expect(payload.classification_summary.room_refresh).toBe(1);
    expect(payload.task_summary.room_refresh).toBe(1);
    expect(payload.task_instances).toHaveLength(1);
    expect(payload.task_instances[0].occupants).toHaveLength(2);
  });

  it("keeps separate setup and sanitize tasks for multiple day-boarding dogs in one room", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("108")],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "day-1",
          animal_id: "dog-11",
          animal_name: "Rory",
          reservation_type_name: "Day Boarding",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
          raw_data: { run_name: "108" },
          room_assignment: "108",
        }),
        makeReservation({
          reservation_id: "day-2",
          animal_id: "dog-12",
          animal_name: "Maple",
          reservation_type_name: "Day Boarding",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
          raw_data: { run_name: "108" },
          room_assignment: "108",
        }),
      ],
    });

    expect(payload.classification_summary.sanitize_and_setup).toBe(1);
    expect(payload.task_summary).toMatchObject({ setup: 2, sanitize: 2 });
    expect(payload.task_instances.filter((task) => task.task_type === "setup")).toHaveLength(2);
    expect(payload.task_instances.filter((task) => task.task_type === "sanitize")).toHaveLength(2);
  });

  it("collapses room-label aliases to one physical room code", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("Executive - 305 Private Play", { run_type: "Executive" })],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "alias",
          animal_id: "dog-13",
          animal_name: "Teddy",
          start_date: TARGET_DATE,
          end_date: NEXT_DATE,
          raw_data: { run_name: "305" },
          room_assignment: "305",
        }),
      ],
    });

    expect(payload.room_classifications[0].room_code).toBe("305");
    expect(payload.room_classifications[0].room).toBe("Executive - 305 Private Play");
    expect(payload.classification_summary.setup).toBe(1);
  });

  it("resolves setup rooms from next-day occupancy when the reservation starts today", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("Executive - 205", { area_name: "Executive Rooms", run_type: "Executive Room" })],
      occupancyRows: [
        {
          gingr_run_id: "run-205",
          run_name: "Executive - 205",
          area_name: "Executive Rooms",
          occupancy_date: NEXT_DATE,
          animal_names: "Hazel (Jane Doe)",
          occupied: true,
          end_date: "2026-04-18T12:30:00-04:00",
        },
      ],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "future-room",
          animal_id: "dog-15",
          animal_name: "Hazel",
          owner_first_name: "Jane",
          owner_last_name: "Doe",
          start_date: TARGET_DATE,
          end_date: "2026-04-18",
          raw_data: {},
          room_assignment: null,
        }),
      ],
    });

    expect(payload.classification_summary.setup).toBe(1);
    expect(payload.data_issues).toHaveLength(0);
    expect(payload.room_classifications[0].room_code).toBe("205");
    expect(payload.room_classifications[0].room).toBe("Executive - 205");
  });

  it("resolves checkout-day disinfect rooms from previous-day occupancy when the room is absent today", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [makeRun("Executive - 402", { area_name: "Executive Rooms", run_type: "Executive Room" })],
      occupancyRows: [
        {
          gingr_run_id: "run-402",
          run_name: "Executive - 402",
          area_name: "Executive Rooms",
          occupancy_date: PREV_DATE,
          animal_names: "Tomato (Dana Cavello)",
          occupied: true,
          end_date: `${TARGET_DATE}T12:30:00-04:00`,
        },
      ],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "checkout-room",
          animal_id: "dog-16",
          animal_name: "Tomato",
          owner_first_name: "Dana",
          owner_last_name: "Cavello",
          start_date: PREV_DATE,
          end_date: TARGET_DATE,
          check_out_date: `${TARGET_DATE}T09:00:00`,
          raw_data: {},
          room_assignment: null,
        }),
      ],
    });

    expect(payload.classification_summary.full_disinfect).toBe(1);
    expect(payload.data_issues).toHaveLength(0);
    expect(payload.room_classifications[0].room_code).toBe("402");
    expect(payload.room_classifications[0].room).toBe("Executive - 402");
  });

  it("records an explicit data issue when a room cannot be resolved in Gingr", () => {
    const payload = buildRoomCleaningPayload({
      date: TARGET_DATE,
      runs: [],
      occupancyRows: [],
      bohDogs: [],
      reservations: [
        makeReservation({
          reservation_id: "unresolved",
          animal_id: "dog-14",
          animal_name: "Ghost",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
          raw_data: {},
          room_assignment: null,
        }),
      ],
    });

    expect(payload.data_issues).toHaveLength(1);
    expect(payload.data_issues[0].issue_type).toBe("not_assigned_in_gingr");
    expect(payload.task_instances).toHaveLength(0);
    expect(payload.room_classifications).toHaveLength(0);
  });
});

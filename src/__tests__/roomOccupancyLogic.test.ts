import { describe, expect, it } from "vitest";
import {
  buildRoomOccupancySnapshot,
  type RoomOccupancyInputRow,
  type RoomOccupancyReservationInput,
  type RoomOccupancyRunInput,
} from "../../supabase/functions/_shared/room-occupancy.ts";

const TARGET_DATE = "2026-04-15";
const NEXT_DATE = "2026-04-16";
const PREV_DATE = "2026-04-14";

function makeRun(runName: string, overrides: Partial<RoomOccupancyRunInput> = {}): RoomOccupancyRunInput {
  return {
    gingr_run_id: overrides.gingr_run_id || `run-${runName}`,
    run_name: runName,
    area_name: overrides.area_name || "Boarding",
    run_type: overrides.run_type || "Boarding",
  };
}

function makeReservation(
  overrides: Partial<RoomOccupancyReservationInput> = {},
): RoomOccupancyReservationInput {
  return {
    reservation_id: String(overrides.reservation_id || `res-${Math.random()}`),
    animal_id: String(overrides.animal_id || `animal-${Math.random()}`),
    animal_name: String(overrides.animal_name || "Dog"),
    owner_first_name: String(overrides.owner_first_name || "Owner"),
    owner_last_name: String(overrides.owner_last_name || "Last"),
    reservation_type_name: String(overrides.reservation_type_name || "Boarding | Standard"),
    start_date: String(overrides.start_date || TARGET_DATE),
    end_date: String(overrides.end_date || TARGET_DATE),
    check_in_date: overrides.check_in_date == null ? null : String(overrides.check_in_date),
    check_out_date: overrides.check_out_date == null ? null : String(overrides.check_out_date),
    cancelled_date: overrides.cancelled_date == null ? null : String(overrides.cancelled_date),
    raw_data: overrides.raw_data || {},
    room_assignment: overrides.room_assignment == null ? null : String(overrides.room_assignment),
    photo_url: overrides.photo_url == null ? null : String(overrides.photo_url),
  };
}

function makeOccupancyRow(
  overrides: Partial<RoomOccupancyInputRow> = {},
): RoomOccupancyInputRow {
  return {
    gingr_run_id: overrides.gingr_run_id || "run-1",
    run_name: overrides.run_name || "Executive - 205",
    area_name: overrides.area_name || "Executive Rooms",
    occupancy_date: overrides.occupancy_date || TARGET_DATE,
    animal_names: overrides.animal_names || "Hazel (Jane Doe)",
    occupied: overrides.occupied ?? true,
    end_date: overrides.end_date || null,
  };
}

describe("room occupancy logic", () => {
  it("dedupes shadow reservations and prefers the checked-in row", () => {
    const payload = buildRoomOccupancySnapshot({
      date: TARGET_DATE,
      runs: [makeRun("Executive - 210")],
      occupancy_rows: [
        makeOccupancyRow({
          gingr_run_id: "run-210",
          run_name: "Executive - 210",
          animal_names: "Sarge (Maureen Ritchie)",
          end_date: `${TARGET_DATE}T19:00:00-04:00`,
        }),
      ],
      reservations: [
        makeReservation({
          reservation_id: "shadow-a",
          animal_id: "animal-1",
          animal_name: "Sarge",
          owner_first_name: "Maureen",
          owner_last_name: "Ritchie",
          reservation_type_name: "Day Boarding",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
          check_in_date: null,
        }),
        makeReservation({
          reservation_id: "shadow-b",
          animal_id: "animal-1",
          animal_name: "Sarge",
          owner_first_name: "Maureen",
          owner_last_name: "Ritchie",
          reservation_type_name: "Day Boarding",
          start_date: TARGET_DATE,
          end_date: TARGET_DATE,
          check_in_date: `${TARGET_DATE}T08:49:11-04:00`,
        }),
      ],
    });

    expect(payload.assignments).toHaveLength(1);
    expect(payload.shadow_dropped_reservations).toHaveLength(1);
    expect(payload.assignments[0].reservation_id).toBe("shadow-b");
    expect(payload.assignments[0].assigned_room_code).toBe("210");
  });

  it("uses tomorrow occupancy to resolve a same-day arrival without a room label", () => {
    const payload = buildRoomOccupancySnapshot({
      date: TARGET_DATE,
      runs: [makeRun("Executive - 205")],
      occupancy_rows: [
        makeOccupancyRow({
          gingr_run_id: "run-205",
          run_name: "Executive - 205",
          occupancy_date: NEXT_DATE,
          animal_names: "Hazel (Jane Doe)",
          end_date: "2026-04-18T12:30:00-04:00",
        }),
      ],
      reservations: [
        makeReservation({
          reservation_id: "arriving",
          animal_id: "animal-2",
          animal_name: "Hazel",
          owner_first_name: "Jane",
          owner_last_name: "Doe",
          start_date: TARGET_DATE,
          end_date: "2026-04-18",
          raw_data: {},
          room_assignment: null,
        }),
      ],
      include_categories: ["boarding"],
    });

    expect(payload.assignments[0].assigned_room_code).toBe("205");
    expect(payload.assignments[0].assignment_source).toBe("occupancy");
    expect(payload.assignments[0].assignment_source_date).toBe(NEXT_DATE);
  });

  it("uses previous-day occupancy to resolve a same-day departure that is gone from today's grid", () => {
    const payload = buildRoomOccupancySnapshot({
      date: TARGET_DATE,
      runs: [makeRun("Executive - 402")],
      occupancy_rows: [
        makeOccupancyRow({
          gingr_run_id: "run-402",
          run_name: "Executive - 402",
          occupancy_date: PREV_DATE,
          animal_names: "Tomato (Dana Cavello)",
          end_date: `${TARGET_DATE}T12:30:00-04:00`,
        }),
      ],
      reservations: [
        makeReservation({
          reservation_id: "departing",
          animal_id: "animal-3",
          animal_name: "Tomato",
          owner_first_name: "Dana",
          owner_last_name: "Cavello",
          start_date: PREV_DATE,
          end_date: TARGET_DATE,
          check_out_date: `${TARGET_DATE}T09:00:00-04:00`,
          raw_data: {},
          room_assignment: null,
        }),
      ],
      include_categories: ["boarding"],
    });

    expect(payload.assignments[0].assigned_room_code).toBe("402");
    expect(payload.assignments[0].assignment_source).toBe("occupancy");
    expect(payload.assignments[0].assignment_source_date).toBe(PREV_DATE);
  });
});

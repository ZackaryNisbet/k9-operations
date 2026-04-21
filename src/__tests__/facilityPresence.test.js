import { describe, expect, it } from "vitest";
import {
  mapPresenceEventToNoticeGroup,
  mapPresenceRowToReservation,
} from "../hooks/useFacilityPresence";

describe("facility presence mapping", () => {
  it("maps canonical current presence rows to checkout TV reservation shape", () => {
    const row = {
      location_id: "cherry-hill",
      animal_gingr_id: "123",
      reservation_gingr_id: "987",
      owner_gingr_id: "456",
      owner_first_name: "Betty",
      owner_last_name: "White",
      animal_name: "Betty White",
      reservation_type_name: "Small Daycare",
      presence_type: "daycare",
      room_name: "Luxury 106",
      start_date: "2026-04-20T12:00:00.000Z",
      scheduled_check_out_date: "2026-04-20T21:00:00.000Z",
    };

    expect(mapPresenceRowToReservation(row)).toMatchObject({
      id: "presence-cherry-hill-123",
      gingrId: "987",
      dogId: "g123",
      clientId: "g456",
      type: "daycare",
      status: "checked-in",
      room: "Luxury 106",
      _animalName: "Betty White",
      _ownerName: "Betty White",
      _canonicalPresence: true,
    });
  });

  it("maps canonical check-in events to TV notice groups", () => {
    const event = {
      event_key: "event-1",
      event_type: "checked_in",
      animal_gingr_id: "123",
      reservation_gingr_id: "987",
      next_state: {
        animal_name: "Betty White",
        owner_last_name: "White",
        animal_breed: "Poodle Mix",
        room_name: "Small Daycare",
        presence_type: "daycare",
      },
    };

    expect(mapPresenceEventToNoticeGroup(event, { firedAt: 1000, durationMs: 45000 })).toMatchObject({
      id: "event-1",
      firedAt: 1000,
      durationMs: 45000,
      ownerLastName: "White",
      dogs: [{
        id: "987",
        animalGingrId: "123",
        animalName: "Betty White",
        ownerLastName: "White",
        room: "Small Daycare",
        resType: "daycare",
      }],
    });
  });

  it("maps canonical checkout events from previous state", () => {
    const event = {
      event_key: "event-2",
      event_type: "checked_out",
      animal_gingr_id: "123",
      previous_state: {
        reservation_gingr_id: "987",
        animal_name: "Betty White",
        owner_last_name: "White",
        room_name: "Small Daycare",
        presence_type: "daycare",
      },
    };

    const group = mapPresenceEventToNoticeGroup(event, { firedAt: 2000, durationMs: 45000 });
    expect(group.dogs[0]).toMatchObject({
      id: "987",
      animalName: "Betty White",
      ownerLastName: "White",
      room: "Small Daycare",
      resType: "daycare",
    });
  });
});

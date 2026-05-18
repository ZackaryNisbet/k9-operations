import { describe, expect, it } from "vitest";
import {
  PRESENCE_NOTICE_WINDOW_MS,
  getPresenceEventTransitionMs,
  mapPresenceEventToNoticeGroup,
  mapPresenceRowToReservation,
} from "../hooks/useFacilityPresence";

describe("facility presence mapping", () => {
  it("does not expose stale lodging rooms for daycare presence rows", () => {
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
      room: null,
      _animalName: "Betty White",
      _ownerName: "Betty White",
      _canonicalPresence: true,
    });
  });

  it("keeps lodging room and area labels for room-eligible presence rows", () => {
    const row = {
      location_id: "cherry-hill",
      animal_gingr_id: "123",
      reservation_gingr_id: "987",
      animal_name: "Betty White",
      presence_type: "boarding",
      room_name: "Luxury Suite 106",
      area_name: "Luxury",
    };

    expect(mapPresenceRowToReservation(row)).toMatchObject({
      room: "Luxury Suite 106",
      area: "Luxury",
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
        room: "",
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
      room: "",
      resType: "daycare",
    });
  });

  it("ages check-in notices from the actual Gingr check-in timestamp", () => {
    const nowMs = Date.UTC(2026, 3, 23, 10, 41, 0);
    const checkInMs = nowMs - 28_000;
    const event = {
      event_key: "event-fresh",
      event_type: "checked_in",
      animal_gingr_id: "123",
      reservation_gingr_id: "987",
      computed_at: new Date(nowMs).toISOString(),
      next_state: {
        animal_name: "Miley",
        owner_last_name: "DeAugustine",
        presence_type: "daycare",
        check_in_date: new Date(checkInMs).toISOString(),
        room_name: "Luxury Suite 106",
      },
    };

    const group = mapPresenceEventToNoticeGroup(event, {
      firedAt: nowMs,
      nowMs,
      durationMs: PRESENCE_NOTICE_WINDOW_MS,
      recentWindowMs: PRESENCE_NOTICE_WINDOW_MS,
    });

    expect(getPresenceEventTransitionMs(event)).toBe(checkInMs);
    expect(group.firedAt).toBe(checkInMs);
    expect(group.dogs[0]).toMatchObject({
      animalName: "Miley",
      room: "",
      resType: "daycare",
    });
  });

  it("suppresses check-in notices older than the 60-second freshness window", () => {
    const nowMs = Date.UTC(2026, 3, 23, 10, 41, 0);
    const event = {
      event_key: "event-old",
      event_type: "checked_in",
      animal_gingr_id: "123",
      computed_at: new Date(nowMs).toISOString(),
      next_state: {
        animal_name: "Miley",
        presence_type: "daycare",
        check_in_date: new Date(nowMs - PRESENCE_NOTICE_WINDOW_MS - 1).toISOString(),
      },
    };

    expect(mapPresenceEventToNoticeGroup(event, {
      firedAt: nowMs,
      nowMs,
      durationMs: PRESENCE_NOTICE_WINDOW_MS,
      recentWindowMs: PRESENCE_NOTICE_WINDOW_MS,
    })).toBeNull();
  });
});

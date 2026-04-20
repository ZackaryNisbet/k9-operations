import { describe, expect, it } from "vitest";
import {
  BOH_SNAPSHOT_STALE_MS,
  getBohSnapshotAgeMs,
  isBohSnapshotStale,
  normalizeBohTransitionGroups,
} from "../kol/pages/checkoutTvFreshness";

describe("checkoutTvFreshness", () => {
  it("treats missing and invalid BOH snapshot timestamps as stale", () => {
    expect(isBohSnapshotStale(null, Date.UTC(2026, 3, 19, 16, 0, 0))).toBe(true);
    expect(isBohSnapshotStale("not-a-date", Date.UTC(2026, 3, 19, 16, 0, 0))).toBe(true);
  });

  it("keeps a recently updated BOH snapshot active", () => {
    const now = Date.UTC(2026, 3, 19, 16, 0, 0);
    const updatedAt = new Date(now - BOH_SNAPSHOT_STALE_MS + 1_000).toISOString();

    expect(isBohSnapshotStale(updatedAt, now)).toBe(false);
  });

  it("marks old BOH snapshots stale so reopening the TV does not replay the backlog", () => {
    const now = Date.UTC(2026, 3, 19, 16, 0, 0);
    const updatedAt = new Date(now - BOH_SNAPSHOT_STALE_MS - 1_000).toISOString();

    expect(isBohSnapshotStale(updatedAt, now)).toBe(true);
    expect(getBohSnapshotAgeMs(updatedAt, now)).toBe(BOH_SNAPSHOT_STALE_MS + 1_000);
  });

  it("treats a departure-only BOH payload as check-in when the active dog count increased", () => {
    const betty = { id: "betty", animalName: "Betty White" };

    const normalized = normalizeBohTransitionGroups({
      arrivals: [],
      departures: [betty],
      previousDogCount: 54,
      currentDogCount: 55,
    });

    expect(normalized.arrivals).toEqual([betty]);
    expect(normalized.departures).toEqual([]);
    expect(normalized.correction).toBe("count-increased-departures-treated-as-arrivals");
  });

  it("treats an arrival-only BOH payload as checkout when the active dog count decreased", () => {
    const dog = { id: "checked-out-dog", animalName: "Checked Out Dog" };

    const normalized = normalizeBohTransitionGroups({
      arrivals: [dog],
      departures: [],
      previousDogCount: 55,
      currentDogCount: 54,
    });

    expect(normalized.arrivals).toEqual([]);
    expect(normalized.departures).toEqual([dog]);
    expect(normalized.correction).toBe("count-decreased-arrivals-treated-as-departures");
  });

  it("keeps mixed BOH transitions unchanged because the count direction is ambiguous", () => {
    const arrival = { id: "arrival" };
    const departure = { id: "departure" };

    const normalized = normalizeBohTransitionGroups({
      arrivals: [arrival],
      departures: [departure],
      previousDogCount: 55,
      currentDogCount: 55,
    });

    expect(normalized.arrivals).toEqual([arrival]);
    expect(normalized.departures).toEqual([departure]);
    expect(normalized.correction).toBe(null);
  });
});

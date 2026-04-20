import { describe, expect, it } from "vitest";
import {
  BOH_SNAPSHOT_STALE_MS,
  getBohSnapshotAgeMs,
  isBohSnapshotStale,
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
});

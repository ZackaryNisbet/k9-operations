import { describe, expect, it } from "vitest";
import {
  countDateSpanInclusive,
  hasSchedulingBackfillLocationAccess,
  isSchedulingBackfillRangeAllowed,
  isSchedulingBackfillRunStale,
} from "../../supabase/functions/_shared/scheduling-matrix-backfill-policy.ts";

describe("scheduling matrix backfill policy", () => {
  it("allows a full calendar-year backfill but rejects multi-year ranges", () => {
    expect(countDateSpanInclusive("2025-01-01", "2025-12-31")).toBe(365);
    expect(isSchedulingBackfillRangeAllowed("2025-01-01", "2025-12-31")).toBe(true);
    expect(isSchedulingBackfillRangeAllowed("2025-01-01", "2026-01-06")).toBe(false);
  });

  it("limits write access to scoped location admins and global admins", () => {
    expect(hasSchedulingBackfillLocationAccess(
      { role: "location_admin", location_id: "cherry-hill" },
      "cherry-hill",
      true,
    )).toBe(true);
    expect(hasSchedulingBackfillLocationAccess(
      { role: "location_admin", location_id: "fairfield" },
      "cherry-hill",
      true,
    )).toBe(false);
    expect(hasSchedulingBackfillLocationAccess(
      { role: "employee", location_id: "cherry-hill" },
      "cherry-hill",
      true,
    )).toBe(false);
    expect(hasSchedulingBackfillLocationAccess(
      { role: "enterprise_admin", location_id: "fairfield" },
      "cherry-hill",
      true,
    )).toBe(true);
  });

  it("marks active runs stale but leaves finished runs alone", () => {
    const now = Date.parse("2026-05-17T02:00:00.000Z");
    expect(isSchedulingBackfillRunStale({
      status: "running",
      updated_at: "2026-05-17T01:40:00.000Z",
    }, now)).toBe(true);
    expect(isSchedulingBackfillRunStale({
      status: "queued",
      updated_at: "2026-05-17T01:55:00.000Z",
    }, now)).toBe(false);
    expect(isSchedulingBackfillRunStale({
      status: "complete",
      updated_at: "2026-05-17T01:40:00.000Z",
    }, now)).toBe(false);
  });
});

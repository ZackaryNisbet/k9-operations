import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  countDateSpanInclusive,
  hasSchedulingBackfillLocationAccess,
  isSchedulingBackfillRangeAllowed,
  isSchedulingBackfillRunStale,
} from "../../supabase/functions/_shared/scheduling-matrix-backfill-policy.ts";

describe("scheduling matrix backfill policy", () => {
  it("allows all-history location bootstrap ranges but still caps pathological requests", () => {
    expect(countDateSpanInclusive("2025-01-01", "2025-12-31")).toBe(365);
    expect(isSchedulingBackfillRangeAllowed("2025-01-01", "2025-12-31")).toBe(true);
    expect(isSchedulingBackfillRangeAllowed("2019-01-01", "2025-12-31")).toBe(true);
    expect(isSchedulingBackfillRangeAllowed("1990-01-01", "2026-01-06")).toBe(false);
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

  it("keeps all-history origin discovery in the server-side backfill function", () => {
    const source = readFileSync("supabase/functions/scheduling-matrix-backfill/index.ts", "utf8");
    expect(source).toContain('action === "origin"');
    expect(source).toContain("first_operational_date");
    expect(source).toContain("all_history === true");
    expect(source).toContain("No operational GINGR reservation history was found");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLaborRosterFilters } from "../kol/pages/TrainingPage.jsx";

describe("applyLaborRosterFilters", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  it("defaults the roster employment status filter to active employees", () => {
    const rows = [
      { id: "active-1", employment_status: "active" },
      { id: "inactive-1", employment_status: "inactive" },
    ];

    expect(
      applyLaborRosterFilters(rows, { employment_status: { op: "is", val: "active" } }).map((row) => row.id)
    ).toEqual(["active-1"]);
  });

  it("supports inactive and all roster employment status filters", () => {
    const rows = [
      { id: "active-1", employment_status: "active" },
      { id: "inactive-1", employment_status: "inactive" },
    ];

    expect(
      applyLaborRosterFilters(rows, { employment_status: { op: "is", val: "inactive" } }).map((row) => row.id)
    ).toEqual(["inactive-1"]);
    expect(
      applyLaborRosterFilters(rows, { employment_status: { op: "is", val: "all" } }).map((row) => row.id)
    ).toEqual(["active-1", "inactive-1"]);
  });
});

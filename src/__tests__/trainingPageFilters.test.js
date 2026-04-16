import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLaborRosterFilters, getLaborEmployeeRowId, safeTrainingProgress, toObjectRows } from "../kol/pages/TrainingPage.jsx";
import { isLaborEmployeeActive } from "../kol/trainingData.js";

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

  it("normalizes malformed rows before record detail rendering uses them", () => {
    expect(toObjectRows([{ id: "ok" }, null, "bad", ["bad"]])).toEqual([{ id: "ok" }]);
    expect(getLaborEmployeeRowId({ id: "employee-from-rpc" })).toBe("employee-from-rpc");
    expect(getLaborEmployeeRowId({ employee_id: "employee-id" })).toBe("employee-id");
    expect(getLaborEmployeeRowId({ labor_employee_id: "labor-id" })).toBe("labor-id");
    expect(safeTrainingProgress("not-a-number")).toBe(0);
    expect(safeTrainingProgress(125)).toBe(100);
  });

  it("uses canonical active/inactive fields before falling back to end date", () => {
    expect(isLaborEmployeeActive({ id: "active-status", employment_status: "active", end_date: "2026-01-01" })).toBe(true);
    expect(isLaborEmployeeActive({ id: "inactive-status", employment_status: "inactive" })).toBe(false);
    expect(isLaborEmployeeActive({ id: "inactive-flag", is_active: false })).toBe(false);
    expect(isLaborEmployeeActive({ id: "active-fallback", end_date: null })).toBe(true);
  });
});

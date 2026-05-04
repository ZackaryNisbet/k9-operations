import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLaborRosterFilters,
  buildLaborModulePanelKey,
  getLaborEmployeeRowId,
  getTrainingRecordEmployeeId,
  isTrainingRecordForEmployee,
  noteMatchesSearch,
  safeTrainingProgress,
  toObjectRows,
} from "../kol/pages/TrainingPage.jsx";
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
    expect(getTrainingRecordEmployeeId({ labor_employee_id: "labor-id" })).toBe("labor-id");
    expect(getTrainingRecordEmployeeId({ employee_id: "legacy-id" })).toBe("legacy-id");
    expect(safeTrainingProgress("not-a-number")).toBe(0);
    expect(safeTrainingProgress(125)).toBe(100);
  });

  it("matches employee training history by canonical id or exact normalized name", () => {
    expect(
      isTrainingRecordForEmployee(
        { labor_employee_id: "labor-id", employee_full_name: "Different Person" },
        { labor_employee_id: "labor-id", full_name: "Skylerary Brooks" }
      )
    ).toBe(true);
    expect(
      isTrainingRecordForEmployee(
        { employee_id: "legacy-id" },
        { labor_employee_id: "legacy-id", full_name: "Skylerary Brooks" }
      )
    ).toBe(true);
    expect(
      isTrainingRecordForEmployee(
        { employee_full_name: "  Skylerary   Brooks " },
        { full_name: "Skylerary Brooks" }
      )
    ).toBe(true);
    expect(
      isTrainingRecordForEmployee(
        { employee_full_name: "Skyler Brooks" },
        { full_name: "Skylerary Brooks" }
      )
    ).toBe(false);
  });

  it("uses canonical active/inactive fields before falling back to end date", () => {
    expect(isLaborEmployeeActive({ id: "active-status", employment_status: "active", end_date: "2026-01-01" })).toBe(true);
    expect(isLaborEmployeeActive({ id: "inactive-status", employment_status: "inactive" })).toBe(false);
    expect(isLaborEmployeeActive({ id: "inactive-flag", is_active: false })).toBe(false);
    expect(isLaborEmployeeActive({ id: "active-fallback", end_date: null })).toBe(true);
  });

  it("searches employee notes across note body and context fields", () => {
    const note = {
      employeeName: "Larrissa Santana",
      noteType: "hr",
      sourceLabel: "Employee Note",
      createdByName: "Manager",
      noteText: "Printed email PDF received for documentation.",
    };

    expect(noteMatchesSearch(note, "email pdf")).toBe(true);
    expect(noteMatchesSearch(note, "larrissa")).toBe(true);
    expect(noteMatchesSearch(note, "disciplinary")).toBe(false);
    expect(noteMatchesSearch(note, "")).toBe(true);
  });

  it("keeps interview detail state out of the labor panel remount key", () => {
    expect(buildLaborModulePanelKey({ tab: "interviews", interviewView: "records", attendanceView: "summary" })).toBe("interviews:records:");
    expect(buildLaborModulePanelKey({ tab: "attendance", interviewView: "config", attendanceView: "summary" })).toBe("attendance::summary");
  });
});

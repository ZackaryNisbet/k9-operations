import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLaborRosterFilters,
  buildLaborModulePanelKey,
  buildHourAnalysisModel,
  getLaborEmployeeRowId,
  getTrainingRecordEmployeeId,
  isTrainingRecordForEmployee,
  normalizeHourAnalysisSettings,
  noteMatchesSearch,
  safeTrainingProgress,
  shouldCycleLaborModelCoveragePointer,
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
        { labor_employee_id: "labor-id", full_name: "Zackary Nisbet" }
      )
    ).toBe(true);
    expect(
      isTrainingRecordForEmployee(
        { employee_id: "legacy-id" },
        { labor_employee_id: "legacy-id", full_name: "Zackary Nisbet" }
      )
    ).toBe(true);
    expect(
      isTrainingRecordForEmployee(
        { employee_full_name: "  Zackary   Nisbet " },
        { full_name: "Zackary Nisbet" }
      )
    ).toBe(true);
    expect(
      isTrainingRecordForEmployee(
        { employee_full_name: "Zack Nisbet" },
        { full_name: "Zackary Nisbet" }
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

  it("builds hour analysis from active roster rows, preferred-hour defaults, overrides, and what-if rows", () => {
    const emptyLaborDay = (day) => ({
      day_key: day,
      columns: [{ id: `${day}-slot`, label: "Closed", hours: 1 }],
      rows: [],
    });
    const laborModel = {
      days: {
        monday: {
          day_key: "monday",
          columns: [
            { id: "monday-gm", label: "GM", hours: 10.5 },
            { id: "monday-csr", label: "CSR", hours: 20.5 },
            { id: "monday-pct", label: "PCT", hours: 40.5 },
          ],
          rows: [
            { id: "monday-gm-row", group_key: "general_manager", role_label: "GM floor", coverage: ["x", "", ""] },
            { id: "monday-csr-row", group_key: "csr", role_label: "CSR floor", coverage: ["", "x", ""] },
            { id: "monday-pct-row", group_key: "pct", role_label: "PCT floor", coverage: ["", "", "x"] },
            { id: "monday-mktg-row", group_key: "csr", role_label: "Marketing time", coverage: ["MKTG", "", ""] },
          ],
        },
        tuesday: emptyLaborDay("tuesday"),
        wednesday: emptyLaborDay("wednesday"),
        thursday: emptyLaborDay("thursday"),
        friday: emptyLaborDay("friday"),
        saturday: emptyLaborDay("saturday"),
        sunday: emptyLaborDay("sunday"),
      },
    };
    const settings = normalizeHourAnalysisSettings({
      expectations: {
        leadership: { full_time: 35, part_time: 0 },
        csr: { full_time: 30, part_time: 15 },
        pct: { full_time: 30, part_time: 15 },
      },
      overrides: {
        "emp-pct-ft": { hours: 28 },
      },
      positionMovements: {
        "emp-pct-ft": { position_title: "CSR" },
      },
      whatIfRows: [
        { id: "candidate-1", full_name: "Candidate One", position_title: "CSR", group_key: "csr", employment_commitment: "part_time" },
      ],
      thresholds: {
        daily_skeleton: { leadership: 5, csr: 2, pct: 4 },
      },
      laborModel,
    });

    const model = buildHourAnalysisModel({
      settings,
      rosterRows: [
        { labor_employee_id: "emp-lead-ft", full_name: "Lead Full", position_title: "General Manager", employment_commitment: "full_time", employment_status: "active" },
        { labor_employee_id: "emp-csr-pt", full_name: "CSR Part", position_title: "CSR", employment_commitment: "part_time", employment_status: "active" },
        { labor_employee_id: "emp-pct-ft", full_name: "PCT Full", position_title: "PCT", employment_commitment: "full_time", employment_status: "active" },
        { labor_employee_id: "inactive", full_name: "Inactive", position_title: "CSR", employment_commitment: "full_time", employment_status: "inactive" },
      ],
    });

    expect(model.headcountTotals.total).toBe(3);
    expect(model.headcountTotals.whatIfTotal).toBe(1);
    expect(model.headcountRows.find((row) => row.key === "general_manager")).toMatchObject({ fullTime: 1, total: 1 });
    expect(model.headcountRows.find((row) => row.key === "assistant_manager")).toMatchObject({ fullTime: 0, total: 0 });
    expect(model.headcountRows.find((row) => row.key === "supervisor")).toMatchObject({ fullTime: 0, total: 0 });
    expect(model.headcountRows.find((row) => row.key === "csr")).toMatchObject({ whatIfFullTime: 1, whatIfPartTime: 1, whatIfTotal: 2 });
    expect(model.headcountRows.find((row) => row.key === "pct")).toMatchObject({ whatIfFullTime: -1, whatIfTotal: -1 });
    expect(model.totals.total).toBe(78);
    expect(model.totals.whatIfTotal).toBe(15);
    expect(model.totals.projectedTotal).toBe(93);
    expect(model.totals.requiredWeekly).toBe(70);
    expect(model.totals.targetWeekly).toBe(85);
    expect(model.laborModelSummary.totalWeekly).toBe(70);
    expect(model.laborModelSummary.totalMarketingWeekly).toBe(10);
    expect(model.laborModelSummary.dayRows.find((day) => day.key === "monday")).toMatchObject({ marketingHours: 10 });
    expect(model.weeklyRows.find((row) => row.key === "general_manager")).toMatchObject({ reliefPercent: 0, requiredWeekly: 10, targetWeekly: 10 });
    expect(model.weeklyRows.find((row) => row.key === "csr")).toMatchObject({ reliefPercent: 20, requiredWeekly: 20, targetWeekly: 25 });
    expect(model.weeklyRows.find((row) => row.key === "pct")).toMatchObject({ reliefPercent: 20, requiredWeekly: 40, targetWeekly: 50 });
    expect(model.totals.capacityStatus.key).toBe("high");
    expect(model.rows.find((row) => row.employeeKey === "emp-pct-ft")).toMatchObject({
      isOverride: true,
      isMovement: true,
      sourcePositionTitle: "Pet Care Technician",
      sourceGroupKey: "pct",
      position_title: "Customer Service Representative",
      groupKey: "csr",
      preferredHours: 28,
    });
    expect(model.whatIfRows[0]).toMatchObject({ full_name: "Candidate One", groupKey: "csr", preferredHours: 15 });
  });

  it("keeps half coverage and MKTG cells weighted separately in the labor model", () => {
    const emptyLaborDay = (day) => ({
      day_key: day,
      columns: [{ id: `${day}-slot`, label: "Closed", hours: 1 }],
      rows: [],
    });
    const laborModel = {
      days: {
        monday: {
          day_key: "monday",
          columns: [
            { id: "monday-operating", label: "8-9a", hours: 1 },
            { id: "monday-marketing", label: "9-10a", hours: 1 },
          ],
          rows: [
            {
              id: "half-and-marketing",
              group_key: "csr",
              role_label: "CSR mixed coverage",
              break_enabled: false,
              coverage: ["0.5", "MKTG"],
            },
          ],
        },
        tuesday: emptyLaborDay("tuesday"),
        wednesday: emptyLaborDay("wednesday"),
        thursday: emptyLaborDay("thursday"),
        friday: emptyLaborDay("friday"),
        saturday: emptyLaborDay("saturday"),
        sunday: emptyLaborDay("sunday"),
      },
    };
    const model = buildHourAnalysisModel({
      settings: normalizeHourAnalysisSettings({ laborModel }),
      rosterRows: [],
    });
    const monday = model.laborModelSummary.dayRows.find((day) => day.key === "monday");

    expect(model.laborModelSummary.totalWeekly).toBe(0.5);
    expect(model.laborModelSummary.totalMarketingWeekly).toBe(1);
    expect(monday).toMatchObject({ totalHours: 0.5, marketingHours: 1 });
    expect(monday.columnTotals[0]).toMatchObject({ operatingCoverage: 0.5, operatingHours: 0.5 });
    expect(monday.columnTotals[1]).toMatchObject({ marketingCoverage: 1, marketingHours: 1 });
  });

  it("keeps active labor model cells editable on first click", () => {
    expect(shouldCycleLaborModelCoveragePointer({ value: "", isFocused: false })).toBe(true);
    expect(shouldCycleLaborModelCoveragePointer({ value: "1", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "0.5", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "MKTG", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "MKTG", isFocused: true })).toBe(true);
  });
});

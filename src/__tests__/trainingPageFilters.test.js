import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLaborRosterFilters,
  buildLaborModulePanelKey,
  buildHourAnalysisModel,
  CAPACITY_PLANNING_VIEWS,
  clearHourAnalysisPlanningState,
  copyLaborModelBreakers,
  getLaborEmployeeRowId,
  getTrainingRecordEmployeeId,
  isTrainingRecordForEmployee,
  LABOR_MANAGEMENT_TABS,
  makeLaborModelCellKey,
  normalizeCapacityPlanningView,
  normalizeLaborModelBreakerSettings,
  normalizeHourAnalysisSettings,
  noteMatchesSearch,
  removeLaborModelColumnFromDay,
  safeTrainingProgress,
  shouldCycleLaborModelCoveragePointer,
  toObjectRows,
  updateLaborModelBreakersForDay,
} from "../kol/pages/TrainingPage.jsx";
import { isLaborEmployeeActive } from "../kol/trainingData.js";

describe("applyLaborRosterFilters", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  it("keeps labor detail render branches after all TrainingPage hooks", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const firstDetailBranchIndex = source.search(/if \((hasSelectedLaborEmployee|selectedRecordId)/);
    const remainingHookIndex = source
      .slice(firstDetailBranchIndex)
      .search(/use(?:State|Effect|LayoutEffect|Memo|Callback|Ref)\s*\(/);

    expect(firstDetailBranchIndex).toBeGreaterThan(0);
    expect(remainingHookIndex).toBe(-1);
  });

  it("renames labor navigation to Roster and Capacity Planning routes", () => {
    const kolAppSource = readFileSync(new URL("../kol/KolApp.jsx", import.meta.url), "utf8");

    expect(LABOR_MANAGEMENT_TABS.find((tab) => tab.id === "home")).toMatchObject({ label: "Roster" });
    expect(LABOR_MANAGEMENT_TABS.find((tab) => tab.id === "hour-analysis")).toMatchObject({ label: "Capacity Planning" });
    expect(kolAppSource).toContain('home: "roster"');
    expect(kolAppSource).toContain('"hour-analysis": "capacity-planning"');
    expect(kolAppSource).toContain('"labor-model": "capacity-planning/labor-model"');
  });

  it("removes duplicate roster summary/output controls from the Roster source", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");

    expect(source).not.toContain("Staffing Matrix");
    expect(source).not.toContain("Roster Output");
    expect(source).not.toContain("Download Roster PDF");
    expect((source.match(/Roster PDF/g) || []).length).toBe(1);
    expect(source).toContain("labor-roster-action-bar");
    expect(source).toContain("labor-roster-table");
  });

  it("adds a Capacity Planning subpage selector for Staffing Capacity and Labor Model", () => {
    expect(CAPACITY_PLANNING_VIEWS.map((view) => view.id)).toEqual(["staffing-capacity", "labor-model"]);
    expect(CAPACITY_PLANNING_VIEWS.map((view) => view.label)).toEqual(["Staffing Capacity", "Labor Model"]);
    expect(normalizeCapacityPlanningView("labor-model")).toBe("labor-model");
    expect(normalizeCapacityPlanningView("legacy")).toBe("staffing-capacity");
    expect(buildLaborModulePanelKey({ tab: "hour-analysis", capacityPlanningView: "labor-model" })).toBe("hour-analysis:::labor-model");
    expect(buildLaborModulePanelKey({ tab: "hour-analysis", capacityPlanningView: "staffing-capacity" })).toBe("hour-analysis:::staffing-capacity");
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
    expect(buildLaborModulePanelKey({ tab: "interviews", interviewView: "records", attendanceView: "summary" })).toBe("interviews:records::");
    expect(buildLaborModulePanelKey({ tab: "attendance", interviewView: "config", attendanceView: "summary" })).toBe("attendance::summary:");
  });

  it("builds hour analysis from active roster rows, expected-hour defaults, overrides, and what-if rows", () => {
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
    expect(model.totals.capacityStatus.message).toContain("Expected capacity");
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

  it("clears Capacity Planning scenario state without wiping Expected Hours preferences", () => {
    const settings = normalizeHourAnalysisSettings({
      expectations: {
        csr: { full_time: 32, part_time: 18 },
      },
      overrides: {
        "emp-1": { expected: 36 },
      },
      notes: {
        "emp-1": "Keeps stored Expected Hours note",
        "what-if-1": "Disposable planning note",
      },
      splits: {
        "emp-1": { floor_group: "csr", admin_hours: 12 },
        "what-if-1": { floor_group: "pct", admin_hours: 5 },
      },
      positionMovements: {
        "emp-1": { position_title: "PCT" },
      },
      whatIfRows: [
        { id: "what-if-1", full_name: "Candidate", position_title: "CSR", employment_commitment: "part_time" },
      ],
      auditLog: [{ id: "existing-audit", summary: "Existing activity" }],
    });

    const result = clearHourAnalysisPlanningState(settings);

    expect(result.summary).toMatchObject({
      changed: true,
      removedWhatIfRows: 1,
      removedPositionMovements: 1,
      removedWhatIfNotes: 1,
      removedWhatIfSplits: 1,
    });
    expect(result.settings.whatIfRows).toEqual([]);
    expect(result.settings.positionMovements).toEqual({});
    expect(result.settings.expectations.csr.full_time.expected).toBe(32);
    expect(result.settings.expectations.csr.part_time.expected).toBe(18);
    expect(result.settings.overrides["emp-1"].expected).toBe(36);
    expect(result.settings.notes["emp-1"]).toBe("Keeps stored Expected Hours note");
    expect(result.settings.notes["what-if-1"]).toBeUndefined();
    expect(result.settings.splits["emp-1"]).toMatchObject({ floor_group: "csr", admin_hours: 12 });
    expect(result.settings.splits["what-if-1"]).toBeUndefined();
    expect(result.settings.auditLog[0]).toMatchObject({ id: "existing-audit", summary: "Existing activity" });
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

  it("buckets typed labor model coverage into the position named in the cell", () => {
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
            { id: "monday-pct", label: "8-9a", hours: 1 },
            { id: "monday-csr", label: "9-10a", hours: 1 },
            { id: "monday-am", label: "10-11a", hours: 1 },
            { id: "monday-gm", label: "11a-12p", hours: 1 },
            { id: "monday-sup", label: "12-1p", hours: 1 },
            { id: "monday-mktg", label: "1-2p", hours: 1 },
          ],
          rows: [
            {
              id: "am-working-mixed-floor",
              group_key: "assistant_manager",
              role_label: "AM mixed coverage",
              break_enabled: false,
              coverage: ["PCT", "Customer Service Representative", "AM", "GM", "SUP", "MKTG"],
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

    expect(model.laborModelSummary.totalWeekly).toBe(5);
    expect(model.laborModelSummary.totalMarketingWeekly).toBe(1);
    expect(monday.roleHours).toMatchObject({
      general_manager: 1,
      assistant_manager: 1,
      supervisor: 1,
      csr: 1,
      pct: 1,
    });
    expect(model.laborModelSummary.roleWeekly).toMatchObject({
      general_manager: 1,
      assistant_manager: 1,
      supervisor: 1,
      csr: 1,
      pct: 1,
    });
    expect(monday.rows[0]).toMatchObject({
      hours: 5,
      marketingHours: 1,
      roleHours: {
        assistant_manager: 1,
        csr: 1,
        pct: 1,
      },
    });
    expect(monday.columnTotals[0]).toMatchObject({ operatingCoverage: 1, operatingHours: 1 });
    expect(monday.columnTotals[5]).toMatchObject({ marketingCoverage: 1, marketingHours: 1 });
  });

  it("keeps non-contiguous labor model header edits in validation instead of crashing", () => {
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
            { id: "monday-open", label: "5:30a-6a", hours: 0.5 },
            { id: "monday-gap", label: "6:15a-7a", hours: 0.75 },
          ],
          rows: [
            {
              id: "csr-open",
              group_key: "csr",
              role_label: "CSR opening",
              break_enabled: false,
              coverage: ["1", "1"],
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

    expect(monday.columnValidation.valid).toBe(false);
    expect(monday.columnValidation.errors[0]).toMatchObject({
      index: 1,
      message: "5:30a-6a must end where 6:15a-7a starts.",
    });
    expect(monday.totalHours).toBe(1.3);
  });

  it("deletes a labor model slot by merging the adjacent time range without leaving validation gaps", () => {
    const day = {
      day_key: "monday",
      columns: [
        { id: "slot-1", label: "11a-12p", hours: 1 },
        { id: "slot-2", label: "12-12:30p", hours: 0.5 },
        { id: "slot-3", label: "12:30-1p", hours: 0.5 },
      ],
      rows: [
        {
          id: "csr-mid",
          group_key: "csr",
          role_label: "CSR mid",
          break_enabled: false,
          coverage: ["1", "0.5", ""],
        },
      ],
    };

    const result = removeLaborModelColumnFromDay(day, 1, "monday");

    expect(result.error).toBe("");
    expect(result.removedColumn).toMatchObject({ label: "12-12:30p" });
    expect(result.day.columns.map((column) => column.label)).toEqual(["11a-12:30p", "12:30-1p"]);
    expect(result.day.rows[0].coverage).toEqual(["1", ""]);
    const model = buildHourAnalysisModel({
      settings: normalizeHourAnalysisSettings({
        laborModel: {
          days: {
            monday: result.day,
            tuesday: { day_key: "tuesday", columns: [{ id: "t", label: "1-2p", hours: 1 }], rows: [] },
            wednesday: { day_key: "wednesday", columns: [{ id: "w", label: "1-2p", hours: 1 }], rows: [] },
            thursday: { day_key: "thursday", columns: [{ id: "th", label: "1-2p", hours: 1 }], rows: [] },
            friday: { day_key: "friday", columns: [{ id: "f", label: "1-2p", hours: 1 }], rows: [] },
            saturday: { day_key: "saturday", columns: [{ id: "s", label: "1-2p", hours: 1 }], rows: [] },
            sunday: { day_key: "sunday", columns: [{ id: "su", label: "1-2p", hours: 1 }], rows: [] },
          },
        },
      }),
      rosterRows: [],
    });
    const monday = model.laborModelSummary.dayRows.find((row) => row.key === "monday");

    expect(monday.columnValidation.valid).toBe(true);
  });

  it("persists and copies configurable labor model grey bars by day", () => {
    const settings = normalizeLaborModelBreakerSettings({
      days: {
        monday: [{ minutes: 6 * 60 }, { time: "1p" }, { label: "7p" }, { time: "8p" }],
        tuesday: [],
      },
    });

    expect(settings.days.monday.map((bar) => bar.minutes)).toEqual([360, 780, 1140, 1200]);
    expect(settings.days.tuesday).toEqual([]);

    const updated = updateLaborModelBreakersForDay(settings, "wednesday", [{ time: "9a" }, { time: "3:30p" }]);
    expect(updated.days.wednesday.map((bar) => bar.minutes)).toEqual([540, 930]);

    const copied = copyLaborModelBreakers(updated, "wednesday", ["thursday", "friday"]);
    expect(copied.days.thursday.map((bar) => bar.minutes)).toEqual([540, 930]);
    expect(copied.days.friday.map((bar) => bar.minutes)).toEqual([540, 930]);

    const normalizedSettings = normalizeHourAnalysisSettings({ laborModel: { breakers: copied } });
    expect(normalizedSettings.laborModel.breakers.days.friday.map((bar) => bar.label)).toEqual(["9a", "3:30p"]);
  });

  it("keeps active labor model cells editable on first click", () => {
    expect(shouldCycleLaborModelCoveragePointer({ value: "", isFocused: false })).toBe(true);
    expect(shouldCycleLaborModelCoveragePointer({ value: "1", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "1", isFocused: true })).toBe(true);
    expect(shouldCycleLaborModelCoveragePointer({ value: "0.5", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "0.5", isFocused: true })).toBe(true);
    expect(shouldCycleLaborModelCoveragePointer({ value: "MKTG", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "MKTG", isFocused: true })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "PCT", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "PCT", isFocused: true })).toBe(false);
    expect(makeLaborModelCellKey("monday", "row-1", 2)).toBe("monday::row-1::2");
  });
});

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLaborRosterFilters,
  applyLaborCapacityModelActivation,
  buildHourAnalysisCapacityRowVisualModel,
  buildDefaultLaborCapacityModelPayload,
  buildLaborModelCrossRoleCoverageSummary,
  buildPlannedCrossRoleCoverageRows,
  buildLaborModulePanelKey,
  buildTrainingHistoryRows,
  buildHourAnalysisModel,
  buildOutOfPositionLaborSummary,
  calculateLaborShiftHours,
  buildLaborModelCoverageValue,
  CAPACITY_PLANNING_VIEWS,
  clearHourAnalysisPlanningState,
  copyTextToClipboard,
  copyLaborModelBreakers,
  formatHourAnalysisCapacityDelta,
  getLaborModelDefaultCoverageValueForRow,
  getLaborModelCoverageDisplay,
  getLaborEmployeeRowId,
  getTrainingRecordEmployeeId,
  isTrainingRecordForEmployee,
  LABOR_MANAGEMENT_TABS,
  makeLaborModelCellKey,
  normalizeCapacityPlanningView,
  normalizeLaborCapacityModelRow,
  normalizeLaborCapacityModelVersions,
  normalizeLaborModelBreakerSettings,
  normalizeLaborModelCoverageCell,
  normalizeLaborModelRolePalette,
  normalizeHourAnalysisSettings,
  normalizeStaffingCapacitySettings,
  noteMatchesSearch,
  resolveVerifiedActorDisplayName,
  removeLaborModelColumnFromDay,
  safeTrainingProgress,
  selectStaffingCapacitySettings,
  setLaborModelCoverageDuration,
  setLaborModelCoveragePosition,
  shouldCycleLaborModelCoveragePointer,
  summarizeLaborCapacityModelSnapshotDiff,
  toObjectRows,
  TRAINING_REALTIME_TABLES,
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

  it("keeps training live refresh wired to canonical record and history tables", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../../supabase/migrations/20260513175409_training_realtime_publication.sql", import.meta.url), "utf8");

    expect(TRAINING_REALTIME_TABLES).toEqual([
      "training_records",
      "training_record_item_results",
      "training_record_notes",
      "training_record_events",
    ]);
    expect(source).toContain("refreshLaborData({ includeTraining: true, includeSupport: true })");
    expect(source).toContain("reloadRecordDetailData(selectedRecordId)");
    expect(source).toContain("trainingRealtimeRefreshTimerRef");
    TRAINING_REALTIME_TABLES.forEach((table) => {
      expect(migration).toContain(`'${table}'`);
      expect(migration).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE");
    });
  });

  it("opens the readiness cell modal from individual team readiness record items", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const renderRecordItem = source.slice(
      source.indexOf("const renderRecordItem"),
      source.indexOf("const renderTemplatePreviewItem"),
    );

    expect(source).toContain("update_training_readiness_cell");
    expect(source).toContain("Update Readiness Cell");
    expect(renderRecordItem).toContain("selectedRecordIsTeamReadiness");
    expect(renderRecordItem).toContain("openPctReadinessCellEditor(selectedRecord, item, section, { cell: readinessCell })");
    expect(renderRecordItem).toContain('gridTemplateColumns: "minmax(0, 1fr) 220px 120px"');
    expect(renderRecordItem).toContain("borderLeft");
    expect(renderRecordItem).toContain("borderRight");
    expect(renderRecordItem).not.toContain('aria-hidden="true"');
    expect(renderRecordItem).not.toContain("width: 22");
    expect(renderRecordItem).not.toContain("<CustomSelect");
  });

  it("keeps the team readiness board free of hotspot cards and uses Plan labeling", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");

    expect(source).not.toContain("Training Gap Hotspot");
    expect(source).not.toContain("Gap Hotspots by Category");
    expect(source).not.toContain("Role / Template");
    expect(source).toContain(">Plan</div>");
  });

  it("keeps trainee configuration using standard controls with a soft-delete action", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const configModalSource = source.slice(
      source.indexOf('<Modal title="Edit Trainee Configuration"'),
      source.indexOf("{pctReadinessCellEditorModal}"),
    );

    expect(configModalSource).toContain("<CustomSelect");
    expect(configModalSource).not.toContain("<HourAnalysisAnimatedPicker");
    expect(configModalSource).toContain("Delete Training Record");
    expect(configModalSource).toContain("handleArchiveTrainingRecord");
    expect(source).toContain('overall_status: "archived"');
    expect(source).toContain("removes it from active training views while preserving notes and history");
  });

  it("positions date picker menus against the viewport instead of the modal flow", () => {
    const uiSource = readFileSync(new URL("../shared/ui.jsx", import.meta.url), "utf8");
    const calendarPickerSource = uiSource.slice(
      uiSource.indexOf("function CalendarPicker"),
      uiSource.indexOf("function Modal"),
    );

    expect(calendarPickerSource).toContain("updatePanelPosition");
    expect(calendarPickerSource).toContain("panelRef.current?.contains");
    expect(calendarPickerSource).toContain('position: "fixed"');
    expect(calendarPickerSource).toContain("maxHeight");
  });

  it("stacks readiness demonstrated and verified counts with their progress bars", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const recordHeaderSource = source.slice(
      source.indexOf("{/* Record Header */}"),
      source.indexOf("{/* Sections */}"),
    );

    expect(source).toContain("function PctReadinessDualCountSummary");
    expect(source).toContain("gridTemplateColumns: `${countWidth}px ${keyWidth}px ${progressWidth}px ${percentWidth}px`");
    expect(source).not.toContain("demonstrated ·");
    expect(source).not.toContain("verified ·");
    expect(source).not.toContain(" D ·");
    expect(source).toContain("pctReadinessEmployeeBoardProgress.demonstratedCount");
    expect(source).toContain("trainingRecordSectionNavItems");
    expect(recordHeaderSource).toContain("PctReadinessDualCountSummary");
    expect(recordHeaderSource).not.toContain("<PctReadinessDualProgress");
  });

  it("shows readiness status actor display names without falling back to emails", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const renderRecordItem = source.slice(
      source.indexOf("const renderRecordItem"),
      source.indexOf("const renderTemplatePreviewItem"),
    );

    expect(source).toContain("function cleanReadinessActorName");
    expect(source).toContain("isEmailLike(trimmed)");
    expect(source).toContain("function getReadinessCellActorDisplayName");
    expect(renderRecordItem).toContain("latest_note_actor_name");
    expect(renderRecordItem).toContain("readinessActorName");
    expect(source).toContain("cellActorName || \"Comment\"");
    expect(source).toContain("rowActorName");
  });

  it("adds a sticky training record section navigator and wraps long note labels", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const navSource = source.slice(
      source.indexOf('<aside className="training-record-section-nav"'),
      source.indexOf("{showRecordConfig &&"),
    );

    expect(source).toContain("scrollToTrainingRecordAnchor");
    expect(source).toContain("training-record-section-nav");
    expect(source).toContain("training-record-notes");
    expect(source).toContain('overflowWrap: "anywhere"');
    expect(source).toContain('wordBreak: "break-word"');
    expect(navSource).toContain('boxSizing: "border-box"');
    expect(navSource).toContain("maxHeight");
    expect(navSource).not.toContain("PctReadinessDualCountSummary");
  });

  it("closes readiness cell modals before refreshing detail or board data after saves", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const handleSaveSource = source.slice(
      source.indexOf("const handleSavePctReadinessCell"),
      source.indexOf("const handleCreatePctReadinessRecord"),
    );

    expect(handleSaveSource).not.toContain("refreshLaborData");
    expect(handleSaveSource.indexOf("closePctReadinessCellEditor();")).toBeLessThan(handleSaveSource.indexOf("reloadRecordDetailData(savedRecordId)"));
    expect(handleSaveSource.indexOf("closePctReadinessCellEditor();")).toBeLessThan(handleSaveSource.indexOf("loadPctReadinessBoard(true)"));
  });

  it("renames labor navigation to Roster and Capacity Planning routes", () => {
    const kolAppSource = readFileSync(new URL("../kol/KolApp.jsx", import.meta.url), "utf8");

    expect(LABOR_MANAGEMENT_TABS.find((tab) => tab.id === "home")).toMatchObject({ label: "Roster" });
    expect(LABOR_MANAGEMENT_TABS.find((tab) => tab.id === "hour-analysis")).toMatchObject({ label: "Capacity Planning" });
    expect(kolAppSource).toContain('home: "roster"');
    expect(kolAppSource).toContain('"hour-analysis": "capacity-planning"');
    expect(kolAppSource).toContain('"labor-model": "capacity-planning/labor-model"');
  });

  it("keeps the Training board search visible before opening the filter panel", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const visibleSearchIndex = source.indexOf('label="Search Training Board"');
    const filterPanelIndex = source.indexOf("showPctReadinessFilterPanel &&");
    const hiddenTaskSearchIndex = source.indexOf('label="Task or Category"');

    expect(visibleSearchIndex).toBeGreaterThan(0);
    expect(filterPanelIndex).toBeGreaterThan(visibleSearchIndex);
    expect(hiddenTaskSearchIndex).toBeGreaterThan(filterPanelIndex);
  });

  it("removes duplicate roster summary/output controls from the Roster source", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");

    expect(source).not.toContain("Staffing Matrix");
    expect(source).not.toContain("Roster Output");
    expect(source).not.toContain("Download Roster PDF");
    expect((source.match(/generatingRosterPdf \? "Generating PDF\.\.\." : "Roster PDF"/g) || []).length).toBe(1);
    expect(source).toContain("Roster PDF Contact Fields");
    expect(source).toContain("labor-roster-action-bar");
    expect(source).toContain("labor-roster-table");
  });

  it("keeps the inline new employee composer compact and active-only", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const composerStart = source.indexOf("New roster row");
    const composerEnd = source.indexOf("Your first employee", composerStart);
    const composerSource = source.slice(composerStart, composerEnd);

    expect(composerStart).toBeGreaterThan(0);
    expect(composerEnd).toBeGreaterThan(composerStart);
    expect(composerSource).toContain("labor-roster-new-grid");
    expect(composerSource).toContain("LaborCommitmentSegmentedPicker");
    expect(composerSource).toContain("labor-roster-new-field is-commitment");
    expect(composerSource).not.toContain("End Date");
    expect(source).not.toContain("newRosterEmployeeEndDate");
    expect(source).toContain("endDate: null,");
  });

  it("wires shirt size through the employee edit metadata and history path", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("setLaborEmployeeShirtSize(readLaborEmployeeShirtSize(employee) || \"\")");
    expect(source).toContain("shirtSize: laborEmployeeShirtSize");
    expect(source).toContain("const nextMetadata = buildUpdatedLaborMetadata(existingMetadata, updates)");
    expect(source).toContain("const previousShirtSize = readLaborEmployeeShirtSize({ metadata: existingMetadata })");
    expect(source).toContain("const historyEvent = buildLaborEmployeeShirtSizeHistoryEvent({");
    expect(source).toContain(".from(\"labor_employee_history_events\")");
    expect(source).toContain(".insert(historyEvent)");
    expect(source).toContain("readLaborEmployeeShirtSize(contactEmployee || row)");
    expect(source).toContain("getLaborShirtSizeLabel(employeeShirtSize)");
  });

  it("adds a Capacity Planning subpage selector for Staffing Capacity and Labor Model", () => {
    expect(CAPACITY_PLANNING_VIEWS.map((view) => view.id)).toEqual(["staffing-capacity", "labor-model"]);
    expect(CAPACITY_PLANNING_VIEWS.map((view) => view.label)).toEqual(["Staffing Capacity", "Labor Model"]);
    expect(normalizeCapacityPlanningView("labor-model")).toBe("labor-model");
    expect(normalizeCapacityPlanningView("legacy")).toBe("staffing-capacity");
    expect(buildLaborModulePanelKey({ tab: "hour-analysis", capacityPlanningView: "labor-model" })).toBe("hour-analysis:::labor-model");
    expect(buildLaborModulePanelKey({ tab: "hour-analysis", capacityPlanningView: "staffing-capacity" })).toBe("hour-analysis:::staffing-capacity");
  });

  it("renders Staffing Capacity before Headcount and uses neutral capacity variance copy", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
    const staffingHeading = 'title="Staffing Capacity Variance"';
    const headcountHeading = 'title="Headcount & Expected Hours"';

    expect(source.indexOf(staffingHeading)).toBeLessThan(source.indexOf(headcountHeading));
    expect(source).toContain("Capacity Variance");
    expect(source).toContain("CapacitySectionHeader");
    expect(source).toContain("staffingCapacityCollapsed");
    expect(source).toContain("outOfPositionCollapsed");
    expect(source).toContain("headcountExpectedCollapsed");
    expect(source.lastIndexOf("!headcountExpectedCollapsed && (", source.indexOf("Expected Hours By Person"))).toBeGreaterThan(0);
    expect(source).toContain("hour-analysis-capacity-row-metrics");
    expect(source).toContain("visual.statusLabel");
    expect(source).toContain("visual.statusDetail");
    expect(source).not.toContain("Gross Position Gap");
    expect(source).not.toContain("Expected hours measured against role targets from the Labor Model.");
    expect(source).not.toContain("Floor target");
    expect(source).not.toContain("20% Buffer Zone");
    expect(source).not.toContain("hour-analysis-capacity-legend");
    expect(source).not.toContain("<span>{visual.stateLabel}</span>");
    expect(source).not.toContain("true 20% frontline buffer above the operational floor");
    expect(source).not.toContain("hour-analysis-capacity-expected-label");
    expect(source).not.toContain("hour-analysis-capacity-marker-label");
    expect(source).not.toContain("hour-analysis-capacity-detail-popover");
    expect(source).not.toContain("hour-analysis-capacity-hover-zone is-expected");
    expect(source).not.toContain("updateHourAnalysisCapacityHover");
    expect(source).toContain("staffingCapacityRangeSummary");
    expect(source).toContain("Capacity Settings");
    expect(source).toContain("Tolerance defaults to");
    expect(source).toContain("hour-analysis-capacity-top-label");
    expect(source).toContain("hour-analysis-capacity-reference");
    expect(source).toContain("hour-analysis-capacity-dimension");
    expect(source).not.toContain("Expected / actual");
    expect(source).toContain("Lower range");
    expect(source).toContain("no target range");
    expect(source).not.toContain("hourAnalysisCapacityLayoutColumns");
    expect(source).not.toContain('"leadership" : "frontline"');
    expect(source).not.toContain("out-of-position-week-controls");
    expect(source).not.toContain(">Prev<");
    expect(source).not.toContain("This Week");
    expect(source).not.toContain(">Next<");
    const tableWrapStyle = source.match(/\.out-of-position-table-wrap\s*\{([^}]*)\}/s)?.[1] || "";
    expect(tableWrapStyle).toContain("max-height: none");
    expect(tableWrapStyle).toContain("overflow-y: visible");
    expect(tableWrapStyle).not.toContain("overflow: auto");
    expect(tableWrapStyle).not.toContain("overflow-y: auto");
  });

  it("defaults Out-of-Position Labor collapsed while keeping capacity and headcount sections expandable", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("useState({ outOfPositionLabor: true })");
    expect(source).toContain('toggleCapacitySection("outOfPositionLabor")');
    expect(source).toContain('toggleCapacitySection("staffingCapacityVariance")');
    expect(source).toContain('toggleCapacitySection("headcountExpectedHours")');
  });

  it("copies roster values through clipboard API and textarea fallback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyTextToClipboard("  Jane Smith <jane@example.com>  ", {
      navigator: { clipboard: { writeText } },
    })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Jane Smith <jane@example.com>");

    const textarea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    const activeElement = { focus: vi.fn() };
    const failingWriteText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));

    await expect(copyTextToClipboard("(555) 123-4567", {
      navigator: { clipboard: { writeText: failingWriteText } },
      document: {
        activeElement,
        body: { appendChild },
        createElement: vi.fn(() => textarea),
        execCommand,
      },
      window: { getSelection: () => ({ rangeCount: 0 }) },
    })).resolves.toBe(true);

    expect(failingWriteText).toHaveBeenCalledWith("(555) 123-4567");
    expect(appendChild).toHaveBeenCalledWith(textarea);
    expect(textarea.value).toBe("(555) 123-4567");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(activeElement.focus).toHaveBeenCalled();
  });

  it("formats signed capacity delta hours for surplus, deficit, and aligned states", () => {
    expect(formatHourAnalysisCapacityDelta(8.5)).toMatchObject({
      value: "+8.5 hrs",
      tone: "surplus",
      label: "Surplus capacity",
    });
    expect(formatHourAnalysisCapacityDelta(-208.5)).toMatchObject({
      value: "-208.5 hrs",
      tone: "short",
      label: "Short to target",
    });
    expect(formatHourAnalysisCapacityDelta(0)).toMatchObject({
      value: "0 hrs",
      tone: "even",
      label: "Aligned",
    });
  });

  it("builds Staffing Capacity row visuals with frontline target range and signed tones", () => {
    const frontlineShort = buildHourAnalysisCapacityRowVisualModel({
      key: "csr",
      expected: 18,
      requiredWeekly: 20,
      targetWeekly: 24,
      capacityStandard: {
        healthyLowWeekly: 23,
        targetWeekly: 24,
        healthyHighWeekly: 25,
        targetBufferPercent: 20,
      },
    });
    const frontlineDeficit = buildHourAnalysisCapacityRowVisualModel({
      key: "csr",
      expected: 20,
      requiredWeekly: 20,
      targetWeekly: 24,
      capacityStandard: {
        healthyLowWeekly: 23,
        targetWeekly: 24,
        healthyHighWeekly: 25,
        targetBufferPercent: 20,
      },
    });
    const frontlineInRange = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 47,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
      },
    });
    const frontlineOverTarget = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 49,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
      },
    });
    const frontlineAboveRange = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 54,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
      },
    });
    const adminSurplus = buildHourAnalysisCapacityRowVisualModel({
      key: "general_manager",
      expected: 12,
      requiredWeekly: 10,
      targetWeekly: 10,
    });
    const highVolumePct = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 420,
      requiredWeekly: 335.5,
      targetWeekly: 402.6,
      capacityStandard: {
        healthyLowWeekly: 385.8,
        targetWeekly: 402.6,
        healthyHighWeekly: 419.4,
        targetBufferPercent: 20,
      },
    });

    expect(frontlineShort).toMatchObject({
      roleLabel: "CSR",
      tone: "short",
      statusLabel: "Short",
      statusDetail: "5 hrs below lower range (2 hrs below floor)",
    });
    expect(frontlineDeficit).toMatchObject({
      roleLabel: "CSR",
      isFrontline: true,
      hasTargetRange: true,
      tone: "short",
      statusLabel: "Below range",
      deltaToTarget: -4,
      deltaToRange: -3,
      delta: { value: "-3 hrs", tone: "short", label: "Below target range" },
      targetLow: 23,
      targetHigh: 25,
    });
    expect(frontlineDeficit.bufferWidthPct).toBeGreaterThan(0);
    expect(frontlineDeficit.topLabels.map((label) => label.label)).toEqual([
      "Floor",
      "Lower range",
      "Target",
      "Upper range",
    ]);
    expect(frontlineDeficit.dimensionLines.map((line) => line.key)).toEqual([
      "expected",
      "floor",
      "target",
      "target-range",
    ]);
    expect(frontlineDeficit.dimensionLines[2]).toMatchObject({
      label: "4 hrs short to target",
      tone: "short",
    });
    expect(frontlineInRange).toMatchObject({
      roleLabel: "PCT",
      isFrontline: true,
      tone: "healthy",
      statusLabel: "In range",
      deltaToTarget: -1,
      deltaToRange: 0,
      delta: { value: "In range", tone: "healthy", label: "Target range" },
      targetLow: 46,
      targetHigh: 50,
    });
    expect(frontlineOverTarget).toMatchObject({
      roleLabel: "PCT",
      tone: "healthy",
      statusLabel: "Over target",
      statusDetail: "1 hr over target, still in range",
    });
    expect(frontlineAboveRange).toMatchObject({
      roleLabel: "PCT",
      isFrontline: true,
      tone: "surplus",
      statusLabel: "Over range",
      deltaToTarget: 6,
      deltaToRange: 4,
      delta: { value: "+4 hrs", tone: "surplus", label: "Above target range" },
    });
    expect(frontlineAboveRange.dimensionLines.map((line) => line.key)).toContain("overage");
    expect(highVolumePct.domainMin).toBeCloseTo(325.5);
    expect(highVolumePct.domainMax).toBeCloseTo(430);
    expect(highVolumePct.floorPct).toBeLessThan(12);
    expect(highVolumePct.expectedPct).toBeGreaterThan(89);
    expect(highVolumePct.topLabels.map((label) => label.key)).toEqual([
      "floor",
      "lower-range",
      "target",
      "upper-range",
    ]);
    expect(highVolumePct.topLabels.find((label) => label.key === "expected")).toBeUndefined();
    expect(adminSurplus).toMatchObject({
      roleLabel: "GM",
      isFrontline: false,
      hasTargetRange: false,
      hasSeparateTargetMetric: false,
      floorMetricLabel: "Floor / Target",
      tone: "surplus",
      statusLabel: "Above floor",
      deltaToTarget: 2,
      bufferWidthPct: 0,
      delta: { value: "+2 hrs", tone: "surplus" },
    });
    expect(adminSurplus.topLabels.map((label) => label.label)).toEqual(["Floor"]);
    expect(adminSurplus.dimensionLines.map((line) => line.key)).toEqual(["expected", "floor"]);
  });

  it("classifies Staffing Capacity tolerance without urgent short or over styling", () => {
    const gmSlightlyShort = buildHourAnalysisCapacityRowVisualModel({
      key: "general_manager",
      expected: 39.3,
      requiredWeekly: 40,
      targetWeekly: 40,
      capacityStandard: {
        floor: 40,
        targetWeekly: 40,
        targetBufferPercent: 0,
        tolerancePercent: 2,
      },
    });
    const gmOutsideTolerance = buildHourAnalysisCapacityRowVisualModel({
      key: "general_manager",
      expected: 38.9,
      requiredWeekly: 40,
      targetWeekly: 40,
      capacityStandard: {
        floor: 40,
        targetWeekly: 40,
        targetBufferPercent: 0,
        tolerancePercent: 2,
      },
    });
    const pctInRange = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 47,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
        tolerancePercent: 2,
      },
    });
    const pctSlightlyUnderRange = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 45.2,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
        tolerancePercent: 2,
      },
    });
    const pctOutsideUnderRange = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 44.8,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
        tolerancePercent: 2,
      },
    });
    const pctSlightlyOverRange = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 50.8,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
        tolerancePercent: 2,
      },
    });
    const pctOutsideOverRange = buildHourAnalysisCapacityRowVisualModel({
      key: "pct",
      expected: 51.2,
      requiredWeekly: 40,
      targetWeekly: 48,
      capacityStandard: {
        healthyLowWeekly: 46,
        targetWeekly: 48,
        healthyHighWeekly: 50,
        targetBufferPercent: 20,
        tolerancePercent: 2,
      },
    });

    expect(gmSlightlyShort).toMatchObject({
      tone: "healthy",
      statusLabel: "Within tolerance",
      delta: { value: "-0.7 hrs", tone: "healthy", label: "Within tolerance" },
      toleranceHours: 1,
      withinTolerance: true,
    });
    expect(gmSlightlyShort.statusDetail).toContain("0.7 hrs below floor / target");
    expect(gmOutsideTolerance).toMatchObject({
      tone: "short",
      statusLabel: "Short",
      delta: { value: "-1.1 hrs", tone: "short" },
      withinTolerance: false,
    });
    expect(pctInRange).toMatchObject({
      tone: "healthy",
      statusLabel: "In range",
      delta: { value: "In range", tone: "healthy" },
    });
    expect(pctSlightlyUnderRange).toMatchObject({
      tone: "healthy",
      statusLabel: "Within tolerance",
      delta: { value: "-0.8 hrs", tone: "healthy", label: "Within tolerance" },
      withinTolerance: true,
    });
    expect(pctOutsideUnderRange).toMatchObject({
      tone: "short",
      statusLabel: "Below range",
      delta: { value: "-1.2 hrs", tone: "short" },
    });
    expect(pctSlightlyOverRange).toMatchObject({
      tone: "healthy",
      statusLabel: "Within tolerance",
      delta: { value: "+0.8 hrs", tone: "healthy", label: "Within tolerance" },
      withinTolerance: true,
    });
    expect(pctOutsideOverRange).toMatchObject({
      tone: "surplus",
      statusLabel: "Over range",
      delta: { value: "+1.2 hrs", tone: "surplus" },
    });
  });

  it("normalizes configurable Staffing Capacity tolerance and buffer settings", () => {
    const normalized = normalizeStaffingCapacitySettings({
      roles: {
        general_manager: {
          tolerance_percent: "3.5",
          lower_buffer_percent: 12,
          upper_buffer_percent: 24,
        },
        csr: {
          tolerancePercent: 4,
          lower_buffer_percent: 30,
          target_buffer_percent: 26,
          upper_buffer_percent: 20,
        },
      },
    });

    expect(normalized.roles.general_manager).toMatchObject({
      tolerancePercent: 3.5,
      lowerBufferPercent: 0,
      targetBufferPercent: 0,
      upperBufferPercent: 0,
    });
    expect(normalized.roles.csr).toMatchObject({
      tolerancePercent: 4,
      lowerBufferPercent: 20,
      targetBufferPercent: 26,
      upperBufferPercent: 30,
      overRosteredBufferPercent: 30,
    });
    expect(normalized.roles.pct).toMatchObject({
      tolerancePercent: 2,
      lowerBufferPercent: 15,
      targetBufferPercent: 20,
      upperBufferPercent: 25,
    });
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

  it("preserves the current labor model when creating the default active saved model", () => {
    const emptyLaborDay = (day) => ({
      day_key: day,
      columns: [{ id: `${day}-slot`, label: "Closed", hours: 1 }],
      rows: [],
    });
    const currentSettings = normalizeHourAnalysisSettings({
      expectations: {
        csr: { full_time: { expected: 31 }, part_time: { expected: 16 } },
      },
      laborModel: {
        days: {
          monday: {
            day_key: "monday",
            columns: [{ id: "monday-open", label: "8-9a", hours: 1 }],
            rows: [{ id: "csr-open", group_key: "csr", role_label: "CSR", break_enabled: false, coverage: ["CSR"] }],
          },
          tuesday: emptyLaborDay("tuesday"),
          wednesday: emptyLaborDay("wednesday"),
          thursday: emptyLaborDay("thursday"),
          friday: emptyLaborDay("friday"),
          saturday: emptyLaborDay("saturday"),
          sunday: emptyLaborDay("sunday"),
        },
      },
    });
    const before = JSON.stringify(currentSettings);
    const payload = buildDefaultLaborCapacityModelPayload({
      locationId: "location-1",
      settings: currentSettings,
      actorUserId: "actor-1",
      actorName: "Zack",
      isActive: true,
    });
    const savedModel = normalizeLaborCapacityModelRow({
      id: "model-1",
      ...payload,
    });
    const model = buildHourAnalysisModel({ settings: savedModel.model_settings, rosterRows: [] });

    expect(JSON.stringify(currentSettings)).toBe(before);
    expect(payload).toMatchObject({
      location_id: "location-1",
      name: "Current Cherry Hill Operating Model",
      is_active: true,
      created_by_user_id: "actor-1",
      updated_by_user_id: "actor-1",
    });
    expect(savedModel.model_settings.expectations.csr.full_time.expected).toBe(31);
    expect(model.laborModelSummary.totalWeekly).toBe(1);
  });

  it("counts GM model coverage toward CSR without creating actual out-of-position labor", () => {
    const emptyLaborDay = (day) => ({ day_key: day, columns: [], rows: [] });
    const settings = normalizeHourAnalysisSettings({
      laborModel: {
        days: {
          monday: {
            day_key: "monday",
            columns: [
              { id: "monday-8", label: "8-9a", hours: 1 },
              { id: "monday-9", label: "9-10a", hours: 1 },
            ],
            rows: [
              {
                id: "gm-floor",
                group_key: "general_manager",
                role_label: "GM",
                break_enabled: false,
                coverage: ["CSR", "GM"],
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
      },
    });

    const model = buildHourAnalysisModel({ settings, rosterRows: [] });
    const crossRoleCoverage = buildLaborModelCrossRoleCoverageSummary(settings);
    const actualOutOfPosition = buildOutOfPositionLaborSummary({
      weekStart: "2026-05-04",
      employees: [{ id: "gm-1", full_name: "Gina Manager", position_title: "General Manager", employment_status: "active" }],
      staffPlans: [],
    });

    expect(model.laborModelSummary.roleWeekly.csr).toBe(1);
    expect(model.laborModelSummary.roleWeekly.general_manager).toBe(1);
    expect(crossRoleCoverage).toEqual([
      expect.objectContaining({
        key: "general_manager->csr",
        from_label: "GM",
        to_label: "CSR",
        hours: 1,
        slots: 1,
        day_labels: ["Mon"],
      }),
    ]);
    expect(actualOutOfPosition.totalShifts).toBe(0);
  });

  it("builds planned cross-role rows from active model coverage and expected-hours splits", () => {
    const rows = buildPlannedCrossRoleCoverageRows({
      modelCoverageRows: [
        { key: "assistant_manager->csr", from_label: "AM", to_label: "CSR", hours: 12, day_labels: ["Mon", "Tue"] },
      ],
      personRows: [
        {
          employeeKey: "gm-1",
          full_name: "Gina Manager",
          groupKey: "general_manager",
          groupLabel: "General Manager",
          preferredHours: 40,
          isSplit: true,
          split: {
            floor_group: "csr",
            primary_hours: 30,
            floor_hours: 10,
          },
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        key: "split:gm-1",
        type: "person_split",
        source_label: "Gina Manager",
        home_label: "General Manager",
        covers_label: "Customer Service Representative",
        hours: 10,
        detail_label: "30 General Manager + 10 Customer Service Representative",
      }),
      expect.objectContaining({
        key: "model:assistant_manager->csr",
        type: "model",
        source_label: "AM model row",
        home_label: "AM",
        covers_label: "CSR",
        hours: 12,
        detail_label: "Mon, Tue",
      }),
    ]);
  });

  it("keeps only one active labor model and isolates draft edits from Staffing Capacity", () => {
    const emptyLaborDay = (day) => ({
      day_key: day,
      columns: [{ id: `${day}-slot`, label: "Closed", hours: 1 }],
      rows: [],
    });
    const activeSettings = normalizeHourAnalysisSettings({
      laborModel: {
        days: {
          monday: {
            day_key: "monday",
            columns: [{ id: "slot-active", label: "8-6p", hours: 10 }],
            rows: [{ id: "active-csr", group_key: "csr", role_label: "CSR", break_enabled: false, coverage: ["CSR"] }],
          },
          tuesday: emptyLaborDay("tuesday"),
          wednesday: emptyLaborDay("wednesday"),
          thursday: emptyLaborDay("thursday"),
          friday: emptyLaborDay("friday"),
          saturday: emptyLaborDay("saturday"),
          sunday: emptyLaborDay("sunday"),
        },
      },
    });
    const draftSettings = normalizeHourAnalysisSettings({
      laborModel: {
        days: {
          monday: {
            day_key: "monday",
            columns: [{ id: "slot-draft", label: "8-4p", hours: 8 }],
            rows: [{ id: "draft-csr", group_key: "csr", role_label: "CSR", break_enabled: false, coverage: ["CSR"] }],
          },
          tuesday: emptyLaborDay("tuesday"),
          wednesday: emptyLaborDay("wednesday"),
          thursday: emptyLaborDay("thursday"),
          friday: emptyLaborDay("friday"),
          saturday: emptyLaborDay("saturday"),
          sunday: emptyLaborDay("sunday"),
        },
      },
    });
    const models = [
      { id: "active", location_id: "loc", name: "Active", is_active: true, model_settings: activeSettings },
      { id: "draft", location_id: "loc", name: "Draft", is_active: false, model_settings: draftSettings },
    ];

    const staffingSettings = selectStaffingCapacitySettings({
      models,
      editingModelId: "draft",
      editingSettings: draftSettings,
      legacySettings: draftSettings,
    });
    const staffingModel = buildHourAnalysisModel({ settings: staffingSettings, rosterRows: [] });

    expect(staffingModel.laborModelSummary.totalWeekly).toBe(10);

    const activated = applyLaborCapacityModelActivation(models, "draft");
    expect(activated.filter((model) => model.is_active)).toHaveLength(1);
    expect(activated.find((model) => model.id === "draft")).toMatchObject({ is_active: true });
    expect(activated.find((model) => model.id === "active")).toMatchObject({ is_active: false });

    const activeDraftSettings = selectStaffingCapacitySettings({
      models: activated,
      editingModelId: "draft",
      editingSettings: draftSettings,
      legacySettings: activeSettings,
    });
    expect(buildHourAnalysisModel({ settings: activeDraftSettings, rosterRows: [] }).laborModelSummary.totalWeekly).toBe(8);
  });

  it("aggregates out-of-position and unclassified schedule labor by shift and hours", () => {
    expect(calculateLaborShiftHours("10p", "2a")).toBe(4);

    const summary = buildOutOfPositionLaborSummary({
      weekStart: "2026-05-04",
      employees: [
        { full_name: "Gina Manager", position_title: "General Manager", employment_status: "active" },
        { full_name: "Sam Supervisor", position_title: "Supervisor", employment_status: "active" },
        { full_name: "Pat Tech", position_title: "Pet Care Technician", employment_status: "active" },
        { full_name: "Chris CSR", position_title: "Customer Service Representative", employment_status: "active" },
      ],
      staffPlans: [
        {
          id: "plan-1",
          plan_date: "2026-05-05",
          shift: "am",
          staff_names: [
            { id: "shift-1", name: "Gina Manager", position: "csr", shift_start: "7a", shift_end: "3p" },
            { id: "shift-2", name: "Sam Supervisor", position: "pct", shift_start: "8a", shift_end: "12p" },
            { id: "shift-3", name: "Pat Tech", position: "pct", shift_start: "9a", shift_end: "11a" },
            { id: "shift-4", name: "Unknown Person", position: "csr", shift_start: "10a", shift_end: "12p" },
            { id: "shift-5", name: "Chris CSR", position: "", shift_start: "10a", shift_end: "12p" },
          ],
        },
      ],
    });

    expect(summary).toMatchObject({
      weekStart: "2026-05-04",
      weekEnd: "2026-05-10",
      totalShifts: 2,
      totalHours: 12,
      unclassifiedShifts: 2,
      unclassifiedHours: 4,
    });
    expect(summary.topMismatches.map((item) => item.key)).toEqual(["GM -> CSR", "SUP -> PCT"]);
    expect(summary.rows.map((row) => row.employee_name)).toEqual([
      "Gina Manager",
      "Sam Supervisor",
      "Chris CSR",
      "Unknown Person",
    ]);
  });

  it("matches actual out-of-position labor by labor_employee_id before falling back to name", () => {
    const summary = buildOutOfPositionLaborSummary({
      weekStart: "2026-05-04",
      employees: [
        { id: "gm-1", full_name: "Gina Manager", position_title: "General Manager", employment_status: "active" },
        { id: "csr-1", full_name: "Gina Manager", position_title: "Customer Service Representative", employment_status: "active" },
      ],
      staffPlans: [
        {
          id: "plan-1",
          plan_date: "2026-05-05",
          shift: "am",
          staff_names: [
            {
              id: "shift-1",
              labor_employee_id: "gm-1",
              name: "Gina Manager",
              position: "csr",
              shift_start: "7a",
              shift_end: "3p",
            },
          ],
        },
      ],
    });

    expect(summary).toMatchObject({
      totalShifts: 1,
      totalHours: 8,
      unclassifiedShifts: 0,
    });
    expect(summary.topMismatches.map((item) => item.key)).toEqual(["GM -> CSR"]);
    expect(summary.rows[0]).toMatchObject({
      labor_employee_id: "gm-1",
      match_method: "labor_employee_id",
      home_role_key: "general_manager",
      worked_role_key: "csr",
      classification: "mismatch",
    });
  });

  it("normalizes labor capacity model versions newest first and summarizes snapshot changes", () => {
    const emptyLaborDay = (day) => ({ day_key: day, columns: [], rows: [] });
    const earlierSettings = normalizeHourAnalysisSettings({
      laborModel: {
        days: {
          monday: {
            day_key: "monday",
            columns: [{ id: "monday-8", label: "8-9a", hours: 1 }],
            rows: [{ id: "csr-floor", group_key: "csr", role_label: "CSR", break_enabled: false, coverage: ["CSR"] }],
          },
          tuesday: emptyLaborDay("tuesday"),
          wednesday: emptyLaborDay("wednesday"),
          thursday: emptyLaborDay("thursday"),
          friday: emptyLaborDay("friday"),
          saturday: emptyLaborDay("saturday"),
          sunday: emptyLaborDay("sunday"),
        },
      },
    });
    const currentSettings = normalizeHourAnalysisSettings({
      expectations: {
        csr: { full_time: { expected: 32 } },
      },
      laborModel: {
        days: {
          monday: {
            day_key: "monday",
            columns: [
              { id: "monday-8", label: "8-9a", hours: 1 },
              { id: "monday-9", label: "9-10a", hours: 1 },
            ],
            rows: [{ id: "csr-floor", group_key: "csr", role_label: "CSR", break_enabled: false, coverage: ["CSR", "CSR"] }],
          },
          tuesday: emptyLaborDay("tuesday"),
          wednesday: emptyLaborDay("wednesday"),
          thursday: emptyLaborDay("thursday"),
          friday: emptyLaborDay("friday"),
          saturday: emptyLaborDay("saturday"),
          sunday: emptyLaborDay("sunday"),
        },
      },
    });
    const versions = normalizeLaborCapacityModelVersions([
      { id: "version-1", model_id: "model-1", location_id: "loc", version_no: 1, model_name: "Active", model_settings_snapshot: earlierSettings, change_type: "create", created_at: "2026-05-11T10:00:00Z" },
      { id: "version-3", model_id: "model-1", location_id: "loc", version_no: 3, model_name: "Active", model_settings_snapshot: currentSettings, change_type: "autosave", created_at: "2026-05-11T10:05:00Z" },
      { id: "version-2", model_id: "model-1", location_id: "loc", version_no: 2, model_name: "Active", model_settings_snapshot: earlierSettings, change_type: "rename", created_at: "2026-05-11T10:03:00Z" },
    ]);
    const diff = summarizeLaborCapacityModelSnapshotDiff(currentSettings, earlierSettings);

    expect(versions.map((version) => version.version_no)).toEqual([3, 2, 1]);
    expect(diff).toEqual(expect.arrayContaining([
      "Weekly floor: 1 -> 2 hrs (+1)",
      "CSR floor: 1 -> 2 hrs (+1)",
      "CSR Full-Time expected: 30 -> 32 hrs",
    ]));
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

  it("searches training notes across note body, source, and verified actor fields", () => {
    const note = {
      employeeName: "Zach E. Cruz",
      noteType: "task_observation",
      sourceLabel: "Daycare Group Transitions",
      createdByName: "Zack Nisbet",
      noteText: "Needs another repetition on controlled gate movement.",
    };

    expect(noteMatchesSearch(note, "gate movement")).toBe(true);
    expect(noteMatchesSearch(note, "daycare group")).toBe(true);
    expect(noteMatchesSearch(note, "zack")).toBe(true);
    expect(noteMatchesSearch(note, "email only")).toBe(false);
  });

  it("builds Training History rows from note activity and prefers verified actor names", () => {
    const recordMap = {
      "record-1": {
        id: "record-1",
        labor_employee_id: "employee-1",
        employee_full_name: "Zach E. Cruz",
        template_name_snapshot: "PCT Team Readiness Board",
      },
    };
    const laborEmployeeMap = {
      "employee-1": { id: "employee-1", full_name: "Zach E. Cruz" },
    };
    const rows = buildTrainingHistoryRows({
      recordMap,
      laborEmployeeMap,
      getItemById: (itemId) => (itemId === "item-1" ? { id: "item-1", label: "Gate control" } : null),
      notes: [
        {
          id: "note-1",
          record_id: "record-1",
          template_item_id: "item-1",
          note_text: "Needs another repetition.",
          created_at: "2026-05-11T15:00:00Z",
          created_by_name: "zack@example.com",
          created_by_full_name: "Zack Nisbet",
        },
      ],
      events: [
        {
          id: "event-1",
          record_id: "record-1",
          template_item_id: "item-1",
          event_type: "note_added",
          created_at: "2026-05-11T15:00:00Z",
          actor_name: "zack@example.com",
          actor_full_name: "Zack Nisbet",
          after_state: { id: "note-1" },
        },
        {
          id: "event-2",
          record_id: "record-1",
          template_item_id: "item-1",
          event_type: "status_changed",
          created_at: "2026-05-11T14:00:00Z",
          actor_name: "zack@example.com",
          actor_full_name: "Zack Nisbet",
        },
      ],
    });

    expect(rows.map((row) => row.id)).toEqual(["note_note-1", "event_event-2"]);
    expect(rows[0]).toMatchObject({
      historyKind: "note",
      event_type: "task_note_added",
      employeeName: "Zach E. Cruz",
      actorDisplayName: "Zack Nisbet",
      summary: "Gate control: Needs another repetition.",
    });
    expect(rows[1]).toMatchObject({
      historyKind: "event",
      actorDisplayName: "Zack Nisbet",
      summary: "Gate control",
    });
  });

  it("builds Training History rows from location-joined event records and status transitions", () => {
    const rows = buildTrainingHistoryRows({
      getItemById: (itemId) => (itemId === "item-1" ? { id: "item-1", label: "Where everything is" } : null),
      events: [
        {
          id: "event-1",
          record_id: "record-1",
          template_item_id: "item-1",
          event_type: "item_status_changed",
          created_at: "2026-05-12T11:20:00Z",
          actor_name: "zach.cruz@k9resorts.com",
          training_records: {
            id: "record-1",
            labor_employee_id: "employee-1",
            employee_full_name: "Sarah Gonzalez",
            template_name_snapshot: "PCT Team Readiness Board",
          },
          before_state: { status: "not_started" },
          after_state: { status: "in_progress", metadata: { pct_readiness_status: "demonstrated" } },
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actionLabel: "Status changed",
      employeeName: "Sarah Gonzalez",
      summary: "Where everything is",
      statusChange: {
        previousLabel: "Not Started",
        nextLabel: "Demonstrated",
      },
    });
  });

  it("falls back to email only when no verified actor name is available", () => {
    expect(resolveVerifiedActorDisplayName({ actor_name: "manager@example.com" })).toBe("manager@example.com");
    expect(resolveVerifiedActorDisplayName({ actor_name: "manager@example.com", actor_full_name: "Maria Manager" })).toBe("Maria Manager");
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
    expect(model.totals.targetWeekly).toBe(82);
    expect(model.totals.healthyLowWeekly).toBe(79);
    expect(model.totals.healthyHighWeekly).toBe(85);
    expect(model.laborModelSummary.totalWeekly).toBe(70);
    expect(model.laborModelSummary.totalMarketingWeekly).toBe(10);
    expect(model.laborModelSummary.dayRows.find((day) => day.key === "monday")).toMatchObject({ marketingHours: 10 });
    expect(model.weeklyRows.find((row) => row.key === "general_manager")).toMatchObject({ reliefPercent: 0, requiredWeekly: 10, targetWeekly: 10, capacityStatus: { key: "admin_surplus" } });
    expect(model.weeklyRows.find((row) => row.key === "csr")).toMatchObject({ reliefPercent: 20, requiredWeekly: 20, targetWeekly: 24, capacityStatus: { key: "above_range" } });
    expect(model.weeklyRows.find((row) => row.key === "pct")).toMatchObject({ reliefPercent: 20, requiredWeekly: 40, targetWeekly: 48, capacityStatus: { key: "below_range" } });
    expect(model.totals.capacityStatus.key).toBe("above_range");
    expect(model.totals.capacityStatus.message).toContain("15-25% frontline target range");
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

  it("keeps labor model cells classification-only with row-aware default roles", () => {
    const source = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");

    expect(source).not.toContain('aria-label="Set half duration"');
    expect(source).not.toContain("onTextChange={(targetRowId");
    expect(source).toContain("labor-model-cell-position-section");
    expect(source).toContain("configuredGroups");
    expect(source).toContain("labor-model-role-color-settings");
    expect(source).toContain("Clear coverage cell");
    expect(source).toContain("Clear selected coverage cells");
    expect(source).toContain("Choose coverage position for selected cells");
    expect(source).toContain("labor-model-cell-tool is-delete");
    expect(source).not.toContain("labor-model-bulk-toolbar");

    expect(shouldCycleLaborModelCoveragePointer({ value: "", isFocused: false })).toBe(true);
    expect(shouldCycleLaborModelCoveragePointer({ value: "1", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "1", isFocused: true })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "0.5", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "0.5", isFocused: true })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "MKTG", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "MKTG", isFocused: true })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "PCT", isFocused: false })).toBe(false);
    expect(shouldCycleLaborModelCoveragePointer({ value: "PCT", isFocused: true })).toBe(false);

    expect(getLaborModelDefaultCoverageValueForRow("pct")).toBe("PCT");
    expect(buildLaborModelCoverageValue({ duration: "half", rowGroupKey: "pct" })).toBe("0.5:PCT");
    expect(normalizeLaborModelCoverageCell("0.5:PCT")).toBe("0.5:PCT");
    expect(getLaborModelCoverageDisplay("1", "csr")).toBe("CSR");
    expect(getLaborModelCoverageDisplay("0.5", "csr")).toBe("CSR");
    expect(getLaborModelCoverageDisplay("1", "pct")).toBe("PCT");
    expect(getLaborModelCoverageDisplay("0.5:PCT", "csr")).toBe("PCT");
    expect(setLaborModelCoverageDuration("PCT", "pct", "half")).toBe("0.5:PCT");
    expect(setLaborModelCoverageDuration("0.5:PCT", "pct", "full")).toBe("PCT");
    expect(setLaborModelCoveragePosition("0.5:PCT", "pct", "GM")).toBe("0.5:GM");
    expect(setLaborModelCoveragePosition("0.5:GM", "pct", "PCT")).toBe("0.5:PCT");
    expect(setLaborModelCoveragePosition("PCT", "pct", "MKTG")).toBe("MKTG");
    expect(makeLaborModelCellKey("monday", "row-1", 2)).toBe("monday::row-1::2");

    const roleColors = normalizeLaborModelRolePalette({
      csr: "#123",
      pct: { strong: "#0ea5e9", accent: "#38bdf8", soft: "#e0f2fe", text: "#0369a1" },
    });
    expect(roleColors.csr.strong).toBe("#112233");
    expect(roleColors.csr.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(roleColors.pct).toMatchObject({ strong: "#0ea5e9", accent: "#38bdf8", soft: "#e0f2fe", text: "#0369a1" });

    const normalizedSettings = normalizeHourAnalysisSettings({
      laborModelRoleColors: { csr: "#654321" },
    });
    expect(normalizedSettings.laborModelRoleColors.csr.strong).toBe("#654321");
  });
});

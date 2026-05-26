import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../kol/pages/TrainingPage.jsx", import.meta.url),
  "utf8"
);

const routerSource = readFileSync(
  new URL("../kol/KolApp.jsx", import.meta.url),
  "utf8"
);

const reviewGridSource = readFileSync(
  new URL("../kol/components/PerformanceReviewComplianceGrid.jsx", import.meta.url),
  "utf8"
);

describe("TrainingPage configurable compliance integration", () => {
  it("does not load training compliance requirements through hardcoded slug constants", () => {
    expect(source).not.toContain(".in(\"slug\", Object.values(LABOR_TRAINING_REQUIREMENT_SLUGS))");
    expect(source).toContain("get_labor_compliance_board");
    expect(source).toContain("laborCompliancePolicyRequirements");
  });

  it("renames the labor review module to Compliance with four subpages", () => {
    expect(source).toContain('{ id: "performance-reviews", label: "Compliance" }');
    expect(source).toContain("COMPLIANCE_VIEW_OPTIONS");
    expect(source).toContain('{ id: "employees", label: "Employees"');
    expect(source).toContain('{ id: "summary", label: "Summary"');
    expect(source).toContain('{ id: "requirements", label: "Requirements"');
    expect(source).toContain('{ id: "history", label: "History"');
    expect(source).not.toContain("Evidence-first checkpoint board");
    expect(source).not.toContain("Compliance totals and overdue checkpoints");
    expect(source).not.toContain("Review policy and custom yes/no columns");
    expect(source).not.toContain("Compliance audit trail");
    expect(source).toContain("hasSubtitles");
    expect(source).toContain('is-compact');
    expect(source).toContain('{ id: "reviews", label: "Compliance" }');
    expect(source).not.toContain('{ id: "reviews", label: "Performance" }');
    expect(source).toContain("CompactLaborTabSwitcher");
    expect(source).toContain("selectedEmployeeComplianceGridRow");
    expect(source).toContain("<ReviewCycleCell");
    expect(source).toContain("<PerformanceReviewComplianceGridStyles />");
    expect(source).toContain("employee-compliance-checkpoint-list");
    expect(source).toContain('employeeRecordTab === "training" && canUseLaborTab("training")');
    expect(source).toContain('employeeRecordTab === "training" && selectedLaborEmployeeSnapshot?.active_training_record_id');
    expect(source).toContain('variant="summary"');
    expect(source).toContain('case "open_checkpoints"');
    expect(reviewGridSource).toContain(".employee-compliance-checkpoint-row");
    expect(reviewGridSource).toContain("compliance-summary-table");
    expect(reviewGridSource).toContain("Open Checkpoints");
    expect(source).toContain("value={complianceView}");
    expect(source).toContain("onChange={changeComplianceView}");
  });

  it("renders compliance history with training-level detail and filters", () => {
    expect(source).toContain("buildComplianceHistoryRows");
    expect(source).toContain("complianceHistoryFilters");
    expect(source).toContain("Compliance History");
    expect(source).toContain("Activities logged");
    expect(source).toContain("Employees with activity");
    expect(source).toContain("Checkpoint / Requirement");
    expect(source).toContain("filteredComplianceHistoryRows");
    expect(source).toContain("updateComplianceHistoryFilter");
    expect(source).toContain("clearComplianceHistoryFilters");
    expect(source).toContain("normalizeComplianceHistoryActionLabel");
    expect(source).toContain("Compliance checkpoint");
    expect(source).not.toContain("Performance review completed</div>");
  });

  it("routes the renamed module through /labor/compliance", () => {
    expect(routerSource).toContain('"performance-reviews": "compliance"');
    expect(routerSource).toContain('compliance: "performance-reviews"');
    expect(routerSource).toContain("params.complianceView");
    expect(routerSource).toContain("prms?.complianceView");
  });

  it("derives compliance grid columns from resolved policy cycles", () => {
    expect(source).toContain("buildPerformanceReviewCyclesFromPolicy");
    expect(source).toContain("activePerformanceReviewCycles");
    expect(source).toContain("sortColumns={performanceReviewSortColumns}");
    expect(source).not.toContain("PERFORMANCE_REVIEW_CYCLES.map((cycle) =>");
    expect(source).not.toContain("columns={LABOR_PERFORMANCE_REVIEW_SORT_COLUMNS}");
  });

  it("keeps the employee grid free of the rejected legacy surfaces", () => {
    expect(source).not.toContain("Policy-generated checkpoints");
    expect(reviewGridSource).not.toContain("overviewCards.map");
    expect(reviewGridSource).not.toContain("filterChips.map");
    expect(reviewGridSource).not.toContain("statusColumn");
    expect(reviewGridSource).not.toContain("@chenglou/pretext");
    expect(reviewGridSource).toContain("labor-roster-action-bar");
    expect(reviewGridSource).toContain("labor-roster-table");
    expect(reviewGridSource).toContain("labor-roster-header-button");
    expect(reviewGridSource).toContain('active ? (direction === "desc" ? "↓" : "↑") : "↕"');
    expect(reviewGridSource).toContain("review-cycle-cell");
    expect(reviewGridSource).toContain("Verified / Qualified");
    expect(reviewGridSource).toContain('label: "Overdue"');
    expect(reviewGridSource).not.toContain("Evidence Due");
    expect(reviewGridSource).toContain("Date due");
    expect(reviewGridSource).toContain("Date waived");
    expect(reviewGridSource).toContain("Action date");
    expect(reviewGridSource).not.toContain("Action date pending");
    expect(reviewGridSource).toContain(".compliance-cycle-col {\n  width: 17%;");
    expect(reviewGridSource).toContain(".compliance-cycle-cell {\n  height: 1px;");
    expect(reviewGridSource).toContain("padding: 7px;");
    expect(reviewGridSource).toContain(".review-cycle-cell {\n  width: 100%;\n  height: 54px;");
    expect(reviewGridSource).toContain("padding: 7px 8px;");
    expect(reviewGridSource).toContain("<I.Search />");
    expect(reviewGridSource).toContain("compliance-filter-picker");
    expect(reviewGridSource).toContain('const DEFAULT_COMPLIANCE_FILTERS = { employment_status: { op: "is", val: "active" } };');
    expect(reviewGridSource).toContain('key: "employment_status", label: "Employment Status"');
    expect(reviewGridSource).toContain("matchEmploymentStatusFilter");
    expect(reviewGridSource).toContain("setFilters(DEFAULT_COMPLIANCE_FILTERS)");
    expect(reviewGridSource).toContain("Compliant");
    expect(reviewGridSource).toContain("inLastDays");
    expect(reviewGridSource).toContain("Requirements");
    expect(reviewGridSource).not.toContain("statusFilter");
    expect(reviewGridSource).not.toContain("onRefresh");
    expect(reviewGridSource).not.toContain("Refresh");
    expect(source).not.toContain("Open Gaps");
    expect(source).not.toContain("Coaching / Comments");
    expect(source).not.toContain("Incite Modules");
    expect(source).not.toContain("CPR Certification");
    expect(source).not.toContain("PPBC Level");
    expect(source).toContain("trainingRecordEmployeeStatusFilter");
    expect(source).toContain("visiblePctReadinessRecords");
    expect(source).toContain("getReadinessCellActorLine");
  });

  it("uses an in-place compliance checkpoint modal instead of routing cells to the old review page", () => {
    expect(source).toContain("complianceReviewEditorModal");
    expect(source).toContain('Modal title="Update Compliance Checkpoint"');
    expect(source).toContain('setCompletionMode("completed")');
    expect(source).toContain('setCompletionMode("waived")');
    expect(source).toContain("handleOpenComplianceReviewEditor");
    expect(source).toContain("handleSaveComplianceReviewCheckpoint");
    expect(source).toContain("handleUploadPerformanceReviewEvidence");
    expect(source).not.toContain("setSelectedReviewInstanceId(cycle.instance.id)");
  });

  it("saves custom Compliance cells directly instead of creating legacy review instances", () => {
    expect(source).toContain("isDirectComplianceRequirementCycle");
    expect(source).toContain("getReviewCycleRequirementId");
    expect(source).toContain('from("labor_compliance_evidence_links")');
    expect(source).toContain('from("labor_compliance_exceptions")');
    expect(source).toContain("if (isDirectComplianceRequirementCycle(reviewCycle))");
    expect(source).toContain("reviewInstance: null");
    expect(reviewGridSource).toContain("const isDirectRequirement");
    expect(reviewGridSource).toContain("if (hasCheckpoint || isDirectRequirement) onOpenEvidence(row, cycle);");
  });

  it("requires PDF evidence only for completed checkpoints", () => {
    expect(source).toContain('completionMode === "completed"');
    expect(source).toContain('completionMode === "waived"');
    expect(source).toContain("Upload the completed review PDF before saving this checkpoint");
    expect(source).toContain("complete_employee_review_instance");
  });

  it("turns the Requirements subpage into a custom Compliance column manager", () => {
    expect(source).toContain('complianceView === "requirements"');
    expect(source).toContain("Compliance Columns");
    expect(source).toContain("customCompliancePolicyRequirements");
    expect(source).toContain("defaultReviewComplianceRequirements");
    expect(source).toContain("Default review checkpoints");
    expect(source).toContain("canManageCompliancePolicy");
    expect(source).toContain("Add Column");
    expect(source).toContain("Edit Compliance Column");
    expect(source).toContain("handleDeleteComplianceRequirement");
    expect(source).toContain("isCustomComplianceRequirement");
    expect(source).toContain("Only custom Compliance columns can be deleted here");
    expect(source).toContain("Visible on Employees");
    expect(source).toContain("complianceRequirementEditorOpen");
    expect(source).toContain("complianceRequirementEditingRow");
    expect(source).toContain('from("labor_compliance_requirements")');
    expect(source).toContain(".update({");
    expect(source).toContain("is_active: false");
    expect(source).toContain('display_group: "custom"');
    expect(source).toContain('ui_kind: "custom_yes_no"');
    expect(source).not.toContain("Review policy");
    expect(source).not.toContain("Add Requirement");
    expect(source).not.toContain("Franchisor Training Guide");
    expect(source).not.toContain("Dog CPR Certification");
    expect(source).not.toContain("PPBC Level 1");
  });
});

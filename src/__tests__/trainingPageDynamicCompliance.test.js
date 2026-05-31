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

const performanceReviewDataSource = readFileSync(
  new URL("../kol/performanceReviewData.js", import.meta.url),
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
    expect(source).toContain("<ComplianceMetricsHeader metrics={complianceMetrics} />");
    expect(source).toContain('case "open_checkpoints"');
    expect(reviewGridSource).toContain(".employee-compliance-checkpoint-row");
    expect(reviewGridSource).toContain('variant === "summary"');
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
    expect(reviewGridSource).toContain("compliance-search-bar");
    expect(reviewGridSource).toContain("labor-roster-table");
    expect(reviewGridSource).toContain("labor-roster-header-button");
    expect(reviewGridSource).toContain('active ? (direction === "desc" ? "↓" : "↑") : "↕"');
    expect(reviewGridSource).toContain("review-cycle-cell");
    expect(reviewGridSource).toContain('label: "Complete"');
    expect(reviewGridSource).not.toContain("Verified / Qualified");
    expect(reviewGridSource).not.toContain("In Progress");
    expect(reviewGridSource).toContain('label: "Overdue"');
    expect(reviewGridSource).toContain('label: "Waived"');
    expect(reviewGridSource).toContain('label: "Not Started"');
    expect(reviewGridSource).not.toContain("Evidence Due");
    expect(reviewGridSource).toContain("No due date");
    expect(reviewGridSource).not.toContain("Date due");
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
    expect(source).toContain('setComplianceCompletionMode("completed")');
    expect(source).toContain('setComplianceCompletionMode("waived")');
    expect(source).toContain('setComplianceCompletionMode("not_started")');
    expect(source).toContain("completionModeRef.current");
    expect(source).toContain("const selectedCompletionMode = completionModeRef.current || completionMode");
    expect(source).toContain("handleOpenComplianceReviewEditor");
    expect(source).toContain("handleSaveComplianceReviewCheckpoint");
    expect(source).toContain("handleUploadPerformanceReviewEvidence");
    expect(source).toContain("handleSaveComplianceDueDate");
    expect(source).toContain("handleAddComplianceCellNote");
    expect(source).toContain("Cell History");
    expect(source).toContain("Add Note");
    expect(source).not.toContain("setSelectedReviewInstanceId(cycle.instance.id)");
  });

  it("keeps Compliance checkpoint saves from forcing a full labor page reload", () => {
    expect(source).toContain("const refreshLaborSupportData = useCallback");
    expect(source).toContain("await refreshLaborSupportData();");
    const saveStart = source.indexOf("const handleSaveComplianceReviewCheckpoint = useCallback");
    const saveEnd = source.indexOf("const closeComplianceRequirementEditor", saveStart);
    expect(saveStart).toBeGreaterThan(-1);
    expect(saveEnd).toBeGreaterThan(saveStart);
    const saveSource = source.slice(saveStart, saveEnd);
    expect(saveSource).not.toContain("await refreshLaborData();");
    expect(saveSource).not.toContain("refreshLaborData,");
    expect(saveSource).toContain("refreshLaborSupportData,");
  });

  it("guards compliance PDF viewing behind the dedicated Lite permission", () => {
    expect(source).toContain('"Labor Compliance View PDFs"');
    expect(source).toContain("canViewCompliancePdfs");
    expect(source).toContain("You do not have permission to view Compliance PDFs");
    expect(source).toContain("isCompliancePdfDocument(document) && !canViewCompliancePdfs");
    expect(source).toContain("!canViewCompliancePdfs ? \"PDF Restricted\" : renderingReviewPdf");
    expect(source).toContain("getReviewCycleEvidenceDocument");
    expect(source).toContain("handlePreviewComplianceReviewEvidenceDocument");
    expect(source).toContain("closeComplianceReviewEditor();\n    handlePreviewEmployeeDocument(document);");
    expect(source).toContain("onClick={() => handlePreviewComplianceReviewEvidenceDocument(complianceReviewEvidenceDocument)}");
    expect(source).toContain("function AttachmentPdfPreview");
    expect(source).toContain("const objectUrl = URL.createObjectURL(pdfBlob)");
    expect(source).toContain("URL.revokeObjectURL(objectUrlRef.current)");
    expect(source).toContain("<AttachmentPdfPreview");
    expect(source).toContain("src={`${previewState.objectUrl}#toolbar=1&navpanes=0&view=FitH`}");
    expect(source).toContain("\"Open PDF\"");
    expect(reviewGridSource).toContain("canViewPdfs = false");
    expect(reviewGridSource).toContain("getCompletionEvidence");
    expect(reviewGridSource).toContain("review-cycle-cell-evidence");
    expect(reviewGridSource).toContain("Compliance PDF restricted");
    expect(reviewGridSource).toContain("PDF restricted");
  });

  it("does not infer a waived cell from a generic completed date", () => {
    // After unification, the grid now imports and uses the canonical helper.
    expect(reviewGridSource).toContain("isWaivedLaborComplianceState");
    expect(reviewGridSource).toContain("from \"../performanceReviewData\"");
    // The old duplicated local logic should no longer be the decision maker.
    expect(reviewGridSource).not.toContain("const hasExplicitWaiver = completionMode === \"waived\"");
    // The data layer still exports the legacy wrapper for minimal churn.
    expect(performanceReviewDataSource).toContain("isWaivedLaborComplianceState");
    expect(performanceReviewDataSource).toContain("isWaivedPerformanceReviewRequirementStatus");
  });

  it("saves custom Compliance cells directly instead of creating legacy review instances", () => {
    expect(source).toContain("isDirectComplianceRequirementCycle");
    expect(source).toContain("getReviewCycleRequirementId");
    expect(source).toContain('supabase.rpc("set_labor_compliance_checkpoint_state"');
    expect(source).toContain('p_state: selectedCompletionMode');
    expect(source).toContain('p_state: "not_started"');
    expect(source).not.toContain('source_note: "Waived in Compliance grid"');
    expect(source).toContain("const directRequirement = isDirectComplianceRequirementCycle(reviewCycle)");
    expect(source).toContain("reviewInstance: null");
    expect(reviewGridSource).toContain("const isDirectRequirement");
    expect(reviewGridSource).toContain("if (hasCheckpoint || isDirectRequirement) onOpenEvidence(row, cycle);");
  });

  it("creates legacy review checkpoints with the configured legacy review cycle key", () => {
    expect(source).toContain("const legacyReviewCycle = getReviewCycleLegacyReviewCycle(reviewCycle)");
    expect(source).toContain("const reviewCycleKey = legacyReviewCycle");
    expect(source).toContain("metadata.legacy_review_cycle");
    expect(source).toContain("p_review_cycle: reviewCycle");
    expect(source).toContain("announce: false");
    expect(source).toContain("throwOnError: true");
  });

  it("keeps empty Compliance cell clicks read-only until the modal save action", () => {
    expect(source).toContain("const handleCreateComplianceReviewCheckpoint = useCallback(async (laborEmployee, reviewCycle) => {\n    handleOpenComplianceReviewEditor(laborEmployee, reviewCycle);\n    return null;");
    expect(source).toContain("!directRequirement && !legacyReviewCycle");
    expect(source).toContain("refresh: false");
    expect(source).toContain('selectedCompletionMode === "waived" && laborEmployeeId && requirementId');
    expect(source).toContain('p_state: "waived"');
    expect(source).toContain("getReviewCycleLegacyReviewCycle");
    expect(source).toContain("getReviewCycleInstanceKeys");
    expect(source).toContain("reviewInstanceMatchesReviewCycle");
    expect(source).toContain("relatedReviewInstanceIds");
    expect(source).toContain("setReviewInstances((prev)");
    const fileValidationIndex = source.indexOf('if (selectedCompletionMode === "completed") {\n        if (!performanceReviewEvidenceFile)');
    const instanceCreateIndex = source.indexOf("reviewInstance = await handleCreateReviewInstanceForEmployee", fileValidationIndex);
    const policyWaiverIndex = source.indexOf('selectedCompletionMode === "waived" && laborEmployeeId && requirementId');
    expect(fileValidationIndex).toBeGreaterThan(-1);
    expect(policyWaiverIndex).toBeGreaterThan(-1);
    expect(policyWaiverIndex).toBeLessThan(fileValidationIndex);
    expect(instanceCreateIndex).toBeGreaterThan(fileValidationIndex);
  });

  it("requires PDF evidence only for completed checkpoints", () => {
    expect(source).toContain('selectedCompletionMode === "completed"');
    expect(source).toContain('selectedCompletionMode === "waived"');
    expect(source).toContain("Upload the completed review PDF before saving this checkpoint");
    expect(source).toContain("complete_employee_review_instance");
  });

  it("turns the Requirements subpage into a custom Compliance column manager", () => {
    expect(source).toContain('complianceView === "requirements"');
    // Requirements is now a position matrix (one row per requirement, one column
    // per roster position) rather than the old "Compliance Columns" list.
    expect(source).toContain("compliancePositionColumns");
    expect(source).toContain("customCompliancePolicyRequirements");
    expect(source).toContain("defaultReviewComplianceRequirements");
    expect(source).toContain("Evidence Required?");
    expect(source).toContain("canManageCompliancePolicy");
    expect(source).toContain("Add Requirement");
    expect(source).toContain("Edit Compliance Column");
    expect(source).toContain("handleDeleteComplianceRequirement");
    expect(source).toContain("isCustomComplianceRequirement");
    expect(source).toContain("Only custom Compliance columns can be deleted here");
    expect(source).toContain("labor_compliance_role_applicability");
    expect(source).toContain("complianceRequirementEditorOpen");
    expect(source).toContain("complianceRequirementEditingRow");
    expect(source).toContain('from("labor_compliance_requirements")');
    expect(source).toContain(".update({");
    expect(source).toContain("is_active: false");
    // Custom columns persist a configurable display_group (resolved from the free-text group field).
    expect(source).toContain("display_group: resolveComplianceGroupKeyFromInput(complianceRequirementGroup)");
    expect(source).toContain("setComplianceRequirementGroup");
    expect(source).toContain('ui_kind: "custom_yes_no"');
    expect(source).not.toContain("Review policy");
    expect(source).not.toContain("Franchisor Training Guide");
    expect(source).not.toContain("Dog CPR Certification");
    expect(source).not.toContain("PPBC Level 1");
  });

  it("renders a dynamic Compliance metrics dashboard grouped by display_group", () => {
    // Roster-wide metrics builder, rendered as the Summary sub-view (not above the Employees grid).
    expect(performanceReviewDataSource).toContain("export function buildLaborComplianceMetrics");
    expect(performanceReviewDataSource).toContain("export function getLaborComplianceMetricState");
    expect(performanceReviewDataSource).toContain("COMPLIANCE_GROUP_LABELS");
    expect(source).toContain("buildLaborComplianceMetrics");
    expect(source).toContain("const complianceMetrics = useMemo");
    expect(source).toContain("const ComplianceMetricsHeader =");
    expect(source).toContain("<ComplianceMetricsHeader metrics={complianceMetrics} />");
    // The dashboard lives on Summary only: no variant wiring, and the Employees grid is unwrapped.
    expect(source).not.toContain("ComplianceMetricsHeader metrics={complianceMetrics} variant");
    // Headline metrics: # overdue leads, plus due-in-7-days and a compliant %.
    expect(source).toContain('label="Overdue"');
    expect(source).toContain('label="Due in 7 Days"');
    expect(source).toContain('label="Compliant"');
    // The bogus "in progress / started" surfaces are gone for compliance cells.
    expect(source).not.toContain("checkpoint evidence pending");
    expect(performanceReviewDataSource).not.toContain('label: "In Progress"');
    expect(reviewGridSource).not.toContain("is-in-progress");
  });

  it("surfaces requirement groups as a Requirements column and a creatable editor field", () => {
    expect(source).toContain("<th style={complianceTableHeaderStyle}>Group</th>");
    expect(source).toContain("getComplianceGroupLabel(requirement.display_group)");
    expect(source).toContain("colSpan={5 + compliancePositionColumns.length}");
    // Group is a free-text creatable combobox, not a fixed dropdown.
    expect(source).toContain("function ComplianceGroupCombobox");
    expect(source).toContain("<ComplianceGroupCombobox");
    expect(source).toContain("complianceGroupOptions");
    expect(source).toContain("resolveComplianceGroupKeyFromInput");
  });

  it("keeps a Compliance search header on every sub-view, not just Employees", () => {
    // Employees portals its grid search into the slot; the other sub-views render the header here so
    // the labor search region never goes empty when you switch sub-views.
    expect(source).toContain("const [complianceSearch, setComplianceSearch] = useState");
    expect(source).toContain('complianceView !== "employees"');
    expect(source).toContain('setComplianceSearch("")');
    // The shared header search filters each sub-view's own content.
    expect(source).toContain("visibleComplianceRequirements");
    expect(source).toContain("No requirements match your search.");
  });
});

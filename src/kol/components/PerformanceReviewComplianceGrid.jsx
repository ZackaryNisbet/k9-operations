import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { I } from "../../shared/icons";
import { LaborSearchBar } from "../../shared/ui";
import { isWaivedLaborComplianceState, getLaborComplianceCellState } from "../performanceReviewData";

const defaultFormatter = (value) => value || "-";
const identity = (value) => value;
const DEFAULT_COMPLIANCE_FILTERS = { employment_status: { op: "is", val: "active" } };
const FILTER_OP_LABELS = {
  contains: "contains",
  equals: "equals",
  starts: "starts with",
  empty: "is empty",
  notEmpty: "has value",
  is: "is",
  isNot: "is not",
  after: "after",
  before: "before",
  inLastDays: "in last days",
};
const REQUIREMENT_STATUS_OPTIONS = [
  { value: "compliant", label: "Compliant" },
  { value: "non-compliant", label: "Non-compliant" },
  { value: "completed", label: "Complete" },
  { value: "waived", label: "Waived" },
  { value: "overdue", label: "Overdue" },
  { value: "not-started", label: "Not Started" },
];

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeDateText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.includes("T") ? text.split("T")[0] : text;
}

function filterNeedsValue(op = "") {
  return !["empty", "notEmpty"].includes(op);
}

function getOptionValue(option) {
  return typeof option === "object" ? option.value : option;
}

function getOptionLabel(option) {
  return typeof option === "object" ? option.label : option;
}

function getCycleKey(cycle = {}) {
  return String(cycle.id || cycle.slug || cycle.requirementId || cycle.policyKey || cycle.label || "review");
}

function getCellKey(employeeId, cycle = {}) {
  return `${employeeId || "employee"}:${getCycleKey(cycle)}`;
}

export function getCompletionEvidence(cycle = {}) {
  const metadataEvidence = cycle.instance?.metadata?.completion_evidence && typeof cycle.instance.metadata.completion_evidence === "object"
    ? cycle.instance.metadata.completion_evidence
    : {};
  const evidence = Array.isArray(cycle.evidence) ? cycle.evidence[0] || {} : {};
  return {
    id: metadataEvidence.id || metadataEvidence.labor_employee_document_id || evidence.id || evidence.documentId || "",
    documentId: metadataEvidence.labor_employee_document_id || metadataEvidence.document_id || evidence.documentId || evidence.id || "",
    fileName: metadataEvidence.file_name || metadataEvidence.evidence_label || evidence.fileName || "",
    uploadedAt: metadataEvidence.uploaded_at || evidence.uploadedAt || cycle.evidenceUploadedAt || "",
    uploadedByName: evidence.uploadedByName || cycle.evidenceUploadedByName || cycle.instance?.reviewer_name || "",
    storageBucket: metadataEvidence.storage_bucket || evidence.storageBucket || "",
    storagePath: metadataEvidence.storage_path || evidence.storagePath || "",
    url: metadataEvidence.external_url || evidence.url || "",
    completedOn: cycle.completedDate || metadataEvidence.completed_on || "",
  };
}

function getCycleDueDate(cycle = {}) {
  return cycle.dueDate || cycle.instance?.due_date || cycle.policyDueDate || "";
}

function formatCellDate(value, formatDate = defaultFormatter) {
  const text = String(value || "").trim();
  return text ? formatDate(text.slice(0, 10)) : "-";
}

/**
 * LABOR COMPLIANCE CELL STATE — SINGLE CANONICAL (green-field simplification complete)
 *
 * All labor compliance cells (dynamic policy + legacy 30/60/90 mapped via board)
 * delegate exclusively to getLaborComplianceCellState on the board requirement shape.
 * Waived wins, server-computed status is trusted, legacy instances are content only.
 * Old dual isWaived / getCycleState waiver branches for labor items deleted.
 */
export function getCycleState(cycle = {}, recentAuditEvents = []) {
  // Broader detection for labor-backed cells, including fixed 30/60/90 that are mapped
  // to labor policy requirements (they often carry policyCell/requirementStatus from the board
  // even if they don't have requirementId on the cycle object itself).
  const hasLaborSignals = Boolean(
    cycle.boardRequirement ||
    cycle.policyCell ||
    cycle.requirementStatus ||
    cycle.exceptionKind ||
    cycle.exception_kind
  );
  const isLaborComplianceItem = hasLaborSignals || Boolean(cycle.requirementId || cycle.isDirectComplianceRequirement);

  if (isLaborComplianceItem) {
    // Labor compliance cells (including legacy 30/60/90 mapped via labor policy) are now 100% driven
    // by the single canonical getLaborComplianceCellState projecting the board requirement shape
    // (status + exception_kind from get_labor_compliance_board). Legacy instance is content only.
    // Old dual waiver detection deleted.
    const boardReq = cycle.boardRequirement || cycle.policyCell || cycle.requirementStatus || null;
    // If there is no board requirement for this employee+checkpoint, the requirement is not
    // applicable to their role (get_labor_compliance_board omits it). Do NOT fabricate Overdue
    // from a start-date-derived due date — render Not Applicable. Fixes role-restricted reviews
    // (e.g. 30/60/90) showing Overdue for roles they don't apply to, while a stale waiver shows
    // in the detail. (See diagnose: server is correct; the grid was inventing the Overdue.)
    if (!boardReq) {
      return { key: "not-applicable", icon: "–", label: "Not Applicable", detail: "Not required for this role" };
    }
    const canonical = getLaborComplianceCellState(boardReq, {
      reviewInstance: cycle.instance,
      recentAuditEvents,
    });

    // Safety net for overdue: if the canonical says not-started/in-progress but we have a past due date
    // on the cycle (common for 90-day after "Not Started" actions), force overdue. This matches user expectation.
    let finalState = canonical;
    const due = cycle.dueDate || boardReq?.due_date || boardReq?.dueDate;
    if ((canonical.key === "not-started" || canonical.key === "in_progress" || canonical.key === "not_started") && due) {
      const dueStr = String(due).slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (dueStr < today) {
        finalState = {
          key: "overdue",
          label: "Overdue",
          icon: "!",
          detail: `Due ${dueStr}`,
          isCompliant: false,
          color: "danger",
        };
      }
    }

    return {
      key: finalState.key,
      icon: finalState.icon,
      label: finalState.label,
      detail: finalState.detail,
    };
  }

  // Non-labor pure legacy performance review items (rare; most reviews now under labor policy board).
  // Kept for backward compat only. Labor items never reach this branch.
  const status = normalizeText(cycle.rawStatus || cycle.status || cycle.instance?.status);
  const evidence = getCompletionEvidence(cycle);
  const instanceMetadata = cycle.instance?.metadata && typeof cycle.instance.metadata === "object" ? cycle.instance.metadata : {};
  const policyMetadata = cycle.requirementStatus?.metadata && typeof cycle.requirementStatus.metadata === "object"
    ? cycle.requirementStatus.metadata
    : cycle.policyCell?.metadata && typeof cycle.policyCell.metadata === "object"
      ? cycle.policyCell.metadata
      : {};
  const completionMode = normalizeText(
    instanceMetadata.completion_mode
      || policyMetadata.completion_mode
      || cycle.completion_mode
      || cycle.completionMode
  );
  const completed = Boolean(cycle.completed || cycle.instance?.completed_at || evidence.completedOn);
  const hasCompletionEvidence = Boolean(evidence.completedOn || evidence.documentId || evidence.fileName || evidence.uploadedAt);
  const hasExplicitWaiver = isWaivedLaborComplianceState(cycle, cycle.instance, recentAuditEvents);
  const hasCompleteStatus = ["complete", "completed", "completed_late", "complete_late", "late_complete"].includes(status);
  const hasExplicitCompletion = completionMode === "completed"
    || hasCompleteStatus
    || (completed && hasCompletionEvidence && !hasExplicitWaiver);

  if (hasExplicitWaiver) {
    return { key: "waived", icon: "W", label: "Waived", detail: evidence.uploadedByName || "Manager override" };
  }
  if (hasExplicitCompletion || (completed && status !== "waived")) {
    return {
      key: cycle.completedLate ? "completed-late" : "completed",
      icon: "OK",
      label: "Complete",
      detail: evidence.uploadedByName || cycle.instance?.reviewer_name || evidence.fileName || "Evidence uploaded",
    };
  }
  if (completed) {
    return {
      key: cycle.completedLate ? "completed-late" : "completed",
      icon: "OK",
      label: "Complete",
      detail: evidence.uploadedByName || cycle.instance?.reviewer_name || evidence.fileName || "Evidence uploaded",
    };
  }
  if (cycle.overdue || status === "overdue") {
    return { key: "overdue", icon: "!", label: "Overdue", detail: cycle.dueDate ? `Due ${cycle.dueDate}` : "Past due" };
  }
  if (cycle.instance || status === "in_progress" || status === "scheduled") {
    return { key: "not-started", icon: "O", label: "Not Started", detail: cycle.dueDate ? `Due ${cycle.dueDate}` : "Checkpoint started" };
  }
  return { key: "not-started", icon: "O", label: "Not Started", detail: cycle.dueDate ? `Due ${cycle.dueDate}` : "No checkpoint" };
}

function isCompliantCycleState(stateKey = "") {
  return ["completed", "completed-late", "waived"].includes(stateKey);
}

function isCompliantRow(row = {}) {
  const cycles = Array.isArray(row.cycles) ? row.cycles : [];
  return cycles.length > 0 && cycles.every((cycle) => isCompliantCycleState(getCycleState(cycle).key));
}

function getOpenCheckpointCount(row = {}) {
  return toCycleRows(row).filter((cycle) => !isCompliantCycleState(getCycleState(cycle).key)).length;
}

function toCycleRows(row = {}) {
  return Array.isArray(row.cycles) ? row.cycles : [];
}

function getCycleByFilterKey(row = {}, filterKey = "") {
  const targetKey = String(filterKey || "").replace("requirement:", "");
  return toCycleRows(row).find((cycle) => getCycleKey(cycle) === targetKey);
}

function matchTextFilter(source, op, value) {
  const left = normalizeText(source);
  const right = normalizeText(value);
  if (op === "contains") return left.includes(right);
  if (op === "equals") return left === right;
  if (op === "starts") return left.startsWith(right);
  if (op === "empty") return !left;
  if (op === "notEmpty") return Boolean(left);
  return true;
}

function matchDateFilter(source, op, value) {
  const dateValue = normalizeDateText(source);
  if (!dateValue) return false;
  if (op === "after") return dateValue > value;
  if (op === "before") return dateValue < value;
  if (op === "inLastDays") {
    const days = Number.parseInt(value, 10);
    if (!Number.isFinite(days)) return true;
    const today = new Date();
    const diff = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(`${dateValue}T12:00:00`)) / 86400000);
    return diff >= 0 && diff <= days;
  }
  return true;
}

function matchSelectFilter(actualValue, op, value) {
  if (op === "is") return actualValue === value;
  if (op === "isNot") return actualValue !== value;
  return true;
}

function matchComplianceFilter(row, op, value) {
  const actualValue = isCompliantRow(row) ? "yes" : "no";
  return matchSelectFilter(actualValue, op, value);
}

function matchEmploymentStatusFilter(row, op, value) {
  if (value === "all") return true;
  const explicitStatus = normalizeText(row.employment_status);
  const status = explicitStatus || (row.is_active === false || row.active === false || row.end_date ? "inactive" : "active");
  return matchSelectFilter(status, op, value);
}

function matchRequirementFilter(row, key, op, value) {
  const cycle = getCycleByFilterKey(row, key);
  const stateKey = cycle ? getCycleState(cycle).key : "not-started";
  const actualValue = value === "compliant" || value === "non-compliant"
    ? (isCompliantCycleState(stateKey) ? "compliant" : "non-compliant")
    : stateKey === "completed-late" ? "completed" : stateKey;
  return matchSelectFilter(actualValue, op, value);
}

function getFilterValueLabel(field = {}, value = "") {
  const option = (field.options || []).find((candidate) => getOptionValue(candidate) === value);
  return option ? getOptionLabel(option) : value;
}

function getFilterFieldForKey(fields = [], key = "") {
  return fields.find((field) => field.key === key);
}

function filterRowMatches(row, fields, key, filter) {
  const field = getFilterFieldForKey(fields, key);
  if (!field || !filter) return true;
  const { op, val } = filter;
  if (filterNeedsValue(op) && val === "") return true;
  if (key === "position") return matchTextFilter(row.position_title, op, val);
  if (key === "start_date") return matchDateFilter(row.start_date, op, val);
  if (key === "employment_status") return matchEmploymentStatusFilter(row, op, val);
  if (key === "compliant") return matchComplianceFilter(row, op, val);
  if (String(key).startsWith("requirement:")) return matchRequirementFilter(row, key, op, val);
  return true;
}

function SortHeader({ label, columnKey, sort, onSort, align = "left" }) {
  const active = sort?.key === columnKey;
  const direction = active && sort?.direction === "desc" ? "desc" : "asc";
  const sortGlyph = active ? (direction === "desc" ? "↓" : "↑") : "↕";
  return (
    <button
      type="button"
      className={joinClassNames("labor-roster-header-button", active && "is-active")}
      onClick={() => onSort(columnKey)}
      style={{ justifyContent: align === "right" ? "flex-end" : "space-between" }}
    >
      <span>{label}</span>
      <span aria-hidden="true">{sortGlyph}</span>
    </button>
  );
}

export function ReviewCycleCell({
  row,
  cycle,
  onOpenEvidence,
  onCreateCheckpoint,
  canViewPdfs = false,
  formatDate = defaultFormatter,
  formatTimestamp = defaultFormatter,
  recentAuditEvents = [],
}) {
  const state = getCycleState(cycle, recentAuditEvents);
  const evidence = getCompletionEvidence(cycle);

  // Minimal extraction for display dates only (the old getCompletionWaiver was deleted
  // because state decisions no longer use it). Prefer board data when present.
  const waiver = (() => {
    const br = cycle.boardRequirement || {};
    const instWaiver = cycle.instance?.metadata?.completion_waiver || {};
    return {
      waivedOn: cycle.waivedOn ||
                br.completed_on ||
                br.waived_on ||
                instWaiver.waived_on ||
                instWaiver.waivedOn ||
                "",
      actorName: instWaiver.actor_name || instWaiver.actorName || cycle.instance?.reviewer_name || "",
    };
  })();

  const hasCheckpoint = Boolean(cycle.instance?.id);
  const isDirectRequirement = Boolean(cycle.isDirectComplianceRequirement || (cycle.requirementId && !cycle.legacyReviewCycle));

  // NOTE: State (including waived) is decided by getLaborComplianceCellState via getCycleState.
  // The waiver object below is only for display dates in the cell.
  const action = state.key === "waived"
    ? { label: "Date waived", value: waiver.waivedOn }
    : state.key === "completed" || state.key === "completed-late"
      ? { label: "Date completed", value: evidence.completedOn || cycle.instance?.completed_at || evidence.uploadedAt }
      : state.key === "in-progress"
        ? { label: "Action date", value: cycle.instance?.created_at || cycle.instance?.updated_at }
        : { label: "Action date", value: "" };
  const dueDate = getCycleDueDate(cycle);
  const dueLabel = dueDate ? `Due ${formatCellDate(dueDate, formatDate)}` : "No due date";
  const actionLabel = action.value ? `${action.label} ${formatCellDate(action.value, formatDate)}` : "";
  const uploadedLabel = evidence.uploadedAt ? `Uploaded ${formatTimestamp(evidence.uploadedAt)}` : "";
  const hasEvidencePdf = Boolean(evidence.fileName || evidence.uploadedAt);
  const evidenceActionDate = action.value ? formatCellDate(action.value, formatDate) : "";
  const evidenceActionLabel = evidenceActionDate && state.key === "waived"
    ? `Waived ${evidenceActionDate}`
    : evidenceActionDate && (state.key === "completed" || state.key === "completed-late")
      ? `Completed ${evidenceActionDate}`
      : evidenceActionDate;
  const evidenceTitle = canViewPdfs && evidence.fileName
    ? evidence.fileName
    : hasEvidencePdf
      ? "Compliance PDF restricted"
      : state.detail;

  return (

    <button
      type="button"
      className={joinClassNames("review-cycle-cell", `is-${state.key}`)}
      onClick={() => {
        if (hasCheckpoint || isDirectRequirement) onOpenEvidence(row, cycle);
        else onCreateCheckpoint(row, cycle);
      }}
      disabled={!hasCheckpoint && !isDirectRequirement && !row.template}
      title={evidenceTitle}
    >
      <span className="review-cycle-cell-token">
        <span className="review-cycle-cell-icon">{state.icon}</span>
        <span>{state.label}</span>
      </span>
      <span className="review-cycle-cell-detail">{dueLabel}</span>
      {canViewPdfs && evidence.fileName ? (
        <span className="review-cycle-cell-evidence">
          <I.FileText />
          <span className="review-cycle-cell-file">{evidence.fileName}</span>
          {evidenceActionLabel ? <span className="review-cycle-cell-evidence-date">{evidenceActionLabel}</span> : null}
        </span>
      ) : canViewPdfs && !evidence.fileName && uploadedLabel ? (
        <span className="review-cycle-cell-evidence">
          <I.FileText />
          <span className="review-cycle-cell-file">{uploadedLabel}</span>
          {evidenceActionLabel ? <span className="review-cycle-cell-evidence-date">{evidenceActionLabel}</span> : null}
        </span>
      ) : !canViewPdfs && hasEvidencePdf ? (
        <span className="review-cycle-cell-evidence is-restricted">
          <I.FileText />
          <span className="review-cycle-cell-file">PDF restricted</span>
          {evidenceActionLabel ? <span className="review-cycle-cell-evidence-date">{evidenceActionLabel}</span> : null}
        </span>
      ) : actionLabel ? (
        <span className="review-cycle-cell-detail">{actionLabel}</span>
      ) : null}
    </button>

  );
}

export default function PerformanceReviewComplianceGrid({
  rows = [],
  reviewCycles = [],
  sort = { key: "hierarchy", direction: "asc" },
  sortColumns = [],
  variant = "grid",
  searchSlot = null,
  onSortChange = () => {},
  onOpenEmployee = () => {},
  onOpenEvidence = () => {},
  onCreateCheckpoint = () => {},
  canViewPdfs = false,
  getEmployeeId = (row) => row?.id || row?.labor_employee_id || row?.full_name || "",
  formatDate = defaultFormatter,
  formatTimestamp = defaultFormatter,
  formatPhone = defaultFormatter,
  formatPosition = identity,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_COMPLIANCE_FILTERS);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_COMPLIANCE_FILTERS);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [filterPickerReady, setFilterPickerReady] = useState(false);
  const [configuringFilterKey, setConfiguringFilterKey] = useState("");
  const [searchText, setSearchText] = useState("");

  const filterFields = useMemo(() => ([
    { section: "Employment", key: "position", label: "Position", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
    { section: "Employment", key: "employment_status", label: "Employment Status", type: "select", ops: ["is", "isNot"], options: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }, { value: "all", label: "all" }] },
    { section: "Employment", key: "start_date", label: "Start Date", type: "date", ops: ["after", "before", "inLastDays"] },
    { section: "Compliance", key: "compliant", label: "Compliant", type: "select", ops: ["is", "isNot"], options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
    ...reviewCycles.map((cycle) => ({
      section: "Requirements",
      key: `requirement:${getCycleKey(cycle)}`,
      label: cycle.shortLabel ? `${cycle.shortLabel} Day` : cycle.label || "Requirement",
      type: "select",
      ops: ["is", "isNot"],
      options: REQUIREMENT_STATUS_OPTIONS,
    })),
  ]), [reviewCycles]);

  const draftFilterKeys = Object.keys(draftFilters || {});
  const activeFilterCount = Object.keys(filters || {}).length;
  const availableFilterFields = filterFields.filter((field) => !draftFilterKeys.includes(field.key));
  const filterSections = [...new Set(filterFields.map((field) => field.section))];

  const sortColumnLabels = useMemo(() => {
    const map = new Map();
    sortColumns.forEach((column) => map.set(column.key, column.label));
    reviewCycles.forEach((cycle) => {
      map.set(`review_cycle:${getCycleKey(cycle)}`, cycle.label || cycle.shortLabel || "Review");
      map.set(getCycleKey(cycle), cycle.label || cycle.shortLabel || "Review");
    });
    return map;
  }, [reviewCycles, sortColumns]);

  useEffect(() => {
    if (!filterPickerOpen) {
      setFilterPickerReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setFilterPickerReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [filterPickerOpen]);

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (query) {
        const haystack = [
          row.full_name,
          row.position_title,
          row.contact_email,
          row.contact_phone,
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return Object.keys(filters || {}).every((key) => filterRowMatches(row, filterFields, key, filters[key]));
    });
  }, [filterFields, filters, rows, searchText]);

  const requestSort = (key) => {
    const direction = sort?.key === key && sort?.direction !== "desc" ? "desc" : "asc";
    onSortChange({ key, direction });
  };

  const toggleFilterPanel = () => {
    setFilterOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) {
        setDraftFilters(filters);
        setFilterPickerOpen(false);
        setConfiguringFilterKey("");
      }
      return nextOpen;
    });
  };

  const removeDraftFilter = (key) => {
    setDraftFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (configuringFilterKey === key) setConfiguringFilterKey("");
  };

  const updateDraftFilter = (key, field, value) => {
    setDraftFilters((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  };

  const selectFilterField = (key) => {
    const field = getFilterFieldForKey(filterFields, key);
    if (!field) return;
    const op = field.ops[0];
    const val = field.type === "select" ? getOptionValue(field.options?.[0] || "") : "";
    setDraftFilters((current) => ({ ...current, [key]: { op, val } }));
    setConfiguringFilterKey(key);
    setFilterPickerOpen(false);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFilterOpen(false);
    setFilterPickerOpen(false);
    setConfiguringFilterKey("");
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_COMPLIANCE_FILTERS);
    setFilters(DEFAULT_COMPLIANCE_FILTERS);
    setFilterPickerOpen(false);
    setConfiguringFilterKey("");
  };

  const closeFilters = () => {
    setDraftFilters(filters);
    setFilterOpen(false);
    setFilterPickerOpen(false);
    setConfiguringFilterKey("");
  };

  return (
    <section className="performance-review-compliance-grid-shell" aria-label={variant === "summary" ? "Compliance summary table" : "Compliance employee grid"}>
      <PerformanceReviewComplianceGridStyles />
      {(() => { const __searchRow = (
      <div className="compliance-search-row">
        <LaborSearchBar value={searchText} onChange={setSearchText} placeholder="Search employees by name or position…">
          <button
            type="button"
            className={joinClassNames("compliance-filter-button", activeFilterCount > 0 && "is-active")}
            onClick={toggleFilterPanel}
          >
            <I.Search />
            <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
          </button>
        </LaborSearchBar>
        {variant !== "summary" ? (
          <div className="compliance-explainer">
            Every active employee and their review cadence. Search by name or position, use Filter for advanced views &amp; saved filters, or open a row for the full record. Each column maps to a required review or packet.
          </div>
        ) : null}
      </div>
      ); return searchSlot ? createPortal(__searchRow, searchSlot) : __searchRow; })()}

      {filterOpen ? (
        <div className="compliance-filter-panel">
          <div className="compliance-filter-body">
            {draftFilterKeys.length === 0 && !filterPickerOpen ? (
              <div className="compliance-filter-empty">
                <I.Search />
                <span>No filters active</span>
              </div>
            ) : null}

            {draftFilterKeys.length > 0 ? (
              <div className="compliance-filter-chip-list">
                {draftFilterKeys.map((key, index) => {
                  const field = getFilterFieldForKey(filterFields, key);
                  const filter = draftFilters[key];
                  if (!field || !filter) return null;
                  const isConfiguring = configuringFilterKey === key;
                  return (
                    <div key={key} className="compliance-filter-chip-wrap" style={{ animationDelay: `${index * 35}ms` }}>
                      <div className={joinClassNames("compliance-filter-chip", isConfiguring && "is-configuring")}>
                        <button
                          type="button"
                          className="compliance-filter-chip-name"
                          onClick={() => {
                            setConfiguringFilterKey(isConfiguring ? "" : key);
                            setFilterPickerOpen(false);
                          }}
                        >
                          {field.label}
                        </button>
                        <span className="compliance-filter-chip-op">{FILTER_OP_LABELS[filter.op] || filter.op}</span>
                        {filterNeedsValue(filter.op) ? (
                          <span className={joinClassNames("compliance-filter-chip-value", !filter.val && "is-missing")}>
                            {filter.val ? getFilterValueLabel(field, filter.val) : "set value"}
                          </span>
                        ) : null}
                        <button type="button" className="compliance-filter-chip-remove" onClick={() => removeDraftFilter(key)} aria-label={`Remove ${field.label} filter`}>
                          ×
                        </button>
                      </div>

                      {isConfiguring ? (
                        <div className="compliance-filter-config">
                          <div className="compliance-filter-config-block">
                            <span className="compliance-filter-config-label">Condition</span>
                            <div className="compliance-filter-options">
                              {field.ops.map((op) => (
                                <button
                                  key={op}
                                  type="button"
                                  className={joinClassNames("compliance-filter-option", filter.op === op && "is-selected")}
                                  onClick={() => {
                                    const nextValue = filterNeedsValue(op) ? filter.val : "";
                                    updateDraftFilter(key, "op", op);
                                    updateDraftFilter(key, "val", nextValue);
                                  }}
                                >
                                  {FILTER_OP_LABELS[op] || op}
                                </button>
                              ))}
                            </div>
                          </div>

                          {filterNeedsValue(filter.op) ? (
                            <div className="compliance-filter-config-block">
                              <span className="compliance-filter-config-label">Value</span>
                              {field.type === "select" ? (
                                <div className="compliance-filter-options">
                                  {(field.options || []).map((option) => {
                                    const optionValue = getOptionValue(option);
                                    return (
                                      <button
                                        key={optionValue}
                                        type="button"
                                        className={joinClassNames("compliance-filter-option", filter.val === optionValue && "is-selected")}
                                        onClick={() => updateDraftFilter(key, "val", optionValue)}
                                      >
                                        {getOptionLabel(option)}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <input
                                  className="compliance-filter-value-input"
                                  type={field.type === "date" ? (filter.op === "inLastDays" ? "number" : "date") : "text"}
                                  value={filter.val}
                                  onChange={(event) => updateDraftFilter(key, "val", event.target.value)}
                                  placeholder={filter.op === "inLastDays" ? "Number of days" : field.type === "date" ? "YYYY-MM-DD" : "Type a value"}
                                />
                              )}
                            </div>
                          ) : null}

                          <button type="button" className="compliance-filter-done-button" onClick={() => setConfiguringFilterKey("")}>
                            Done
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {!filterPickerOpen ? (
              <button
                type="button"
                className="compliance-filter-add-button"
                disabled={availableFilterFields.length === 0}
                onClick={() => {
                  setFilterPickerOpen(true);
                  setConfiguringFilterKey("");
                }}
              >
                <span>+</span>
                Add Filter
              </button>
            ) : (
              <div className="compliance-filter-picker">
                <div className="compliance-filter-picker-header">
                  <span>Choose a filter</span>
                  <button type="button" onClick={() => setFilterPickerOpen(false)} aria-label="Close filter picker">×</button>
                </div>
                <div className="compliance-filter-picker-body">
                  {filterSections.map((section, sectionIndex) => {
                    const sectionFields = availableFilterFields.filter((field) => field.section === section);
                    if (sectionFields.length === 0) return null;
                    return (
                      <div key={section} className="compliance-filter-picker-section" style={{ animationDelay: filterPickerReady ? `${sectionIndex * 45}ms` : "0ms" }}>
                        <div className="compliance-filter-picker-section-title">{section}</div>
                        <div className="compliance-filter-picker-field-list">
                          {sectionFields.map((field, fieldIndex) => (
                            <button
                              key={field.key}
                              type="button"
                              className="compliance-filter-picker-field"
                              onClick={() => selectFilterField(field.key)}
                              style={{ animationDelay: filterPickerReady ? `${sectionIndex * 45 + fieldIndex * 30}ms` : "0ms" }}
                            >
                              {field.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="compliance-filter-footer">
            <button type="button" className="compliance-filter-apply-button" onClick={applyFilters}>
              Apply{draftFilterKeys.length > 0 ? ` (${draftFilterKeys.length})` : ""}
            </button>
            {draftFilterKeys.length > 0 ? (
              <button type="button" className="compliance-filter-secondary-button" onClick={clearFilters}>
                Clear All
              </button>
            ) : null}
            <button type="button" className="compliance-filter-secondary-button is-muted" onClick={closeFilters}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {variant === "summary" ? (
        <div className="labor-roster-table-card compliance-table-card">
          <table className="labor-roster-table compliance-summary-table">
            <colgroup>
              <col className="compliance-summary-name-col" />
              <col className="compliance-summary-position-col" />
              <col className="compliance-summary-status-col" />
              <col className="compliance-summary-open-col" />
            </colgroup>
            <thead>
              <tr>
                <th className="labor-roster-table-heading compliance-name-heading">
                  <SortHeader label="Name" columnKey="employee" sort={sort} onSort={requestSort} />
                </th>
                <th className="labor-roster-table-heading compliance-position-heading">
                  <SortHeader label="Position" columnKey="position" sort={sort} onSort={requestSort} />
                </th>
                <th className="labor-roster-table-heading compliance-summary-status-heading">
                  <SortHeader label="Compliance" columnKey="compliance" sort={sort} onSort={requestSort} />
                </th>
                <th className="labor-roster-table-heading compliance-summary-open-heading">
                  <SortHeader label="Open Checkpoints" columnKey="open_checkpoints" sort={sort} onSort={requestSort} align="right" />
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const employeeId = getEmployeeId(row);
                const contact = row.contact_phone ? formatPhone(row.contact_phone) : row.contact_email || "";
                const compliance = row.performance_review_compliance || {};
                const statusTone = normalizeText(compliance.color || compliance.label || "default").replace(/[^a-z0-9]+/g, "-") || "default";
                return (
                  <tr key={employeeId || row.full_name} className="labor-roster-row">
                    <td className="labor-roster-name-cell compliance-name-cell">
                      <button type="button" className="compliance-employee-button" onClick={() => onOpenEmployee(row, employeeId)}>
                        <strong>{row.full_name || "Employee"}</strong>
                        <small>{contact || "No contact on file"}</small>
                      </button>
                    </td>
                    <td className="labor-roster-secondary-cell compliance-position-cell">{formatPosition(row.position_title || "") || "-"}</td>
                    <td className="labor-roster-secondary-cell compliance-summary-status-cell">
                      <span className={joinClassNames("compliance-summary-status", `is-${statusTone}`)}>
                        {compliance.label || "Not configured"}
                      </span>
                    </td>
                    <td className="labor-roster-secondary-cell compliance-summary-open-cell">{getOpenCheckpointCount(row)}</td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="labor-roster-secondary-cell">
                    No employees match the current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="labor-roster-table-card compliance-table-card">
          <table className="labor-roster-table compliance-review-table">
          <colgroup>
            <col className="compliance-name-col" />
            <col className="compliance-position-col" />
            <col className="compliance-start-col" />
            {reviewCycles.map((cycle) => <col key={getCycleKey(cycle)} className="compliance-cycle-col" />)}
          </colgroup>
          <thead>
            <tr>
              <th className="labor-roster-table-heading compliance-name-heading">
                <SortHeader label="Name" columnKey="employee" sort={sort} onSort={requestSort} />
              </th>
              <th className="labor-roster-table-heading compliance-position-heading">
                <SortHeader label="Position" columnKey="position" sort={sort} onSort={requestSort} />
              </th>
              <th className="labor-roster-table-heading compliance-start-heading">
                <SortHeader label="Start Date" columnKey="start_date" sort={sort} onSort={requestSort} />
              </th>
              {reviewCycles.map((cycle) => {
                const cycleKey = getCycleKey(cycle);
                const sortKey = `review_cycle:${cycleKey}`;
                return (
                  <th key={cycleKey} className="labor-roster-table-heading compliance-cycle-heading">
                    <SortHeader label={sortColumnLabels.get(sortKey) || cycle.label || "Review"} columnKey={sortKey} sort={sort} onSort={requestSort} />
                  </th>
                );
              })}
              {reviewCycles.length === 0 ? <th className="labor-roster-table-heading">No checkpoints configured</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const employeeId = getEmployeeId(row);
              const contact = row.contact_phone ? formatPhone(row.contact_phone) : row.contact_email || "";
              return (
                <tr key={employeeId || row.full_name} className="labor-roster-row">
                  <td className="labor-roster-name-cell compliance-name-cell">
                    <button type="button" className="compliance-employee-button" onClick={() => onOpenEmployee(row, employeeId)}>
                      <strong>{row.full_name || "Employee"}</strong>
                      <small>{contact || "No contact on file"}</small>
                    </button>
                  </td>
                  <td className="labor-roster-secondary-cell compliance-position-cell">{formatPosition(row.position_title || "") || "-"}</td>
                  <td className="labor-roster-secondary-cell compliance-start-cell is-nowrap">{formatDate(row.start_date)}</td>
                  {toCycleRows(row).map((cycle) => (
                    <td key={getCellKey(employeeId, cycle)} className="compliance-cycle-cell">
                      <ReviewCycleCell
                        row={row}
                        cycle={cycle}
                        onOpenEvidence={onOpenEvidence}
                        onCreateCheckpoint={onCreateCheckpoint}
                        canViewPdfs={canViewPdfs}
                        formatDate={formatDate}
                        formatTimestamp={formatTimestamp}
                      />
                    </td>
                  ))}
                  {reviewCycles.length === 0 ? (
                    <td className="labor-roster-secondary-cell">No checkpoints configured</td>
                  ) : null}
                </tr>
              );
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(4, 3 + reviewCycles.length)} className="labor-roster-secondary-cell">
                  No employees match the current filter.
                </td>
              </tr>
            ) : null}
          </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PerformanceReviewComplianceGridStyles() {
  return (
    <style>{`
.performance-review-compliance-grid-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.compliance-search-row {
  display: flex;
  flex-direction: column;
}
.compliance-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  background: #F8FAFC;
  border-bottom: 1.5px solid #F1F5F9;
}
.compliance-search-field {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: #1A1D23;
  padding: 12px 4px;
}
.compliance-search-field::placeholder {
  color: #94a3b8;
  font-family: inherit;
  font-weight: 500;
  opacity: 1;
}
.compliance-search-clear {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
  flex-shrink: 0;
}
.compliance-search-clear:hover {
  color: #475569;
}
.compliance-filter-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  border: 1.5px solid #d9e2ec;
  border-radius: 8px;
  background: #fff;
  color: #475569;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 12px;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
}
.compliance-filter-button svg {
  width: 14px;
  height: 14px;
}
.compliance-filter-button:hover {
  border-color: #14532D;
  color: #14532D;
}
.compliance-filter-button.is-active {
  border-color: #14532D;
  background: rgba(20, 83, 45, 0.06);
  color: #14532D;
}
.compliance-explainer {
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(20, 83, 45, 0.06), #ffffff);
  font-size: 12px;
  line-height: 1.6;
  color: #475569;
}
.compliance-filter-panel {
  border: 1.5px solid #d9e2ec;
  border-radius: 14px;
  background: #f8fafc;
  box-shadow: 0 8px 40px rgba(15, 23, 42, 0.08);
  overflow: hidden;
  animation: complianceFilterSlideIn 220ms ease-out;
}
.compliance-filter-body {
  padding: 14px 18px;
}
.compliance-filter-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  color: #64748b;
  font-size: 13px;
  font-weight: 650;
  animation: complianceFilterFadeIn 180ms ease-out;
}
.compliance-filter-empty svg {
  width: 17px;
  height: 17px;
}
.compliance-filter-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.compliance-filter-chip-wrap {
  animation: complianceFilterChipIn 220ms ease-out both;
}
.compliance-filter-chip {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border: 1.5px solid #d9e2ec;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}
.compliance-filter-chip.is-configuring {
  border-color: rgba(20, 83, 45, 0.34);
  background: rgba(240, 253, 244, 0.72);
  box-shadow: 0 0 0 3px rgba(20, 83, 45, 0.06);
}
.compliance-filter-chip-name,
.compliance-filter-chip-remove,
.compliance-filter-picker-header button {
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}
.compliance-filter-chip-name {
  padding: 7px 10px;
  color: #14532d;
  font-size: 11px;
  font-weight: 850;
}
.compliance-filter-chip-op {
  margin-right: 6px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(20, 83, 45, 0.08);
  color: #14532d;
  font-size: 10px;
  font-weight: 850;
  white-space: nowrap;
}
.compliance-filter-chip-value {
  padding: 7px 8px 7px 0;
  color: #0f172a;
  font-size: 11px;
  font-weight: 720;
  white-space: nowrap;
}
.compliance-filter-chip-value.is-missing {
  color: #b45309;
  font-style: italic;
  font-weight: 650;
}
.compliance-filter-chip-remove {
  padding: 6px 8px 6px 2px;
  color: #64748b;
  font-size: 17px;
  line-height: 1;
}
.compliance-filter-config {
  margin-top: 6px;
  max-width: 720px;
  border: 1.5px solid rgba(20, 83, 45, 0.18);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 6px 24px rgba(20, 83, 45, 0.1);
  padding: 10px 14px;
  animation: complianceFilterSlideIn 220ms ease-out;
}
.compliance-filter-config-block {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}
.compliance-filter-config-label,
.compliance-filter-picker-section-title {
  color: #64748b;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.compliance-filter-options,
.compliance-filter-picker-field-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.compliance-filter-option,
.compliance-filter-picker-field {
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font-family: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}
.compliance-filter-option {
  padding: 5px 12px;
}
.compliance-filter-option:hover,
.compliance-filter-picker-field:hover {
  border-color: rgba(20, 83, 45, 0.3);
  color: #14532d;
  transform: translateY(-1px);
}
.compliance-filter-option.is-selected {
  border-color: #14532d;
  background: #14532d;
  color: #fff;
}
.compliance-filter-value-input {
  width: min(220px, 100%);
  border: 1.5px solid #d9e2ec;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font-family: inherit;
  font-size: 13px;
  font-weight: 650;
  padding: 8px 12px;
}
.compliance-filter-value-input:focus {
  border-color: rgba(20, 83, 45, 0.38);
  box-shadow: 0 0 0 3px rgba(20, 83, 45, 0.08);
  outline: none;
}
.compliance-filter-done-button,
.compliance-filter-apply-button,
.compliance-filter-secondary-button,
.compliance-filter-add-button {
  border-radius: 10px;
  font-family: inherit;
  cursor: pointer;
}
.compliance-filter-done-button {
  border: 0;
  background: #14532d;
  color: #fff;
  font-size: 11px;
  font-weight: 850;
  padding: 7px 14px;
}
.compliance-filter-add-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1.5px dashed #14532d;
  background: transparent;
  color: #14532d;
  font-size: 12px;
  font-weight: 850;
  padding: 8px 16px;
}
.compliance-filter-add-button:disabled {
  border-color: #cbd5e1;
  color: #94a3b8;
  cursor: default;
}
.compliance-filter-add-button span {
  font-size: 15px;
  line-height: 1;
}
.compliance-filter-picker {
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
  overflow: hidden;
  animation: complianceFilterSlideIn 220ms ease-out;
}
.compliance-filter-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 850;
}
.compliance-filter-picker-header button {
  color: #64748b;
  font-size: 17px;
  line-height: 1;
}
.compliance-filter-picker-body {
  display: grid;
  gap: 2px;
  padding: 6px 0;
}
.compliance-filter-picker-section {
  animation: complianceFilterFadeIn 180ms ease-out both;
}
.compliance-filter-picker-section-title {
  padding: 8px 16px 4px;
}
.compliance-filter-picker-field-list {
  padding: 4px 16px 8px;
}
.compliance-filter-picker-field {
  padding: 6px 14px;
  animation: complianceFilterChipIn 220ms ease-out both;
}
.compliance-filter-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 10px 18px;
}
.compliance-filter-apply-button {
  border: 0;
  background: #14532d;
  color: #fff;
  font-size: 12px;
  font-weight: 850;
  padding: 8px 20px;
  box-shadow: 0 2px 12px rgba(20, 83, 45, 0.2);
}
.compliance-filter-secondary-button {
  border: 1.5px solid #d9e2ec;
  background: transparent;
  color: #334155;
  font-size: 12px;
  font-weight: 720;
  padding: 8px 14px;
}
.compliance-filter-secondary-button.is-muted {
  color: #64748b;
}
.compliance-table-card {
  overflow: auto;
}
.compliance-review-table {
  table-layout: fixed;
  min-width: max(1040px, 100%);
}
.compliance-summary-table {
  table-layout: fixed;
  min-width: max(860px, 100%);
}
.employee-compliance-review-table {
  width: 100%;
  min-width: 760px;
}
.compliance-name-col {
  width: 18%;
}
.compliance-summary-name-col {
  width: 26%;
}
.employee-compliance-review-table .compliance-name-col {
  width: 22%;
}
.compliance-position-col {
  width: 16%;
}
.compliance-summary-position-col {
  width: 28%;
}
.compliance-summary-status-col {
  width: 22%;
}
.compliance-summary-open-col {
  width: 24%;
}
.compliance-start-col {
  width: 12%;
}
.compliance-cycle-col {
  width: 17%;
}
.employee-compliance-review-table .compliance-cycle-col {
  width: 26%;
}
.compliance-cycle-heading,
.compliance-cycle-cell {
  min-width: 178px;
}
.compliance-cycle-cell {
  height: 1px;
  padding: 7px;
  border-bottom: 1px solid #eef2f7;
  background: #fff;
  vertical-align: top;
}
.employee-compliance-review-table .compliance-cycle-heading,
.employee-compliance-review-table .compliance-cycle-cell {
  min-width: 0;
}
.employee-compliance-checkpoint-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.employee-compliance-checkpoint-row {
  display: grid;
  grid-template-columns: minmax(118px, 150px) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
.employee-compliance-checkpoint-label {
  display: flex;
  align-items: center;
  min-height: 62px;
  padding: 10px 0;
  color: #0f172a;
  font-size: 16px;
  font-weight: 950;
  line-height: 1.15;
}
.employee-compliance-checkpoint-cell {
  min-width: 0;
}
.employee-compliance-checkpoint-cell .review-cycle-cell {
  min-height: 54px;
}
.compliance-position-cell,
.compliance-start-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compliance-summary-status-cell {
  white-space: nowrap;
}
.compliance-summary-open-cell {
  color: #0f172a;
  font-size: 13px;
  font-weight: 950;
  text-align: right;
}
.compliance-summary-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}
.compliance-summary-status.is-danger,
.compliance-summary-status.is-non-compliant {
  background: #fef2f2;
  color: #dc2626;
}
.compliance-summary-status.is-success,
.compliance-summary-status.is-compliant {
  background: #dcfce7;
  color: #15803d;
}
.compliance-summary-status.is-warning,
.compliance-summary-status.is-in-progress {
  background: #fef3c7;
  color: #b45309;
}
.compliance-summary-status.is-info {
  background: #dbeafe;
  color: #1d4ed8;
}
.compliance-employee-button {
  display: grid;
  gap: 3px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}
.compliance-employee-button:hover strong,
.compliance-employee-button:focus-visible strong {
  color: #14532d;
}
.review-cycle-cell {
  width: 100%;
  height: 54px;
  min-height: 54px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  border: 1px solid #dbe4ef;
  border-radius: 8px;
  background: #f8fafc;
  color: #475569;
  font-family: inherit;
  text-align: left;
  padding: 7px 8px;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
.review-cycle-cell:not(:disabled):hover,
.review-cycle-cell:not(:disabled):focus-visible {
  border-color: #8fb0d6;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.review-cycle-cell:disabled {
  cursor: not-allowed;
  opacity: .62;
}
.review-cycle-cell.is-completed,
.review-cycle-cell.is-completed-late {
  background: #dcfce7;
  border-color: #bbf7d0;
  color: #15803d;
}
.review-cycle-cell.is-waived {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #475569;
}
.review-cycle-cell.is-in-progress {
  background: #e0f2fe;
  border-color: #bae6fd;
  color: #0369a1;
}
.review-cycle-cell.is-overdue {
  background: #fef3c7;
  border-color: #fde68a;
  color: #b45309;
}
.review-cycle-cell-token {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 950;
  line-height: 1.1;
}
.review-cycle-cell-icon {
  min-width: 20px;
  font-size: 10px;
  font-weight: 950;
}
.review-cycle-cell-detail,
.review-cycle-cell-file {
  display: block;
  color: currentColor;
  opacity: .78;
  font-size: 10.5px;
  font-weight: 760;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.review-cycle-cell-evidence {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  color: currentColor;
  opacity: .78;
  font-size: 10.5px;
  font-weight: 760;
  line-height: 1.15;
  white-space: nowrap;
}
.review-cycle-cell-evidence svg {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  stroke-width: 2.25;
}
.review-cycle-cell-evidence .review-cycle-cell-file {
  min-width: 0;
  display: block;
  opacity: 1;
  flex: 1 1 auto;
}
.review-cycle-cell-evidence-date {
  flex: 0 0 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 48%;
}
.review-cycle-cell-evidence.is-restricted {
  opacity: .58;
}
.review-cycle-cell-file.is-restricted {
  opacity: .58;
}
@keyframes complianceFilterFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes complianceFilterSlideIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes complianceFilterChipIn {
  from { opacity: 0; transform: translateX(-6px) scale(0.96); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@media (max-width: 760px) {
  .compliance-search-bar {
    flex-wrap: wrap;
  }
  .compliance-filter-button {
    margin-left: auto;
  }
  .employee-compliance-checkpoint-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .employee-compliance-checkpoint-label {
    min-height: 0;
    padding: 0;
  }
}
    `}</style>
  );
}

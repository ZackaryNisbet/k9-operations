// K9 Operations — Training Module (Wave 1)
// Implements Training Home, Templates, Active Records, Train New Employee flow,
// and Training Record Detail with section expand/collapse and item completion.

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, fmtDate, fmtDateFull, fmtPhoneInput, LC_OP_LABELS } from "../../shared/theme";
import { Btn, Modal, Card, Inp, Badge, CustomSelect } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import {
  ACTIVE_TRAINING_RECORD_STATUSES,
  COMPLETED_TRAINING_RECORD_STATUSES,
  LABOR_EMPLOYEE_ATTACHMENT_ACCEPT,
  LABOR_EMPLOYEE_ATTACHMENT_BUCKET,
  LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES,
  LABOR_EMPLOYMENT_COMMITMENT_OPTIONS,
  LABOR_TRAINING_REQUIREMENT_PDF_ACCEPT,
  LABOR_TRAINING_REQUIREMENT_SLUGS,
  buildEmployeeHistoryTimeline,
  buildEmployeeTrainingRequirementRows,
  buildCreateLaborEmployeeRpcArgs,
  buildCreateTrainingRecordRpcArgs,
  buildEmployeeRecordMetricCards,
  buildLaborEmployeeContactCardFile,
  buildLaborEmployeeContactCardFilename,
  buildLaborEmployeeAttachmentPath,
  buildLaborEmployeeRequirementEvidencePath,
  buildLaborDashboardMetrics,
  buildLaborRosterStaffingSummary,
  buildUpdateLaborEmployeeRpcArgs,
  buildPctReadinessCategoryHotspots,
  buildPctReadinessCellUpdateArgs,
  buildPctReadinessEmployeeOptions,
  buildUpdateTrainingRecordConfigArgs,
  buildTrainingTemplateScopeClause,
  formatLaborAttachmentFileSize,
  formatTrainingTimeRange,
  formatTrainingTimestamp,
  getLaborEmploymentCommitmentLabel,
  getLaborAttachmentPreviewKind,
  getLaborRosterPositionGroup,
  getPctReadinessStatusPresentation,
  groupLaborEmployeeDocumentsByNote,
  groupLaborEmployeeNotes,
  groupTrainingNotes,
  inferLaborAttachmentMimeType,
  inferLaborTrainingRequirementEvidenceMimeType,
  isLaborEmployeeNoteDeleted,
  isLaborEmployeeDocumentDeleted,
  isLaborEmployeeActive,
  normalizePctReadinessStatus,
  normalizeOptionalUuid,
  PCT_READINESS_STATUS_OPTIONS,
  readLaborEmploymentCommitment,
  readLaborEmployeeContactValue,
  resolveTrainingLocationId,
  summarizeEmployeeTrainingRequirementCompliance,
  validateLaborEmployeeAttachmentFiles,
  validateLaborTrainingRequirementEvidenceFile,
} from "../trainingData";
import { getAttendanceIncidentLabel } from "../attendanceData";
import {
  DEFAULT_LABOR_ROSTER_PDF_OPTIONS,
  buildLaborRosterPdfBytes,
  loadLaborRosterPdfAssets,
} from "../laborRosterPdf";
import {
  buildDocuSealPerformanceReviewFields,
  buildPerformanceReviewDraftFromInstance,
  buildPerformanceReviewPdfFileName,
  fillPerformanceReviewPdfBytes,
  getPerformanceReviewTemplateOptions,
  getPerformanceReviewTemplateOverrideKey,
  getPerformanceReviewCompliance,
  PERFORMANCE_REVIEW_CYCLES,
  PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY,
  normalizePerformanceReviewTemplateRoleKey,
  resolvePerformanceReviewTemplate,
} from "../performanceReviewData";
import AttendanceTrackerPage from "./AttendancePage";
import LaborInterviewsPage from "./LaborInterviewsPage";

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#64748B", label: "Not Started" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8", label: "In Progress" },
  complete: { bg: "#DCFCE7", text: "#15803D", label: "Complete" },
  passed: { bg: "#DCFCE7", text: "#15803D", label: "Passed" },
  failed: { bg: "#FEE2E2", text: "#DC2626", label: "Failed" },
  needs_follow_up: { bg: "#FEF3C7", text: "#D97706", label: "Needs Follow-Up" },
  retest_required: { bg: "#FEF3C7", text: "#D97706", label: "Retest Required" },
  archived: { bg: "#F1F5F9", text: "#94A3B8", label: "Archived" },
};

const ITEM_STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#94A3B8" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8" },
  complete: { bg: "#DCFCE7", text: "#15803D" },
  passed: { bg: "#DCFCE7", text: "#15803D" },
  failed: { bg: "#FEE2E2", text: "#DC2626" },
  needs_coaching: { bg: "#FEF3C7", text: "#D97706" },
  blocked: { bg: "#F1F5F9", text: "#94A3B8" },
  waived: { bg: "#F1F5F9", text: "#94A3B8" },
};

const PCT_READINESS_STATUS_STYLES = {
  not_started: { bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0", icon: "O" },
  demonstrated: { bg: "#E0F2FE", text: "#0369A1", border: "#BAE6FD", icon: "D" },
  verified: { bg: "#DCFCE7", text: "#15803D", border: "#BBF7D0", icon: "OK" },
  needs_coaching: { bg: "#FEF3C7", text: "#B45309", border: "#FDE68A", icon: "!" },
  blocked: { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA", icon: "X" },
  waived: { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1", icon: "W" },
};

const TRAINING_VIEW_OPTIONS = [
  { id: "board", label: "Team Readiness Board", subtitle: "PCT skills by employee" },
  { id: "records", label: "Records", subtitle: "Active and completed training records" },
  { id: "history", label: "History", subtitle: "Training audit trail" },
];

const DEFAULT_PCT_READINESS_FILTERS = {
  employee: "",
  task: "",
  category: "",
  showGapsOnly: false,
  showNeedsCoaching: false,
};

export const LABOR_MANAGEMENT_TABS = [
  { id: "home", label: "Roster" },
  { id: "attendance", label: "Attendance" },
  { id: "performance-reviews", label: "Performance Reviews" },
  { id: "training", label: "Training" },
  { id: "interviews", label: "Interviews" },
  { id: "notes", label: "Notes" },
  { id: "hour-analysis", label: "Capacity Planning" },
];

const HIDDEN_LABOR_TABS = [
  { id: "templates", label: "Templates" },
];
const TABS = LABOR_MANAGEMENT_TABS;

const LABOR_TAB_IDS = new Set([...TABS, ...HIDDEN_LABOR_TABS].map((tab) => tab.id));
const LABOR_TAB_PERMISSION_MAP = {
  home: "Labor Roster",
  training: "Labor Roster",
  "performance-reviews": "Labor Performance Reviews",
  templates: "Labor Templates",
  attendance: "Labor Attendance",
  interviews: "Labor Interviews",
  notes: "Labor Employee Notes",
  "hour-analysis": "Labor Roster",
  "labor-model": "Labor Roster",
};
const normalizeLaborTab = (value) => value === "labor-model" ? "hour-analysis" : (LABOR_TAB_IDS.has(value) ? value : "home");
const normalizeAttendanceView = (value) => value === "summary" ? "summary" : "input";
const normalizeInterviewView = (value) => value === "config" ? "config" : "records";
export const CAPACITY_PLANNING_VIEWS = [
  { id: "staffing-capacity", label: "Staffing Capacity", subtitle: "Expected hours, coverage gaps, and hiring pressure" },
  { id: "labor-model", label: "Labor Model", subtitle: "Build the operating floor that feeds staffing capacity" },
];
const CAPACITY_PLANNING_VIEW_IDS = new Set(CAPACITY_PLANNING_VIEWS.map((view) => view.id));
export const normalizeCapacityPlanningView = (value) => CAPACITY_PLANNING_VIEW_IDS.has(value) ? value : "staffing-capacity";

export function buildLaborModulePanelKey({ tab, interviewView, attendanceView, capacityPlanningView } = {}) {
  const normalizedTab = normalizeLaborTab(tab);
  return [
    normalizedTab,
    normalizedTab === "interviews" ? normalizeInterviewView(interviewView) : "",
    normalizedTab === "attendance" ? normalizeAttendanceView(attendanceView) : "",
    normalizedTab === "hour-analysis" ? normalizeCapacityPlanningView(capacityPlanningView) : "",
  ].join(":");
}

function LaborViewSwitcher({ options = [], value, onChange }) {
  const visibleOptions = options.filter(Boolean);
  const activeIndex = Math.max(0, visibleOptions.findIndex((option) => option.id === value));
  if (!visibleOptions.length) return null;
  return (
    <div
      className="labor-view-switcher"
      style={{
        "--labor-view-count": visibleOptions.length,
        "--labor-view-active-index": activeIndex,
      }}
    >
      <div className="labor-view-switcher-indicator" aria-hidden="true" />
      {visibleOptions.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={`labor-view-option${active ? " is-active" : ""}`}
            onClick={() => onChange(option.id)}
          >
            <span>{option.label}</span>
            <small>{option.subtitle}</small>
          </button>
        );
      })}
    </div>
  );
}

const SORT_DIRECTION_LABELS = {
  asc: "Ascending",
  desc: "Descending",
};

function getLaborSortDisplayLabel(sort = {}, columns = [], defaultSort = {}) {
  const column = columns.find((item) => item.key === sort.key);
  if (!column) return "Sort";
  if (sort.key === defaultSort.key && sort.direction === defaultSort.direction) return `Sort: ${column.label}`;
  return `Sort: ${column.label} ${SORT_DIRECTION_LABELS[sort.direction] || "Ascending"}`;
}

function LaborSortControl({ sort, columns = [], defaultSort, onChange }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const pickerRef = useRef(null);
  const activeSort = sort || defaultSort || {};
  const normalizedDefault = defaultSort || columns[0] || { key: "", direction: "asc" };
  const isDefault = activeSort.key === normalizedDefault.key && activeSort.direction === normalizedDefault.direction;

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const handlePointerDown = (event) => {
      if (!pickerRef.current || pickerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="labor-sort-control" ref={pickerRef}>
      <button
        type="button"
        className={`labor-sort-trigger${open ? " is-open" : ""}${!isDefault ? " is-active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <I.SortNone />
        <span>{getLaborSortDisplayLabel(activeSort, columns, normalizedDefault)}</span>
        <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
          <I.ChevronDown />
        </span>
      </button>
      {open && (
        <div className="labor-sort-panel">
          <div className="hour-analysis-picker-heading">Sort Table</div>
          <div className="labor-sort-panel-body">
            <button
              type="button"
              className={`hour-analysis-picker-option${isDefault ? " is-active" : ""} is-reset`}
              style={{ animation: ready ? "filterChipIn 0.22s ease-out both" : "none" }}
              onClick={() => {
                onChange?.(normalizedDefault);
                setOpen(false);
              }}
            >
              Reset to position order
            </button>
            <div className="labor-sort-option-grid">
              {columns.map((column, index) => (
                <div
                  key={column.key}
                  className="labor-sort-option-row"
                  style={{ animation: ready ? `filterChipIn 0.24s ease-out ${(index + 1) * 0.035}s both` : "none" }}
                >
                  <span>{column.label}</span>
                  <div>
                    {["asc", "desc"].map((direction) => {
                      const active = activeSort.key === column.key && activeSort.direction === direction;
                      return (
                        <button
                          key={direction}
                          type="button"
                          className={`labor-sort-direction${active ? " is-active" : ""}`}
                          onClick={() => {
                            onChange?.({ key: column.key, direction });
                            setOpen(false);
                          }}
                        >
                          {SORT_DIRECTION_LABELS[direction]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INLINE_ROSTER_COMPOSER_TRANSITION_MS = 240;
const TRAINING_GRACE_PERIOD_DAYS = 14;
const REVIEW_WARNING_WINDOW_DAYS = 7;
const LABOR_ROSTER_VIEWS_SETTING_KEY = "labor_roster_views";
const LABOR_HOUR_ANALYSIS_SETTING_KEY = "labor_hour_analysis";
const DEFAULT_ROSTER_FILTERS = { employment_status: { op: "is", val: "active" } };
const LABOR_COMMITMENT_SELECT_OPTIONS = [
  { value: "", label: "Unassigned" },
  ...LABOR_EMPLOYMENT_COMMITMENT_OPTIONS,
];
const HOUR_ANALYSIS_GROUPS = [
  { key: "general_manager", label: "General Manager" },
  { key: "assistant_manager", label: "Assistant Manager" },
  { key: "supervisor", label: "Supervisor" },
  { key: "csr", label: "Customer Service Representative" },
  { key: "pct", label: "Pet Care Technician" },
  { key: "other", label: "Other" },
];
const HOUR_ANALYSIS_GROUP_LABELS = Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, group.label]));
const HOUR_ANALYSIS_GROUP_SHORT_LABELS = {
  general_manager: "GM",
  assistant_manager: "AM",
  supervisor: "SUP",
  csr: "CSR",
  pct: "PCT",
  other: "Other",
};
const DEFAULT_LABOR_POSITION_TITLES = [
  "General Manager",
  "Assistant Manager",
  "Supervisor",
  "Customer Service Representative",
  "Pet Care Technician",
];
const LABOR_DEFAULT_SORT = { key: "hierarchy", direction: "asc" };
const LABOR_ROSTER_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "name", label: "Name" },
  { key: "position", label: "Position" },
  { key: "commitment", label: "Commitment" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "training", label: "Training" },
  { key: "performance_reviews", label: "Performance Reviews" },
  { key: "notes", label: "Notes" },
];
const LABOR_TRAINING_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "employee", label: "Employee" },
  { key: "position", label: "Position" },
  { key: "plan", label: "Training Plan" },
  { key: "progress", label: "Progress" },
  { key: "status", label: "Status" },
  { key: "target", label: "Target Date" },
];
const LABOR_PERFORMANCE_REVIEW_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "employee", label: "Employee" },
  { key: "position", label: "Position" },
  { key: "start_date", label: "Start Date" },
  { key: "compliance", label: "Review Status" },
  { key: "review30", label: "30 Day" },
  { key: "review60", label: "60 Day" },
  { key: "review90", label: "90 Day" },
];
const LABOR_HOUR_PERSON_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "name", label: "Name" },
  { key: "position", label: "Position" },
  { key: "commitment", label: "Commitment" },
  { key: "preferred", label: "Expected Hours" },
  { key: "split", label: "Coverage Split" },
  { key: "note", label: "Justification" },
];
const HOUR_ANALYSIS_RANGE_KEYS = ["min", "expected", "max"];
const HOUR_ANALYSIS_RANGE_LABELS = {
  min: "Min",
  expected: "Expected",
  max: "Max",
};
const DEFAULT_HOUR_ANALYSIS_EXPECTATIONS = {
  general_manager: {
    full_time: { min: 30, expected: 35, max: 40 },
    part_time: { min: 0, expected: 0, max: 0 },
  },
  assistant_manager: {
    full_time: { min: 30, expected: 35, max: 40 },
    part_time: { min: 0, expected: 0, max: 0 },
  },
  supervisor: {
    full_time: { min: 30, expected: 35, max: 40 },
    part_time: { min: 0, expected: 0, max: 0 },
  },
  csr: {
    full_time: { min: 24, expected: 30, max: 40 },
    part_time: { min: 8, expected: 15, max: 25 },
  },
  pct: {
    full_time: { min: 24, expected: 30, max: 40 },
    part_time: { min: 8, expected: 15, max: 25 },
  },
  other: {
    full_time: { min: 24, expected: 30, max: 40 },
    part_time: { min: 8, expected: 15, max: 25 },
  },
};
const DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON = {
  general_manager: 8,
  assistant_manager: 8,
  supervisor: 16,
  csr: 24,
  pct: 43.5,
  other: 0,
};
const HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT = 15;
const HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT = 20;
const HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT = 25;
const HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT = 30;
const HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS = new Set(["csr", "pct"]);
const HOUR_ANALYSIS_SPLIT_TARGET_OPTIONS = [
  { value: "", label: "Primary role" },
  { value: "csr", label: "Customer Service Representative floor" },
  { value: "pct", label: "Pet Care Technician floor" },
];
const HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS = 35;
const HOUR_ANALYSIS_FRONTLINE_TARGET_RANGE_LABEL = `${HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT}-${HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT}% frontline target range`;
const HOUR_ANALYSIS_RESEARCH_TARGET_LABEL = HOUR_ANALYSIS_FRONTLINE_TARGET_RANGE_LABEL;
const HOUR_ANALYSIS_STAFFING_SOURCES = [
  { label: "NICE shrinkage staffing formula", href: "https://help.nice-incontact.com/content/workforcemanagement/staffingrequirementcalculations.htm" },
  { label: "BLS absence baseline", href: "https://www.bls.gov/cps/cpsaat47.htm" },
  { label: "SWPP shrinkage survey", href: "https://swpp.org/surveys/SWPP%20Survey%20Results%20Spring%202024%20-%20Shrinkage.pdf" },
  { label: "SHRM absence cost study", href: "https://www.shrm.org/content/dam/en/shrm/topics-tools/news/hr-magazine/kronos_us_executive_summary_final.pdf" },
  { label: "Gap stable-scheduling study", href: "https://worklifelaw.org/projects/stable-scheduling-study/report/" },
];
const LABOR_MODEL_SUMMARY_TAB = "summary";
const LABOR_MODEL_DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const LABOR_MODEL_DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};
const LABOR_MODEL_DAY_SHORT_LABELS = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};
const LABOR_MODEL_SHIFT_TYPE_OPTIONS = [
  { value: "opening", label: "Opening" },
  { value: "mid", label: "Mid" },
  { value: "close", label: "Close" },
];
const LABOR_MODEL_SHIFT_TYPE_LABELS = Object.fromEntries(LABOR_MODEL_SHIFT_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const LABOR_MODEL_GROUP_OPTIONS = HOUR_ANALYSIS_GROUPS
  .filter((group) => group.key !== "other")
  .map((group) => ({ value: group.key, label: HOUR_ANALYSIS_GROUP_SHORT_LABELS[group.key] || group.label }));
const LABOR_MODEL_FULL_COVERAGE_VALUE = "1";
const LABOR_MODEL_HALF_COVERAGE_VALUE = "0.5";
const LABOR_MODEL_MARKETING_COVERAGE_VALUE = "MKTG";
const LABOR_MODEL_MARKETING_TOKENS = new Set(["mktg", "marketing"]);
const LABOR_MODEL_ROLE_COVERAGE_OPTIONS = [
  { groupKey: "general_manager", label: "GM", aliases: ["gm", "general manager", "generalmanager"] },
  { groupKey: "assistant_manager", label: "AM", aliases: ["am", "assistant manager", "assistantmanager"] },
  { groupKey: "supervisor", label: "SUP", aliases: ["sup", "supervisor"] },
  { groupKey: "csr", label: "CSR", aliases: ["csr", "customer service representative", "customerservicerepresentative"] },
  { groupKey: "pct", label: "PCT", aliases: ["pct", "pet care technician", "petcaretechnician"] },
];
const LABOR_MODEL_ROLE_PALETTE = {
  general_manager: { strong: "#14532d", accent: "#16a34a", soft: "#dcfce7", text: "#14532d" },
  assistant_manager: { strong: "#3730a3", accent: "#6366f1", soft: "#e0e7ff", text: "#312e81" },
  supervisor: { strong: "#92400e", accent: "#f59e0b", soft: "#fef3c7", text: "#78350f" },
  csr: { strong: "#c2410c", accent: "#fb923c", soft: "#ffedd5", text: "#9a3412" },
  pct: { strong: "#0e7490", accent: "#06b6d4", soft: "#cffafe", text: "#155e75" },
  other: { strong: "#334155", accent: "#64748b", soft: "#e2e8f0", text: "#334155" },
};
const LABOR_MODEL_ROLE_COLOR_OPTIONS = [
  ...LABOR_MODEL_ROLE_COVERAGE_OPTIONS.map((option) => ({ groupKey: option.groupKey, label: option.label })),
  { groupKey: "other", label: "Other" },
];
const LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP = new Map(
  LABOR_MODEL_ROLE_COVERAGE_OPTIONS.flatMap((option) => (
    [option.label, option.groupKey, ...option.aliases].map((alias) => [
      String(alias || "").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " "),
      option,
    ])
  ))
);
const LABOR_MODEL_WEEKDAY_COLUMNS = [
  ["5:30-6a", 0.5],
  ["6-7a", 1],
  ["7-8a", 1],
  ["8-9a", 1],
  ["9-10a", 1],
  ["10-11a", 1],
  ["11a-12p", 1],
  ["12-12:30p", 0.5],
  ["12:30-1p", 0.5],
  ["1-2p", 1],
  ["2-3p", 1],
  ["3-4p", 1],
  ["4-5p", 1],
  ["5-6p", 1],
  ["6-7p", 1],
  ["7-7:30p", 0.5],
];
const LABOR_MODEL_WEEKEND_COLUMNS = [
  ["6:30-7a", 0.5],
  ["7-8a", 1],
  ["8-9a", 1],
  ["9-10a", 1],
  ["10-11a", 1],
  ["11a-12p", 1],
  ["12-1p", 1],
  ["1-2p", 1],
  ["2-3p", 1],
  ["3-4p", 1],
  ["4-5p", 1],
  ["5-6p", 1],
  ["6-7p", 1],
];
const LABOR_MODEL_WEEKDAY_EMPTY = "- - - - - - - - - - - - - - - -";
const LABOR_MODEL_WEEKEND_EMPTY = "- - - - - - - - - - - - -";
const LABOR_MODEL_WEEKDAY_BREAKERS = [6 * 60, 13 * 60, 19 * 60];
const LABOR_MODEL_WEEKEND_BREAKERS = [7 * 60, 13 * 60, (18 * 60) + 30];
const LABOR_MODEL_DEFAULT_BREAKERS_BY_DAY = Object.fromEntries(LABOR_MODEL_DAY_KEYS.map((dayKey) => [
  dayKey,
  ["saturday", "sunday"].includes(dayKey) ? LABOR_MODEL_WEEKEND_BREAKERS : LABOR_MODEL_WEEKDAY_BREAKERS,
]));
const LABOR_MODEL_WEEKDAY_PATTERNS = {
  csrAm: "- x x x x x x x x - - - - - - -",
  csrAmExtended: "- x x x x x x x x E E - - - - -",
  csrMondayMid: "- - - - x x x x x x x x x - - -",
  csrWeekdayMid: "- x RUN RUN PCT PCT PCT PCT PCT - - - - - - -",
  csrPm: "- - - - - - - - - x x x x x x -",
  csrWeekdayPmFlex: "- - - - - - - - - PCT PCT PCT RUN RUN x -",
  pctAmExtended: "- x x x x x x x x E E - - - - -",
  pctAm: "- x x x x x x x x - - - - - - -",
  pctPm: "- - - - - - - - - x x x x x x -",
  supAm: "x x x x x x x x x - - - - - - -",
  supMondayPm: "- - - - - - - - - x x x x x x x",
  supWeekdayPm: "- - - - - - - - x x x x x x x x",
  modAm: "- x x x x x x x x - - - - - - -",
  modMondayPm: "- - - - - - - - - x x x x x x -",
  modWeekdayPm: "- - - - - - - - x x x x x x x -",
};
const LABOR_MODEL_WEEKEND_PATTERNS = {
  am: "- x x x x x x - - - - - -",
  pm: "- - - - - - - x x x x x -",
};
const LEGACY_LABOR_MODEL_ACTIVE_TOKENS = new Set(["x", "e", "pct", "run", "yes", "true", "1", "✓"]);
const DEFAULT_HOUR_ANALYSIS_LABOR_MODEL = {
  version: 1,
  source: "CH Labor Model Revisited - Clean Daily Pages FIXED.xlsx",
  days: {
    monday: makeDefaultLaborModelDay("monday", "5:30 AM - 7:30 PM", LABOR_MODEL_WEEKDAY_COLUMNS, [
      ["csr", "CSR 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAm],
      ["csr", "CSR 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAmExtended],
      ["csr", "CSR 3 Mid", LABOR_MODEL_WEEKDAY_PATTERNS.csrMondayMid],
      ["csr", "CSR 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 3", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAmExtended],
      ["pct", "PCT 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 3 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 4 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 5 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 3 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 4 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["supervisor", "SUP 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.supAm],
      ["supervisor", "SUP 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.supMondayPm],
      ["assistant_manager", "MOD 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.modAm],
      ["assistant_manager", "MOD 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.modMondayPm],
    ]),
    tuesday: makeDefaultLaborModelDay("tuesday", "5:30 AM - 7:30 PM", LABOR_MODEL_WEEKDAY_COLUMNS, [
      ["csr", "CSR 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAm],
      ["csr", "CSR 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAmExtended],
      ["csr", "CSR 3 Mid", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayMid],
      ["csr", "CSR 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 3", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayPmFlex],
      ["pct", "PCT 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAmExtended],
      ["pct", "PCT 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 3 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 4 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 5 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 3 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 4 PM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["supervisor", "SUP 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.supAm],
      ["supervisor", "SUP 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.supWeekdayPm],
      ["assistant_manager", "MOD 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.modAm],
      ["assistant_manager", "MOD 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.modWeekdayPm],
    ]),
    wednesday: makeDefaultLaborModelDay("wednesday", "5:30 AM - 7:30 PM", LABOR_MODEL_WEEKDAY_COLUMNS, [
      ["csr", "CSR 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAm],
      ["csr", "CSR 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAmExtended],
      ["csr", "CSR 3 Mid", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayMid],
      ["csr", "CSR 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 3", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayPmFlex],
      ["pct", "PCT 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAmExtended],
      ["pct", "PCT 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 3 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 4 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 5 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 3 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 4 PM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["supervisor", "SUP 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.supAm],
      ["supervisor", "SUP 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.supWeekdayPm],
      ["assistant_manager", "MOD 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.modAm],
      ["assistant_manager", "MOD 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.modWeekdayPm],
    ]),
    thursday: makeDefaultLaborModelDay("thursday", "5:30 AM - 7:30 PM", LABOR_MODEL_WEEKDAY_COLUMNS, [
      ["csr", "CSR 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAm],
      ["csr", "CSR 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAmExtended],
      ["csr", "CSR 3 Mid", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayMid],
      ["csr", "CSR 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 3", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayPmFlex],
      ["pct", "PCT 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAmExtended],
      ["pct", "PCT 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 3 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 4 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 5 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 3 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 4 PM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["supervisor", "SUP 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.supAm],
      ["supervisor", "SUP 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.supWeekdayPm],
      ["assistant_manager", "MOD 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.modAm],
      ["assistant_manager", "MOD 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.modWeekdayPm],
    ]),
    friday: makeDefaultLaborModelDay("friday", "5:30 AM - 7:30 PM", LABOR_MODEL_WEEKDAY_COLUMNS, [
      ["csr", "CSR 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAm],
      ["csr", "CSR 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.csrAmExtended],
      ["csr", "CSR 3 Mid", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayMid],
      ["csr", "CSR 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.csrPm],
      ["csr", "CSR 3", LABOR_MODEL_WEEKDAY_PATTERNS.csrWeekdayPmFlex],
      ["pct", "PCT 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAmExtended],
      ["pct", "PCT 2 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 3 AM", LABOR_MODEL_WEEKDAY_PATTERNS.pctAm],
      ["pct", "PCT 4 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 5 AM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["pct", "PCT 1 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 3 PM", LABOR_MODEL_WEEKDAY_PATTERNS.pctPm],
      ["pct", "PCT 4 PM", LABOR_MODEL_WEEKDAY_EMPTY],
      ["supervisor", "SUP 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.supAm],
      ["supervisor", "SUP 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.supWeekdayPm],
      ["assistant_manager", "MOD 1 AM", LABOR_MODEL_WEEKDAY_PATTERNS.modAm],
      ["assistant_manager", "MOD 2 PM", LABOR_MODEL_WEEKDAY_PATTERNS.modWeekdayPm],
    ]),
    saturday: makeDefaultLaborModelDay("saturday", "6:30 AM - 7:00 PM", LABOR_MODEL_WEEKEND_COLUMNS, [
      ["csr", "CSR 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["csr", "CSR 2 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["csr", "CSR 3 Mid", LABOR_MODEL_WEEKEND_EMPTY],
      ["csr", "CSR 1 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["csr", "CSR 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["csr", "CSR 3", LABOR_MODEL_WEEKEND_EMPTY],
      ["pct", "PCT 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 2 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 3 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 4 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 5 AM", LABOR_MODEL_WEEKEND_EMPTY],
      ["pct", "PCT 1 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["pct", "PCT 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["pct", "PCT 3 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["pct", "PCT 4 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["supervisor", "SUP 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["supervisor", "SUP 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["assistant_manager", "MOD 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["assistant_manager", "MOD 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
    ]),
    sunday: makeDefaultLaborModelDay("sunday", "6:30 AM - 7:00 PM", LABOR_MODEL_WEEKEND_COLUMNS, [
      ["csr", "CSR 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["csr", "CSR 2 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["csr", "CSR 3 Mid", LABOR_MODEL_WEEKEND_EMPTY],
      ["csr", "CSR 1 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["csr", "CSR 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["csr", "CSR 3", LABOR_MODEL_WEEKEND_EMPTY],
      ["pct", "PCT 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 2 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 3 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 4 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 5 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["pct", "PCT 1 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["pct", "PCT 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["pct", "PCT 3 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["pct", "PCT 4 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["supervisor", "SUP 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["supervisor", "SUP 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
      ["assistant_manager", "MOD 1 AM", LABOR_MODEL_WEEKEND_PATTERNS.am],
      ["assistant_manager", "MOD 2 PM", LABOR_MODEL_WEEKEND_PATTERNS.pm],
    ]),
  },
};
const LABOR_ROSTER_PRINT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const EMPTY_REVIEW_PDF_DRAFT = {
  rating: "",
  managerNotes: "",
  actionPlan: "",
  overallRating: "",
  overallComments: "",
};
const RESTARTED_REVIEW_METADATA_KEYS = [
  "performance_review_rating",
  "manager_notes",
  "action_plan",
  "overall_rating",
  "overall_comments",
  "pdf_draft_saved_at",
  "signature",
];
const SAVING_ALL_REVIEW_RESPONSES_ID = "__all_review_responses__";
const REVIEW_RESPONSE_FIELDS = ["rating_value", "response_text"];

function hasOwnReviewDraftField(draft, field) {
  return Boolean(draft && Object.prototype.hasOwnProperty.call(draft, field));
}

function normalizeReviewResponseValue(value) {
  return String(value ?? "").trim();
}

function getReviewDraftValue(response, draft, field) {
  if (hasOwnReviewDraftField(draft, field)) return draft[field] ?? "";
  return response?.[field] ?? "";
}

function isReviewItemAnswered(response, draft = {}) {
  return REVIEW_RESPONSE_FIELDS.some((field) => normalizeReviewResponseValue(getReviewDraftValue(response, draft, field)));
}

function isReviewItemDraftDirty(response, draft = {}) {
  return REVIEW_RESPONSE_FIELDS.some((field) => (
    hasOwnReviewDraftField(draft, field)
    && normalizeReviewResponseValue(draft[field]) !== normalizeReviewResponseValue(response?.[field])
  ));
}

const LABOR_ROSTER_FILTER_FIELDS = [
  { section: "Employee Info", key: "first_name", label: "First Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "last_name", label: "Last Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "email", label: "Email", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "phone", label: "Phone", type: "text", ops: ["contains", "equals", "empty", "notEmpty"] },
  { section: "Employment", key: "position", label: "Position", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employment", key: "commitment", label: "Commitment", type: "select", ops: ["is", "isNot"], options: ["Full-Time", "Part-Time", "Unassigned"] },
  { section: "Employment", key: "employment_status", label: "Employment Status", type: "select", ops: ["is", "isNot"], options: ["active", "inactive", "all"] },
  { section: "Employment", key: "start_date", label: "Start Date", type: "date", ops: ["after", "before", "inLastDays"] },
  { section: "Compliance", key: "training", label: "Training", type: "select", ops: ["is", "isNot"], options: ["Compliant", "In Progress", "Non-Compliant"] },
  { section: "Compliance", key: "performance_reviews", label: "Performance Reviews", type: "select", ops: ["is", "isNot"], options: ["Compliant", "Non-compliant", "Needs setup"] },
];

const LABOR_NOTE_TYPE_OPTIONS = [
  { value: "general", label: "General" },
  { value: "personal", label: "Personal" },
  { value: "performance", label: "Performance" },
  { value: "attendance", label: "Attendance" },
  { value: "training", label: "Training" },
  { value: "hr", label: "HR" },
];

function normalizePositionTitle(value = "") {
  const title = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!title) return "";
  if (/^(gm|general manager)$/.test(title)) return "general manager";
  if (/^(am|agm|assistant manager|assistant general manager)$/.test(title)) return "assistant manager";
  if (/^(csr|customer service representative|front desk|guest service representative)$/.test(title)) return "customer service representative";
  if (/^(pct|pet care technician|pet care tech|technician|kennel technician)$/.test(title)) return "pet care technician";
  if (/^(supervisor|shift supervisor|shift lead|lead)$/.test(title)) return "supervisor";
  return title;
}

function formatLaborPositionTitle(value = "") {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  const normalized = normalizePositionTitle(raw);
  if (!normalized) return "";
  if (normalized === "general manager") return "General Manager";
  if (normalized === "assistant manager") return "Assistant Manager";
  if (normalized === "supervisor") return "Supervisor";
  if (normalized === "customer service representative") return "Customer Service Representative";
  if (normalized === "pet care technician") return "Pet Care Technician";
  return raw;
}

function buildLaborPositionOption(title) {
  const label = formatLaborPositionTitle(title);
  if (!label) return null;
  return { value: label, label, normalizedTitle: normalizePositionTitle(label) };
}

function isPersistedLaborPositionRowTrusted(row = {}) {
  return Boolean(row.created_by_user_id || row.updated_by_user_id || row.created_by_name || row.updated_by_name);
}

function makeDefaultLaborPositionRows() {
  return DEFAULT_LABOR_POSITION_TITLES.map((positionTitle, index) => ({
    id: null,
    position_title: positionTitle,
    normalized_title: normalizePositionTitle(positionTitle),
    sort_order: (index + 1) * 10,
  }));
}

function compareLaborSortValues(left, right) {
  const leftValue = left == null ? "" : left;
  const rightValue = right == null ? "" : right;
  if (typeof leftValue === "number" && typeof rightValue === "number") return leftValue - rightValue;
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
}

function getLaborPositionSortIndex(positionTitle, positionHierarchyIndex = {}) {
  return positionHierarchyIndex[normalizePositionTitle(positionTitle)] ?? Number.MAX_SAFE_INTEGER;
}

function sortLaborRowsByConfig(rows = [], sort = LABOR_DEFAULT_SORT, positionHierarchyIndex = {}, getSortValue = () => "") {
  const activeSort = sort || LABOR_DEFAULT_SORT;
  const direction = activeSort.direction === "desc" ? -1 : 1;
  return [...rows].sort((leftRow, rightRow) => {
    if (activeSort.key === "hierarchy") {
      const leftPosition = getSortValue(leftRow, "position");
      const rightPosition = getSortValue(rightRow, "position");
      const leftIndex = getLaborPositionSortIndex(leftPosition, positionHierarchyIndex);
      const rightIndex = getLaborPositionSortIndex(rightPosition, positionHierarchyIndex);
      if (leftIndex !== rightIndex) return (leftIndex - rightIndex) * direction;
      return compareLaborSortValues(getSortValue(leftRow, "name") || getSortValue(leftRow, "employee"), getSortValue(rightRow, "name") || getSortValue(rightRow, "employee"));
    }
    return compareLaborSortValues(getSortValue(leftRow, activeSort.key), getSortValue(rightRow, activeSort.key)) * direction;
  });
}

function getDefaultPositionWeight(value = "") {
  const title = normalizePositionTitle(value);
  if (!title) return -1;
  if (/(director|regional)/.test(title)) return 100;
  if (/(general manager|\bgm\b)/.test(title)) return 90;
  if (/(assistant manager|\bagm\b)/.test(title)) return 80;
  if (/manager/.test(title)) return 70;
  if (/(supervisor|lead)/.test(title)) return 60;
  if (/(customer service representative|\bcsr\b)/.test(title)) return 40;
  if (/(pet care technician|\bpct\b|technician)/.test(title)) return 30;
  return 0;
}

function formatRosterLocationName(value = "") {
  const cleanName = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleanName) return "K9 Resorts";
  if (/^k9 resorts\b/i.test(cleanName)) return cleanName;
  if (/^k9 operations\b/i.test(cleanName)) return cleanName;
  return `K9 Resorts of ${cleanName}`;
}

function formatRosterLocationTitle(value = "") {
  return `${formatRosterLocationName(value)} - Team Roster`;
}

function formatRosterPrintDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return LABOR_ROSTER_PRINT_DATE_FORMATTER.format(new Date());
  return LABOR_ROSTER_PRINT_DATE_FORMATTER.format(date);
}

function formatRosterPdfDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  const year = String(safeDate.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function formatRosterPdfFilename(locationName = "", value = new Date()) {
  return `${formatRosterLocationName(locationName)} Roster - ${formatRosterPdfDate(value)}.pdf`;
}

function getCommitmentBadgeTone(value) {
  const normalized = readLaborEmploymentCommitment({ employment_commitment: value });
  if (normalized === "full_time") return { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" };
  if (normalized === "part_time") return { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" };
  return { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" };
}

function LaborCommitmentBadge({ value, compact = false }) {
  const tone = getCommitmentBadgeTone(value);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: compact ? 34 : 74,
        padding: compact ? "4px 8px" : "5px 10px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: compact ? 10.5 : 11,
        fontWeight: 900,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {getLaborEmploymentCommitmentLabel(value, { short: compact })}
    </span>
  );
}

function LaborCommitmentSegmentedPicker({ value, onChange }) {
  const normalizedValue = readLaborEmploymentCommitment({ employment_commitment: value }) || "";
  const options = [
    ...LABOR_COMMITMENT_SELECT_OPTIONS.filter((option) => option.value),
    ...LABOR_COMMITMENT_SELECT_OPTIONS.filter((option) => !option.value),
  ];

  return (
    <div className="labor-commitment-picker" role="radiogroup" aria-label="Commitment">
      {options.map((option) => {
        const optionValue = option.value || "";
        const isActive = normalizedValue === optionValue;
        return (
          <button
            key={option.value || "unassigned"}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-tone={option.value || "unassigned"}
            className={`labor-commitment-picker-option${isActive ? " is-active" : ""}`}
            onClick={() => onChange(optionValue)}
          >
            <span aria-hidden="true" className="labor-commitment-picker-dot" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function HourAnalysisNumberInput({ value, onCommit, disabled, ariaLabel, className = "hour-analysis-number-input", style = {} }) {
  const formattedValue = formatHourAnalysisHours(value);
  const [draft, setDraft] = useState(formattedValue);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatHourAnalysisHours(value));
  }, [focused, value]);

  const commit = useCallback((rawValue) => {
    const trimmed = String(rawValue ?? "").trim();
    if (!trimmed || trimmed === ".") return;
    const nextValue = normalizeHourAnalysisNumber(trimmed, 0);
    if (nextValue === normalizeHourAnalysisNumber(value, 0)) return;
    onCommit?.(nextValue);
  }, [onCommit, value]);

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.]?[0-9]*"
      value={focused ? draft : formattedValue}
      disabled={disabled}
      aria-label={ariaLabel}
      style={style}
      onFocus={(event) => {
        setFocused(true);
        setDraft(formatHourAnalysisHours(value));
        window.requestAnimationFrame(() => event.target.select());
      }}
      onChange={(event) => {
        const nextValue = event.target.value.replace(/,/g, "");
        if (!/^\d*\.?\d*$/.test(nextValue)) return;
        setDraft(nextValue);
      }}
      onBlur={() => {
        setFocused(false);
        if (!draft || draft === ".") {
          setDraft(formatHourAnalysisHours(value));
          return;
        }
        commit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(formatHourAnalysisHours(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function LaborModelInlineInput({ value = "", onCommit, disabled = false, ariaLabel, className = "labor-model-text-input", placeholder = "", style = {} }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value ?? ""));
  }, [focused, value]);

  const commit = useCallback(() => {
    const nextValue = String(draft ?? "").trim();
    if (nextValue === String(value ?? "").trim()) return;
    onCommit?.(nextValue);
  }, [draft, onCommit, value]);

  return (
    <input
      type="text"
      className={className}
      value={focused ? draft : String(value ?? "")}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      style={style}
      onFocus={(event) => {
        setFocused(true);
        setDraft(String(value ?? ""));
        window.requestAnimationFrame(() => event.target.select());
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value ?? ""));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function HourAnalysisNoteInput({ value = "", onCommit, disabled, ariaLabel, placeholder = "Why this number?" }) {
  const [draft, setDraft] = useState(value || "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value || "");
  }, [focused, value]);

  const commit = useCallback(() => {
    const nextValue = String(draft || "").trim();
    if (nextValue === String(value || "").trim()) return;
    onCommit?.(nextValue);
  }, [draft, onCommit, value]);

  return (
    <textarea
      className="hour-analysis-note-input"
      value={focused ? draft : (value || "")}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      rows={2}
      onFocus={() => setFocused(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value || "");
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function HourAnalysisAnimatedPicker({ label, value, options = [], onChange, placeholder = "Select...", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 750, color: C.textSec, marginBottom: 5, letterSpacing: 0, textTransform: "uppercase" }}>
          {label}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="hour-analysis-picker-trigger"
      >
        <span>{selected?.label || placeholder}</span>
        <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
          <I.ChevronDown />
        </span>
      </button>
      {open && (
        <div className="hour-analysis-picker-panel">
          <div className="hour-analysis-picker-heading">Choose {label || "value"}</div>
          <div className="hour-analysis-picker-options">
            {options.map((option, index) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`hour-analysis-picker-option${active ? " is-active" : ""}`}
                  style={{ animation: ready ? `filterChipIn 0.25s ease-out ${index * 0.035}s both` : "none" }}
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LaborModelTimeControl({ row = {}, disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const shiftType = normalizeLaborModelShiftType(row.shift_type, row);
  const shiftLabel = LABOR_MODEL_SHIFT_TYPE_LABELS[shiftType] || "Opening";
  const breakEnabled = Boolean(row.break_enabled);
  const breakMinutes = normalizeLaborModelBreakMinutes(row.break_minutes, 30);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div className="labor-model-shift-control">
      <button
        type="button"
        disabled={disabled}
        className={`labor-model-shift-trigger${breakEnabled ? " has-break" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{shiftLabel}</span>
        {breakEnabled && <small>{breakMinutes}m break</small>}
        {!disabled && (
          <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
            <I.ChevronDown />
          </span>
        )}
      </button>
      {open && !disabled && (
        <div className="labor-model-shift-panel">
          <div className="hour-analysis-picker-heading">Choose time</div>
          <div className="hour-analysis-picker-options">
            {LABOR_MODEL_SHIFT_TYPE_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                className={`hour-analysis-picker-option${option.value === shiftType ? " is-active" : ""}`}
                style={{ animation: ready ? `filterChipIn 0.25s ease-out ${index * 0.035}s both` : "none" }}
                onClick={() => onChange?.({ shift_type: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="labor-model-break-row">
            <div>
              <strong>Break</strong>
              <span>{breakEnabled ? "Subtracts from this row." : "No break is deducted."}</span>
            </div>
            <button
              type="button"
              className={`labor-model-break-toggle${breakEnabled ? " is-on" : ""}`}
              onClick={() => onChange?.({ break_enabled: !breakEnabled, break_minutes: breakMinutes || 30 })}
            >
              {breakEnabled ? "On" : "Off"}
            </button>
          </div>
          {breakEnabled && (
            <div className="labor-model-break-duration">
              <span>Minutes</span>
              <HourAnalysisNumberInput
                value={breakMinutes || 30}
                onCommit={(nextValue) => onChange?.({ break_enabled: true, break_minutes: normalizeLaborModelBreakMinutes(nextValue, 30) })}
                ariaLabel="Break duration minutes"
                className="labor-model-break-input"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LaborModelCoverageCell({
  value = "",
  disabled = false,
  selected = false,
  dragging = false,
  saving = false,
  conflict = false,
  bulkMode = false,
  selectedCount = 0,
  positionOptions = LABOR_MODEL_GROUP_OPTIONS,
  roleColors = null,
  rowGroupKey = "",
  rowId,
  columnIndex,
  onCreate,
  onFillStart,
  onEnter,
  onPositionChange,
  onToggleSelected,
}) {
  const [positionOpen, setPositionOpen] = useState(false);
  const [positionReady, setPositionReady] = useState(false);
  const normalizedValue = normalizeLaborModelCoverageCell(value);
  const active = isLaborModelCoverageActive(normalizedValue);
  const kind = getLaborModelCoverageKind(normalizedValue);
  const nextClickValue = getLaborModelNextCoverageValue(normalizedValue, rowGroupKey);
  const fillValue = normalizedValue || LABOR_MODEL_FULL_COVERAGE_VALUE;
  const activeDuration = getLaborModelCoverageDuration(normalizedValue) || "full";
  const activeRoleOption = getLaborModelCoverageRoleOptionForCell(normalizedValue, rowGroupKey);
  const display = getLaborModelCoverageDisplay(normalizedValue, rowGroupKey);
  const roleClass = activeRoleOption?.groupKey ? ` role-${activeRoleOption.groupKey}` : "";
  const roleStyle = activeRoleOption?.groupKey ? getLaborModelCoverageRoleStyle(activeRoleOption.groupKey, roleColors) : undefined;
  const appliesToSelection = selected && selectedCount > 1;
  const durationOptions = [
    { value: "full", label: "Full shift" },
    { value: "half", label: "Half shift" },
  ];
  const positionChoices = positionOptions.filter((option) => {
    const normalizedOption = normalizeLaborModelCoverageCell(option.value);
    return normalizedOption
      && normalizedOption !== LABOR_MODEL_FULL_COVERAGE_VALUE
      && normalizedOption !== LABOR_MODEL_HALF_COVERAGE_VALUE;
  });

  useEffect(() => {
    if (!positionOpen) {
      setPositionReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setPositionReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [positionOpen]);

  return (
    <div
      className={`labor-model-coverage-cell-shell is-${kind}${active ? " is-active" : ""}${roleClass}${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}${saving ? " is-saving" : ""}${conflict ? " is-conflict" : ""}${bulkMode ? " is-bulk-mode" : ""}`}
      style={roleStyle}
      onPointerEnter={() => {
        if (disabled) return;
        onEnter?.(rowId, columnIndex);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        className={`labor-model-coverage-cell-button${active ? " is-active" : ""} is-${kind}${roleClass}${selected ? " is-selected" : ""}${conflict ? " is-conflict" : ""}`}
        title={active ? "Drag the handle to fill neighboring cells. Hover for coverage and select controls." : "Click to create coverage in this empty slot."}
        aria-label={`Coverage cell ${rowId || "row"} ${columnIndex + 1}`}
        aria-pressed={active}
        onClick={() => {
          if (disabled || !shouldCycleLaborModelCoveragePointer({ value: normalizedValue })) return;
          onCreate?.(rowId, columnIndex, nextClickValue);
        }}
      >
        <span>{display}</span>
      </button>
      {!disabled && (
        <div
          className="labor-model-cell-toolbar"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="labor-model-cell-tool"
            aria-label={appliesToSelection ? "Choose coverage position for selected cells" : "Choose coverage position"}
            title={appliesToSelection ? "Choose coverage position for selected cells" : "Choose coverage position"}
            onClick={() => setPositionOpen((prev) => !prev)}
          >
            <I.Tag />
          </button>
          <button
            type="button"
            className={`labor-model-cell-tool is-select${selected ? " is-selected" : ""}`}
            aria-label={selected ? "Deselect cell" : "Select cell"}
            aria-pressed={selected}
            title={selected ? "Deselect for bulk edits" : "Select for bulk edits"}
            onClick={() => onToggleSelected?.(rowId, columnIndex)}
          >
            <I.Check />
          </button>
          {active && (
            <button
              type="button"
              className="labor-model-cell-tool is-delete"
              aria-label={appliesToSelection ? "Clear selected coverage cells" : "Clear coverage cell"}
              title={appliesToSelection ? "Clear selected coverage cells" : "Clear coverage cell"}
              onClick={() => onPositionChange?.(rowId, columnIndex, "", { type: "clear" })}
            >
              <I.Trash />
            </button>
          )}
        </div>
      )}
      {positionOpen && !disabled && (
        <div
          className="labor-model-cell-position-panel"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="labor-model-cell-position-section">
            <div className="hour-analysis-picker-heading">Duration</div>
            <div className="hour-analysis-picker-options">
              {durationOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  className={`hour-analysis-picker-option${activeDuration === option.value && active ? " is-active" : ""}`}
                  style={{ animation: positionReady ? `filterChipIn 0.25s ease-out ${index * 0.025}s both` : "none" }}
                  onClick={() => {
                    onPositionChange?.(rowId, columnIndex, setLaborModelCoverageDuration(normalizedValue, rowGroupKey, option.value), { type: "duration", duration: option.value });
                    setPositionOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="labor-model-cell-position-section">
            <div className="hour-analysis-picker-heading">Position</div>
            <div className="hour-analysis-picker-options">
            {positionChoices.map((option, index) => {
              const optionValue = normalizeLaborModelCoverageCell(option.value);
              const optionRole = getLaborModelCoverageExplicitRoleOption(optionValue) || getLaborModelCoverageRoleOption(optionValue);
              const activeOption = optionValue === LABOR_MODEL_MARKETING_COVERAGE_VALUE
                ? normalizedValue === LABOR_MODEL_MARKETING_COVERAGE_VALUE
                : Boolean(activeRoleOption && optionRole && activeRoleOption.groupKey === optionRole.groupKey);
              return (
                <button
                  key={`${option.value}-${index}`}
                  type="button"
                  className={`hour-analysis-picker-option${activeOption ? " is-active" : ""}`}
                  style={{ animation: positionReady ? `filterChipIn 0.25s ease-out ${index * 0.025}s both` : "none" }}
                  onClick={() => {
                    onPositionChange?.(rowId, columnIndex, setLaborModelCoveragePosition(normalizedValue, rowGroupKey, option.value), { type: "position", positionValue: option.value });
                    setPositionOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
            </div>
          </div>
          <div className="labor-model-cell-position-section">
            <div className="hour-analysis-picker-heading">Actions</div>
            <div className="hour-analysis-picker-options">
              <button
                type="button"
                className="hour-analysis-picker-option is-reset"
                onClick={() => {
                  onPositionChange?.(rowId, columnIndex, "", { type: "clear" });
                  setPositionOpen(false);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
      {active && !disabled && (
        <span
          role="button"
          tabIndex={-1}
          className="labor-model-fill-handle"
          aria-label={`Drag ${display || "coverage"} across row`}
          title="Drag to fill this value across the row"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            onFillStart?.(rowId, columnIndex, fillValue);
          }}
        />
      )}
    </div>
  );
}

function LaborModelHoursLineGraph({ days = [] }) {
  const [hoveredKey, setHoveredKey] = useState("");
  const values = days.map((day) => normalizeHourAnalysisNumber(day.totalHours, 0));
  const maxValue = Math.max(1, ...values);
  const width = 680;
  const height = 190;
  const padX = 38;
  const padY = 24;
  const points = days.map((day, index) => {
    const x = days.length <= 1 ? width / 2 : padX + ((width - padX * 2) * index) / (days.length - 1);
    const y = height - padY - ((normalizeHourAnalysisNumber(day.totalHours, 0) / maxValue) * (height - padY * 2));
    return { ...day, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const hovered = points.find((point) => point.key === hoveredKey) || points.reduce((winner, point) => (point.totalHours > (winner?.totalHours || 0) ? point : winner), points[0]);

  return (
    <div className="labor-model-graph-card">
      <div className="labor-model-graph-header">
        <div>
          <span>Weekly Shape</span>
          <strong>{hovered?.label || "Week"}: {formatHourAnalysisHours(hovered?.totalHours || 0)} hrs</strong>
        </div>
        <em>Hover a day</em>
      </div>
      <svg className="labor-model-line-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Labor model hours by day">
        <defs>
          <linearGradient id="laborModelGraphFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(20,83,45,0.22)" />
            <stop offset="100%" stopColor="rgba(20,83,45,0.02)" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = height - padY - ratio * (height - padY * 2);
          return <line key={ratio} x1={padX} x2={width - padX} y1={y} y2={y} className="labor-model-graph-gridline" />;
        })}
        {points.length > 0 && (
          <path
            d={`${path} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`}
            className="labor-model-graph-area"
          />
        )}
        <path d={path} className="labor-model-graph-line" />
	        {points.map((point) => (
	          <g key={point.key} onMouseEnter={() => setHoveredKey(point.key)} onFocus={() => setHoveredKey(point.key)} tabIndex={0}>
	            <circle cx={point.x} cy={point.y} r={hoveredKey === point.key ? 7 : 5} className="labor-model-graph-dot" />
	            <text x={point.x} y={Math.max(14, point.y - 12)} textAnchor="middle" className="labor-model-graph-value">{formatHourAnalysisHours(point.totalHours)}</text>
	            <text x={point.x} y={height - 5} textAnchor="middle" className="labor-model-graph-label">{point.shortLabel || point.label}</text>
	            <title>{point.label}: {formatHourAnalysisHours(point.totalHours)} hours</title>
	          </g>
        ))}
      </svg>
    </div>
  );
}

function HourAnalysisSplitControl({ row = {}, disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const canSplitRole = ["general_manager", "assistant_manager", "supervisor", "csr"].includes(row.groupKey);
  const splitFloorGroup = row.split?.floor_group || "";
  const isSplit = Boolean(splitFloorGroup);
  const floorLabel = getHourAnalysisGroupLabel(splitFloorGroup);
  const primaryHours = normalizeHourAnalysisNumber(row.split?.admin_hours ?? row.preferredHours, 0);
  const floorHours = normalizeHourAnalysisNumber(row.split?.floor_hours, 0);
  const disabledTrigger = disabled || !canSplitRole;

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!canSplitRole && !isSplit) {
    return <span className="hour-analysis-split-static">Primary role</span>;
  }

  return (
    <div className="hour-analysis-split-compact">
      <button
        type="button"
        className={`hour-analysis-split-trigger${isSplit ? " is-active" : ""}`}
        disabled={disabledTrigger}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>
          {isSplit
            ? `${formatHourAnalysisHours(primaryHours)} ${row.groupLabel} + ${formatHourAnalysisHours(floorHours)} ${floorLabel}`
            : "Primary role"}
        </span>
        {!disabledTrigger && (
          <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
            <I.ChevronDown />
          </span>
        )}
      </button>
      {open && !disabledTrigger && (
        <div className="hour-analysis-split-panel">
          <div className="hour-analysis-picker-heading">Allocate weekly hours</div>
          <div className="hour-analysis-picker-options">
            {HOUR_ANALYSIS_SPLIT_TARGET_OPTIONS.map((option, index) => (
              <button
                key={option.value || "primary"}
                type="button"
                className={`hour-analysis-picker-option${option.value === splitFloorGroup ? " is-active" : ""}`}
                style={{ animation: ready ? `filterChipIn 0.25s ease-out ${index * 0.035}s both` : "none" }}
                onClick={() => {
                  onChange?.({
                    floor_group: option.value,
                    admin_hours: option.value ? (row.split?.admin_hours ?? Math.min(8, row.preferredHours || 0)) : null,
                  });
                  if (!option.value) setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {isSplit && (
            <div className="hour-analysis-split-editor">
              <div>
                <span>Primary-role hours</span>
                <small>Remaining hours flow to {floorLabel}.</small>
              </div>
              <HourAnalysisNumberInput
                value={primaryHours}
                onCommit={(nextValue) => onChange?.({ admin_hours: nextValue })}
                ariaLabel={`${row.full_name || "Employee"} primary-role coverage hours`}
                style={{ width: 92, textAlign: "right" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HourAnalysisPositionMoveControl({ row = {}, options = [], disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const pickerRef = useRef(null);
  const sourcePosition = formatLaborPositionTitle(row.sourcePositionTitle || row.position_title || row.position || "");
  const targetPosition = formatLaborPositionTitle(row.position_title || row.position || sourcePosition || "");
  const moved = Boolean(row.isMovement && sourcePosition && targetPosition && normalizePositionTitle(sourcePosition) !== normalizePositionTitle(targetPosition));
  const displayPosition = targetPosition || sourcePosition || "Choose position";
  const resetOption = sourcePosition
    ? [{ value: "", label: `Roster position: ${sourcePosition}`, isReset: true }]
    : [];
  const pickerOptions = [
    ...resetOption,
    ...options.filter((option) => option.normalizedTitle !== normalizePositionTitle(sourcePosition)),
  ];

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const handlePointerDown = (event) => {
      if (!pickerRef.current || pickerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="hour-analysis-position-move" ref={pickerRef}>
      <button
        type="button"
        className={`hour-analysis-position-trigger${moved ? " is-moved" : ""}`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="hour-analysis-position-display">
          {moved ? (
            <>
              <span className="hour-analysis-position-original">{sourcePosition}</span>
              <span className="hour-analysis-arrow">→</span>
              <span>{targetPosition}</span>
            </>
          ) : (
            <span>{displayPosition || "—"}</span>
          )}
        </span>
        {!disabled && (
          <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
            <I.ChevronDown />
          </span>
        )}
      </button>
      {open && !disabled && (
        <div className="hour-analysis-position-panel">
          <div className="hour-analysis-picker-heading">Choose Position</div>
          <div className="hour-analysis-picker-options">
            {pickerOptions.map((option, index) => {
              const active = option.isReset ? !moved : normalizePositionTitle(option.value) === normalizePositionTitle(targetPosition);
              return (
                <button
                  key={option.isReset ? "__reset_position__" : option.value}
                  type="button"
                  className={`hour-analysis-picker-option${active ? " is-active" : ""}${option.isReset ? " is-reset" : ""}`}
                  style={{ animation: ready ? `filterChipIn 0.25s ease-out ${index * 0.035}s both` : "none" }}
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatLaborDate(value) {
  return value ? fmtDateFull(value) : "—";
}

function normalizeLaborContactEmail(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeLaborContactPhone(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "").slice(0, 10);
  return digitsOnly || null;
}

function readLaborEmployeeContact(employee, key) {
  return readLaborEmployeeContactValue(employee, key);
}

function buildUpdatedLaborMetadata(existingMetadata = {}, updates = {}) {
  const nextMetadata = { ...(existingMetadata || {}) };
  const hasEmail = Object.prototype.hasOwnProperty.call(updates, "email");
  const hasPhone = Object.prototype.hasOwnProperty.call(updates, "phone");
  const hasPerformanceReviewTemplateRole = Object.prototype.hasOwnProperty.call(updates, "performanceReviewTemplateRole");

  if (hasEmail) {
    const normalizedEmail = normalizeLaborContactEmail(updates.email);
    if (normalizedEmail) nextMetadata.contact_email = normalizedEmail;
    else delete nextMetadata.contact_email;
  }

  if (hasPhone) {
    const normalizedPhone = normalizeLaborContactPhone(updates.phone);
    if (normalizedPhone) nextMetadata.contact_phone = normalizedPhone;
    else delete nextMetadata.contact_phone;
  }

  if (hasPerformanceReviewTemplateRole) {
    const roleKey = normalizePerformanceReviewTemplateRoleKey(updates.performanceReviewTemplateRole);
    if (roleKey) nextMetadata[PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY] = roleKey;
    else delete nextMetadata[PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY];
  }

  return nextMetadata;
}

function clearRestartedReviewMetadata(existingMetadata = {}, restartDetails = {}) {
  const nextMetadata = isObjectRow(existingMetadata) ? { ...existingMetadata } : {};
  RESTARTED_REVIEW_METADATA_KEYS.forEach((key) => {
    delete nextMetadata[key];
  });
  return {
    ...nextMetadata,
    performance_review_restart: {
      ...(isObjectRow(nextMetadata.performance_review_restart) ? nextMetadata.performance_review_restart : {}),
      ...restartDetails,
    },
  };
}

function getRestartedReviewStatus(dueDate) {
  if (dueDate && String(dueDate).slice(0, 10) < todayStr()) return "overdue";
  return "scheduled";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.not_started;
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text }}>{s.label}</span>;
}

function ProgressBar({ percent, height = 6 }) {
  const p = safeTrainingProgress(percent);
  const color = p >= 100 ? C.suc : p > 50 ? C.acc : C.info;
  return (
    <div style={{ width: "100%", height, borderRadius: height / 2, background: C.borderLight, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", borderRadius: height / 2, background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  const IconComp = I[icon];
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMut }}>
      {IconComp && <div style={{ marginBottom: 12, opacity: 0.4 }}><IconComp /></div>}
      <div style={{ fontSize: 16, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </div>
  );
}

function SectionHeader({ title, count, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
        {count != null && <Badge color="default">{count}</Badge>}
      </div>
      {children}
    </div>
  );
}

function PerformanceReviewStyles() {
  return (
    <style>{`
      @keyframes performanceReviewPanelEnter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes performanceReviewStatusPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.16); }
        50% { box-shadow: 0 0 0 5px rgba(217, 119, 6, 0); }
      }
      .performance-review-detail-shell {
        animation: performanceReviewPanelEnter 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .performance-review-sync-panel {
        animation: performanceReviewPanelEnter 300ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .performance-review-sync-dot {
        animation: performanceReviewStatusPulse 2.4s ease-in-out infinite;
      }
      .performance-review-surface {
        transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease, border-color 180ms ease;
      }
      .performance-review-surface:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
      }
      .performance-review-rating-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .performance-review-rating-option {
        min-height: 42px;
        border-radius: 8px;
        border: 1.5px solid #E2E8F0;
        background: #FFFFFF;
        color: #1E293B;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.2;
        padding: 9px 10px;
        text-align: center;
        transition: transform 150ms ease, border-color 150ms ease, background 150ms ease, color 150ms ease;
      }
      .performance-review-rating-option:hover {
        transform: translateY(-1px);
        border-color: rgba(20, 83, 45, 0.4);
      }
      .performance-review-rating-option.is-selected {
        background: #F7FEE7;
        border-color: #14532D;
        color: #14532D;
        box-shadow: inset 0 0 0 1px rgba(20, 83, 45, 0.08);
      }
      .performance-review-item-shell {
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 16px;
        background: #FFFFFF;
        transition: border-color 160ms ease, box-shadow 160ms ease;
      }
      .performance-review-item-shell.is-dirty {
        border-color: rgba(217, 119, 6, 0.34);
        box-shadow: 0 10px 24px rgba(217, 119, 6, 0.06);
      }
      .performance-review-queue-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
      }
      .performance-review-queue-stat {
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        background: #FFFFFF;
        padding: 12px 14px;
      }
      @media (max-width: 960px) {
        .performance-review-detail-grid {
          grid-template-columns: 1fr !important;
        }
        .performance-review-sync-panel {
          grid-template-columns: 1fr !important;
        }
        .performance-review-side-panel {
          position: static !important;
        }
        .performance-review-queue-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 620px) {
        .performance-review-rating-grid,
        .performance-review-queue-grid {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}

function ReviewTemplateStatusLine({ reviewTemplateName, pdfTemplateName, mismatch }) {
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 9px",
          borderRadius: 999,
          background: mismatch ? "#FFF7ED" : C.sucLt,
          color: mismatch ? C.warn : C.suc,
          border: `1px solid ${mismatch ? "rgba(217,119,6,0.22)" : "rgba(22,163,74,0.18)"}`,
          fontWeight: 900,
          lineHeight: 1.2,
        }}
      >
        <span
          className={mismatch ? "performance-review-sync-dot" : ""}
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: mismatch ? C.warn : C.suc,
            flexShrink: 0,
          }}
        />
        {mismatch ? "Template sync needed" : "Templates aligned"}
      </span>
      <span style={{ color: C.textMut, fontWeight: 700 }}>
        Form: {reviewTemplateName || "Not loaded"} · PDF: {pdfTemplateName || "Not set"}
      </span>
    </div>
  );
}

function splitEmployeeName(fullName = "") {
  const tokens = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: "" };
  return {
    firstName: tokens.slice(0, -1).join(" "),
    lastName: tokens[tokens.length - 1],
  };
}

function normalizeEmployeeName(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isObjectRow(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toObjectRows(rows = []) {
  return Array.isArray(rows) ? rows.filter(isObjectRow) : [];
}

export function getLaborEmployeeRowId(row = {}) {
  if (!isObjectRow(row)) return null;
  return row.labor_employee_id || row.employee_id || row.id || null;
}

export function getTrainingRecordEmployeeId(record = {}) {
  if (!isObjectRow(record)) return null;
  return record.labor_employee_id || record.employee_id || null;
}

function normalizeHourAnalysisNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 10) / 10;
}

function formatHourAnalysisHours(value) {
  const normalized = normalizeHourAnalysisNumber(value, 0);
  if (Number.isInteger(normalized)) return String(normalized);
  return normalized.toFixed(1).replace(/\.0$/, "");
}

function normalizeHourAnalysisDelta(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10) / 10;
}

function readHourAnalysisRangeNumber(value) {
  if (value == null || value === "") return 0;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10) / 10;
}

function getHourAnalysisEmployeeKey(row = {}) {
  return getLaborEmployeeRowId(row)
    || normalizeLaborContactEmail(row.contact_email || row.email)
    || normalizeEmployeeName(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "));
}

function normalizeHourAnalysisGroupKey(value, row = {}) {
  const key = String(value || "").trim().replace(/\s+/g, "_").replace(/-/g, "_").toLowerCase();
  if (HOUR_ANALYSIS_GROUP_LABELS[key]) return key;
  const title = normalizePositionTitle(row.position_title || row.position || "");
  const managementKey = title.includes("assistant") ? "assistant_manager" : "general_manager";
  if (key === "manager" || key === "managers" || key === "management") return managementKey;
  if (key === "supervisors") return "supervisor";
  if (key === "csrs") return "csr";
  if (key === "pcts") return "pct";
  if (key === "leadership") {
    const titleGroup = getLaborRosterPositionGroup(row.position_title || row.position || "");
    if (titleGroup === "supervisor") return "supervisor";
    return managementKey;
  }
  return "other";
}

function getHourAnalysisGroupKey(row = {}) {
  const positionTitle = row.position_title || row.position || "";
  const normalizedTitle = normalizePositionTitle(positionTitle);
  if (normalizedTitle.includes("assistant manager")) return "assistant_manager";
  if (normalizedTitle.includes("general manager") || normalizedTitle.includes("director") || normalizedTitle.includes("regional") || normalizedTitle.includes("manager")) return "general_manager";
  const explicitGroup = row.hour_analysis_group || row.group_key || row.groupKey || row.position_group;
  if (explicitGroup) return normalizeHourAnalysisGroupKey(explicitGroup, { position_title: positionTitle });
  return normalizeHourAnalysisGroupKey(getLaborRosterPositionGroup(positionTitle), { position_title: positionTitle });
}

function getHourAnalysisGroupLabel(value) {
  return HOUR_ANALYSIS_GROUP_LABELS[value] || HOUR_ANALYSIS_GROUP_LABELS.other;
}

function getHourAnalysisGroupShortLabel(value) {
  return HOUR_ANALYSIS_GROUP_SHORT_LABELS[value] || getHourAnalysisGroupLabel(value);
}

function slugifyLaborModelId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || `item-${Math.random().toString(36).slice(2, 8)}`;
}

function parseLaborModelCoverage(value = "") {
  if (Array.isArray(value)) return value.map((cell) => String(cell || "").trim());
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((cell) => (cell === "-" ? "" : cell.trim()));
}

function normalizeLaborModelCoverageAlias(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getLaborModelCoverageRoleOption(value = "") {
  const alias = normalizeLaborModelCoverageAlias(value);
  if (!alias) return null;
  return LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP.get(alias) || LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP.get(alias.replace(/\s+/g, "")) || null;
}

function getLaborModelCoverageRoleOptionForGroup(groupKey = "") {
  const normalizedGroup = normalizeLaborModelGroupKey(groupKey);
  return LABOR_MODEL_ROLE_COVERAGE_OPTIONS.find((option) => option.groupKey === normalizedGroup) || null;
}

function normalizeLaborModelHexColor(value = "", fallback = "#334155") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split("").map((char) => `${char}${char}`).join("")}`.toLowerCase();
  }
  return fallback;
}

function mixLaborModelHexColor(base = "#334155", mix = "#ffffff", mixWeight = 0.5) {
  const normalizedBase = normalizeLaborModelHexColor(base, "#334155").slice(1);
  const normalizedMix = normalizeLaborModelHexColor(mix, "#ffffff").slice(1);
  const clampedWeight = Math.max(0, Math.min(1, Number(mixWeight) || 0));
  const channels = [0, 2, 4].map((index) => {
    const baseValue = parseInt(normalizedBase.slice(index, index + 2), 16);
    const mixValue = parseInt(normalizedMix.slice(index, index + 2), 16);
    return Math.round(baseValue * (1 - clampedWeight) + mixValue * clampedWeight)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function buildLaborModelRolePalette(groupKey = "", primaryColor = "") {
  const normalizedGroup = normalizeLaborModelGroupKey(groupKey);
  const fallback = LABOR_MODEL_ROLE_PALETTE[normalizedGroup] || LABOR_MODEL_ROLE_PALETTE.other;
  const strong = normalizeLaborModelHexColor(primaryColor, fallback.strong);
  return {
    strong,
    accent: mixLaborModelHexColor(strong, "#ffffff", 0.28),
    soft: mixLaborModelHexColor(strong, "#ffffff", 0.86),
    text: strong,
  };
}

export function normalizeLaborModelRolePalette(value = {}) {
  const source = isObjectRow(value) ? value : {};
  return Object.fromEntries(Object.entries(LABOR_MODEL_ROLE_PALETTE).map(([groupKey, fallback]) => {
    const camelKey = groupKey.replace(/_([a-z])/g, (_, char) => String(char || "").toUpperCase());
    const rawValue = source[groupKey] || source[camelKey] || source[groupKey.replace(/_/g, "-")];
    if (typeof rawValue === "string") {
      return [groupKey, buildLaborModelRolePalette(groupKey, rawValue)];
    }
    if (!isObjectRow(rawValue)) return [groupKey, fallback];
    const strong = normalizeLaborModelHexColor(rawValue.strong || rawValue.primary || rawValue.color, fallback.strong);
    return [groupKey, {
      strong,
      accent: normalizeLaborModelHexColor(rawValue.accent, mixLaborModelHexColor(strong, "#ffffff", 0.28)),
      soft: normalizeLaborModelHexColor(rawValue.soft, mixLaborModelHexColor(strong, "#ffffff", 0.86)),
      text: normalizeLaborModelHexColor(rawValue.text, strong),
    }];
  }));
}

function getLaborModelRolePalette(groupKey = "", roleColors = null) {
  const normalizedGroup = normalizeLaborModelGroupKey(groupKey);
  const normalizedColors = isObjectRow(roleColors) ? normalizeLaborModelRolePalette(roleColors) : null;
  return normalizedColors?.[normalizedGroup] || LABOR_MODEL_ROLE_PALETTE[normalizedGroup] || LABOR_MODEL_ROLE_PALETTE.other;
}

function getLaborModelCoverageRoleStyle(groupKey = "", roleColors = null) {
  const palette = getLaborModelRolePalette(groupKey, roleColors);
  return {
    "--labor-model-cell-strong": palette.strong,
    "--labor-model-cell-accent": palette.accent,
    "--labor-model-cell-soft": palette.soft,
    "--labor-model-cell-text": palette.text,
  };
}

function parseLaborModelCoverageCompound(value = "") {
  const raw = String(value || "").trim();
  if (!raw || (!raw.includes(":") && !raw.includes("|"))) return null;
  const parts = raw.split(/[:|]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let duration = "full";
  let roleOption = null;
  let isMarketing = false;
  parts.forEach((part) => {
    const normalized = part.toLowerCase();
    if (LABOR_MODEL_MARKETING_TOKENS.has(normalized)) {
      isMarketing = true;
      return;
    }
    if (["0.5", ".5", "1/2", "1⁄2", "half", "h"].includes(normalized)) {
      duration = "half";
      return;
    }
    const nextRoleOption = getLaborModelCoverageRoleOption(part);
    if (nextRoleOption) {
      roleOption = nextRoleOption;
      return;
    }
    if (LEGACY_LABOR_MODEL_ACTIVE_TOKENS.has(normalized) || normalized === "full") {
      duration = "full";
      return;
    }
  });
  if (isMarketing) return LABOR_MODEL_MARKETING_COVERAGE_VALUE;
  if (roleOption) return duration === "half" ? `${LABOR_MODEL_HALF_COVERAGE_VALUE}:${roleOption.label}` : roleOption.label;
  return duration === "half" ? LABOR_MODEL_HALF_COVERAGE_VALUE : LABOR_MODEL_FULL_COVERAGE_VALUE;
}

export function normalizeLaborModelCoverageCell(value = "") {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";
  const compound = parseLaborModelCoverageCompound(raw);
  if (compound) return compound;
  const normalized = raw.toLowerCase();
  if (LABOR_MODEL_MARKETING_TOKENS.has(normalized)) return LABOR_MODEL_MARKETING_COVERAGE_VALUE;
  if (["0.5", ".5", "1/2", "1⁄2", "half", "h"].includes(normalized)) return LABOR_MODEL_HALF_COVERAGE_VALUE;
  const roleOption = getLaborModelCoverageRoleOption(raw);
  if (roleOption) return roleOption.label;
  if (LEGACY_LABOR_MODEL_ACTIVE_TOKENS.has(normalized)) return LABOR_MODEL_FULL_COVERAGE_VALUE;
  return raw.slice(0, 8).toUpperCase();
}

function normalizeLaborModelCoverageCells(value = [], targetLength = 0) {
  const cells = parseLaborModelCoverage(value);
  const nextCells = Array.from({ length: targetLength }, (_, index) => normalizeLaborModelCoverageCell(cells[index] || ""));
  return nextCells;
}

function isLaborModelCoverageActive(value = "") {
  return Boolean(String(value || "").trim());
}

function isLaborModelMarketingCoverage(value = "") {
  return normalizeLaborModelCoverageCell(value) === LABOR_MODEL_MARKETING_COVERAGE_VALUE;
}

function getLaborModelCoverageKind(value = "") {
  const normalized = normalizeLaborModelCoverageCell(value);
  if (!normalized) return "empty";
  if (normalized.startsWith(`${LABOR_MODEL_HALF_COVERAGE_VALUE}:`)) return "half";
  if (normalized === LABOR_MODEL_HALF_COVERAGE_VALUE) return "half";
  if (normalized === LABOR_MODEL_MARKETING_COVERAGE_VALUE) return "marketing";
  if (getLaborModelCoverageRoleOption(normalized)) return "role";
  return "full";
}

function getLaborModelCoverageOperatingWeight(value = "") {
  const kind = getLaborModelCoverageKind(value);
  if (kind === "half") return 0.5;
  if (kind === "full" || kind === "role") return 1;
  return 0;
}

function getLaborModelCoverageMarketingWeight(value = "") {
  return isLaborModelMarketingCoverage(value) ? 1 : 0;
}

function getLaborModelCoverageExplicitRoleOption(value = "") {
  const normalized = normalizeLaborModelCoverageCell(value);
  if (!normalized || normalized === LABOR_MODEL_MARKETING_COVERAGE_VALUE) return null;
  if (normalized.includes(":")) {
    const roleToken = normalized.split(":").find((part) => getLaborModelCoverageRoleOption(part));
    return getLaborModelCoverageRoleOption(roleToken);
  }
  return getLaborModelCoverageRoleOption(normalized);
}

function getLaborModelCoverageRoleOptionForCell(value = "", rowGroupKey = "") {
  const normalized = normalizeLaborModelCoverageCell(value);
  if (!normalized || normalized === LABOR_MODEL_MARKETING_COVERAGE_VALUE) return null;
  return getLaborModelCoverageExplicitRoleOption(normalized) || getLaborModelCoverageRoleOptionForGroup(rowGroupKey);
}

function getLaborModelCoverageDuration(value = "") {
  const normalized = normalizeLaborModelCoverageCell(value);
  if (!normalized) return "";
  return getLaborModelCoverageKind(normalized) === "half" ? "half" : "full";
}

export function buildLaborModelCoverageValue({ duration = "full", roleValue = "", rowGroupKey = "" } = {}) {
  const normalizedDuration = duration === "half" ? "half" : "full";
  const roleOption = getLaborModelCoverageRoleOption(roleValue) || getLaborModelCoverageRoleOptionForGroup(rowGroupKey);
  if (!roleOption) return normalizedDuration === "half" ? LABOR_MODEL_HALF_COVERAGE_VALUE : LABOR_MODEL_FULL_COVERAGE_VALUE;
  return normalizedDuration === "half" ? `${LABOR_MODEL_HALF_COVERAGE_VALUE}:${roleOption.label}` : roleOption.label;
}

export function getLaborModelDefaultCoverageValueForRow(rowGroupKey = "") {
  return buildLaborModelCoverageValue({ duration: "full", rowGroupKey });
}

export function setLaborModelCoverageDuration(value = "", rowGroupKey = "", duration = "full") {
  const normalized = normalizeLaborModelCoverageCell(value);
  if (!normalized) return buildLaborModelCoverageValue({ duration, rowGroupKey });
  if (normalized === LABOR_MODEL_MARKETING_COVERAGE_VALUE) return normalized;
  const roleOption = getLaborModelCoverageRoleOptionForCell(normalized, rowGroupKey);
  return buildLaborModelCoverageValue({ duration, roleValue: roleOption?.label, rowGroupKey });
}

export function setLaborModelCoveragePosition(value = "", rowGroupKey = "", positionValue = "") {
  const normalizedPosition = normalizeLaborModelCoverageCell(positionValue);
  if (!normalizedPosition) return "";
  if (normalizedPosition === LABOR_MODEL_MARKETING_COVERAGE_VALUE) return LABOR_MODEL_MARKETING_COVERAGE_VALUE;
  const duration = getLaborModelCoverageDuration(value) || "full";
  const roleOption = getLaborModelCoverageExplicitRoleOption(normalizedPosition) || getLaborModelCoverageRoleOption(normalizedPosition);
  return buildLaborModelCoverageValue({ duration, roleValue: roleOption?.label, rowGroupKey });
}

function getLaborModelNextCoverageValue(value = "", rowGroupKey = "") {
  const kind = getLaborModelCoverageKind(value);
  if (kind === "empty") return getLaborModelDefaultCoverageValueForRow(rowGroupKey);
  return "";
}

export function shouldCycleLaborModelCoveragePointer({ value = "", isFocused = false } = {}) {
  const kind = getLaborModelCoverageKind(value);
  if (kind === "empty") return true;
  return false;
}

export function getLaborModelCoverageDisplay(value = "", rowGroupKey = "") {
  const normalized = normalizeLaborModelCoverageCell(value);
  const roleOption = getLaborModelCoverageRoleOptionForCell(normalized, rowGroupKey);
  if (normalized === LABOR_MODEL_FULL_COVERAGE_VALUE) return roleOption?.label || "";
  if (normalized === LABOR_MODEL_HALF_COVERAGE_VALUE) return roleOption?.label || "1/2";
  if (normalized.startsWith(`${LABOR_MODEL_HALF_COVERAGE_VALUE}:`)) {
    return roleOption?.label || "1/2";
  }
  if (roleOption) return roleOption.label;
  return normalized;
}

function getLaborModelCoverageOperatingGroupKey(value = "", row = {}) {
  const kind = getLaborModelCoverageKind(value);
  if (kind === "empty" || kind === "marketing") return "";
  const roleOption = getLaborModelCoverageExplicitRoleOption(value);
  if (roleOption) return roleOption.groupKey;
  return normalizeLaborModelGroupKey(row.group_key, row);
}

function parseLaborModelTimePoint(value = "", fallbackSuffix = "") {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  let suffix = match[3] || fallbackSuffix || "";
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 12 || minute < 0 || minute >= 60) return null;
  suffix = suffix.startsWith("p") ? "p" : suffix.startsWith("a") ? "a" : "";
  if (!suffix) return null;
  if (hour === 12) hour = suffix === "a" ? 0 : 12;
  else if (suffix === "p") hour += 12;
  return { minutes: (hour * 60) + minute, suffix };
}

function parseLaborModelTimeRange(label = "") {
  const raw = String(label || "").trim();
  const parts = raw.split(/\s*[-–—]\s*/).filter(Boolean);
  if (parts.length !== 2) return { valid: false, label: raw, hours: 0, error: "Use a range like 5:30a-6a." };
  const suffixes = parts.map((part) => {
    const match = String(part || "").trim().toLowerCase().match(/(a|am|p|pm)$/);
    if (!match) return "";
    return match[1].startsWith("p") ? "p" : "a";
  });
  const start = parseLaborModelTimePoint(parts[0], suffixes[0] || suffixes[1]);
  const endRaw = parseLaborModelTimePoint(parts[1], suffixes[1] || suffixes[0] || start?.suffix);
  if (!start || !endRaw) return { valid: false, label: raw, hours: 0, error: "Use a range like 5:30a-6a." };
  let endMinutes = endRaw.minutes;
  if (endMinutes <= start.minutes) endMinutes += 24 * 60;
  const durationMinutes = endMinutes - start.minutes;
  if (durationMinutes <= 0 || durationMinutes > 12 * 60) {
    return { valid: false, label: raw, hours: 0, error: "Time slot duration must be positive and less than 12 hours." };
  }
  return {
    valid: true,
    label: raw,
    start: start.minutes,
    end: endMinutes,
    hours: normalizeHourAnalysisNumber(durationMinutes / 60, 0),
  };
}

function formatLaborModelTimePoint(minutes = 0) {
  const normalized = ((Math.round(Number(minutes) || 0) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? "p" : "a";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${suffix}`;
}

function formatLaborModelTimeRange(start = 0, end = 0) {
  return `${formatLaborModelTimePoint(start)}-${formatLaborModelTimePoint(end)}`;
}

function normalizeLaborModelBreakerMinute(value) {
  const rawValue = isObjectRow(value)
    ? (value.minutes ?? value.minute ?? value.time_minutes ?? value.timeMinutes ?? value.time ?? value.label)
    : value;
  if (typeof rawValue === "string") {
    const parsed = parseLaborModelTimePoint(rawValue);
    if (parsed) return parsed.minutes;
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric)) return ((Math.round(numeric) % 1440) + 1440) % 1440;
    return null;
  }
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return null;
  return ((Math.round(numeric) % 1440) + 1440) % 1440;
}

function normalizeLaborModelBreakerList(value, fallback = []) {
  const hasExplicitList = Array.isArray(value);
  const source = hasExplicitList ? value : fallback;
  const seen = new Set();
  return source
    .map((item) => normalizeLaborModelBreakerMinute(item))
    .filter((minutes) => {
      if (!Number.isFinite(minutes) || seen.has(minutes)) return false;
      seen.add(minutes);
      return true;
    })
    .sort((a, b) => a - b)
    .map((minutes, index) => ({
      id: `breaker-${minutes}-${index + 1}`,
      minutes,
      label: formatLaborModelTimePoint(minutes),
    }));
}

export function normalizeLaborModelBreakerSettings(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const daySource = isObjectRow(source.days) ? source.days : source;
  return {
    days: Object.fromEntries(LABOR_MODEL_DAY_KEYS.map((dayKey) => [
      dayKey,
      normalizeLaborModelBreakerList(daySource[dayKey], LABOR_MODEL_DEFAULT_BREAKERS_BY_DAY[dayKey] || []),
    ])),
  };
}

export function getLaborModelBreakersForDay(settings = {}, dayKey = "monday") {
  const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
  const normalized = normalizeLaborModelBreakerSettings(settings);
  return normalized.days[normalizedDay] || [];
}

export function updateLaborModelBreakersForDay(settings = {}, dayKey = "monday", breakers = []) {
  const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
  const normalized = normalizeLaborModelBreakerSettings(settings);
  return {
    days: {
      ...normalized.days,
      [normalizedDay]: normalizeLaborModelBreakerList(breakers, []),
    },
  };
}

export function copyLaborModelBreakers(settings = {}, sourceDay = "monday", targetDays = []) {
  const normalizedSourceDay = LABOR_MODEL_DAY_KEYS.includes(sourceDay) ? sourceDay : "monday";
  const normalized = normalizeLaborModelBreakerSettings(settings);
  const sourceBreakers = normalized.days[normalizedSourceDay] || [];
  const normalizedTargets = Array.isArray(targetDays)
    ? targetDays.filter((dayKey) => LABOR_MODEL_DAY_KEYS.includes(dayKey) && dayKey !== normalizedSourceDay)
    : [];
  if (normalizedTargets.length === 0) return normalized;
  return {
    days: {
      ...normalized.days,
      ...Object.fromEntries(normalizedTargets.map((dayKey) => [
        dayKey,
        normalizeLaborModelBreakerList(sourceBreakers, []),
      ])),
    },
  };
}

export function makeLaborModelCellKey(dayKey = "monday", rowId = "", columnIndex = 0) {
  const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
  return `${normalizedDay}::${String(rowId || "").trim()}::${Number(columnIndex)}`;
}

function normalizeLaborModelShiftType(value = "", row = {}) {
  const raw = String(value || row.shift_type || row.shiftType || row.time_type || row.timeType || row.time || "").trim().toLowerCase();
  if (["opening", "open", "am", "morning"].includes(raw)) return "opening";
  if (["mid", "middle", "swing"].includes(raw)) return "mid";
  if (["close", "closing", "pm", "evening"].includes(raw)) return "close";
  const label = String(row.role_label || row.roleLabel || row.label || row.shift_label || row.shiftLabel || "").toLowerCase();
  if (/\b(mid|middle)\b/.test(label)) return "mid";
  if (/\b(pm|close|closing)\b/.test(label)) return "close";
  return "opening";
}

function normalizeLaborModelBreakMinutes(value, fallback = 30) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(240, parsed));
}

function validateLaborModelColumns(columns = []) {
  const parsed = columns.map((column) => parseLaborModelTimeRange(column.label));
  const errors = [];
  parsed.forEach((slot, index) => {
    if (!slot.valid) errors.push({ index, message: slot.error || "Invalid time range." });
    if (index > 0 && slot.valid && parsed[index - 1]?.valid && Math.abs(parsed[index - 1].end - slot.start) > 0.1) {
      errors.push({ index, message: `${columns[index - 1]?.label || "Previous slot"} must end where ${columns[index]?.label || "this slot"} starts.` });
    }
  });
  return { valid: errors.length === 0, errors, parsed };
}

function getLaborModelColumnBreakerMeta(dayKey = "", column = {}, laborModel = {}) {
  const start = Number(column.start_minutes);
  const end = Number(column.end_minutes);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { className: "", style: {} };
  const breakers = getLaborModelBreakersForDay(laborModel.breakers || laborModel, dayKey).map((breaker) => breaker.minutes);
  const normalizedStart = ((start % 1440) + 1440) % 1440;
  const normalizedEnd = end > start ? end : start + normalizeHourAnalysisNumber(column.hours, 0) * 60;
  const leftBreaker = breakers.find((breaker) => Math.abs(breaker - normalizedStart) < 0.1);
  if (Number.isFinite(leftBreaker)) return { className: " has-shift-breaker-left", style: {} };
  const insideBreaker = breakers.find((breaker) => {
    const candidate = breaker < normalizedStart ? breaker + 1440 : breaker;
    return candidate > start && candidate < normalizedEnd;
  });
  if (!Number.isFinite(insideBreaker)) return { className: "", style: {} };
  const candidate = insideBreaker < normalizedStart ? insideBreaker + 1440 : insideBreaker;
  const pct = ((candidate - start) / Math.max(1, normalizedEnd - start)) * 100;
  return { className: " has-shift-breaker-inside", style: { "--labor-model-breaker-pct": `${Math.max(3, Math.min(97, pct)).toFixed(2)}%` } };
}

function inferLaborModelGroupKeyFromLabel(value = "") {
  const label = String(value || "").trim().toLowerCase();
  if (!label) return "other";
  if (/^(csr|customer service representative)\b/.test(label)) return "csr";
  if (/^(pct|pet care technician)\b/.test(label)) return "pct";
  if (/^(sup|supervisor)\b/.test(label)) return "supervisor";
  if (/^(mod|am|assistant manager)\b/.test(label)) return "assistant_manager";
  if (/^(gm|general manager)\b/.test(label)) return "general_manager";
  return getHourAnalysisGroupKey({ position_title: value });
}

function normalizeLaborModelGroupKey(value = "", row = {}) {
  const explicit = normalizeHourAnalysisGroupKey(value, row);
  if (explicit !== "other") return explicit;
  const inferred = inferLaborModelGroupKeyFromLabel(row.role_label || row.roleLabel || row.label || row.shift_label || row.shiftLabel || "");
  return HOUR_ANALYSIS_GROUP_LABELS[inferred] ? inferred : "other";
}

function makeDefaultLaborModelDay(dayKey, coverageWindow, columns = [], rowDefinitions = []) {
  const normalizedColumns = columns.map(([label, hours], index) => ({
    id: `${dayKey}-slot-${index + 1}`,
    label,
    hours: parseLaborModelTimeRange(label).valid ? parseLaborModelTimeRange(label).hours : Math.max(0, Math.round(Number(hours || 0) * 10) / 10),
  }));
  return {
    day_key: dayKey,
    day_label: LABOR_MODEL_DAY_LABELS[dayKey] || dayKey,
    coverage_window: coverageWindow,
    columns: normalizedColumns,
    rows: rowDefinitions.map(([groupKey, label, coveragePattern], index) => ({
      id: `${dayKey}-${slugifyLaborModelId(label)}-${index + 1}`,
      group_key: groupKey,
      role_label: label,
      shift_type: normalizeLaborModelShiftType("", { role_label: label }),
      break_enabled: true,
      break_minutes: 30,
      coverage: normalizeLaborModelCoverageCells(coveragePattern, normalizedColumns.length),
    })),
  };
}

function cloneDefaultHourAnalysisLaborModel() {
  return JSON.parse(JSON.stringify(DEFAULT_HOUR_ANALYSIS_LABOR_MODEL));
}

function normalizeHourAnalysisLaborModelColumn(column = {}, index = 0, dayKey = "day") {
  const source = isObjectRow(column) ? column : {};
  const label = String(source.label || source.time || source.window || `Slot ${index + 1}`).trim();
  const parsedRange = parseLaborModelTimeRange(label);
  return {
    id: String(source.id || `${dayKey}-slot-${index + 1}`).trim(),
    label,
    hours: parsedRange.valid
      ? parsedRange.hours
      : normalizeHourAnalysisNumber(source.hours ?? source.duration ?? source.slot_hours ?? source.slotHours, 1),
    start_minutes: parsedRange.valid ? parsedRange.start : null,
    end_minutes: parsedRange.valid ? parsedRange.end : null,
    is_valid: parsedRange.valid,
    validation_error: parsedRange.valid ? "" : parsedRange.error,
  };
}

function normalizeHourAnalysisLaborModelRow(row = {}, index = 0, columns = [], dayKey = "day") {
  const source = isObjectRow(row) ? row : {};
  const roleLabel = String(source.role_label || source.roleLabel || source.label || source.shift_label || source.shiftLabel || `Line ${index + 1}`).trim();
  const breakEnabledSource = source.break_enabled ?? source.breakEnabled ?? source.has_break ?? source.hasBreak;
  const breakEnabled = breakEnabledSource == null ? true : Boolean(breakEnabledSource);
  return {
    id: String(source.id || `${dayKey}-${slugifyLaborModelId(roleLabel)}-${index + 1}`).trim(),
    group_key: normalizeLaborModelGroupKey(source.group_key || source.groupKey || source.role_group || source.roleGroup || source.position_group || source.positionGroup, { ...source, role_label: roleLabel }),
    role_label: roleLabel,
    shift_type: normalizeLaborModelShiftType(source.shift_type || source.shiftType || source.time_type || source.timeType, { ...source, role_label: roleLabel }),
    break_enabled: breakEnabled,
    break_minutes: normalizeLaborModelBreakMinutes(source.break_minutes ?? source.breakMinutes ?? source.break_duration_minutes ?? source.breakDurationMinutes, 30),
    coverage: normalizeLaborModelCoverageCells(source.coverage || source.cells || source.values, columns.length),
  };
}

function normalizeHourAnalysisLaborModelDay(dayKey, value = {}, fallback = {}) {
  const source = isObjectRow(value) ? value : {};
  const fallbackDay = isObjectRow(fallback) ? fallback : {};
  const rawColumns = Array.isArray(source.columns) ? source.columns : fallbackDay.columns || [];
  const columns = rawColumns.map((column, index) => normalizeHourAnalysisLaborModelColumn(column, index, dayKey));
  const rawRows = Array.isArray(source.rows) ? source.rows : fallbackDay.rows || [];
  const rows = rawRows.map((row, index) => normalizeHourAnalysisLaborModelRow(row, index, columns, dayKey));
  return {
    day_key: dayKey,
    day_label: LABOR_MODEL_DAY_LABELS[dayKey] || source.day_label || source.dayLabel || fallbackDay.day_label || dayKey,
    coverage_window: String(source.coverage_window || source.coverageWindow || fallbackDay.coverage_window || "").trim(),
    columns,
    rows,
  };
}

function normalizeHourAnalysisLaborModel(value = {}) {
  const defaults = cloneDefaultHourAnalysisLaborModel();
  const source = isObjectRow(value) ? value : {};
  const rawDays = isObjectRow(source.days) ? source.days : source;
  return {
    version: Number(source.version || defaults.version || 1),
    source: String(source.source || defaults.source || "").trim(),
    breakers: normalizeLaborModelBreakerSettings(source.breakers || source.greyBars || source.grayBars || source.breakerSettings || source.breaker_settings),
    days: Object.fromEntries(LABOR_MODEL_DAY_KEYS.map((dayKey) => [
      dayKey,
      normalizeHourAnalysisLaborModelDay(dayKey, rawDays[dayKey], defaults.days[dayKey]),
    ])),
  };
}

export function removeLaborModelColumnFromDay(day = {}, columnIndex = 0, dayKey = "day") {
  const normalizedDay = normalizeHourAnalysisLaborModelDay(dayKey, day, day);
  const targetIndex = Number(columnIndex);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= normalizedDay.columns.length) {
    return { day: normalizedDay, removedColumn: null, error: "Choose a valid time slot." };
  }
  if (normalizedDay.columns.length <= 1) {
    return { day: normalizedDay, removedColumn: null, error: "At least one time slot is required." };
  }
  const removedColumn = normalizedDay.columns[targetIndex];
  const mergeIndex = targetIndex > 0 ? targetIndex - 1 : 1;
  const targetRange = parseLaborModelTimeRange(removedColumn.label);
  const mergeColumn = normalizedDay.columns[mergeIndex];
  const mergeRange = parseLaborModelTimeRange(mergeColumn?.label);
  let nextColumns = normalizedDay.columns.map((column) => ({ ...column }));
  let mergedColumn = null;

  if (targetRange.valid && mergeRange.valid && mergeColumn) {
    const mergedStart = mergeIndex < targetIndex ? mergeRange.start : targetRange.start;
    const mergedEnd = mergeIndex < targetIndex ? targetRange.end : mergeRange.end;
    const mergedLabel = formatLaborModelTimeRange(mergedStart, mergedEnd);
    mergedColumn = normalizeHourAnalysisLaborModelColumn({
      ...mergeColumn,
      label: mergedLabel,
    }, mergeIndex, dayKey);
    nextColumns[mergeIndex] = mergedColumn;
  }

  nextColumns = nextColumns.filter((_, index) => index !== targetIndex);
  const validation = validateLaborModelColumns(nextColumns);
  if (!validation.valid) {
    return {
      day: normalizedDay,
      removedColumn: null,
      error: validation.errors[0]?.message || "Time slots must stay contiguous.",
    };
  }

  const nextRows = normalizedDay.rows.map((row) => {
    const coverage = [...row.coverage];
    if (mergedColumn) {
      const existingValue = String(coverage[mergeIndex] || "").trim();
      const removedValue = String(coverage[targetIndex] || "").trim();
      coverage[mergeIndex] = existingValue || removedValue;
    }
    return {
      ...row,
      coverage: coverage.filter((_, index) => index !== targetIndex),
    };
  });

  return {
    day: {
      ...normalizedDay,
      columns: nextColumns,
      rows: nextRows,
    },
    removedColumn,
    mergedColumn,
    error: "",
  };
}

function calculateLaborModelRowHourBuckets(row = {}, columns = []) {
  const cells = normalizeLaborModelCoverageCells(row.coverage, columns.length);
  const raw = cells.reduce((sum, cell, index) => {
    const slotHours = normalizeHourAnalysisNumber(columns[index]?.hours, 0);
    const operatingWeight = getLaborModelCoverageOperatingWeight(cell);
    const operatingGroupKey = getLaborModelCoverageOperatingGroupKey(cell, row);
    if (operatingGroupKey && operatingWeight > 0) {
      sum.roleHours[operatingGroupKey] = normalizeHourAnalysisDelta((sum.roleHours[operatingGroupKey] || 0) + (operatingWeight * slotHours));
    }
    return {
      roleHours: sum.roleHours,
      operatingHours: sum.operatingHours + (operatingWeight * slotHours),
      marketingHours: sum.marketingHours + (getLaborModelCoverageMarketingWeight(cell) * slotHours),
    };
  }, { roleHours: makeLaborModelRoleHoursBucket(), operatingHours: 0, marketingHours: 0 });
  const grossHours = raw.operatingHours + raw.marketingHours;
  if (grossHours <= 0) return { roleHours: raw.roleHours, operatingHours: 0, marketingHours: 0, totalHours: 0, breakHours: 0 };
  const breakHours = row.break_enabled ? Math.min(grossHours, normalizeLaborModelBreakMinutes(row.break_minutes, 30) / 60) : 0;
  const operatingBreak = Math.min(raw.operatingHours, breakHours);
  const marketingBreak = Math.min(raw.marketingHours, Math.max(0, breakHours - operatingBreak));
  const operatingHours = normalizeHourAnalysisNumber(Math.max(0, raw.operatingHours - operatingBreak), 0);
  const marketingHours = normalizeHourAnalysisNumber(Math.max(0, raw.marketingHours - marketingBreak), 0);
  const operatingScale = raw.operatingHours > 0 ? operatingHours / raw.operatingHours : 0;
  const roleHours = Object.fromEntries(Object.entries(raw.roleHours).map(([key, value]) => [
    key,
    normalizeHourAnalysisNumber(value * operatingScale, 0),
  ]));
  return {
    roleHours,
    operatingHours,
    marketingHours,
    totalHours: normalizeHourAnalysisNumber(operatingHours + marketingHours, 0),
    breakHours: normalizeHourAnalysisNumber(breakHours, 0),
  };
}

function calculateLaborModelRowHours(row = {}, columns = []) {
  return calculateLaborModelRowHourBuckets(row, columns).operatingHours;
}

function makeLaborModelRoleHoursBucket() {
  return Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, 0]));
}

function buildHourAnalysisLaborModelSummary(model = DEFAULT_HOUR_ANALYSIS_LABOR_MODEL) {
  const normalizedModel = normalizeHourAnalysisLaborModel(model);
  const roleWeekly = makeLaborModelRoleHoursBucket();
  const dayRows = LABOR_MODEL_DAY_KEYS.map((dayKey) => {
    const day = normalizedModel.days[dayKey];
    const columnValidation = validateLaborModelColumns(day.columns);
    const roleHours = makeLaborModelRoleHoursBucket();
    let totalHours = 0;
    let marketingHours = 0;
    let peakCoverage = 0;
    const baseRowSummaries = day.rows.map((row) => {
      const rowBuckets = calculateLaborModelRowHourBuckets(row, day.columns);
      const rowHours = rowBuckets.operatingHours;
      const groupKey = normalizeLaborModelGroupKey(row.group_key, row);
      Object.entries(rowBuckets.roleHours || {}).forEach(([roleKey, roleHourValue]) => {
        if (!HOUR_ANALYSIS_GROUP_LABELS[roleKey] || roleHourValue <= 0) return;
        roleHours[roleKey] = normalizeHourAnalysisDelta((roleHours[roleKey] || 0) + roleHourValue);
        roleWeekly[roleKey] = normalizeHourAnalysisDelta((roleWeekly[roleKey] || 0) + roleHourValue);
      });
      totalHours = normalizeHourAnalysisDelta(totalHours + rowHours);
      marketingHours = normalizeHourAnalysisDelta(marketingHours + rowBuckets.marketingHours);
      return {
        ...row,
        group_key: groupKey,
        hours: rowHours,
        roleHours: rowBuckets.roleHours,
        marketingHours: rowBuckets.marketingHours,
        totalHours: rowBuckets.totalHours,
        breakHours: rowBuckets.breakHours,
      };
    });
    const rowSummaries = baseRowSummaries.map((row, index, rows) => {
      const runKey = `${row.group_key}:${row.shift_type}`;
      let startIndex = index;
      while (startIndex > 0 && `${rows[startIndex - 1].group_key}:${rows[startIndex - 1].shift_type}` === runKey) startIndex -= 1;
      let endIndex = index;
      while (endIndex + 1 < rows.length && `${rows[endIndex + 1].group_key}:${rows[endIndex + 1].shift_type}` === runKey) endIndex += 1;
      const runLength = endIndex - startIndex + 1;
      return {
        ...row,
        runIndex: index - startIndex + 1,
        runLength,
      };
    });
    const columnTotals = day.columns.map((column, index) => {
      const operatingCoverage = rowSummaries.reduce((sum, row) => sum + getLaborModelCoverageOperatingWeight(row.coverage[index]), 0);
      const marketingCoverage = rowSummaries.reduce((sum, row) => sum + getLaborModelCoverageMarketingWeight(row.coverage[index]), 0);
      const slotHours = normalizeHourAnalysisNumber(column.hours, 0);
      peakCoverage = Math.max(peakCoverage, operatingCoverage);
      return {
        index,
        label: column.label,
        operatingCoverage: normalizeHourAnalysisNumber(operatingCoverage, 0),
        marketingCoverage: normalizeHourAnalysisNumber(marketingCoverage, 0),
        operatingHours: normalizeHourAnalysisNumber(operatingCoverage * slotHours, 0),
        marketingHours: normalizeHourAnalysisNumber(marketingCoverage * slotHours, 0),
      };
    });
    return {
      key: dayKey,
      label: LABOR_MODEL_DAY_LABELS[dayKey] || dayKey,
      shortLabel: LABOR_MODEL_DAY_SHORT_LABELS[dayKey] || dayKey,
      coverageWindow: day.coverage_window,
      columns: day.columns,
      rows: rowSummaries,
      roleHours,
      totalHours,
      marketingHours,
      columnTotals,
      peakCoverage,
      columnValidation,
    };
  });
  const totalWeekly = normalizeHourAnalysisNumber(dayRows.reduce((sum, row) => sum + row.totalHours, 0), 0);
  const totalMarketingWeekly = normalizeHourAnalysisNumber(dayRows.reduce((sum, row) => sum + row.marketingHours, 0), 0);
  const highestDay = dayRows.reduce((winner, row) => (row.totalHours > (winner?.totalHours || 0) ? row : winner), dayRows[0] || null);
  return {
    model: normalizedModel,
    dayRows,
    roleWeekly: Object.fromEntries(Object.entries(roleWeekly).map(([key, value]) => [key, normalizeHourAnalysisNumber(value, 0)])),
    totalWeekly,
    totalMarketingWeekly,
    averageDaily: normalizeHourAnalysisNumber(totalWeekly / 7, 0),
    highestDay,
    hasRows: dayRows.some((day) => day.rows.length > 0 && day.columns.length > 0),
  };
}

function normalizeHourAnalysisRangeOrder(range = {}) {
  const rawExpected = normalizeHourAnalysisNumber(range.expected ?? range.preferred ?? range.hours, 0);
  const rawMin = normalizeHourAnalysisNumber(range.min ?? range.minimum ?? range.min_hours, rawExpected);
  const rawMax = normalizeHourAnalysisNumber(range.max ?? range.maximum ?? range.max_hours, Math.max(rawExpected, rawMin));
  const min = Math.min(rawMin, rawExpected, rawMax);
  const max = Math.max(rawMin, rawExpected, rawMax);
  const expected = Math.max(min, Math.min(max, rawExpected));
  return { min, expected, max };
}

function buildHourAnalysisRangeFromExpected(value, defaults = {}, commitment = "full_time") {
  const defaultRange = normalizeHourAnalysisRangeOrder(defaults);
  const expected = normalizeHourAnalysisNumber(value, defaultRange.expected);
  if (expected <= 0) return { min: 0, expected: 0, max: 0 };
  if (expected === defaultRange.expected) return defaultRange;
  if (commitment === "part_time") {
    return normalizeHourAnalysisRangeOrder({
      min: Math.max(0, expected - 7),
      expected,
      max: expected + 10,
    });
  }
  return normalizeHourAnalysisRangeOrder({
    min: Math.max(0, expected >= 35 ? expected - 5 : expected - 6),
    expected,
    max: Math.max(expected + 5, 40),
  });
}

function normalizeHourAnalysisRangeValue(value, defaults = {}, commitment = "full_time") {
  const defaultRange = normalizeHourAnalysisRangeOrder(defaults);
  if (!isObjectRow(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? buildHourAnalysisRangeFromExpected(parsed, defaultRange, commitment) : defaultRange;
  }
  return normalizeHourAnalysisRangeOrder({
    min: value.min ?? value.minimum ?? value.min_hours ?? defaultRange.min,
    expected: value.expected ?? value.preferred ?? value.hours ?? value.preferred_hours ?? defaultRange.expected,
    max: value.max ?? value.maximum ?? value.max_hours ?? defaultRange.max,
  });
}

function updateHourAnalysisRangeBand(range = {}, band = "expected", value = 0) {
  const normalizedBand = HOUR_ANALYSIS_RANGE_KEYS.includes(band) ? band : "expected";
  return normalizeHourAnalysisRangeOrder({
    ...normalizeHourAnalysisRangeOrder(range),
    [normalizedBand]: normalizeHourAnalysisNumber(value, 0),
  });
}

function readHourAnalysisGroupInput(input = {}, groupKey = "other") {
  const source = isObjectRow(input) ? input : {};
  if (isObjectRow(source[groupKey])) return source[groupKey];
  if (groupKey === "general_manager" || groupKey === "assistant_manager") {
    if (isObjectRow(source.management)) return source.management;
    if (isObjectRow(source.manager)) return source.manager;
    if (isObjectRow(source.managers)) return source.managers;
    if (isObjectRow(source.leadership)) return source.leadership;
  }
  if (groupKey === "supervisor") {
    if (isObjectRow(source.supervisors)) return source.supervisors;
    if (isObjectRow(source.leadership)) return source.leadership;
  }
  return {};
}

function normalizeHourAnalysisExpectationMap(input = {}) {
  return Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => {
    const defaults = DEFAULT_HOUR_ANALYSIS_EXPECTATIONS[group.key] || {};
    const raw = readHourAnalysisGroupInput(input, group.key);
    return [
      group.key,
      {
        full_time: normalizeHourAnalysisRangeValue(raw.full_time ?? raw.fullTime, defaults.full_time, "full_time"),
        part_time: normalizeHourAnalysisRangeValue(raw.part_time ?? raw.partTime, defaults.part_time, "part_time"),
      },
    ];
  }));
}

function normalizeHourAnalysisOverrideRange(value = {}) {
  if (!isObjectRow(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? { expected: normalizeHourAnalysisNumber(parsed, 0) } : {};
  }
  return Object.fromEntries(HOUR_ANALYSIS_RANGE_KEYS.flatMap((key) => {
    const rawValue = key === "min"
      ? value.min ?? value.minimum ?? value.min_hours
      : key === "expected"
        ? value.expected ?? value.preferred ?? value.hours ?? value.preferred_hours ?? value.expected_hours
        : value.max ?? value.maximum ?? value.max_hours;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) return [];
    return [[key, normalizeHourAnalysisNumber(parsed, 0)]];
  }));
}

function normalizeHourAnalysisOverrides(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    if (!employeeKey) return [];
    const overrides = normalizeHourAnalysisOverrideRange(value);
    if (Object.keys(overrides).length === 0) return [];
    return [[employeeKey, overrides]];
  }));
}

function normalizeHourAnalysisNotes(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    const note = String(value || "").trim();
    if (!employeeKey || !note) return [];
    return [[employeeKey, note]];
  }));
}

function normalizeHourAnalysisCoverageSplit(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const floorGroup = normalizeHourAnalysisGroupKey(source.floor_group || source.floorGroup || source.floor_role || source.floorRole);
  const normalizedFloorGroup = ["csr", "pct"].includes(floorGroup) ? floorGroup : "";
  const hasAdminHours = source.admin_hours != null || source.adminHours != null || source.primary_hours != null || source.primaryHours != null;
  return {
    floor_group: normalizedFloorGroup,
    admin_hours: hasAdminHours ? normalizeHourAnalysisNumber(source.admin_hours ?? source.adminHours ?? source.primary_hours ?? source.primaryHours, 0) : null,
  };
}

function normalizeHourAnalysisSplits(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    if (!employeeKey) return [];
    const split = normalizeHourAnalysisCoverageSplit(value);
    if (!split.floor_group && split.admin_hours == null) return [];
    return [[employeeKey, split]];
  }));
}

function normalizeHourAnalysisPositionMovement(value = {}) {
  if (value == null || value === "") return {};
  const source = isObjectRow(value) ? value : {};
  const rawPosition = isObjectRow(value)
    ? (source.position_title
      || source.positionTitle
      || source.target_position_title
      || source.targetPositionTitle
      || source.position
      || "")
    : value;
  const positionTitle = formatLaborPositionTitle(rawPosition);
  if (!positionTitle) return {};
  return {
    position_title: positionTitle,
    group_key: getHourAnalysisGroupKey({ position_title: positionTitle }),
  };
}

function normalizeHourAnalysisPositionMovements(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    if (!employeeKey) return [];
    const movement = normalizeHourAnalysisPositionMovement(value);
    if (!movement.position_title) return [];
    return [[employeeKey, movement]];
  }));
}

function normalizeHourAnalysisAuditLog(input = []) {
  return toObjectRows(input)
    .map((entry, index) => ({
      id: String(entry.id || `hour-analysis-audit-${index}`).trim(),
      occurred_at: entry.occurred_at || entry.occurredAt || entry.timestamp || new Date(0).toISOString(),
      action: String(entry.action || "changed").trim(),
      entity_id: String(entry.entity_id || entry.entityId || "").trim(),
      entity_label: String(entry.entity_label || entry.entityLabel || "").trim(),
      summary: String(entry.summary || "").trim(),
      before: entry.before ?? entry.old_value ?? entry.oldValue ?? null,
      after: entry.after ?? entry.new_value ?? entry.newValue ?? null,
      note: String(entry.note || "").trim(),
      actor_id: entry.actor_id || entry.actorId || null,
      actor_name: String(entry.actor_name || entry.actorName || "Staff").trim(),
    }))
    .filter((entry) => entry.id && entry.action)
    .sort((left, right) => String(right.occurred_at || "").localeCompare(String(left.occurred_at || "")))
    .slice(0, 300);
}

function normalizeHourAnalysisScenarioType(value = "") {
  const normalized = String(value || "").trim().replace(/[-\s]+/g, "_").toLowerCase();
  return ["move", "movement", "transfer", "role_move", "role_change"].includes(normalized) ? "move" : "add";
}

function normalizeHourAnalysisWhatIfRows(input = []) {
  return toObjectRows(input).map((row, index) => {
    const id = String(row.id || `what-if-${index + 1}`).trim();
    const scenarioType = normalizeHourAnalysisScenarioType(row.scenario_type || row.scenarioType || (row.source_employee_key || row.sourceEmployeeKey ? "move" : "add"));
    const commitment = readLaborEmploymentCommitment(row) || "full_time";
    const positionTitle = formatLaborPositionTitle(row.position_title || row.position || "");
    const groupKey = getHourAnalysisGroupKey({
      group_key: row.group_key || row.groupKey,
      position_group: row.position_group,
      position_title: positionTitle,
    });
    const rawHourOverrides = row.hour_overrides || row.hourOverrides || {};
    const rawOverride = row.preferred_hours_override ?? row.preferredHoursOverride ?? row.preferred_hours ?? row.preferredHours;
    const hourOverrides = normalizeHourAnalysisOverrideRange({
      ...(isObjectRow(rawHourOverrides) ? rawHourOverrides : {}),
      ...((rawOverride === "" || rawOverride == null) ? {} : { expected: rawOverride }),
    });
    return {
      id,
      scenario_type: scenarioType,
      source_employee_key: String(row.source_employee_key || row.sourceEmployeeKey || row.source_employee_id || row.sourceEmployeeId || "").trim(),
      source_full_name: String(row.source_full_name || row.sourceFullName || "").trim(),
      source_position_title: formatLaborPositionTitle(row.source_position_title || row.sourcePositionTitle || ""),
      source_employment_commitment: readLaborEmploymentCommitment({ employment_commitment: row.source_employment_commitment || row.sourceEmploymentCommitment }) || "",
      source_group_key: normalizeHourAnalysisGroupKey(row.source_group_key || row.sourceGroupKey || row.source_position_group || row.sourcePositionGroup),
      full_name: String(row.full_name || row.name || "What-if Employee").trim() || "What-if Employee",
      position_title: positionTitle,
      employment_commitment: commitment,
      group_key: groupKey,
      hour_overrides: hourOverrides,
      split: normalizeHourAnalysisCoverageSplit(row.split || row.coverage_split || row.coverageSplit),
      note: String(row.note || row.justification || "").trim(),
    };
  });
}

function normalizeHourAnalysisSkeletonMap(input = {}) {
  const source = isObjectRow(input) ? input : {};
  const defaultAdminDaily = DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON.general_manager + DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON.assistant_manager;
  const hasLegacyLeadership = source.leadership != null && source.management == null && source.manager == null && source.supervisor == null;
  const legacyLeadership = normalizeHourAnalysisNumber(source.leadership, defaultAdminDaily + DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON.supervisor);
  const rawManagement = source.management ?? source.manager;
  const splitManagement = rawManagement != null ? normalizeHourAnalysisNumber(rawManagement / 2, defaultAdminDaily / 2) : null;
  return Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => {
    let rawValue = source[group.key];
    if (group.key === "general_manager") rawValue = source.general_manager ?? source.generalManager ?? splitManagement ?? (hasLegacyLeadership ? normalizeHourAnalysisNumber(legacyLeadership / 4, DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON.general_manager) : rawValue);
    if (group.key === "assistant_manager") rawValue = source.assistant_manager ?? source.assistantManager ?? splitManagement ?? (hasLegacyLeadership ? normalizeHourAnalysisNumber(legacyLeadership / 4, DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON.assistant_manager) : rawValue);
    if (group.key === "supervisor") rawValue = source.supervisor ?? source.supervisors ?? (hasLegacyLeadership ? normalizeHourAnalysisNumber(legacyLeadership / 2, DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON.supervisor) : rawValue);
    return [
      group.key,
      normalizeHourAnalysisNumber(rawValue, DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON[group.key] ?? 0),
    ];
  }));
}

function normalizeHourAnalysisThresholds(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const skeletonSource = source.daily_skeleton || source.dailySkeleton || source.skeleton_daily || source.skeletonDaily;
  const hasSavedThresholds = isObjectRow(skeletonSource);
  if (!hasSavedThresholds) {
    return {
      reserve_percent: HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT,
      daily_skeleton: normalizeHourAnalysisSkeletonMap(DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON),
    };
  }
  const normalized = {
    reserve_percent: HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT,
    daily_skeleton: normalizeHourAnalysisSkeletonMap(skeletonSource),
  };
  const allSkeletonValuesAreZero = Object.values(normalized.daily_skeleton).every((hours) => normalizeHourAnalysisNumber(hours, 0) === 0);
  if (allSkeletonValuesAreZero) {
    return {
      reserve_percent: HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT,
      daily_skeleton: normalizeHourAnalysisSkeletonMap(DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON),
    };
  }
  return normalized;
}

export function normalizeHourAnalysisSettings(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const laborModelSource = source.laborModel || source.labor_model || source.laborModelSettings || source.labor_model_settings;
  return {
    expectations: normalizeHourAnalysisExpectationMap(source.expectations),
    overrides: normalizeHourAnalysisOverrides(source.overrides),
    notes: normalizeHourAnalysisNotes(source.notes || source.justifications),
    splits: normalizeHourAnalysisSplits(source.splits || source.coverage_splits || source.coverageSplits),
    positionMovements: normalizeHourAnalysisPositionMovements(source.positionMovements || source.position_movements || source.movements || source.roleMovements || source.role_movements),
    whatIfRows: normalizeHourAnalysisWhatIfRows(source.whatIfRows || source.what_if_rows),
    thresholds: normalizeHourAnalysisThresholds(source.thresholds || source.coverage || source.capacity),
    laborModel: normalizeHourAnalysisLaborModel(laborModelSource),
    laborModelRoleColors: normalizeLaborModelRolePalette(
      source.laborModelRoleColors
        || source.labor_model_role_colors
        || source.roleColors
        || source.role_colors
        || laborModelSource?.roleColors
        || laborModelSource?.role_colors
    ),
    auditLog: normalizeHourAnalysisAuditLog(source.auditLog || source.audit_log),
  };
}

export function clearHourAnalysisPlanningState(value = {}) {
  const normalized = normalizeHourAnalysisSettings(value);
  const whatIfIds = new Set(
    normalized.whatIfRows
      .map((row) => String(row?.id || row?.employeeKey || "").trim())
      .filter(Boolean)
  );
  const nextNotes = { ...normalized.notes };
  const nextSplits = { ...normalized.splits };
  let removedWhatIfNotes = 0;
  let removedWhatIfSplits = 0;
  whatIfIds.forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(nextNotes, id)) {
      delete nextNotes[id];
      removedWhatIfNotes += 1;
    }
    if (Object.prototype.hasOwnProperty.call(nextSplits, id)) {
      delete nextSplits[id];
      removedWhatIfSplits += 1;
    }
  });
  const removedWhatIfRows = normalized.whatIfRows.length;
  const removedPositionMovements = Object.keys(normalized.positionMovements || {}).length;
  const changed = Boolean(removedWhatIfRows || removedPositionMovements || removedWhatIfNotes || removedWhatIfSplits);
  return {
    settings: {
      ...normalized,
      notes: nextNotes,
      splits: nextSplits,
      positionMovements: {},
      whatIfRows: [],
    },
    summary: {
      changed,
      removedWhatIfRows,
      removedPositionMovements,
      removedWhatIfNotes,
      removedWhatIfSplits,
    },
  };
}

function makeHourAnalysisRangeTotals() {
  return { min: 0, expected: 0, max: 0 };
}

function addHourAnalysisRangeDelta(target, range = {}, delta = 1) {
  const multiplier = Number(delta);
  const normalizedDelta = Number.isFinite(multiplier) ? multiplier : 1;
  HOUR_ANALYSIS_RANGE_KEYS.forEach((key) => {
    target[key] = normalizeHourAnalysisDelta(target[key] + (readHourAnalysisRangeNumber(range[key]) * normalizedDelta));
  });
}

function addHourAnalysisRange(target, range = {}) {
  addHourAnalysisRangeDelta(target, range, 1);
}

function sumHourAnalysisRanges(...ranges) {
  const total = makeHourAnalysisRangeTotals();
  ranges.forEach((range) => addHourAnalysisRange(total, range));
  return total;
}

function mergeHourAnalysisRange(inheritedRange = {}, overrideRange = {}) {
  const inherited = normalizeHourAnalysisRangeOrder(inheritedRange);
  const overrides = normalizeHourAnalysisOverrideRange(overrideRange);
  return normalizeHourAnalysisRangeOrder(Object.fromEntries(HOUR_ANALYSIS_RANGE_KEYS.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : inherited[key],
  ])));
}

function getHourAnalysisDefaultCoverageSplit(row = {}, groupKey = "other") {
  const title = normalizePositionTitle(row.position_title || row.position || "");
  if (groupKey === "supervisor" && title.includes("csr") && title.includes("supervisor")) {
    return { floor_group: "csr", admin_hours: 8 };
  }
  if (groupKey === "supervisor" && title.includes("pct") && title.includes("supervisor")) {
    return { floor_group: "pct", admin_hours: 8 };
  }
  return { floor_group: "", admin_hours: null };
}

function resolveHourAnalysisCoverageSplit({ row = {}, groupKey = "other", preferredHours = 0, split = {} } = {}) {
  const defaultSplit = getHourAnalysisDefaultCoverageSplit(row, groupKey);
  const normalizedSplit = normalizeHourAnalysisCoverageSplit(split);
  const floorGroup = normalizedSplit.floor_group || defaultSplit.floor_group;
  const preferred = normalizeHourAnalysisNumber(preferredHours, 0);
  if (!floorGroup || !["general_manager", "assistant_manager", "supervisor", "csr"].includes(groupKey)) {
    return {
      floor_group: "",
      admin_hours: preferred,
      primary_hours: preferred,
      floor_hours: 0,
    };
  }
  const defaultAdminHours = defaultSplit.floor_group ? defaultSplit.admin_hours : preferred;
  const rawAdminHours = normalizedSplit.admin_hours == null ? defaultAdminHours : normalizedSplit.admin_hours;
  const adminHours = Math.max(0, Math.min(preferred, normalizeHourAnalysisNumber(rawAdminHours, 0)));
  return {
    floor_group: floorGroup,
    admin_hours: adminHours,
    primary_hours: adminHours,
    floor_hours: normalizeHourAnalysisNumber(preferred - adminHours, 0),
  };
}

function buildHourAnalysisRangeFromHours(hours = 0) {
  const expected = normalizeHourAnalysisNumber(hours, 0);
  return { min: expected, expected, max: expected };
}

function calculateHourAnalysisRecommendedTarget(requiredWeekly = 0, reservePercent = HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT) {
  const required = normalizeHourAnalysisNumber(requiredWeekly, 0);
  const reserve = Math.max(0, Math.min(90, normalizeHourAnalysisNumber(reservePercent, HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT)));
  if (required <= 0) return 0;
  if (reserve <= 0) return required;
  return normalizeHourAnalysisNumber(required * (1 + (reserve / 100)), 0);
}

function buildHourAnalysisCapacityStandard(requiredWeekly = 0, reliefPercent = HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT) {
  const floor = normalizeHourAnalysisNumber(requiredWeekly, 0);
  const relief = Math.max(0, Math.min(90, normalizeHourAnalysisNumber(reliefPercent, 0)));
  const targetWeekly = calculateHourAnalysisRecommendedTarget(floor, relief);
  const healthyLowWeekly = calculateHourAnalysisRecommendedTarget(floor, relief > 0 ? HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT : 0);
  const healthyHighWeekly = calculateHourAnalysisRecommendedTarget(floor, relief > 0 ? HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT : 0);
  const overRosteredWeekly = calculateHourAnalysisRecommendedTarget(floor, relief > 0 ? HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT : 0);
  return {
    floor,
    healthyLowWeekly,
    targetWeekly,
    healthyHighWeekly,
    overRosteredWeekly,
    healthyLowSurplus: normalizeHourAnalysisDelta(healthyLowWeekly - floor),
    targetSurplus: normalizeHourAnalysisDelta(targetWeekly - floor),
    healthyHighSurplus: normalizeHourAnalysisDelta(healthyHighWeekly - floor),
    overRosteredSurplus: normalizeHourAnalysisDelta(overRosteredWeekly - floor),
    targetBufferPercent: relief,
    healthyMinPercent: relief > 0 ? HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT : 0,
    healthyMaxPercent: relief > 0 ? HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT : 0,
    overRosteredPercent: relief > 0 ? HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT : 0,
    targetUtilization: targetWeekly > 0 ? normalizeHourAnalysisNumber((floor / targetWeekly) * 100, 0) : 0,
  };
}

function combineHourAnalysisCapacityStandards(rows = []) {
  const combined = rows.reduce((acc, row) => {
    const standard = row.capacityStandard || buildHourAnalysisCapacityStandard(row.requiredWeekly, row.reliefPercent);
    acc.floor += standard.floor;
    acc.healthyLowWeekly += standard.healthyLowWeekly;
    acc.targetWeekly += standard.targetWeekly;
    acc.healthyHighWeekly += standard.healthyHighWeekly;
    acc.overRosteredWeekly += standard.overRosteredWeekly;
    acc.hasTargetRange = acc.hasTargetRange || normalizeHourAnalysisNumber(standard.targetBufferPercent, 0) > 0;
    return acc;
  }, {
    floor: 0,
    healthyLowWeekly: 0,
    targetWeekly: 0,
    healthyHighWeekly: 0,
    overRosteredWeekly: 0,
    hasTargetRange: false,
  });
  return {
    ...combined,
    floor: normalizeHourAnalysisNumber(combined.floor, 0),
    healthyLowWeekly: normalizeHourAnalysisNumber(combined.healthyLowWeekly, 0),
    targetWeekly: normalizeHourAnalysisNumber(combined.targetWeekly, 0),
    healthyHighWeekly: normalizeHourAnalysisNumber(combined.healthyHighWeekly, 0),
    overRosteredWeekly: normalizeHourAnalysisNumber(combined.overRosteredWeekly, 0),
    healthyLowSurplus: normalizeHourAnalysisDelta(combined.healthyLowWeekly - combined.floor),
    targetSurplus: normalizeHourAnalysisDelta(combined.targetWeekly - combined.floor),
    healthyHighSurplus: normalizeHourAnalysisDelta(combined.healthyHighWeekly - combined.floor),
    overRosteredSurplus: normalizeHourAnalysisDelta(combined.overRosteredWeekly - combined.floor),
    targetBufferPercent: combined.hasTargetRange ? HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT : 0,
    healthyMinPercent: combined.hasTargetRange ? HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT : 0,
    healthyMaxPercent: combined.hasTargetRange ? HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT : 0,
    overRosteredPercent: combined.hasTargetRange ? HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT : 0,
    targetUtilization: combined.targetWeekly > 0 ? normalizeHourAnalysisNumber((combined.floor / combined.targetWeekly) * 100, 0) : 0,
  };
}

function buildHourAnalysisCapacityStatus({ requiredWeekly = 0, targetWeekly = 0, capacity = {}, standard = null } = {}) {
  const required = normalizeHourAnalysisNumber(requiredWeekly, 0);
  const capacityStandard = standard || buildHourAnalysisCapacityStandard(required);
  const target = normalizeHourAnalysisNumber(targetWeekly || capacityStandard.targetWeekly, required);
  const healthyLow = normalizeHourAnalysisNumber(capacityStandard.healthyLowWeekly, target);
  const healthyHigh = normalizeHourAnalysisNumber(capacityStandard.healthyHighWeekly, target);
  const overRostered = normalizeHourAnalysisNumber(capacityStandard.overRosteredWeekly, healthyHigh);
  const expected = normalizeHourAnalysisNumber(capacity.expected, 0);
  const reliefPercent = normalizeHourAnalysisNumber(capacityStandard.targetBufferPercent, 0);
  const hasTargetRange = reliefPercent > 0;
  if (required <= 0) {
    return { key: "unset", label: "No floor", tone: "default", message: "No Labor Model floor is assigned to this role." };
  }
  if (reliefPercent <= 0 && expected > required) {
    return { key: "admin_surplus", label: "Surplus", tone: "warning", message: `No relief buffer is applied to General Manager, Assistant Manager, or Supervisor coverage. Reassign ${formatHourAnalysisHours(expected - required)} hrs/wk to a floor split or reduce planned admin coverage.` };
  }
  if (hasTargetRange && expected < healthyLow) {
    const floorContext = expected < required ? "misses the operational floor and" : "covers the floor but";
    return { key: "below_range", label: "Below range", tone: "danger", message: `Expected capacity ${floorContext} is ${formatHourAnalysisHours(healthyLow - expected)} hrs/wk below the ${HOUR_ANALYSIS_FRONTLINE_TARGET_RANGE_LABEL}.` };
  }
  if (hasTargetRange && expected > healthyHigh) {
    return { key: "above_range", label: "Above range", tone: "danger", message: `Expected capacity is ${formatHourAnalysisHours(expected - healthyHigh)} hrs/wk above the ${HOUR_ANALYSIS_FRONTLINE_TARGET_RANGE_LABEL}. Rebalance before employees lose expected hours.` };
  }
  if (expected > overRostered) {
    return { key: "over_rostered", label: "Overbuilt", tone: "warning", message: `Expected capacity is ${formatHourAnalysisHours(expected - overRostered)} hrs/wk above the ${HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT}% relief sensitivity case. Freeze offers or rebalance hours before employees lose expected hours.` };
  }
  if (expected < required) {
    return { key: "short", label: "Short", tone: "danger", message: `Expected capacity misses the operational floor by ${formatHourAnalysisHours(required - expected)} hrs/wk.` };
  }
  if (!hasTargetRange) {
    return { key: "floor_aligned", label: "On floor", tone: "success", message: "Expected capacity matches the operational floor." };
  }
  return { key: "healthy", label: "In range", tone: "success", message: `Expected capacity is inside the ${HOUR_ANALYSIS_FRONTLINE_TARGET_RANGE_LABEL}.` };
}

export function formatHourAnalysisCapacityDelta(value = 0) {
  const delta = normalizeHourAnalysisDelta(value);
  if (delta > 0) {
    return {
      value: `+${formatHourAnalysisHours(delta)} hrs`,
      tone: "surplus",
      label: "Surplus capacity",
    };
  }
  if (delta < 0) {
    return {
      value: `-${formatHourAnalysisHours(Math.abs(delta))} hrs`,
      tone: "short",
      label: "Short to target",
    };
  }
  return {
    value: "0 hrs",
    tone: "even",
    label: "Aligned",
  };
}

function formatHourAnalysisCapacityRangeDelta(expected = 0, standard = null) {
  const capacityStandard = standard || buildHourAnalysisCapacityStandard(0);
  const targetBufferPercent = normalizeHourAnalysisNumber(capacityStandard.targetBufferPercent, 0);
  if (targetBufferPercent <= 0) {
    return formatHourAnalysisCapacityDelta(normalizeHourAnalysisDelta(expected - normalizeHourAnalysisNumber(capacityStandard.targetWeekly, capacityStandard.floor)));
  }
  const healthyLow = normalizeHourAnalysisNumber(capacityStandard.healthyLowWeekly, 0);
  const healthyHigh = normalizeHourAnalysisNumber(capacityStandard.healthyHighWeekly, healthyLow);
  const value = normalizeHourAnalysisNumber(expected, 0);

  if (healthyLow > 0 && value < healthyLow) {
    const delta = normalizeHourAnalysisDelta(value - healthyLow);
    return {
      value: `-${formatHourAnalysisHours(Math.abs(delta))} hrs`,
      tone: "short",
      label: "Below target range",
    };
  }
  if (healthyHigh > 0 && value > healthyHigh) {
    const delta = normalizeHourAnalysisDelta(value - healthyHigh);
    return {
      value: `+${formatHourAnalysisHours(delta)} hrs`,
      tone: "short",
      label: "Above target range",
    };
  }
  return {
    value: "In range",
    tone: "healthy",
    label: "Target range",
  };
}

function clampHourAnalysisPercent(value, min = 0, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

export function buildHourAnalysisCapacityRowVisualModel(row = {}) {
  const isFrontline = HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS.has(row.key);
  const expected = normalizeHourAnalysisNumber(row.expected, 0);
  const floor = normalizeHourAnalysisNumber(row.requiredWeekly, 0);
  const capacityStandard = row.capacityStandard || buildHourAnalysisCapacityStandard(floor, isFrontline ? HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT : 0);
  const target = normalizeHourAnalysisNumber(row.targetWeekly || floor, floor);
  const targetLow = isFrontline ? normalizeHourAnalysisNumber(capacityStandard.healthyLowWeekly, target) : target;
  const targetHigh = isFrontline ? normalizeHourAnalysisNumber(capacityStandard.healthyHighWeekly, targetLow) : target;
  const targetMid = normalizeHourAnalysisNumber(target, floor);
  const deltaToTarget = normalizeHourAnalysisDelta(expected - targetMid);
  const deltaToRange = isFrontline
    ? expected < targetLow
      ? normalizeHourAnalysisDelta(expected - targetLow)
      : expected > targetHigh
        ? normalizeHourAnalysisDelta(expected - targetHigh)
        : 0
    : deltaToTarget;
  const deltaToFloor = normalizeHourAnalysisDelta(expected - floor);
  const delta = isFrontline ? formatHourAnalysisCapacityRangeDelta(expected, capacityStandard) : formatHourAnalysisCapacityDelta(deltaToTarget);
  const maxWeekly = Math.max(expected, targetHigh, targetMid, floor, 1) * 1.1;
  const expectedPct = clampHourAnalysisPercent((expected / maxWeekly) * 100, 1.5, 100);
  const floorPct = clampHourAnalysisPercent((floor / maxWeekly) * 100);
  const targetPct = clampHourAnalysisPercent((targetMid / maxWeekly) * 100);
  const targetLowPct = clampHourAnalysisPercent((targetLow / maxWeekly) * 100);
  const targetHighPct = clampHourAnalysisPercent((targetHigh / maxWeekly) * 100);
  const labelPct = (pct) => clampHourAnalysisPercent(pct, 11, 89);
  const rangeLabelPct = labelPct((targetLowPct + targetHighPct) / 2);
  const tone = isFrontline
    ? deltaToRange < 0 || deltaToRange > 0
      ? "short"
      : "healthy"
    : deltaToTarget < 0
      ? "short"
      : deltaToTarget > 0
        ? "surplus"
        : "healthy";

  return {
    key: row.key || "",
    roleLabel: getHourAnalysisGroupShortLabel(row.key),
    isFrontline,
    expected,
    floor,
    target,
    targetLow,
    targetHigh,
    deltaToTarget,
    deltaToRange,
    deltaToFloor,
    tone,
    delta,
    expectedPct,
    floorPct,
    targetPct,
    targetLowPct,
    targetHighPct,
    floorLabelPct: labelPct(floorPct),
    targetLabelPct: labelPct(targetPct),
    targetRangeLabelPct: rangeLabelPct,
    bufferLeftPct: isFrontline ? targetLowPct : floorPct,
    bufferWidthPct: isFrontline ? Math.max(0, targetHighPct - targetLowPct) : 0,
  };
}

export function buildHourAnalysisModel({ rosterRows = [], settings = {} } = {}) {
  const normalizedSettings = normalizeHourAnalysisSettings(settings);
  const laborModelSummary = buildHourAnalysisLaborModelSummary(normalizedSettings.laborModel);
  const activeRows = toObjectRows(rosterRows).filter((row) => isLaborEmployeeActive(row));
  const makeEmptyBucket = () => ({ fullTime: 0, partTime: 0, unassigned: 0, total: 0, whatIfFullTime: 0, whatIfPartTime: 0, whatIfTotal: 0 });
  const headcountByGroup = Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, makeEmptyBucket()]));
  const makeWeeklyBucket = () => ({
    fullTime: makeHourAnalysisRangeTotals(),
    partTime: makeHourAnalysisRangeTotals(),
    total: makeHourAnalysisRangeTotals(),
    whatIfFullTime: makeHourAnalysisRangeTotals(),
    whatIfPartTime: makeHourAnalysisRangeTotals(),
    whatIfTotal: makeHourAnalysisRangeTotals(),
  });
  const weeklyHoursByGroup = Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, makeWeeklyBucket()]));
  const activeRowsByEmployeeKey = new Map();
  activeRows.forEach((row) => {
    const employeeKey = getHourAnalysisEmployeeKey(row);
    if (employeeKey && !activeRowsByEmployeeKey.has(employeeKey)) activeRowsByEmployeeKey.set(employeeKey, row);
  });

  const addHeadcount = ({ groupKey, commitment, isWhatIf = false, delta = 1 }) => {
    const target = headcountByGroup[groupKey] || headcountByGroup.other;
    const amount = normalizeHourAnalysisDelta(Number(delta));
    if (commitment === "full_time") target[isWhatIf ? "whatIfFullTime" : "fullTime"] += amount;
    else if (commitment === "part_time") target[isWhatIf ? "whatIfPartTime" : "partTime"] += amount;
    else if (!isWhatIf) target.unassigned += amount;
    if (isWhatIf) target.whatIfTotal += amount;
    else target.total += amount;
  };

  const addWeeklyHours = ({ groupKey, commitment, range, isWhatIf = false, delta = 1 }) => {
    const target = weeklyHoursByGroup[groupKey] || weeklyHoursByGroup.other;
    if (commitment === "full_time") {
      addHourAnalysisRangeDelta(isWhatIf ? target.whatIfFullTime : target.fullTime, range, delta);
    } else if (commitment === "part_time") {
      addHourAnalysisRangeDelta(isWhatIf ? target.whatIfPartTime : target.partTime, range, delta);
    }
    addHourAnalysisRangeDelta(isWhatIf ? target.whatIfTotal : target.total, range, delta);
  };

  const employeeRows = activeRows.map((row) => {
    const employeeKey = getHourAnalysisEmployeeKey(row);
    const sourcePositionTitle = formatLaborPositionTitle(row.position_title || row.position || "");
    const sourceGroupKey = getHourAnalysisGroupKey(row);
    const commitment = readLaborEmploymentCommitment(row);
    const overrideRange = employeeKey ? normalizeHourAnalysisOverrideRange(normalizedSettings.overrides[employeeKey]) : {};
    const sourceInheritedRange = commitment ? normalizedSettings.expectations[sourceGroupKey]?.[commitment] ?? makeHourAnalysisRangeTotals() : makeHourAnalysisRangeTotals();
    const sourcePreferredRange = mergeHourAnalysisRange(sourceInheritedRange, overrideRange);
    const movement = employeeKey ? normalizeHourAnalysisPositionMovement(normalizedSettings.positionMovements[employeeKey]) : {};
    const targetPositionTitle = movement.position_title || sourcePositionTitle;
    const isMovement = Boolean(movement.position_title && normalizePositionTitle(movement.position_title) !== normalizePositionTitle(sourcePositionTitle));
    const groupKey = isMovement ? movement.group_key || getHourAnalysisGroupKey({ position_title: targetPositionTitle }) : sourceGroupKey;
    const effectiveRow = { ...row, position_title: targetPositionTitle, position: targetPositionTitle };
    const inheritedRange = commitment ? normalizedSettings.expectations[groupKey]?.[commitment] ?? makeHourAnalysisRangeTotals() : makeHourAnalysisRangeTotals();
    const preferredRange = mergeHourAnalysisRange(inheritedRange, overrideRange);
    const note = employeeKey ? String(normalizedSettings.notes[employeeKey] || "").trim() : "";
    const sourceSplit = resolveHourAnalysisCoverageSplit({
      row,
      groupKey: sourceGroupKey,
      preferredHours: sourcePreferredRange.expected,
      split: employeeKey ? normalizedSettings.splits[employeeKey] : {},
    });
    addHeadcount({ groupKey: sourceGroupKey, commitment });
    addWeeklyHours({ groupKey: sourceGroupKey, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.primary_hours) });
    if (sourceSplit.floor_group && sourceSplit.floor_hours > 0) {
      addWeeklyHours({ groupKey: sourceSplit.floor_group, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.floor_hours) });
    }
    const split = resolveHourAnalysisCoverageSplit({
      row: effectiveRow,
      groupKey,
      preferredHours: preferredRange.expected,
      split: employeeKey ? normalizedSettings.splits[employeeKey] : {},
    });
    if (isMovement) {
      addHeadcount({ groupKey: sourceGroupKey, commitment, isWhatIf: true, delta: -1 });
      addWeeklyHours({ groupKey: sourceGroupKey, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.primary_hours), isWhatIf: true, delta: -1 });
      if (sourceSplit.floor_group && sourceSplit.floor_hours > 0) {
        addWeeklyHours({ groupKey: sourceSplit.floor_group, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.floor_hours), isWhatIf: true, delta: -1 });
      }
      addHeadcount({ groupKey, commitment, isWhatIf: true });
      addWeeklyHours({ groupKey, commitment, range: buildHourAnalysisRangeFromHours(split.primary_hours), isWhatIf: true });
      if (split.floor_group && split.floor_hours > 0) {
        addWeeklyHours({ groupKey: split.floor_group, commitment, range: buildHourAnalysisRangeFromHours(split.floor_hours), isWhatIf: true });
      }
    }
    return {
      ...row,
      employeeKey,
      sourcePositionTitle,
      sourceGroupKey,
      sourceGroupLabel: getHourAnalysisGroupLabel(sourceGroupKey),
      position_title: targetPositionTitle,
      groupKey,
      groupLabel: getHourAnalysisGroupLabel(groupKey),
      commitment,
      inheritedRange,
      overrideRange,
      preferredRange,
      inheritedHours: inheritedRange.expected,
      overrideHours: Object.prototype.hasOwnProperty.call(overrideRange, "expected") ? overrideRange.expected : null,
      preferredHours: preferredRange.expected,
      note,
      split,
      isOverride: Object.keys(overrideRange).length > 0,
      isSplit: Boolean(split.floor_group && split.floor_hours > 0),
      isMovement,
      isWhatIf: false,
    };
  });

  const whatIfRows = normalizedSettings.whatIfRows.map((row) => {
    const isMovement = row.scenario_type === "move";
    const sourceEmployeeKey = String(row.source_employee_key || "").trim();
    const sourceRow = isMovement && sourceEmployeeKey ? activeRowsByEmployeeKey.get(sourceEmployeeKey) : null;
    let sourcePlan = null;
    if (sourceRow) {
      const sourceGroupKey = getHourAnalysisGroupKey(sourceRow);
      const sourceCommitment = readLaborEmploymentCommitment(sourceRow) || row.source_employment_commitment || "full_time";
      const sourceInheritedRange = sourceCommitment ? normalizedSettings.expectations[sourceGroupKey]?.[sourceCommitment] ?? makeHourAnalysisRangeTotals() : makeHourAnalysisRangeTotals();
      const sourceOverrideRange = normalizeHourAnalysisOverrideRange(normalizedSettings.overrides[sourceEmployeeKey]);
      const sourcePreferredRange = mergeHourAnalysisRange(sourceInheritedRange, sourceOverrideRange);
      const sourceSplit = resolveHourAnalysisCoverageSplit({
        row: sourceRow,
        groupKey: sourceGroupKey,
        preferredHours: sourcePreferredRange.expected,
        split: normalizedSettings.splits[sourceEmployeeKey] || {},
      });
      sourcePlan = {
        employeeKey: sourceEmployeeKey,
        full_name: sourceRow.full_name || [sourceRow.first_name, sourceRow.last_name].filter(Boolean).join(" ") || row.source_full_name || "Moved employee",
        position_title: formatLaborPositionTitle(sourceRow.position_title || sourceRow.position || row.source_position_title || ""),
        groupKey: sourceGroupKey,
        groupLabel: getHourAnalysisGroupLabel(sourceGroupKey),
        commitment: sourceCommitment,
        preferredHours: sourcePreferredRange.expected,
        split: sourceSplit,
      };
      addHeadcount({ groupKey: sourceGroupKey, commitment: sourceCommitment, isWhatIf: true, delta: -1 });
      addWeeklyHours({ groupKey: sourceGroupKey, commitment: sourceCommitment, range: buildHourAnalysisRangeFromHours(sourceSplit.primary_hours), isWhatIf: true, delta: -1 });
      if (sourceSplit.floor_group && sourceSplit.floor_hours > 0) {
        addWeeklyHours({ groupKey: sourceSplit.floor_group, commitment: sourceCommitment, range: buildHourAnalysisRangeFromHours(sourceSplit.floor_hours), isWhatIf: true, delta: -1 });
      }
    }
    const groupKey = row.group_key || getHourAnalysisGroupKey(row);
    const commitment = readLaborEmploymentCommitment(row) || "full_time";
    const inheritedRange = normalizedSettings.expectations[groupKey]?.[commitment] ?? makeHourAnalysisRangeTotals();
    const overrideRange = normalizeHourAnalysisOverrideRange(row.hour_overrides);
    const preferredRange = mergeHourAnalysisRange(inheritedRange, overrideRange);
    const split = resolveHourAnalysisCoverageSplit({
      row,
      groupKey,
      preferredHours: preferredRange.expected,
      split: normalizedSettings.splits[row.id] || row.split,
    });
    addHeadcount({ groupKey, commitment, isWhatIf: true });
    addWeeklyHours({ groupKey, commitment, range: buildHourAnalysisRangeFromHours(split.primary_hours), isWhatIf: true });
    if (split.floor_group && split.floor_hours > 0) {
      addWeeklyHours({ groupKey: split.floor_group, commitment, range: buildHourAnalysisRangeFromHours(split.floor_hours), isWhatIf: true });
    }
    return {
      id: row.id,
      employeeKey: row.id,
      scenarioType: row.scenario_type,
      isMovement,
      sourceEmployeeKey,
      sourcePlan,
      sourceFullName: sourcePlan?.full_name || row.source_full_name || "",
      sourcePositionTitle: formatLaborPositionTitle(sourcePlan?.position_title || row.source_position_title || ""),
      sourceGroupKey: sourcePlan?.groupKey || row.source_group_key || "",
      sourceGroupLabel: sourcePlan?.groupLabel || getHourAnalysisGroupLabel(row.source_group_key || "other"),
      sourceCommitment: sourcePlan?.commitment || row.source_employment_commitment || "",
      sourcePreferredHours: sourcePlan?.preferredHours ?? null,
      sourceMissing: isMovement && !sourcePlan,
      full_name: row.full_name,
      position_title: formatLaborPositionTitle(row.position_title),
      groupKey,
      groupLabel: getHourAnalysisGroupLabel(groupKey),
      commitment,
      employment_commitment: commitment,
      inheritedRange,
      overrideRange,
      preferredRange,
      inheritedHours: inheritedRange.expected,
      overrideHours: Object.prototype.hasOwnProperty.call(overrideRange, "expected") ? overrideRange.expected : null,
      preferredHours: preferredRange.expected,
      note: normalizedSettings.notes[row.id] || row.note || "",
      split,
      isOverride: Object.keys(overrideRange).length > 0,
      isSplit: Boolean(split.floor_group && split.floor_hours > 0),
      isWhatIf: true,
    };
  });

  const headcountRows = HOUR_ANALYSIS_GROUPS
    .map((group) => {
      const counts = headcountByGroup[group.key] || makeEmptyBucket();
      return {
        key: group.key,
        label: group.label,
        ...counts,
        projectedFullTime: counts.fullTime + counts.whatIfFullTime,
        projectedPartTime: counts.partTime + counts.whatIfPartTime,
        projectedTotal: counts.total + counts.whatIfTotal,
      };
    })
    .filter((row) => row.key !== "other" || row.total || row.whatIfTotal || row.unassigned);

  const weeklyRows = HOUR_ANALYSIS_GROUPS
    .map((group) => {
      const hours = weeklyHoursByGroup[group.key] || makeWeeklyBucket();
      const projected = sumHourAnalysisRanges(hours.total, hours.whatIfTotal);
      const legacyDailySkeleton = normalizeHourAnalysisNumber(normalizedSettings.thresholds.daily_skeleton[group.key], 0);
      const requiredWeekly = laborModelSummary.hasRows
        ? normalizeHourAnalysisNumber(laborModelSummary.roleWeekly[group.key] || 0, 0)
        : normalizeHourAnalysisNumber(legacyDailySkeleton * 7, 0);
      const requiredDaily = normalizeHourAnalysisNumber(requiredWeekly / 7, 0);
      const isFrontline = HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS.has(group.key);
      const reliefPercent = isFrontline ? HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT : 0;
      const capacityStandard = buildHourAnalysisCapacityStandard(requiredWeekly, reliefPercent);
      const targetWeekly = capacityStandard.targetWeekly;
      const expectedHireHours = normalizeHourAnalysisNumber(
        normalizedSettings.expectations[group.key]?.full_time?.expected,
        DEFAULT_HOUR_ANALYSIS_EXPECTATIONS[group.key]?.full_time?.expected || HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS,
      );
      const expectedGapToTarget = normalizeHourAnalysisDelta(projected.expected - targetWeekly);
      const hireDeficitHours = Math.max(0, normalizeHourAnalysisDelta(targetWeekly - projected.expected));
      const recommendedFullTimeHires = hireDeficitHours > 0 && expectedHireHours > 0 ? Math.ceil(hireDeficitHours / expectedHireHours) : 0;
      const recommendedFullTimeEquivalent = hireDeficitHours > 0 && expectedHireHours > 0 ? normalizeHourAnalysisNumber(hireDeficitHours / expectedHireHours, 0) : 0;
      return {
        key: group.key,
        label: group.label,
        ...hours,
        projected,
        min: projected.min,
        expected: projected.expected,
        max: projected.max,
        requiredDaily,
        requiredWeekly,
        reliefPercent,
        targetWeekly,
        capacityStandard,
        expectedGapToTarget,
        hireDeficitHours,
        expectedHireHours,
        isFrontline,
        recommendedFullTimeHires,
        recommendedFullTimeEquivalent,
        recommendedHireHours: normalizeHourAnalysisNumber(recommendedFullTimeHires * expectedHireHours, 0),
        capacityStatus: buildHourAnalysisCapacityStatus({ requiredWeekly, targetWeekly, capacity: projected, standard: capacityStandard }),
      };
    })
    .filter((row) => row.key !== "other" || row.total.expected || row.whatIfTotal.expected || row.requiredWeekly);

  const totals = weeklyRows.reduce((acc, row) => {
    addHourAnalysisRange(acc.fullTime, row.fullTime);
    addHourAnalysisRange(acc.partTime, row.partTime);
    addHourAnalysisRange(acc.total, row.total);
    addHourAnalysisRange(acc.whatIfFullTime, row.whatIfFullTime);
    addHourAnalysisRange(acc.whatIfPartTime, row.whatIfPartTime);
    addHourAnalysisRange(acc.whatIfTotal, row.whatIfTotal);
    return acc;
  }, {
    fullTime: makeHourAnalysisRangeTotals(),
    partTime: makeHourAnalysisRangeTotals(),
    total: makeHourAnalysisRangeTotals(),
    whatIfFullTime: makeHourAnalysisRangeTotals(),
    whatIfPartTime: makeHourAnalysisRangeTotals(),
    whatIfTotal: makeHourAnalysisRangeTotals(),
  });
  const projectedFullTime = sumHourAnalysisRanges(totals.fullTime, totals.whatIfFullTime);
  const projectedPartTime = sumHourAnalysisRanges(totals.partTime, totals.whatIfPartTime);
  const projectedTotal = sumHourAnalysisRanges(totals.total, totals.whatIfTotal);
  const legacyRequiredDaily = HOUR_ANALYSIS_GROUPS.reduce((sum, group) => sum + normalizeHourAnalysisNumber(normalizedSettings.thresholds.daily_skeleton[group.key], 0), 0);
  const requiredWeekly = laborModelSummary.hasRows
    ? normalizeHourAnalysisNumber(laborModelSummary.totalWeekly, 0)
    : normalizeHourAnalysisNumber(legacyRequiredDaily * 7, 0);
  const requiredDaily = normalizeHourAnalysisNumber(requiredWeekly / 7, 0);
  const capacityStandard = combineHourAnalysisCapacityStandards(weeklyRows);
  const targetWeekly = capacityStandard.targetWeekly;
  const expectedGapToTarget = normalizeHourAnalysisDelta(projectedTotal.expected - targetWeekly);
  const hireDeficitHours = Math.max(0, normalizeHourAnalysisDelta(targetWeekly - projectedTotal.expected));
  const fullTimeEquivalentHires = hireDeficitHours > 0 ? normalizeHourAnalysisNumber(hireDeficitHours / HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS, 0) : 0;
  const fullTimeHireCount = hireDeficitHours > 0 ? Math.max(1, Math.round(hireDeficitHours / HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS)) : 0;
  const hiringRecommendations = weeklyRows
    .filter((row) => row.recommendedFullTimeHires > 0)
    .map((row) => ({
      key: row.key,
      label: row.label,
      shortHours: row.hireDeficitHours,
      hireCount: row.recommendedFullTimeHires,
      hireEquivalent: row.recommendedFullTimeEquivalent,
      hireHours: row.recommendedHireHours,
      expectedHireHours: row.expectedHireHours,
      isFrontline: row.isFrontline,
    }));
  const roleDeficitHours = normalizeHourAnalysisNumber(hiringRecommendations.reduce((sum, row) => sum + row.shortHours, 0), 0);
  const roleSurplusRows = weeklyRows
    .filter((row) => row.expectedGapToTarget > 0)
    .map((row) => ({
      key: row.key,
      label: row.label,
      surplusHours: row.expectedGapToTarget,
    }));
  const roleSurplusHours = normalizeHourAnalysisNumber(roleSurplusRows.reduce((sum, row) => sum + row.surplusHours, 0), 0);
  const recommendedPlanHours = hireDeficitHours;
  const recommendedPlanHeadcount = fullTimeHireCount;
  const expectedAfterRecommendedPlan = normalizeHourAnalysisNumber(projectedTotal.expected + recommendedPlanHours, 0);
  const wholeRolePlanHours = normalizeHourAnalysisNumber(hiringRecommendations.reduce((sum, row) => sum + row.hireHours, 0), 0);
  const wholeRolePlanHeadcount = hiringRecommendations.reduce((sum, row) => sum + row.hireCount, 0);
  const expectedAfterWholeRolePlan = normalizeHourAnalysisNumber(projectedTotal.expected + wholeRolePlanHours, 0);
  const headcountTotals = headcountRows.reduce((acc, row) => ({
    fullTime: acc.fullTime + row.fullTime,
    partTime: acc.partTime + row.partTime,
    unassigned: acc.unassigned + row.unassigned,
    total: acc.total + row.total,
    whatIfFullTime: acc.whatIfFullTime + row.whatIfFullTime,
    whatIfPartTime: acc.whatIfPartTime + row.whatIfPartTime,
    whatIfTotal: acc.whatIfTotal + row.whatIfTotal,
  }), { fullTime: 0, partTime: 0, unassigned: 0, total: 0, whatIfFullTime: 0, whatIfPartTime: 0, whatIfTotal: 0 });

  return {
    settings: normalizedSettings,
    rows: [...employeeRows, ...whatIfRows],
    employeeRows,
    whatIfRows,
    headcountRows,
    headcountTotals,
    weeklyRows,
    laborModelSummary,
    totals: {
      ...totals,
      rosterRange: totals.total,
      whatIfRange: totals.whatIfTotal,
      projectedFullTimeRange: projectedFullTime,
      projectedPartTimeRange: projectedPartTime,
      projectedRange: projectedTotal,
      projectedFullTime: projectedFullTime.expected,
      projectedPartTime: projectedPartTime.expected,
      projectedTotal: projectedTotal.expected,
      requiredDaily,
      requiredWeekly,
      targetWeekly,
      healthyLowWeekly: capacityStandard.healthyLowWeekly,
      healthyHighWeekly: capacityStandard.healthyHighWeekly,
      overRosteredWeekly: capacityStandard.overRosteredWeekly,
      capacityStandard,
      expectedGapToTarget,
      hireDeficitHours,
      fullTimeEquivalentHires,
      fullTimeHireCount,
      hiringRecommendations,
      roleDeficitHours,
      roleSurplusRows,
      roleSurplusHours,
      recommendedPlanHours,
      recommendedPlanHeadcount,
      expectedAfterRecommendedPlan,
      wholeRolePlanHours,
      wholeRolePlanHeadcount,
      expectedAfterWholeRolePlan,
      reservePercent: normalizedSettings.thresholds.reserve_percent,
      capacityStatus: buildHourAnalysisCapacityStatus({ requiredWeekly, targetWeekly, capacity: projectedTotal, standard: capacityStandard }),
      min: totals.total.min,
      expected: totals.total.expected,
      max: totals.total.max,
      whatIfMin: totals.whatIfTotal.min,
      whatIfExpected: totals.whatIfTotal.expected,
      whatIfMax: totals.whatIfTotal.max,
      projectedMin: projectedTotal.min,
      projectedExpected: projectedTotal.expected,
      projectedMax: projectedTotal.max,
      total: totals.total.expected,
      whatIfTotal: totals.whatIfTotal.expected,
      projectedHeadcount: headcountTotals.total + headcountTotals.whatIfTotal,
      projectedFullTimeHeadcount: headcountTotals.fullTime + headcountTotals.whatIfFullTime,
      projectedPartTimeHeadcount: headcountTotals.partTime + headcountTotals.whatIfPartTime,
    },
  };
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function downloadBinaryFile(filename, bytes, mimeType = "application/octet-stream") {
  const blob = new Blob([bytes], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function openPdfBlob(filename, bytes, { print = false } = {}) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const previewWindow = window.open(url, "_blank");
  if (!previewWindow) {
    window.URL.revokeObjectURL(url);
    downloadBinaryFile(filename, bytes, "application/pdf");
    return false;
  }
  if (print) {
    window.setTimeout(() => {
      try {
        previewWindow.focus();
        previewWindow.print();
      } catch {
        // The generated PDF is already open if Chrome blocks scripted print.
      }
    }, 900);
  }
  window.setTimeout(() => window.URL.revokeObjectURL(url), 120000);
  return true;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

async function readEdgeFunctionError(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  try {
    if (error.context?.json) {
      const body = await error.context.json();
      return body?.error || body?.message || fallbackMessage;
    }
    if (error.context?.text) {
      const text = await error.context.text();
      if (!text) return fallbackMessage;
      try {
        const body = JSON.parse(text);
        return body?.error || body?.message || text;
      } catch {
        return text;
      }
    }
  } catch (_) {
    // Fall through to the SDK message below.
  }
  return error.message || fallbackMessage;
}

export function isTrainingRecordForEmployee(record = {}, employee = {}) {
  const employeeId = getLaborEmployeeRowId(employee);
  const recordEmployeeId = getTrainingRecordEmployeeId(record);
  if (employeeId && recordEmployeeId) return employeeId === recordEmployeeId;

  const employeeName = normalizeEmployeeName(employee.full_name);
  const recordName = normalizeEmployeeName(record.employee_full_name);
  return Boolean(employeeName && recordName && employeeName === recordName);
}

export function safeTrainingProgress(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

function slugifyTemplateName(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
}

function getDaysSince(dateValue) {
  if (!dateValue) return null;
  const start = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date(`${todayStr()}T12:00:00`);
  return Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function addDaysToDateString(dateValue, days) {
  if (!dateValue || !Number.isFinite(Number(days))) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function getTrainingComplianceState(row) {
  const cprCompliant = ["current", "due_soon"].includes(String(row?.cpr_status || ""));
  const completedTraining = Number(row?.completed_training_record_count || 0) > 0
    || ["complete", "completed", "passed"].includes(String(row?.active_training_status || "").toLowerCase());
  const inTraining = Boolean(row?.active_training_record_id)
    || ["in_progress", "not_started"].includes(String(row?.active_training_status || "").toLowerCase());
  const daysSinceStart = getDaysSince(row?.start_date);
  const withinGraceWindow = daysSinceStart != null && daysSinceStart < TRAINING_GRACE_PERIOD_DAYS;

  if (completedTraining && cprCompliant) {
    return { label: "Compliant", color: "success", inProgress: false };
  }

  if (withinGraceWindow && (inTraining || !cprCompliant || !completedTraining)) {
    return { label: "In Progress", color: "warning", inProgress: true };
  }

  return { label: "Non-Compliant", color: "danger", inProgress: false };
}

function getReviewStatusPresentation(row, reviewKey) {
  const dueDate = row?.[`${reviewKey}_due_date`] || null;
  const status = String(row?.[`${reviewKey}_status`] || "not_started");
  if (!dueDate) {
    return { label: "—", tone: C.textMut, background: "transparent" };
  }

  const due = new Date(`${dueDate}T12:00:00`);
  const today = new Date(`${todayStr()}T12:00:00`);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const doneStatuses = new Set(["completed", "complete", "current"]);

  if (doneStatuses.has(status)) {
    return { label: formatLaborDate(dueDate), tone: C.suc, background: C.sucLt };
  }
  if (diffDays < 0) {
    return { label: formatLaborDate(dueDate), tone: C.dan, background: C.danLt };
  }
  if (diffDays <= REVIEW_WARNING_WINDOW_DAYS) {
    return { label: formatLaborDate(dueDate), tone: C.warn, background: C.warnLt };
  }

  return { label: formatLaborDate(dueDate), tone: C.suc, background: C.sucLt };
}

export function noteMatchesSearch(note = {}, query = "") {
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return true;
  const searchableText = [
    note.noteText,
    note.note_text,
    note.noteType,
    note.note_type,
    note.employeeName,
    note.employee_name,
    note.sourceLabel,
    note.source_label,
    note.sourceModule,
    note.source_module,
    note.createdByName,
    note.created_by_name,
    note.createdAt,
    note.created_at,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
  return searchableText.includes(cleanQuery);
}

export function applyLaborRosterFilters(rows, filters) {
  const keys = Object.keys(filters || {});
  if (keys.length === 0) return rows;
  const today = todayStr();
  const needsValue = (op) => !["empty", "notEmpty", "has", "missing", "overdue", "today", "thisWeek", "hasDate", "noDate"].includes(op);
  const parseDate = (value) => {
    const text = String(value || "");
    if (!text) return "";
    return text.includes("T") ? text.split("T")[0] : text;
  };
  const matchText = (source, op, value, { digitsOnly = false } = {}) => {
    const left = digitsOnly ? String(source || "").replace(/\D/g, "") : String(source || "").toLowerCase();
    const right = digitsOnly ? String(value || "").replace(/\D/g, "") : String(value || "").toLowerCase();
    if (op === "contains") return left.includes(right);
    if (op === "equals") return left === right;
    if (op === "starts") return left.startsWith(right);
    if (op === "empty") return !left;
    if (op === "notEmpty") return !!left;
    return true;
  };

  return rows.filter((row) => keys.every((key) => {
    const filter = filters[key];
    if (!filter) return true;
    const op = filter.op;
    const val = filter.val;
    if (needsValue(op) && val === "") return true;

    if (key === "first_name") return matchText(row.first_name, op, val);
    if (key === "last_name") return matchText(row.last_name, op, val);
    if (key === "email") return matchText(row.contact_email, op, val);
    if (key === "phone") return matchText(row.contact_phone, op, val, { digitsOnly: true });
    if (key === "position") return matchText(row.position_title, op, val);
    if (key === "commitment") {
      const label = getLaborEmploymentCommitmentLabel(row.employment_commitment);
      if (op === "is") return label === val;
      if (op === "isNot") return label !== val;
      return true;
    }
    if (key === "employment_status") {
      const explicitStatus = String(row.employment_status || "").toLowerCase();
      const status = explicitStatus || (row.is_active === false ? "inactive" : "active");
      if (val === "all") return true;
      if (op === "is") return status === val;
      if (op === "isNot") return status !== val;
      return true;
    }
    if (key === "training") {
      const status = String(row.training_compliance?.label || "");
      if (op === "is") return status === val;
      if (op === "isNot") return status !== val;
      return true;
    }
    if (key === "performance_reviews") {
      const status = String(row.performance_review_compliance?.label || "");
      if (op === "is") return status === val;
      if (op === "isNot") return status !== val;
      return true;
    }

    const dateValue = (() => {
      if (key === "start_date") return parseDate(row.start_date);
      if (key === "review30") return parseDate(row.review_30_due_date);
      if (key === "review60") return parseDate(row.review_60_due_date);
      if (key === "review90") return parseDate(row.review_90_due_date);
      return "";
    })();

    if (key === "start_date" || key === "review30" || key === "review60" || key === "review90") {
      if (op === "hasDate") return !!dateValue;
      if (op === "noDate") return !dateValue;
      if (!dateValue) return false;
      if (op === "after") return dateValue > val;
      if (op === "before") return dateValue < val;
      if (op === "inLastDays") {
        const diff = Math.floor((new Date(`${today}T12:00:00`) - new Date(`${dateValue}T12:00:00`)) / 86400000);
        return diff <= parseInt(val, 10);
      }
    }

    return true;
  }));
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TrainingPage({ data, save, nav, profile, addGlobalToast, locationName, params = {} }) {
  const routeLaborTab = normalizeLaborTab(params?.laborTab);
  const routeAttendanceView = normalizeAttendanceView(params?.attendanceView);
  const routeInterviewView = normalizeInterviewView(params?.interviewView);
  const routeCapacityPlanningView = normalizeCapacityPlanningView(params?.capacityPlanningView || (params?.laborTab === "labor-model" ? "labor-model" : ""));
  const routeInterviewId = typeof params?.interviewId === "string" ? params.interviewId : "";
  const [tab, setTab] = useState(routeLaborTab);
  const [loading, setLoading] = useState(true);
  const [trainingBundleLoaded, setTrainingBundleLoaded] = useState(false);
  const [trainingBundleLoading, setTrainingBundleLoading] = useState(false);
  const [supportBundleLoaded, setSupportBundleLoaded] = useState(false);
  const [supportBundleLoading, setSupportBundleLoading] = useState(false);
  const [attendanceView, setAttendanceView] = useState(routeAttendanceView);
  const [interviewView, setInterviewView] = useState(routeInterviewView);
  const [capacityPlanningView, setCapacityPlanningView] = useState(routeCapacityPlanningView);
  const [interviewDetailOpen, setInterviewDetailOpen] = useState(!!routeInterviewId);

  // Data state
  const [templates, setTemplates] = useState([]);
  const [templateVersions, setTemplateVersions] = useState([]);
  const [allTemplateVersions, setAllTemplateVersions] = useState([]);
  const [reviewTemplates, setReviewTemplates] = useState([]);
  const [reviewTemplateVersions, setReviewTemplateVersions] = useState([]);
  const [allReviewTemplateVersions, setAllReviewTemplateVersions] = useState([]);
  const [records, setRecords] = useState([]);
  const [laborEmployees, setLaborEmployees] = useState([]);
  const [rosterSnapshot, setRosterSnapshot] = useState([]);
  const [sections, setSections] = useState([]);
  const [items, setItems] = useState([]);
  const [reviewSections, setReviewSections] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);
  const [itemResults, setItemResults] = useState([]);
  const [notes, setNotes] = useState([]);
  const [recordEvents, setRecordEvents] = useState([]);
  const [laborEmployeeNotes, setLaborEmployeeNotes] = useState([]);
  const [laborEmployeeDocuments, setLaborEmployeeDocuments] = useState([]);
  const [laborEmployeeHistoryEvents, setLaborEmployeeHistoryEvents] = useState([]);
  const [laborAttendanceIncidents, setLaborAttendanceIncidents] = useState([]);
  const [reviewInstances, setReviewInstances] = useState([]);
  const [reviewResponses, setReviewResponses] = useState([]);
  const [employeeCertifications, setEmployeeCertifications] = useState([]);
  const [certificationRequirements, setCertificationRequirements] = useState([]);
  const [allTrainingNotes, setAllTrainingNotes] = useState([]);
  const [allTrainingEvents, setAllTrainingEvents] = useState([]);
  const [serverDashboardMetrics, setServerDashboardMetrics] = useState(null);
  const [resolvedLaborLocationId, setResolvedLaborLocationId] = useState("");
  const [positionHierarchy, setPositionHierarchy] = useState([]);
  const [hierarchyPersistenceAvailable, setHierarchyPersistenceAvailable] = useState(true);

  // UI state
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [showRecordConfig, setShowRecordConfig] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [selectedLaborEmployeeId, setSelectedLaborEmployeeId] = useState(null);
  const [selectedLaborEmployeeSeed, setSelectedLaborEmployeeSeed] = useState(null);
  const [selectedReviewInstanceId, setSelectedReviewInstanceId] = useState(null);
  const [previewTemplateKind, setPreviewTemplateKind] = useState("training");
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedItemNotes, setExpandedItemNotes] = useState({});
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const [previewTemplateVersionId, setPreviewTemplateVersionId] = useState(null);
  const [savingTemplateAction, setSavingTemplateAction] = useState("");
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [createTemplateKind, setCreateTemplateKind] = useState("training");
  const [createTemplateName, setCreateTemplateName] = useState("");
  const [createTemplateClass, setCreateTemplateClass] = useState("training_plan");
  const [createTemplateRoleScopesText, setCreateTemplateRoleScopesText] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateStatusFilter, setTemplateStatusFilter] = useState("active");
  const [templateManageStructure, setTemplateManageStructure] = useState(false);

  const hasLaborModuleAccess = hasLeanPermission(profile, "Labor Management");
  const canEditRoster = hasLaborModuleAccess && hasLeanPermission(profile, "Labor Edit Roster");
  const canLogAttendance = hasLaborModuleAccess && hasLeanPermission(profile, "Labor Log Attendance");
  const canManageInterviews = hasLaborModuleAccess && hasLeanPermission(profile, "Labor Manage Interviews");
  const canManageTemplates = hasLaborModuleAccess && hasLeanPermission(profile, "Labor Templates");
  const canAccessEmployeeNotes = hasLaborModuleAccess && hasLeanPermission(profile, "Labor Employee Notes");
  const canUseLaborTab = useCallback((tabId) => {
    if (!hasLaborModuleAccess) return false;
    const permissionKey = LABOR_TAB_PERMISSION_MAP[normalizeLaborTab(tabId)];
    return !permissionKey || hasLeanPermission(profile, permissionKey);
  }, [hasLaborModuleAccess, profile]);
  const visibleTabs = useMemo(() => TABS.filter((item) => canUseLaborTab(item.id)), [canUseLaborTab]);

  const navigateLaborRoute = useCallback((nextTab, nextParams = {}) => {
    const nextLaborTab = normalizeLaborTab(nextTab);
    const nextRouteParams = { laborTab: nextLaborTab, ...nextParams };
    if (nextLaborTab === "interviews") {
      nextRouteParams.interviewView = normalizeInterviewView(nextRouteParams.interviewView);
      if (!nextRouteParams.interviewId) delete nextRouteParams.interviewId;
    } else {
      delete nextRouteParams.interviewView;
      delete nextRouteParams.interviewId;
    }
    if (nextLaborTab === "attendance") {
      nextRouteParams.attendanceView = normalizeAttendanceView(nextRouteParams.attendanceView);
      if (nextRouteParams.attendanceView === "input") delete nextRouteParams.attendanceView;
    } else {
      delete nextRouteParams.attendanceView;
    }
    if (nextLaborTab === "hour-analysis") {
      nextRouteParams.capacityPlanningView = normalizeCapacityPlanningView(nextRouteParams.capacityPlanningView);
      if (nextRouteParams.capacityPlanningView === "staffing-capacity") delete nextRouteParams.capacityPlanningView;
    } else {
      delete nextRouteParams.capacityPlanningView;
    }
    nav?.("training", nextRouteParams);
  }, [nav]);

  const changeLaborTab = useCallback((nextTab) => {
    const nextLaborTab = normalizeLaborTab(nextTab);
    if (!canUseLaborTab(nextLaborTab)) {
      addGlobalToast?.("You do not have permission to access that Labor area", "error");
      return;
    }
    setTab(nextLaborTab);
    if (nextLaborTab === "interviews") {
      navigateLaborRoute(nextLaborTab, { interviewView: interviewView || "records" });
      return;
    }
    if (nextLaborTab === "attendance") {
      navigateLaborRoute(nextLaborTab, { attendanceView });
      return;
    }
    if (nextLaborTab === "hour-analysis") {
      navigateLaborRoute(nextLaborTab, { capacityPlanningView });
      return;
    }
    navigateLaborRoute(nextLaborTab);
  }, [addGlobalToast, attendanceView, canUseLaborTab, capacityPlanningView, interviewView, navigateLaborRoute]);

  const changeAttendanceView = useCallback((nextView) => {
    const normalizedView = normalizeAttendanceView(nextView);
    setAttendanceView(normalizedView);
    navigateLaborRoute("attendance", { attendanceView: normalizedView });
  }, [navigateLaborRoute]);

  const changeInterviewView = useCallback((nextView) => {
    const normalizedView = normalizeInterviewView(nextView);
    if (normalizedView === "config" && !canManageInterviews) {
      addGlobalToast?.("You do not have permission to manage interview configuration", "error");
      return;
    }
    setInterviewView(normalizedView);
    setInterviewDetailOpen(false);
    navigateLaborRoute("interviews", { interviewView: normalizedView });
  }, [addGlobalToast, canManageInterviews, navigateLaborRoute]);

  const changeCapacityPlanningView = useCallback((nextView) => {
    const normalizedView = normalizeCapacityPlanningView(nextView);
    setCapacityPlanningView(normalizedView);
    navigateLaborRoute("hour-analysis", { capacityPlanningView: normalizedView });
  }, [navigateLaborRoute]);

  const handleInterviewRecordRouteChange = useCallback((recordId) => {
    const nextRecordId = typeof recordId === "string" ? recordId : "";
    setInterviewView("records");
    setInterviewDetailOpen(!!nextRecordId);
    navigateLaborRoute("interviews", nextRecordId ? { interviewView: "records", interviewId: nextRecordId } : { interviewView: "records" });
  }, [navigateLaborRoute]);

  useEffect(() => {
    const nextTab = canUseLaborTab(routeLaborTab) ? routeLaborTab : (visibleTabs[0]?.id || "home");
    if (tab !== nextTab) setTab(nextTab);
  }, [canUseLaborTab, routeLaborTab, tab, visibleTabs]);

  useEffect(() => {
    if (routeLaborTab === "attendance" && attendanceView !== routeAttendanceView) {
      setAttendanceView(routeAttendanceView);
    }
  }, [attendanceView, routeAttendanceView, routeLaborTab]);

  useEffect(() => {
    if (routeLaborTab === "hour-analysis" && capacityPlanningView !== routeCapacityPlanningView) {
      setCapacityPlanningView(routeCapacityPlanningView);
    }
  }, [capacityPlanningView, routeCapacityPlanningView, routeLaborTab]);

  useEffect(() => {
    const nextInterviewView = routeInterviewView === "config" && !canManageInterviews ? "records" : routeInterviewView;
    if (routeLaborTab === "interviews" && interviewView !== nextInterviewView) {
      setInterviewView(nextInterviewView);
    }
  }, [canManageInterviews, interviewView, routeInterviewView, routeLaborTab]);

  // New record form
  const [newLaborEmployeeId, setNewLaborEmployeeId] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newTargetRole, setNewTargetRole] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newHireDate, setNewHireDate] = useState("");
  const [newStartDate, setNewStartDate] = useState(todayStr());
  const [newTargetEndDate, setNewTargetEndDate] = useState("");
  const [creating, setCreating] = useState(false);

  // Record config
  const [configEmployeeName, setConfigEmployeeName] = useState("");
  const [configTargetRole, setConfigTargetRole] = useState("");
  const [configHireDate, setConfigHireDate] = useState("");
  const [configStartDate, setConfigStartDate] = useState("");
  const [configTargetEndDate, setConfigTargetEndDate] = useState("");
  const [configLaborEmployeeId, setConfigLaborEmployeeId] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Labor employee editor
  const [showLaborEmployeeEditor, setShowLaborEmployeeEditor] = useState(false);
  const [editingLaborEmployeeId, setEditingLaborEmployeeId] = useState(null);
  const [laborEmployeeName, setLaborEmployeeName] = useState("");
  const [laborEmployeePhone, setLaborEmployeePhone] = useState("");
  const [laborEmployeeEmail, setLaborEmployeeEmail] = useState("");
  const [laborEmployeeRole, setLaborEmployeeRole] = useState("");
  const [laborEmployeeCommitment, setLaborEmployeeCommitment] = useState("");
  const [laborEmployeeReviewTemplateRole, setLaborEmployeeReviewTemplateRole] = useState("");
  const [laborEmployeeStartDate, setLaborEmployeeStartDate] = useState("");
  const [laborEmployeeEndDate, setLaborEmployeeEndDate] = useState("");
  const [savingLaborEmployee, setSavingLaborEmployee] = useState(false);
  const [showInlineLaborEmployeeComposer, setShowInlineLaborEmployeeComposer] = useState(false);
  const [inlineLaborEmployeeComposerEntered, setInlineLaborEmployeeComposerEntered] = useState(false);
  const [newRosterEmployeeFirstName, setNewRosterEmployeeFirstName] = useState("");
  const [newRosterEmployeeLastName, setNewRosterEmployeeLastName] = useState("");
  const [newRosterEmployeePhone, setNewRosterEmployeePhone] = useState("");
  const [newRosterEmployeeEmail, setNewRosterEmployeeEmail] = useState("");
  const [newRosterEmployeeRole, setNewRosterEmployeeRole] = useState("");
  const [newRosterEmployeeCommitment, setNewRosterEmployeeCommitment] = useState("");
  const [newRosterEmployeeStartDate, setNewRosterEmployeeStartDate] = useState(todayStr());
  const [savingInlineLaborEmployee, setSavingInlineLaborEmployee] = useState(false);
  const [justCreatedLaborEmployeeId, setJustCreatedLaborEmployeeId] = useState(null);
  const [employeeRecordTab, setEmployeeRecordTab] = useState("training");
  const [employeeNoteText, setEmployeeNoteText] = useState("");
  const [employeeNoteType, setEmployeeNoteType] = useState("general");
  const [employeeNoteSearchText, setEmployeeNoteSearchText] = useState("");
  const [employeeNoteFiles, setEmployeeNoteFiles] = useState([]);
  const [employeeNoteFileErrors, setEmployeeNoteFileErrors] = useState([]);
  const [savingEmployeeNote, setSavingEmployeeNote] = useState(false);
  const employeeNoteFileInputRef = useRef(null);
  const [editingEmployeeNoteId, setEditingEmployeeNoteId] = useState(null);
  const [editingEmployeeNoteType, setEditingEmployeeNoteType] = useState("general");
  const [editingEmployeeNoteText, setEditingEmployeeNoteText] = useState("");
  const [editingEmployeeNoteFiles, setEditingEmployeeNoteFiles] = useState([]);
  const [editingEmployeeNoteFileErrors, setEditingEmployeeNoteFileErrors] = useState([]);
  const [savingEmployeeNoteEdit, setSavingEmployeeNoteEdit] = useState(false);
  const editingEmployeeNoteFileInputRef = useRef(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [previewingAttachmentId, setPreviewingAttachmentId] = useState(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [deletingEmployeeNoteId, setDeletingEmployeeNoteId] = useState(null);
  const [trainingRequirementEditor, setTrainingRequirementEditor] = useState(null);
  const [trainingRequirementCompletedOn, setTrainingRequirementCompletedOn] = useState("");
  const [trainingRequirementExpiresOn, setTrainingRequirementExpiresOn] = useState("");
  const [trainingRequirementDocumentUrl, setTrainingRequirementDocumentUrl] = useState("");
  const [trainingRequirementSourceNote, setTrainingRequirementSourceNote] = useState("");
  const [trainingRequirementEvidenceFile, setTrainingRequirementEvidenceFile] = useState(null);
  const [trainingRequirementEvidenceError, setTrainingRequirementEvidenceError] = useState("");
  const [savingTrainingRequirement, setSavingTrainingRequirement] = useState(false);
  const trainingRequirementFileInputRef = useRef(null);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [savingReviewItemId, setSavingReviewItemId] = useState(null);
  const [completingReview, setCompletingReview] = useState(false);
  const [reviewPdfDraft, setReviewPdfDraft] = useState(EMPTY_REVIEW_PDF_DRAFT);
  const [savingReviewPdfDraft, setSavingReviewPdfDraft] = useState(false);
  const [savingPerformanceReviewTemplateRole, setSavingPerformanceReviewTemplateRole] = useState(false);
  const [restartingReview, setRestartingReview] = useState(false);
  const [renderingReviewPdf, setRenderingReviewPdf] = useState(false);
  const [sendingReviewSignature, setSendingReviewSignature] = useState(false);
  const [reviewSignatureDeliveryMethod, setReviewSignatureDeliveryMethod] = useState("sms");
  const reviewPdfObjectUrlRef = useRef("");
  const [showGlobalNoteModal, setShowGlobalNoteModal] = useState(false);
  const [globalNoteEmployeeId, setGlobalNoteEmployeeId] = useState("");
  const [globalNoteType, setGlobalNoteType] = useState("general");
  const [globalNoteText, setGlobalNoteText] = useState("");
  const [savingGlobalNote, setSavingGlobalNote] = useState(false);
  const [contactCardDownloadKey, setContactCardDownloadKey] = useState("");
  const [noteFilterEmployeeId, setNoteFilterEmployeeId] = useState("");
  const [noteFilterSource, setNoteFilterSource] = useState("all");
  const [noteFilterType, setNoteFilterType] = useState("all");
  const [noteFilterDateRange, setNoteFilterDateRange] = useState("all");
  const [noteSearchText, setNoteSearchText] = useState("");
  const [rosterSort, setRosterSort] = useState(LABOR_DEFAULT_SORT);
  const [trainingSort, setTrainingSort] = useState(LABOR_DEFAULT_SORT);
  const [trainingView, setTrainingView] = useState("board");
  const [pctReadinessBoard, setPctReadinessBoard] = useState(null);
  const [pctReadinessLoading, setPctReadinessLoading] = useState(false);
  const [pctReadinessLoaded, setPctReadinessLoaded] = useState(false);
  const [pctReadinessError, setPctReadinessError] = useState("");
  const [pctReadinessFilters, setPctReadinessFilters] = useState(DEFAULT_PCT_READINESS_FILTERS);
  const [showPctReadinessFilterPanel, setShowPctReadinessFilterPanel] = useState(false);
  const [pctReadinessFilterPickerReady, setPctReadinessFilterPickerReady] = useState(false);
  const [pctReadinessCollapsedSections, setPctReadinessCollapsedSections] = useState({});
  const [activePctReadinessSectionId, setActivePctReadinessSectionId] = useState("");
  const [hoveredPctReadinessSectionId, setHoveredPctReadinessSectionId] = useState("");
  const [selectedPctReadinessRecordId, setSelectedPctReadinessRecordId] = useState("");
  const [pctReadinessCellEditor, setPctReadinessCellEditor] = useState(null);
  const [pctReadinessEditorStatus, setPctReadinessEditorStatus] = useState("not_started");
  const [pctReadinessEditorDemonstratedBy, setPctReadinessEditorDemonstratedBy] = useState("");
  const [pctReadinessEditorVerifiedBy, setPctReadinessEditorVerifiedBy] = useState("");
  const [pctReadinessEditorComment, setPctReadinessEditorComment] = useState("");
  const [savingPctReadinessCell, setSavingPctReadinessCell] = useState(false);
  const [showPctReadinessNewRecord, setShowPctReadinessNewRecord] = useState(false);
  const [newPctReadinessEmployeeId, setNewPctReadinessEmployeeId] = useState("");
  const [creatingPctReadinessRecord, setCreatingPctReadinessRecord] = useState(false);
  const [performanceReviewSort, setPerformanceReviewSort] = useState(LABOR_DEFAULT_SORT);
  const [hourAnalysisPersonSort, setHourAnalysisPersonSort] = useState(LABOR_DEFAULT_SORT);
  const [showHierarchyManager, setShowHierarchyManager] = useState(false);
  const [savingHierarchy, setSavingHierarchy] = useState(false);
  const [hierarchyDraft, setHierarchyDraft] = useState([]);
  const [newHierarchyTitle, setNewHierarchyTitle] = useState("");
  const [draggingHierarchyTitle, setDraggingHierarchyTitle] = useState("");
  const [rosterFilters, setRosterFilters] = useState(DEFAULT_ROSTER_FILTERS);
  const [rosterDraftFilters, setRosterDraftFilters] = useState(DEFAULT_ROSTER_FILTERS);
  const [savedRosterViews, setSavedRosterViews] = useState([]);
  const [activeRosterViewId, setActiveRosterViewId] = useState(null);
  const [showRosterFilterPanel, setShowRosterFilterPanel] = useState(false);
  const [showRosterFilterPicker, setShowRosterFilterPicker] = useState(false);
  const [rosterFilterPickerReady, setRosterFilterPickerReady] = useState(false);
  const [configuringRosterKey, setConfiguringRosterKey] = useState(null);
  const [showSaveRosterView, setShowSaveRosterView] = useState(false);
  const [rosterViewName, setRosterViewName] = useState("");
  const [rosterPrintOptions, setRosterPrintOptions] = useState(DEFAULT_LABOR_ROSTER_PDF_OPTIONS);
  const [generatingRosterPdf, setGeneratingRosterPdf] = useState(false);
  const rosterPdfAssetsRef = useRef(null);
  const [hourAnalysisSettings, setHourAnalysisSettings] = useState(() => normalizeHourAnalysisSettings());
  const [hourAnalysisLoaded, setHourAnalysisLoaded] = useState(false);
  const [savingHourAnalysis, setSavingHourAnalysis] = useState(false);
  const [showHourAnalysisWhatIfModal, setShowHourAnalysisWhatIfModal] = useState(false);
  const [showHourAnalysisAudit, setShowHourAnalysisAudit] = useState(false);
  const [hourAnalysisLaborModelTab, setHourAnalysisLaborModelTab] = useState(LABOR_MODEL_SUMMARY_TAB);
  const [laborModelDragSelection, setLaborModelDragSelection] = useState(null);
  const laborModelDragSelectionRef = useRef(null);
  const [selectedLaborModelCells, setSelectedLaborModelCells] = useState(() => new Set());
  const [showLaborModelBreakerSettings, setShowLaborModelBreakerSettings] = useState(false);
  const [laborModelBreakerEditorDay, setLaborModelBreakerEditorDay] = useState("monday");
  const [laborModelBreakerCopyTargets, setLaborModelBreakerCopyTargets] = useState([]);
  const [hourAnalysisChangedKeys, setHourAnalysisChangedKeys] = useState(() => new Set());
  const [hourAnalysisCapacityHover, setHourAnalysisCapacityHover] = useState(null);
  const [whatIfEmployeeName, setWhatIfEmployeeName] = useState("");
  const [whatIfPosition, setWhatIfPosition] = useState("");
  const [whatIfCommitment, setWhatIfCommitment] = useState("full_time");
  const [whatIfHourOverrides, setWhatIfHourOverrides] = useState({});
  const [whatIfNote, setWhatIfNote] = useState("");
  const firstRosterNameInputRef = useRef(null);
  const prevRosterFilterOpen = useRef(false);
  const pendingEmployeeRecordTabRef = useRef("");
  const hourAnalysisLoadedSnapshotRef = useRef("");
  const hourAnalysisSaveTimerRef = useRef(null);
  const pctReadinessScrollRef = useRef(null);

  // Notes
  const [generalNoteText, setGeneralNoteText] = useState("");
  const [itemNoteDrafts, setItemNoteDrafts] = useState({});
  const [savingItemNoteId, setSavingItemNoteId] = useState(null);
  const [savingGeneralNote, setSavingGeneralNote] = useState(false);

  const locationRef = profile?.location_id || data?.locationId || "";
  const laborLocationRef = resolvedLaborLocationId || locationRef || "";
  const laborContactLocationName = String(locationName || data?.locationName || profile?.location_name || "K9 Operations").trim();
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";

  useEffect(() => {
    if (!laborLocationRef) return;
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", laborLocationRef)
      .eq("setting_key", LABOR_ROSTER_VIEWS_SETTING_KEY)
      .maybeSingle()
      .then(({ data: row }) => {
        if (Array.isArray(row?.setting_value)) setSavedRosterViews(row.setting_value);
      });
  }, [laborLocationRef]);

  const persistRosterViews = useCallback(async (views) => {
    if (!laborLocationRef) return;
    setSavedRosterViews(views);
    await supabase
      .from("lite_settings")
      .upsert(
        {
          location_id: laborLocationRef,
          setting_key: LABOR_ROSTER_VIEWS_SETTING_KEY,
          setting_value: views,
        },
        { onConflict: "location_id,setting_key" },
      );
  }, [laborLocationRef]);

  useEffect(() => {
    if (!laborLocationRef) {
      const defaults = normalizeHourAnalysisSettings();
      setHourAnalysisSettings(defaults);
      hourAnalysisLoadedSnapshotRef.current = JSON.stringify(defaults);
      setHourAnalysisLoaded(false);
      return;
    }
    let cancelled = false;
    setHourAnalysisLoaded(false);
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", laborLocationRef)
      .eq("setting_key", LABOR_HOUR_ANALYSIS_SETTING_KEY)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (cancelled) return;
        if (error) console.warn("Labor hour analysis settings load skipped:", error);
        const normalized = normalizeHourAnalysisSettings(row?.setting_value);
        setHourAnalysisSettings(normalized);
        hourAnalysisLoadedSnapshotRef.current = JSON.stringify(normalized);
        setHourAnalysisLoaded(true);
      });
    return () => { cancelled = true; };
  }, [laborLocationRef]);

  useEffect(() => {
    if (!hourAnalysisLoaded || !laborLocationRef) return undefined;
    const normalized = normalizeHourAnalysisSettings(hourAnalysisSettings);
    const serialized = JSON.stringify(normalized);
    if (serialized === hourAnalysisLoadedSnapshotRef.current) return undefined;
    if (hourAnalysisSaveTimerRef.current) window.clearTimeout(hourAnalysisSaveTimerRef.current);
    setSavingHourAnalysis(true);
    hourAnalysisSaveTimerRef.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("lite_settings")
        .upsert(
          {
            location_id: laborLocationRef,
            setting_key: LABOR_HOUR_ANALYSIS_SETTING_KEY,
            setting_value: normalized,
          },
          { onConflict: "location_id,setting_key" },
        );
      if (error) {
        console.error("Failed to save labor hour analysis settings", error);
        addGlobalToast?.(error.message || "Failed to save hour analysis", "error");
      } else {
        hourAnalysisLoadedSnapshotRef.current = serialized;
      }
      setSavingHourAnalysis(false);
    }, 520);
    return () => {
      if (hourAnalysisSaveTimerRef.current) window.clearTimeout(hourAnalysisSaveTimerRef.current);
    };
  }, [addGlobalToast, hourAnalysisLoaded, hourAnalysisSettings, laborLocationRef]);

  useEffect(() => {
    if (showRosterFilterPanel && !prevRosterFilterOpen.current) {
      setRosterDraftFilters({ ...rosterFilters });
      setShowRosterFilterPicker(false);
      setConfiguringRosterKey(null);
    }
    prevRosterFilterOpen.current = showRosterFilterPanel;
  }, [rosterFilters, showRosterFilterPanel]);

  const loadCoreData = useCallback(async () => {
    setLoading(true);
    setTrainingBundleLoaded(false);
    setTrainingBundleLoading(false);
    setSupportBundleLoaded(false);
    setSupportBundleLoading(false);
    setTemplates([]);
    setTemplateVersions([]);
    setAllTemplateVersions([]);
    setReviewTemplates([]);
    setReviewTemplateVersions([]);
    setAllReviewTemplateVersions([]);
    setSections([]);
    setItems([]);
    setReviewSections([]);
    setReviewItems([]);
    setLaborEmployeeNotes([]);
    setLaborEmployeeDocuments([]);
    setLaborAttendanceIncidents([]);
    setReviewInstances([]);
    setReviewResponses([]);
    setEmployeeCertifications([]);
    setAllTrainingNotes([]);
    try {
      const resolvedLocationId = await resolveTrainingLocationId(supabase, locationRef, actorUserId);
      if (!resolvedLocationId) {
        setResolvedLaborLocationId("");
        setRecords([]);
        setLaborEmployees([]);
        setRosterSnapshot([]);
        setServerDashboardMetrics(null);
        setPositionHierarchy([]);
        setHierarchyPersistenceAvailable(true);
        setLoading(false);
        return {
          resolvedLocationId: "",
          records: [],
          laborEmployees: [],
          rosterSnapshot: [],
          positionHierarchy: [],
        };
      }
      setResolvedLaborLocationId(resolvedLocationId);

      const [recordRes, employeeRes] = await Promise.all([
        supabase
          .from("training_records")
          .select("*")
          .eq("location_id", resolvedLocationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("labor_employees")
          .select("*")
          .eq("location_id", resolvedLocationId)
          .order("full_name"),
      ]);

      if (recordRes.error) throw recordRes.error;
      if (employeeRes.error) throw employeeRes.error;

      let hierarchyRows = [];
      const hierarchyRes = await supabase
        .from("labor_position_hierarchy")
        .select("*")
        .eq("location_id", resolvedLocationId)
        .order("sort_order", { ascending: true });

      if (hierarchyRes.error) {
        const missingHierarchyTable = hierarchyRes.error.code === "PGRST205"
          || hierarchyRes.error.code === "42P01"
          || /labor_position_hierarchy/i.test(hierarchyRes.error.message || "");
        if (!missingHierarchyTable) throw hierarchyRes.error;
        setHierarchyPersistenceAvailable(false);
      } else {
        hierarchyRows = hierarchyRes.data || [];
        setHierarchyPersistenceAvailable(true);
      }

      let rosterRows = [];
      let metricsFromServer = null;
      try {
        const { data: dashboardData, error: dashboardError } = await supabase.rpc("get_labor_dashboard_snapshot", {
          p_location_ref: resolvedLocationId,
          p_actor_user_id: actorUserId,
        });
        if (dashboardError) throw dashboardError;
        rosterRows = Array.isArray(dashboardData?.roster) ? dashboardData.roster : [];
        metricsFromServer = dashboardData?.metrics || null;
      } catch (dashboardError) {
        try {
          const { data: legacyRosterData, error: legacyRosterError } = await supabase.rpc("get_labor_roster_snapshot", {
            p_location_ref: resolvedLocationId,
            p_actor_user_id: actorUserId,
          });
          if (legacyRosterError) throw legacyRosterError;
          rosterRows = Array.isArray(legacyRosterData) ? legacyRosterData : legacyRosterData || [];
        } catch (rosterError) {
          console.warn("Labor roster snapshot load skipped:", dashboardError, rosterError);
        }
      }

      const nextRecords = recordRes.data || [];
      const nextLaborEmployees = employeeRes.data || [];
      const nextHierarchy = hierarchyRows;

      setRecords(nextRecords);
      setLaborEmployees(nextLaborEmployees);
      setRosterSnapshot(rosterRows);
      setServerDashboardMetrics(metricsFromServer);
      setPositionHierarchy(nextHierarchy);
      setLoading(false);
      return {
        resolvedLocationId,
        records: nextRecords,
        laborEmployees: nextLaborEmployees,
        rosterSnapshot: rosterRows,
        positionHierarchy: nextHierarchy,
      };
    } catch (err) {
      console.error("Labor core load error:", err);
      addGlobalToast("Failed to load labor data", "error");
    }
    setLoading(false);
    return null;
  }, [actorUserId, addGlobalToast, locationRef]);

  const loadTrainingBundle = useCallback(async (force = false, locationOverride = null) => {
    const locationIdForBundle = locationOverride || resolvedLaborLocationId;
    if (!locationIdForBundle || (!force && (trainingBundleLoaded || trainingBundleLoading))) return;
    setTrainingBundleLoading(true);
    try {
      const [templateRes, reviewTemplateRes] = await Promise.all([
        supabase
          .from("training_templates")
          .select("*")
          .or(buildTrainingTemplateScopeClause(locationIdForBundle))
          .order("name"),
        supabase
          .from("review_templates")
          .select("*")
          .or(buildTrainingTemplateScopeClause(locationIdForBundle))
          .order("name"),
      ]);

      if (templateRes.error) throw templateRes.error;
      if (reviewTemplateRes.error) throw reviewTemplateRes.error;

      const templateRows = templateRes.data || [];
      const reviewTemplateRows = reviewTemplateRes.data || [];

      const [trainingVersionRes, reviewVersionRes] = await Promise.all([
        templateRows.length > 0
          ? supabase
              .from("training_template_versions")
              .select("*")
              .in("template_id", templateRows.map((template) => template.id))
              .order("template_id")
              .order("version_no", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        reviewTemplateRows.length > 0
          ? supabase
              .from("review_template_versions")
              .select("*")
              .in("template_id", reviewTemplateRows.map((template) => template.id))
              .order("template_id")
              .order("version_no", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (trainingVersionRes.error) throw trainingVersionRes.error;
      if (reviewVersionRes.error) throw reviewVersionRes.error;

      const allVersionRows = trainingVersionRes.data || [];
      const allReviewVersionRows = reviewVersionRes.data || [];

      const [sectionRes, itemRes, reviewSectionRes, reviewItemRes] = await Promise.all([
        allVersionRows.length > 0
          ? supabase.from("training_template_sections").select("*").in("template_version_id", allVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
        allVersionRows.length > 0
          ? supabase.from("training_template_items").select("*").in("template_version_id", allVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
        allReviewVersionRows.length > 0
          ? supabase.from("review_sections").select("*").in("template_version_id", allReviewVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
        allReviewVersionRows.length > 0
          ? supabase.from("review_items").select("*").in("template_version_id", allReviewVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (sectionRes.error) throw sectionRes.error;
      if (itemRes.error) throw itemRes.error;
      if (reviewSectionRes.error) throw reviewSectionRes.error;
      if (reviewItemRes.error) throw reviewItemRes.error;

      setTemplates(templateRows);
      setTemplateVersions(allVersionRows.filter((version) => version.is_current && version.status === "published"));
      setAllTemplateVersions(allVersionRows);
      setReviewTemplates(reviewTemplateRows);
      setReviewTemplateVersions(allReviewVersionRows.filter((version) => version.is_current && version.status === "published"));
      setAllReviewTemplateVersions(allReviewVersionRows);
      setSections(sectionRes.data || []);
      setItems(itemRes.data || []);
      setReviewSections(reviewSectionRes.data || []);
      setReviewItems(reviewItemRes.data || []);
      setTrainingBundleLoaded(true);
    } catch (err) {
      console.error("Labor training bundle load error:", err);
      addGlobalToast("Failed to load training data", "error");
    }
    setTrainingBundleLoading(false);
  }, [addGlobalToast, resolvedLaborLocationId, trainingBundleLoaded, trainingBundleLoading]);

  const loadSupportBundle = useCallback(async (force = false, seedData = null) => {
    const locationIdForBundle = seedData?.resolvedLocationId || resolvedLaborLocationId;
    if (!locationIdForBundle || (!force && (supportBundleLoaded || supportBundleLoading))) return;
    setSupportBundleLoading(true);
    try {
      const employeeSource = [
        ...(Array.isArray(seedData?.laborEmployees) ? seedData.laborEmployees : laborEmployees),
        ...(Array.isArray(seedData?.rosterSnapshot) ? seedData.rosterSnapshot : rosterSnapshot),
      ];
      const recordSource = Array.isArray(seedData?.records) ? seedData.records : records;
      let employeeRowsForBundle = toObjectRows(employeeSource);
      if (employeeRowsForBundle.length === 0) {
	        const { data: fallbackEmployees, error: fallbackEmployeeError } = await supabase
	          .from("labor_employees")
	          .select("*")
	          .eq("location_id", locationIdForBundle)
          .order("full_name", { ascending: true });
        if (fallbackEmployeeError) throw fallbackEmployeeError;
        employeeRowsForBundle = toObjectRows(fallbackEmployees);
        if (employeeRowsForBundle.length > 0 && toObjectRows(laborEmployees).length === 0) {
          setLaborEmployees(employeeRowsForBundle);
        }
      }
      const employeeIds = Array.from(new Set(employeeRowsForBundle.map(getLaborEmployeeRowId).filter(Boolean)));
      const recordIds = toObjectRows(recordSource).map((record) => record.id).filter(Boolean);

      const [noteRes, documentRes, historyEventRes, attendanceIncidentRes, reviewInstanceRes, certificationRes, requirementRes] = await Promise.all([
        employeeIds.length > 0
          ? supabase.from("labor_employee_notes").select("*").in("labor_employee_id", employeeIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("labor_employee_documents").select("*").in("labor_employee_id", employeeIds).order("uploaded_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("labor_employee_history_events").select("*").in("labor_employee_id", employeeIds).order("occurred_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("attendance_incidents").select("*").in("labor_employee_id", employeeIds).order("incident_date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("employee_review_instances").select("*").in("labor_employee_id", employeeIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("employee_certifications").select("*").in("labor_employee_id", employeeIds).order("completed_on", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("certification_requirements")
          .select("*")
          .in("slug", Object.values(LABOR_TRAINING_REQUIREMENT_SLUGS))
          .order("name", { ascending: true }),
      ]);

      if (noteRes.error) throw noteRes.error;
      if (documentRes.error) throw documentRes.error;
      if (historyEventRes.error) {
        console.error("Labor employee history events load error:", historyEventRes.error);
        addGlobalToast("Employee history is temporarily unavailable; notes still loaded", "error");
      }
      if (attendanceIncidentRes.error) throw attendanceIncidentRes.error;
      if (reviewInstanceRes.error) throw reviewInstanceRes.error;
      if (certificationRes.error) throw certificationRes.error;
      if (requirementRes.error) throw requirementRes.error;

      const reviewInstanceIds = (reviewInstanceRes.data || []).map((instance) => instance.id);
      const [responseRes, trainingNoteRes, trainingEventRes] = await Promise.all([
        reviewInstanceIds.length > 0
          ? supabase
              .from("employee_review_responses")
              .select("*")
              .in("review_instance_id", reviewInstanceIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        recordIds.length > 0
          ? supabase
              .from("training_record_notes")
              .select("*")
              .in("record_id", recordIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        recordIds.length > 0
          ? supabase
              .from("training_record_events")
              .select("*")
              .in("record_id", recordIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (responseRes.error) throw responseRes.error;
      if (trainingNoteRes.error) throw trainingNoteRes.error;
      if (trainingEventRes.error) throw trainingEventRes.error;

      setLaborEmployeeNotes(noteRes.data || []);
      setLaborEmployeeDocuments(documentRes.data || []);
      setLaborEmployeeHistoryEvents(historyEventRes.error ? [] : (historyEventRes.data || []));
      setLaborAttendanceIncidents(attendanceIncidentRes.data || []);
      setReviewInstances(reviewInstanceRes.data || []);
      setReviewResponses(responseRes.data || []);
      setEmployeeCertifications(certificationRes.data || []);
      setCertificationRequirements(requirementRes.data || []);
      setAllTrainingNotes(trainingNoteRes.data || []);
      setAllTrainingEvents(trainingEventRes.data || []);
      setSupportBundleLoaded(true);
    } catch (err) {
      console.error("Labor support bundle load error:", err);
      addGlobalToast("Failed to load labor notes and reviews", "error");
    }
    setSupportBundleLoading(false);
  }, [addGlobalToast, laborEmployees, records, resolvedLaborLocationId, rosterSnapshot, supportBundleLoaded, supportBundleLoading]);

  const refreshLaborData = useCallback(async ({ includeTraining = true, includeSupport = true } = {}) => {
    const coreData = await loadCoreData();
    if (includeTraining) {
      await loadTrainingBundle(true, coreData?.resolvedLocationId || null);
    }
    if (includeSupport) {
      await loadSupportBundle(true, coreData);
    }
  }, [loadCoreData, loadSupportBundle, loadTrainingBundle]);
  const refreshTemplateBundle = useCallback(async () => {
    await loadTrainingBundle(true, laborLocationRef || null);
  }, [laborLocationRef, loadTrainingBundle]);

  const loadPctReadinessBoard = useCallback(async (force = false) => {
    if (!laborLocationRef || (!force && (pctReadinessLoaded || pctReadinessLoading))) return;
    setPctReadinessLoading(true);
    setPctReadinessError("");
    try {
      const { data: boardData, error } = await supabase.rpc("get_pct_readiness_board", {
        p_location_ref: laborLocationRef,
        p_actor_user_id: actorUserId,
      });
      if (error) throw error;
      setPctReadinessBoard(boardData || null);
      setPctReadinessLoaded(true);
    } catch (error) {
      console.error("PCT readiness board load error:", error);
      setPctReadinessError(error?.message || "Failed to load Team Readiness Board");
      addGlobalToast?.("Failed to load Team Readiness Board", "error");
    } finally {
      setPctReadinessLoading(false);
    }
  }, [actorUserId, addGlobalToast, laborLocationRef, pctReadinessLoaded, pctReadinessLoading]);

  useEffect(() => { loadCoreData(); }, [loadCoreData]);

  useEffect(() => {
    setPctReadinessBoard(null);
    setPctReadinessLoaded(false);
    setPctReadinessError("");
    setNewPctReadinessEmployeeId("");
    setSelectedPctReadinessRecordId("");
    setActivePctReadinessSectionId("");
  }, [laborLocationRef]);

  useEffect(() => {
    if (tab === "training" || tab === "performance-reviews" || tab === "templates" || showNewRecord || !!selectedRecordId || !!previewTemplateId || !!selectedReviewInstanceId) {
      loadTrainingBundle();
    }
  }, [loadTrainingBundle, previewTemplateId, selectedRecordId, selectedReviewInstanceId, showNewRecord, tab]);

  useEffect(() => {
    if (tab === "training" && trainingView === "board") {
      loadPctReadinessBoard();
    }
  }, [loadPctReadinessBoard, tab, trainingView]);

  useEffect(() => {
    if (!laborLocationRef || tab !== "training") return undefined;
    const reloadBoard = () => {
      setPctReadinessLoaded(false);
      loadPctReadinessBoard(true);
      if (trainingView === "history") loadSupportBundle(true);
    };
    const channel = supabase
      .channel(`pct-readiness-live-${laborLocationRef}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "training_records", filter: `location_id=eq.${laborLocationRef}` }, reloadBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "training_record_item_results" }, reloadBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "training_record_notes" }, reloadBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "training_record_events" }, reloadBoard)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [laborLocationRef, loadPctReadinessBoard, loadSupportBundle, tab, trainingView]);

  useEffect(() => {
    if (tab === "home" || tab === "performance-reviews" || tab === "notes" || (tab === "training" && trainingView === "history") || !!selectedLaborEmployeeId || !!selectedReviewInstanceId) {
      loadSupportBundle();
    }
  }, [loadSupportBundle, selectedLaborEmployeeId, selectedReviewInstanceId, tab, trainingView]);

  useEffect(() => {
    setEmployeeRecordTab(pendingEmployeeRecordTabRef.current || "training");
    pendingEmployeeRecordTabRef.current = "";
    setEmployeeNoteText("");
    setEmployeeNoteType("general");
    setEmployeeNoteSearchText("");
    setEmployeeNoteFiles([]);
    setEmployeeNoteFileErrors([]);
    setAttachmentPreview(null);
    if (employeeNoteFileInputRef.current) employeeNoteFileInputRef.current.value = "";
  }, [selectedLaborEmployeeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [tab]);

  useLayoutEffect(() => {
    setReviewDrafts({});
    if (!selectedReviewInstanceId || typeof window === "undefined") return;
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    };
    resetScroll();
    window.requestAnimationFrame(resetScroll);
    const timeoutId = window.setTimeout(resetScroll, 80);
    return () => window.clearTimeout(timeoutId);
  }, [selectedReviewInstanceId]);

  // Load record detail data when a record is selected
  useEffect(() => {
    if (!selectedRecordId) return;
    (async () => {
      const [irRes, nRes, eRes] = await Promise.all([
        supabase.from("training_record_item_results").select("*").eq("record_id", selectedRecordId),
        supabase.from("training_record_notes").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
        supabase.from("training_record_events").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
      ]);
      setItemResults(irRes.data || []);
      setNotes(nRes.data || []);
      setRecordEvents(eRes.data || []);
    })();
  }, [selectedRecordId]);

  // ── Derived data ──
  const activeRecords = useMemo(() => toObjectRows(records).filter((record) => ACTIVE_TRAINING_RECORD_STATUSES.includes(record.overall_status)), [records]);
  const completedRecords = useMemo(() => toObjectRows(records).filter((record) => COMPLETED_TRAINING_RECORD_STATUSES.includes(record.overall_status)), [records]);
  const activeTemplates = useMemo(() => toObjectRows(templates).filter((template) => template.is_active), [templates]);
  const activeLaborEmployees = useMemo(() => toObjectRows(rosterSnapshot).filter((row) => isLaborEmployeeActive(row)), [rosterSnapshot]);
  const laborNotesByEmployee = useMemo(() => groupLaborEmployeeNotes(toObjectRows(laborEmployeeNotes)), [laborEmployeeNotes]);
  const fallbackDashboardMetrics = useMemo(() => {
    return buildLaborDashboardMetrics({
      rosterSnapshot,
      employeeNotes: laborEmployeeNotes,
      attendanceIncidents: laborAttendanceIncidents,
    });
  }, [laborAttendanceIncidents, laborEmployeeNotes, rosterSnapshot]);
  const dashboardMetrics = useMemo(() => {
    if (serverDashboardMetrics) {
      const serverStaffingMatrix = Array.isArray(serverDashboardMetrics.staffing_matrix)
        ? serverDashboardMetrics.staffing_matrix.map((row) => ({
          key: row.position_group || row.key || "other",
          label: row.label || row.position_group_label || row.position_label || "Other",
          fullTime: Number(row.full_time_count ?? row.fullTime ?? 0),
          partTime: Number(row.part_time_count ?? row.partTime ?? 0),
          unassigned: Number(row.unassigned_count ?? row.unassignedCommitmentCount ?? row.unassigned ?? 0),
          total: Number(row.total_count ?? row.total ?? 0),
        }))
        : fallbackDashboardMetrics.staffingMatrix;
      return {
        activeEmployeeCount: Number(serverDashboardMetrics.active_employee_count ?? fallbackDashboardMetrics.activeEmployeeCount),
        managerCount: Number(serverDashboardMetrics.manager_count ?? fallbackDashboardMetrics.managerCount),
        supervisorCount: Number(serverDashboardMetrics.supervisor_count ?? fallbackDashboardMetrics.supervisorCount),
        csrCount: Number(serverDashboardMetrics.csr_count ?? fallbackDashboardMetrics.csrCount),
        pctCount: Number(serverDashboardMetrics.pct_count ?? fallbackDashboardMetrics.pctCount),
        otherPositionCount: Number(serverDashboardMetrics.other_position_count ?? fallbackDashboardMetrics.otherPositionCount),
        fullTimeCount: Number(serverDashboardMetrics.full_time_count ?? fallbackDashboardMetrics.fullTimeCount),
        partTimeCount: Number(serverDashboardMetrics.part_time_count ?? fallbackDashboardMetrics.partTimeCount),
        unassignedCommitmentCount: Number(serverDashboardMetrics.unassigned_commitment_count ?? fallbackDashboardMetrics.unassignedCommitmentCount),
        staffingMatrix: serverStaffingMatrix,
        employeeNoteCount30d: Number(
          serverDashboardMetrics.employee_note_count_30d
            ?? serverDashboardMetrics.employee_note_count_7d
            ?? fallbackDashboardMetrics.employeeNoteCount30d
        ),
        attendanceMarkCount30d: Number(
          serverDashboardMetrics.attendance_mark_count_30d
            ?? fallbackDashboardMetrics.attendanceMarkCount30d
        ),
        newHireCount30d: Number(serverDashboardMetrics.new_hire_count_30d ?? fallbackDashboardMetrics.newHireCount30d),
        terminationCount30d: Number(serverDashboardMetrics.termination_count_30d ?? fallbackDashboardMetrics.terminationCount30d),
        activeTraineeCount: Number(serverDashboardMetrics.active_trainee_count ?? fallbackDashboardMetrics.activeTraineeCount),
        trainingComplianceNumerator: Number(
          serverDashboardMetrics.training_compliance_numerator ?? fallbackDashboardMetrics.trainingComplianceNumerator
        ),
        trainingComplianceDenominator: Number(
          serverDashboardMetrics.training_compliance_denominator ?? fallbackDashboardMetrics.trainingComplianceDenominator
        ),
        trainingComplianceScore: Number(
          serverDashboardMetrics.training_compliance_score ?? fallbackDashboardMetrics.trainingComplianceScore
        ),
      };
    }
    return fallbackDashboardMetrics;
  }, [fallbackDashboardMetrics, serverDashboardMetrics]);

  const selectedRecord = useMemo(() => toObjectRows(records).find((record) => record.id === selectedRecordId) || null, [records, selectedRecordId]);
  const selectedRecordEmployeeId = useMemo(() => {
    if (!selectedRecord) return null;
    return selectedRecord.labor_employee_id || selectedRecord.employee_id || null;
  }, [selectedRecord]);
  const selectedLaborEmployee = useMemo(() => {
    const employeeRows = toObjectRows(laborEmployees);
    const employeeId = selectedLaborEmployeeId || selectedRecordEmployeeId;
    if (employeeId) {
      const directMatch = employeeRows.find((employee) => employee.id === employeeId);
      if (directMatch) return directMatch;
    }
    const recordName = normalizeEmployeeName(selectedRecord?.employee_full_name);
    if (!recordName) return null;
    return employeeRows.find((employee) => normalizeEmployeeName(employee.full_name) === recordName) || null;
  }, [laborEmployees, selectedLaborEmployeeId, selectedRecord, selectedRecordEmployeeId]);
  const selectedLaborEmployeeSnapshot = useMemo(() => {
    const snapshotRows = toObjectRows(rosterSnapshot);
    const employeeId = selectedLaborEmployeeId || selectedLaborEmployee?.id || selectedRecordEmployeeId || getLaborEmployeeRowId(selectedLaborEmployeeSeed);
    if (employeeId) {
      const directMatch = snapshotRows.find((row) => getLaborEmployeeRowId(row) === employeeId);
      if (directMatch) return directMatch;
    }
    if (isObjectRow(selectedLaborEmployeeSeed)) return selectedLaborEmployeeSeed;
    const recordName = normalizeEmployeeName(selectedRecord?.employee_full_name);
    if (!recordName) return null;
    return snapshotRows.find((row) => normalizeEmployeeName(row.full_name) === recordName) || null;
  }, [rosterSnapshot, selectedLaborEmployee?.id, selectedLaborEmployeeId, selectedLaborEmployeeSeed, selectedRecord, selectedRecordEmployeeId]);
  const selectedLaborEmployeeView = useMemo(() => {
    if (!selectedLaborEmployee && !selectedLaborEmployeeSnapshot && !selectedLaborEmployeeSeed) return null;
    const employeeId = selectedLaborEmployee?.id
      || getLaborEmployeeRowId(selectedLaborEmployeeSnapshot)
      || getLaborEmployeeRowId(selectedLaborEmployeeSeed)
      || selectedLaborEmployeeId
      || selectedRecordEmployeeId
      || null;
    const employeeMetadata = {
      ...(isObjectRow(selectedLaborEmployee?.metadata) ? selectedLaborEmployee.metadata : {}),
      ...(isObjectRow(selectedLaborEmployeeSnapshot?.metadata) ? selectedLaborEmployeeSnapshot.metadata : {}),
      ...(isObjectRow(selectedLaborEmployeeSeed?.metadata) ? selectedLaborEmployeeSeed.metadata : {}),
    };
    return {
      ...(selectedLaborEmployeeSeed || {}),
      ...(selectedLaborEmployeeSnapshot || {}),
      ...(selectedLaborEmployee || {}),
      id: employeeId,
      labor_employee_id: employeeId,
	      full_name: selectedLaborEmployee?.full_name || selectedLaborEmployeeSnapshot?.full_name || selectedLaborEmployeeSeed?.full_name || selectedRecord?.employee_full_name || "",
	      position_title: selectedLaborEmployee?.position_title || selectedLaborEmployeeSnapshot?.position_title || selectedLaborEmployeeSeed?.position_title || "",
	      employment_commitment: readLaborEmploymentCommitment(selectedLaborEmployee) || readLaborEmploymentCommitment(selectedLaborEmployeeSnapshot) || readLaborEmploymentCommitment(selectedLaborEmployeeSeed) || null,
	      start_date: selectedLaborEmployee?.start_date || selectedLaborEmployeeSnapshot?.start_date || selectedLaborEmployeeSeed?.start_date || null,
      end_date: selectedLaborEmployee?.end_date || selectedLaborEmployeeSnapshot?.end_date || selectedLaborEmployeeSeed?.end_date || null,
      contact_email: selectedLaborEmployeeSnapshot?.contact_email || selectedLaborEmployeeSeed?.contact_email || "",
      contact_phone: selectedLaborEmployeeSnapshot?.contact_phone || selectedLaborEmployeeSeed?.contact_phone || "",
      metadata: employeeMetadata,
    };
  }, [selectedLaborEmployee, selectedLaborEmployeeId, selectedLaborEmployeeSeed, selectedLaborEmployeeSnapshot, selectedRecord, selectedRecordEmployeeId]);
  const hasSelectedLaborEmployee = Boolean(selectedLaborEmployeeId || selectedLaborEmployeeSeed);
  const laborEmployeeMap = useMemo(() => {
    const entries = [...toObjectRows(rosterSnapshot), ...toObjectRows(laborEmployees)]
      .map((employee) => [getLaborEmployeeRowId(employee), employee])
      .filter(([employeeId]) => employeeId);
    return Object.fromEntries(entries);
  }, [laborEmployees, rosterSnapshot]);
  const performanceReviewTemplateOptions = useMemo(() => getPerformanceReviewTemplateOptions(), []);
  const recordMap = useMemo(() => Object.fromEntries(toObjectRows(records).map((record) => [record.id, record])), [records]);
  const trainingItemMap = useMemo(() => Object.fromEntries(toObjectRows(items).map((item) => [item.id, item])), [items]);
  const activeEmployeeDocumentsByNote = useMemo(() => groupLaborEmployeeDocumentsByNote(laborEmployeeDocuments), [laborEmployeeDocuments]);
  const selectedVersion = useMemo(() => {
    if (!selectedRecord) return null;
    return toObjectRows(templateVersions).find((version) => version.id === selectedRecord.template_version_id) || null;
  }, [selectedRecord, templateVersions]);
  const groupedNotes = useMemo(() => groupTrainingNotes(notes), [notes]);
  const selectedEmployeeAllNotes = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborEmployeeNotes).filter((note) => note.labor_employee_id === selectedLaborEmployeeView.id);
  }, [laborEmployeeNotes, selectedLaborEmployeeView]);
  const selectedEmployeeNotes = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborNotesByEmployee[selectedLaborEmployeeView.id] || []);
  }, [laborNotesByEmployee, selectedLaborEmployeeView]);
  const filteredSelectedEmployeeNotes = useMemo(() => {
    return selectedEmployeeNotes.filter((note) => noteMatchesSearch(note, employeeNoteSearchText));
  }, [employeeNoteSearchText, selectedEmployeeNotes]);
  const selectedEmployeeDocuments = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborEmployeeDocuments).filter((document) => document.labor_employee_id === selectedLaborEmployeeView.id);
  }, [laborEmployeeDocuments, selectedLaborEmployeeView]);
  const selectedEmployeeDocumentsByNote = useMemo(() => {
    return groupLaborEmployeeDocumentsByNote(selectedEmployeeDocuments);
  }, [selectedEmployeeDocuments]);
  const editingEmployeeNote = useMemo(() => {
    if (!editingEmployeeNoteId) return null;
    return toObjectRows(laborEmployeeNotes).find((note) => note.id === editingEmployeeNoteId) || null;
  }, [editingEmployeeNoteId, laborEmployeeNotes]);
  const editingEmployeeNoteDocuments = useMemo(() => {
    if (!editingEmployeeNote?.id) return [];
    return toObjectRows(activeEmployeeDocumentsByNote[editingEmployeeNote.id] || []);
  }, [activeEmployeeDocumentsByNote, editingEmployeeNote]);
  const selectedEmployeeUnlinkedDocuments = useMemo(() => {
    return toObjectRows(selectedEmployeeDocumentsByNote.__unlinked__ || []);
  }, [selectedEmployeeDocumentsByNote]);
  const selectedEmployeeReviewInstances = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(reviewInstances).filter((instance) => instance.labor_employee_id === selectedLaborEmployeeView.id);
  }, [reviewInstances, selectedLaborEmployeeView]);
  const selectedEmployeeCertifications = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(employeeCertifications).filter((row) => row.labor_employee_id === selectedLaborEmployeeView.id);
  }, [employeeCertifications, selectedLaborEmployeeView]);
  const employeeCertificationsByEmployee = useMemo(() => {
    return toObjectRows(employeeCertifications).reduce((acc, certification) => {
      if (!certification?.labor_employee_id) return acc;
      if (!acc[certification.labor_employee_id]) acc[certification.labor_employee_id] = [];
      acc[certification.labor_employee_id].push(certification);
      return acc;
    }, {});
  }, [employeeCertifications]);
  const laborEmployeeDocumentsByEmployee = useMemo(() => {
    return toObjectRows(laborEmployeeDocuments).reduce((acc, document) => {
      if (!document?.labor_employee_id) return acc;
      if (!acc[document.labor_employee_id]) acc[document.labor_employee_id] = [];
      acc[document.labor_employee_id].push(document);
      return acc;
    }, {});
  }, [laborEmployeeDocuments]);
  const selectedEmployeeTrainingRequirementRows = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return buildEmployeeTrainingRequirementRows({
      employee: selectedLaborEmployeeView,
      certifications: selectedEmployeeCertifications,
      requirements: certificationRequirements,
      documents: selectedEmployeeDocuments,
    });
  }, [certificationRequirements, selectedEmployeeCertifications, selectedEmployeeDocuments, selectedLaborEmployeeView]);
  const selectedEmployeeTrainingRequirementSummary = useMemo(() => {
    return summarizeEmployeeTrainingRequirementCompliance(selectedEmployeeTrainingRequirementRows);
  }, [selectedEmployeeTrainingRequirementRows]);
  const selectedEmployeeAttendanceIncidents30d = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    const now = Date.now();
    return toObjectRows(laborAttendanceIncidents).filter((incident) => {
      if (incident.labor_employee_id !== selectedLaborEmployeeView.id) return false;
      const incidentDate = incident?.incident_date ? new Date(`${incident.incident_date}T12:00:00`).getTime() : NaN;
      return Number.isFinite(incidentDate) && now - incidentDate <= 30 * 24 * 60 * 60 * 1000;
    });
  }, [laborAttendanceIncidents, selectedLaborEmployeeView]);
  const selectedEmployeeHistoryEvents = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborEmployeeHistoryEvents).filter((event) => event.labor_employee_id === selectedLaborEmployeeView.id);
  }, [laborEmployeeHistoryEvents, selectedLaborEmployeeView]);
  const selectedEmployeeTrainingRecordIds = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return new Set();
    const selectedName = normalizeEmployeeName(selectedLaborEmployeeView.full_name);
    return new Set(toObjectRows(records)
      .filter((record) => (
        record.labor_employee_id === selectedLaborEmployeeView.id
        || (selectedName && normalizeEmployeeName(record.employee_full_name) === selectedName)
      ))
      .map((record) => record.id)
      .filter(Boolean));
  }, [records, selectedLaborEmployeeView]);
  const selectedEmployeeTrainingEvents = useMemo(() => {
    if (selectedEmployeeTrainingRecordIds.size === 0) return [];
    return toObjectRows(allTrainingEvents).filter((event) => selectedEmployeeTrainingRecordIds.has(event.record_id));
  }, [allTrainingEvents, selectedEmployeeTrainingRecordIds]);
  const selectedEmployeeHistoryTimeline = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return buildEmployeeHistoryTimeline({
      historyEvents: selectedEmployeeHistoryEvents,
      notes: selectedEmployeeAllNotes,
      documents: selectedEmployeeDocuments,
      attendanceIncidents: toObjectRows(laborAttendanceIncidents).filter((incident) => incident.labor_employee_id === selectedLaborEmployeeView.id),
      trainingEvents: selectedEmployeeTrainingEvents,
      trainingRecordMap: recordMap,
      trainingItemMap,
    });
  }, [
    laborAttendanceIncidents,
    recordMap,
    selectedEmployeeAllNotes,
    selectedEmployeeDocuments,
    selectedEmployeeHistoryEvents,
    selectedEmployeeTrainingEvents,
    selectedLaborEmployeeView,
    trainingItemMap,
  ]);
  const selectedReviewInstance = useMemo(() => {
    if (!selectedReviewInstanceId) return null;
    return toObjectRows(reviewInstances).find((instance) => instance.id === selectedReviewInstanceId) || null;
  }, [reviewInstances, selectedReviewInstanceId]);
  const selectedReviewTemplateVersion = useMemo(() => {
    if (!selectedReviewInstance?.template_version_id) return null;
    return toObjectRows(allReviewTemplateVersions).find((version) => version.id === selectedReviewInstance.template_version_id) || null;
  }, [allReviewTemplateVersions, selectedReviewInstance]);
  const selectedReviewTemplate = useMemo(() => {
    if (!selectedReviewInstance?.template_id) return null;
    return toObjectRows(reviewTemplates).find((template) => template.id === selectedReviewInstance.template_id) || null;
  }, [reviewTemplates, selectedReviewInstance]);
  const selectedReviewSections = useMemo(() => {
    if (!selectedReviewTemplateVersion?.id) return [];
    return toObjectRows(reviewSections)
      .filter((section) => section.template_version_id === selectedReviewTemplateVersion.id)
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((section) => ({
        ...section,
        items: reviewItems
          .filter((item) => isObjectRow(item) && item.review_section_id === section.id)
          .sort((a, b) => a.sequence_order - b.sequence_order),
      }));
  }, [reviewItems, reviewSections, selectedReviewTemplateVersion]);
  const selectedReviewResponses = useMemo(() => {
    if (!selectedReviewInstance?.id) return [];
    return toObjectRows(reviewResponses).filter((response) => response.review_instance_id === selectedReviewInstance.id);
  }, [reviewResponses, selectedReviewInstance]);
  const selectedReviewResponseByItemId = useMemo(() => {
    return new Map(selectedReviewResponses.map((response) => [response.review_item_id, response]));
  }, [selectedReviewResponses]);
  const unsavedReviewItems = useMemo(() => {
    return selectedReviewSections.flatMap((section) => (
      section.items
        .filter((item) => isReviewItemDraftDirty(selectedReviewResponseByItemId.get(item.id), reviewDrafts[item.id] || {}))
        .map((item) => ({ section, item }))
    ));
  }, [reviewDrafts, selectedReviewResponseByItemId, selectedReviewSections]);
  const unsavedReviewResponseCount = unsavedReviewItems.length;

  useEffect(() => {
    if (!selectedReviewInstance?.id) return;
    setReviewPdfDraft(buildPerformanceReviewDraftFromInstance(selectedReviewInstance, selectedReviewResponses));
  }, [selectedReviewInstance, selectedReviewResponses]);

  useEffect(() => () => {
    if (reviewPdfObjectUrlRef.current) URL.revokeObjectURL(reviewPdfObjectUrlRef.current);
  }, []);

  const recordSections = useMemo(() => {
    if (!selectedRecord) return [];
    return toObjectRows(sections).filter((section) => section.template_version_id === selectedRecord.template_version_id && !section.parent_section_id).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [selectedRecord, sections]);

  const getChildSections = useCallback((parentId) => {
    return toObjectRows(sections).filter((section) => section.parent_section_id === parentId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [sections]);

  const getSectionItems = useCallback((sectionId) => {
    return toObjectRows(items).filter((item) => item.template_section_id === sectionId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [items]);

  const getItemResult = useCallback((itemId) => {
    return toObjectRows(itemResults).find((result) => result.template_item_id === itemId) || null;
  }, [itemResults]);

  const getItemById = useCallback((itemId) => toObjectRows(items).find((item) => item.id === itemId) || null, [items]);
  const getSectionById = useCallback((sectionId) => toObjectRows(sections).find((section) => section.id === sectionId) || null, [sections]);
  const getItemNotes = useCallback((itemId) => groupedNotes.itemNotes[itemId] || [], [groupedNotes.itemNotes]);

  const laborEmployeeOptions = useMemo(() => {
    const suggestedRoster = toObjectRows(rosterSnapshot)
      .filter((row) => isLaborEmployeeActive(row) && Number(row.open_training_record_count || 0) === 0)
      .map((row) => toObjectRows(laborEmployees).find((employee) => employee.id === getLaborEmployeeRowId(row)))
      .filter(Boolean);
    const fallbackEmployees = toObjectRows(laborEmployees).filter((employee) => !suggestedRoster.some((entry) => entry.id === employee.id));
    return [...suggestedRoster, ...fallbackEmployees].map((employee) => ({
      value: employee.id,
      label: `${employee.full_name} (${formatLaborPositionTitle(employee.position_title) || "Employee"})`,
    }));
  }, [laborEmployees, rosterSnapshot]);

  const pctReadinessSections = useMemo(() => (
    Array.isArray(pctReadinessBoard?.sections) ? pctReadinessBoard.sections : []
  ), [pctReadinessBoard]);
  const pctReadinessRecords = useMemo(() => (
    Array.isArray(pctReadinessBoard?.records) ? pctReadinessBoard.records : []
  ), [pctReadinessBoard]);
  const pctReadinessCells = useMemo(() => (
    isObjectRow(pctReadinessBoard?.cells) ? pctReadinessBoard.cells : {}
  ), [pctReadinessBoard]);
  const buildPctReadinessEmployeeProfile = useCallback((record) => {
    if (!record) return null;
    const recordId = record.id;
    const categoryRows = pctReadinessSections.map((section) => {
      const sectionItems = toObjectRows(section.items);
      const cells = sectionItems.map((item) => pctReadinessCells[`${recordId}:${item.id}`]).filter(Boolean);
      const verifiedCount = cells.filter((cell) => ["verified", "waived"].includes(normalizePctReadinessStatus(cell.readiness_status))).length;
      const needsCoachingCount = cells.filter((cell) => normalizePctReadinessStatus(cell.readiness_status) === "needs_coaching").length;
      const total = sectionItems.length;
      return {
        id: section.id,
        title: section.title,
        verifiedCount,
        needsCoachingCount,
        total,
        percent: total > 0 ? Math.round((verifiedCount / total) * 100) : 0,
      };
    });
    const taskRows = pctReadinessSections.flatMap((section) => (
      toObjectRows(section.items).map((item) => {
        const cell = pctReadinessCells[`${recordId}:${item.id}`] || {};
        return {
          section,
          item,
          cell,
          status: normalizePctReadinessStatus(cell.readiness_status || cell.status),
        };
      })
    ));
    return {
      record,
      categoryRows,
      gaps: taskRows.filter((row) => !["verified", "waived"].includes(row.status)),
      coachingNotes: taskRows.filter((row) => row.status === "needs_coaching" || row.cell.latest_note),
      taskRows,
    };
  }, [pctReadinessCells, pctReadinessSections]);
  const selectedEmployeePctReadinessRecord = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return null;
    return pctReadinessRecords.find((record) => record.labor_employee_id === selectedLaborEmployeeView.id) || null;
  }, [pctReadinessRecords, selectedLaborEmployeeView]);
  const selectedEmployeePctReadinessProfile = useMemo(() => {
    return buildPctReadinessEmployeeProfile(selectedEmployeePctReadinessRecord);
  }, [buildPctReadinessEmployeeProfile, selectedEmployeePctReadinessRecord]);
  const pctReadinessEmployeeBoardRecord = useMemo(() => (
    selectedPctReadinessRecordId
      ? pctReadinessRecords.find((record) => record.id === selectedPctReadinessRecordId) || null
      : null
  ), [pctReadinessRecords, selectedPctReadinessRecordId]);
  const pctReadinessEmployeeBoardProfile = useMemo(() => (
    buildPctReadinessEmployeeProfile(pctReadinessEmployeeBoardRecord)
  ), [buildPctReadinessEmployeeProfile, pctReadinessEmployeeBoardRecord]);
  const pctReadinessAvailableEmployees = useMemo(() => (
    Array.isArray(pctReadinessBoard?.available_employees) ? pctReadinessBoard.available_employees : []
  ), [pctReadinessBoard]);
  const pctReadinessNewEmployeeOptions = useMemo(() => (
    buildPctReadinessEmployeeOptions({
      employees: pctReadinessAvailableEmployees,
      records: pctReadinessRecords,
      excludeExistingReadinessRecords: true,
    }).map((option) => ({
      ...option,
      label: `${option.label} (${formatLaborDate(option.employee?.start_date || option.employee?.first_shift_date) || "No start date"})`,
    }))
  ), [pctReadinessAvailableEmployees, pctReadinessRecords]);
  const selectedNewPctReadinessEmployee = useMemo(() => (
    pctReadinessAvailableEmployees.find((employee) => employee.id === newPctReadinessEmployeeId) || null
  ), [newPctReadinessEmployeeId, pctReadinessAvailableEmployees]);
  const pctReadinessEmployeeFilterOptions = useMemo(() => ([
    { value: "", label: "All employees" },
    ...pctReadinessRecords.map((record) => ({
      value: record.labor_employee_id || record.id,
      label: record.employee_full_name || "Employee",
    })),
  ]), [pctReadinessRecords]);
  const filteredPctReadinessRecords = useMemo(() => {
    return pctReadinessRecords.filter((record) => {
      if (pctReadinessFilters.employee && record.labor_employee_id !== pctReadinessFilters.employee) return false;
      return true;
    });
  }, [pctReadinessFilters.employee, pctReadinessRecords]);
  const filteredPctReadinessSections = useMemo(() => {
    const taskQuery = String(pctReadinessFilters.task || "").trim().toLowerCase();
    const visibleRecordIds = new Set(filteredPctReadinessRecords.map((record) => record.id));
    return pctReadinessSections
      .map((section) => {
        if (pctReadinessFilters.category && section.id !== pctReadinessFilters.category) {
          return { ...section, items: [] };
        }
        const sectionTitle = String(section.title || "");
        const sectionMatches = taskQuery && sectionTitle.toLowerCase().includes(taskQuery);
        const itemsForSection = toObjectRows(section.items).filter((item) => {
          const itemLabel = String(item.label || "");
          if (taskQuery && !sectionMatches && !itemLabel.toLowerCase().includes(taskQuery)) return false;
          if (pctReadinessFilters.showGapsOnly || pctReadinessFilters.showNeedsCoaching) {
            const matchingCells = Object.values(pctReadinessCells).filter((cell) => (
              cell?.template_item_id === item.id && visibleRecordIds.has(cell.record_id)
            ));
            if (pctReadinessFilters.showNeedsCoaching) {
              return matchingCells.some((cell) => normalizePctReadinessStatus(cell?.readiness_status) === "needs_coaching");
            }
            return matchingCells.some((cell) => !["verified", "waived"].includes(normalizePctReadinessStatus(cell?.readiness_status)));
          }
          return true;
        });
        return { ...section, items: itemsForSection };
      })
      .filter((section) => section.items.length > 0);
  }, [
    filteredPctReadinessRecords,
    pctReadinessCells,
    pctReadinessFilters.category,
    pctReadinessFilters.showGapsOnly,
    pctReadinessFilters.showNeedsCoaching,
    pctReadinessFilters.task,
    pctReadinessSections,
  ]);
  const pctReadinessGapHotspots = useMemo(() => (
    buildPctReadinessCategoryHotspots({
      sections: pctReadinessSections,
      records: pctReadinessRecords,
      cells: pctReadinessCells,
    })
  ), [pctReadinessCells, pctReadinessRecords, pctReadinessSections]);
  const pctReadinessTopHotspot = pctReadinessGapHotspots[0] || null;
  const pctReadinessFilterCount = [
    pctReadinessFilters.employee,
    pctReadinessFilters.task,
    pctReadinessFilters.category,
    pctReadinessFilters.showGapsOnly,
    pctReadinessFilters.showNeedsCoaching,
  ].filter(Boolean).length;
  const pctReadinessCategoryFilterOptions = useMemo(() => ([
    { value: "", label: "All categories" },
    ...pctReadinessSections.map((section) => ({ value: section.id, label: section.title || "Category" })),
  ]), [pctReadinessSections]);
  const pctReadinessImportReport = useMemo(() => (
    isObjectRow(pctReadinessBoard?.import_report) ? pctReadinessBoard.import_report : {}
  ), [pctReadinessBoard]);
  const trainingHistoryRows = useMemo(() => (
    toObjectRows(allTrainingEvents)
      .map((event) => {
        const record = recordMap[event.record_id] || {};
        const item = event.template_item_id ? getItemById(event.template_item_id) : null;
        const employee = laborEmployeeMap[record.labor_employee_id] || {};
        return {
          ...event,
          record,
          item,
          employeeName: employee.full_name || record.employee_full_name || "Unknown employee",
          summary: item?.label || record.template_name_snapshot || String(event.event_type || "Training event").replace(/_/g, " "),
        };
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  ), [allTrainingEvents, getItemById, laborEmployeeMap, recordMap]);

  // Template stats: section and item counts per template
  const templateStats = useMemo(() => {
    const stats = {};
    toObjectRows(templates).forEach((t) => {
      const v = toObjectRows(allTemplateVersions).find((tv) => tv.template_id === t.id && tv.is_current);
      if (!v) { stats[t.id] = { sectionCount: 0, itemCount: 0 }; return; }
      const tSections = toObjectRows(sections).filter((section) => section.template_version_id === v.id && !section.parent_section_id);
      const tItems = toObjectRows(items).filter((item) => item.template_version_id === v.id);
      stats[t.id] = { sectionCount: tSections.length, itemCount: tItems.length };
    });
    return stats;
  }, [allTemplateVersions, templates, sections, items]);

  const reviewTemplateStats = useMemo(() => {
    const stats = {};
    toObjectRows(reviewTemplates).forEach((template) => {
      const version = toObjectRows(allReviewTemplateVersions).find((row) => row.template_id === template.id && row.is_current);
      if (!version) {
        stats[template.id] = { sectionCount: 0, itemCount: 0 };
        return;
      }
      stats[template.id] = {
        sectionCount: toObjectRows(reviewSections).filter((section) => section.template_version_id === version.id).length,
        itemCount: toObjectRows(reviewItems).filter((item) => item.template_version_id === version.id).length,
      };
    });
    return stats;
  }, [allReviewTemplateVersions, reviewItems, reviewSections, reviewTemplates]);

  const combinedTemplateRows = useMemo(() => {
    const trainingRows = toObjectRows(templates).map((template) => ({
      id: template.id,
      kind: "training",
      slug: template.slug,
      name: template.name,
      role_scopes: Array.isArray(template.role_scopes) ? template.role_scopes : [],
      template_class: template.template_class,
      is_active: template.is_active !== false,
      version: toObjectRows(allTemplateVersions).find((version) => version.template_id === template.id && version.is_current) || null,
      stats: templateStats[template.id] || { sectionCount: 0, itemCount: 0 },
    }));
    const reviewRows = toObjectRows(reviewTemplates).map((template) => ({
      id: template.id,
      kind: "review",
      slug: template.slug,
      name: template.name,
      role_scopes: Array.isArray(template.role_scopes) ? template.role_scopes : [],
      template_class: "performance_review",
      is_active: template.is_active !== false,
      version: toObjectRows(allReviewTemplateVersions).find((version) => version.template_id === template.id && version.is_current) || null,
      stats: reviewTemplateStats[template.id] || { sectionCount: 0, itemCount: 0 },
    }));
    return [...trainingRows, ...reviewRows];
  }, [allReviewTemplateVersions, allTemplateVersions, reviewTemplateStats, reviewTemplates, templateStats, templates]);
  const visibleTemplateRows = useMemo(() => {
    return combinedTemplateRows.filter((row) => {
      if (templateStatusFilter === "all") return true;
      if (templateStatusFilter === "inactive") return row.is_active === false;
      return row.is_active !== false;
    });
  }, [combinedTemplateRows, templateStatusFilter]);
  const templateGroups = useMemo(() => ([
    {
      key: "onboarding",
      label: "Onboarding & Training",
      rows: visibleTemplateRows.filter((row) =>
        row.kind === "training" && ["training_plan", "competency_guide", "master_dependency_checklist"].includes(row.template_class)
      ),
    },
    {
      key: "certifications",
      label: "Certifications",
      rows: visibleTemplateRows.filter((row) =>
        row.kind === "training" && !["training_plan", "competency_guide", "master_dependency_checklist"].includes(row.template_class)
      ),
    },
    {
      key: "reviews",
      label: "30/60/90 Reviews",
      rows: visibleTemplateRows.filter((row) => row.kind === "review"),
    },
  ]), [visibleTemplateRows]);

  // Template preview data
  const previewTemplateVersionHistory = useMemo(() => {
    if (!previewTemplateId) return [];
    const versionSource = previewTemplateKind === "review" ? toObjectRows(allReviewTemplateVersions) : toObjectRows(allTemplateVersions);
    return versionSource
      .filter((version) => version.template_id === previewTemplateId)
      .sort((a, b) => b.version_no - a.version_no);
  }, [allReviewTemplateVersions, allTemplateVersions, previewTemplateId, previewTemplateKind]);

  const previewTemplate = useMemo(() => {
    if (!previewTemplateId) return null;
    if (previewTemplateKind === "review") {
      const template = toObjectRows(reviewTemplates).find((row) => row.id === previewTemplateId);
      if (!template) return null;
      const version = previewTemplateVersionId
        ? toObjectRows(allReviewTemplateVersions).find((row) => row.id === previewTemplateVersionId && row.template_id === template.id)
        : toObjectRows(allReviewTemplateVersions).find((row) => row.template_id === template.id && row.is_current);
      if (!version) return { ...template, kind: "review", version: null, sections: [] };
      const sectionData = toObjectRows(reviewSections)
        .filter((section) => section.template_version_id === version.id)
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map((section) => ({
          ...section,
          items: reviewItems
            .filter((item) => isObjectRow(item) && item.review_section_id === section.id)
            .sort((a, b) => a.sequence_order - b.sequence_order),
        }));
      return { ...template, kind: "review", version, sections: sectionData };
    }

    const template = toObjectRows(templates).find((row) => row.id === previewTemplateId);
    if (!template) return null;
    const version = previewTemplateVersionId
      ? toObjectRows(allTemplateVersions).find((row) => row.id === previewTemplateVersionId && row.template_id === template.id)
      : toObjectRows(allTemplateVersions).find((row) => row.template_id === template.id && row.is_current);
    if (!version) return { ...template, kind: "training", version: null, sections: [] };
    const templateSections = toObjectRows(sections).filter((section) => section.template_version_id === version.id && !section.parent_section_id)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const sectionData = templateSections.map((section) => {
      const childSections = toObjectRows(sections).filter((row) => row.parent_section_id === section.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const directItems = toObjectRows(items).filter((item) => item.template_section_id === section.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const childData = childSections.map((childSection) => ({
        ...childSection,
        items: toObjectRows(items).filter((item) => item.template_section_id === childSection.id)
          .sort((a, b) => a.sequence_order - b.sequence_order),
      }));
      return { ...section, children: childData, directItems };
    });
    return { ...template, kind: "training", version, sections: sectionData };
  }, [allReviewTemplateVersions, allTemplateVersions, items, previewTemplateId, previewTemplateKind, previewTemplateVersionId, reviewItems, reviewSections, reviewTemplates, sections, templates]);
  const globalNotesFeed = useMemo(() => {
    const employeeNotesFeed = toObjectRows(laborEmployeeNotes)
      .filter((note) => !isLaborEmployeeNoteDeleted(note))
      .map((note) => {
      const employee = laborEmployeeMap[note.labor_employee_id];
      return {
        id: `employee_${note.id}`,
        entityId: note.id,
        employeeId: note.labor_employee_id,
        employeeName: employee?.full_name || "Unknown Employee",
        sourceModule: note.source_module || "labor",
        sourceLabel: "Employee Note",
        noteType: note.note_type || "general",
        createdAt: note.created_at,
        createdByName: note.created_by_name || "Staff",
        noteText: note.note_text,
        documents: toObjectRows(activeEmployeeDocumentsByNote[note.id] || []),
      };
    });
    const trainingNotesFeed = toObjectRows(allTrainingNotes).map((note) => {
      const record = recordMap[note.record_id];
      const employee = laborEmployeeMap[record?.labor_employee_id];
      const item = note.template_item_id ? getItemById(note.template_item_id) : null;
      const section = note.template_section_id ? getSectionById(note.template_section_id) : null;
      return {
        id: `training_${note.id}`,
        entityId: note.id,
        employeeId: record?.labor_employee_id || null,
        employeeName: employee?.full_name || record?.employee_full_name || "Unknown Employee",
        sourceModule: "training",
        sourceLabel: item?.label || section?.title || record?.template_name_snapshot || "Training Record",
        noteType: note.template_item_id ? "task_observation" : "record_note",
        createdAt: note.created_at,
        createdByName: note.created_by_name || note.initials || "Staff",
        noteText: note.note_text,
      };
    });
    return [...employeeNotesFeed, ...trainingNotesFeed]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [activeEmployeeDocumentsByNote, allTrainingNotes, getItemById, getSectionById, laborEmployeeMap, laborEmployeeNotes, recordMap]);
  const filteredGlobalNotes = useMemo(() => {
    const now = new Date();
    return globalNotesFeed.filter((note) => {
      if (!noteMatchesSearch(note, noteSearchText)) return false;
      if (noteFilterEmployeeId && note.employeeId !== noteFilterEmployeeId) return false;
      if (noteFilterSource !== "all" && note.sourceModule !== noteFilterSource) return false;
      if (noteFilterType !== "all" && note.noteType !== noteFilterType) return false;
      if (noteFilterDateRange !== "all") {
        const createdAt = note.createdAt ? new Date(note.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
        const diffDays = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
        if (noteFilterDateRange === "7d" && diffDays > 7) return false;
        if (noteFilterDateRange === "30d" && diffDays > 30) return false;
        if (noteFilterDateRange === "90d" && diffDays > 90) return false;
      }
      return true;
    });
  }, [globalNotesFeed, noteFilterDateRange, noteFilterEmployeeId, noteFilterSource, noteFilterType, noteSearchText]);

  // Role-filtered template options for new record
  const templateOptions = useMemo(() => {
    return activeTemplates
      .filter((t) => t.template_class === "training_plan")
      .map((t) => {
        const v = toObjectRows(templateVersions).find((tv) => tv.template_id === t.id);
        const stats = templateStats[t.id] || {};
        const roleScopes = Array.isArray(t.role_scopes) ? t.role_scopes : [];
        return { value: t.id, label: `${t.name} (${roleScopes.join(", ")})`, versionId: v?.id, roleScopes, stats };
      });
  }, [activeTemplates, templateVersions, templateStats]);

  const appendEmployeeNote = useCallback(async ({ laborEmployeeId, noteText, noteType }) => {
    return supabase.rpc("append_labor_employee_note", {
      p_labor_employee_id: laborEmployeeId,
      p_note_text: noteText.trim(),
      p_note_type: noteType,
      p_visibility_scope: "manager_only",
      p_source_module: "labor",
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
  }, [actorName, actorUserId]);

  const handleEmployeeNoteFileChange = useCallback((event) => {
    const { acceptedFiles, errors } = validateLaborEmployeeAttachmentFiles(event.target.files);
    setEmployeeNoteFiles(acceptedFiles);
    setEmployeeNoteFileErrors(errors);
    if (errors.length > 0) {
      addGlobalToast(errors[0], "error");
    }
  }, [addGlobalToast]);

  const handleRemoveEmployeeNoteFile = useCallback((fileIndex) => {
    setEmployeeNoteFiles((prev) => prev.filter((_, index) => index !== fileIndex));
    setEmployeeNoteFileErrors([]);
    if (employeeNoteFileInputRef.current) employeeNoteFileInputRef.current.value = "";
  }, []);

  const resetEmployeeNoteEditor = useCallback(() => {
    setEditingEmployeeNoteId(null);
    setEditingEmployeeNoteType("general");
    setEditingEmployeeNoteText("");
    setEditingEmployeeNoteFiles([]);
    setEditingEmployeeNoteFileErrors([]);
    if (editingEmployeeNoteFileInputRef.current) editingEmployeeNoteFileInputRef.current.value = "";
  }, []);

  const openEmployeeNoteEditor = useCallback((note) => {
    if (!note?.id || isLaborEmployeeNoteDeleted(note)) return;
    setEditingEmployeeNoteId(note.id);
    setEditingEmployeeNoteType(note.note_type || "general");
    setEditingEmployeeNoteText(note.note_text || "");
    setEditingEmployeeNoteFiles([]);
    setEditingEmployeeNoteFileErrors([]);
    if (editingEmployeeNoteFileInputRef.current) editingEmployeeNoteFileInputRef.current.value = "";
  }, []);

  const handleEditingEmployeeNoteFileChange = useCallback((event) => {
    const incomingFiles = Array.from(event.target.files || []);
    const remainingSlots = Math.max(
      0,
      LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES - editingEmployeeNoteDocuments.length - editingEmployeeNoteFiles.length
    );
    const { acceptedFiles, errors } = validateLaborEmployeeAttachmentFiles(incomingFiles);
    const nextErrors = [...errors];
    const filesToAdd = acceptedFiles.slice(0, remainingSlots);

    if (incomingFiles.length > remainingSlots) {
      nextErrors.push(`Each note can have up to ${LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES} active attachments.`);
    }

    setEditingEmployeeNoteFiles((prev) => [...prev, ...filesToAdd]);
    setEditingEmployeeNoteFileErrors(nextErrors);
    if (nextErrors.length > 0) addGlobalToast(nextErrors[0], "error");
    if (editingEmployeeNoteFileInputRef.current) editingEmployeeNoteFileInputRef.current.value = "";
  }, [addGlobalToast, editingEmployeeNoteDocuments.length, editingEmployeeNoteFiles.length]);

  const handleRemoveEditingEmployeeNoteFile = useCallback((fileIndex) => {
    setEditingEmployeeNoteFiles((prev) => prev.filter((_, index) => index !== fileIndex));
    setEditingEmployeeNoteFileErrors([]);
    if (editingEmployeeNoteFileInputRef.current) editingEmployeeNoteFileInputRef.current.value = "";
  }, []);

  const uploadEmployeeNoteAttachments = useCallback(async ({ laborEmployeeId, noteId, files }) => {
    const createdDocuments = [];
    for (const file of files) {
      const mimeType = inferLaborAttachmentMimeType(file);
      const storagePath = buildLaborEmployeeAttachmentPath({
        laborEmployeeId,
        noteId,
        fileName: file.name,
      });

      const { error: uploadError } = await supabase
        .storage
        .from(LABOR_EMPLOYEE_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: insertedDocument, error: documentError } = await supabase
        .from("labor_employee_documents")
        .insert({
          labor_employee_id: laborEmployeeId,
          labor_employee_note_id: noteId,
          document_type: "employee_note_attachment",
          file_name: file.name || "attachment",
          storage_bucket: LABOR_EMPLOYEE_ATTACHMENT_BUCKET,
          storage_path: storagePath,
          external_url: null,
          mime_type: mimeType,
          file_size_bytes: Number(file.size || 0),
          metadata: {
            source_module: "employee_notes",
            original_file_name: file.name || "attachment",
          },
          uploaded_by_user_id: actorUserId,
          uploaded_by_name: actorName,
        })
        .select("*")
        .single();

      if (documentError) throw documentError;
      if (insertedDocument) createdDocuments.push(insertedDocument);
    }
    return createdDocuments;
  }, [actorName, actorUserId]);

  const handlePreviewEmployeeDocument = useCallback(async (document) => {
    if (!document) return;
    const previewKind = getLaborAttachmentPreviewKind(document);
    if (previewKind === "unsupported") {
      addGlobalToast("This attachment type cannot be previewed in the app", "error");
      return;
    }

    setPreviewingAttachmentId(document.id);
    try {
      let previewUrl = document.external_url || "";
      if (document.storage_path) {
        const bucket = document.storage_bucket || LABOR_EMPLOYEE_ATTACHMENT_BUCKET;
        const { data: signed, error } = await supabase
          .storage
          .from(bucket)
          .createSignedUrl(document.storage_path, 300);
        if (error) throw error;
        previewUrl = signed?.signedUrl || "";
      }

      if (!previewUrl) {
        addGlobalToast("Attachment preview is unavailable", "error");
        return;
      }

      setAttachmentPreview({
        document,
        kind: previewKind,
        url: previewUrl,
      });
    } catch (error) {
      console.error("Employee attachment preview error:", error);
      addGlobalToast("Failed to open attachment preview", "error");
    } finally {
      setPreviewingAttachmentId(null);
    }
  }, [addGlobalToast]);

  const handleDeleteEmployeeDocument = useCallback(async (document) => {
    if (!document?.id || String(document.id).startsWith("requirement-url-")) return;
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Remove this attachment from the active employee record? The historical upload record will stay in the audit trail.");
    if (!confirmed) return;

    setDeletingAttachmentId(document.id);
    try {
      const { error } = await supabase
        .from("labor_employee_documents")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: actorUserId,
          deleted_by_name: actorName,
          delete_reason: "Removed from employee record",
        })
        .eq("id", document.id)
        .is("deleted_at", null);

      if (error) throw error;

      await refreshLaborData({ includeTraining: false, includeSupport: true });
      setAttachmentPreview((current) => (current?.document?.id === document.id ? null : current));
      setTrainingRequirementEditor((current) => (
        current?.evidenceDocument?.id === document.id
          ? { ...current, evidenceDocument: null, hasEvidence: false, isComplete: false, status: current.certification?.completed_on ? "needs_evidence" : current.status }
          : current
      ));
      addGlobalToast("Attachment removed from the active record; history was retained", "success");
    } catch (error) {
      console.error("Employee attachment delete error:", error);
      addGlobalToast("Failed to remove attachment", "error");
    } finally {
      setDeletingAttachmentId(null);
    }
  }, [actorName, actorUserId, addGlobalToast, refreshLaborData]);

  const handleDeleteEmployeeNote = useCallback(async (note) => {
    if (!note?.id || isLaborEmployeeNoteDeleted(note)) return false;
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Remove this note from the active employee record? The full note and its attachments will stay in History.");
    if (!confirmed) return false;

    setDeletingEmployeeNoteId(note.id);
    try {
      const { error } = await supabase
        .from("labor_employee_notes")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: actorUserId,
          deleted_by_name: actorName,
          delete_reason: "Removed from employee record",
        })
        .eq("id", note.id)
        .is("deleted_at", null);

      if (error) throw error;

      await refreshLaborData({ includeTraining: false, includeSupport: true });
      if (editingEmployeeNoteId === note.id) resetEmployeeNoteEditor();
      addGlobalToast("Note removed from active views; history was retained", "success");
      return true;
    } catch (error) {
      console.error("Employee note delete error:", error);
      addGlobalToast("Failed to remove employee note", "error");
      return false;
    } finally {
      setDeletingEmployeeNoteId(null);
    }
  }, [actorName, actorUserId, addGlobalToast, editingEmployeeNoteId, refreshLaborData, resetEmployeeNoteEditor]);

  const renderEmployeeDocumentButton = useCallback((document, options = {}) => {
    const documentId = document?.id || `${document?.file_name || "attachment"}-${document?.storage_path || document?.external_url || "preview"}`;
    const previewKind = getLaborAttachmentPreviewKind(document);
    const isPreviewable = previewKind !== "unsupported";
    const isSyntheticDocument = String(document?.id || "").startsWith("requirement-url-");
    const canDeleteDocument = Boolean(options.allowDelete && document?.id && !isSyntheticDocument && !isLaborEmployeeDocumentDeleted(document));
    return (
      <span
        key={documentId}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          maxWidth: "100%",
        }}
      >
        <button
          type="button"
          onClick={() => handlePreviewEmployeeDocument(document)}
          disabled={!isPreviewable || previewingAttachmentId === document.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            maxWidth: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: isPreviewable ? "#fff" : C.bg,
            color: isPreviewable ? C.text : C.textMut,
            cursor: isPreviewable ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            fontSize: 10.5,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <I.Eye />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{document.file_name || "Attachment"}</span>
          {document.file_size_bytes ? <span style={{ color: C.textMut, fontWeight: 600 }}>{formatLaborAttachmentFileSize(document.file_size_bytes)}</span> : null}
        </button>
        {canDeleteDocument && (
          <button
            type="button"
            title="Remove attachment"
            aria-label={`Remove ${document.file_name || "attachment"}`}
            onClick={(event) => {
              event.stopPropagation();
              handleDeleteEmployeeDocument(document);
            }}
            disabled={deletingAttachmentId === document.id}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: deletingAttachmentId === document.id ? C.bg : "#fff",
              color: C.dan,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: deletingAttachmentId === document.id ? "wait" : "pointer",
            }}
          >
            <I.Trash />
          </button>
        )}
      </span>
    );
  }, [deletingAttachmentId, handleDeleteEmployeeDocument, handlePreviewEmployeeDocument, previewingAttachmentId]);

  const openTrainingRequirementEditor = useCallback((requirementRow) => {
    if (!requirementRow) return;
    const certification = requirementRow.certification || {};
    setTrainingRequirementEditor(requirementRow);
    setTrainingRequirementCompletedOn(certification.completed_on || todayStr());
    setTrainingRequirementExpiresOn(certification.expires_on || "");
    setTrainingRequirementDocumentUrl(certification.external_document_url || "");
    setTrainingRequirementSourceNote(certification.source_note || "");
    setTrainingRequirementEvidenceFile(null);
    setTrainingRequirementEvidenceError("");
    if (trainingRequirementFileInputRef.current) trainingRequirementFileInputRef.current.value = "";
  }, []);

  const handleTrainingRequirementEvidenceFileChange = useCallback((event) => {
    const file = event.target.files?.[0] || null;
    const { acceptedFile, error } = validateLaborTrainingRequirementEvidenceFile(file);
    setTrainingRequirementEvidenceFile(acceptedFile);
    setTrainingRequirementEvidenceError(error);
    if (error) addGlobalToast(error, "error");
  }, [addGlobalToast]);

  const uploadTrainingRequirementEvidence = useCallback(async ({ laborEmployeeId, requirementRow, file }) => {
    const mimeType = inferLaborTrainingRequirementEvidenceMimeType(file);
    const storagePath = buildLaborEmployeeRequirementEvidencePath({
      laborEmployeeId,
      requirementSlug: requirementRow.slug,
      fileName: file.name,
    });

    const { error: uploadError } = await supabase
      .storage
      .from(LABOR_EMPLOYEE_ATTACHMENT_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: insertedDocument, error: documentError } = await supabase
      .from("labor_employee_documents")
      .insert({
        labor_employee_id: laborEmployeeId,
        document_type: "training_requirement_evidence",
        file_name: file.name || "training-evidence.pdf",
        storage_bucket: LABOR_EMPLOYEE_ATTACHMENT_BUCKET,
        storage_path: storagePath,
        external_url: null,
        mime_type: mimeType,
        file_size_bytes: Number(file.size || 0),
        metadata: {
          source_module: "training_requirements",
          requirement_slug: requirementRow.slug,
          requirement_id: requirementRow.requirementId,
          original_file_name: file.name || "training-evidence.pdf",
        },
        uploaded_by_user_id: actorUserId,
        uploaded_by_name: actorName,
      })
      .select("*")
      .single();

    if (documentError) throw documentError;
    return insertedDocument || null;
  }, [actorName, actorUserId]);

  const handleSaveTrainingRequirement = useCallback(async () => {
    const requirementRow = trainingRequirementEditor;
    if (!selectedLaborEmployeeView?.id || !requirementRow) return;
    if (!requirementRow.requirementId) {
      addGlobalToast("Training requirement setup needs the pending Supabase migration", "error");
      return;
    }
    if (!trainingRequirementCompletedOn) {
      addGlobalToast("Completion date is required", "error");
      return;
    }

    const existingDocumentId = requirementRow.certification?.labor_employee_document_id || requirementRow.evidenceDocument?.id || null;
    const hasEvidenceFile = Boolean(trainingRequirementEvidenceFile);
    const cprUrl = String(trainingRequirementDocumentUrl || "").trim();
    const allowsUrl = requirementRow.slug === LABOR_TRAINING_REQUIREMENT_SLUGS.CPR;
    const hasAcceptedEvidence = hasEvidenceFile || existingDocumentId || (allowsUrl && cprUrl);

    if (!hasAcceptedEvidence) {
      addGlobalToast(
        allowsUrl ? "Upload a CPR PDF or paste the certificate link" : "Upload a PDF before saving this requirement",
        "error"
      );
      return;
    }

    setSavingTrainingRequirement(true);
    try {
      let evidenceDocument = null;
      if (trainingRequirementEvidenceFile) {
        evidenceDocument = await uploadTrainingRequirementEvidence({
          laborEmployeeId: selectedLaborEmployeeView.id,
          requirementRow,
          file: trainingRequirementEvidenceFile,
        });
      }

      const documentId = evidenceDocument?.id || existingDocumentId || null;
      const resolvedExpiresOn = requirementRow.slug === LABOR_TRAINING_REQUIREMENT_SLUGS.CPR
        ? (trainingRequirementExpiresOn || addDaysToDateString(trainingRequirementCompletedOn, 365) || null)
        : null;
      const payload = {
        labor_employee_id: selectedLaborEmployeeView.id,
        requirement_id: requirementRow.requirementId,
        completed_on: trainingRequirementCompletedOn,
        expires_on: resolvedExpiresOn,
        labor_employee_document_id: documentId,
        external_document_url: allowsUrl ? (cprUrl || null) : null,
        source_note: trainingRequirementSourceNote.trim() || null,
        metadata: {
          ...(requirementRow.certification?.metadata || {}),
          requirement_slug: requirementRow.slug,
        },
        updated_by_user_id: actorUserId,
      };

      const response = requirementRow.certification?.id
        ? await supabase
            .from("employee_certifications")
            .update(payload)
            .eq("id", requirementRow.certification.id)
        : await supabase
            .from("employee_certifications")
            .insert({
              ...payload,
              created_by_user_id: actorUserId,
            });

      if (response.error) throw response.error;

      await refreshLaborData();
      setTrainingRequirementEditor(null);
      setTrainingRequirementEvidenceFile(null);
      setTrainingRequirementEvidenceError("");
      if (trainingRequirementFileInputRef.current) trainingRequirementFileInputRef.current.value = "";
      addGlobalToast(`${requirementRow.label} updated`, "success");
    } catch (error) {
      console.error("Training requirement save error:", error);
      addGlobalToast("Failed to save training requirement", "error");
    } finally {
      setSavingTrainingRequirement(false);
    }
  }, [
    actorUserId,
    addGlobalToast,
    refreshLaborData,
    selectedLaborEmployeeView,
    trainingRequirementCompletedOn,
    trainingRequirementDocumentUrl,
    trainingRequirementEditor,
    trainingRequirementEvidenceFile,
    trainingRequirementExpiresOn,
    trainingRequirementSourceNote,
    uploadTrainingRequirementEvidence,
  ]);

  // ── Create record ──
  const handleCreateRecord = useCallback(async () => {
    if (!newEmployeeName.trim() || !newTemplateId || !newTargetRole.trim()) {
      addGlobalToast("Please fill in required fields", "error");
      return;
    }
    setCreating(true);
    try {
      const { data: createdRecord, error } = await supabase.rpc(
        "create_training_record",
        buildCreateTrainingRecordRpcArgs({
          templateId: newTemplateId,
          locationRef: laborLocationRef,
          employeeFullName: newEmployeeName,
          targetRole: formatLaborPositionTitle(newTargetRole),
          hireDate: newHireDate,
          trainingStartDate: newStartDate,
          targetEndDate: newTargetEndDate,
          actorUserId,
          actorName,
          laborEmployeeId: newLaborEmployeeId,
        })
      );
      if (error) throw error;
      const record = Array.isArray(createdRecord) ? createdRecord[0] : createdRecord;
      if (!record?.id) throw new Error("Training record was not returned by the server");

      addGlobalToast(`Training record created for ${newEmployeeName.trim()}`, "success");
      setShowNewRecord(false);
      resetNewRecordForm();
      await refreshLaborData();
      setSelectedRecordId(record.id);
      changeLaborTab("training");
    } catch (err) {
      console.error("Create record error:", err);
      addGlobalToast("Failed to create record: " + (err.message || "Unknown error"), "error");
    }
    setCreating(false);
  }, [actorName, actorUserId, addGlobalToast, changeLaborTab, laborLocationRef, newEmployeeName, newHireDate, newLaborEmployeeId, newStartDate, newTargetEndDate, newTargetRole, newTemplateId, refreshLaborData]);

  const resetNewRecordForm = () => {
    setNewLaborEmployeeId("");
    setNewEmployeeName("");
    setNewTargetRole("");
    setNewTemplateId("");
    setNewHireDate("");
    setNewStartDate(todayStr());
    setNewTargetEndDate("");
  };

  // ── Toggle item completion ──
  const handleToggleItem = useCallback(async (itemId) => {
    const result = toObjectRows(itemResults).find((row) => row.template_item_id === itemId);
    if (!result) return;
    const newStatus = result.status === "complete" ? "not_started" : "complete";
    const { data, error } = await supabase.rpc("set_training_item_status", {
      p_record_id: selectedRecordId,
      p_template_item_id: itemId,
      p_status: newStatus,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });

    if (error || !data?.result || !data?.record) {
      addGlobalToast("Failed to update item", "error");
      return;
    }

    setItemResults(prev => prev.map(r => r.id === data.result.id ? data.result : r));
    setRecords(prev => prev.map(r => r.id === data.record.id ? data.record : r));
  }, [actorName, actorUserId, addGlobalToast, itemResults, selectedRecordId]);

  const reloadRecordNotesAndEvents = useCallback(async () => {
    if (!selectedRecordId) return;
    const [nRes, eRes] = await Promise.all([
      supabase.from("training_record_notes").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
      supabase.from("training_record_events").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
    ]);
    setNotes(nRes.data || []);
    setRecordEvents(eRes.data || []);
  }, [selectedRecordId]);

  const handleAddItemNote = useCallback(async (itemId) => {
    if (!selectedRecordId) return;
    const draft = (itemNoteDrafts[itemId] || "").trim();
    if (!draft) return;
    setSavingItemNoteId(itemId);
    const { error } = await supabase.rpc("append_training_item_note", {
      p_record_id: selectedRecordId,
      p_template_item_id: itemId,
      p_note_text: draft,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to add observation", "error");
      setSavingItemNoteId(null);
      return;
    }
    setItemNoteDrafts((prev) => ({ ...prev, [itemId]: "" }));
    await reloadRecordNotesAndEvents();
    setSavingItemNoteId(null);
    addGlobalToast("Observation added", "success");
  }, [actorName, actorUserId, addGlobalToast, itemNoteDrafts, reloadRecordNotesAndEvents, selectedRecordId]);

  const handleAddGeneralNote = useCallback(async () => {
    if (!selectedRecordId || !generalNoteText.trim()) return;
    setSavingGeneralNote(true);
    const { error } = await supabase.rpc("append_training_record_note", {
      p_record_id: selectedRecordId,
      p_note_text: generalNoteText.trim(),
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to add note", "error");
      setSavingGeneralNote(false);
      return;
    }
    setGeneralNoteText("");
    await reloadRecordNotesAndEvents();
    setSavingGeneralNote(false);
    addGlobalToast("Record note added", "success");
  }, [actorName, actorUserId, addGlobalToast, generalNoteText, reloadRecordNotesAndEvents, selectedRecordId]);

  const openRecordConfigModal = useCallback(() => {
    if (!selectedRecord) return;
    setConfigLaborEmployeeId(selectedRecord.labor_employee_id || "");
    setConfigEmployeeName(selectedRecord.employee_full_name || "");
    setConfigTargetRole(selectedRecord.target_role || "");
    setConfigHireDate(selectedRecord.hire_date || "");
    setConfigStartDate(selectedRecord.training_start_date || "");
    setConfigTargetEndDate(selectedRecord.target_end_date || "");
    setShowRecordConfig(true);
  }, [selectedRecord]);

  const handleSaveRecordConfig = useCallback(async () => {
    if (!selectedRecordId) return;
    setSavingConfig(true);
    const { data, error } = await supabase.rpc("update_training_record_config", buildUpdateTrainingRecordConfigArgs({
      recordId: selectedRecordId,
      laborEmployeeId: configLaborEmployeeId,
      employeeFullName: configEmployeeName,
      targetRole: formatLaborPositionTitle(configTargetRole),
      hireDate: configHireDate,
      trainingStartDate: configStartDate,
      targetEndDate: configTargetEndDate,
      actorUserId,
      actorName,
    }));
    if (error) {
      addGlobalToast("Failed to update trainee configuration", "error");
      setSavingConfig(false);
      return;
    }
    const updatedRecord = Array.isArray(data) ? data[0] : data;
    if (updatedRecord?.id) {
      setRecords((prev) => prev.map((record) => (record.id === updatedRecord.id ? updatedRecord : record)));
      setShowRecordConfig(false);
      await reloadRecordNotesAndEvents();
      addGlobalToast("Trainee configuration updated", "success");
    }
    setSavingConfig(false);
  }, [actorName, actorUserId, addGlobalToast, configEmployeeName, configHireDate, configLaborEmployeeId, configStartDate, configTargetEndDate, configTargetRole, reloadRecordNotesAndEvents, selectedRecordId]);

  const resetLaborEmployeeEditor = useCallback(() => {
    setEditingLaborEmployeeId(null);
    setLaborEmployeeName("");
    setLaborEmployeePhone("");
    setLaborEmployeeEmail("");
    setLaborEmployeeRole("");
    setLaborEmployeeCommitment("");
    setLaborEmployeeReviewTemplateRole("");
    setLaborEmployeeStartDate("");
    setLaborEmployeeEndDate("");
  }, []);

  const resetInlineLaborEmployeeComposer = useCallback(() => {
    setNewRosterEmployeeFirstName("");
    setNewRosterEmployeeLastName("");
    setNewRosterEmployeePhone("");
    setNewRosterEmployeeEmail("");
    setNewRosterEmployeeRole("");
    setNewRosterEmployeeCommitment("");
    setNewRosterEmployeeStartDate(todayStr());
  }, []);

  const closeInlineLaborEmployeeComposer = useCallback(({ immediate = false } = {}) => {
    setInlineLaborEmployeeComposerEntered(false);
    if (immediate) {
      setShowInlineLaborEmployeeComposer(false);
      resetInlineLaborEmployeeComposer();
      return;
    }
    window.setTimeout(() => {
      setShowInlineLaborEmployeeComposer(false);
      resetInlineLaborEmployeeComposer();
    }, INLINE_ROSTER_COMPOSER_TRANSITION_MS);
  }, [resetInlineLaborEmployeeComposer]);

  const openInlineLaborEmployeeComposer = useCallback(() => {
    if (!canEditRoster) {
      addGlobalToast?.("You do not have permission to edit the labor roster", "error");
      return;
    }
    setShowLaborEmployeeEditor(false);
    resetLaborEmployeeEditor();
    resetInlineLaborEmployeeComposer();
    setShowInlineLaborEmployeeComposer(true);
  }, [addGlobalToast, canEditRoster, resetInlineLaborEmployeeComposer, resetLaborEmployeeEditor]);

  const openLaborEmployeeEditor = useCallback((employee = null) => {
    if (!canEditRoster) {
      addGlobalToast?.("You do not have permission to edit the labor roster", "error");
      return;
    }
    if (!employee) {
      openInlineLaborEmployeeComposer();
      return;
    }

    closeInlineLaborEmployeeComposer({ immediate: true });
    setEditingLaborEmployeeId(employee.id);
    setLaborEmployeeName(employee.full_name || "");
    setLaborEmployeePhone(readLaborEmployeeContact(employee, "contact_phone"));
    setLaborEmployeeEmail(readLaborEmployeeContact(employee, "contact_email"));
    setLaborEmployeeRole(employee.position_title || "");
    setLaborEmployeeCommitment(readLaborEmploymentCommitment(employee) || "");
    setLaborEmployeeReviewTemplateRole(getPerformanceReviewTemplateOverrideKey(employee));
    setLaborEmployeeStartDate(employee.start_date || "");
    setLaborEmployeeEndDate(employee.end_date || "");
    setShowLaborEmployeeEditor(true);
  }, [addGlobalToast, canEditRoster, closeInlineLaborEmployeeComposer, openInlineLaborEmployeeComposer]);

  const persistLaborEmployeeContact = useCallback(async (employeeId, existingMetadata = {}, updates = {}) => {
    const nextMetadata = buildUpdatedLaborMetadata(existingMetadata, updates);
    const { error } = await supabase
      .from("labor_employees")
      .update({ metadata: nextMetadata, updated_by_user_id: actorUserId })
      .eq("id", employeeId);
    return { error };
  }, [actorUserId]);

  const persistLaborEmployeePerformanceReviewTemplate = useCallback(async (employeeId, existingMetadata = {}, roleKey = "") => {
    const nextMetadata = buildUpdatedLaborMetadata(existingMetadata, { performanceReviewTemplateRole: roleKey });
    const { error } = await supabase
      .from("labor_employees")
      .update({ metadata: nextMetadata, updated_by_user_id: actorUserId })
      .eq("id", employeeId);
    return { error, metadata: nextMetadata };
  }, [actorUserId]);

  useEffect(() => {
    if (!showInlineLaborEmployeeComposer) return undefined;

    setInlineLaborEmployeeComposerEntered(false);

    const frameId = window.requestAnimationFrame(() => {
      setInlineLaborEmployeeComposerEntered(true);
    });
    const focusTimer = window.setTimeout(() => {
      firstRosterNameInputRef.current?.focus();
      firstRosterNameInputRef.current?.select?.();
    }, 120);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(focusTimer);
    };
  }, [showInlineLaborEmployeeComposer]);

  useEffect(() => {
    if (!justCreatedLaborEmployeeId) return undefined;
    const timer = window.setTimeout(() => setJustCreatedLaborEmployeeId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [justCreatedLaborEmployeeId]);

  const handleSaveLaborEmployee = useCallback(async () => {
    if (!canEditRoster) {
      addGlobalToast("You do not have permission to edit the labor roster", "error");
      return;
    }
    if (!laborEmployeeName.trim() || !laborEmployeeRole.trim() || !laborEmployeeStartDate) {
      addGlobalToast("Employee name, position title, and start date are required", "error");
      return;
    }

    setSavingLaborEmployee(true);

    if (editingLaborEmployeeId) {
      const employeeBeforeUpdate = toObjectRows(laborEmployees).find((employee) => employee.id === editingLaborEmployeeId) || null;
      const { error } = await supabase.rpc("update_labor_employee", buildUpdateLaborEmployeeRpcArgs({
        employeeId: editingLaborEmployeeId,
        fullName: laborEmployeeName,
        positionTitle: formatLaborPositionTitle(laborEmployeeRole),
        startDate: laborEmployeeStartDate,
        endDate: laborEmployeeEndDate,
        employmentCommitment: laborEmployeeCommitment,
        actorUserId,
      }));
      if (error) {
        addGlobalToast("Failed to update employee: " + (error.message || "Unknown error"), "error");
        setSavingLaborEmployee(false);
        return;
      }
      const { error: contactError } = await persistLaborEmployeeContact(editingLaborEmployeeId, employeeBeforeUpdate?.metadata, {
        email: laborEmployeeEmail,
        phone: laborEmployeePhone,
        performanceReviewTemplateRole: laborEmployeeReviewTemplateRole,
      });
      if (contactError) {
        addGlobalToast("Employee updated, but contact info did not save", "error");
        setSavingLaborEmployee(false);
        return;
      }
      addGlobalToast("Employee updated", "success");
    } else {
      const { data, error } = await supabase.rpc("create_labor_employee", buildCreateLaborEmployeeRpcArgs({
        locationRef: laborLocationRef,
        fullName: laborEmployeeName,
        positionTitle: formatLaborPositionTitle(laborEmployeeRole),
        startDate: laborEmployeeStartDate,
        endDate: laborEmployeeEndDate,
        employmentCommitment: laborEmployeeCommitment,
        actorUserId,
        actorName,
      }));
      if (error) {
        addGlobalToast("Failed to create employee: " + (error.message || "Unknown error"), "error");
        setSavingLaborEmployee(false);
        return;
      }
      const createdEmployee = Array.isArray(data) ? data[0] : data;
      if (createdEmployee?.id) {
        const { error: contactError } = await persistLaborEmployeeContact(createdEmployee.id, createdEmployee.metadata, {
          email: laborEmployeeEmail,
          phone: laborEmployeePhone,
          performanceReviewTemplateRole: laborEmployeeReviewTemplateRole,
        });
        if (contactError) {
          addGlobalToast("Employee added, but contact info did not save", "error");
          setSavingLaborEmployee(false);
          return;
        }
      }
      addGlobalToast("Employee added to labor roster", "success");
    }

    await refreshLaborData();
    setSavingLaborEmployee(false);
    setShowLaborEmployeeEditor(false);
    resetLaborEmployeeEditor();
  }, [actorName, actorUserId, addGlobalToast, canEditRoster, editingLaborEmployeeId, laborEmployeeCommitment, laborEmployeeEmail, laborEmployeeEndDate, laborEmployeeName, laborEmployeePhone, laborEmployeeReviewTemplateRole, laborEmployeeRole, laborEmployeeStartDate, laborEmployees, laborLocationRef, persistLaborEmployeeContact, resetLaborEmployeeEditor, refreshLaborData]);

  const handleCreateLaborEmployeeInline = useCallback(async () => {
    if (!canEditRoster) {
      addGlobalToast("You do not have permission to edit the labor roster", "error");
      return;
    }
    const fullName = `${newRosterEmployeeFirstName} ${newRosterEmployeeLastName}`.replace(/\s+/g, " ").trim();
    if (!newRosterEmployeeFirstName.trim() || !newRosterEmployeeLastName.trim() || !newRosterEmployeeRole.trim() || !newRosterEmployeeStartDate) {
      addGlobalToast("First name, last name, position title, and start date are required", "error");
      return;
    }

    setSavingInlineLaborEmployee(true);

    const { data, error } = await supabase.rpc("create_labor_employee", buildCreateLaborEmployeeRpcArgs({
      locationRef: laborLocationRef,
      fullName,
      positionTitle: formatLaborPositionTitle(newRosterEmployeeRole),
      startDate: newRosterEmployeeStartDate,
      endDate: null,
      employmentCommitment: newRosterEmployeeCommitment,
      actorUserId,
      actorName,
    }));

    if (error) {
      addGlobalToast("Failed to create employee: " + (error.message || "Unknown error"), "error");
      setSavingInlineLaborEmployee(false);
      return;
    }

    const createdEmployee = Array.isArray(data) ? data[0] : data;
    if (createdEmployee?.id) {
      const { error: contactError } = await persistLaborEmployeeContact(createdEmployee.id, createdEmployee.metadata, {
        email: newRosterEmployeeEmail,
        phone: newRosterEmployeePhone,
      });
      if (contactError) {
        addGlobalToast("Employee added, but contact info did not save", "error");
        setSavingInlineLaborEmployee(false);
        return;
      }
    }
    await refreshLaborData();
    setSavingInlineLaborEmployee(false);
    setJustCreatedLaborEmployeeId(createdEmployee?.id || null);
    closeInlineLaborEmployeeComposer();
    addGlobalToast("Employee added to labor roster", "success");
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    canEditRoster,
    closeInlineLaborEmployeeComposer,
    laborLocationRef,
    refreshLaborData,
    newRosterEmployeeEmail,
    newRosterEmployeeFirstName,
    newRosterEmployeeCommitment,
    newRosterEmployeeLastName,
    newRosterEmployeePhone,
    newRosterEmployeeRole,
    newRosterEmployeeStartDate,
    persistLaborEmployeeContact,
  ]);

  const openTemplatePreview = useCallback((templateId, versionId = null, kind = "training") => {
    setPreviewTemplateKind(kind);
    setPreviewTemplateId(templateId);
    setPreviewTemplateVersionId(versionId);
    setExpandedSections({});
    setTemplateManageStructure(false);
  }, []);

  const handleCreateTemplateDraft = useCallback(async () => {
    if (!previewTemplateId) return;
    setSavingTemplateAction("draft");
    const sourceVersionId = previewTemplate?.version?.id || null;
    const rpcName = previewTemplateKind === "review" ? "create_review_template_draft" : "create_training_template_draft";
    const { data, error } = await supabase.rpc(rpcName, {
      p_template_id: previewTemplateId,
      p_from_version_id: sourceVersionId,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
      p_changelog: sourceVersionId ? `Draft cloned from version ${previewTemplate.version.version_no}` : "New draft",
    });
    if (error) {
      addGlobalToast("Failed to create template draft", "error");
      setSavingTemplateAction("");
      return;
    }
    const draftVersion = Array.isArray(data) ? data[0] : data;
    await refreshTemplateBundle();
    if (draftVersion?.id) {
      setPreviewTemplateVersionId(draftVersion.id);
    }
    addGlobalToast("Template draft created", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle]);

  const resetCreateTemplateModal = useCallback(() => {
    setShowCreateTemplateModal(false);
    setCreateTemplateKind("training");
    setCreateTemplateName("");
    setCreateTemplateClass("training_plan");
    setCreateTemplateRoleScopesText("");
    setCreatingTemplate(false);
  }, []);

  const handleCreateTemplateShell = useCallback(async () => {
    const nextName = String(createTemplateName || "").trim();
    if (!nextName) {
      addGlobalToast("Template name is required", "error");
      return;
    }

    const requestedSlug = slugifyTemplateName(nextName);
    if (!requestedSlug) {
      addGlobalToast("Template name must contain letters or numbers", "error");
      return;
    }

    const scopeList = Array.from(new Set(
      String(createTemplateRoleScopesText || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    ));
    const existingSlugs = new Set(
      toObjectRows(createTemplateKind === "review" ? reviewTemplates : templates)
        .map((template) => String(template.slug || "").trim())
        .filter(Boolean)
    );
    const nextSlug = existingSlugs.has(requestedSlug)
      ? `${requestedSlug}_${String(Date.now()).slice(-6)}`
      : requestedSlug;

    setCreatingTemplate(true);
    const isReview = createTemplateKind === "review";
    const tableName = isReview ? "review_templates" : "training_templates";
    const rpcName = isReview ? "create_review_template_draft" : "create_training_template_draft";
    const insertPayload = isReview
      ? {
          slug: nextSlug,
          name: nextName,
          role_scopes: scopeList,
          location_id: laborLocationRef || null,
          is_active: true,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        }
      : {
          slug: nextSlug,
          name: nextName,
          template_class: createTemplateClass,
          role_scopes: scopeList,
          location_id: laborLocationRef || null,
          is_active: true,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        };

    const { data: insertedTemplate, error: insertError } = await supabase
      .from(tableName)
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !insertedTemplate?.id) {
      addGlobalToast(insertError?.message || "Failed to create template shell", "error");
      setCreatingTemplate(false);
      return;
    }

    const { data: draftData, error: draftError } = await supabase.rpc(rpcName, {
      p_template_id: insertedTemplate.id,
      p_from_version_id: null,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
      p_changelog: "Initial draft",
    });

    if (draftError) {
      addGlobalToast(draftError.message || "Failed to create template draft", "error");
      setCreatingTemplate(false);
      return;
    }

    const createdDraft = Array.isArray(draftData) ? draftData[0] : draftData;
    await refreshTemplateBundle();
    setPreviewTemplateKind(isReview ? "review" : "training");
    setPreviewTemplateId(insertedTemplate.id);
    setPreviewTemplateVersionId(createdDraft?.id || null);
    setExpandedSections({});
    resetCreateTemplateModal();
    addGlobalToast("Template created", "success");
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    createTemplateClass,
    createTemplateKind,
    createTemplateName,
    createTemplateRoleScopesText,
    laborLocationRef,
    refreshTemplateBundle,
    resetCreateTemplateModal,
    reviewTemplates,
    templates,
  ]);

  const handlePublishTemplateVersion = useCallback(async () => {
    if (!previewTemplate?.version?.id) return;
    setSavingTemplateAction("publish");
    const rpcName = previewTemplateKind === "review" ? "publish_review_template_version" : "publish_training_template_version";
    const { data, error } = await supabase.rpc(rpcName, {
      p_template_version_id: previewTemplate.version.id,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
      p_changelog: previewTemplate.version.changelog || null,
    });
    if (error) {
      addGlobalToast("Failed to publish template version", "error");
      setSavingTemplateAction("");
      return;
    }
    const publishedVersion = Array.isArray(data) ? data[0] : data;
    await refreshTemplateBundle();
    if (publishedVersion?.id) {
      setPreviewTemplateVersionId(publishedVersion.id);
    }
    addGlobalToast("Template version published", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, previewTemplate, previewTemplateKind, refreshTemplateBundle]);

  const handleRestoreTemplateVersion = useCallback(async () => {
    if (!previewTemplateId || !previewTemplate?.version?.id) return;
    setSavingTemplateAction("restore");
    const rpcName = previewTemplateKind === "review" ? "restore_review_template_version" : "restore_training_template_version";
    const { data, error } = await supabase.rpc(rpcName, {
      p_template_id: previewTemplateId,
      p_restore_version_id: previewTemplate.version.id,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to restore template version", "error");
      setSavingTemplateAction("");
      return;
    }
    const restoredVersion = Array.isArray(data) ? data[0] : data;
    await refreshTemplateBundle();
    if (restoredVersion?.id) {
      setPreviewTemplateVersionId(restoredVersion.id);
    }
    addGlobalToast("Historical version restored into a new draft", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle]);

  const handleUpdateTemplateName = useCallback(async (value) => {
    if (!previewTemplateId) return;
    const nextName = String(value || "").trim();
    if (!nextName) return;
    const templateSource = previewTemplateKind === "review" ? reviewTemplates : templates;
    const tableName = previewTemplateKind === "review" ? "review_templates" : "training_templates";
    const currentTemplate = toObjectRows(templateSource).find((template) => template.id === previewTemplateId);
    if (!currentTemplate || currentTemplate.name === nextName) return;
    const { error } = await supabase
      .from(tableName)
      .update({
        name: nextName,
        updated_by_user_id: actorUserId,
      })
      .eq("id", previewTemplateId);
    if (error) {
      addGlobalToast("Failed to update template name", "error");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast("Template name updated", "success");
  }, [actorUserId, addGlobalToast, previewTemplateId, previewTemplateKind, reviewTemplates, templates, refreshTemplateBundle]);

  const handleUpdateTemplateSection = useCallback(async (sectionId, patch) => {
    const tableName = previewTemplateKind === "review" ? "review_sections" : "training_template_sections";
    const { error } = await supabase
      .from(tableName)
      .update(patch)
      .eq("id", sectionId);
    if (error) {
      addGlobalToast("Failed to update section", "error");
      return false;
    }
    await refreshTemplateBundle();
    return true;
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle]);

  const handleUpdateTemplateItem = useCallback(async (itemId, patch) => {
    const tableName = previewTemplateKind === "review" ? "review_items" : "training_template_items";
    const { error } = await supabase
      .from(tableName)
      .update(patch)
      .eq("id", itemId);
    if (error) {
      addGlobalToast(`Failed to update ${previewTemplateKind === "review" ? "review item" : "task"}`, "error");
      return false;
    }
    await refreshTemplateBundle();
    return true;
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle]);

  const handleAddTemplateSection = useCallback(async (parentSectionId = null) => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    const sectionSource = previewTemplateKind === "review" ? toObjectRows(reviewSections) : toObjectRows(sections);
    const siblingSections = sectionSource
      .filter((section) =>
        section.template_version_id === previewTemplate.version.id &&
        (previewTemplateKind === "review" || (section.parent_section_id || null) === (parentSectionId || null))
      )
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const nextOrder = (siblingSections[siblingSections.length - 1]?.sequence_order || 0) + 10;
    const insertPayload = previewTemplateKind === "review"
      ? {
          template_version_id: previewTemplate.version.id,
          section_key: `draft_review_section_${Date.now()}`,
          title: "New Review Section",
          sequence_order: nextOrder,
          instructions: null,
          metadata: {},
        }
      : {
          template_version_id: previewTemplate.version.id,
          parent_section_id: parentSectionId,
          section_key: `draft_section_${Date.now()}`,
          title: parentSectionId ? "New Module" : "New Section",
          section_type: parentSectionId ? "module" : "phase",
          sequence_order: nextOrder,
          instructions: null,
          completion_mode: "complete_only",
        };
    const { error } = await supabase
      .from(previewTemplateKind === "review" ? "review_sections" : "training_template_sections")
      .insert(insertPayload);
    if (error) {
      addGlobalToast("Failed to add section", "error");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast(previewTemplateKind === "review" ? "Review section added" : parentSectionId ? "Module added" : "Section added", "success");
  }, [addGlobalToast, previewTemplate, previewTemplateKind, reviewSections, sections, refreshTemplateBundle]);

  const handleAddTemplateItem = useCallback(async (sectionId) => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    const itemSource = previewTemplateKind === "review" ? toObjectRows(reviewItems) : toObjectRows(items);
    const sectionItems = itemSource
      .filter((item) => (previewTemplateKind === "review" ? item.review_section_id === sectionId : item.template_section_id === sectionId))
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const nextOrder = (sectionItems[sectionItems.length - 1]?.sequence_order || 0) + 10;
    const insertPayload = previewTemplateKind === "review"
      ? {
          template_version_id: previewTemplate.version.id,
          review_section_id: sectionId,
          item_key: `draft_review_item_${Date.now()}`,
          prompt: "New Review Prompt",
          item_type: "long_text",
          sequence_order: nextOrder,
          options: null,
          metadata: {},
        }
      : {
          template_version_id: previewTemplate.version.id,
          template_section_id: sectionId,
          item_key: `draft_item_${Date.now()}`,
          label: "New Task",
          item_type: "task",
          sequence_order: nextOrder,
          required: true,
          completion_mode: "complete_only",
        };
    const { error } = await supabase
      .from(previewTemplateKind === "review" ? "review_items" : "training_template_items")
      .insert(insertPayload);
    if (error) {
      addGlobalToast(`Failed to add ${previewTemplateKind === "review" ? "review item" : "task"}`, "error");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast(previewTemplateKind === "review" ? "Review item added" : "Task added", "success");
  }, [addGlobalToast, items, previewTemplate, previewTemplateKind, reviewItems, refreshTemplateBundle]);

  const handleDeleteTemplateItem = useCallback(async (itemId) => {
    const { error } = await supabase
      .from(previewTemplateKind === "review" ? "review_items" : "training_template_items")
      .delete()
      .eq("id", itemId);
    if (error) {
      addGlobalToast(`Failed to delete ${previewTemplateKind === "review" ? "review item" : "task"}`, "error");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast(previewTemplateKind === "review" ? "Review item deleted" : "Task deleted", "success");
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle]);

  const handleDeleteTemplateSection = useCallback(async (sectionId) => {
    if (previewTemplateKind === "review") {
      const sectionItems = toObjectRows(reviewItems).filter((item) => item.review_section_id === sectionId);
      if (sectionItems.length > 0) {
        const { error: deleteItemsError } = await supabase
          .from("review_items")
          .delete()
          .in("id", sectionItems.map((item) => item.id));
        if (deleteItemsError) {
          addGlobalToast("Failed to delete review items", "error");
          return;
        }
      }
      const { error } = await supabase
        .from("review_sections")
        .delete()
        .eq("id", sectionId);
      if (error) {
        addGlobalToast("Failed to delete review section", "error");
        return;
      }
      await refreshTemplateBundle();
      addGlobalToast("Review section deleted", "success");
      return;
    }

    const childSections = toObjectRows(sections).filter((section) => section.parent_section_id === sectionId);
    for (const child of childSections) {
      const childItems = toObjectRows(items).filter((item) => item.template_section_id === child.id);
      if (childItems.length > 0) {
        const { error: deleteChildItemsError } = await supabase
          .from("training_template_items")
          .delete()
          .in("id", childItems.map((item) => item.id));
        if (deleteChildItemsError) {
          addGlobalToast("Failed to delete child tasks", "error");
          return;
        }
      }
      const { error: deleteChildSectionError } = await supabase
        .from("training_template_sections")
        .delete()
        .eq("id", child.id);
      if (deleteChildSectionError) {
        addGlobalToast("Failed to delete child section", "error");
        return;
      }
    }

    const directItems = toObjectRows(items).filter((item) => item.template_section_id === sectionId);
    if (directItems.length > 0) {
      const { error: deleteItemsError } = await supabase
        .from("training_template_items")
        .delete()
        .in("id", directItems.map((item) => item.id));
      if (deleteItemsError) {
        addGlobalToast("Failed to delete section tasks", "error");
        return;
      }
    }

    const { error } = await supabase
      .from("training_template_sections")
      .delete()
      .eq("id", sectionId);
    if (error) {
      addGlobalToast("Failed to delete section", "error");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast("Section deleted", "success");
  }, [addGlobalToast, items, previewTemplateKind, reviewItems, sections, refreshTemplateBundle]);

  const handleToggleTemplateActive = useCallback(async () => {
    if (!previewTemplateId || !previewTemplate) return;
    const tableName = previewTemplateKind === "review" ? "review_templates" : "training_templates";
    const nextActive = previewTemplate.is_active === false;
    setSavingTemplateAction(nextActive ? "activate" : "deactivate");
    const { error } = await supabase
      .from(tableName)
      .update({ is_active: nextActive, updated_by_user_id: actorUserId })
      .eq("id", previewTemplateId);
    if (error) {
      addGlobalToast(nextActive ? "Failed to mark template active" : "Failed to mark template inactive", "error");
      setSavingTemplateAction("");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast(nextActive ? "Template marked active" : "Template marked inactive", "success");
    setSavingTemplateAction("");
  }, [actorUserId, addGlobalToast, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle]);

  const handleDeleteTemplateDraft = useCallback(async () => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    if (!window.confirm("Delete this draft version? Published versions will not be changed.")) return;
    setSavingTemplateAction("delete-draft");
    const versionId = previewTemplate.version.id;
    const versionSource = previewTemplateKind === "review" ? toObjectRows(allReviewTemplateVersions) : toObjectRows(allTemplateVersions);
    const currentVersion = toObjectRows(versionSource).find((version) => version.template_id === previewTemplateId && version.is_current && version.id !== versionId) || null;

    if (previewTemplateKind === "review") {
      const draftSections = toObjectRows(reviewSections).filter((section) => section.template_version_id === versionId);
      const draftItems = toObjectRows(reviewItems).filter((item) => item.template_version_id === versionId);
      if (draftItems.length > 0) {
        const { error } = await supabase.from("review_items").delete().in("id", draftItems.map((item) => item.id));
        if (error) {
          addGlobalToast("Failed to delete draft prompts", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      if (draftSections.length > 0) {
        const { error } = await supabase.from("review_sections").delete().in("id", draftSections.map((section) => section.id));
        if (error) {
          addGlobalToast("Failed to delete draft sections", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      const { error } = await supabase.from("review_template_versions").delete().eq("id", versionId);
      if (error) {
        addGlobalToast("Failed to delete draft", "error");
        setSavingTemplateAction("");
        return;
      }
    } else {
      const draftItems = toObjectRows(items).filter((item) => item.template_version_id === versionId);
      const draftSections = toObjectRows(sections).filter((section) => section.template_version_id === versionId);
      if (draftItems.length > 0) {
        const { error } = await supabase.from("training_template_items").delete().in("id", draftItems.map((item) => item.id));
        if (error) {
          addGlobalToast("Failed to delete draft tasks", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      if (draftSections.length > 0) {
        const { error } = await supabase.from("training_template_sections").delete().in("id", draftSections.map((section) => section.id));
        if (error) {
          addGlobalToast("Failed to delete draft sections", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      const { error } = await supabase.from("training_template_versions").delete().eq("id", versionId);
      if (error) {
        addGlobalToast("Failed to delete draft", "error");
        setSavingTemplateAction("");
        return;
      }
    }

    setPreviewTemplateVersionId(currentVersion?.id || null);
    await refreshTemplateBundle();
    addGlobalToast("Draft deleted", "success");
    setSavingTemplateAction("");
  }, [addGlobalToast, allReviewTemplateVersions, allTemplateVersions, items, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle, reviewItems, reviewSections, sections]);

  const resequenceRows = useCallback(async (tableName, rows) => {
    const updates = rows.map((row, index) => supabase
      .from(tableName)
      .update({ sequence_order: (index + 1) * 10 })
      .eq("id", row.id));
    const results = await Promise.all(updates);
    return results.find((result) => result.error)?.error || null;
  }, []);

  const handleMoveTemplateSection = useCallback(async (sectionId, direction) => {
    const tableName = previewTemplateKind === "review" ? "review_sections" : "training_template_sections";
    const source = previewTemplateKind === "review" ? toObjectRows(reviewSections) : toObjectRows(sections);
    const section = toObjectRows(source).find((row) => row.id === sectionId);
    if (!section) return;
    const siblings = toObjectRows(source)
      .filter((row) =>
        row.template_version_id === section.template_version_id &&
        (previewTemplateKind === "review" || (row.parent_section_id || null) === (section.parent_section_id || null))
      )
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const currentIndex = siblings.findIndex((row) => row.id === sectionId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const error = await resequenceRows(tableName, reordered);
    if (error) {
      addGlobalToast("Failed to reorder section", "error");
      return;
    }
    await refreshTemplateBundle();
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle, resequenceRows, reviewSections, sections]);

  const handleMoveTemplateItemOrder = useCallback(async (itemId, direction) => {
    const tableName = previewTemplateKind === "review" ? "review_items" : "training_template_items";
    const source = previewTemplateKind === "review" ? toObjectRows(reviewItems) : toObjectRows(items);
    const item = toObjectRows(source).find((row) => row.id === itemId);
    if (!item) return;
    const siblings = toObjectRows(source)
      .filter((row) => previewTemplateKind === "review" ? row.review_section_id === item.review_section_id : row.template_section_id === item.template_section_id)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const currentIndex = siblings.findIndex((row) => row.id === itemId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const error = await resequenceRows(tableName, reordered);
    if (error) {
      addGlobalToast(`Failed to reorder ${previewTemplateKind === "review" ? "prompt" : "task"}`, "error");
      return;
    }
    await refreshTemplateBundle();
  }, [addGlobalToast, items, previewTemplateKind, refreshTemplateBundle, resequenceRows, reviewItems]);

  const handleMoveTemplateItemSection = useCallback(async (itemId, sectionId) => {
    if (!sectionId) return;
    const tableName = previewTemplateKind === "review" ? "review_items" : "training_template_items";
    const source = previewTemplateKind === "review" ? toObjectRows(reviewItems) : toObjectRows(items);
    const item = toObjectRows(source).find((row) => row.id === itemId);
    if (!item) return;
    const currentSectionId = previewTemplateKind === "review" ? item.review_section_id : item.template_section_id;
    if (currentSectionId === sectionId) return;
    const targetItems = toObjectRows(source).filter((row) => previewTemplateKind === "review" ? row.review_section_id === sectionId : row.template_section_id === sectionId);
    const patch = previewTemplateKind === "review"
      ? { review_section_id: sectionId, sequence_order: (targetItems.length + 1) * 10 }
      : { template_section_id: sectionId, sequence_order: (targetItems.length + 1) * 10 };
    const { error } = await supabase.from(tableName).update(patch).eq("id", itemId);
    if (error) {
      addGlobalToast(`Failed to move ${previewTemplateKind === "review" ? "prompt" : "task"}`, "error");
      return;
    }
    await refreshTemplateBundle();
  }, [addGlobalToast, items, previewTemplateKind, refreshTemplateBundle, reviewItems]);

  const openLaborEmployeeProfile = useCallback((employeeId, seedRow = null, options = {}) => {
    const resolvedEmployeeId = employeeId || getLaborEmployeeRowId(seedRow);
    if (!resolvedEmployeeId && !isObjectRow(seedRow)) {
      addGlobalToast?.("Employee record is missing an employee link", "error");
      return;
    }
    pendingEmployeeRecordTabRef.current = options.recordTab || "";
    setSelectedRecordId(null);
    setSelectedLaborEmployeeId(resolvedEmployeeId);
    setSelectedLaborEmployeeSeed(isObjectRow(seedRow) ? seedRow : null);
    setSelectedReviewInstanceId(null);
    setShowNewRecord(false);
    setShowRecordConfig(false);
    setPreviewTemplateId(null);
    setPreviewTemplateVersionId(null);
    setSelectedPctReadinessRecordId("");
  }, [addGlobalToast]);

  const updatePctReadinessFilter = useCallback((key, value) => {
    setPctReadinessFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearPctReadinessFilters = useCallback(() => {
    setPctReadinessFilters(DEFAULT_PCT_READINESS_FILTERS);
    setActivePctReadinessSectionId("");
  }, []);

  const scrollToPctReadinessSection = useCallback((sectionId) => {
    if (!sectionId || typeof window === "undefined") return;
    window.setTimeout(() => {
      const container = pctReadinessScrollRef.current;
      const target = container?.querySelector?.(`[data-pct-section-id="${sectionId}"]`);
      if (!container || !target) return;
      container.scrollTo({
        top: Math.max(0, target.offsetTop - 76),
        behavior: "smooth",
      });
    }, 40);
  }, []);

  const jumpToPctReadinessSection = useCallback((sectionId, { filter = false } = {}) => {
    if (!sectionId) return;
    if (filter) updatePctReadinessFilter("category", sectionId);
    setActivePctReadinessSectionId(sectionId);
    scrollToPctReadinessSection(sectionId);
  }, [scrollToPctReadinessSection, updatePctReadinessFilter]);

  const handlePctReadinessMatrixScroll = useCallback(() => {
    const container = pctReadinessScrollRef.current;
    if (!container) return;
    const sectionRows = Array.from(container.querySelectorAll("[data-pct-section-id]"));
    const current = sectionRows
      .filter((row) => row.offsetTop <= container.scrollTop + 96)
      .at(-1) || sectionRows[0];
    const sectionId = current?.getAttribute("data-pct-section-id") || "";
    if (sectionId && sectionId !== activePctReadinessSectionId) {
      setActivePctReadinessSectionId(sectionId);
    }
  }, [activePctReadinessSectionId]);

  const openPctReadinessCellEditor = useCallback((record, item, section) => {
    const cell = pctReadinessCells[`${record.id}:${item.id}`] || {};
    const readinessStatus = normalizePctReadinessStatus(cell.readiness_status || cell.status);
    setPctReadinessCellEditor({ record, item, section, cell });
    setPctReadinessEditorStatus(readinessStatus);
    setPctReadinessEditorDemonstratedBy(cell.demonstrated_by || cell.metadata?.demonstrated_by_name || "");
    setPctReadinessEditorVerifiedBy(cell.verified_by || cell.metadata?.verified_by_name || "");
    setPctReadinessEditorComment("");
  }, [pctReadinessCells]);

  const closePctReadinessCellEditor = useCallback(() => {
    setPctReadinessCellEditor(null);
    setPctReadinessEditorStatus("not_started");
    setPctReadinessEditorDemonstratedBy("");
    setPctReadinessEditorVerifiedBy("");
    setPctReadinessEditorComment("");
    setSavingPctReadinessCell(false);
  }, []);

  const handleSavePctReadinessCell = useCallback(async () => {
    if (!pctReadinessCellEditor?.record?.id || !pctReadinessCellEditor?.item?.id) return;
    setSavingPctReadinessCell(true);
    try {
      const args = buildPctReadinessCellUpdateArgs({
        recordId: pctReadinessCellEditor.record.id,
        templateItemId: pctReadinessCellEditor.item.id,
        readinessStatus: pctReadinessEditorStatus,
        comment: pctReadinessEditorComment,
        actorUserId,
        actorName,
      });
      const { error } = await supabase.rpc("update_pct_readiness_cell", args);
      if (error) throw error;
      await loadPctReadinessBoard(true);
      await refreshLaborData({ includeTraining: true, includeSupport: true });
      closePctReadinessCellEditor();
      addGlobalToast?.("Readiness cell updated", "success");
    } catch (error) {
      console.error("PCT readiness cell save error:", error);
      addGlobalToast?.(error?.message || "Failed to update readiness cell", "error");
      setSavingPctReadinessCell(false);
    }
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    closePctReadinessCellEditor,
    loadPctReadinessBoard,
    pctReadinessCellEditor,
    pctReadinessEditorComment,
    pctReadinessEditorStatus,
    refreshLaborData,
  ]);

  const handleCreatePctReadinessRecord = useCallback(async () => {
    if (!newPctReadinessEmployeeId) {
      addGlobalToast?.("Choose an employee for the readiness board", "error");
      return;
    }
    setCreatingPctReadinessRecord(true);
    try {
      const { error } = await supabase.rpc("create_pct_readiness_record", {
        p_labor_employee_id: newPctReadinessEmployeeId,
        p_location_ref: laborLocationRef,
        p_actor_user_id: actorUserId,
        p_actor_name: actorName,
      });
      if (error) throw error;
      setShowPctReadinessNewRecord(false);
      setNewPctReadinessEmployeeId("");
      await loadPctReadinessBoard(true);
      await refreshLaborData({ includeTraining: true, includeSupport: true });
      addGlobalToast?.("Trainee added to Team Readiness Board", "success");
    } catch (error) {
      console.error("PCT readiness record create error:", error);
      addGlobalToast?.(error?.message || "Failed to add trainee", "error");
    } finally {
      setCreatingPctReadinessRecord(false);
    }
  }, [actorName, actorUserId, addGlobalToast, laborLocationRef, loadPctReadinessBoard, newPctReadinessEmployeeId, refreshLaborData]);

  const handleAddEmployeeNote = useCallback(async () => {
    if (!canAccessEmployeeNotes) {
      addGlobalToast("You do not have permission to add employee notes", "error");
      return;
    }
    if (!selectedLaborEmployeeView?.id || !employeeNoteText.trim()) return;
    setSavingEmployeeNote(true);
    const { data, error } = await appendEmployeeNote({
      laborEmployeeId: selectedLaborEmployeeView.id,
      noteText: employeeNoteText,
      noteType: employeeNoteType,
    });
    if (error) {
      addGlobalToast("Failed to add employee note", "error");
      setSavingEmployeeNote(false);
      return;
    }

    const createdNote = Array.isArray(data) ? data[0] : data;
    let attachmentError = null;
    if (employeeNoteFiles.length > 0) {
      if (!createdNote?.id) {
        attachmentError = new Error("Employee note did not return an id for attachments");
      } else {
        try {
          await uploadEmployeeNoteAttachments({
            laborEmployeeId: selectedLaborEmployeeView.id,
            noteId: createdNote.id,
            files: employeeNoteFiles,
          });
        } catch (uploadError) {
          console.error("Employee note attachment upload error:", uploadError);
          attachmentError = uploadError;
        }
      }
    }

    setEmployeeNoteText("");
    setEmployeeNoteType("general");
    setEmployeeNoteFiles([]);
    setEmployeeNoteFileErrors([]);
    if (employeeNoteFileInputRef.current) employeeNoteFileInputRef.current.value = "";
    await refreshLaborData();
    setSavingEmployeeNote(false);
    addGlobalToast(
      attachmentError ? "Employee note saved, but one or more attachments failed" : "Employee note added",
      attachmentError ? "error" : "success"
    );
  }, [addGlobalToast, appendEmployeeNote, canAccessEmployeeNotes, employeeNoteFiles, employeeNoteText, employeeNoteType, selectedLaborEmployeeView, refreshLaborData, uploadEmployeeNoteAttachments]);

  const handleSaveEmployeeNoteEdit = useCallback(async () => {
    if (!canAccessEmployeeNotes) {
      addGlobalToast("You do not have permission to edit employee notes", "error");
      return;
    }
    if (!editingEmployeeNote?.id || !editingEmployeeNoteText.trim()) return;
    setSavingEmployeeNoteEdit(true);

    const noteLaborEmployeeId = editingEmployeeNote.labor_employee_id || selectedLaborEmployeeView?.id;
    let attachmentError = null;
    try {
      const { error } = await supabase
        .from("labor_employee_notes")
        .update({
          note_type: editingEmployeeNoteType,
          note_text: editingEmployeeNoteText.trim(),
          updated_at: new Date().toISOString(),
          updated_by_user_id: actorUserId,
          updated_by_name: actorName,
        })
        .eq("id", editingEmployeeNote.id)
        .is("deleted_at", null);

      if (error) throw error;

      if (editingEmployeeNoteFiles.length > 0 && noteLaborEmployeeId) {
        try {
          await uploadEmployeeNoteAttachments({
            laborEmployeeId: noteLaborEmployeeId,
            noteId: editingEmployeeNote.id,
            files: editingEmployeeNoteFiles,
          });
        } catch (uploadError) {
          console.error("Employee note edit attachment upload error:", uploadError);
          attachmentError = uploadError;
        }
      }

      resetEmployeeNoteEditor();
      await refreshLaborData({ includeTraining: false, includeSupport: true });
      addGlobalToast(
        attachmentError ? "Note updated, but one or more attachments failed" : "Employee note updated",
        attachmentError ? "error" : "success"
      );
    } catch (error) {
      console.error("Employee note edit error:", error);
      addGlobalToast("Failed to update employee note", "error");
    } finally {
      setSavingEmployeeNoteEdit(false);
    }
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    canAccessEmployeeNotes,
    editingEmployeeNote,
    editingEmployeeNoteFiles,
    editingEmployeeNoteText,
    editingEmployeeNoteType,
    refreshLaborData,
    resetEmployeeNoteEditor,
    selectedLaborEmployeeView,
    uploadEmployeeNoteAttachments,
  ]);

  const handleAddGlobalEmployeeNote = useCallback(async () => {
    if (!canAccessEmployeeNotes) {
      addGlobalToast("You do not have permission to add employee notes", "error");
      return;
    }
    if (!globalNoteEmployeeId || !globalNoteText.trim()) {
      addGlobalToast("Choose an employee and add note text", "error");
      return;
    }
    setSavingGlobalNote(true);
    const { error } = await appendEmployeeNote({
      laborEmployeeId: globalNoteEmployeeId,
      noteText: globalNoteText,
      noteType: globalNoteType,
    });
    if (error) {
      addGlobalToast("Failed to add employee note", "error");
      setSavingGlobalNote(false);
      return;
    }
    setGlobalNoteEmployeeId("");
    setGlobalNoteType("general");
    setGlobalNoteText("");
    setShowGlobalNoteModal(false);
    await refreshLaborData();
    setSavingGlobalNote(false);
    addGlobalToast("Employee note added", "success");
  }, [addGlobalToast, appendEmployeeNote, canAccessEmployeeNotes, globalNoteEmployeeId, globalNoteText, globalNoteType, refreshLaborData]);

  const findReviewTemplateForEmployee = useCallback((employee) => {
    const templates = toObjectRows(reviewTemplates);
    const mappedTemplate = resolvePerformanceReviewTemplate(employee);
    const normalizedPosition = normalizePositionTitle(employee?.position_title || "");
    const normalizedRoleLabel = normalizePositionTitle(mappedTemplate?.roleLabel || "");
    const normalizedRoleKey = String(mappedTemplate?.roleKey || "").replace(/_/g, " ");
    return templates.find((template) => {
      const scopes = Array.isArray(template.role_scopes) ? template.role_scopes : [];
      const normalizedScopes = scopes.map((scope) => normalizePositionTitle(scope));
      return normalizedScopes.includes(normalizedPosition)
        || (normalizedRoleLabel && normalizedScopes.includes(normalizedRoleLabel))
        || (normalizedRoleKey && normalizedScopes.includes(normalizedRoleKey));
    }) || templates.find((template) => {
      const slug = normalizePositionTitle(String(template.slug || template.name || "").replace(/_/g, " "));
      return mappedTemplate?.roleKey && slug.includes(String(mappedTemplate.roleKey).replace(/_/g, " "));
    }) || templates[0];
  }, [reviewTemplates]);

  const findCurrentPublishedReviewTemplateVersion = useCallback((templateId) => {
    if (!templateId) return null;
    const versions = toObjectRows(allReviewTemplateVersions).filter((version) => version.template_id === templateId);
    return versions.find((version) => version.is_current && version.status === "published")
      || versions.find((version) => version.status === "published")
      || null;
  }, [allReviewTemplateVersions]);

  const handleCreateReviewInstanceForEmployee = useCallback(async (employee, reviewCycle) => {
    const employeeId = getLaborEmployeeRowId(employee);
    if (!employeeId) return null;
    const matchingTemplate = findReviewTemplateForEmployee(employee);

    if (!matchingTemplate?.id) {
      addGlobalToast("No review template is available for this role", "error");
      return null;
    }

    const { data, error } = await supabase.rpc("create_review_instance", {
      p_labor_employee_id: employeeId,
      p_template_id: matchingTemplate.id,
      p_review_cycle: reviewCycle,
      p_due_date: null,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to create review instance", "error");
      return null;
    }
    const createdInstance = Array.isArray(data) ? data[0] : data;
    await refreshLaborData();
    setSelectedLaborEmployeeId(employeeId);
    setSelectedLaborEmployeeSeed(isObjectRow(employee) ? employee : null);
    if (createdInstance?.id) setSelectedReviewInstanceId(createdInstance.id);
    addGlobalToast("Review instance created", "success");
    return createdInstance || null;
  }, [actorName, actorUserId, addGlobalToast, findReviewTemplateForEmployee, refreshLaborData]);

  const handleCreateReviewInstance = useCallback(async (reviewCycle) => {
    if (!selectedLaborEmployeeView?.id) return null;
    return handleCreateReviewInstanceForEmployee(selectedLaborEmployeeView, reviewCycle);
  }, [handleCreateReviewInstanceForEmployee, selectedLaborEmployeeView]);

  const getReviewResponse = useCallback((reviewItemId) => {
    if (!selectedReviewInstanceId) return null;
    return toObjectRows(reviewResponses).find((response) => response.review_instance_id === selectedReviewInstanceId && response.review_item_id === reviewItemId) || null;
  }, [reviewResponses, selectedReviewInstanceId]);

  const handleReviewDraftChange = useCallback((reviewItemId, field, value) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [reviewItemId]: {
        ...prev[reviewItemId],
        [field]: value,
      },
    }));
  }, []);

  const persistReviewResponse = useCallback(async (reviewItem) => {
    if (!selectedReviewInstanceId) return;
    const draft = reviewDrafts[reviewItem.id] || {};
    const existing = getReviewResponse(reviewItem.id);
    const ratingValue = draft.rating_value ?? existing?.rating_value ?? null;
    const responseText = draft.response_text ?? existing?.response_text ?? null;
    const { error } = await supabase.rpc("save_employee_review_response", {
      p_review_instance_id: selectedReviewInstanceId,
      p_review_item_id: reviewItem.id,
      p_rating_value: ratingValue,
      p_response_text: responseText,
      p_actor_user_id: actorUserId,
    });
    if (error) throw error;
  }, [actorUserId, getReviewResponse, reviewDrafts, selectedReviewInstanceId]);

  const handleSaveReviewResponse = useCallback(async (reviewItem) => {
    if (!selectedReviewInstanceId) return false;
    setSavingReviewItemId(reviewItem.id);
    try {
      await persistReviewResponse(reviewItem);
      await refreshLaborData();
      setReviewDrafts((prev) => {
        if (!prev[reviewItem.id]) return prev;
        const next = { ...prev };
        delete next[reviewItem.id];
        return next;
      });
      addGlobalToast("Review response saved", "success");
      return true;
    } catch (error) {
      addGlobalToast("Failed to save review response", "error");
      return false;
    } finally {
      setSavingReviewItemId(null);
    }
  }, [addGlobalToast, persistReviewResponse, refreshLaborData, selectedReviewInstanceId]);

  const handleSaveAllReviewResponses = useCallback(async ({ quiet = false } = {}) => {
    if (!selectedReviewInstanceId || unsavedReviewItems.length === 0) return true;
    setSavingReviewItemId(SAVING_ALL_REVIEW_RESPONSES_ID);
    try {
      for (const { item } of unsavedReviewItems) {
        await persistReviewResponse(item);
      }
      await refreshLaborData();
      setReviewDrafts({});
      if (!quiet) {
        addGlobalToast(
          unsavedReviewItems.length === 1 ? "Review response saved" : `${unsavedReviewItems.length} review responses saved`,
          "success",
        );
      }
      return true;
    } catch (error) {
      addGlobalToast("Failed to save review responses", "error");
      return false;
    } finally {
      setSavingReviewItemId(null);
    }
  }, [addGlobalToast, persistReviewResponse, refreshLaborData, selectedReviewInstanceId, unsavedReviewItems]);

  const handleSaveAllReviewResponsesClick = useCallback(() => {
    handleSaveAllReviewResponses();
  }, [handleSaveAllReviewResponses]);

  const handleCompleteReviewInstance = useCallback(async () => {
    if (!selectedReviewInstanceId) return;
    setCompletingReview(true);
    const savedResponses = await handleSaveAllReviewResponses({ quiet: true });
    if (!savedResponses) {
      setCompletingReview(false);
      return;
    }
    const { error } = await supabase.rpc("complete_employee_review_instance", {
      p_review_instance_id: selectedReviewInstanceId,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to complete review", "error");
      setCompletingReview(false);
      return;
    }
    await refreshLaborData();
    setCompletingReview(false);
    addGlobalToast("Review completed", "success");
  }, [actorName, actorUserId, addGlobalToast, handleSaveAllReviewResponses, selectedReviewInstanceId, refreshLaborData]);

  const handleRestartSelectedReviewInstance = useCallback(async (targetReviewTemplate = null) => {
    if (!selectedReviewInstance || !selectedLaborEmployeeView) return;
    const signature = isObjectRow(selectedReviewInstance.metadata?.signature) ? selectedReviewInstance.metadata.signature : {};
    if (["sent", "completed"].includes(String(signature.status || ""))) {
      addGlobalToast("This review already has a signature request. Start a new review instead of restarting this signed packet.", "error");
      return;
    }

    const restartTemplate = targetReviewTemplate?.id ? targetReviewTemplate : selectedReviewTemplate;
    const restartVersion = findCurrentPublishedReviewTemplateVersion(restartTemplate?.id);
    if (!restartTemplate?.id || !restartVersion?.id) {
      addGlobalToast("No current published review template is available for restart", "error");
      return;
    }

    const responseCount = selectedReviewResponses.length;
    const hasPdfDraft = Object.values(reviewPdfDraft).some((value) => String(value || "").trim());
    const message = [
      `Restart this ${String(selectedReviewInstance.review_cycle || "").replace(/_/g, " ")} review with ${restartTemplate.name || "the selected template"}?`,
      "",
      "This clears saved prompt responses and manager PDF draft fields for this review cycle.",
      responseCount > 0 ? `Saved prompt responses that will be cleared: ${responseCount}.` : "There are no saved prompt responses yet.",
      hasPdfDraft ? "Manager PDF notes/action plan fields will also be cleared." : "",
    ].filter(Boolean).join("\n");
    if (!window.confirm(message)) return;

    setRestartingReview(true);
    try {
      const { error: deleteError } = await supabase
        .from("employee_review_responses")
        .delete()
        .eq("review_instance_id", selectedReviewInstance.id);
      if (deleteError) throw deleteError;

      const restartedAt = new Date().toISOString();
      const metadata = clearRestartedReviewMetadata(selectedReviewInstance.metadata, {
        restarted_at: restartedAt,
        actor_user_id: actorUserId || null,
        previous_template_id: selectedReviewInstance.template_id || null,
        previous_template_version_id: selectedReviewInstance.template_version_id || null,
        template_id: restartTemplate.id,
        template_version_id: restartVersion.id,
      });

      const { data, error } = await supabase
        .from("employee_review_instances")
        .update({
          template_id: restartTemplate.id,
          template_version_id: restartVersion.id,
          status: getRestartedReviewStatus(selectedReviewInstance.due_date),
          completed_at: null,
          responses_snapshot: {},
          metadata,
          reviewer_user_id: actorUserId || null,
          reviewer_name: actorName || null,
          updated_by_user_id: actorUserId || null,
        })
        .eq("id", selectedReviewInstance.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;

      setReviewDrafts({});
      setReviewPdfDraft(EMPTY_REVIEW_PDF_DRAFT);
      await refreshLaborData();
      if (data?.id) setSelectedReviewInstanceId(data.id);
      addGlobalToast("Review restarted with the selected template", "success");
    } catch (error) {
      addGlobalToast(error?.message || "Failed to restart review", "error");
    } finally {
      setRestartingReview(false);
    }
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    findCurrentPublishedReviewTemplateVersion,
    refreshLaborData,
    reviewPdfDraft,
    selectedLaborEmployeeView,
    selectedReviewInstance,
    selectedReviewResponses,
    selectedReviewTemplate,
  ]);

  const handleReviewPdfDraftChange = useCallback((field, value) => {
    setReviewPdfDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const handleSavePerformanceReviewTemplateOverride = useCallback(async (roleKey) => {
    if (!selectedLaborEmployeeView?.id) return;
    setSavingPerformanceReviewTemplateRole(true);
    const employeeBeforeUpdate = toObjectRows(laborEmployees).find((employee) => employee.id === selectedLaborEmployeeView.id) || selectedLaborEmployeeView;
    const { error, metadata } = await persistLaborEmployeePerformanceReviewTemplate(
      selectedLaborEmployeeView.id,
      employeeBeforeUpdate?.metadata,
      roleKey
    );
    if (error) {
      addGlobalToast("Failed to pair PDF template", "error");
      setSavingPerformanceReviewTemplateRole(false);
      return;
    }
    setSelectedLaborEmployeeSeed((current) => {
      if (isObjectRow(current) && getLaborEmployeeRowId(current) === selectedLaborEmployeeView.id) {
        return { ...current, metadata };
      }
      return { ...selectedLaborEmployeeView, metadata };
    });
    await refreshLaborData();
    setSavingPerformanceReviewTemplateRole(false);
    addGlobalToast(roleKey ? "Performance review PDF template paired" : "Performance review PDF template pairing cleared", "success");
  }, [
    addGlobalToast,
    laborEmployees,
    persistLaborEmployeePerformanceReviewTemplate,
    refreshLaborData,
    selectedLaborEmployeeView,
  ]);

  const saveReviewPdfDraft = useCallback(async ({ quiet = false } = {}) => {
    if (!selectedReviewInstanceId) return false;
    setSavingReviewPdfDraft(true);
    const { error } = await supabase.rpc("save_employee_review_pdf_draft", {
      p_review_instance_id: selectedReviewInstanceId,
      p_review_rating: reviewPdfDraft.rating || null,
      p_manager_notes: reviewPdfDraft.managerNotes || null,
      p_action_plan: reviewPdfDraft.actionPlan || null,
      p_overall_rating: reviewPdfDraft.overallRating || null,
      p_overall_comments: reviewPdfDraft.overallComments || null,
      p_actor_user_id: actorUserId,
    });
    if (error) {
      addGlobalToast("Failed to save PDF draft fields", "error");
      setSavingReviewPdfDraft(false);
      return false;
    }
    await refreshLaborData();
    setSavingReviewPdfDraft(false);
    if (!quiet) addGlobalToast("PDF draft fields saved", "success");
    return true;
  }, [actorUserId, addGlobalToast, refreshLaborData, reviewPdfDraft, selectedReviewInstanceId]);

  const buildSelectedPerformanceReviewPdfBytes = useCallback(async () => {
    if (!selectedReviewInstance || !selectedLaborEmployeeView) {
      throw new Error("Choose a review before rendering the PDF.");
    }
    const template = resolvePerformanceReviewTemplate(selectedLaborEmployeeView);
    if (!template?.pdfUrl) {
      throw new Error("No HR PDF template is mapped for this employee position.");
    }
    const response = await fetch(template.pdfUrl);
    if (!response.ok) throw new Error("Failed to load HR source PDF template.");
    const sourcePdfBytes = await response.arrayBuffer();
    return await fillPerformanceReviewPdfBytes(sourcePdfBytes, {
      template,
      employee: selectedLaborEmployeeView,
      reviewInstance: selectedReviewInstance,
      reviewSections: selectedReviewSections,
      reviewDrafts,
      responses: selectedReviewResponses,
      draft: reviewPdfDraft,
      locationName: laborContactLocationName,
      reviewDate: todayStr(),
    });
  }, [laborContactLocationName, reviewDrafts, reviewPdfDraft, selectedLaborEmployeeView, selectedReviewInstance, selectedReviewResponses, selectedReviewSections]);

  const handlePreviewPerformanceReviewPdf = useCallback(async () => {
    setRenderingReviewPdf(true);
    try {
      const pdfBytes = await buildSelectedPerformanceReviewPdfBytes();
      if (reviewPdfObjectUrlRef.current) URL.revokeObjectURL(reviewPdfObjectUrlRef.current);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      reviewPdfObjectUrlRef.current = objectUrl;
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      addGlobalToast(error?.message || "Failed to render performance review PDF", "error");
    } finally {
      setRenderingReviewPdf(false);
    }
  }, [addGlobalToast, buildSelectedPerformanceReviewPdfBytes]);

  const handleSendPerformanceReviewSignature = useCallback(async () => {
    if (!selectedReviewInstance || !selectedLaborEmployeeView) return;
    const template = resolvePerformanceReviewTemplate(selectedLaborEmployeeView);
    if (!template) {
      addGlobalToast("No HR PDF template is mapped for this employee position", "error");
      return;
    }
    const employeeEmail = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_email");
    const employeePhone = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_phone");
    const deliveryMethod = reviewSignatureDeliveryMethod === "email" ? "email" : "sms";
    if (deliveryMethod === "sms" && !employeePhone) {
      addGlobalToast("Add an employee phone number before sending by SMS", "error");
      return;
    }
    if (deliveryMethod === "email" && !employeeEmail) {
      addGlobalToast("Add an employee email before sending by email", "error");
      return;
    }

    setSendingReviewSignature(true);
    try {
      const savedResponses = await handleSaveAllReviewResponses({ quiet: true });
      if (!savedResponses) return;
      const saved = await saveReviewPdfDraft({ quiet: true });
      if (!saved) return;
      const pdfBytes = await buildSelectedPerformanceReviewPdfBytes();
      const fileName = buildPerformanceReviewPdfFileName(selectedLaborEmployeeView, selectedReviewInstance.review_cycle);
      const { data, error } = await supabase.functions.invoke("performance-review-signing", {
        body: {
          review_instance_id: selectedReviewInstance.id,
          delivery_method: deliveryMethod,
          recipient_email: employeeEmail,
          recipient_phone: employeePhone,
          file_name: fileName,
          pdf_base64: arrayBufferToBase64(pdfBytes),
          fields: buildDocuSealPerformanceReviewFields(template, selectedReviewInstance.review_cycle),
        },
      });
      if (error) throw new Error(await readEdgeFunctionError(error, "Failed to send performance review for signature"));
      if (!data?.ok) throw new Error(data?.error || "Failed to send performance review for signature");
      await refreshLaborData();
      addGlobalToast(deliveryMethod === "sms" ? "Signature request texted to employee" : "Signature request emailed to employee", "success");
    } catch (error) {
      addGlobalToast(error?.message || "Failed to send performance review for signature", "error");
    } finally {
      setSendingReviewSignature(false);
    }
  }, [
    addGlobalToast,
    buildSelectedPerformanceReviewPdfBytes,
    handleSaveAllReviewResponses,
    refreshLaborData,
    reviewSignatureDeliveryMethod,
    saveReviewPdfDraft,
    selectedLaborEmployeeView,
    selectedReviewInstance,
  ]);

  const saveHierarchy = useCallback(async () => {
    if (!canEditRoster) {
      addGlobalToast("You do not have permission to edit the labor roster", "error");
      setShowHierarchyManager(false);
      return;
    }
    if (!resolvedLaborLocationId || hierarchyDraft.length === 0) {
      setShowHierarchyManager(false);
      return;
    }
    if (!hierarchyPersistenceAvailable) {
      addGlobalToast("Labor settings require the position hierarchy database migration", "warning");
      setShowHierarchyManager(false);
      return;
    }
    setSavingHierarchy(true);
    try {
      const seenDraftTitles = new Set();
      const draftRows = hierarchyDraft
        .map((row, index) => {
          const positionTitle = formatLaborPositionTitle(row.position_title);
          const normalizedTitle = normalizePositionTitle(positionTitle);
          if (!normalizedTitle || seenDraftTitles.has(normalizedTitle)) return null;
          seenDraftTitles.add(normalizedTitle);
          return {
            id: row.id || null,
            position_title: positionTitle,
            normalized_title: normalizedTitle,
            sort_order: (index + 1) * 10,
          };
        })
        .filter(Boolean);

      const existingByTitle = {};
      positionHierarchy.forEach((row) => {
        const normalizedTitle = normalizePositionTitle(row.position_title);
        if (!normalizedTitle) return;
        const current = existingByTitle[normalizedTitle];
        const rowCanonical = formatLaborPositionTitle(row.position_title).toLowerCase();
        const currentCanonical = current ? formatLaborPositionTitle(current.position_title).toLowerCase() : "";
        const rowIsCanonical = String(row.position_title || "").trim().toLowerCase() === rowCanonical;
        const currentIsCanonical = current && String(current.position_title || "").trim().toLowerCase() === currentCanonical;
        if (!current || (rowIsCanonical && !currentIsCanonical)) existingByTitle[normalizedTitle] = row;
      });

      const retainedExistingIds = new Set();
      const updates = draftRows.map((entry) => {
        const existing = existingByTitle[entry.normalized_title] || null;
        if (existing?.id) retainedExistingIds.add(existing.id);
        return { ...entry, existing };
      });
      const deleteIds = positionHierarchy
        .map((row) => row.id)
        .filter((id) => id && !retainedExistingIds.has(id));

      const deleteResults = await Promise.all(deleteIds.map((id) => (
        supabase.from("labor_position_hierarchy").delete().eq("id", id)
      )));
      const failedDelete = deleteResults.find((result) => result.error);
      if (failedDelete?.error) throw failedDelete.error;

      const mutationResults = await Promise.all(updates.map((entry) => {
        if (entry.existing?.id) {
          return supabase
            .from("labor_position_hierarchy")
            .update({
              position_title: entry.position_title,
              sort_order: entry.sort_order,
              updated_by_user_id: actorUserId,
              updated_by_name: actorName,
            })
            .eq("id", entry.existing.id);
        }
        return supabase.from("labor_position_hierarchy").insert({
          location_id: resolvedLaborLocationId,
          position_title: entry.position_title,
          sort_order: entry.sort_order,
          created_by_user_id: actorUserId,
          created_by_name: actorName,
          updated_by_user_id: actorUserId,
          updated_by_name: actorName,
        });
      }));
      const failedMutation = mutationResults.find((result) => result.error);
      if (failedMutation?.error) throw failedMutation.error;

      const { data: hierarchyRes, error } = await supabase
        .from("labor_position_hierarchy")
        .select("*")
        .eq("location_id", resolvedLaborLocationId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setPositionHierarchy(hierarchyRes || []);
      setRosterSort(LABOR_DEFAULT_SORT);
      setShowHierarchyManager(false);
      addGlobalToast("Labor position settings updated", "success");
    } catch (error) {
      console.error("Failed to save labor position hierarchy", error);
      addGlobalToast(error.message || "Failed to save labor position settings", "error");
    }
    setSavingHierarchy(false);
  }, [actorName, actorUserId, addGlobalToast, canEditRoster, hierarchyDraft, hierarchyPersistenceAvailable, positionHierarchy, resolvedLaborLocationId]);

  // ── Section toggle ──
  const toggleSection = useCallback((sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  const toggleItemNotes = useCallback((itemId) => {
    setExpandedItemNotes((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }, []);

  // ── Due soon records ──
  const dueSoonRecords = useMemo(() => {
    const today = todayStr();
    const sevenDays = new Date();
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenStr = sevenDays.toISOString().split("T")[0];
    return activeRecords.filter(r => r.target_end_date && r.target_end_date <= sevenStr && r.target_end_date >= today);
  }, [activeRecords]);

  const overdueRecords = useMemo(() => {
    const today = todayStr();
    return activeRecords.filter(r => r.target_end_date && r.target_end_date < today);
  }, [activeRecords]);

  const activeEmployees = useMemo(() => {
    const source = rosterSnapshot.length > 0 ? rosterSnapshot : laborEmployees;
    return source.filter((employee) => isLaborEmployeeActive(employee));
  }, [laborEmployees, rosterSnapshot]);

  const inactiveEmployees = useMemo(() => {
    const source = rosterSnapshot.length > 0 ? rosterSnapshot : laborEmployees;
    return source.filter((employee) => !isLaborEmployeeActive(employee));
  }, [laborEmployees, rosterSnapshot]);

  const rosterRows = useMemo(() => {
    if (rosterSnapshot.length > 0) return rosterSnapshot;
    return laborEmployees.map((employee) => ({
      labor_employee_id: employee.id,
      full_name: employee.full_name,
      position_title: employee.position_title,
      employment_commitment: employee.employment_commitment || null,
      position_group: employee.position_group || null,
      employment_status: employee.end_date ? "inactive" : "active",
      is_active: !employee.end_date,
      start_date: employee.start_date,
      end_date: employee.end_date,
      cpr_status: "not_started",
      review_30_status: "not_started",
      review_60_status: "not_started",
      review_90_status: "not_started",
      open_training_record_count: 0,
      completed_training_record_count: 0,
      active_training_record_id: null,
      active_training_status: null,
      active_training_progress_percent: 0,
    }));
  }, [laborEmployees, rosterSnapshot]);
  const preparedRosterRows = useMemo(() => {
    return toObjectRows(rosterRows).map((row) => {
      const employeeId = getLaborEmployeeRowId(row);
      const contactEmployee = laborEmployeeMap[employeeId] || null;
      const contactEmail = readLaborEmployeeContact(contactEmployee, "contact_email");
      const contactPhone = readLaborEmployeeContact(contactEmployee, "contact_phone");
      const fullName = row.full_name || contactEmployee?.full_name || "";
      const positionTitle = formatLaborPositionTitle(row.position_title || contactEmployee?.position_title || "");
      const { firstName, lastName } = splitEmployeeName(fullName);
      const endDate = row.end_date || contactEmployee?.end_date || null;
      const isActive = row.is_active ?? !endDate;
      const supportNoteCount = toObjectRows(laborNotesByEmployee[employeeId] || []).length;
      const snapshotNoteCount = Number(row.employee_note_count ?? row.note_count ?? row.recent_employee_note_count_7d ?? 0);
      const mergedEmployee = {
        ...row,
        ...(contactEmployee || {}),
        id: employeeId || row.id,
        labor_employee_id: employeeId,
        full_name: fullName,
        position_title: positionTitle,
        employment_commitment: readLaborEmploymentCommitment(row) || readLaborEmploymentCommitment(contactEmployee) || null,
      };
      const requirementRows = buildEmployeeTrainingRequirementRows({
        employee: mergedEmployee,
        certifications: employeeCertificationsByEmployee[employeeId] || [],
        requirements: certificationRequirements,
        documents: laborEmployeeDocumentsByEmployee[employeeId] || [],
      });
      const requirementSummary = summarizeEmployeeTrainingRequirementCompliance(requirementRows);
      let trainingCompliance = requirementRows.length > 0
        ? { label: requirementSummary.label, color: requirementSummary.color, inProgress: false }
        : getTrainingComplianceState(row);
      const daysSinceStart = getDaysSince(row?.start_date || contactEmployee?.start_date);
      if (!requirementSummary.isCompliant && daysSinceStart != null && daysSinceStart < TRAINING_GRACE_PERIOD_DAYS) {
        trainingCompliance = { label: "In Progress", color: "warning", inProgress: true };
      }
      const performanceReviewCompliance = getPerformanceReviewCompliance(row);
      return {
        ...row,
        id: employeeId || row.id,
        labor_employee_id: employeeId,
        full_name: fullName,
        position_title: positionTitle,
        employment_commitment: readLaborEmploymentCommitment(row) || readLaborEmploymentCommitment(contactEmployee) || null,
        position_group: row.position_group || contactEmployee?.position_group || null,
        metadata: contactEmployee?.metadata || row.metadata || {},
        start_date: row.start_date || contactEmployee?.start_date || null,
        end_date: endDate,
        is_active: isActive,
        employment_status: row.employment_status || (isActive ? "active" : "inactive"),
        first_name: firstName,
        last_name: lastName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        training_compliance: trainingCompliance,
        training_requirement_rows: requirementRows,
        training_requirement_summary: requirementSummary,
        review30: getReviewStatusPresentation(row, "review_30"),
        review60: getReviewStatusPresentation(row, "review_60"),
        review90: getReviewStatusPresentation(row, "review_90"),
        performance_review_compliance: performanceReviewCompliance,
        employee_note_count: supportNoteCount || snapshotNoteCount,
      };
    });
  }, [certificationRequirements, employeeCertificationsByEmployee, laborEmployeeDocumentsByEmployee, laborEmployeeMap, laborNotesByEmployee, rosterRows]);
  const displayedDashboardMetrics = useMemo(() => {
    const activeRows = preparedRosterRows.filter((row) => isLaborEmployeeActive(row));
    if (activeRows.length === 0) return dashboardMetrics;
    const hasRequirementRows = activeRows.some((row) => Array.isArray(row.training_requirement_rows) && row.training_requirement_rows.length > 0);
    if (!hasRequirementRows) return dashboardMetrics;
    const numerator = activeRows.filter((row) => row.training_requirement_summary?.isCompliant).length;
    const denominator = activeRows.length;
    return {
      ...dashboardMetrics,
      trainingComplianceNumerator: numerator,
      trainingComplianceDenominator: denominator,
      trainingComplianceScore: denominator > 0 ? Math.round((numerator / denominator) * 100) : 0,
    };
  }, [dashboardMetrics, preparedRosterRows]);
  const rosterStaffingMatrix = useMemo(() => {
    if (Array.isArray(displayedDashboardMetrics.staffingMatrix) && displayedDashboardMetrics.staffingMatrix.length > 0) {
      return displayedDashboardMetrics.staffingMatrix;
    }
    return buildLaborRosterStaffingSummary(preparedRosterRows).staffingMatrix;
  }, [displayedDashboardMetrics.staffingMatrix, preparedRosterRows]);
  const positionHierarchyRows = useMemo(() => {
    const trustedRows = positionHierarchy.filter(isPersistedLaborPositionRowTrusted);
    const sourceRows = trustedRows.length > 0 ? trustedRows : makeDefaultLaborPositionRows();
    const seen = new Set();

    return sourceRows
      .map((row, index) => {
        const positionTitle = formatLaborPositionTitle(row.position_title);
        const normalizedTitle = normalizePositionTitle(positionTitle);
        if (!normalizedTitle || seen.has(normalizedTitle)) return null;
        seen.add(normalizedTitle);
        return {
          id: row.id || null,
          position_title: positionTitle,
          normalized_title: normalizedTitle,
          sort_order: Number.isFinite(row.sort_order) ? row.sort_order : (index + 1) * 10,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const orderDelta = (left.sort_order ?? 9999) - (right.sort_order ?? 9999);
        if (orderDelta !== 0) return orderDelta;
        return left.position_title.localeCompare(right.position_title, undefined, { sensitivity: "base" });
      });
  }, [positionHierarchy]);
  const positionHierarchyIndex = useMemo(() => {
    return Object.fromEntries(positionHierarchyRows.map((row, index) => [row.normalized_title, index]));
  }, [positionHierarchyRows]);
  const approvedLaborPositionOptions = useMemo(() => (
    positionHierarchyRows.map((row) => buildLaborPositionOption(row.position_title)).filter(Boolean)
  ), [positionHierarchyRows]);
  const getLaborPositionOptionsWithCurrent = useCallback((currentTitle = "") => {
    const options = [...approvedLaborPositionOptions];
    const currentOption = buildLaborPositionOption(currentTitle);
    if (currentOption && !options.some((option) => option.normalizedTitle === currentOption.normalizedTitle)) {
      options.unshift({ ...currentOption, label: `${currentOption.label} (current)` });
    }
    return options;
  }, [approvedLaborPositionOptions]);
  const hourAnalysisModel = useMemo(() => buildHourAnalysisModel({
    rosterRows: preparedRosterRows,
    settings: hourAnalysisSettings,
  }), [hourAnalysisSettings, preparedRosterRows]);
  const hourAnalysisGroupHierarchyOrder = useMemo(() => {
    const order = new Map();
    const considerPosition = (positionTitle, fallbackIndex = 10000) => {
      const title = String(positionTitle || "").trim();
      if (!title) return;
      const groupKey = getHourAnalysisGroupKey({ position_title: title });
      const sort = positionHierarchyIndex[normalizePositionTitle(title)] ?? fallbackIndex;
      if (!order.has(groupKey) || sort < order.get(groupKey)) order.set(groupKey, sort);
    };
    positionHierarchyRows.forEach((row, index) => considerPosition(row.position_title, index));
    HOUR_ANALYSIS_GROUPS.forEach((group, index) => {
      if (!order.has(group.key)) order.set(group.key, 5000 + index);
    });
    return order;
  }, [positionHierarchyIndex, positionHierarchyRows]);
  const hourAnalysisGroups = useMemo(() => {
    const populated = new Set([
      ...hourAnalysisModel.headcountRows.map((row) => row.key),
      ...hourAnalysisModel.weeklyRows.map((row) => row.key),
    ]);
    return HOUR_ANALYSIS_GROUPS
      .filter((group) => group.key !== "other" || populated.has("other"))
      .sort((left, right) => (hourAnalysisGroupHierarchyOrder.get(left.key) ?? 9999) - (hourAnalysisGroupHierarchyOrder.get(right.key) ?? 9999));
  }, [hourAnalysisGroupHierarchyOrder, hourAnalysisModel.headcountRows, hourAnalysisModel.weeklyRows]);
  const hourAnalysisCapacityRows = useMemo(() => {
    const preferredOrder = new Map(["general_manager", "assistant_manager", "supervisor", "csr", "pct"].map((key, index) => [key, index]));
    return hourAnalysisModel.weeklyRows
      .filter((row) => preferredOrder.has(row.key))
      .sort((left, right) => preferredOrder.get(left.key) - preferredOrder.get(right.key));
  }, [hourAnalysisModel.weeklyRows]);
  const hourAnalysisCapacityLayoutColumns = useMemo(() => [
    hourAnalysisCapacityRows.filter((row) => !HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS.has(row.key)),
    hourAnalysisCapacityRows.filter((row) => HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS.has(row.key)),
  ], [hourAnalysisCapacityRows]);
  const updateHourAnalysisCapacityHover = useCallback((event, detail) => {
    const bar = event.currentTarget.closest(".hour-analysis-capacity-bar");
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const xPadding = Math.min(68, Math.max(18, rect.width / 2 - 4));
    const x = rect.width <= 140
      ? rect.width / 2
      : Math.max(xPadding, Math.min(rect.width - xPadding, rawX));
    const y = Math.max(10, Math.min(rect.height - 8, rawY));
    setHourAnalysisCapacityHover({
      ...detail,
      x,
      y,
    });
  }, []);
  const clearHourAnalysisCapacityHover = useCallback(() => {
    setHourAnalysisCapacityHover(null);
  }, []);
  const hourAnalysisPositionOptions = approvedLaborPositionOptions;
  const laborModelCoveragePositionOptions = useMemo(() => {
    const configuredGroups = new Set(approvedLaborPositionOptions.flatMap((option) => {
      const groupKey = getHourAnalysisGroupKey({ position_title: option.value || option.label });
      const coverageOption = LABOR_MODEL_ROLE_COVERAGE_OPTIONS.find((item) => item.groupKey === groupKey);
      return coverageOption ? [coverageOption.groupKey] : [];
    }));
    const configuredOptions = LABOR_MODEL_ROLE_COVERAGE_OPTIONS
      .filter((option) => configuredGroups.size === 0 || configuredGroups.has(option.groupKey))
      .map((option) => ({
        value: option.label,
        label: `${getHourAnalysisGroupLabel(option.groupKey)} (${option.label})`,
      }));
    return [
      { value: LABOR_MODEL_FULL_COVERAGE_VALUE, label: "Full shift" },
      { value: LABOR_MODEL_HALF_COVERAGE_VALUE, label: "Half shift" },
      ...configuredOptions,
      { value: LABOR_MODEL_MARKETING_COVERAGE_VALUE, label: "Marketing" },
      { value: "", label: "Clear" },
    ];
  }, [approvedLaborPositionOptions]);
  const hourAnalysisCommitmentOptions = useMemo(() => (
    LABOR_EMPLOYMENT_COMMITMENT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
  ), []);
  const whatIfPreviewGroupKey = getHourAnalysisGroupKey({ position_title: whatIfPosition });
  const whatIfPreviewCommitment = readLaborEmploymentCommitment({ employment_commitment: whatIfCommitment }) || "full_time";
  const whatIfPreviewRange = hourAnalysisSettings.expectations[whatIfPreviewGroupKey]?.[whatIfPreviewCommitment] || makeHourAnalysisRangeTotals();
  const canAddHourAnalysisWhatIf = Boolean(String(whatIfPosition || "").trim());
  const renderHourAnalysisHeadcount = (base = 0, whatIf = 0) => {
    const projected = normalizeHourAnalysisNumber(base, 0) + normalizeHourAnalysisNumber(whatIf, 0);
    const scenarioDelta = normalizeHourAnalysisNumber(Math.abs(whatIf), 0);
    const scenarioCopy = whatIf > 0
      ? `${base} + ${scenarioDelta} what-if`
      : whatIf < 0
        ? `${base} - ${scenarioDelta} moved`
        : "";
    return (
      <span className="hour-analysis-headcount-stack">
        <strong>{projected}</strong>
        {whatIf ? <small>{scenarioCopy}</small> : null}
      </span>
    );
  };
  const hourAnalysisTargetProgress = hourAnalysisModel.totals.targetWeekly > 0
    ? Math.max(0, Math.min(100, (hourAnalysisModel.totals.projectedExpected / hourAnalysisModel.totals.targetWeekly) * 100))
    : 0;
  const hourAnalysisCapacityDelta = formatHourAnalysisCapacityRangeDelta(
    hourAnalysisModel.totals.projectedExpected,
    hourAnalysisModel.totals.capacityStandard,
  );
  const hourAnalysisDecision = useMemo(() => {
    const totals = hourAnalysisModel.totals;
    if (totals.hireDeficitHours > 0) {
      return {
        label: "Recruit",
        tone: "short",
        value: `${formatHourAnalysisHours(totals.hireDeficitHours)} hrs/wk short`,
        copy: `Start recruiting or add expected hours in the bottleneck roles. Expected capacity is ${formatHourAnalysisHours(totals.projectedExpected)} hrs/wk against a ${formatHourAnalysisHours(totals.targetWeekly)} hrs/wk target.`,
      };
    }
    if (totals.projectedExpected > totals.overRosteredWeekly) {
      return {
        label: "Overbuilt",
        tone: "surplus",
        value: `${formatHourAnalysisHours(totals.projectedExpected - totals.overRosteredWeekly)} hrs/wk over healthy`,
        copy: `Freeze offers, rescind speculative what-ifs, or reduce low-confidence hours. Expected capacity is above the high relief case where employees may stop getting the hours they expect.`,
      };
    }
    if (totals.expectedGapToTarget > 0) {
      return {
        label: "On target",
        tone: "healthy",
        value: `${formatHourAnalysisHours(totals.expectedGapToTarget)} hrs/wk reserve`,
        copy: `Expected capacity is inside the healthy band. Keep recruiting warm, but do not add headcount without a known demand change.`,
      };
    }
    return {
      label: "On target",
      tone: "healthy",
      value: "Coverage aligned",
      copy: `Expected capacity lands on the operating target. Maintain the roster and watch call-outs.`,
    };
  }, [hourAnalysisModel.totals]);
  const hourAnalysisPlanningResetSummary = useMemo(() => clearHourAnalysisPlanningState(hourAnalysisSettings).summary, [hourAnalysisSettings]);
  const hasHourAnalysisPlanningState = hourAnalysisPlanningResetSummary.changed;
  const markHourAnalysisChanged = useCallback((keys = []) => {
    const normalizedKeys = Array.isArray(keys) ? keys.filter(Boolean) : [keys].filter(Boolean);
    if (normalizedKeys.length === 0) return;
    setHourAnalysisChangedKeys((prev) => new Set([...prev, ...normalizedKeys]));
    window.setTimeout(() => {
      setHourAnalysisChangedKeys((prev) => {
        const next = new Set(prev);
        normalizedKeys.forEach((key) => next.delete(key));
        return next;
      });
    }, 1100);
  }, []);
  const appendHourAnalysisAudit = useCallback((settings, entry) => {
    const normalized = normalizeHourAnalysisSettings(settings);
    const occurredAt = new Date().toISOString();
    const auditEntry = {
      id: `hour-analysis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      occurred_at: occurredAt,
      actor_id: actorUserId,
      actor_name: actorName,
      ...entry,
    };
    return {
      ...normalized,
      auditLog: normalizeHourAnalysisAuditLog([auditEntry, ...(normalized.auditLog || [])]),
    };
  }, [actorName, actorUserId]);
  const resetHourAnalysisPlanningState = useCallback(() => {
    setHourAnalysisSettings((prev) => {
      const { settings, summary } = clearHourAnalysisPlanningState(prev);
      if (!summary.changed) return settings;
      markHourAnalysisChanged(["capacity", "planning-reset"]);
      return appendHourAnalysisAudit(settings, {
        action: "planning_state_reset",
        entity_id: "hour-analysis-planning",
        entity_label: "Capacity Planning",
        summary: `Reset planning state: removed ${summary.removedWhatIfRows} what-if row${summary.removedWhatIfRows === 1 ? "" : "s"} and ${summary.removedPositionMovements} planned role movement${summary.removedPositionMovements === 1 ? "" : "s"}. Expected Hours preferences were preserved.`,
        before: {
          what_if_rows: summary.removedWhatIfRows,
          planned_role_movements: summary.removedPositionMovements,
          what_if_notes: summary.removedWhatIfNotes,
          what_if_splits: summary.removedWhatIfSplits,
        },
        after: {
          what_if_rows: 0,
          planned_role_movements: 0,
        },
        note: "Expected Hours preferences preserved.",
      });
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const updateHourExpectation = useCallback((groupKey, commitment, band, value) => {
    const normalizedGroup = HOUR_ANALYSIS_GROUP_LABELS[groupKey] ? groupKey : "other";
    const normalizedCommitment = commitment === "part_time" ? "part_time" : "full_time";
    const normalizedBand = HOUR_ANALYSIS_RANGE_KEYS.includes(band) ? band : "expected";
    if (normalizedBand !== "expected") return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const currentRange = normalized.expectations[normalizedGroup]?.[normalizedCommitment] || DEFAULT_HOUR_ANALYSIS_EXPECTATIONS[normalizedGroup]?.[normalizedCommitment] || {};
      const before = normalizeHourAnalysisNumber(currentRange.expected, 0);
      const after = normalizeHourAnalysisNumber(value, 0);
      if (before === after) return normalized;
      markHourAnalysisChanged(["capacity", `group:${normalizedGroup}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "default_expected_hours_changed",
          entity_id: `${normalizedGroup}:${normalizedCommitment}`,
          entity_label: `${getHourAnalysisGroupLabel(normalizedGroup)} ${getLaborEmploymentCommitmentLabel(normalizedCommitment)}`,
          summary: `Changed default Expected Hours for ${getHourAnalysisGroupLabel(normalizedGroup)} ${getLaborEmploymentCommitmentLabel(normalizedCommitment)} from ${formatHourAnalysisHours(before)} to ${formatHourAnalysisHours(after)} hrs/wk.`,
          before,
          after,
        }),
        expectations: {
          ...normalized.expectations,
          [normalizedGroup]: {
            ...normalized.expectations[normalizedGroup],
            [normalizedCommitment]: updateHourAnalysisRangeBand(currentRange, normalizedBand, after),
          },
        },
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const updateHourAnalysisSkeletonHours = useCallback((groupKey, value) => {
    const normalizedGroup = HOUR_ANALYSIS_GROUP_LABELS[groupKey] ? groupKey : "other";
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const before = normalizeHourAnalysisNumber(normalized.thresholds.daily_skeleton[normalizedGroup], 0);
      const after = normalizeHourAnalysisNumber(value, 0);
      if (before === after) return normalized;
      markHourAnalysisChanged(["capacity", `group:${normalizedGroup}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "skeleton_hours_changed",
          entity_id: `skeleton:${normalizedGroup}`,
          entity_label: getHourAnalysisGroupLabel(normalizedGroup),
          summary: `Changed ${getHourAnalysisGroupLabel(normalizedGroup)} daily skeleton from ${formatHourAnalysisHours(before)} to ${formatHourAnalysisHours(after)} hrs/day.`,
          before,
          after,
        }),
        thresholds: {
          ...normalized.thresholds,
          daily_skeleton: {
            ...normalized.thresholds.daily_skeleton,
            [normalizedGroup]: after,
          },
        },
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const mutateHourAnalysisLaborModel = useCallback((mutator) => {
    if (typeof mutator !== "function") return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const result = mutator(normalized.laborModel, normalized);
      if (!result || !result.model) return normalized;
      const nextLaborModel = normalizeHourAnalysisLaborModel(result.model);
      if (JSON.stringify(normalized.laborModel) === JSON.stringify(nextLaborModel)) return normalized;
      const changedKeys = Array.isArray(result.changedKeys) && result.changedKeys.length > 0
        ? result.changedKeys
        : ["capacity", "labor-model"];
      markHourAnalysisChanged(changedKeys);
      return {
        ...appendHourAnalysisAudit(normalized, result.audit || {
          action: "labor_model_changed",
          entity_id: "labor-model",
          entity_label: "Labor Model",
          summary: "Updated Labor Model.",
          before: null,
          after: null,
        }),
        laborModel: nextLaborModel,
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const updateLaborModelRoleColor = useCallback((groupKey, colorValue) => {
    const normalizedGroup = Object.prototype.hasOwnProperty.call(LABOR_MODEL_ROLE_PALETTE, groupKey)
      ? groupKey
      : "other";
    const option = LABOR_MODEL_ROLE_COLOR_OPTIONS.find((item) => item.groupKey === normalizedGroup);
    const roleLabel = option?.label || getHourAnalysisGroupLabel(normalizedGroup);
    const nextPalette = buildLaborModelRolePalette(normalizedGroup, colorValue);
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const beforePalette = getLaborModelRolePalette(normalizedGroup, normalized.laborModelRoleColors);
      if (beforePalette.strong === nextPalette.strong) return normalized;
      markHourAnalysisChanged(["capacity", "labor-model", "labor-model-colors"]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "labor_model_role_color_changed",
          entity_id: `labor-model-color:${normalizedGroup}`,
          entity_label: `${roleLabel} Labor Model Color`,
          summary: `Changed ${roleLabel} Labor Model color from ${beforePalette.strong} to ${nextPalette.strong}.`,
          before: beforePalette.strong,
          after: nextPalette.strong,
        }),
        laborModelRoleColors: {
          ...normalized.laborModelRoleColors,
          [normalizedGroup]: nextPalette,
        },
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const updateHourAnalysisLaborModelCell = useCallback((dayKey, rowId, columnIndex, value) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const normalizedColumnIndex = Number(columnIndex);
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const day = normalizedModel.days[normalizedDay];
      const row = day.rows.find((item) => item.id === rowId);
      if (!row || !Number.isInteger(normalizedColumnIndex) || normalizedColumnIndex < 0 || normalizedColumnIndex >= day.columns.length) return null;
      const before = String(row.coverage[normalizedColumnIndex] || "").trim();
      const after = normalizeLaborModelCoverageCell(value);
      if (before === after) return null;
      const nextRows = day.rows.map((item) => (
        item.id === rowId
          ? { ...item, coverage: item.coverage.map((cell, index) => (index === normalizedColumnIndex ? after : cell)) }
          : item
      ));
      return {
        model: { ...normalizedModel, days: { ...normalizedModel.days, [normalizedDay]: { ...day, rows: nextRows } } },
        changedKeys: ["capacity", "labor-model", `labor-model:${normalizedDay}`],
        audit: {
          action: "labor_model_cell_changed",
          entity_id: `labor-model:${normalizedDay}:${rowId}:${normalizedColumnIndex}`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${row.role_label}`,
          summary: `Changed ${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${row.role_label} coverage at ${day.columns[normalizedColumnIndex]?.label || "time slot"}.`,
          before,
          after,
        },
      };
    });
  }, [mutateHourAnalysisLaborModel]);
  const toggleLaborModelCellSelection = useCallback((dayKey, rowId, columnIndex) => {
    const key = makeLaborModelCellKey(dayKey, rowId, columnIndex);
    setSelectedLaborModelCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const updateSelectedLaborModelCells = useCallback((value, action = null) => {
    const selectedKeys = [...selectedLaborModelCells];
    if (selectedKeys.length === 0) return;
    const defaultAfter = normalizeLaborModelCoverageCell(value);
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const nextDays = { ...normalizedModel.days };
      const changedDays = new Set();
      const before = [];
      selectedKeys.forEach((key) => {
        const [dayKey, rowId, columnIndexRaw] = key.split("::");
        const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "";
        const columnIndex = Number(columnIndexRaw);
        if (!normalizedDay || !rowId || !Number.isInteger(columnIndex)) return;
        const day = nextDays[normalizedDay];
        const row = day?.rows?.find((item) => item.id === rowId);
        if (!day || !row || columnIndex < 0 || columnIndex >= day.columns.length) return;
        const current = String(row.coverage[columnIndex] || "").trim();
        const after = action?.type === "duration"
          ? setLaborModelCoverageDuration(current, row.group_key, action.duration)
          : action?.type === "position"
            ? setLaborModelCoveragePosition(current, row.group_key, action.positionValue)
            : action?.type === "clear"
              ? ""
              : defaultAfter;
        if (current === after) return;
        before.push({
          day_key: normalizedDay,
          row_id: rowId,
          column_index: columnIndex,
          before: current,
          after,
        });
        nextDays[normalizedDay] = {
          ...day,
          rows: day.rows.map((item) => (
            item.id === rowId
              ? { ...item, coverage: item.coverage.map((cell, index) => (index === columnIndex ? after : cell)) }
              : item
          )),
        };
        changedDays.add(normalizedDay);
      });
      if (before.length === 0) return null;
      return {
        model: { ...normalizedModel, days: nextDays },
        changedKeys: ["capacity", "labor-model", ...[...changedDays].map((dayKey) => `labor-model:${dayKey}`)],
        audit: {
          action: "labor_model_bulk_cells_changed",
          entity_id: "labor-model:bulk-cells",
          entity_label: "Labor Model bulk edit",
          summary: `Changed ${before.length} selected Labor Model cell${before.length === 1 ? "" : "s"}.`,
          before,
          after: action || defaultAfter,
        },
      };
    });
    setSelectedLaborModelCells(new Set());
  }, [mutateHourAnalysisLaborModel, selectedLaborModelCells]);
  const updateHourAnalysisLaborModelCellOrSelection = useCallback((dayKey, rowId, columnIndex, value, action = null) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const cellKey = makeLaborModelCellKey(normalizedDay, rowId, columnIndex);
    if (selectedLaborModelCells.has(cellKey)) {
      updateSelectedLaborModelCells(value, action);
      return;
    }
    updateHourAnalysisLaborModelCell(normalizedDay, rowId, columnIndex, value);
  }, [selectedLaborModelCells, updateHourAnalysisLaborModelCell, updateSelectedLaborModelCells]);
  const updateHourAnalysisLaborModelRow = useCallback((dayKey, rowId, updates = {}) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const day = normalizedModel.days[normalizedDay];
      const row = day.rows.find((item) => item.id === rowId);
      if (!row) return null;
      const before = row;
      const nextRoleLabel = Object.prototype.hasOwnProperty.call(updates, "role_label")
        ? String(updates.role_label || "").trim() || row.role_label
        : row.role_label;
      const nextGroupKey = Object.prototype.hasOwnProperty.call(updates, "group_key")
        ? normalizeLaborModelGroupKey(updates.group_key, { ...row, role_label: nextRoleLabel })
        : row.group_key;
      const nextShiftType = Object.prototype.hasOwnProperty.call(updates, "shift_type")
        ? normalizeLaborModelShiftType(updates.shift_type, row)
        : row.shift_type;
      const nextBreakEnabled = Object.prototype.hasOwnProperty.call(updates, "break_enabled")
        ? Boolean(updates.break_enabled)
        : Boolean(row.break_enabled);
      const nextBreakMinutes = Object.prototype.hasOwnProperty.call(updates, "break_minutes")
        ? normalizeLaborModelBreakMinutes(updates.break_minutes, row.break_minutes || 30)
        : normalizeLaborModelBreakMinutes(row.break_minutes, 30);
      const after = {
        ...row,
        role_label: nextRoleLabel,
        group_key: nextGroupKey,
        shift_type: nextShiftType,
        break_enabled: nextBreakEnabled,
        break_minutes: nextBreakMinutes,
      };
      if (
        before.role_label === after.role_label
        && before.group_key === after.group_key
        && before.shift_type === after.shift_type
        && Boolean(before.break_enabled) === Boolean(after.break_enabled)
        && normalizeLaborModelBreakMinutes(before.break_minutes, 30) === after.break_minutes
      ) return null;
      return {
        model: {
          ...normalizedModel,
          days: {
            ...normalizedModel.days,
            [normalizedDay]: {
              ...day,
              rows: day.rows.map((item) => (item.id === rowId ? after : item)),
            },
          },
        },
        changedKeys: ["capacity", "labor-model", `labor-model:${normalizedDay}`],
        audit: {
          action: "labor_model_row_changed",
          entity_id: `labor-model:${normalizedDay}:${rowId}`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${row.role_label}`,
          summary: `Updated Labor Model line ${row.role_label} on ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`,
          before,
          after,
        },
      };
    });
  }, [mutateHourAnalysisLaborModel]);
  const insertHourAnalysisLaborModelRow = useCallback((dayKey, afterRowId = "") => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const day = normalizedModel.days[normalizedDay];
      const insertIndex = afterRowId ? day.rows.findIndex((row) => row.id === afterRowId) + 1 : day.rows.length;
      const safeIndex = Math.max(0, Math.min(day.rows.length, insertIndex || day.rows.length));
      const referenceRow = day.rows[Math.max(0, safeIndex - 1)] || day.rows[safeIndex] || {};
      const nextRow = {
        id: `${normalizedDay}-line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        group_key: referenceRow.group_key || "pct",
        role_label: `${getHourAnalysisGroupLabel(referenceRow.group_key || "pct")} ${LABOR_MODEL_SHIFT_TYPE_LABELS[referenceRow.shift_type || "opening"] || "Opening"}`,
        shift_type: referenceRow.shift_type || "opening",
        break_enabled: referenceRow.break_enabled ?? true,
        break_minutes: normalizeLaborModelBreakMinutes(referenceRow.break_minutes, 30),
        coverage: Array.from({ length: day.columns.length }, () => ""),
      };
      const nextRows = [...day.rows];
      nextRows.splice(safeIndex, 0, nextRow);
      return {
        model: { ...normalizedModel, days: { ...normalizedModel.days, [normalizedDay]: { ...day, rows: nextRows } } },
        changedKeys: ["capacity", "labor-model", `labor-model:${normalizedDay}`, `labor-model-row:${nextRow.id}`],
        audit: {
          action: "labor_model_row_added",
          entity_id: `labor-model:${normalizedDay}:${nextRow.id}`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${nextRow.role_label}`,
          summary: `Inserted a Labor Model line on ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`,
          before: null,
          after: nextRow,
        },
      };
    });
  }, [mutateHourAnalysisLaborModel]);
  const removeHourAnalysisLaborModelRow = useCallback((dayKey, rowId) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const day = normalizedModel.days[normalizedDay];
      const targetRow = day.rows.find((row) => row.id === rowId);
      if (!targetRow) return null;
      return {
        model: {
          ...normalizedModel,
          days: {
            ...normalizedModel.days,
            [normalizedDay]: {
              ...day,
              rows: day.rows.filter((row) => row.id !== rowId),
            },
          },
        },
        changedKeys: ["capacity", "labor-model", `labor-model:${normalizedDay}`],
        audit: {
          action: "labor_model_row_removed",
          entity_id: `labor-model:${normalizedDay}:${rowId}`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${targetRow.role_label}`,
          summary: `Removed Labor Model line ${targetRow.role_label} from ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`,
          before: targetRow,
          after: null,
        },
      };
    });
  }, [mutateHourAnalysisLaborModel]);
  const updateHourAnalysisLaborModelColumn = useCallback((dayKey, columnIndex, updates = {}) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const normalizedColumnIndex = Number(columnIndex);
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const day = normalizedModel.days[normalizedDay];
      if (!Number.isInteger(normalizedColumnIndex) || normalizedColumnIndex < 0 || normalizedColumnIndex >= day.columns.length) return null;
      const before = day.columns[normalizedColumnIndex];
      const nextLabel = Object.prototype.hasOwnProperty.call(updates, "label") ? String(updates.label || "").trim() || before.label : before.label;
      const parsedRange = parseLaborModelTimeRange(nextLabel);
      if (Object.prototype.hasOwnProperty.call(updates, "label") && !parsedRange.valid) {
        addGlobalToast?.(parsedRange.error || "Use a valid time range.", "error");
        return null;
      }
      const after = {
        ...before,
        label: nextLabel,
        hours: parsedRange.valid ? parsedRange.hours : normalizeHourAnalysisNumber(updates.hours ?? before.hours, before.hours),
        start_minutes: parsedRange.valid ? parsedRange.start : before.start_minutes,
        end_minutes: parsedRange.valid ? parsedRange.end : before.end_minutes,
        is_valid: parsedRange.valid,
        validation_error: parsedRange.valid ? "" : before.validation_error,
      };
      if (before.label === after.label && before.hours === after.hours) return null;
      const nextColumnsForValidation = day.columns.map((column, index) => (index === normalizedColumnIndex ? after : column));
      const validation = validateLaborModelColumns(nextColumnsForValidation);
      if (!validation.valid) {
        const error = validation.errors.find((item) => item.index === normalizedColumnIndex) || validation.errors[0];
        addGlobalToast?.(error?.message || "Time slots must be contiguous.", "error");
        return null;
      }
      return {
        model: {
          ...normalizedModel,
          days: {
            ...normalizedModel.days,
            [normalizedDay]: {
              ...day,
              columns: day.columns.map((column, index) => (index === normalizedColumnIndex ? after : column)),
            },
          },
        },
        changedKeys: ["capacity", "labor-model", `labor-model:${normalizedDay}`],
        audit: {
          action: "labor_model_column_changed",
          entity_id: `labor-model:${normalizedDay}:slot-${normalizedColumnIndex}`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${before.label}`,
          summary: `Updated Labor Model time slot ${before.label} on ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`,
          before,
          after,
        },
      };
    });
  }, [addGlobalToast, mutateHourAnalysisLaborModel]);
  const insertHourAnalysisLaborModelColumn = useCallback((dayKey, columnIndex, side = "right") => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const normalizedColumnIndex = Number(columnIndex);
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const day = normalizedModel.days[normalizedDay];
      const targetIndex = Number.isInteger(normalizedColumnIndex)
        ? Math.max(0, Math.min(day.columns.length - 1, normalizedColumnIndex))
        : day.columns.length - 1;
      const targetColumn = day.columns[targetIndex] || day.columns[day.columns.length - 1] || { label: "8-9a", hours: 1 };
      const parsedTarget = parseLaborModelTimeRange(targetColumn.label);
      let safeIndex = side === "left" ? targetIndex : targetIndex + 1;
      let nextColumn;
      let nextColumns = [...day.columns];
      const nextRows = day.rows.map((row) => ({ ...row, coverage: [...row.coverage] }));
      if (parsedTarget.valid && targetIndex >= 0 && targetIndex < day.columns.length) {
        if (side === "left" && targetIndex === 0) {
          const durationMinutes = 30;
          const start = parsedTarget.start - durationMinutes;
          const end = parsedTarget.start;
          nextColumn = {
            id: `${normalizedDay}-slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            label: formatLaborModelTimeRange(start, end),
            hours: normalizeHourAnalysisNumber(durationMinutes / 60, 0),
          };
          safeIndex = 0;
        } else if (side === "right" && targetIndex === day.columns.length - 1) {
          const durationMinutes = Math.max(15, Math.round((parsedTarget.end - parsedTarget.start) / 15) * 15 || 30);
          const start = parsedTarget.end;
          const end = parsedTarget.end + durationMinutes;
          nextColumn = {
            id: `${normalizedDay}-slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            label: formatLaborModelTimeRange(start, end),
            hours: normalizeHourAnalysisNumber(durationMinutes / 60, 0),
          };
          safeIndex = day.columns.length;
        } else {
          const midpoint = parsedTarget.start + Math.max(15, Math.round(((parsedTarget.end - parsedTarget.start) / 2) / 15) * 15);
          const firstLabel = formatLaborModelTimeRange(parsedTarget.start, midpoint);
          const secondLabel = formatLaborModelTimeRange(midpoint, parsedTarget.end);
          const firstHours = parseLaborModelTimeRange(firstLabel).hours;
          const secondHours = parseLaborModelTimeRange(secondLabel).hours;
          nextColumn = {
            id: `${normalizedDay}-slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            label: side === "left" ? firstLabel : secondLabel,
            hours: side === "left" ? firstHours : secondHours,
          };
          nextColumns[targetIndex] = {
            ...targetColumn,
            label: side === "left" ? secondLabel : firstLabel,
            hours: side === "left" ? secondHours : firstHours,
          };
          safeIndex = side === "left" ? targetIndex : targetIndex + 1;
          nextRows.forEach((row) => {
            const copiedValue = row.coverage[targetIndex] || "";
            row.coverage.splice(safeIndex, 0, copiedValue);
          });
        }
      }
      if (!nextColumn) {
        const referenceColumn = day.columns[Math.max(0, safeIndex - 1)] || day.columns[safeIndex] || {};
        nextColumn = {
          id: `${normalizedDay}-slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          label: "New time",
          hours: normalizeHourAnalysisNumber(referenceColumn.hours, 1),
        };
      }
      if (!parsedTarget.valid || targetIndex < 0 || targetIndex >= day.columns.length || (parsedTarget.valid && (side === "left" && targetIndex === 0 || side === "right" && targetIndex === day.columns.length - 1))) {
        nextRows.forEach((row) => {
          row.coverage.splice(safeIndex, 0, "");
        });
      }
      nextColumns.splice(safeIndex, 0, nextColumn);
      return {
        model: { ...normalizedModel, days: { ...normalizedModel.days, [normalizedDay]: { ...day, columns: nextColumns, rows: nextRows } } },
        changedKeys: ["capacity", "labor-model", `labor-model:${normalizedDay}`, `labor-model-column:${nextColumn.id}`],
        audit: {
          action: "labor_model_column_added",
          entity_id: `labor-model:${normalizedDay}:${nextColumn.id}`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${nextColumn.label}`,
          summary: `Inserted a Labor Model time slot on ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`,
          before: null,
          after: nextColumn,
        },
      };
    });
  }, [mutateHourAnalysisLaborModel]);
  const removeHourAnalysisLaborModelColumn = useCallback((dayKey, columnIndex) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const normalizedColumnIndex = Number(columnIndex);
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const day = normalizedModel.days[normalizedDay];
      if (day.columns.length <= 1 || !Number.isInteger(normalizedColumnIndex) || normalizedColumnIndex < 0 || normalizedColumnIndex >= day.columns.length) return null;
      const result = removeLaborModelColumnFromDay(day, normalizedColumnIndex, normalizedDay);
      if (result.error) {
        addGlobalToast?.(result.error, "error");
        return null;
      }
      return {
        model: {
          ...normalizedModel,
          days: {
            ...normalizedModel.days,
            [normalizedDay]: result.day,
          },
        },
        changedKeys: ["capacity", "labor-model", `labor-model:${normalizedDay}`],
        audit: {
          action: "labor_model_column_removed",
          entity_id: `labor-model:${normalizedDay}:slot-${normalizedColumnIndex}`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} ${result.removedColumn?.label || "time slot"}`,
          summary: `Removed Labor Model time slot ${result.removedColumn?.label || "time slot"} from ${LABOR_MODEL_DAY_LABELS[normalizedDay]} and merged the adjacent time range.`,
          before: result.removedColumn,
          after: result.mergedColumn || null,
        },
      };
    });
  }, [addGlobalToast, mutateHourAnalysisLaborModel]);
  const updateHourAnalysisLaborModelBreakers = useCallback((dayKey, breakers, auditSummary = "Updated grey bars.") => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const before = getLaborModelBreakersForDay(normalizedModel.breakers, normalizedDay);
      const nextBreakers = updateLaborModelBreakersForDay(normalizedModel.breakers, normalizedDay, breakers);
      const after = getLaborModelBreakersForDay(nextBreakers, normalizedDay);
      if (JSON.stringify(before) === JSON.stringify(after)) return null;
      return {
        model: { ...normalizedModel, breakers: nextBreakers },
        changedKeys: ["capacity", "labor-model", "labor-model-breakers", `labor-model:${normalizedDay}`],
        audit: {
          action: "labor_model_breakers_changed",
          entity_id: `labor-model:${normalizedDay}:breakers`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedDay]} grey bars`,
          summary: auditSummary,
          before,
          after,
        },
      };
    });
  }, [mutateHourAnalysisLaborModel]);
  const addLaborModelBreaker = useCallback((dayKey) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const current = getLaborModelBreakersForDay(hourAnalysisSettings.laborModel?.breakers, normalizedDay);
    const last = current[current.length - 1]?.minutes;
    const nextMinute = Number.isFinite(last) ? Math.min(23 * 60 + 45, last + 60) : 12 * 60;
    updateHourAnalysisLaborModelBreakers(normalizedDay, [...current, { minutes: nextMinute }], `Added a grey bar to ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`);
  }, [hourAnalysisSettings.laborModel?.breakers, updateHourAnalysisLaborModelBreakers]);
  const updateLaborModelBreaker = useCallback((dayKey, index, value) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const current = getLaborModelBreakersForDay(hourAnalysisSettings.laborModel?.breakers, normalizedDay);
    const normalizedIndex = Number(index);
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= current.length) return;
    const nextMinute = normalizeLaborModelBreakerMinute(value);
    if (!Number.isFinite(nextMinute)) {
      addGlobalToast?.("Use a time like 1p or 6:30a.", "error");
      return;
    }
    const nextBreakers = current.map((breaker, breakerIndex) => (
      breakerIndex === normalizedIndex ? { ...breaker, minutes: nextMinute, label: formatLaborModelTimePoint(nextMinute) } : breaker
    ));
    updateHourAnalysisLaborModelBreakers(normalizedDay, nextBreakers, `Moved a ${LABOR_MODEL_DAY_LABELS[normalizedDay]} grey bar to ${formatLaborModelTimePoint(nextMinute)}.`);
  }, [addGlobalToast, hourAnalysisSettings.laborModel?.breakers, updateHourAnalysisLaborModelBreakers]);
  const deleteLaborModelBreaker = useCallback((dayKey, index) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    const current = getLaborModelBreakersForDay(hourAnalysisSettings.laborModel?.breakers, normalizedDay);
    const normalizedIndex = Number(index);
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= current.length) return;
    updateHourAnalysisLaborModelBreakers(
      normalizedDay,
      current.filter((_, breakerIndex) => breakerIndex !== normalizedIndex),
      `Removed a grey bar from ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`
    );
  }, [hourAnalysisSettings.laborModel?.breakers, updateHourAnalysisLaborModelBreakers]);
  const resetLaborModelBreakers = useCallback((dayKey) => {
    const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
    updateHourAnalysisLaborModelBreakers(
      normalizedDay,
      LABOR_MODEL_DEFAULT_BREAKERS_BY_DAY[normalizedDay] || [],
      `Restored default grey bars for ${LABOR_MODEL_DAY_LABELS[normalizedDay]}.`
    );
  }, [updateHourAnalysisLaborModelBreakers]);
  const copyLaborModelBreakersToTargets = useCallback((sourceDay, targetDays) => {
    const normalizedSourceDay = LABOR_MODEL_DAY_KEYS.includes(sourceDay) ? sourceDay : "monday";
    const normalizedTargets = Array.isArray(targetDays)
      ? targetDays.filter((dayKey) => LABOR_MODEL_DAY_KEYS.includes(dayKey) && dayKey !== normalizedSourceDay)
      : [];
    if (normalizedTargets.length === 0) {
      addGlobalToast?.("Choose at least one day to copy to.", "error");
      return;
    }
    mutateHourAnalysisLaborModel((model) => {
      const normalizedModel = normalizeHourAnalysisLaborModel(model);
      const before = normalizeLaborModelBreakerSettings(normalizedModel.breakers);
      const after = copyLaborModelBreakers(before, normalizedSourceDay, normalizedTargets);
      if (JSON.stringify(before) === JSON.stringify(after)) return null;
      return {
        model: { ...normalizedModel, breakers: after },
        changedKeys: ["capacity", "labor-model", "labor-model-breakers", ...normalizedTargets.map((dayKey) => `labor-model:${dayKey}`)],
        audit: {
          action: "labor_model_breakers_copied",
          entity_id: `labor-model:${normalizedSourceDay}:breakers-copy`,
          entity_label: `${LABOR_MODEL_DAY_LABELS[normalizedSourceDay]} grey bars`,
          summary: `Copied ${LABOR_MODEL_DAY_LABELS[normalizedSourceDay]} grey bars to ${normalizedTargets.map((dayKey) => LABOR_MODEL_DAY_LABELS[dayKey]).join(", ")}.`,
          before,
          after,
        },
      };
    });
    setLaborModelBreakerCopyTargets([]);
  }, [addGlobalToast, mutateHourAnalysisLaborModel]);
  const startLaborModelCoverageDrag = useCallback((dayKey, rowId, columnIndex, nextValue) => {
    const normalizedValue = normalizeLaborModelCoverageCell(nextValue);
    const selection = { dayKey, value: normalizedValue };
    laborModelDragSelectionRef.current = selection;
    setLaborModelDragSelection(selection);
    updateHourAnalysisLaborModelCell(dayKey, rowId, columnIndex, normalizedValue);
  }, [updateHourAnalysisLaborModelCell]);
  const enterLaborModelCoverageDrag = useCallback((dayKey, rowId, columnIndex) => {
    const activeSelection = laborModelDragSelectionRef.current;
    if (!activeSelection || activeSelection.dayKey !== dayKey) return;
    updateHourAnalysisLaborModelCell(dayKey, rowId, columnIndex, activeSelection.value);
  }, [updateHourAnalysisLaborModelCell]);

  useEffect(() => {
    if (!laborModelDragSelection) return undefined;
    const clearDrag = () => {
      laborModelDragSelectionRef.current = null;
      setLaborModelDragSelection(null);
    };
    window.addEventListener("mouseup", clearDrag);
    window.addEventListener("pointerup", clearDrag);
    return () => {
      window.removeEventListener("mouseup", clearDrag);
      window.removeEventListener("pointerup", clearDrag);
    };
  }, [laborModelDragSelection]);

  const setHourAnalysisEmployeeOverride = useCallback((employeeKey, band, hours) => {
    const normalizedKey = String(employeeKey || "").trim();
    if (!normalizedKey) return;
    const normalizedBand = HOUR_ANALYSIS_RANGE_KEYS.includes(band) ? band : "expected";
    if (normalizedBand !== "expected") return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const before = normalizeHourAnalysisNumber(normalized.overrides[normalizedKey]?.expected, 0);
      const after = normalizeHourAnalysisNumber(hours, 0);
      if (before === after && Object.prototype.hasOwnProperty.call(normalized.overrides[normalizedKey] || {}, "expected")) return normalized;
      markHourAnalysisChanged(["capacity", `row:${normalizedKey}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "expected_hours_overridden",
          entity_id: normalizedKey,
          entity_label: normalizedKey,
          summary: `Set Expected Hours override to ${formatHourAnalysisHours(after)} hrs/wk.`,
          before: Object.prototype.hasOwnProperty.call(normalized.overrides[normalizedKey] || {}, "expected") ? before : null,
          after,
          note: normalized.notes[normalizedKey] || "",
        }),
        overrides: {
          ...normalized.overrides,
          [normalizedKey]: {
            ...(normalized.overrides[normalizedKey] || {}),
            [normalizedBand]: after,
          },
        },
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const clearHourAnalysisEmployeeOverride = useCallback((employeeKey, band) => {
    const normalizedKey = String(employeeKey || "").trim();
    if (!normalizedKey) return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const nextOverrides = { ...normalized.overrides };
      if (HOUR_ANALYSIS_RANGE_KEYS.includes(band)) {
        if (band !== "expected") return normalized;
        const nextRange = { ...(nextOverrides[normalizedKey] || {}) };
        if (!Object.prototype.hasOwnProperty.call(nextRange, band)) return normalized;
        const before = nextRange[band];
        delete nextRange[band];
        if (Object.keys(nextRange).length === 0) delete nextOverrides[normalizedKey];
        else nextOverrides[normalizedKey] = nextRange;
        markHourAnalysisChanged(["capacity", `row:${normalizedKey}`]);
        return {
          ...appendHourAnalysisAudit(normalized, {
            action: "expected_hours_inherited",
            entity_id: normalizedKey,
            entity_label: normalizedKey,
            summary: `Cleared Expected Hours override and returned to inherited default.`,
            before,
            after: null,
            note: normalized.notes[normalizedKey] || "",
          }),
          overrides: nextOverrides,
        };
      } else {
        delete nextOverrides[normalizedKey];
      }
      markHourAnalysisChanged(["capacity", `row:${normalizedKey}`]);
      return { ...appendHourAnalysisAudit(normalized, {
        action: "expected_hours_inherited",
        entity_id: normalizedKey,
        entity_label: normalizedKey,
        summary: `Cleared all Expected Hours overrides.`,
        before: normalized.overrides[normalizedKey] || null,
        after: null,
        note: normalized.notes[normalizedKey] || "",
      }), overrides: nextOverrides };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const updateHourAnalysisNote = useCallback((employeeKey, note) => {
    const normalizedKey = String(employeeKey || "").trim();
    if (!normalizedKey) return;
    const nextNote = String(note || "").trim();
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const before = normalized.notes[normalizedKey] || "";
      if (before === nextNote) return normalized;
      const nextNotes = { ...normalized.notes };
      if (nextNote) nextNotes[normalizedKey] = nextNote;
      else delete nextNotes[normalizedKey];
      markHourAnalysisChanged([`row:${normalizedKey}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "justification_note_changed",
          entity_id: normalizedKey,
          entity_label: normalizedKey,
          summary: nextNote ? "Updated Expected Hours justification note." : "Cleared Expected Hours justification note.",
          before,
          after: nextNote,
          note: nextNote,
        }),
        notes: nextNotes,
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const updateHourAnalysisCoverageSplit = useCallback((employeeKey, updates = {}) => {
    const normalizedKey = String(employeeKey || "").trim();
    if (!normalizedKey) return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const current = normalizeHourAnalysisCoverageSplit(normalized.splits[normalizedKey]);
      const nextSplit = normalizeHourAnalysisCoverageSplit({ ...current, ...updates });
      if (current.floor_group === nextSplit.floor_group && current.admin_hours === nextSplit.admin_hours) return normalized;
      const nextSplits = { ...normalized.splits };
      if (!nextSplit.floor_group && nextSplit.admin_hours == null) delete nextSplits[normalizedKey];
      else nextSplits[normalizedKey] = nextSplit;
      markHourAnalysisChanged(["capacity", `row:${normalizedKey}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "coverage_split_changed",
          entity_id: normalizedKey,
          entity_label: normalizedKey,
          summary: nextSplit.floor_group
            ? `Changed coverage split to ${formatHourAnalysisHours(nextSplit.admin_hours || 0)} admin hrs/wk plus ${getHourAnalysisGroupLabel(nextSplit.floor_group)} floor coverage.`
            : "Cleared coverage split.",
          before: current,
          after: nextSplit,
          note: normalized.notes[normalizedKey] || "",
        }),
        splits: nextSplits,
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const updateHourAnalysisPositionMovement = useCallback((row = {}, nextPositionTitle = "") => {
    const normalizedKey = String(row.employeeKey || row.id || "").trim();
    if (!normalizedKey || row.isWhatIf) return;
    const sourcePosition = formatLaborPositionTitle(row.sourcePositionTitle || row.position_title || row.position || "");
    const targetPosition = formatLaborPositionTitle(nextPositionTitle || "");
    const sourceGroup = row.sourceGroupKey || getHourAnalysisGroupKey({ position_title: sourcePosition });
    const targetGroup = targetPosition ? getHourAnalysisGroupKey({ position_title: targetPosition }) : sourceGroup;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const currentMovement = normalizeHourAnalysisPositionMovement(normalized.positionMovements[normalizedKey]);
      const currentTarget = currentMovement.position_title || "";
      const shouldClear = !targetPosition || normalizePositionTitle(targetPosition) === normalizePositionTitle(sourcePosition);
      if (shouldClear && !currentTarget) return normalized;
      if (!shouldClear && normalizePositionTitle(currentTarget) === normalizePositionTitle(targetPosition)) return normalized;
      const nextMovements = { ...normalized.positionMovements };
      if (shouldClear) delete nextMovements[normalizedKey];
      else nextMovements[normalizedKey] = normalizeHourAnalysisPositionMovement({ position_title: targetPosition });
      markHourAnalysisChanged(["capacity", `row:${normalizedKey}`, `group:${sourceGroup}`, shouldClear ? null : `group:${targetGroup}`].filter(Boolean));
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: shouldClear ? "position_movement_cleared" : "position_movement_changed",
          entity_id: normalizedKey,
          entity_label: row.full_name || normalizedKey,
          summary: shouldClear
            ? `Cleared planned role movement for ${row.full_name || "employee"} and returned them to ${sourcePosition || "their roster position"}.`
            : `Planned role movement for ${row.full_name || "employee"}: ${sourcePosition || "Roster position"} to ${targetPosition}.`,
          before: currentTarget ? {
            source_position_title: sourcePosition,
            target_position_title: currentTarget,
            source_group_key: sourceGroup,
            target_group_key: currentMovement.group_key || getHourAnalysisGroupKey({ position_title: currentTarget }),
          } : null,
          after: shouldClear ? null : {
            source_position_title: sourcePosition,
            target_position_title: targetPosition,
            source_group_key: sourceGroup,
            target_group_key: targetGroup,
          },
          note: normalized.notes[normalizedKey] || "",
        }),
        positionMovements: nextMovements,
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const resetWhatIfHourAnalysisForm = useCallback(() => {
    setWhatIfEmployeeName("");
    setWhatIfPosition("");
    setWhatIfCommitment("full_time");
    setWhatIfHourOverrides({});
    setWhatIfNote("");
  }, []);
  const addHourAnalysisWhatIfRow = useCallback(() => {
    const positionTitle = formatLaborPositionTitle(whatIfPosition);
    const groupKey = getHourAnalysisGroupKey({ position_title: positionTitle });
    if (!positionTitle) return;
    const nextRow = {
      id: `what-if-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      scenario_type: "add",
      source_employee_key: "",
      source_full_name: "",
      source_position_title: "",
      source_employment_commitment: "",
      source_group_key: "",
      full_name: whatIfEmployeeName.trim() || "What-if Employee",
      position_title: positionTitle || getHourAnalysisGroupLabel(groupKey),
      employment_commitment: readLaborEmploymentCommitment({ employment_commitment: whatIfCommitment }) || "full_time",
      group_key: groupKey,
      hour_overrides: normalizeHourAnalysisOverrideRange(whatIfHourOverrides),
      split: normalizeHourAnalysisCoverageSplit({}),
      note: whatIfNote.trim(),
    };
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      markHourAnalysisChanged(["capacity", `row:${nextRow.id}`, `group:${groupKey}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "what_if_added",
          entity_id: nextRow.id,
          entity_label: nextRow.full_name,
          summary: `Added what-if ${nextRow.full_name} as ${getHourAnalysisGroupLabel(groupKey)} / ${getLaborEmploymentCommitmentLabel(nextRow.employment_commitment)}.`,
          before: null,
          after: nextRow,
          note: nextRow.note,
        }),
        whatIfRows: [...normalized.whatIfRows, nextRow],
      };
    });
    setShowHourAnalysisWhatIfModal(false);
    resetWhatIfHourAnalysisForm();
  }, [appendHourAnalysisAudit, markHourAnalysisChanged, resetWhatIfHourAnalysisForm, whatIfCommitment, whatIfEmployeeName, whatIfHourOverrides, whatIfNote, whatIfPosition]);
  const updateHourAnalysisWhatIfOverride = useCallback((rowId, band, hours) => {
    const normalizedId = String(rowId || "").trim();
    if (!normalizedId) return;
    const normalizedBand = HOUR_ANALYSIS_RANGE_KEYS.includes(band) ? band : "expected";
    if (normalizedBand !== "expected") return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const row = normalized.whatIfRows.find((item) => item.id === normalizedId);
      if (!row) return normalized;
      const before = normalizeHourAnalysisNumber(row.hour_overrides?.expected, 0);
      const after = normalizeHourAnalysisNumber(hours, 0);
      if (before === after && Object.prototype.hasOwnProperty.call(row.hour_overrides || {}, "expected")) return normalized;
      markHourAnalysisChanged(["capacity", `row:${normalizedId}`, `group:${row.group_key}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "what_if_expected_hours_changed",
          entity_id: normalizedId,
          entity_label: row.full_name,
          summary: `Changed what-if Expected Hours for ${row.full_name} to ${formatHourAnalysisHours(after)} hrs/wk.`,
          before: Object.prototype.hasOwnProperty.call(row.hour_overrides || {}, "expected") ? before : null,
          after,
          note: row.note || "",
        }),
        whatIfRows: normalized.whatIfRows.map((row) => (
          row.id === normalizedId
            ? {
                ...row,
                hour_overrides: {
                  ...(row.hour_overrides || {}),
                  [normalizedBand]: after,
                },
              }
            : row
        )),
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const clearHourAnalysisWhatIfOverride = useCallback((rowId, band) => {
    const normalizedId = String(rowId || "").trim();
    if (!normalizedId) return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const targetRow = normalized.whatIfRows.find((row) => row.id === normalizedId);
      if (!targetRow) return normalized;
      if (HOUR_ANALYSIS_RANGE_KEYS.includes(band) && band !== "expected") return normalized;
      const before = targetRow.hour_overrides?.expected;
      if (HOUR_ANALYSIS_RANGE_KEYS.includes(band) && !Object.prototype.hasOwnProperty.call(targetRow.hour_overrides || {}, band)) return normalized;
      markHourAnalysisChanged(["capacity", `row:${normalizedId}`, `group:${targetRow.group_key}`]);
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "what_if_expected_hours_inherited",
          entity_id: normalizedId,
          entity_label: targetRow.full_name,
          summary: `Cleared what-if Expected Hours override for ${targetRow.full_name}.`,
          before: before ?? null,
          after: null,
          note: targetRow.note || "",
        }),
        whatIfRows: normalized.whatIfRows.map((row) => {
          if (row.id !== normalizedId) return row;
          if (!HOUR_ANALYSIS_RANGE_KEYS.includes(band)) return { ...row, hour_overrides: {} };
          const nextOverrides = { ...(row.hour_overrides || {}) };
          delete nextOverrides[band];
          return { ...row, hour_overrides: nextOverrides };
        }),
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const removeHourAnalysisWhatIfRow = useCallback((rowId) => {
    const normalizedId = String(rowId || "").trim();
    if (!normalizedId) return;
    setHourAnalysisSettings((prev) => {
      const normalized = normalizeHourAnalysisSettings(prev);
      const targetRow = normalized.whatIfRows.find((row) => row.id === normalizedId);
      if (!targetRow) return normalized;
      const nextNotes = { ...normalized.notes };
      const nextSplits = { ...normalized.splits };
      delete nextNotes[normalizedId];
      delete nextSplits[normalizedId];
      markHourAnalysisChanged(["capacity", `group:${targetRow.group_key}`, targetRow.scenario_type === "move" ? `group:${targetRow.source_group_key}` : null].filter(Boolean));
      return {
        ...appendHourAnalysisAudit(normalized, {
          action: "what_if_removed",
          entity_id: normalizedId,
          entity_label: targetRow.full_name,
          summary: targetRow.scenario_type === "move" ? `Removed movement what-if for ${targetRow.full_name}.` : `Removed what-if ${targetRow.full_name}.`,
          before: targetRow,
          after: null,
          note: targetRow.note || normalized.notes[normalizedId] || "",
        }),
        notes: nextNotes,
        splits: nextSplits,
        whatIfRows: normalized.whatIfRows.filter((row) => row.id !== normalizedId),
      };
    });
  }, [appendHourAnalysisAudit, markHourAnalysisChanged]);
  const rosterPrintRows = useMemo(() => {
    return preparedRosterRows
      .filter((row) => isLaborEmployeeActive(row))
      .sort((a, b) => {
        const lastNameCompare = String(a.last_name || a.full_name || "").localeCompare(String(b.last_name || b.full_name || ""), undefined, { sensitivity: "base", numeric: true });
        if (lastNameCompare !== 0) return lastNameCompare;
        return String(a.first_name || "").localeCompare(String(b.first_name || ""), undefined, { sensitivity: "base", numeric: true });
      });
  }, [preparedRosterRows]);
  const rosterPrintTitle = useMemo(() => formatRosterLocationTitle(laborContactLocationName), [laborContactLocationName]);
  const showRosterPrintUnassigned = Number(displayedDashboardMetrics.unassignedCommitmentCount || 0) > 0;
  const updateRosterPrintOption = useCallback((key, value) => {
    setRosterPrintOptions((prev) => ({ ...prev, [key]: Boolean(value) }));
  }, []);
  const loadRosterPdfAssetsForBrowser = useCallback(async () => {
    if (!rosterPdfAssetsRef.current) {
      rosterPdfAssetsRef.current = await loadLaborRosterPdfAssets();
    }
    return rosterPdfAssetsRef.current;
  }, []);
  const buildRosterPdf = useCallback(async () => {
    const generatedAt = new Date();
    const pdfPrintDateLabel = formatRosterPrintDate(generatedAt);
    const pdfFilename = formatRosterPdfFilename(laborContactLocationName, generatedAt);
    const assets = await loadRosterPdfAssetsForBrowser();
    const pdfBytes = await buildLaborRosterPdfBytes({
      title: rosterPrintTitle,
      filename: pdfFilename,
      printDate: pdfPrintDateLabel,
      totalEmployees: displayedDashboardMetrics.activeEmployeeCount,
      showUnassigned: showRosterPrintUnassigned,
      options: rosterPrintOptions,
      matrix: rosterStaffingMatrix,
      assets,
      stats: [
        { label: "Managers", value: displayedDashboardMetrics.managerCount },
        { label: "SUP", value: displayedDashboardMetrics.supervisorCount },
        { label: "CSR", value: displayedDashboardMetrics.csrCount },
        { label: "PCT", value: displayedDashboardMetrics.pctCount },
        { label: "Full-Time", value: displayedDashboardMetrics.fullTimeCount },
        { label: "Part-Time", value: displayedDashboardMetrics.partTimeCount },
      ],
      rows: rosterPrintRows.map((row) => ({
        name: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Employee",
        position: formatLaborPositionTitle(row.position_title) || "Not listed",
        commitment: getLaborEmploymentCommitmentLabel(row.employment_commitment),
        phone: row.contact_phone ? fmtPhoneInput(row.contact_phone) : "Not listed",
        email: row.contact_email || "Not listed",
      })),
    });
    return { pdfBytes, pdfFilename };
  }, [
    displayedDashboardMetrics.activeEmployeeCount,
    displayedDashboardMetrics.csrCount,
    displayedDashboardMetrics.fullTimeCount,
    displayedDashboardMetrics.managerCount,
    displayedDashboardMetrics.partTimeCount,
    displayedDashboardMetrics.pctCount,
    displayedDashboardMetrics.supervisorCount,
    laborContactLocationName,
    loadRosterPdfAssetsForBrowser,
    rosterPrintOptions,
    rosterPrintRows,
    rosterPrintTitle,
    rosterStaffingMatrix,
    showRosterPrintUnassigned,
  ]);
  const handlePrintRoster = useCallback(async ({ preview = false } = {}) => {
    if (generatingRosterPdf) return;
    setGeneratingRosterPdf(true);
    try {
      const { pdfBytes, pdfFilename } = await buildRosterPdf();
      if (preview) {
        openPdfBlob(pdfFilename, pdfBytes, { print: true });
      } else {
        downloadBinaryFile(pdfFilename, pdfBytes, "application/pdf");
      }
    } catch (error) {
      addGlobalToast(error?.message || "Failed to generate roster PDF", "error");
    } finally {
      setGeneratingRosterPdf(false);
    }
  }, [
    addGlobalToast,
    buildRosterPdf,
    generatingRosterPdf,
  ]);
  const handleBrowserPrintRoster = useCallback(() => {
    handlePrintRoster({ preview: true });
  }, [handlePrintRoster]);
  const filteredRosterRows = useMemo(() => {
    return applyLaborRosterFilters(preparedRosterRows, rosterFilters);
  }, [preparedRosterRows, rosterFilters]);
	  const visibleRosterRows = useMemo(() => {
	    return filteredRosterRows;
	  }, [filteredRosterRows]);
  useEffect(() => {
    if (showHierarchyManager) {
      setHierarchyDraft(positionHierarchyRows.map((row) => ({ ...row })));
    }
  }, [positionHierarchyRows, showHierarchyManager]);
  const sortedRosterRows = useMemo(() => {
    const direction = rosterSort.direction === "desc" ? -1 : 1;
    const getSortValue = (row) => {
      switch (rosterSort.key) {
	        case "hierarchy":
	          return positionHierarchyIndex[normalizePositionTitle(row.position_title)] ?? Number.MAX_SAFE_INTEGER;
	        case "name":
	          return `${String(row.last_name || row.full_name || "")} ${String(row.first_name || "")}`;
	        case "first_name":
	          return String(row.first_name || "");
        case "last_name":
          return String(row.last_name || row.full_name || "");
        case "start_date":
          return String(row.start_date || "");
        case "email":
          return String(row.contact_email || "");
        case "phone":
          return String(row.contact_phone || "");
	        case "position":
	          return String(row.position_title || "");
	        case "commitment":
	          return getLaborEmploymentCommitmentLabel(row.employment_commitment);
        case "training":
          return String(row.training_compliance?.label || "");
        case "performance_reviews":
          return String(row.performance_review_compliance?.label || "");
        case "review30":
          return String(row.review_30_due_date || "");
        case "review60":
          return String(row.review_60_due_date || "");
	        case "review90":
	          return String(row.review_90_due_date || "");
	        case "notes":
	          return String(Number(row.employee_note_count || 0)).padStart(6, "0");
	        default:
	          return String(row.last_name || row.full_name || "");
      }
    };

    return [...visibleRosterRows].sort((a, b) => {
	      const activeDelta = Number(!!b.is_active) - Number(!!a.is_active);
	      if (activeDelta !== 0) return activeDelta;

      if (rosterSort.key === "hierarchy") {
        const leftIndex = getSortValue(a);
        const rightIndex = getSortValue(b);
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return String(a.last_name || a.full_name || "").localeCompare(String(b.last_name || b.full_name || ""), undefined, { numeric: true, sensitivity: "base" });
      }

      const left = getSortValue(a);
      const right = getSortValue(b);
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
	  }, [positionHierarchyIndex, rosterSort, visibleRosterRows]);
  const activePerformanceReviewRows = useMemo(() => {
    const instances = toObjectRows(reviewInstances);
    return preparedRosterRows
      .filter((row) => isLaborEmployeeActive(row))
      .map((row) => {
        const employeeId = getLaborEmployeeRowId(row);
        const employeeInstances = instances.filter((instance) => instance.labor_employee_id === employeeId);
        return {
          ...row,
          template: resolvePerformanceReviewTemplate(row),
          cycles: PERFORMANCE_REVIEW_CYCLES.map((cycle) => ({
            ...cycle,
            dueDate: row[cycle.dueDateKey] || null,
            status: row[cycle.statusKey] || "not_started",
            presentation: getReviewStatusPresentation(row, cycle.dueDateKey.replace(/_due_date$/, "")),
            instance: employeeInstances.find((instance) => instance.review_cycle === cycle.id) || null,
          })),
        };
      });
  }, [preparedRosterRows, reviewInstances]);
  const sortedActiveRecords = useMemo(() => (
    sortLaborRowsByConfig(activeRecords, trainingSort, positionHierarchyIndex, (record, key) => {
      switch (key) {
        case "employee":
        case "name":
          return record.employee_full_name || "";
        case "position":
          return formatLaborPositionTitle(record.target_role || "");
        case "plan":
          return record.template_name_snapshot || "";
        case "progress":
          return Number(record.progress_percent || 0);
        case "status":
          return record.overall_status || "";
        case "target":
          return record.target_end_date || "";
        default:
          return record.employee_full_name || "";
      }
    })
  ), [activeRecords, positionHierarchyIndex, trainingSort]);
  const sortedCompletedRecords = useMemo(() => (
    sortLaborRowsByConfig(completedRecords, trainingSort, positionHierarchyIndex, (record, key) => {
      switch (key) {
        case "employee":
        case "name":
          return record.employee_full_name || "";
        case "position":
          return formatLaborPositionTitle(record.target_role || "");
        case "plan":
          return record.template_name_snapshot || "";
        case "progress":
          return Number(record.progress_percent || 0);
        case "status":
          return record.overall_status || "";
        case "target":
          return record.target_end_date || "";
        default:
          return record.employee_full_name || "";
      }
    })
  ), [completedRecords, positionHierarchyIndex, trainingSort]);
  const sortedPerformanceReviewRows = useMemo(() => (
    sortLaborRowsByConfig(activePerformanceReviewRows, performanceReviewSort, positionHierarchyIndex, (row, key) => {
      switch (key) {
        case "employee":
        case "name":
          return row.full_name || "";
        case "position":
          return formatLaborPositionTitle(row.position_title || "");
        case "start_date":
          return row.start_date || "";
        case "compliance":
          return row.performance_review_compliance?.label || "";
        case "review30":
          return row.review_30_due_date || "";
        case "review60":
          return row.review_60_due_date || "";
        case "review90":
          return row.review_90_due_date || "";
        default:
          return row.full_name || "";
      }
    })
  ), [activePerformanceReviewRows, performanceReviewSort, positionHierarchyIndex]);
  const sortedHourAnalysisRows = useMemo(() => (
    sortLaborRowsByConfig(hourAnalysisModel.rows, hourAnalysisPersonSort, positionHierarchyIndex, (row, key) => {
      switch (key) {
        case "name":
        case "employee":
          return row.full_name || "";
        case "position":
          return formatLaborPositionTitle(row.position_title || row.position || "");
        case "commitment":
          return getLaborEmploymentCommitmentLabel(row.employment_commitment);
        case "preferred":
          return Number(row.preferredHours || 0);
        case "split":
          return row.isSplit ? `${row.split?.admin_hours || 0}:${row.split?.floor_group || ""}` : "";
        case "note":
          return row.note || "";
        default:
          return row.full_name || "";
      }
    })
  ), [hourAnalysisModel.rows, hourAnalysisPersonSort, positionHierarchyIndex]);
  const performanceReviewOverview = useMemo(() => {
    const cycles = activePerformanceReviewRows.flatMap((row) => row.cycles || []);
    return [
      {
        label: "Non-compliant",
        value: activePerformanceReviewRows.filter((row) => row.performance_review_compliance?.label === "Non-compliant").length,
        color: C.dan,
        helper: "active employees",
      },
      {
        label: "Overdue cycles",
        value: cycles.filter((cycle) => String(cycle.status) === "overdue").length,
        color: C.warn,
        helper: "30/60/90 checkpoints",
      },
      {
        label: "In progress",
        value: cycles.filter((cycle) => String(cycle.status) === "in_progress").length,
        color: C.info,
        helper: "open review packets",
      },
      {
        label: "Compliant",
        value: activePerformanceReviewRows.filter((row) => row.performance_review_compliance?.label === "Compliant").length,
        color: C.suc,
        helper: "active employees",
      },
    ];
  }, [activePerformanceReviewRows]);
  const activeContactCardEmployees = useMemo(() => {
    const seen = new Set();
    return preparedRosterRows
      .filter((row) => isLaborEmployeeActive(row))
      .map((row) => {
        const employeeId = getLaborEmployeeRowId(row);
        const canonicalEmployee = laborEmployeeMap[employeeId] || {};
        return {
          ...canonicalEmployee,
          ...row,
          id: employeeId || row.id,
          labor_employee_id: employeeId || row.labor_employee_id,
          metadata: canonicalEmployee.metadata || row.metadata || {},
        };
      })
      .filter((employee) => {
        const key = getLaborEmployeeRowId(employee) || normalizeEmployeeName(employee.full_name);
        if (!key || seen.has(key) || !String(employee.full_name || "").trim()) return false;
        seen.add(key);
        return true;
      });
  }, [laborEmployeeMap, preparedRosterRows]);
  const recordLaborContactCardDownload = useCallback(async ({ employees = [], mode = "single" }) => {
    const employeeRows = toObjectRows(employees);
    if (!laborLocationRef || employeeRows.length === 0) {
      return { error: new Error("Missing employee or location for contact-card audit") };
    }

    const employeeNames = employeeRows
      .map((employee) => String(employee.full_name || employee.name || "").trim())
      .filter(Boolean);
    const detailRows = [
      { field: "Export Format", oldVal: "—", newVal: "VCF contact card" },
      { field: "Export Scope", oldVal: "—", newVal: mode === "bulk" ? "All active employees" : "Single employee" },
      { field: "Employee Count", oldVal: "—", newVal: String(employeeRows.length) },
      { field: "Location", oldVal: "—", newVal: laborContactLocationName || "K9 Operations" },
      { field: "Included Fields", oldVal: "—", newVal: "Name, phone, email, position, location, start date, active status" },
    ];
    if (employeeNames.length > 0) {
      detailRows.push({
        field: mode === "bulk" ? "Employees" : "Employee",
        oldVal: "—",
        newVal: mode === "bulk" && employeeNames.length > 12
          ? `${employeeNames.slice(0, 12).join(", ")} and ${employeeNames.length - 12} more`
          : employeeNames.join(", "),
      });
    }

    return supabase.from("lite_audit_log").insert({
      location_id: laborLocationRef,
      timestamp: new Date().toISOString(),
      user_id: actorUserId,
      user_name: actorName,
      action: mode === "bulk" ? "Bulk Downloaded Labor Contact Cards" : "Downloaded Labor Contact Card",
      resource_type: mode === "bulk" ? "labor_employee_bulk_export" : "labor_employee",
      resource_id: mode === "bulk" ? null : getLaborEmployeeRowId(employeeRows[0]),
      details: detailRows,
    });
  }, [actorName, actorUserId, laborContactLocationName, laborLocationRef]);
  const handleDownloadLaborContactCard = useCallback(async (employee) => {
    const employeeRow = employee || selectedLaborEmployeeView;
    if (!employeeRow || !String(employeeRow.full_name || "").trim()) {
      addGlobalToast("No employee contact card is available for this record", "error");
      return;
    }
    const employeeKey = getLaborEmployeeRowId(employeeRow) || normalizeEmployeeName(employeeRow.full_name);
    setContactCardDownloadKey(`single:${employeeKey}`);
    const { error } = await recordLaborContactCardDownload({ employees: [employeeRow], mode: "single" });
    if (error) {
      console.error("Labor contact-card audit failed:", error);
      addGlobalToast("Contact card was not downloaded because audit logging failed", "error");
      setContactCardDownloadKey("");
      return;
    }

    const content = buildLaborEmployeeContactCardFile([employeeRow], {
      locationName: laborContactLocationName,
    });
    const filename = buildLaborEmployeeContactCardFilename(employeeRow, {
      locationName: laborContactLocationName,
    });
    downloadTextFile(filename, content, "text/vcard;charset=utf-8");
    setContactCardDownloadKey("");
    addGlobalToast("Contact card downloaded", "success");
  }, [addGlobalToast, laborContactLocationName, recordLaborContactCardDownload, selectedLaborEmployeeView]);
  const handleDownloadActiveLaborContactCards = useCallback(async () => {
    if (activeContactCardEmployees.length === 0) {
      addGlobalToast("No active employees are available to export", "error");
      return;
    }
    setContactCardDownloadKey("bulk");
    const { error } = await recordLaborContactCardDownload({ employees: activeContactCardEmployees, mode: "bulk" });
    if (error) {
      console.error("Labor bulk contact-card audit failed:", error);
      addGlobalToast("Active contact cards were not downloaded because audit logging failed", "error");
      setContactCardDownloadKey("");
      return;
    }

    const content = buildLaborEmployeeContactCardFile(activeContactCardEmployees, {
      locationName: laborContactLocationName,
    });
    const filename = buildLaborEmployeeContactCardFilename({}, {
      locationName: laborContactLocationName,
      bulk: true,
    });
    downloadTextFile(filename, content, "text/vcard;charset=utf-8");
    setContactCardDownloadKey("");
    addGlobalToast(`${activeContactCardEmployees.length} active contact card${activeContactCardEmployees.length === 1 ? "" : "s"} downloaded`, "success");
  }, [activeContactCardEmployees, addGlobalToast, laborContactLocationName, recordLaborContactCardDownload]);
	  const globalNoteEmployeeOptions = useMemo(() => {
    const source = toObjectRows(rosterSnapshot).length > 0 ? rosterSnapshot : laborEmployees;
    return toObjectRows(source)
      .map((employee) => {
        const employeeId = getLaborEmployeeRowId(employee);
        if (!employeeId) return null;
        return {
          value: employeeId,
          label: `${employee.full_name || employee.name || "Employee"} (${formatLaborPositionTitle(employee.position_title || employee.position) || "Employee"})`,
        };
      })
      .filter(Boolean);
  }, [laborEmployees, rosterSnapshot]);

  const sectionCompletionMap = useMemo(() => {
    const map = {};
    if (!selectedRecord) return map;

    recordSections.forEach(sec => {
      const childSecs = getChildSections(sec.id);
      let total = 0;
      let done = 0;

      const collectItems = (sectionIds) => {
        sectionIds.forEach((sid) => {
          const sItems = getSectionItems(sid);
          sItems.forEach((item) => {
            if (!item.required) return;
            total += 1;
            const res = getItemResult(item.id);
            if (res && (res.status === "complete" || res.status === "passed")) {
              done += 1;
            }
          });
        });
      };

      if (childSecs.length > 0) {
        collectItems(childSecs.map((child) => child.id));
      } else {
        collectItems([sec.id]);
      }

      map[sec.id] = { total, done };
    });

    return map;
  }, [getChildSections, getItemResult, getSectionItems, recordSections, selectedRecord]);

  const aggregatedNoteFeed = useMemo(() => {
    return [...notes]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .map((note) => {
        const item = note.template_item_id ? getItemById(note.template_item_id) : null;
        const section = note.template_section_id ? getSectionById(note.template_section_id) : null;
        return {
          ...note,
          sourceLabel: item?.label || section?.title || "Record",
          sourceType: item ? "Task" : section ? "Section" : "Record",
        };
      });
  }, [getItemById, getSectionById, notes]);

  const renderRecordItem = useCallback((item) => {
    if (!isObjectRow(item) || !item.id) return null;
    const itemLabel = String(item.label || item.prompt || "").trim() || "Untitled task";
    const result = getItemResult(item.id);
    const isDone = result && (result.status === "complete" || result.status === "passed");
    const itemNotes = getItemNotes(item.id);
    const showNotes = !!expandedItemNotes[item.id];

    return (
      <div key={item.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input
            type="checkbox"
            checked={!!isDone}
            onChange={() => handleToggleItem(item.id)}
            style={{ width: 18, height: 18, accentColor: C.pri, cursor: "pointer", flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? C.textMut : C.text, textDecoration: isDone ? "line-through" : "none" }}>
                  {itemLabel}
                </div>
                {(item.description || item.policy_reference) && (
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                    {item.description && (
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>
                        {item.description}
                      </div>
                    )}
                    {item.policy_reference && (
                      <a
                        href={item.policy_reference}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: C.pri, fontWeight: 600, textDecoration: "none" }}
                      >
                        Open linked resource
                      </a>
                    )}
                  </div>
                )}
                {result?.completed_at && (
                  <div style={{ marginTop: 4, fontSize: 11, color: C.textMut }}>
                    {result.completed_by_name || "Completed"} on {formatTrainingTimestamp(result.completed_at)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
                <Btn variant="ghost" size="sm" onClick={() => toggleItemNotes(item.id)}>
                  {showNotes ? "Hide Notes" : `Notes${itemNotes.length ? ` (${itemNotes.length})` : ""}`}
                </Btn>
              </div>
            </div>

            {showNotes && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {itemNotes.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No observations yet</div>
                  ) : (
                    itemNotes.map((note) => (
                      <div key={note.id} style={{ paddingBottom: 10, borderBottom: `1px solid ${C.borderLight}` }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                          {note.created_by_name || note.initials || "Staff"}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                          {formatTrainingTimestamp(note.created_at)}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, lineHeight: 1.45 }}>
                          {note.note_text}
                        </div>
                      </div>
                    ))
                  )}
                  <Inp
                    label="New Observation"
                    type="textarea"
                    rows={3}
                    value={itemNoteDrafts[item.id] || ""}
                    onChange={(value) => setItemNoteDrafts((prev) => ({ ...prev, [item.id]: value }))}
                    placeholder="Add a time-stamped observation for this task"
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Btn
                      variant="primary"
                      size="sm"
                      onClick={() => handleAddItemNote(item.id)}
                      disabled={savingItemNoteId === item.id}
                    >
                      {savingItemNoteId === item.id ? "Saving..." : "Add Observation"}
                    </Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [expandedItemNotes, formatTrainingTimestamp, getItemNotes, getItemResult, handleAddItemNote, handleToggleItem, itemNoteDrafts, savingItemNoteId, toggleItemNotes]);

  const renderTemplatePreviewItem = useCallback((item, editable = false) => {
    if (!isObjectRow(item) || !item.id) return null;
    const isReviewItem = previewTemplateKind === "review";
    const itemType = String(item.item_type || "").trim();
    const primaryLabel = String(isReviewItem ? item.prompt : item.label || "").trim() || "Untitled";
    const secondaryText = isReviewItem
      ? (itemType === "rating" && Array.isArray(item.options) && item.options.length > 0
          ? `Options: ${item.options.join(", ")}`
          : itemType.replace(/_/g, " "))
      : item.description;
    const linkUrl = isReviewItem ? null : item.policy_reference;
    const sectionOptions = isReviewItem
      ? (previewTemplate?.sections || []).filter(isObjectRow).map((section) => ({ value: section.id, label: section.title }))
      : (previewTemplate?.sections || []).filter(isObjectRow).flatMap((section) => [
          { value: section.id, label: section.title },
          ...(Array.isArray(section.children) ? section.children.filter(isObjectRow).map((child) => ({ value: child.id, label: `${section.title} / ${child.title}` })) : []),
        ]);
    const currentSectionId = isReviewItem ? item.review_section_id : item.template_section_id;
    if (!editable) {
      return (
        <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.border, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text }}>{primaryLabel}</div>
            {(secondaryText || linkUrl) && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                {secondaryText && <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{secondaryText}</div>}
                {linkUrl && (
                  <a href={linkUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.pri, fontWeight: 600, textDecoration: "none" }}>
                    Open linked resource
                  </a>
                )}
              </div>
            )}
          </div>
          <span style={{ fontSize: 10, color: C.textMut }}>{item.item_type}</span>
          {!isReviewItem && !item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
        </div>
      );
    }

    return (
      <Card key={item.id} style={{ padding: 12, marginTop: 8, background: C.bg, border: `1px solid ${C.borderLight}` }}>
        <div style={{ display: "grid", gap: 10 }}>
          <input
            defaultValue={primaryLabel}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== primaryLabel) {
                handleUpdateTemplateItem(item.id, isReviewItem ? { prompt: value } : { label: value });
              }
            }}
            placeholder={isReviewItem ? "Review prompt" : "Task label"}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }}
          />
	          {isReviewItem ? (
	            <>
	              <CustomSelect
                value={item.item_type}
                onChange={(value) => handleUpdateTemplateItem(item.id, { item_type: value })}
                options={[
                  { value: "long_text", label: "Long Text" },
                  { value: "short_text", label: "Short Text" },
                  { value: "rating", label: "Rating" },
                ]}
              />
              {item.item_type === "rating" && (
                <Inp
                  label="Rating Options"
                  value={Array.isArray(item.options) ? item.options.join(", ") : ""}
                  onChange={(value) => {
                    const nextOptions = String(value || "")
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean);
                    handleUpdateTemplateItem(item.id, { options: nextOptions.length ? nextOptions : null });
                  }}
                  placeholder="Meets Expectations, Needs Improvement, Exceeds Expectations"
                />
	              )}
	            </>
	          ) : (
            <>
              <textarea
                defaultValue={item.description || ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (item.description || "")) {
                    handleUpdateTemplateItem(item.id, { description: value || null });
                  }
                }}
                placeholder="Task description"
                rows={2}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
              />
              <input
                defaultValue={item.policy_reference || ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (item.policy_reference || "")) {
                    handleUpdateTemplateItem(item.id, { policy_reference: value || null });
                  }
                }}
                placeholder="Optional resource link"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit" }}
              />
	            </>
	          )}
            {sectionOptions.length > 1 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, marginBottom: 6 }}>Move to section</div>
                <CustomSelect
                  value={currentSectionId || ""}
                  onChange={(value) => handleMoveTemplateItemSection(item.id, value)}
                  options={sectionOptions}
                />
              </div>
            )}
	          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
	            {!isReviewItem ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textSec }}>
                <input
                  type="checkbox"
                  defaultChecked={item.required}
                  onChange={(event) => handleUpdateTemplateItem(item.id, { required: event.target.checked })}
                />
                Required task
              </label>
            ) : <span />}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateItemOrder(item.id, -1)}>Move Up</Btn>
                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateItemOrder(item.id, 1)}>Move Down</Btn>
	              <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateItem(item.id)}>Delete {isReviewItem ? "Prompt" : "Task"}</Btn>
              </div>
	          </div>
        </div>
      </Card>
    );
  }, [handleDeleteTemplateItem, handleMoveTemplateItemOrder, handleMoveTemplateItemSection, handleUpdateTemplateItem, previewTemplate, previewTemplateKind]);

  const laborEmployeeEditorModal = canEditRoster && showLaborEmployeeEditor && editingLaborEmployeeId ? (
    <Modal
      title="Edit Employee"
      onClose={() => {
        setShowLaborEmployeeEditor(false);
        resetLaborEmployeeEditor();
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Employee Full Name" value={laborEmployeeName} onChange={setLaborEmployeeName} required />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Inp
            label="Phone Number"
            type="tel"
            value={fmtPhoneInput(laborEmployeePhone)}
            onChange={(value) => setLaborEmployeePhone(String(value || "").replace(/\D/g, "").slice(0, 10))}
          />
          <Inp
            label="Email Address"
            type="email"
            value={laborEmployeeEmail}
            onChange={setLaborEmployeeEmail}
          />
        </div>
	        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.8fr", gap: 12 }}>
            <HourAnalysisAnimatedPicker
              label="Position Title"
              value={formatLaborPositionTitle(laborEmployeeRole)}
              onChange={setLaborEmployeeRole}
              options={getLaborPositionOptionsWithCurrent(laborEmployeeRole)}
              placeholder="Choose approved title"
            />
	          <label style={{ display: "block" }}>
	            <span style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.textSec }}>Commitment</span>
	            <CustomSelect
	              value={laborEmployeeCommitment}
	              onChange={setLaborEmployeeCommitment}
	              options={LABOR_COMMITMENT_SELECT_OPTIONS}
	              placeholder="Unassigned"
	            />
	          </label>
	        </div>
	        <label style={{ display: "block" }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.textSec }}>Performance Review PDF Template</span>
          <CustomSelect
            value={laborEmployeeReviewTemplateRole}
            onChange={setLaborEmployeeReviewTemplateRole}
            options={[
              { value: "", label: "Auto by position title" },
              ...performanceReviewTemplateOptions,
            ]}
            placeholder="Auto by position title"
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Inp label="Start Date" type="date" value={laborEmployeeStartDate} onChange={setLaborEmployeeStartDate} required />
          <Inp label="End Date" type="date" value={laborEmployeeEndDate} onChange={setLaborEmployeeEndDate} />
        </div>
        <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5 }}>
          Active status is derived automatically. Leave End Date blank for active employees; add an End Date when they leave.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Btn
            variant="ghost"
            onClick={() => {
              setShowLaborEmployeeEditor(false);
              resetLaborEmployeeEditor();
            }}
          >
            Cancel
          </Btn>
          <Btn variant="primary" onClick={handleSaveLaborEmployee} disabled={savingLaborEmployee}>
            {savingLaborEmployee ? "Saving..." : "Save Employee"}
          </Btn>
        </div>
      </div>
    </Modal>
  ) : null;

  const employeeNoteEditorModal = editingEmployeeNote ? (
    <Modal title="Edit Employee Note" onClose={resetEmployeeNoteEditor}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 560, maxWidth: 700 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{editingEmployeeNote.created_by_name || "Staff"}</span>
          <span style={{ fontSize: 12, color: C.textMut }}>{formatTrainingTimestamp(editingEmployeeNote.created_at)}</span>
        </div>
        <Inp
          label="Note Type"
          type="select"
          value={editingEmployeeNoteType}
          onChange={setEditingEmployeeNoteType}
          options={LABOR_NOTE_TYPE_OPTIONS}
        />
        <Inp
          label="Employee Note"
          type="textarea"
          rows={5}
          value={editingEmployeeNoteText}
          onChange={setEditingEmployeeNoteText}
          placeholder="Update the manager-facing note text"
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textSec, marginBottom: 8 }}>
            Attachments
          </div>
          <input
            ref={editingEmployeeNoteFileInputRef}
            type="file"
            multiple
            accept={LABOR_EMPLOYEE_ATTACHMENT_ACCEPT}
            onChange={handleEditingEmployeeNoteFileChange}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <Btn
              variant="secondary"
              size="sm"
              icon={<I.FileText />}
              onClick={() => editingEmployeeNoteFileInputRef.current?.click()}
              disabled={editingEmployeeNoteDocuments.length + editingEmployeeNoteFiles.length >= LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES}
            >
              Add PDF/Image
            </Btn>
            {editingEmployeeNoteDocuments.length === 0 && editingEmployeeNoteFiles.length === 0 ? (
              <span style={{ fontSize: 12, color: C.textMut }}>No attachments on this note.</span>
            ) : null}
          </div>
          {(editingEmployeeNoteDocuments.length > 0 || editingEmployeeNoteFiles.length > 0) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {editingEmployeeNoteDocuments.map((document) => renderEmployeeDocumentButton(document, { allowDelete: true }))}
              {editingEmployeeNoteFiles.map((file, index) => (
                <span key={`${file.name}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, color: C.textSec, fontWeight: 800 }}>
                  {file.name}
                  <button type="button" onClick={() => handleRemoveEditingEmployeeNoteFile(index)} style={{ border: "none", background: "transparent", color: C.textMut, cursor: "pointer", padding: 0, display: "flex" }}>
                    <I.X />
                  </button>
                </span>
              ))}
            </div>
          )}
          {editingEmployeeNoteFileErrors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: C.dan, fontWeight: 800 }}>
              {editingEmployeeNoteFileErrors.join(" ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
          <Btn
            variant="danger"
            onClick={() => handleDeleteEmployeeNote(editingEmployeeNote)}
            disabled={deletingEmployeeNoteId === editingEmployeeNote.id || savingEmployeeNoteEdit}
            icon={<I.Trash />}
          >
            {deletingEmployeeNoteId === editingEmployeeNote.id ? "Removing..." : "Remove Note"}
          </Btn>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={resetEmployeeNoteEditor} disabled={savingEmployeeNoteEdit}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSaveEmployeeNoteEdit} disabled={savingEmployeeNoteEdit || !editingEmployeeNoteText.trim()}>
              {savingEmployeeNoteEdit ? "Saving..." : "Save Changes"}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  ) : null;

  const attachmentPreviewModal = attachmentPreview ? (
    <Modal
      title={attachmentPreview.document?.file_name || "Attachment Preview"}
      onClose={() => setAttachmentPreview(null)}
      fullWidth
    >
      <div style={{ height: "calc(100vh - 180px)", minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {attachmentPreview.kind === "image" ? (
          <img
            src={attachmentPreview.url}
            alt={attachmentPreview.document?.file_name || "Employee attachment"}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <iframe
            title={attachmentPreview.document?.file_name || "Employee attachment"}
            src={attachmentPreview.kind === "pdf" ? `${attachmentPreview.url}#toolbar=0&navpanes=0&scrollbar=1` : attachmentPreview.url}
            style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
          />
        )}
      </div>
    </Modal>
  ) : null;

  const addHierarchyDraftTitle = useCallback(() => {
    const option = buildLaborPositionOption(newHierarchyTitle);
    if (!option) return;
    setHierarchyDraft((prev) => {
      if (prev.some((row) => row.normalized_title === option.normalizedTitle)) return prev;
      return [
        ...prev,
        {
          id: null,
          position_title: option.label,
          normalized_title: option.normalizedTitle,
          sort_order: (prev.length + 1) * 10,
        },
      ];
    });
    setNewHierarchyTitle("");
  }, [newHierarchyTitle]);
  const removeHierarchyDraftTitle = useCallback((normalizedTitle) => {
    setHierarchyDraft((prev) => prev.filter((row) => row.normalized_title !== normalizedTitle));
  }, []);
  const resetHierarchyDraftToDefaults = useCallback(() => {
    setHierarchyDraft(makeDefaultLaborPositionRows());
    setNewHierarchyTitle("");
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPLOYEE DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (hasSelectedLaborEmployee && !selectedLaborEmployeeView) {
    return (
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
        <button
	          onClick={() => {
	            setSelectedLaborEmployeeId(null);
	            setSelectedLaborEmployeeSeed(null);
	            setSelectedReviewInstanceId(null);
	          }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}
        >
          <I.Back /> Back to Labor
        </button>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>
            {loading ? "Loading employee record..." : "Employee record unavailable"}
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            {loading
              ? "Labor is still loading the selected employee details."
              : "The selected employee record could not be assembled from the current roster and training data."}
          </div>
        </Card>
      </div>
    );
  }

  if (hasSelectedLaborEmployee && selectedLaborEmployeeView) {
    const selectedLaborEmployeeKey = getLaborEmployeeRowId(selectedLaborEmployeeView);
    const selectedLaborEmployeeIsActive = selectedLaborEmployeeSnapshot?.is_active ?? isLaborEmployeeActive(selectedLaborEmployeeView);
    const employeeTrainingRecords = toObjectRows(records)
      .filter((record) => isTrainingRecordForEmployee(record, selectedLaborEmployeeView))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const employeePhone = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_phone");
    const employeeEmail = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_email");
    const reviewCycleRows = [
      {
        id: "30_day",
        label: "30 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_30_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_30_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance?.review_cycle === "30_day") || null,
      },
      {
        id: "60_day",
        label: "60 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_60_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_60_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance?.review_cycle === "60_day") || null,
      },
      {
        id: "90_day",
        label: "90 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_90_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_90_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance?.review_cycle === "90_day") || null,
      },
    ];

    if (selectedReviewInstance) {
      const reviewItemTotal = selectedReviewSections.reduce((sum, section) => sum + section.items.length, 0);
      const answeredReviewItems = selectedReviewSections.reduce((sum, section) => (
        sum + section.items.filter((item) => {
          const response = getReviewResponse(item.id);
          const draft = reviewDrafts[item.id] || {};
          return isReviewItemAnswered(response, draft);
        }).length
      ), 0);
      const reviewPercent = reviewItemTotal > 0 ? Math.round((answeredReviewItems / reviewItemTotal) * 100) : 0;
      const reviewCycleLabel = String(selectedReviewInstance.review_cycle || "").replace(/_/g, " ");
      const reviewStatus = String(selectedReviewInstance.status || "not_started");
      const reviewStatusColor = reviewStatus === "completed"
        ? "success"
        : reviewStatus === "overdue"
          ? "danger"
          : "warning";
      const selectedPerformanceTemplate = resolvePerformanceReviewTemplate(selectedLaborEmployeeView);
      const selectedPerformanceTemplateOverrideKey = getPerformanceReviewTemplateOverrideKey(selectedLaborEmployeeView);
      const selectedExpectedReviewTemplate = selectedPerformanceTemplate ? findReviewTemplateForEmployee(selectedLaborEmployeeView) : null;
      const selectedReviewTemplateMismatch = Boolean(
        selectedExpectedReviewTemplate?.id
        && selectedReviewTemplate?.id
        && selectedExpectedReviewTemplate.id !== selectedReviewTemplate.id
      );
      const selectedDisplayReviewTitle = selectedReviewTemplateMismatch
        ? selectedExpectedReviewTemplate?.name || `${selectedPerformanceTemplate?.roleLabel || "Paired"} 30 / 60 / 90 Day Review`
        : selectedReviewTemplate?.name || "Performance Review";
      const selectedRestartTemplate = selectedExpectedReviewTemplate || selectedReviewTemplate;
      const selectedRestartLabel = selectedPerformanceTemplate?.roleLabel || "Paired Template";
      const selectedPerformanceTemplateBadgeLabel = selectedPerformanceTemplate
        ? selectedPerformanceTemplateOverrideKey
          ? `Paired: ${selectedPerformanceTemplate.roleLabel}`
          : `Auto: ${selectedPerformanceTemplate.roleLabel}`
        : "No PDF template";
      const selectedPerformanceTemplatePlaceholder = selectedPerformanceTemplateOverrideKey
        ? "Clear pairing / auto by title"
        : selectedPerformanceTemplate
          ? `Auto: ${selectedPerformanceTemplate.roleLabel}`
          : "Auto by position title";
      const reviewSignature = isObjectRow(selectedReviewInstance.metadata?.signature) ? selectedReviewInstance.metadata.signature : {};
      const reviewSignatureStatus = String(reviewSignature.status || "");
      const reviewRestartBlocked = ["sent", "completed"].includes(reviewSignatureStatus);
      const ratingOptions = [
        { value: "", label: "Select rating" },
        { value: "Meets Expectations", label: "Meets Expectations" },
        { value: "Needs Improvement", label: "Needs Improvement" },
        { value: "Exceeds Expectations", label: "Exceeds Expectations" },
      ];

      return (
        <div className="performance-review-detail-shell" style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 16px 40px" }}>
          <PerformanceReviewStyles />
          <button
            onClick={() => setSelectedReviewInstanceId(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 18, fontFamily: "inherit", padding: 0 }}
          >
            <I.Back /> Back to Employee
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: 0, marginBottom: 4 }}>
                {selectedDisplayReviewTitle}
              </div>
              <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.5 }}>
                {selectedLaborEmployeeView.full_name} · {formatLaborPositionTitle(selectedLaborEmployeeView.position_title) || "Employee"} · {reviewCycleLabel}
              </div>
              <ReviewTemplateStatusLine
                reviewTemplateName={selectedReviewTemplate?.name}
                pdfTemplateName={selectedPerformanceTemplate?.roleLabel}
                mismatch={selectedReviewTemplateMismatch}
              />
              {unsavedReviewResponseCount > 0 && (
                <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 7, color: C.warn, background: C.warnLt, border: "1px solid rgba(217,119,6,0.18)", borderRadius: 8, padding: "5px 9px", fontSize: 12, fontWeight: 800 }}>
                  <I.Clock />
                  <span>{unsavedReviewResponseCount} unsaved {unsavedReviewResponseCount === 1 ? "response" : "responses"}</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Badge color={reviewStatusColor}>{reviewStatus.replace(/_/g, " ")}</Badge>
              {selectedReviewInstance.due_date && <Badge color="default">Due {formatLaborDate(selectedReviewInstance.due_date)}</Badge>}
              {selectedReviewInstance.completed_at && <Badge color="success">Completed {formatTrainingTimestamp(selectedReviewInstance.completed_at)}</Badge>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Progress</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{reviewPercent}%</div>
                <div style={{ fontSize: 12, color: C.textMut }}>{answeredReviewItems}/{reviewItemTotal} prompts answered</div>
              </div>
              <ProgressBar percent={reviewPercent} height={8} />
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Employee</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}>{selectedLaborEmployeeView.full_name}</div>
              <div style={{ fontSize: 12, color: C.textSec }}>{formatLaborPositionTitle(selectedLaborEmployeeView.position_title) || "—"}</div>
              {selectedLaborEmployeeView.start_date && (
                <div style={{ fontSize: 12, color: C.textMut, marginTop: 8 }}>Started {formatLaborDate(selectedLaborEmployeeView.start_date)}</div>
              )}
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Cycle Status</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: reviewStatusColor === "success" ? C.suc : reviewStatusColor === "danger" ? C.dan : C.warn }}>
                {reviewStatus.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: 12, color: C.textMut, marginTop: 8 }}>
                {selectedReviewInstance.due_date ? `Due ${formatLaborDate(selectedReviewInstance.due_date)}` : "Due date not set"}
              </div>
            </Card>
          </div>

          <div className="performance-review-detail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {selectedReviewTemplateMismatch && (
                <div
                  className="performance-review-sync-panel"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                    gap: 14,
                    alignItems: "center",
                    padding: "14px 16px",
                    border: "1px solid rgba(217,119,6,0.22)",
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #fff 0%, #fffaf2 100%)",
                    boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: "#FFF7ED",
                      border: "1px solid rgba(217,119,6,0.18)",
                      color: C.warn,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <I.RefreshCw />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 950, color: C.text }}>Sync this review to the paired form</div>
                      <Badge color="warning">Form mismatch</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.55, maxWidth: 820 }}>
                      Current form: <strong style={{ color: C.textSec }}>{selectedReviewTemplate?.name || "Unknown"}</strong>. Paired form: <strong style={{ color: C.textSec }}>{selectedExpectedReviewTemplate?.name || selectedPerformanceTemplate?.roleLabel || "Unknown"}</strong>.
                      Restarting clears this cycle's saved answers and PDF draft fields.
                    </div>
                  </div>
                  <Btn
                    variant="secondary"
                    size="sm"
                    icon={<I.RefreshCw />}
                    onClick={() => handleRestartSelectedReviewInstance(selectedRestartTemplate)}
                    disabled={restartingReview || reviewRestartBlocked || !selectedRestartTemplate?.id}
                    style={{ whiteSpace: "nowrap", borderColor: "rgba(217,119,6,0.28)", color: C.text }}
                  >
                    {restartingReview ? "Restarting..." : `Restart With ${selectedRestartLabel}`}
                  </Btn>
                  {reviewRestartBlocked && (
                    <div style={{ gridColumn: "2 / -1", marginTop: -6, fontSize: 12, color: C.dan, fontWeight: 700 }}>
                      Restart is blocked because a signature request has already been {reviewSignatureStatus}.
                    </div>
                  )}
                </div>
              )}
              <Card style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 6 }}>Manager PDF Notes</div>
                  </div>
                  <Badge color={selectedPerformanceTemplate ? (selectedPerformanceTemplateOverrideKey ? "primary" : "success") : "danger"}>
                    {savingPerformanceReviewTemplateRole ? "Saving pairing..." : selectedPerformanceTemplateBadgeLabel}
                  </Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
                  <label style={{ display: "block" }}>
                    <span style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.textSec }}>PDF Template Pairing</span>
                    <CustomSelect
                      value={selectedPerformanceTemplateOverrideKey}
                      onChange={handleSavePerformanceReviewTemplateOverride}
                      options={performanceReviewTemplateOptions}
                      placeholder={selectedPerformanceTemplatePlaceholder}
                      disabled={savingPerformanceReviewTemplateRole || !selectedLaborEmployeeView?.id}
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.textSec }}>Checkpoint Rating</span>
                    <CustomSelect
                      value={reviewPdfDraft.rating || ""}
                      onChange={(value) => handleReviewPdfDraftChange("rating", value)}
                      options={ratingOptions}
                      placeholder="Select rating"
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.textSec }}>Overall Rating</span>
                    <CustomSelect
                      value={reviewPdfDraft.overallRating || ""}
                      onChange={(value) => handleReviewPdfDraftChange("overallRating", value)}
                      options={ratingOptions}
                      placeholder="Select rating"
                    />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                  <Inp
                    label="Manager Notes"
                    type="textarea"
                    rows={5}
                    value={reviewPdfDraft.managerNotes}
                    onChange={(value) => handleReviewPdfDraftChange("managerNotes", value)}
                    placeholder="Notes discussed with the employee"
                  />
                  <Inp
                    label="Action Plan"
                    type="textarea"
                    rows={5}
                    value={reviewPdfDraft.actionPlan}
                    onChange={(value) => handleReviewPdfDraftChange("actionPlan", value)}
                    placeholder="Next steps and commitments"
                  />
                  <Inp
                    label="Overall Comments"
                    type="textarea"
                    rows={4}
                    value={reviewPdfDraft.overallComments}
                    onChange={(value) => handleReviewPdfDraftChange("overallComments", value)}
                    placeholder="Optional final comments for the summary section"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
                  <Btn variant="secondary" size="sm" onClick={() => saveReviewPdfDraft()} disabled={savingReviewPdfDraft}>
                    {savingReviewPdfDraft ? "Saving..." : "Save PDF Fields"}
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={handlePreviewPerformanceReviewPdf} disabled={renderingReviewPdf || savingReviewItemId === SAVING_ALL_REVIEW_RESPONSES_ID || !selectedPerformanceTemplate}>
                    {renderingReviewPdf ? "Rendering..." : "Preview PDF"}
                  </Btn>
                </div>
              </Card>

              {selectedReviewSections.map((section) => {
                const sectionAnswered = section.items.filter((item) => {
                  const response = getReviewResponse(item.id);
                  const draft = reviewDrafts[item.id] || {};
                  return isReviewItemAnswered(response, draft);
                }).length;

                return (
                  <Card key={section.id} style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 6 }}>{section.title}</div>
                        {section.instructions && (
                          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, maxWidth: 900 }}>{section.instructions}</div>
                        )}
                      </div>
                      <Badge color={sectionAnswered === section.items.length && section.items.length > 0 ? "success" : "warning"}>
                        {sectionAnswered}/{section.items.length} answered
                      </Badge>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {section.items.map((item) => {
                        const response = getReviewResponse(item.id);
                        const draft = reviewDrafts[item.id] || {};
                        const itemDirty = isReviewItemDraftDirty(response, draft);
                        const itemAnswered = isReviewItemAnswered(response, draft);
                        const savingThisItem = savingReviewItemId === item.id || savingReviewItemId === SAVING_ALL_REVIEW_RESPONSES_ID;
                        const ratingOptions = Array.isArray(item.options)
                          ? item.options.map((option) => ({ value: option, label: option }))
                          : [
                              { value: "Meets Expectations", label: "Meets Expectations" },
                              { value: "Needs Improvement", label: "Needs Improvement" },
                              { value: "Exceeds Expectations", label: "Exceeds Expectations" },
                            ];
                        const selectedRating = getReviewDraftValue(response, draft, "rating_value");
                        const itemFooterText = savingThisItem
                          ? "Saving response..."
                          : itemDirty
                            ? "Unsaved response"
                            : response?.created_at
                              ? `Saved ${formatTrainingTimestamp(response.created_at)}`
                              : itemAnswered
                                ? "Ready to save"
                                : "Not answered yet";

                        return (
                          <div key={item.id} className={`performance-review-item-shell${itemDirty ? " is-dirty" : ""}`}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.5, marginBottom: 12 }}>{item.prompt}</div>
                            {item.item_type === "rating" ? (
                              <div className="performance-review-rating-grid">
                                {ratingOptions.map((option) => {
                                  const selected = selectedRating === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      aria-pressed={selected}
                                      className={`performance-review-rating-option${selected ? " is-selected" : ""}`}
                                      onClick={() => handleReviewDraftChange(item.id, "rating_value", option.value)}
                                    >
                                      {selected && <I.Check />}
                                      <span>{option.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <Inp
                                type={item.item_type === "short_text" ? "text" : "textarea"}
                                rows={item.item_type === "short_text" ? 1 : 4}
                                value={getReviewDraftValue(response, draft, "response_text")}
                                onChange={(value) => handleReviewDraftChange(item.id, "response_text", value)}
                                placeholder="Enter response"
                              />
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, color: itemDirty ? C.warn : C.textMut, fontWeight: itemDirty ? 800 : 600 }}>
                                {itemDirty ? <I.Clock /> : itemAnswered ? <I.CheckCircle /> : <I.InfoCircle />}
                                <span>{itemFooterText}</span>
                              </div>
                              {itemDirty && (
                                <Btn variant="secondary" size="sm" icon={<I.Check />} onClick={() => handleSaveReviewResponse(item)} disabled={savingThisItem}>
                                  {savingThisItem ? "Saving..." : "Save"}
                                </Btn>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="performance-review-side-panel" style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Review Actions</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unsavedReviewResponseCount > 0 && (
                    <Btn
                      variant="secondary"
                      icon={<I.Check />}
                      onClick={handleSaveAllReviewResponsesClick}
                      disabled={savingReviewItemId === SAVING_ALL_REVIEW_RESPONSES_ID}
                    >
                      {savingReviewItemId === SAVING_ALL_REVIEW_RESPONSES_ID
                        ? "Saving..."
                        : `Save ${unsavedReviewResponseCount} ${unsavedReviewResponseCount === 1 ? "Response" : "Responses"}`}
                    </Btn>
                  )}
                  <Btn variant="primary" onClick={handleCompleteReviewInstance} disabled={completingReview || savingReviewItemId === SAVING_ALL_REVIEW_RESPONSES_ID}>
                    {completingReview ? "Completing..." : "Complete Review"}
                  </Btn>
                  <Btn variant="secondary" onClick={handlePreviewPerformanceReviewPdf} disabled={renderingReviewPdf || savingReviewItemId === SAVING_ALL_REVIEW_RESPONSES_ID || !selectedPerformanceTemplate}>
                    {renderingReviewPdf ? "Rendering..." : "Preview PDF"}
                  </Btn>
                  <Btn
                    variant={selectedReviewTemplateMismatch ? "secondary" : "ghost"}
                    icon={<I.RefreshCw />}
                    onClick={() => handleRestartSelectedReviewInstance(selectedRestartTemplate)}
                    disabled={restartingReview || reviewRestartBlocked || !selectedRestartTemplate?.id}
                    style={selectedReviewTemplateMismatch ? { borderColor: "rgba(217,119,6,0.28)" } : {}}
                  >
                    {restartingReview
                      ? "Restarting..."
                      : selectedReviewTemplateMismatch && selectedPerformanceTemplate
                        ? `Restart With ${selectedRestartLabel}`
                        : "Restart Review"}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setSelectedReviewInstanceId(null)}>Back to Employee</Btn>
                </div>
                {reviewRestartBlocked && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.textMut, lineHeight: 1.45 }}>
                    Restart is disabled after a signature request is sent.
                  </div>
                )}
              </Card>

              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Employee Signature</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <Badge color={reviewSignature.status === "completed" ? "success" : reviewSignature.status === "sent" ? "warning" : "default"}>
                    {reviewSignature.status ? String(reviewSignature.status).replace(/_/g, " ") : "not sent"}
                  </Badge>
                  {reviewSignature.sent_at && <Badge color="default">Sent {formatTrainingTimestamp(reviewSignature.sent_at)}</Badge>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    { id: "sms", label: "SMS" },
                    { id: "email", label: "Email" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setReviewSignatureDeliveryMethod(option.id)}
                      style={{
                        padding: "9px 10px",
                        borderRadius: 10,
                        border: `1.5px solid ${reviewSignatureDeliveryMethod === option.id ? C.pri : C.border}`,
                        background: reviewSignatureDeliveryMethod === option.id ? C.priLt : C.surface,
                        color: reviewSignatureDeliveryMethod === option.id ? C.pri : C.textSec,
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Btn
                  variant="primary"
                  onClick={handleSendPerformanceReviewSignature}
                  disabled={sendingReviewSignature || savingReviewItemId === SAVING_ALL_REVIEW_RESPONSES_ID || !selectedPerformanceTemplate}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {sendingReviewSignature ? "Sending..." : "Send to Employee"}
                </Btn>
                {reviewSignature.embed_src && (
                  <a
                    href={reviewSignature.embed_src}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "block", marginTop: 10, fontSize: 12, fontWeight: 800, color: C.pri, textDecoration: "none" }}
                  >
                    Open signing link
                  </a>
                )}
              </Card>

              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Sections</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedReviewSections.map((section) => {
                    const answered = section.items.filter((item) => {
                      const response = getReviewResponse(item.id);
                      const draft = reviewDrafts[item.id] || {};
                      return isReviewItemAnswered(response, draft);
                    }).length;
                    return (
                      <div key={section.id} style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.borderLight}`, background: C.bg }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{section.title}</div>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{answered}/{section.items.length} answered</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>

          {laborEmployeeEditorModal}
          {employeeNoteEditorModal}
          {attachmentPreviewModal}
        </div>
      );
    }

    const employeeDetailTableHeaderStyle = {
      padding: "9px 12px",
      fontSize: 11,
      fontWeight: 800,
      color: C.textMut,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      borderBottom: `1px solid ${C.border}`,
      textAlign: "left",
    };
    const employeeRecordMetricCards = buildEmployeeRecordMetricCards({
      employeeSnapshot: {
        ...(selectedLaborEmployeeSnapshot || {}),
        training_compliance_flag: selectedEmployeeTrainingRequirementSummary.isCompliant,
      },
      reviewCycleRows,
      attendanceIncidentCount30d: selectedEmployeeAttendanceIncidents30d.length,
    }).map((metric) => {
      if (metric.id !== "next_review" || !metric.helper?.startsWith("Due ")) return metric;
      return { ...metric, helper: `Due ${formatLaborDate(metric.helper.replace("Due ", ""))}` };
    });
    const metricColorByTone = { success: C.suc, warning: C.warn, danger: C.dan, default: C.text };
    const requirementStatusColor = {
      complete: "success",
      expired: "danger",
      needs_evidence: "warning",
      missing: "danger",
    };
    const trainingRequirementDocumentIds = new Set(
      selectedEmployeeTrainingRequirementRows.map((row) => row.evidenceDocument?.id).filter(Boolean)
    );
    const otherEmployeeDocuments = selectedEmployeeUnlinkedDocuments.filter((document) =>
      !trainingRequirementDocumentIds.has(document.id) && document.document_type !== "training_requirement_evidence"
    );
    const employeeRecordTabOptions = [
      { id: "training", label: "Training" },
      { id: "reviews", label: "Performance" },
      { id: "attendance", label: "Attendance" },
      { id: "notes", label: `Notes (${selectedEmployeeNotes.length})` },
      { id: "history", label: "History" },
    ];
    const selectedEmployeeAttendanceRows = toObjectRows(laborAttendanceIncidents)
      .filter((incident) => incident.labor_employee_id === selectedLaborEmployeeView.id)
      .sort((a, b) => new Date(b.incident_date || 0) - new Date(a.incident_date || 0))
      .slice(0, 10);

    return (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 16px 48px" }}>
        <button
          onClick={() => {
            setSelectedLaborEmployeeId(null);
            setSelectedLaborEmployeeSeed(null);
            setSelectedReviewInstanceId(null);
          }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}
        >
          <I.Back /> Back to Labor
        </button>

        <Card style={{ padding: 24, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ minWidth: 280, flex: "1 1 420px" }}>
              <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: C.text, marginBottom: 6 }}>{selectedLaborEmployeeView.full_name}</div>
              <div style={{ fontSize: 15, color: C.textSec, fontWeight: 700, marginBottom: 10 }}>{formatLaborPositionTitle(selectedLaborEmployeeView.position_title) || "Employee"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
	                <Badge color={selectedLaborEmployeeIsActive ? "success" : "warning"}>
	                  {selectedLaborEmployeeIsActive ? "Active Employee" : "Inactive Employee"}
	                </Badge>
	                <LaborCommitmentBadge value={selectedLaborEmployeeView.employment_commitment} />
	                {selectedLaborEmployeeSnapshot?.active_training_status && (
                  <Badge color="info">Training {String(selectedLaborEmployeeSnapshot.active_training_status).replace(/_/g, " ")}</Badge>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.textMut, fontWeight: 600 }}>
                {selectedLaborEmployeeView.start_date && <span>Start: {formatLaborDate(selectedLaborEmployeeView.start_date)}</span>}
                {selectedLaborEmployeeView.end_date && <span>End: {formatLaborDate(selectedLaborEmployeeView.end_date)}</span>}
                {employeePhone && <span>{fmtPhoneInput(employeePhone)}</span>}
                {employeeEmail && <span>{employeeEmail}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Btn
                variant="secondary"
                size="sm"
                icon={<I.Download />}
                onClick={() => handleDownloadLaborContactCard(selectedLaborEmployeeView)}
                disabled={contactCardDownloadKey === `single:${selectedLaborEmployeeKey || normalizeEmployeeName(selectedLaborEmployeeView.full_name)}`}
              >
                {contactCardDownloadKey === `single:${selectedLaborEmployeeKey || normalizeEmployeeName(selectedLaborEmployeeView.full_name)}` ? "Downloading..." : "Contact Card"}
              </Btn>
              {canEditRoster && <Btn variant="secondary" size="sm" onClick={() => openLaborEmployeeEditor(selectedLaborEmployeeView)}>Edit Employee</Btn>}
              {selectedLaborEmployeeSnapshot?.active_training_record_id ? (
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSelectedLaborEmployeeId(null);
                    setSelectedLaborEmployeeSeed(null);
                    setSelectedRecordId(selectedLaborEmployeeSnapshot.active_training_record_id);
                  }}
                >
                  Open Active Training
                </Btn>
              ) : canUseLaborTab("training") ? (
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setNewLaborEmployeeId(selectedLaborEmployeeKey || "");
                    setNewEmployeeName(selectedLaborEmployeeView.full_name || "");
                    setNewTargetRole(selectedLaborEmployeeView.position_title || "");
                    setNewHireDate(selectedLaborEmployeeView.start_date || "");
                    const match = templateOptions.find((template) =>
                      template.roleScopes.some((scope) => scope.toUpperCase() === String(selectedLaborEmployeeView.position_title || "").toUpperCase())
                    );
                    if (match) setNewTemplateId(match.value);
                    setShowNewRecord(true);
                  }}
                >
                  New Training Record
                </Btn>
              ) : null}
            </div>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
          {employeeRecordMetricCards.map((metric) => (
            <Card key={metric.id} style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 7 }}>{metric.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: metricColorByTone[metric.tone] || C.text }}>{metric.value}</div>
              {metric.helper && <div style={{ fontSize: 12, color: C.textMut, marginTop: 7, fontWeight: 600 }}>{metric.helper}</div>}
            </Card>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surfaceHover, marginBottom: 18, overflowX: "auto" }}>
          {employeeRecordTabOptions.map((option) => {
            const selected = employeeRecordTab === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setEmployeeRecordTab(option.id)}
                style={{
                  minWidth: 132,
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: selected ? "#fff" : "transparent",
                  color: selected ? C.text : C.textSec,
                  boxShadow: selected ? "0 1px 3px rgba(15,23,42,0.10)" : "none",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {employeeRecordTab === "training" && (
          <>
            {selectedEmployeePctReadinessProfile && (
              <Card style={{ padding: 18, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 6 }}>Team Readiness Board</div>
                    <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700 }}>
                      {selectedEmployeePctReadinessProfile.record.required_item_completed_count || 0}/{selectedEmployeePctReadinessProfile.record.required_item_count || 0} verified or waived
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <div style={{ minWidth: 150 }}>
                      <ProgressBar percent={selectedEmployeePctReadinessProfile.record.progress_percent} />
                      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800, marginTop: 4 }}>{Math.round(safeTrainingProgress(selectedEmployeePctReadinessProfile.record.progress_percent))}% ready</div>
                    </div>
                    <Btn
                      variant="primary"
                      size="sm"
                      icon={<I.Eye />}
                      onClick={() => {
                        setSelectedPctReadinessRecordId(selectedEmployeePctReadinessProfile.record.id);
                        setSelectedLaborEmployeeId(null);
                        setSelectedLaborEmployeeSeed(null);
                        setSelectedReviewInstanceId(null);
                        setTab("training");
                        setTrainingView("board");
                      }}
                    >
                      Open Board View
                    </Btn>
                    <Btn
                      variant="secondary"
                      size="sm"
                      icon={<I.Back />}
                      onClick={() => {
                        setSelectedLaborEmployeeId(null);
                        setSelectedLaborEmployeeSeed(null);
                        setSelectedReviewInstanceId(null);
                        setTab("training");
                        setTrainingView("board");
                      }}
                    >
                      Back to Board
                    </Btn>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                  {selectedEmployeePctReadinessProfile.categoryRows.map((category) => (
                    <div key={category.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "#fff" }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 6 }}>{category.title}</div>
                      <ProgressBar percent={category.percent} />
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: 11, color: C.textMut, fontWeight: 800 }}>
                        <span>{category.percent}%</span>
                        {category.needsCoachingCount > 0 ? <span style={{ color: C.warn }}>{category.needsCoachingCount} coaching</span> : <span>{category.verifiedCount}/{category.total}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 14 }}>
                  <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.bg }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 8 }}>Active Gaps</div>
                    {selectedEmployeePctReadinessProfile.gaps.length === 0 ? (
                      <div style={{ fontSize: 12, color: C.textMut }}>No active gaps.</div>
                    ) : selectedEmployeePctReadinessProfile.gaps.slice(0, 8).map((row) => (
                      <div key={`gap-${row.item.id}`} style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45, marginTop: 7 }}>
                        <strong style={{ color: C.text }}>{row.section.title}:</strong> {row.item.label}
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.bg }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 8 }}>Coaching Notes</div>
                    {selectedEmployeePctReadinessProfile.coachingNotes.length === 0 ? (
                      <div style={{ fontSize: 12, color: C.textMut }}>No coaching notes on the readiness board.</div>
                    ) : selectedEmployeePctReadinessProfile.coachingNotes.slice(0, 8).map((row) => (
                      <div key={`coach-${row.item.id}`} style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45, marginTop: 7 }}>
                        <strong style={{ color: C.text }}>{row.section.title}:</strong> {row.cell.latest_note || getPctReadinessStatusPresentation(row.status).label}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${C.borderLight}`, borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={employeeDetailTableHeaderStyle}>Category</th>
                        <th style={employeeDetailTableHeaderStyle}>Task</th>
                        <th style={employeeDetailTableHeaderStyle}>Status</th>
                        <th style={employeeDetailTableHeaderStyle}>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEmployeePctReadinessProfile.taskRows.map((row) => {
                        const presentation = getPctReadinessStatusPresentation(row.status);
                        const style = PCT_READINESS_STATUS_STYLES[presentation.value] || PCT_READINESS_STATUS_STYLES.not_started;
                        return (
                          <tr key={row.item.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.text, fontWeight: 800, verticalAlign: "top", width: 170 }}>{row.section.title}</td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec, lineHeight: 1.45, verticalAlign: "top" }}>{row.item.label}</td>
                            <td style={{ padding: "10px 12px", verticalAlign: "top", width: 160 }}>
                              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: "5px 8px", borderRadius: 8, border: `1px solid ${style.border}`, background: style.bg, color: style.text, fontSize: 11, fontWeight: 900 }}>
                                {style.icon} {presentation.label}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.textMut, lineHeight: 1.45, verticalAlign: "top", width: 220 }}>
                              {row.cell.latest_note || row.cell.verified_by || row.cell.demonstrated_by || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card style={{ padding: 18, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 6 }}>Training Requirements</div>
                  <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700 }}>{selectedEmployeeTrainingRequirementSummary.helper}</div>
                </div>
                <Badge color={selectedEmployeeTrainingRequirementSummary.color}>{selectedEmployeeTrainingRequirementSummary.label}</Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedEmployeeTrainingRequirementRows.map((requirementRow) => {
                  const externalDocument = requirementRow.externalUrl
                    ? {
                        id: `requirement-url-${requirementRow.slug}-${requirementRow.certification?.id || "external"}`,
                        file_name: `${requirementRow.label} link`,
                        external_url: requirementRow.externalUrl,
                        mime_type: "application/pdf",
                      }
                    : null;
                  const statusLabel = requirementRow.status === "needs_evidence"
                    ? "Needs Evidence"
                    : requirementRow.status === "missing"
                      ? "Missing"
                      : requirementRow.status === "expired"
                        ? "Expired"
                        : "Complete";
                  return (
                    <div
                      key={requirementRow.slug}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(190px, 1.1fr) minmax(150px, 0.8fr) minmax(220px, 1fr) auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "13px 14px",
                        borderRadius: 8,
                        border: `1px solid ${C.borderLight}`,
                        background: "#fff",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{requirementRow.label}</div>
                        <div style={{ fontSize: 11, color: C.textMut, fontWeight: 650, marginTop: 3 }}>{requirementRow.helper}</div>
                      </div>
                      <div>
                        <Badge color={requirementStatusColor[requirementRow.status] || "default"}>{statusLabel}</Badge>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 5, fontWeight: 650 }}>
                          {requirementRow.certification?.completed_on ? `Completed ${formatLaborDate(requirementRow.certification.completed_on)}` : "No completion date"}
                          {requirementRow.certification?.expires_on ? ` · Expires ${formatLaborDate(requirementRow.certification.expires_on)}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                        {requirementRow.evidenceDocument ? renderEmployeeDocumentButton(requirementRow.evidenceDocument) : null}
                        {externalDocument ? renderEmployeeDocumentButton(externalDocument) : null}
                        {!requirementRow.evidenceDocument && !externalDocument ? (
                          <span style={{ fontSize: 11, color: C.textMut, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Evidence required
                          </span>
                        ) : null}
                      </div>
                      <Btn variant="secondary" size="sm" onClick={() => openTrainingRequirementEditor(requirementRow)}>
                        Update
                      </Btn>
                    </div>
                  );
                })}
              </div>
            </Card>

            <SectionHeader title="Training History" count={employeeTrainingRecords.length} />
            {employeeTrainingRecords.length === 0 ? (
              <EmptyState icon="GraduationCap" title="No training records yet" subtitle="Create a training record from the roster or training tab" />
            ) : (
              <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={employeeDetailTableHeaderStyle}>Position</th>
                      <th style={employeeDetailTableHeaderStyle}>Training Plan</th>
                      <th style={employeeDetailTableHeaderStyle}>Status</th>
                      <th style={employeeDetailTableHeaderStyle}>Progress</th>
                      <th style={employeeDetailTableHeaderStyle}>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeTrainingRecords.map((record) => (
                      <tr
                        key={record.id}
                        onClick={() => {
                          setSelectedLaborEmployeeId(null);
                          setSelectedLaborEmployeeSeed(null);
                          setSelectedRecordId(record.id);
                        }}
                        style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
                      >
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.text, fontWeight: 700 }}>{formatLaborPositionTitle(record.target_role) || "—"}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{record.template_name_snapshot}</td>
                        <td style={{ padding: "11px 12px" }}><StatusBadge status={record.overall_status} /></td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{Math.round(safeTrainingProgress(record.progress_percent))}%</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textMut }}>{record.target_end_date ? formatLaborDate(record.target_end_date) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}

        {employeeRecordTab === "reviews" && (
          <>
            <SectionHeader title="Performance Reviews" count={selectedEmployeeReviewInstances.length} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 20 }}>
              {reviewCycleRows.map((cycle) => (
                <Card key={cycle.id} style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 5 }}>{cycle.label}</div>
                      <div style={{ fontSize: 12, color: C.textMut }}>Due {cycle.dueDate ? formatLaborDate(cycle.dueDate) : "—"}</div>
                    </div>
                    <Badge color={cycle.status === "completed" ? "success" : cycle.status === "overdue" ? "danger" : "warning"}>
                      {String(cycle.status).replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {cycle.instance ? (
                    <Btn variant="primary" size="sm" onClick={() => setSelectedReviewInstanceId(cycle.instance.id)}>Open Review</Btn>
                  ) : (
                    <Btn variant="secondary" size="sm" onClick={() => handleCreateReviewInstance(cycle.id)}>Start Review</Btn>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        {employeeRecordTab === "notes" && (
          <>
            <Card style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
                <Inp
                  label="Note Type"
                  type="select"
                  value={employeeNoteType}
                  onChange={setEmployeeNoteType}
                  options={LABOR_NOTE_TYPE_OPTIONS}
                />
                <Inp
                  label="New Employee Note"
                  type="textarea"
                  rows={3}
                  value={employeeNoteText}
                  onChange={setEmployeeNoteText}
                  placeholder="Add a manager-facing note for this employee"
                />
              </div>
              <input
                ref={employeeNoteFileInputRef}
                type="file"
                multiple
                accept={LABOR_EMPLOYEE_ATTACHMENT_ACCEPT}
                onChange={handleEmployeeNoteFileChange}
                style={{ display: "none" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn variant="secondary" size="sm" icon={<I.FileText />} onClick={() => employeeNoteFileInputRef.current?.click()}>
                    Attach PDF/Image
                  </Btn>
                  {employeeNoteFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, color: C.textSec, fontWeight: 700 }}>
                      {file.name}
                      <button type="button" onClick={() => handleRemoveEmployeeNoteFile(index)} style={{ border: "none", background: "transparent", color: C.textMut, cursor: "pointer", padding: 0, display: "flex" }}>
                        <I.X />
                      </button>
                    </span>
                  ))}
                </div>
                <Btn variant="primary" size="sm" onClick={handleAddEmployeeNote} disabled={savingEmployeeNote || !employeeNoteText.trim()}>
                  {savingEmployeeNote ? "Saving..." : "Add Employee Note"}
                </Btn>
              </div>
              {employeeNoteFileErrors.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: C.dan, fontWeight: 700 }}>
                  {employeeNoteFileErrors.join(" ")}
                </div>
              )}
	            </Card>

	            <SectionHeader title="Employee Notes" count={filteredSelectedEmployeeNotes.length} />
	            <Card style={{ padding: 14, marginBottom: 12 }}>
	              <Inp
	                label="Search Notes"
	                value={employeeNoteSearchText}
	                onChange={setEmployeeNoteSearchText}
	                placeholder="Search note text, type, author, or date"
	              />
	            </Card>
	            <Card style={{ padding: 16, marginBottom: 20 }}>
	              {filteredSelectedEmployeeNotes.length === 0 ? (
	                <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>
	                  {employeeNoteSearchText.trim() ? "No employee notes match this search" : "No employee notes yet"}
	                </div>
	              ) : (
	                filteredSelectedEmployeeNotes.map((note) => {
                  const noteDocuments = toObjectRows(selectedEmployeeDocumentsByNote[note.id] || []);
                  return (
                    <div key={note.id} style={{ padding: "13px 0", borderTop: `1px solid ${C.borderLight}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 5 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{note.created_by_name || "Staff"}</span>
                          <Badge color="default">{String(note.note_type || "general").replace(/_/g, " ")}</Badge>
                          <span style={{ fontSize: 11, color: C.textMut }}>{formatTrainingTimestamp(note.created_at)}</span>
                        </div>
                        <Btn variant="ghost" size="sm" icon={<I.Edit />} onClick={() => openEmployeeNoteEditor(note)}>
                          Edit
                        </Btn>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{note.note_text}</div>
                      {noteDocuments.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          {noteDocuments.map((document) => renderEmployeeDocumentButton(document))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {otherEmployeeDocuments.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 8 }}>Other Documents</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {otherEmployeeDocuments.map((document) => renderEmployeeDocumentButton(document))}
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {employeeRecordTab === "attendance" && (
          <>
            <SectionHeader title="Attendance Marks" count={selectedEmployeeAttendanceRows.length}>
              <Btn variant="secondary" size="sm" onClick={() => nav("attendance", { employeeId: selectedLaborEmployeeKey, tab: "history" })} disabled={!selectedLaborEmployeeKey}>Open Attendance</Btn>
            </SectionHeader>
            {selectedEmployeeAttendanceRows.length === 0 ? (
              <Card style={{ padding: 18, color: C.textMut, fontSize: 13 }}>No attendance marks recorded for this employee.</Card>
            ) : (
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={employeeDetailTableHeaderStyle}>Date</th>
                      <th style={employeeDetailTableHeaderStyle}>Mark</th>
                      <th style={employeeDetailTableHeaderStyle}>Detail</th>
                      <th style={employeeDetailTableHeaderStyle}>Logged By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEmployeeAttendanceRows.map((incident) => (
                      <tr key={incident.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.text, fontWeight: 700 }}>{incident.incident_date ? formatLaborDate(incident.incident_date) : "—"}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{getAttendanceIncidentLabel(incident.incident_type)}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{incident.detail || "—"}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textMut }}>{incident.created_by_name || "Staff"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}

        {employeeRecordTab === "history" && (
          <>
            <SectionHeader title="Employee History" count={selectedEmployeeHistoryTimeline.length} />
            {selectedEmployeeHistoryTimeline.length === 0 ? (
              <Card style={{ padding: 18, color: C.textMut, fontSize: 13 }}>No employee history has been recorded yet.</Card>
            ) : (
              <Card style={{ padding: 0, overflow: "hidden" }}>
                {selectedEmployeeHistoryTimeline.map((item, index) => {
                  const noteDocuments = item.note?.id
                    ? selectedEmployeeDocuments.filter((document) => document.labor_employee_note_id === item.note.id)
                    : [];
                  const itemDocuments = item.document ? [item.document] : noteDocuments;
                  const oldNewVisible = item.oldValue || item.newValue;
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "14px 16px",
                        borderTop: index === 0 ? "none" : `1px solid ${C.borderLight}`,
                        display: "grid",
                        gridTemplateColumns: "120px minmax(0, 1fr) 170px",
                        gap: 14,
                        alignItems: "start",
                      }}
                    >
                      <div>
                        <Badge color={item.tone === "danger" ? "danger" : "default"}>{String(item.category || "history").replace(/_/g, " ")}</Badge>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{item.title}</div>
                        {item.summary ? (
                          <div style={{ fontSize: 12, color: C.textSec, marginTop: 5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{item.summary}</div>
                        ) : null}
                        {oldNewVisible ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: C.textMut, fontWeight: 800 }}>
                            {item.oldValue ? <span>From: {item.oldValue}</span> : null}
                            {item.newValue ? <span>To: {item.newValue}</span> : null}
                          </div>
                        ) : null}
                        {itemDocuments.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            {itemDocuments.map((document) => renderEmployeeDocumentButton(document))}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", color: C.textMut, fontSize: 11, fontWeight: 700 }}>
                        <div style={{ color: C.text, fontSize: 12 }}>{item.actorName || "Staff"}</div>
                        <div style={{ marginTop: 4 }}>{formatTrainingTimestamp(item.occurredAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {trainingRequirementEditor && (
          <Modal title={`Update ${trainingRequirementEditor.label}`} onClose={() => setTrainingRequirementEditor(null)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Inp label="Completed On" type="date" value={trainingRequirementCompletedOn} onChange={setTrainingRequirementCompletedOn} required />
              {trainingRequirementEditor.slug === LABOR_TRAINING_REQUIREMENT_SLUGS.CPR && (
                <>
                  <Inp label="Expires On" type="date" value={trainingRequirementExpiresOn} onChange={setTrainingRequirementExpiresOn} />
                  <Inp label="Certification URL" value={trainingRequirementDocumentUrl} onChange={setTrainingRequirementDocumentUrl} />
                </>
              )}
              <input
                ref={trainingRequirementFileInputRef}
                type="file"
                accept={LABOR_TRAINING_REQUIREMENT_PDF_ACCEPT}
                onChange={handleTrainingRequirementEvidenceFileChange}
                style={{ display: "none" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Btn variant="secondary" size="sm" icon={<I.FileText />} onClick={() => trainingRequirementFileInputRef.current?.click()}>
                  Upload PDF
                </Btn>
                {trainingRequirementEvidenceFile ? (
                  <span style={{ fontSize: 12, color: C.textSec, fontWeight: 800 }}>
                    {trainingRequirementEvidenceFile.name}
                  </span>
                ) : trainingRequirementEditor.evidenceDocument ? (
                  renderEmployeeDocumentButton(trainingRequirementEditor.evidenceDocument, { allowDelete: true })
                ) : null}
              </div>
              {trainingRequirementEvidenceError && (
                <div style={{ fontSize: 12, color: C.dan, fontWeight: 800 }}>{trainingRequirementEvidenceError}</div>
              )}
              <Inp label="Source Note" type="textarea" rows={3} value={trainingRequirementSourceNote} onChange={setTrainingRequirementSourceNote} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Btn variant="ghost" onClick={() => setTrainingRequirementEditor(null)}>Cancel</Btn>
                <Btn variant="primary" onClick={handleSaveTrainingRequirement} disabled={savingTrainingRequirement || !trainingRequirementCompletedOn}>
                  {savingTrainingRequirement ? "Saving..." : "Save Requirement"}
                </Btn>
              </div>
            </div>
          </Modal>
        )}

        {attachmentPreviewModal}
        {laborEmployeeEditorModal}
        {employeeNoteEditorModal}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORD DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (selectedRecordId && !selectedRecord) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        <button onClick={() => { setSelectedRecordId(null); setExpandedSections({}); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
          <I.Back /> Back to Labor
        </button>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>
            {loading ? "Loading training record..." : "Training record unavailable"}
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            {loading ? "Labor is still loading the selected training record." : "The selected training record is not present in the current labor data set."}
          </div>
        </Card>
      </div>
    );
  }

  if (selectedRecordId && selectedRecord) {
    const recordProgress = safeTrainingProgress(selectedRecord.progress_percent);
    const requiredCompletedCount = Number.isFinite(Number(selectedRecord.required_item_completed_count))
      ? Number(selectedRecord.required_item_completed_count)
      : 0;
    const requiredItemCount = Number.isFinite(Number(selectedRecord.required_item_count))
      ? Number(selectedRecord.required_item_count)
      : 0;
    const recordEmployeeName = selectedRecord.employee_full_name || selectedLaborEmployeeView?.full_name || "Employee";
    const recordTargetRole = formatLaborPositionTitle(selectedRecord.target_role || selectedLaborEmployeeView?.position_title) || "Employee";
    const recordTemplateName = selectedRecord.template_name_snapshot || selectedVersion?.name || "Training Plan";

    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {/* Back button */}
        <button onClick={() => { setSelectedRecordId(null); setExpandedSections({}); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
          <I.Back /> Back to Labor
        </button>

        {/* Record Header */}
        <Card style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>{recordEmployeeName}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge color="primary">Position: {recordTargetRole}</Badge>
                <Badge color="default">Training Plan: {recordTemplateName}</Badge>
                {selectedLaborEmployeeSnapshot?.employment_status && (
                  <Badge color={selectedLaborEmployeeSnapshot?.is_active ? "success" : "warning"}>
                    {String(selectedLaborEmployeeSnapshot?.employment_status || "inactive").replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut, alignItems: "center" }}>
                {selectedRecord.hire_date && <span>Hire: {formatLaborDate(selectedRecord.hire_date)}</span>}
                {selectedRecord.training_start_date && <span>Start: {formatLaborDate(selectedRecord.training_start_date)}</span>}
                {selectedRecord.target_end_date && <span>Target: {formatLaborDate(selectedRecord.target_end_date)}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <StatusBadge status={selectedRecord.overall_status} />
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: C.pri }}>{Math.round(recordProgress)}%</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{requiredCompletedCount} / {requiredItemCount} items</div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="secondary" size="sm" onClick={openRecordConfigModal}>Edit Configuration</Btn>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><ProgressBar percent={recordProgress} height={8} /></div>
        </Card>

        {/* Sections */}
        <SectionHeader title="Training Plan" count={recordSections.length} />
        {recordSections.length === 0 ? (
          <Card style={{ padding: 18, marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 6 }}>
              {trainingBundleLoading ? "Loading training plan..." : "Training plan unavailable"}
            </div>
            <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
              {trainingBundleLoading
                ? "The record is open while its template sections are still loading."
                : "This record references a template version that is not present in the loaded training bundle. The record details are still available above."}
            </div>
          </Card>
        ) : recordSections.map(sec => {
          const isOpen = expandedSections[sec.id];
          const comp = sectionCompletionMap[sec.id] || { total: 0, done: 0 };
          const childSecs = getChildSections(sec.id);
          const directItems = getSectionItems(sec.id);
          const secPercent = comp.total > 0 ? Math.round((comp.done / comp.total) * 100) : 0;

          return (
            <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
              <button onClick={() => toggleSection(sec.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}><I.ChevronRight /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.title}</div>
                    {(sec.day_number || sec.time_block_start || sec.instructions) && (
                      <div style={{ fontSize: 11, color: C.textMut }}>
                        {formatTrainingTimeRange(sec.time_block_start, sec.time_block_end) || (sec.day_number ? `Day ${sec.day_number}` : "")}
                        {sec.time_block_note && <span style={{ color: C.warn, marginLeft: 6 }}>{sec.time_block_note}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>{comp.done}/{comp.total}</span>
                  <div style={{ width: 60 }}><ProgressBar percent={secPercent} /></div>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 16px 14px" }}>
                  {sec.instructions && (
                    <div style={{ marginTop: 12, marginBottom: 8, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
                      {sec.instructions}
                    </div>
                  )}
                  {/* Render child module sections */}
                  {childSecs.map(child => {
                    const childItems = getSectionItems(child.id);
                    return (
                      <div key={child.id} style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{child.title}</div>
                        {child.instructions && (
                          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45, marginBottom: 6 }}>
                            {child.instructions}
                          </div>
                        )}
                        {childItems.map((item) => renderRecordItem(item))}
                      </div>
                    );
                  })}
                  {/* Direct items (no child modules) */}
                  {childSecs.length === 0 && directItems.map((item) => renderRecordItem(item))}
                </div>
              )}
            </Card>
          );
        })}

        {/* Aggregate Notes */}
        <div style={{ marginTop: 28 }}>
          <SectionHeader title="All Notes & Observations" count={aggregatedNoteFeed.length} />
          <Card style={{ padding: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Inp
                label="General Trainee Note"
                type="textarea"
                rows={3}
                value={generalNoteText}
                onChange={setGeneralNoteText}
                placeholder="Add a general note that is not tied to a specific task"
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="primary" size="sm" onClick={handleAddGeneralNote} disabled={savingGeneralNote}>
                  {savingGeneralNote ? "Saving..." : "Add Record Note"}
                </Btn>
              </div>
            </div>
            {aggregatedNoteFeed.length === 0 && <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No notes yet</div>}
            {aggregatedNoteFeed.map((note) => (
              <div key={note.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>{note.created_by_name || note.initials || "Staff"}</span>
                  <Badge color="default">{note.sourceType}: {note.sourceLabel}</Badge>
                  <span style={{ fontSize: 11, color: C.textMut }}>{formatTrainingTimestamp(note.created_at)}</span>
                </div>
                <div style={{ color: C.textSec, lineHeight: 1.5 }}>{note.note_text}</div>
              </div>
            ))}
          </Card>
        </div>

        {showRecordConfig && (
          <Modal title="Edit Trainee Configuration" onClose={() => setShowRecordConfig(false)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <CustomSelect
                value={configLaborEmployeeId}
                onChange={(value) => {
                  setConfigLaborEmployeeId(value);
                  const employee = toObjectRows(laborEmployees).find((entry) => entry.id === value);
                  if (!employee) return;
                  setConfigEmployeeName(employee.full_name || "");
                  setConfigTargetRole(employee.position_title || "");
                  setConfigHireDate(employee.start_date || "");
                }}
                options={laborEmployeeOptions}
                placeholder="Link to roster employee"
              />
              <Inp label="Employee Full Name" value={configEmployeeName} onChange={setConfigEmployeeName} required />
              <HourAnalysisAnimatedPicker
                label="Position Title"
                value={formatLaborPositionTitle(configTargetRole)}
                onChange={setConfigTargetRole}
                options={getLaborPositionOptionsWithCurrent(configTargetRole)}
                placeholder="Choose approved title"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Inp label="Hire Date" type="date" value={configHireDate} onChange={setConfigHireDate} />
                <Inp label="Training Start Date" type="date" value={configStartDate} onChange={setConfigStartDate} />
              </div>
              <Inp label="Target End Date" type="date" value={configTargetEndDate} onChange={setConfigTargetEndDate} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => setShowRecordConfig(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={handleSaveRecordConfig} disabled={savingConfig}>
                  {savingConfig ? "Saving..." : "Save Changes"}
                </Btn>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEWS
  // ═══════════════════════════════════════════════════════════════════════════

	  const MetricCard = ({ label, value, helper, color = C.pri }) => (
	    <Card style={{ padding: 16 }}>
	      <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      {helper ? <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>{helper}</div> : null}
    </Card>
  );

  const RecordRow = ({ rec }) => (
    <tr
	      onClick={() => {
	        setSelectedLaborEmployeeId(null);
	        setSelectedLaborEmployeeSeed(null);
	        setSelectedRecordId(rec.id);
	      }}
      style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: C.text }}>{rec.employee_full_name}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{formatLaborPositionTitle(rec.target_role) || "—"}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{rec.template_name_snapshot}</td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ minWidth: 110 }}>
          <ProgressBar percent={rec.progress_percent} />
          <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>{Math.round(rec.progress_percent || 0)}%</div>
        </div>
      </td>
      <td style={{ padding: "10px 12px" }}><StatusBadge status={rec.overall_status} /></td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textMut }}>{rec.target_end_date ? formatLaborDate(rec.target_end_date) : "—"}</td>
    </tr>
  );

		  const tableHeaderStyle = { padding: "9px 10px", fontSize: 10.5, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, borderBottom: `2px solid ${C.border}`, textAlign: "left", whiteSpace: "nowrap" };
  const pctReadinessEmployeeBoardTableHeaderStyle = {
    padding: "9px 12px",
    fontSize: 11,
    fontWeight: 800,
    color: C.textMut,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: `1px solid ${C.border}`,
    textAlign: "left",
  };
	  const rosterCellStyle = { padding: "12px 10px", fontSize: 12.5, lineHeight: 1.35, fontWeight: 700, color: C.text, verticalAlign: "middle" };
	  const rosterSecondaryCellStyle = { ...rosterCellStyle, color: C.textSec, fontWeight: 650 };
  const rosterUsedKeys = Object.keys(rosterDraftFilters);
  const rosterAvailableFields = LABOR_ROSTER_FILTER_FIELDS.filter((field) => !rosterUsedKeys.includes(field.key));
  const rosterFilterSections = [...new Set(LABOR_ROSTER_FILTER_FIELDS.map((field) => field.section))];
  const isRosterFilterAdmin = profile?.role === "owner" || profile?.role === "enterprise_admin";
  const rosterNeedsValue = (op) => !["empty", "notEmpty", "has", "missing", "overdue", "today", "thisWeek", "hasDate", "noDate"].includes(op);
  const removeRosterFilter = (key) => {
    setRosterDraftFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (configuringRosterKey === key) setConfiguringRosterKey(null);
  };
  const updateRosterFilter = (key, field, value) => {
    setRosterDraftFilters((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };
  const applyRosterFilters = () => {
    setRosterFilters(rosterDraftFilters);
    setShowRosterFilterPanel(false);
    setShowRosterFilterPicker(false);
    setConfiguringRosterKey(null);
  };
	  const clearRosterFilters = () => {
	    setRosterDraftFilters(DEFAULT_ROSTER_FILTERS);
	    setRosterFilters(DEFAULT_ROSTER_FILTERS);
    setActiveRosterViewId(null);
    setConfiguringRosterKey(null);
    setShowRosterFilterPicker(false);
  };
  const saveRosterView = async () => {
    if (!rosterViewName.trim()) return;
    const newView = {
      id: Date.now().toString(36),
      name: rosterViewName.trim(),
      filters: { ...rosterDraftFilters },
      createdBy: profile?.id || "unknown",
      createdAt: new Date().toISOString(),
    };
    await persistRosterViews([...(savedRosterViews || []), newView]);
    setActiveRosterViewId(newView.id);
    setRosterViewName("");
    setShowSaveRosterView(false);
    addGlobalToast?.(`View "${newView.name}" saved`, "success");
  };
  const deleteRosterView = async (viewId) => {
    await persistRosterViews((savedRosterViews || []).filter((view) => view.id !== viewId));
    if (activeRosterViewId === viewId) setActiveRosterViewId(null);
    addGlobalToast?.("View deleted");
  };
  const loadRosterView = (view) => {
    setRosterDraftFilters({ ...view.filters });
    setRosterFilters({ ...view.filters });
    setActiveRosterViewId(view.id);
    setShowRosterFilterPicker(false);
    setConfiguringRosterKey(null);
  };
  const selectRosterField = (key) => {
    const field = LABOR_ROSTER_FILTER_FIELDS.find((candidate) => candidate.key === key);
    if (!field) return;
    if (field.ops.length === 1 && !rosterNeedsValue(field.ops[0])) {
      setRosterDraftFilters((prev) => ({ ...prev, [key]: { op: field.ops[0], val: "" } }));
      setShowRosterFilterPicker(false);
      setConfiguringRosterKey(null);
      return;
    }
    setRosterDraftFilters((prev) => ({ ...prev, [key]: { op: field.ops[0], val: "" } }));
    setConfiguringRosterKey(key);
  };
  const confirmRosterConfig = () => {
    setConfiguringRosterKey(null);
    setShowRosterFilterPicker(false);
  };
  const handleHierarchyDrop = async (targetTitle) => {
    if (!draggingHierarchyTitle || draggingHierarchyTitle === targetTitle) return;
    const reordered = [...hierarchyDraft];
    const fromIndex = reordered.findIndex((row) => row.normalized_title === draggingHierarchyTitle);
    const toIndex = reordered.findIndex((row) => row.normalized_title === targetTitle);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggingHierarchyTitle("");
      return;
    }
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setHierarchyDraft(reordered);
    setDraggingHierarchyTitle("");
  };
  const rosterSectionIcons = {
    "Employee Info": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    Employment: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 20V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16"/><rect x="6" y="6" width="4" height="4"/><path d="M18 7h4v13h-4"/><path d="M6 14h4"/><path d="M6 18h4"/></svg>,
    Compliance: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 12 2 2 4-4"/><path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z"/></svg>,
    Reviews: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>,
  };
  const configuringRosterField = configuringRosterKey ? LABOR_ROSTER_FILTER_FIELDS.find((field) => field.key === configuringRosterKey) : null;
  const configuringRosterValue = configuringRosterKey ? rosterDraftFilters[configuringRosterKey] : null;
  const displayLaborTab = tab === "templates" ? "training" : tab;
  const hourAnalysisLaborModelSummary = hourAnalysisModel.laborModelSummary;
  const activeHourAnalysisLaborModelDayKey = LABOR_MODEL_DAY_KEYS.includes(hourAnalysisLaborModelTab) ? hourAnalysisLaborModelTab : "monday";
  const activeHourAnalysisLaborModelDay = hourAnalysisSettings.laborModel?.days?.[activeHourAnalysisLaborModelDayKey] || hourAnalysisLaborModelSummary.model.days[activeHourAnalysisLaborModelDayKey];
  const activeHourAnalysisLaborModelDaySummary = hourAnalysisLaborModelSummary.dayRows.find((day) => day.key === activeHourAnalysisLaborModelDayKey) || hourAnalysisLaborModelSummary.dayRows[0];
  const activeLaborModelBreakers = getLaborModelBreakersForDay(hourAnalysisSettings.laborModel?.breakers, activeHourAnalysisLaborModelDayKey);
  const selectedLaborModelCellCount = selectedLaborModelCells.size;
  const laborModelTabItems = [
    { id: LABOR_MODEL_SUMMARY_TAB, label: "Summary", detail: `${formatHourAnalysisHours(hourAnalysisLaborModelSummary.totalWeekly)} wk` },
    ...LABOR_MODEL_DAY_KEYS.map((dayKey) => {
      const daySummary = hourAnalysisLaborModelSummary.dayRows.find((day) => day.key === dayKey);
      return {
        id: dayKey,
        label: LABOR_MODEL_DAY_LABELS[dayKey],
        detail: `${formatHourAnalysisHours(daySummary?.totalHours || 0)} hrs`,
        marketingDetail: daySummary?.marketingHours ? `MKTG ${formatHourAnalysisHours(daySummary.marketingHours)}` : "",
      };
    }),
  ];
  const headerAction = (() => {
    if (tab === "home") {
      return null;
    }
    if (tab === "training") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {canManageTemplates && (
            <button
              type="button"
              className="labor-template-gear-button"
              title="Training templates"
              aria-label="Training templates"
              onClick={() => changeLaborTab("templates")}
            >
              <I.Settings />
            </button>
          )}
          {trainingView === "board" && (
            <Btn variant="secondary" icon={<I.Plus />} onClick={() => setShowPctReadinessNewRecord(true)}>Add Trainee</Btn>
          )}
          <Btn variant="primary" onClick={async () => { await loadTrainingBundle(); setShowNewRecord(true); }}>New Training Record</Btn>
        </div>
      );
    }
    if (tab === "templates" && canManageTemplates) {
      if (previewTemplateId) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Btn variant="secondary" icon={<I.Back />} onClick={() => changeLaborTab("training")}>Training</Btn>
            <Btn variant="primary" onClick={handleCreateTemplateDraft} disabled={savingTemplateAction === "draft"}>
              {savingTemplateAction === "draft" ? "Cloning..." : "New Draft"}
            </Btn>
          </div>
        );
      }
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn variant="secondary" icon={<I.Back />} onClick={() => changeLaborTab("training")}>Training</Btn>
          <Btn variant="primary" onClick={async () => { await loadTrainingBundle(); setShowCreateTemplateModal(true); }}>Add Template</Btn>
        </div>
      );
    }
    if (tab === "attendance" || tab === "interviews") {
      return null;
    }
    if (tab === "notes") {
      if (!canAccessEmployeeNotes) return null;
      return <Btn variant="primary" onClick={() => setShowGlobalNoteModal(true)}>Add Employee Note</Btn>;
    }
    if (tab === "hour-analysis") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 11, fontWeight: 850, color: savingHourAnalysis ? "#B45309" : C.textMut }}>
            {savingHourAnalysis ? "Saving..." : "Auto-saved"}
          </span>
          <Btn variant="secondary" icon={<I.Clock />} onClick={() => setShowHourAnalysisAudit(true)}>
            Activity
          </Btn>
          {canEditRoster && capacityPlanningView === "staffing-capacity" && (
            <Btn variant="secondary" icon={<I.RefreshCw />} onClick={resetHourAnalysisPlanningState} disabled={!hasHourAnalysisPlanningState}>
              Reset
            </Btn>
          )}
          {canEditRoster && capacityPlanningView === "staffing-capacity" && (
            <Btn variant="primary" icon={<I.Plus />} onClick={() => setShowHourAnalysisWhatIfModal(true)}>
              Add Employee / What If
            </Btn>
          )}
        </div>
      );
    }
    return null;
  })();
  const activeLaborTabIndex = Math.max(0, visibleTabs.findIndex((item) => item.id === displayLaborTab));

  return (
	    <div className="labor-page-shell">
      <PerformanceReviewStyles />
	      <style>{`
        html { scrollbar-gutter: stable; }
        body { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
        body::-webkit-scrollbar { width: 0; height: 0; }
	        @keyframes laborRosterComposerIn {
          0% { opacity: 0; transform: translateY(-18px) scale(0.985); filter: blur(4px); }
          65% { opacity: 1; transform: translateY(2px) scale(1.002); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes laborRosterComposerSweep {
          0% { transform: translate3d(-200%, 0, 0) skewX(-18deg); opacity: 0; }
          12% { opacity: 0; }
          24% { opacity: 0.38; }
          48% { opacity: 0.86; }
          72% { opacity: 0.26; }
          100% { transform: translate3d(420%, 0, 0) skewX(-18deg); opacity: 0; }
        }
        @keyframes laborRosterFreshRow {
          0% { background: rgba(132, 204, 22, 0.22); }
          100% { background: transparent; }
        }
        @keyframes filterSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes filterFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        @keyframes filterChipIn { from { opacity:0; transform:translateX(-6px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes configSlide { from { opacity:0; max-height:0; transform:translateY(-4px); } to { opacity:1; max-height:200px; transform:translateY(0); } }
        @keyframes laborModuleEnter {
          0% { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.992); filter: blur(5px); }
          68% { opacity: 1; transform: translate3d(0, -1px, 0) scale(1.001); filter: blur(0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
        }
        @keyframes laborTabLightSweep {
          0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
          24% { opacity: 0.42; }
          58% { opacity: 0.18; }
          100% { transform: translateX(160%) skewX(-18deg); opacity: 0; }
        }
        @keyframes laborControlSettle {
          0% { opacity: 0; transform: translate3d(0, -6px, 0) scale(0.99); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
	        .labor-page-shell {
	          max-width: 1340px;
	          margin: 0 auto;
	          padding: 20px 10px 34px;
	          min-height: calc(100vh - 40px);
	          box-sizing: border-box;
	        }
        .labor-module-header {
          min-height: 52px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          margin-bottom: 18px;
        }
        .labor-module-title {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .labor-module-title span {
          font-size: 22px;
          font-weight: 900;
          color: ${C.text};
          letter-spacing: 0;
          line-height: 1.1;
        }
        .labor-header-action-slot {
          min-width: 178px;
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-shrink: 0;
        }
	        .labor-roster-action-bar {
	          display: flex;
	          align-items: center;
	          justify-content: flex-end;
	          gap: 8px;
	          flex-wrap: wrap;
	        }
	        .labor-roster-action-button,
	        .labor-roster-action-bar .labor-sort-trigger {
	          min-height: 34px;
	          display: inline-flex;
	          align-items: center;
	          justify-content: center;
	          gap: 7px;
	          border: 1px solid #d9e2ec;
	          border-radius: 8px;
	          background: #fff;
	          color: ${C.textSec};
	          padding: 8px 11px;
	          font-family: inherit;
	          font-size: 12px;
	          font-weight: 900;
	          line-height: 1;
	          cursor: pointer;
	          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.045);
	          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
	        }
	        .labor-roster-action-button svg,
	        .labor-roster-action-bar .labor-sort-trigger svg {
	          width: 15px;
	          height: 15px;
	        }
	        .labor-roster-action-button:hover,
	        .labor-roster-action-bar .labor-sort-trigger:hover {
	          background: #f8fafc;
	          border-color: #b8c5d5;
	          color: ${C.pri};
	          transform: translateY(-1px);
	        }
	        .labor-roster-action-button:disabled {
	          opacity: 0.52;
	          cursor: not-allowed;
	          transform: none;
	        }
	        .labor-roster-action-button.is-icon {
	          width: 34px;
	          padding: 0;
	        }
	        .labor-roster-action-button.is-active,
	        .labor-roster-action-bar .labor-sort-trigger.is-active {
	          border-color: rgba(20, 83, 45, 0.32);
	          background: #f0fdf4;
	          color: ${C.pri};
	        }
	        .labor-roster-action-button.is-primary {
	          border-color: ${C.pri};
	          background: ${C.pri};
	          color: #fff;
	          box-shadow: 0 12px 24px rgba(20, 83, 45, 0.18);
	        }
	        .labor-roster-action-button.is-primary:hover {
	          background: #0f3f22;
	          color: #fff;
	        }
	        .labor-roster-table-card {
	          border-radius: 8px;
	          border: 1px solid #e1e8f0;
	          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.055);
	        }
	        .labor-roster-table {
	          width: 100%;
	          min-width: 900px;
	          border-collapse: separate;
	          border-spacing: 0;
	        }
	        .labor-roster-table-heading {
	          padding: 0;
	          border-bottom: 1px solid #dce5ee;
	          background: #f8fafc;
	          text-align: left;
	          vertical-align: middle;
	        }
	        .labor-roster-header-button {
	          width: 100%;
	          min-height: 38px;
	          display: inline-flex;
	          align-items: center;
	          justify-content: space-between;
	          gap: 8px;
	          border: none;
	          background: transparent;
	          padding: 10px 14px;
	          color: ${C.textMut};
	          font-family: inherit;
	          font-size: 10px;
	          font-weight: 950;
	          text-transform: uppercase;
	          letter-spacing: 0;
	          cursor: pointer;
	        }
	        .labor-roster-header-button:hover,
	        .labor-roster-header-button.is-active {
	          color: ${C.pri};
	          background: rgba(20, 83, 45, 0.045);
	        }
	        .labor-roster-row {
	          border-bottom: 1px solid ${C.borderLight};
	          transition: background 150ms ease;
	        }
	        .labor-roster-row:hover,
	        .labor-roster-row:focus-within {
	          background: #f8fafc;
	        }
	        .labor-roster-row:last-child {
	          border-bottom: none;
	        }
	        .labor-roster-name-cell,
	        .labor-roster-secondary-cell {
	          padding: 11px 14px;
	          border-bottom: 1px solid ${C.borderLight};
	          vertical-align: middle;
	          line-height: 1.35;
	        }
	        .labor-roster-name-cell {
	          min-width: 180px;
	          color: ${C.text};
	        }
	        .labor-roster-name-cell strong {
	          display: block;
	          font-size: 13px;
	          font-weight: 950;
	        }
	        .labor-roster-name-cell small {
	          display: block;
	          margin-top: 3px;
	          color: ${C.textMut};
	          font-size: 10.5px;
	          font-weight: 800;
	          white-space: nowrap;
	        }
	        .labor-roster-secondary-cell {
	          min-width: 140px;
	          color: ${C.textSec};
	          font-size: 12px;
	          font-weight: 760;
	        }
	        .labor-roster-secondary-cell.is-commitment {
	          min-width: 118px;
	        }
	        .labor-roster-secondary-cell.is-nowrap {
	          white-space: nowrap;
	        }
	        .labor-roster-secondary-cell.is-email {
	          min-width: 240px;
	          max-width: 320px;
	          overflow: hidden;
	          text-overflow: ellipsis;
	          white-space: nowrap;
	        }
	        .labor-roster-secondary-cell.is-empty {
	          color: ${C.textMut};
	        }
	        .labor-roster-new-grid {
	          display: grid;
	          grid-template-columns: repeat(12, minmax(0, 1fr));
	          gap: 10px;
	          align-items: end;
	        }
	        .labor-roster-new-field {
	          display: grid;
	          gap: 6px;
	          min-width: 0;
	        }
	        .labor-roster-new-field-label {
	          font-size: 11px;
	          font-weight: 800;
	          color: ${C.textMut};
	          text-transform: uppercase;
	          letter-spacing: 0;
	        }
	        .labor-roster-new-field.is-first,
	        .labor-roster-new-field.is-last,
	        .labor-roster-new-field.is-phone {
	          grid-column: span 2;
	        }
	        .labor-roster-new-field.is-email,
	        .labor-roster-new-field.is-position {
	          grid-column: span 3;
	        }
	        .labor-roster-new-field.is-commitment {
	          grid-column: span 4;
	        }
	        .labor-roster-new-field.is-start {
	          grid-column: span 2;
	        }
	        .labor-roster-new-actions {
	          grid-column: span 6;
	          display: flex;
	          gap: 8px;
	          justify-content: flex-end;
	          flex-wrap: wrap;
	          min-width: 0;
	        }
	        .labor-commitment-picker {
	          display: grid;
	          grid-template-columns: repeat(3, minmax(0, 1fr));
	          gap: 4px;
	          min-height: 45px;
	          padding: 4px;
	          border-radius: 12px;
	          border: 1.5px solid ${C.border};
	          background: rgba(255,255,255,0.92);
	          box-sizing: border-box;
	        }
	        .labor-commitment-picker:focus-within {
	          border-color: ${C.acc};
	          box-shadow: 0 0 0 4px rgba(132,204,22,0.16);
	        }
	        .labor-commitment-picker-option {
	          position: relative;
	          min-width: 0;
	          min-height: 35px;
	          display: inline-flex;
	          align-items: center;
	          justify-content: center;
	          gap: 6px;
	          border: 1px solid transparent;
	          border-radius: 8px;
	          background: transparent;
	          color: ${C.textSec};
	          font-family: inherit;
	          font-size: 12px;
	          font-weight: 950;
	          line-height: 1;
	          white-space: nowrap;
	          cursor: pointer;
	          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
	        }
	        .labor-commitment-picker-option:hover {
	          background: #f8fafc;
	          color: ${C.text};
	          transform: translateY(-1px);
	        }
	        .labor-commitment-picker-option.is-active {
	          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
	        }
	        .labor-commitment-picker-option.is-active[data-tone="full_time"] {
	          border-color: #a7f3d0;
	          background: #ecfdf5;
	          color: #047857;
	        }
	        .labor-commitment-picker-option.is-active[data-tone="part_time"] {
	          border-color: #bfdbfe;
	          background: #eff6ff;
	          color: #1d4ed8;
	        }
	        .labor-commitment-picker-option.is-active[data-tone="unassigned"] {
	          border-color: #fed7aa;
	          background: #fff7ed;
	          color: #c2410c;
	        }
	        .labor-commitment-picker-dot {
	          width: 6px;
	          height: 6px;
	          border-radius: 999px;
	          background: currentColor;
	          opacity: 0.45;
	        }
	        .labor-commitment-picker-option.is-active .labor-commitment-picker-dot {
	          opacity: 1;
	          box-shadow: 0 0 0 3px rgba(255,255,255,0.82);
	        }
	        @media (max-width: 1180px) {
	          .labor-roster-new-field.is-first,
	          .labor-roster-new-field.is-last,
	          .labor-roster-new-field.is-phone,
	          .labor-roster-new-field.is-email {
	            grid-column: span 3;
	          }
	          .labor-roster-new-field.is-position {
	            grid-column: span 5;
	          }
	          .labor-roster-new-field.is-commitment {
	            grid-column: span 4;
	          }
	          .labor-roster-new-field.is-start {
	            grid-column: span 3;
	          }
	          .labor-roster-new-actions {
	            grid-column: span 12;
	          }
	        }
	        @media (max-width: 760px) {
	          .labor-roster-new-field.is-first,
	          .labor-roster-new-field.is-last,
	          .labor-roster-new-field.is-phone,
	          .labor-roster-new-field.is-email,
	          .labor-roster-new-field.is-position,
	          .labor-roster-new-field.is-commitment,
	          .labor-roster-new-field.is-start,
	          .labor-roster-new-actions {
	            grid-column: span 12;
	          }
	        }
        .labor-module-tabs {
          --labor-tab-count: 1;
          --labor-active-index: 0;
          position: relative;
          display: grid;
          grid-template-columns: repeat(var(--labor-tab-count), minmax(0, 1fr));
          align-items: center;
          min-height: 50px;
          margin-bottom: 22px;
          padding: 5px;
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 16px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92)),
            #fff;
          box-shadow: 0 16px 44px rgba(15, 23, 42, 0.055);
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          isolation: isolate;
        }
        .labor-module-tabs::-webkit-scrollbar { display: none; }
        .labor-tab-indicator {
          position: absolute;
          top: 5px;
          bottom: 5px;
          left: 5px;
          z-index: 0;
          width: calc((100% - 10px) / var(--labor-tab-count));
          border-radius: 12px;
          background: linear-gradient(135deg, #14532d 0%, #166534 56%, #3f6212 100%);
          box-shadow: 0 14px 34px rgba(20, 83, 45, 0.22), inset 0 1px 0 rgba(255,255,255,0.18);
          transform: translateX(calc(var(--labor-active-index) * 100%));
          transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease;
          overflow: hidden;
        }
        .labor-tab-indicator::after {
          content: "";
          position: absolute;
          inset: -30% auto -30% 0;
          width: 46%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
          animation: laborTabLightSweep 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .labor-tab-button {
          position: relative;
          z-index: 1;
          height: 40px;
          border: none;
          border-radius: 12px;
          background: transparent;
          color: ${C.textSec};
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 850;
          letter-spacing: 0;
          white-space: nowrap;
          transition: color 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background 220ms ease;
        }
        .labor-tab-button:hover {
          color: ${C.pri};
          background: rgba(20, 83, 45, 0.055);
        }
        .labor-tab-button.is-active {
          color: #fff;
          transform: translateY(-1px);
        }
        .labor-template-gear-button {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(20, 83, 45, 0.18);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          color: ${C.pri};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }
        .labor-template-gear-button svg {
          width: 18px;
          height: 18px;
          transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-template-gear-button:hover {
          transform: translateY(-1px);
          border-color: rgba(20, 83, 45, 0.36);
          background: #f0fdf4;
          box-shadow: 0 16px 32px rgba(20, 83, 45, 0.11);
        }
        .labor-template-gear-button:hover svg {
          transform: rotate(32deg);
        }
        @keyframes hourAnalysisCardIn {
          0% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.992); filter: blur(4px); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
        }
        @keyframes hourAnalysisWhatIfGlow {
          0%, 100% { box-shadow: inset 0 0 0 1px rgba(249, 115, 22, 0.18), 0 0 0 0 rgba(249, 115, 22, 0.16); }
          50% { box-shadow: inset 0 0 0 1px rgba(249, 115, 22, 0.36), 0 0 0 5px rgba(249, 115, 22, 0); }
        }
        @keyframes hourAnalysisChangePulse {
          0% { transform: translateY(0); background-color: rgba(236,253,245,0); }
          24% { transform: translateY(-1px); background-color: rgba(236,253,245,.96); }
          100% { transform: translateY(0); background-color: rgba(236,253,245,0); }
        }
        @keyframes hourAnalysisAuditIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .hour-analysis-shell {
          display: grid;
          gap: 16px;
        }
        .hour-analysis-summary-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
          gap: 16px;
          align-items: stretch;
        }
        .hour-analysis-card {
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 16px 42px rgba(15, 23, 42, 0.055);
          animation: hourAnalysisCardIn 320ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid ${C.borderLight};
          background: linear-gradient(180deg, rgba(248,250,252,0.92), rgba(255,255,255,0.98));
        }
        .hour-analysis-card-title {
          margin: 0;
          color: ${C.text};
          font-size: 15px;
          line-height: 1.15;
          font-weight: 950;
          letter-spacing: 0;
        }
        .hour-analysis-card-subtitle {
          margin-top: 4px;
          color: ${C.textMut};
          font-size: 12px;
          line-height: 1.35;
          font-weight: 650;
        }
        .hour-analysis-roster-summary {
          display: grid;
          grid-template-columns: minmax(220px, 1.18fr) repeat(3, minmax(150px, 0.72fr));
          gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid ${C.borderLight};
          background: linear-gradient(180deg, #ffffff, #fbfdff);
        }
        .hour-analysis-roster-summary-item {
          min-width: 0;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          padding: 11px 12px;
          background: #fff;
        }
        .hour-analysis-roster-summary-item.is-primary {
          border-color: rgba(20, 83, 45, 0.22);
          background: linear-gradient(135deg, rgba(236,253,245,0.86), #ffffff 70%);
        }
        .hour-analysis-summary-label {
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          line-height: 1.1;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .hour-analysis-summary-value {
          margin-top: 5px;
          color: ${C.text};
          font-size: 22px;
          font-weight: 950;
          line-height: 1;
        }
        .hour-analysis-roster-summary-item.is-primary .hour-analysis-summary-value {
          color: ${C.pri};
          font-size: 30px;
        }
        .hour-analysis-summary-note {
          margin-top: 5px;
          color: ${C.textMut};
          font-size: 10.5px;
          font-weight: 750;
          line-height: 1.25;
        }
        .hour-analysis-what-if-delta {
          margin-left: 5px;
          color: #c2410c;
          font-weight: 950;
        }
        .hour-analysis-headcount-stack {
          display: inline-grid;
          justify-items: center;
          gap: 2px;
          line-height: 1.1;
        }
        .hour-analysis-headcount-stack strong {
          color: ${C.text};
          font-size: 13px;
          font-weight: 950;
        }
        .hour-analysis-headcount-stack small {
          color: #c2410c;
          font-size: 9.5px;
          font-weight: 900;
          white-space: nowrap;
        }
        .hour-analysis-status-pill,
        .hour-analysis-what-if-tag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 999px;
          white-space: nowrap;
          line-height: 1;
          font-weight: 950;
          letter-spacing: 0;
        }
        .hour-analysis-status-pill {
          padding: 7px 10px;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
          font-size: 11px;
        }
        .hour-analysis-what-if-tag {
          padding: 4px 7px;
          background: #fff7ed;
          border: 1px dashed rgba(249, 115, 22, 0.55);
          color: #c2410c;
          font-size: 9.5px;
        }
        .hour-analysis-number-input {
          width: 78px;
          min-width: 0;
          border: 1.5px solid ${C.border};
          border-radius: 8px;
          background: #ffffff;
          color: ${C.text};
          font-family: inherit;
          font-size: 13px;
          font-weight: 900;
          padding: 7px 8px;
          outline: none;
          text-align: center;
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .hour-analysis-number-input:focus {
          border-color: ${C.pri};
          box-shadow: 0 0 0 4px rgba(20, 83, 45, 0.1);
        }
        .hour-analysis-number-input:disabled {
          background: #f8fafc;
          color: ${C.textMut};
          cursor: not-allowed;
        }
        .hour-analysis-number-input::-webkit-outer-spin-button,
        .hour-analysis-number-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .hour-analysis-capacity-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          padding: 16px;
          border-bottom: 1px solid ${C.borderLight};
        }
        .hour-analysis-decision-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(300px, 1.08fr);
          gap: 12px;
          padding: 16px 16px 0;
          align-items: stretch;
        }
        .hour-analysis-decision-card,
        .hour-analysis-hire-card {
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: #fff;
          padding: 14px 15px;
          min-width: 0;
        }
        .hour-analysis-decision-card {
          border-color: rgba(20, 83, 45, 0.2);
          background: linear-gradient(135deg, rgba(240,253,244,0.9), #ffffff 58%);
        }
        .hour-analysis-decision-card.is-recent-change,
        .hour-analysis-hire-card.is-recent-change,
        .hour-analysis-person-row.is-recent-change {
          animation: hourAnalysisChangePulse 760ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-decision-label {
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .hour-analysis-decision-value {
          margin-top: 7px;
          color: ${C.pri};
          font-size: 30px;
          font-weight: 950;
          line-height: 1;
        }
        .hour-analysis-decision-copy {
          margin-top: 8px;
          color: ${C.text};
          font-size: 12px;
          font-weight: 780;
          line-height: 1.4;
        }
        .hour-analysis-progress-track {
          height: 9px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
          margin-top: 12px;
        }
        .hour-analysis-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, ${C.pri}, #16a34a);
          transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes hourAnalysisCapacityRowIn {
          from { opacity: 0; transform: translate3d(0, 10px, 0); filter: blur(4px); }
          to { opacity: 1; transform: translate3d(0, 0, 0); filter: blur(0); }
        }
        @keyframes hourAnalysisCapacityShimmer {
          from { transform: translateX(-135%); }
          to { transform: translateX(135%); }
        }
        @keyframes hourAnalysisCapacityFillGlimmer {
          from { left: -58px; }
          to { left: 100%; }
        }
        .hour-analysis-capacity-dashboard {
          display: grid;
          grid-template-columns: minmax(150px, 0.18fr) minmax(0, 1fr);
          gap: 10px;
          padding: 10px 16px 6px;
          align-items: center;
        }
        .hour-analysis-capacity-total {
          position: relative;
          overflow: hidden;
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(20, 83, 45, 0.2);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(240,253,244,0.94), #ffffff 64%);
          padding: 10px 12px;
          min-height: 44px;
          min-width: 0;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.88), 0 16px 30px rgba(15, 23, 42, 0.04);
        }
        .hour-analysis-capacity-total::after,
        .hour-analysis-capacity-row::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.52) 44%, transparent 76%);
          opacity: 0.42;
          transform: translateX(-135%);
          animation: hourAnalysisCapacityShimmer 3.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .hour-analysis-capacity-total.is-short {
          border-color: rgba(185, 28, 28, 0.24);
          background: linear-gradient(135deg, rgba(254,242,242,0.96), #ffffff 66%);
        }
        .hour-analysis-capacity-total.is-surplus {
          border-color: rgba(20, 83, 45, 0.24);
        }
        .hour-analysis-capacity-total.is-healthy {
          border-color: rgba(20, 83, 45, 0.28);
          background: linear-gradient(135deg, rgba(236,253,245,0.96), #ffffff 66%);
        }
        .hour-analysis-capacity-total strong {
          display: block;
          color: ${C.text};
          font-size: 25px;
          font-weight: 950;
          line-height: 1;
        }
        .hour-analysis-capacity-total.is-short strong {
          color: #b91c1c;
        }
        .hour-analysis-capacity-total.is-surplus strong {
          color: #047857;
        }
        .hour-analysis-capacity-total.is-healthy strong {
          color: #047857;
        }
        .hour-analysis-capacity-buffer-note {
          align-self: center;
          justify-self: end;
          max-width: 220px;
          border: 1px solid rgba(20, 83, 45, 0.12);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(240,253,244,0.78), #ffffff 72%);
          color: ${C.textSec};
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.86);
        }
        .hour-analysis-capacity-visual {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
          padding: 0 16px 11px;
          align-items: start;
        }
        .hour-analysis-capacity-column {
          display: grid;
          gap: 7px;
          min-width: 0;
        }
        .hour-analysis-capacity-visual.is-recent-change {
          animation: hourAnalysisChangePulse 760ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-capacity-row {
          position: relative;
          overflow: visible;
          display: grid;
          gap: 5px;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: linear-gradient(135deg, #ffffff 0%, #fbfdff 100%);
          padding: 7px 8px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(15, 23, 42, 0.035);
          cursor: default;
          animation: hourAnalysisCapacityRowIn 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: var(--capacity-row-delay, 0ms);
          transition:
            transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
            background 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-capacity-row:hover {
          transform: translateY(-2px) scale(1.006);
          border-color: rgba(20, 83, 45, 0.5);
          outline: 2px solid rgba(20, 83, 45, 0.22);
          outline-offset: 2px;
          background: linear-gradient(135deg, #ffffff 0%, rgba(240,253,244,0.9) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.94), 0 18px 34px rgba(15, 23, 42, 0.13);
        }
        .hour-analysis-capacity-row.is-short:hover {
          border-color: rgba(185, 28, 28, 0.46);
          outline-color: rgba(185, 28, 28, 0.2);
          background: linear-gradient(135deg, #ffffff 0%, rgba(254,242,242,0.95) 100%);
        }
        .hour-analysis-capacity-row:hover::after {
          opacity: 0.68;
          animation-duration: 1.4s;
        }
        .hour-analysis-capacity-row:hover .hour-analysis-capacity-role strong {
          color: ${C.pri};
        }
        .hour-analysis-capacity-row.is-short:hover .hour-analysis-capacity-role strong {
          color: #991b1b;
        }
        .hour-analysis-capacity-row.is-short {
          border-color: rgba(185, 28, 28, 0.2);
          background: linear-gradient(135deg, #ffffff 0%, rgba(254,242,242,0.76) 100%);
        }
        .hour-analysis-capacity-row.is-surplus {
          border-color: rgba(20, 83, 45, 0.2);
          background: linear-gradient(135deg, #ffffff 0%, rgba(240,253,244,0.82) 100%);
        }
        .hour-analysis-capacity-row.is-healthy {
          border-color: rgba(20, 83, 45, 0.2);
          background: linear-gradient(135deg, #ffffff 0%, rgba(240,253,244,0.82) 100%);
        }
        .hour-analysis-capacity-row-header {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .hour-analysis-capacity-role {
          display: flex;
          align-items: baseline;
          gap: 8px;
          min-width: 0;
        }
        .hour-analysis-capacity-role strong {
          color: ${C.text};
          font-size: 15px;
          font-weight: 950;
          line-height: 1;
        }
        .hour-analysis-capacity-bar {
          position: relative;
          z-index: 2;
          height: 44px;
          border: 1px solid #d8e4d4;
          border-radius: 7px;
          background:
            linear-gradient(90deg, rgba(15, 23, 42, 0.045) 1px, transparent 1px) 0 0 / 20% 100%,
            linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          overflow: visible;
          box-shadow: inset 0 1px 2px rgba(15,23,42,0.04);
          transition: border-color 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-capacity-row:hover .hour-analysis-capacity-bar {
          border-color: rgba(20,83,45,0.34);
          box-shadow: inset 0 1px 2px rgba(15,23,42,0.05), 0 9px 24px rgba(20,83,45,0.12);
        }
        .hour-analysis-capacity-row.is-short:hover .hour-analysis-capacity-bar {
          border-color: rgba(185,28,28,0.34);
          box-shadow: inset 0 1px 2px rgba(15,23,42,0.05), 0 9px 24px rgba(185,28,28,0.1);
        }
        .hour-analysis-capacity-buffer {
          position: absolute;
          top: 0;
          bottom: 0;
          background:
            repeating-linear-gradient(135deg, rgba(132,204,22,0.16) 0 7px, rgba(132,204,22,0.28) 7px 14px);
          border-left: 1px solid rgba(20, 83, 45, 0.18);
          border-right: 1px solid rgba(20, 83, 45, 0.16);
        }
        .hour-analysis-capacity-fill {
          position: absolute;
          left: 0;
          top: 20px;
          height: 12px;
          border-radius: 0 999px 999px 0;
          background: linear-gradient(90deg, #14532d, #22c55e);
          box-shadow: 0 0 0 1px rgba(20,83,45,0.08), 0 8px 18px rgba(20,83,45,0.12);
          overflow: hidden;
          transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-capacity-fill::after {
          content: "";
          position: absolute;
          top: -8px;
          bottom: -8px;
          left: -58px;
          width: 42px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.72), transparent);
          transform: skewX(-18deg);
          animation: hourAnalysisCapacityFillGlimmer 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .hour-analysis-capacity-row:hover .hour-analysis-capacity-fill::after {
          animation-duration: 1.25s;
        }
        .hour-analysis-capacity-row:hover .hour-analysis-capacity-fill {
          filter: saturate(1.12);
        }
        .hour-analysis-capacity-row.is-short .hour-analysis-capacity-fill {
          background: linear-gradient(90deg, #991b1b, #ef4444);
          box-shadow: 0 0 0 1px rgba(185,28,28,0.09), 0 8px 18px rgba(185,28,28,0.13);
        }
        .hour-analysis-capacity-row.is-healthy .hour-analysis-capacity-fill {
          background: linear-gradient(90deg, #0f766e, #14b8a6);
        }
        .hour-analysis-capacity-hover-zone {
          position: absolute;
          z-index: 7;
          background: transparent;
          cursor: crosshair;
        }
        .hour-analysis-capacity-hover-zone.is-expected {
          left: 0;
          top: 12px;
          height: 28px;
          min-width: 24px;
        }
        .hour-analysis-capacity-hover-zone.is-marker {
          top: 0;
          bottom: 0;
          width: 20px;
          transform: translateX(-50%);
          z-index: 8;
        }
        .hour-analysis-capacity-hover-zone.is-marker:hover {
          background: linear-gradient(90deg, transparent, rgba(15,23,42,0.055), transparent);
        }
        .hour-analysis-capacity-hover-zone.is-target:hover {
          background: linear-gradient(90deg, transparent, rgba(132,204,22,0.16), transparent);
        }
        .hour-analysis-capacity-cursor-tooltip,
        .hour-analysis-capacity-delta-float {
          position: absolute;
          z-index: 12;
          border-radius: 999px;
          padding: 4px 6px;
          font-size: 10px;
          font-weight: 950;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 8px 18px rgba(15,23,42,0.08);
          transition:
            transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
            background 180ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-capacity-cursor-tooltip {
          max-width: min(220px, calc(100% - 16px));
          pointer-events: none;
          transform: translate(-50%, calc(-100% - 10px));
          background: rgba(15,23,42,0.94);
          color: #ffffff;
          box-shadow: 0 14px 28px rgba(15,23,42,0.22);
        }
        .hour-analysis-capacity-cursor-tooltip.is-short {
          background: rgba(153, 27, 27, 0.95);
        }
        .hour-analysis-capacity-cursor-tooltip.is-surplus,
        .hour-analysis-capacity-cursor-tooltip.is-healthy {
          background: rgba(20, 83, 45, 0.95);
        }
        .hour-analysis-capacity-cursor-tooltip.is-floor {
          background: rgba(15, 23, 42, 0.95);
        }
        .hour-analysis-capacity-cursor-tooltip.is-target {
          background: rgba(63, 98, 18, 0.95);
        }
        .hour-analysis-capacity-cursor-tooltip span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hour-analysis-capacity-cursor-tooltip small {
          display: block;
          margin-top: 2px;
          color: rgba(255,255,255,0.76);
          font-size: 9px;
          font-weight: 820;
          line-height: 1;
        }
        .hour-analysis-capacity-marker {
          position: absolute;
          top: -1px;
          bottom: -1px;
          z-index: 4;
          width: 2px;
          background: ${C.text};
          transform: translateX(-1px);
          transition: left 420ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-capacity-marker.is-target {
          background: rgba(20, 83, 45, 0.46);
        }
        .hour-analysis-capacity-delta-float {
          right: 7px;
          top: 6px;
          background: rgba(248,250,252,0.94);
          color: ${C.text};
        }
        .hour-analysis-capacity-delta-float.is-short {
          background: rgba(254,242,242,0.95);
          color: #b91c1c;
        }
        .hour-analysis-capacity-delta-float.is-surplus {
          background: rgba(236,253,245,0.95);
          color: #047857;
        }
        .hour-analysis-capacity-delta-float.is-healthy {
          background: rgba(236,253,245,0.95);
          color: #047857;
        }
        .hour-analysis-capacity-row:hover .hour-analysis-capacity-delta-float {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(15,23,42,0.12);
        }
        .hour-analysis-hire-list {
          display: grid;
          gap: 8px;
          margin-top: 10px;
        }
        .hour-analysis-hire-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          padding: 9px 10px;
          background: #fbfdff;
        }
        .hour-analysis-hire-row strong {
          display: block;
          color: ${C.text};
          font-size: 12px;
          font-weight: 950;
          line-height: 1.2;
        }
        .hour-analysis-hire-row span {
          display: block;
          margin-top: 3px;
          color: ${C.textMut};
          font-size: 10.5px;
          font-weight: 760;
          line-height: 1.25;
        }
        .hour-analysis-hire-count {
          color: ${C.pri};
          font-size: 14px;
          font-weight: 950;
          white-space: nowrap;
        }
        .hour-analysis-hire-footnote {
          margin-top: 10px;
          border-top: 1px solid ${C.borderLight};
          padding-top: 9px;
          color: ${C.textSec};
          font-size: 11px;
          font-weight: 760;
          line-height: 1.4;
        }
        .hour-analysis-flex-note {
          margin: 12px 16px 0;
          border: 1px dashed rgba(15, 23, 42, 0.15);
          border-radius: 8px;
          background: #f8fafc;
          color: ${C.textSec};
          padding: 10px 12px;
          font-size: 11.5px;
          font-weight: 720;
          line-height: 1.4;
        }
        .hour-analysis-capacity-standard {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(220px, 0.34fr);
          gap: 14px;
          padding: 15px 16px 0;
          align-items: stretch;
        }
        .hour-analysis-standard-copy {
          border: 1px solid rgba(20, 83, 45, 0.14);
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(240,253,244,0.8), #ffffff 58%);
          padding: 12px 13px;
        }
        .hour-analysis-standard-eyebrow {
          color: ${C.pri};
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .hour-analysis-standard-copy p {
          margin: 7px 0 0;
          color: ${C.text};
          font-size: 12px;
          font-weight: 720;
          line-height: 1.45;
        }
        .hour-analysis-standard-copy strong {
          font-weight: 950;
        }
        .hour-analysis-standard-sources {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 9px;
        }
        .hour-analysis-standard-sources a {
          display: inline-flex;
          align-items: center;
          border: 1px solid #dbeafe;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          padding: 4px 7px;
          font-size: 10px;
          font-weight: 900;
          text-decoration: none;
          transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
        }
        .hour-analysis-standard-sources a:hover {
          border-color: #93c5fd;
          background: #dbeafe;
          transform: translateY(-1px);
        }
        .hour-analysis-standard-math {
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: #fff;
          padding: 12px 13px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }
        .hour-analysis-standard-math span {
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 900;
          line-height: 1.25;
          text-transform: uppercase;
        }
        .hour-analysis-standard-math strong {
          margin-top: 5px;
          color: ${C.pri};
          font-size: 25px;
          font-weight: 950;
          line-height: 1;
        }
        .hour-analysis-standard-math em {
          margin-top: 6px;
          color: ${C.text};
          font-size: 12px;
          font-style: normal;
          font-weight: 850;
          line-height: 1.25;
        }
        .hour-analysis-capacity-card {
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          padding: 11px 12px;
          background: #fff;
          transition: transform 170ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 170ms ease, border-color 170ms ease;
        }
        .hour-analysis-capacity-card:hover {
          transform: translateY(-1px);
          border-color: rgba(20, 83, 45, 0.24);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
        }
        .hour-analysis-capacity-label {
          font-size: 10px;
          font-weight: 950;
          color: ${C.textMut};
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .hour-analysis-capacity-value {
          margin-top: 6px;
          font-size: 24px;
          line-height: 1;
          font-weight: 950;
          color: ${C.text};
        }
        .hour-analysis-picker-trigger {
          width: 100%;
          min-height: 42px;
          border: 1.5px solid ${C.border};
          border-radius: 12px;
          background: #fff;
          color: ${C.text};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 850;
          text-align: left;
          transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-picker-trigger:hover,
        .hour-analysis-picker-trigger:focus {
          border-color: rgba(20, 83, 45, 0.42);
          box-shadow: 0 0 0 4px rgba(20, 83, 45, 0.08);
          outline: none;
        }
        .hour-analysis-picker-panel {
          margin-top: 8px;
          border-radius: 12px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
          overflow: hidden;
          animation: filterSlideIn 0.25s ease-out;
        }
        .hour-analysis-picker-heading {
          padding: 8px 14px;
          border-bottom: 1px solid ${C.borderLight};
          background: ${C.surface};
          color: ${C.text};
          font-size: 11px;
          font-weight: 800;
        }
        .hour-analysis-picker-options {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          padding: 12px 14px;
          max-height: 260px;
          overflow: auto;
        }
        .hour-analysis-picker-option {
          padding: 6px 14px;
          border-radius: 8px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.text};
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s cubic-bezier(0.2,0.8,0.2,1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .hour-analysis-picker-option.is-active,
        .hour-analysis-picker-option:hover {
          border-color: ${C.pri};
          background: ${C.pri};
          color: #fff;
          transform: translateY(-1px);
        }
        .labor-sort-control {
          position: relative;
          display: inline-flex;
        }
        .labor-sort-trigger {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          border-radius: 10px;
          border: 1.5px solid ${C.border};
          background: #fff;
          color: ${C.text};
          font-family: inherit;
          font-size: 12px;
          font-weight: 850;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background 160ms ease;
        }
        .labor-sort-trigger:hover,
        .labor-sort-trigger.is-open,
        .labor-sort-trigger.is-active {
          border-color: ${C.pri};
          background: ${C.priLt};
          box-shadow: 0 8px 22px rgba(20, 83, 45, 0.11);
          transform: translateY(-1px);
        }
        .labor-sort-panel {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: min(520px, 88vw);
          z-index: 70;
          border-radius: 14px;
          border: 1px solid ${C.border};
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16);
          overflow: hidden;
          animation: filterSlideIn 0.25s ease-out;
        }
        .labor-sort-panel-body {
          display: grid;
          gap: 10px;
          padding: 12px 14px 14px;
        }
        .labor-sort-option-grid {
          display: grid;
          gap: 8px;
        }
        .labor-sort-option-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 8px;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid ${C.borderLight};
        }
        .labor-sort-option-row > span {
          min-width: 0;
          color: ${C.text};
          font-size: 12px;
          font-weight: 900;
        }
        .labor-sort-option-row > div {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .labor-sort-direction {
          padding: 6px 10px;
          border-radius: 8px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textSec};
          font-family: inherit;
          font-size: 11px;
          font-weight: 850;
          cursor: pointer;
          transition: all 160ms ease;
        }
        .labor-sort-direction:hover,
        .labor-sort-direction.is-active {
          border-color: ${C.pri};
          background: ${C.pri};
          color: #fff;
          transform: translateY(-1px);
        }
        .labor-position-settings-list {
          display: grid;
          gap: 10px;
          max-height: 48vh;
          overflow-y: auto;
          padding-right: 4px;
        }
        .labor-position-settings-row {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid ${C.border};
          background: #fff;
          transition: border-color 160ms ease, background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
          animation: filterSlideIn 0.22s ease-out both;
        }
        .labor-position-settings-row.is-dragging {
          border-color: ${C.pri};
          background: ${C.priLt};
          box-shadow: 0 14px 34px rgba(20, 83, 45, 0.13);
          transform: scale(1.004);
        }
        .labor-position-row-index {
          min-width: 24px;
          height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 950;
        }
        .labor-model-role-color-settings {
          display: grid;
          gap: 10px;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid ${C.border};
          background: linear-gradient(135deg, rgba(248,250,252,0.92), rgba(255,255,255,0.98));
          animation: filterSlideIn 0.24s ease-out both;
        }
        .labor-model-role-color-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .labor-model-role-color-header strong,
        .labor-model-role-color-header span {
          display: block;
        }
        .labor-model-role-color-header strong {
          color: ${C.text};
          font-size: 13px;
          font-weight: 950;
        }
        .labor-model-role-color-header span {
          margin-top: 2px;
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 750;
        }
        .labor-model-role-color-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .labor-model-role-color-row {
          display: grid;
          grid-template-columns: minmax(42px, 0.7fr) minmax(76px, 1fr) auto;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--labor-model-cell-strong, ${C.pri}) 18%, ${C.borderLight});
          background: color-mix(in srgb, var(--labor-model-cell-soft, #f8fafc) 54%, #ffffff);
        }
        .labor-model-role-color-sample {
          height: 28px;
          min-width: 0;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 8px;
          color: #fff;
          background: linear-gradient(135deg, var(--labor-model-cell-strong, ${C.pri}), var(--labor-model-cell-accent, ${C.pri2}));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
          overflow: hidden;
        }
        .labor-model-role-color-sample span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 10px;
          font-weight: 950;
        }
        .labor-model-role-color-control {
          min-width: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 32px;
          align-items: center;
          gap: 6px;
          color: var(--labor-model-cell-text, ${C.text});
          font-size: 11px;
          font-weight: 900;
        }
        .labor-model-role-color-control > span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .labor-model-role-color-control input {
          width: 32px;
          height: 26px;
          padding: 0;
          border: 1px solid ${C.border};
          border-radius: 6px;
          background: #fff;
          cursor: pointer;
        }
        .labor-model-role-color-reset {
          width: 28px;
          height: 28px;
          border: 1px solid ${C.borderLight};
          border-radius: 7px;
          background: rgba(255,255,255,0.84);
          color: ${C.textMut};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 150ms ease;
        }
        .labor-model-role-color-reset svg {
          width: 14px;
          height: 14px;
        }
        .labor-model-role-color-reset:hover:not(:disabled) {
          border-color: var(--labor-model-cell-strong, ${C.pri});
          color: var(--labor-model-cell-strong, ${C.pri});
          transform: translateY(-1px);
        }
        .labor-model-role-color-reset:disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }
        .labor-position-add-row {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) auto auto;
          gap: 8px;
          align-items: center;
          padding: 10px;
          border-radius: 14px;
          border: 1.5px dashed rgba(20, 83, 45, 0.28);
          background: linear-gradient(135deg, rgba(240,253,244,0.92), rgba(255,255,255,0.98));
          animation: filterSlideIn 0.25s ease-out;
        }
        .labor-position-add-row input {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1.5px solid ${C.border};
          background: #fff;
          color: ${C.text};
          font-family: inherit;
          font-size: 13px;
          font-weight: 750;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .labor-position-add-row input:focus {
          border-color: ${C.pri};
          box-shadow: 0 0 0 4px rgba(20,83,45,0.10);
        }
        .labor-position-icon-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textSec};
          cursor: pointer;
          transition: all 160ms ease;
        }
        .labor-position-icon-button:hover {
          border-color: ${C.pri};
          color: ${C.pri};
          transform: translateY(-1px);
        }
        .labor-position-icon-button.is-primary {
          border-color: ${C.pri};
          background: ${C.pri};
          color: #fff;
          box-shadow: 0 10px 24px rgba(20,83,45,0.18);
        }
        .labor-position-icon-button.is-primary:disabled {
          border-color: ${C.borderLight};
          background: #f8fafc;
          color: ${C.textMut};
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }
        .labor-position-icon-button.is-danger:hover {
          border-color: #fecaca;
          background: #fef2f2;
          color: #b91c1c;
        }
        .hour-analysis-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          min-width: 640px;
        }
        .hour-analysis-planning-table {
          table-layout: fixed;
          min-width: 980px;
        }
        .hour-analysis-planning-table .hour-analysis-col-position {
          width: 22%;
        }
        .hour-analysis-planning-table .hour-analysis-col-total {
          width: 14%;
        }
        .hour-analysis-planning-table .hour-analysis-col-count {
          width: 14%;
        }
        .hour-analysis-planning-table .hour-analysis-col-hours {
          width: 16.5%;
        }
        .hour-analysis-table th {
          padding: 8px 10px;
          border-bottom: 1px solid ${C.border};
          background: #f8fafc;
          color: ${C.textMut};
          font-size: 10.5px;
          font-weight: 950;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .hour-analysis-planning-table th {
          white-space: normal;
          line-height: 1.15;
        }
        .hour-analysis-planning-table th.hour-analysis-group-heading {
          background: #eef6ee;
          color: ${C.text};
          font-size: 11.5px;
          text-align: center;
          border-left: 1px solid ${C.borderLight};
        }
        .hour-analysis-planning-table th.hour-analysis-group-heading:last-of-type {
          background: #fff7ed;
        }
        .hour-analysis-planning-table th.hour-analysis-sticky-heading {
          vertical-align: middle;
        }
        .hour-analysis-planning-table th.hour-analysis-sub-heading {
          background: #f8fafc;
          color: ${C.textMut};
          font-size: 10.5px;
          text-align: center;
        }
        .hour-analysis-planning-table .hour-analysis-count-cell,
        .hour-analysis-planning-table .hour-analysis-hours-cell {
          text-align: center;
          font-weight: 950;
        }
        .hour-analysis-planning-table .hour-analysis-hours-cell .hour-analysis-number-input {
          display: block;
          margin: 0 auto;
        }
        .hour-analysis-table td {
          padding: 9px 10px;
          border-bottom: 1px solid ${C.borderLight};
          color: ${C.text};
          font-size: 12.5px;
          font-weight: 700;
          vertical-align: middle;
        }
        .hour-analysis-planning-table tbody td:nth-child(3),
        .hour-analysis-planning-table tbody td:nth-child(4) {
          background: rgba(240,253,244,0.46);
        }
        .hour-analysis-planning-table tbody td:nth-child(5),
        .hour-analysis-planning-table tbody td:nth-child(6) {
          background: rgba(255,247,237,0.48);
        }
        .hour-analysis-table tbody tr:last-child td {
          border-bottom: none;
        }
        .hour-analysis-person-row {
          transition: background 160ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-person-row:hover {
          background: #f8fafc;
        }
        .hour-analysis-person-row.is-what-if {
          outline: 1.5px dashed rgba(249, 115, 22, 0.72);
          outline-offset: -5px;
          background: linear-gradient(90deg, rgba(255,247,237,0.96), rgba(255,255,255,0.98));
          animation: hourAnalysisWhatIfGlow 1.2s ease-out 1;
        }
        .hour-analysis-person-row.is-movement {
          outline-color: rgba(37, 99, 235, 0.62);
          background: linear-gradient(90deg, rgba(239,246,255,0.94), rgba(255,255,255,0.98));
        }
        .hour-analysis-move-tag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px dashed rgba(37, 99, 235, 0.44);
          color: #1d4ed8;
          background: #eff6ff;
          font-size: 9.5px;
          font-weight: 950;
          line-height: 1;
        }
        .hour-analysis-preferred-cell {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .hour-analysis-inherited-hours {
          color: ${C.text};
          font-weight: 950;
          white-space: nowrap;
        }
        .hour-analysis-inherited-hours.is-overridden {
          color: ${C.textMut};
          text-decoration: line-through;
          text-decoration-thickness: 2px;
        }
        .hour-analysis-arrow {
          color: #d97706;
          font-weight: 950;
        }
        .hour-analysis-position-move {
          position: relative;
          min-width: 220px;
          max-width: 360px;
        }
        .hour-analysis-position-trigger {
          width: 100%;
          min-height: 38px;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          color: ${C.textSec};
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
          text-align: left;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
          transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hour-analysis-position-trigger:hover,
        .hour-analysis-position-trigger:focus {
          border-color: rgba(20, 83, 45, 0.36);
          box-shadow: 0 0 0 4px rgba(20, 83, 45, 0.07), 0 12px 26px rgba(15, 23, 42, 0.06);
          outline: none;
          transform: translateY(-1px);
        }
        .hour-analysis-position-trigger.is-moved {
          border-color: rgba(249, 115, 22, 0.34);
          background: linear-gradient(135deg, #fff7ed, #ffffff);
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
        }
        .hour-analysis-position-trigger:disabled {
          cursor: default;
          color: ${C.textMut};
          background: #f8fafc;
          box-shadow: none;
          transform: none;
        }
        .hour-analysis-position-display {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex-wrap: wrap;
          line-height: 1.2;
        }
        .hour-analysis-position-display.is-static {
          font-weight: 950;
        }
        .hour-analysis-position-display span {
          min-width: 0;
        }
        .hour-analysis-position-original {
          color: ${C.textMut};
          text-decoration: line-through;
          text-decoration-thickness: 2px;
        }
        .hour-analysis-position-panel {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 40;
          width: min(360px, 82vw);
          border-radius: 12px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          box-shadow: 0 18px 44px rgba(15, 23, 42, 0.14);
          overflow: hidden;
          animation: filterSlideIn 0.25s ease-out;
        }
        .hour-analysis-picker-option.is-reset {
          border-style: dashed;
          background: #f8fafc;
          color: ${C.textSec};
        }
        .hour-analysis-picker-option.is-reset:hover,
        .hour-analysis-picker-option.is-reset.is-active {
          border-color: rgba(20, 83, 45, 0.34);
          background: #f0fdf4;
          color: ${C.pri};
        }
        .hour-analysis-mini-button {
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #fff;
          color: ${C.textSec};
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          font-weight: 850;
          padding: 7px 9px;
          transition: border-color 160ms ease, color 160ms ease, background 160ms ease, transform 160ms ease;
        }
        .hour-analysis-mini-button:hover {
          border-color: rgba(20, 83, 45, 0.3);
          color: ${C.pri};
          background: #f0fdf4;
          transform: translateY(-1px);
        }
        .hour-analysis-danger-button:hover {
          border-color: rgba(220, 38, 38, 0.32);
          color: #b91c1c;
          background: #fef2f2;
        }
        .hour-analysis-split-cell {
          display: grid;
          grid-template-columns: minmax(135px, 1fr) minmax(92px, .55fr);
          gap: 7px;
          align-items: end;
          min-width: 245px;
        }
        .hour-analysis-split-note {
          margin-top: 5px;
          color: ${C.textMut};
          font-size: 10.5px;
          font-weight: 780;
          line-height: 1.25;
        }
        .hour-analysis-split-compact {
          position: relative;
          min-width: 185px;
        }
        .hour-analysis-split-static,
        .hour-analysis-split-trigger {
          width: 100%;
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border-radius: 8px;
          border: 1px solid ${C.borderLight};
          background: #fff;
          color: ${C.textSec};
          font-family: inherit;
          font-size: 11px;
          font-weight: 880;
          padding: 7px 9px;
          line-height: 1.2;
        }
        .hour-analysis-split-static {
          color: ${C.textMut};
          justify-content: center;
          background: #f8fafc;
        }
        .hour-analysis-split-trigger {
          cursor: pointer;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease, transform 160ms ease;
        }
        .hour-analysis-split-trigger:hover,
        .hour-analysis-split-trigger:focus {
          border-color: rgba(20, 83, 45, 0.36);
          box-shadow: 0 0 0 4px rgba(20, 83, 45, 0.07);
          outline: none;
          transform: translateY(-1px);
        }
        .hour-analysis-split-trigger.is-active {
          color: #1d4ed8;
          border-color: rgba(37, 99, 235, 0.24);
          background: #eff6ff;
        }
        .hour-analysis-split-trigger:disabled {
          cursor: default;
          color: ${C.textMut};
          background: #f8fafc;
          transform: none;
          box-shadow: none;
        }
        .hour-analysis-split-panel {
          margin-top: 8px;
          border-radius: 12px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          box-shadow: 0 12px 30px rgba(15,23,42,0.09);
          overflow: hidden;
          animation: filterSlideIn 0.25s ease-out;
        }
        .hour-analysis-split-editor {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          border-top: 1px solid ${C.borderLight};
          padding: 10px 12px;
          background: #f8fafc;
        }
        .hour-analysis-split-editor span,
        .hour-analysis-movement-preview span {
          display: block;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .hour-analysis-split-editor small {
          display: block;
          margin-top: 2px;
          color: ${C.textMut};
          font-size: 10.5px;
          font-weight: 720;
        }
        .hour-analysis-movement-preview {
          border: 1px dashed rgba(37, 99, 235, 0.28);
          border-radius: 8px;
          background: linear-gradient(135deg, #eff6ff, #ffffff);
          padding: 10px 11px;
        }
        .hour-analysis-movement-preview strong {
          display: block;
          margin-top: 4px;
          color: ${C.text};
          font-size: 13px;
          font-weight: 950;
        }
        .hour-analysis-movement-preview em {
          display: block;
          margin-top: 3px;
          color: ${C.textSec};
          font-size: 11.5px;
          font-style: normal;
          font-weight: 780;
        }
        .hour-analysis-note-input {
          width: 100%;
          min-width: 210px;
          resize: vertical;
          border: 1px solid #dbe5ef;
          border-radius: 8px;
          padding: 8px 9px;
          color: ${C.text};
          background: #fff;
          font-size: 12px;
          font-weight: 720;
          line-height: 1.35;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .hour-analysis-note-input:focus {
          border-color: #60a5fa;
          box-shadow: 0 0 0 3px rgba(96,165,250,.18);
        }
        .hour-analysis-audit-list {
          display: grid;
          gap: 8px;
          max-height: 520px;
          overflow: auto;
          padding-right: 2px;
        }
        .hour-analysis-audit-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: start;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          padding: 10px 11px;
          background: #fff;
          animation: hourAnalysisAuditIn 220ms ease-out both;
        }
        .hour-analysis-audit-row strong {
          display: block;
          color: ${C.text};
          font-size: 12px;
          font-weight: 950;
        }
        .hour-analysis-audit-row span,
        .hour-analysis-audit-row small {
          display: block;
          margin-top: 4px;
          color: ${C.textMut};
          font-size: 10.5px;
          font-weight: 760;
          line-height: 1.35;
        }
        .capacity-planning-page {
          display: grid;
          gap: 16px;
        }
        @keyframes laborModelGridIn {
          0% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.996); filter: blur(3px); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
        }
        @keyframes laborModelInsertPulse {
          0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.28); }
          70% { box-shadow: 0 0 0 8px rgba(249, 115, 22, 0); }
          100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
        }
        .labor-model-shell {
          display: grid;
          gap: 14px;
          min-height: min(74vh, 820px);
        }
	        .labor-model-tabs {
          --labor-model-tab-count: 8;
          --labor-model-active-index: 0;
          position: relative;
          display: grid;
          grid-template-columns: repeat(var(--labor-model-tab-count), minmax(0, 1fr));
          align-items: center;
          gap: 0;
	          min-height: 58px;
	          max-height: 58px;
          padding: 5px;
          border: 1px solid ${C.border};
          border-radius: 16px;
          background: linear-gradient(180deg, #fff, #f8fafc);
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
          overflow-x: auto;
          scrollbar-width: none;
          isolation: isolate;
        }
        .labor-model-tabs::-webkit-scrollbar { display: none; }
	        .labor-model-tab-indicator {
          position: absolute;
          z-index: 0;
          top: 5px;
          bottom: 5px;
          left: 5px;
          width: calc((100% - 10px) / var(--labor-model-tab-count));
	          border-radius: 11px;
          background: linear-gradient(135deg, #14532d, #166534 58%, #3f6212);
          box-shadow: 0 14px 32px rgba(20, 83, 45, 0.18), inset 0 1px 0 rgba(255,255,255,0.22);
          transform: translateX(calc(var(--labor-model-active-index) * 100%));
          transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
          overflow: hidden;
        }
        .labor-model-tab-indicator::after {
          content: "";
          position: absolute;
          inset: -40% auto -40% -12%;
          width: 48%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.34), transparent);
          animation: laborTabLightSweep 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
	        .labor-model-tab-button {
          position: relative;
          z-index: 1;
          align-self: center;
	          min-height: 48px;
          border: none;
          border-radius: 12px;
          background: transparent;
          color: ${C.textSec};
          cursor: pointer;
          font-family: inherit;
	          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0;
	          white-space: nowrap;
	          display: grid;
	          align-content: center;
	          justify-items: center;
	          gap: 2px;
	          transition: color 180ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms ease;
	        }
	        .labor-model-tab-button span,
	        .labor-model-tab-button small,
	        .labor-model-tab-button em {
	          display: block;
	          line-height: 1.05;
	        }
	        .labor-model-tab-button small {
	          color: ${C.textMut};
	          font-size: 9px;
	          font-weight: 950;
	        }
	        .labor-model-tab-button em {
	          color: #0e7490;
	          font-size: 8px;
	          font-style: normal;
	          margin-top: 1px;
	        }
        .labor-model-tab-button:hover {
          color: ${C.pri};
          background: rgba(20, 83, 45, 0.055);
        }
	        .labor-model-tab-button.is-active {
	          color: #fff;
	          transform: translateY(-1px);
	        }
	        .labor-model-tab-button.is-active small,
	        .labor-model-tab-button.is-active em {
	          color: rgba(255,255,255,0.86);
	        }
        .labor-model-summary-view,
        .labor-model-day-view {
          animation: laborModelGridIn 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
	        .labor-model-summary-cards {
	          display: grid;
	          grid-template-columns: repeat(3, minmax(0, 1fr));
	          gap: 10px;
	        }
        .labor-model-metric-card {
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: #fff;
          padding: 13px 14px;
          min-width: 0;
          box-shadow: 0 10px 26px rgba(15, 23, 42, 0.045);
        }
	        .labor-model-metric-card.is-primary {
	          border-color: rgba(20, 83, 45, 0.22);
	          background: linear-gradient(135deg, rgba(240,253,244,0.9), #ffffff 62%);
	        }
	        .labor-model-metric-card.is-marketing {
	          border-color: rgba(14, 116, 144, 0.2);
	          background: linear-gradient(135deg, rgba(236, 254, 255, 0.94), #ffffff 62%);
	        }
	        .labor-model-metric-card.is-marketing strong {
	          color: #0e7490;
	        }
        .labor-model-metric-card span {
          display: block;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .labor-model-metric-card strong {
          display: block;
          margin-top: 7px;
          color: ${C.text};
          font-size: 26px;
          font-weight: 950;
          line-height: 1;
        }
        .labor-model-metric-card.is-primary strong {
          color: ${C.pri};
        }
        .labor-model-metric-card em {
          display: block;
          margin-top: 7px;
          color: ${C.textMut};
          font-style: normal;
          font-size: 11px;
          font-weight: 780;
          line-height: 1.3;
        }
        .labor-model-summary-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(330px, 0.8fr);
          gap: 12px;
          margin-top: 12px;
          align-items: start;
        }
        .labor-model-summary-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
          min-width: 0;
        }
        .labor-model-panel {
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.045);
        }
        .labor-model-panel-title {
          padding: 12px 14px;
          border-bottom: 1px solid ${C.borderLight};
          background: #f8fafc;
          color: ${C.text};
          font-size: 13px;
          font-weight: 950;
        }
        .labor-model-summary-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .labor-model-summary-table th,
        .labor-model-summary-table td {
          padding: 10px 12px;
          border-bottom: 1px solid ${C.borderLight};
          font-size: 11.5px;
          white-space: nowrap;
        }
        .labor-model-summary-table th {
          background: #f8fafc;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .labor-model-summary-table td {
          color: ${C.text};
          font-weight: 820;
        }
        .labor-model-summary-table tbody tr:last-child td {
          border-bottom: none;
        }
        .labor-model-summary-note {
          border-top: 1px solid ${C.borderLight};
          padding: 11px 13px;
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 760;
          line-height: 1.4;
          background: #fbfdff;
        }
        .labor-model-day-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding: 12px 13px;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: linear-gradient(135deg, #ffffff, #f8fafc);
        }
        .labor-model-day-title {
          color: ${C.text};
          font-size: 16px;
          font-weight: 950;
          line-height: 1.1;
        }
        .labor-model-day-subtitle {
          margin-top: 5px;
          color: ${C.textMut};
          font-size: 11.5px;
          font-weight: 760;
        }
        .labor-model-grid-wrap {
          max-height: min(62vh, 650px);
          overflow: auto;
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.055);
        }
        .labor-model-grid-table {
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .labor-model-grid-table th,
        .labor-model-grid-table td {
          border-right: 1px solid ${C.borderLight};
          border-bottom: 1px solid ${C.borderLight};
          background: #fff;
          vertical-align: middle;
        }
        .labor-model-grid-table th {
          position: sticky;
          top: 0;
          z-index: 4;
          padding: 8px;
          background: #f8fafc;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0;
          text-align: center;
        }
        .labor-model-sticky-col {
          position: sticky;
          left: 0;
          z-index: 3;
          min-width: 170px;
          max-width: 210px;
          box-shadow: 1px 0 0 ${C.borderLight};
        }
        th.labor-model-sticky-col {
          z-index: 6;
        }
        .labor-model-role-col,
        .labor-model-role-cell {
          min-width: 230px;
        }
        .labor-model-grid-table td {
          padding: 7px;
          transition: background 160ms ease;
        }
        .labor-model-grid-row {
          animation: laborModelGridIn 230ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-model-grid-row:hover td {
          background: #f8fafc;
        }
        .labor-model-grid-row.is-recent-change td,
        .labor-model-time-heading.is-recent-change {
          animation: hourAnalysisChangePulse 760ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-model-line-cell {
          position: sticky;
          left: 0;
          background: #fff;
        }
        .labor-model-line-input,
        .labor-model-text-input,
        .labor-model-time-input,
        .labor-model-coverage-input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: ${C.text};
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
          outline: none;
          transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease, transform 150ms ease;
        }
        .labor-model-line-input {
          padding: 8px 9px;
        }
        .labor-model-time-input {
          min-width: 76px;
          padding: 6px 7px;
          text-align: center;
          font-size: 10.5px;
        }
        .labor-model-coverage-input {
          width: 48px;
          height: 34px;
          padding: 0 6px;
          text-align: center;
          text-transform: uppercase;
        }
        .labor-model-line-input:hover,
        .labor-model-time-input:hover,
        .labor-model-coverage-input:hover,
        .labor-model-line-input:focus,
        .labor-model-time-input:focus,
        .labor-model-coverage-input:focus {
          border-color: rgba(20, 83, 45, 0.28);
          background: #fff;
          box-shadow: 0 0 0 4px rgba(20, 83, 45, 0.07);
        }
        .labor-model-time-heading {
          position: sticky;
          top: 0;
          min-width: 84px;
        }
        .labor-model-time-editor {
          display: grid;
          justify-items: center;
          gap: 5px;
        }
        .labor-model-slot-input {
          width: 52px;
          padding: 5px 6px;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: #fff;
          color: ${C.text};
          font-size: 11px;
          font-weight: 950;
          text-align: center;
        }
        .labor-model-role-cell .hour-analysis-picker-trigger {
          min-height: 34px;
          border-radius: 8px;
          padding: 7px 9px;
          font-size: 11px;
        }
        .labor-model-role-cell .hour-analysis-picker-panel {
          position: absolute;
          z-index: 45;
          min-width: 300px;
        }
        .labor-model-hours-cell {
          min-width: 74px;
          color: ${C.pri};
          font-weight: 950;
          text-align: right;
        }
        .labor-model-delete-cell {
          min-width: 46px;
          text-align: center;
        }
        .labor-model-delete-button,
        .labor-model-column-delete,
        .labor-model-column-plus,
        .labor-model-row-plus {
          border: 1px solid ${C.borderLight};
          background: #fff;
          color: ${C.textMut};
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: border-color 160ms ease, color 160ms ease, background 160ms ease, opacity 160ms ease, transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-model-delete-button,
        .labor-model-column-delete {
          width: 30px;
          height: 30px;
          border-radius: 9px;
          opacity: 0;
        }
        .labor-model-grid-row:hover .labor-model-delete-button,
        .labor-model-time-heading:hover .labor-model-column-delete {
          opacity: 1;
        }
        .labor-model-delete-button:hover,
        .labor-model-column-delete:hover {
          border-color: #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          transform: translateY(-1px);
        }
        .labor-model-column-plus,
        .labor-model-row-plus {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          color: #c2410c;
          border-color: rgba(249, 115, 22, 0.34);
          opacity: 0;
          box-shadow: 0 8px 18px rgba(249, 115, 22, 0.13);
        }
        .labor-model-time-heading:hover .labor-model-column-plus,
        .labor-model-line-cell:hover .labor-model-row-plus {
          opacity: 1;
          animation: laborModelInsertPulse 900ms ease-out;
        }
        .labor-model-column-plus {
          position: absolute;
          top: 50%;
          right: -13px;
          z-index: 8;
          transform: translateY(-50%);
        }
        .labor-model-row-plus {
          position: absolute;
          left: 50%;
          bottom: -13px;
          z-index: 8;
          transform: translateX(-50%);
        }
        .labor-model-column-plus:hover {
          opacity: 1;
          background: #fff7ed;
          transform: translateY(-50%) scale(1.06);
        }
        .labor-model-row-plus:hover {
          opacity: 1;
          background: #fff7ed;
          transform: translateX(-50%) scale(1.06);
        }
        .labor-model-column-delete {
          position: absolute;
          left: 50%;
          bottom: 4px;
          transform: translateX(-50%);
        }
        .labor-model-column-delete:hover {
          transform: translateX(-50%) translateY(-1px);
        }
        .labor-model-column-delete:disabled {
          opacity: 0;
          cursor: default;
        }
        .labor-model-page {
          display: grid;
          gap: 14px;
          animation: laborModuleEnter 340ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-model-page-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 16px;
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(240,253,244,0.9), #ffffff 52%, #f8fafc);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.055);
        }
        .labor-model-page-kicker {
          color: ${C.textMut};
          font-size: 10.5px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .labor-model-page-title {
          margin-top: 4px;
          color: ${C.text};
          font-size: 22px;
          font-weight: 950;
          line-height: 1.05;
        }
        .labor-model-page-subtitle {
          margin-top: 6px;
          max-width: 760px;
          color: ${C.textSec};
          font-size: 12px;
          font-weight: 760;
          line-height: 1.4;
        }
        .labor-model-page-stat {
          min-width: 150px;
          text-align: right;
        }
        .labor-model-page-stat span {
          display: block;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .labor-model-page-stat strong {
          display: block;
          margin-top: 5px;
          color: ${C.pri};
          font-size: 28px;
          font-weight: 950;
          line-height: 1;
        }
        .labor-model-shell.is-page {
          min-height: 0;
          gap: 12px;
        }
        .labor-model-shell.is-page .labor-model-tabs {
          overflow: visible;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.045);
        }
        .labor-model-shell.is-page .labor-model-tab-button {
          font-size: 11.5px;
        }
        .labor-model-summary-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
          gap: 12px;
          align-items: stretch;
        }
        .labor-model-graph-card {
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #fff;
          padding: 14px;
          min-width: 0;
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
          overflow: hidden;
        }
        .labor-model-graph-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }
        .labor-model-graph-header span,
        .labor-model-graph-header em {
          display: block;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          font-style: normal;
          text-transform: uppercase;
        }
        .labor-model-graph-header strong {
          display: block;
          margin-top: 4px;
          color: ${C.text};
          font-size: 16px;
          font-weight: 950;
        }
        .labor-model-line-graph {
          width: 100%;
          height: auto;
          display: block;
        }
        .labor-model-graph-gridline {
          stroke: ${C.borderLight};
          stroke-width: 1;
        }
        .labor-model-graph-area {
          fill: url(#laborModelGraphFill);
          animation: laborModelGridIn 420ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-model-graph-line {
          fill: none;
          stroke: ${C.pri};
          stroke-width: 4;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 8px 10px rgba(20, 83, 45, 0.16));
          animation: laborModelGridIn 360ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-model-graph-dot {
          fill: #fff;
          stroke: ${C.pri};
          stroke-width: 4;
          cursor: pointer;
          transition: r 160ms ease, fill 160ms ease, transform 160ms ease;
        }
        .labor-model-graph-dot:hover {
          fill: ${C.pri};
        }
	        .labor-model-graph-label {
	          fill: ${C.textMut};
	          font-size: 12px;
	          font-weight: 900;
	        }
	        .labor-model-graph-value {
	          fill: ${C.text};
	          font-size: 11px;
	          font-weight: 950;
	          paint-order: stroke;
	          stroke: #fff;
	          stroke-width: 4px;
	          stroke-linejoin: round;
	        }
	        .labor-model-shell.is-page .labor-model-summary-cards {
	          grid-template-columns: repeat(4, minmax(0, 1fr));
	        }
        .labor-model-shell.is-page .labor-model-summary-grid {
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.82fr);
          gap: 12px;
          margin-top: 0;
        }
        .labor-model-shell.is-page .labor-model-summary-table th,
        .labor-model-shell.is-page .labor-model-summary-table td {
          padding: 8px 9px;
          font-size: 10.5px;
        }
        .labor-model-shell.is-page .labor-model-summary-table th {
          font-size: 9px;
        }
        .labor-model-shell.is-page .labor-model-day-header {
          display: none;
        }
        .labor-model-grid-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }
        .labor-model-grid-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .labor-model-settings-button {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #d9e2ec;
          border-radius: 8px;
          background: #fff;
          color: ${C.textSec};
          padding: 7px 10px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 950;
          cursor: pointer;
          transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease;
        }
        .labor-model-settings-button:hover {
          background: #f8fafc;
          border-color: #b8c5d5;
          color: ${C.pri};
          transform: translateY(-1px);
        }
	        .labor-model-grid-title {
	          color: ${C.text};
	          font-size: 16px;
	          font-weight: 950;
	          display: flex;
	          align-items: center;
	          gap: 8px;
	          flex-wrap: wrap;
	        }
	        .labor-model-grid-title span,
	        .labor-model-grid-title em {
	          border-radius: 999px;
	          padding: 4px 8px;
	          font-size: 10px;
	          line-height: 1;
	          font-style: normal;
	          font-weight: 950;
	        }
	        .labor-model-grid-title span {
	          border: 1px solid rgba(20, 83, 45, 0.2);
	          background: rgba(240, 253, 244, 0.9);
	          color: ${C.pri};
	        }
	        .labor-model-grid-title em {
	          border: 1px solid rgba(14, 116, 144, 0.2);
	          background: rgba(236, 254, 255, 0.92);
	          color: #0e7490;
	        }
        .labor-model-grid-meta {
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 800;
        }
	        .labor-model-grid-wrap {
	          max-height: none;
	          overflow: visible;
	          border-radius: 8px;
	        }
        .labor-model-grid-table {
          width: 100%;
          min-width: 0;
          table-layout: fixed;
        }
        .labor-model-grid-table th,
        .labor-model-grid-table td {
          padding: 4px;
        }
	        .labor-model-grid-table th {
	          position: sticky;
	          top: 0;
	          z-index: 18;
	          height: 42px;
	          font-size: 9px;
	          box-shadow: 0 1px 0 ${C.borderLight}, 0 8px 18px rgba(15, 23, 42, 0.035);
	        }
        .labor-model-position-col,
        .labor-model-position-cell {
          width: 180px;
        }
        .labor-model-shift-col,
        .labor-model-shift-cell {
          width: 118px;
        }
        .labor-model-grid-table .labor-model-hours-col,
        .labor-model-grid-table .labor-model-hours-cell {
          width: 58px;
        }
        .labor-model-grid-table .labor-model-actions-col,
        .labor-model-grid-table .labor-model-delete-cell {
          width: 34px;
        }
	        .labor-model-time-heading {
	          position: relative;
	          min-width: 0;
	          width: auto;
	        }
	        .labor-model-time-heading.has-shift-breaker-left,
	        .labor-model-coverage-cell.has-shift-breaker-left,
	        .labor-model-total-cell.has-shift-breaker-left {
	          border-left: 2px solid rgba(15, 23, 42, 0.28) !important;
	        }
	        .labor-model-time-heading.has-shift-breaker-inside,
	        .labor-model-coverage-cell.has-shift-breaker-inside,
	        .labor-model-total-cell.has-shift-breaker-inside {
	          position: relative;
	        }
	        .labor-model-time-heading.has-shift-breaker-inside::after,
	        .labor-model-coverage-cell.has-shift-breaker-inside::after,
	        .labor-model-total-cell.has-shift-breaker-inside::after {
	          content: "";
	          position: absolute;
	          top: 0;
	          bottom: 0;
	          left: var(--labor-model-breaker-pct, 50%);
	          width: 2px;
	          background: rgba(15, 23, 42, 0.28);
	          pointer-events: none;
	          z-index: 4;
	        }
        .labor-model-time-editor {
          gap: 2px;
        }
        .labor-model-time-input {
          min-width: 0;
          height: 28px;
          padding: 3px 3px;
          border-radius: 7px;
          font-size: 9.5px;
          line-height: 1.05;
        }
        .labor-model-column-actions {
          position: absolute;
          inset: auto 2px 2px 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2px;
          opacity: 0;
          pointer-events: none;
          transform: translateY(2px);
          transition: opacity 150ms ease, transform 150ms ease;
        }
        .labor-model-time-heading:hover .labor-model-column-actions,
        .labor-model-time-heading:focus-within .labor-model-column-actions {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        .labor-model-column-action {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid rgba(249, 115, 22, 0.34);
          background: #fff7ed;
          color: #c2410c;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 150ms ease, background 150ms ease, color 150ms ease;
        }
        .labor-model-column-action:hover {
          transform: scale(1.08);
          background: #ffedd5;
        }
        .labor-model-column-action.is-delete {
          border-color: rgba(239, 68, 68, 0.24);
          background: #fff;
          color: ${C.textMut};
        }
        .labor-model-column-action.is-delete:hover {
          background: #fef2f2;
          color: #b91c1c;
        }
        .labor-model-column-action:disabled {
          opacity: 0.35;
          cursor: default;
          transform: none;
        }
        .labor-model-position-cell .hour-analysis-picker-trigger {
          min-height: 28px;
          padding: 5px 7px;
          border-radius: 7px;
          font-size: 10px;
          line-height: 1.05;
        }
	        .labor-model-position-cell .hour-analysis-picker-panel {
	          min-width: 290px;
	        }
	        .labor-model-position-cell {
	          position: relative;
	        }
        .labor-model-position-stack {
          display: grid;
          gap: 4px;
        }
        .labor-model-run-badge {
          width: fit-content;
          border: 1px solid rgba(20, 83, 45, 0.2);
          border-radius: 999px;
          background: rgba(240, 253, 244, 0.9);
          color: ${C.pri};
          padding: 2px 7px;
          font-size: 9px;
          font-weight: 950;
          white-space: nowrap;
        }
        .labor-model-shift-control {
          position: relative;
        }
        .labor-model-shift-trigger {
          width: 100%;
          min-height: 28px;
          border: 1px solid ${C.borderLight};
          border-radius: 7px;
          background: #fff;
          color: ${C.text};
          cursor: pointer;
          font-family: inherit;
          font-size: 10px;
          font-weight: 950;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 4px;
          padding: 5px 7px;
          text-align: left;
          transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
        }
        .labor-model-shift-trigger small {
          grid-column: 1 / -1;
          color: ${C.textMut};
          font-size: 8.5px;
          font-weight: 850;
          white-space: nowrap;
        }
        .labor-model-shift-trigger:hover,
        .labor-model-shift-trigger.has-break {
          border-color: rgba(20, 83, 45, 0.24);
          box-shadow: 0 0 0 3px rgba(20, 83, 45, 0.055);
        }
        .labor-model-shift-panel {
          position: absolute;
          z-index: 50;
          top: calc(100% + 7px);
          left: 0;
          width: 280px;
          border: 1px solid ${C.border};
          border-radius: 14px;
          background: rgba(255,255,255,0.98);
          box-shadow: 0 24px 55px rgba(15, 23, 42, 0.16);
          padding: 12px;
          animation: filterSlideIn 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-model-break-row,
        .labor-model-break-duration {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid ${C.borderLight};
        }
        .labor-model-break-row strong,
        .labor-model-break-duration span {
          display: block;
          color: ${C.text};
          font-size: 12px;
          font-weight: 950;
        }
        .labor-model-break-row span {
          display: block;
          margin-top: 2px;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 760;
        }
        .labor-model-break-toggle {
          min-width: 52px;
          border: 1px solid ${C.borderLight};
          border-radius: 999px;
          background: #f8fafc;
          color: ${C.textMut};
          padding: 6px 10px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 950;
          cursor: pointer;
        }
        .labor-model-break-toggle.is-on {
          border-color: rgba(20, 83, 45, 0.22);
          background: rgba(220, 252, 231, 0.86);
          color: ${C.pri};
        }
        .labor-model-break-input {
          width: 74px;
          height: 32px;
          border-radius: 8px;
          text-align: right;
        }
	        .labor-model-coverage-cell {
	          text-align: center;
	          padding: 3px !important;
	        }
		        .labor-model-coverage-cell-shell {
		          position: relative;
		          width: 100%;
		          height: 28px;
		        }
		        .labor-model-coverage-cell-button {
          width: 100%;
          height: 28px;
          min-width: 0;
          border: 1px solid rgba(203, 213, 225, 0.78);
		          border-radius: 6px;
		          background:
                linear-gradient(135deg, rgba(248,250,252,0.96), rgba(241,245,249,0.82));
		          color: rgba(71, 85, 105, 0.72);
          cursor: pointer;
          font-family: inherit;
          font-size: 9px;
          font-weight: 950;
          text-align: center;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: clip;
          outline: none;
          padding: 0 3px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
	          transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease, color 120ms ease;
	        }
        .labor-model-coverage-cell-button span {
          min-width: 0;
          overflow: hidden;
          text-overflow: clip;
          border-radius: 999px;
          padding: 1px 4px;
          line-height: 1.05;
        }
	        .labor-model-coverage-cell-button:hover {
	          border-color: rgba(100, 116, 139, 0.34);
	          background:
                linear-gradient(135deg, rgba(255,255,255,0.98), rgba(226,232,240,0.72));
	        }
	        .labor-model-coverage-cell-shell.is-selected .labor-model-coverage-cell-button,
	        .labor-model-coverage-cell-button.is-selected {
	          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.34), inset 0 1px 0 rgba(255,255,255,0.14);
	        }
	        .labor-model-coverage-cell-shell.is-conflict .labor-model-coverage-cell-button,
	        .labor-model-coverage-cell-button.is-conflict {
	          border-color: #f59e0b;
	          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.24);
	        }
	        .labor-model-coverage-cell-shell.is-saving .labor-model-coverage-cell-button {
	          opacity: 0.78;
	        }
	        .labor-model-coverage-cell-button.is-active.is-full {
	          border-color: color-mix(in srgb, var(--labor-model-cell-strong, #14532d) 34%, transparent);
	          background: linear-gradient(135deg, var(--labor-model-cell-strong, #14532d), var(--labor-model-cell-accent, #16a34a));
          color: #ffffff;
	          box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 14px color-mix(in srgb, var(--labor-model-cell-strong, #14532d) 18%, transparent);
	        }
	        .labor-model-coverage-cell-button.is-active.is-half {
	          border-color: color-mix(in srgb, var(--labor-model-cell-strong, #14532d) 30%, transparent);
	          background: linear-gradient(90deg, var(--labor-model-cell-strong, #14532d) 0 52%, var(--labor-model-cell-soft, rgba(240,253,244,0.96)) 52% 100%);
	          color: var(--labor-model-cell-text, ${C.pri});
	          box-shadow: inset 0 1px 0 rgba(255,255,255,0.26), 0 6px 14px color-mix(in srgb, var(--labor-model-cell-strong, #14532d) 15%, transparent);
	        }
        .labor-model-coverage-cell-button.is-active.is-half span {
          max-width: calc(100% - 4px);
          background: rgba(255,255,255,0.86);
          box-shadow: 0 1px 0 rgba(255,255,255,0.64);
        }
	        .labor-model-coverage-cell-button.is-active.is-marketing {
	          border-color: rgba(14, 116, 144, 0.34);
	          background: linear-gradient(135deg, #0f766e, #0284c7);
	          color: #fff;
	          box-shadow: inset 0 1px 0 rgba(255,255,255,0.24), 0 6px 14px rgba(14, 116, 144, 0.14);
	        }
        .labor-model-coverage-cell-button.is-active.is-role {
          border-color: color-mix(in srgb, var(--labor-model-cell-strong, #c2410c) 34%, transparent);
          background: linear-gradient(135deg, var(--labor-model-cell-strong, #c2410c), var(--labor-model-cell-accent, #fb923c));
          color: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.62), 0 6px 14px color-mix(in srgb, var(--labor-model-cell-strong, #c2410c) 13%, transparent);
        }
		        .labor-model-coverage-cell-button.is-active:focus {
		          box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 0 0 3px rgba(20, 83, 45, 0.16);
		        }
	        .labor-model-cell-toolbar {
	          position: absolute;
	          z-index: 16;
	          top: -8px;
	          right: 2px;
	          display: inline-flex;
	          align-items: center;
	          gap: 2px;
	          opacity: 0;
	          pointer-events: none;
	          transform: translateY(3px) scale(0.96);
	          transition: opacity 140ms ease, transform 140ms ease;
	        }
	        .labor-model-coverage-cell-shell:hover .labor-model-cell-toolbar,
	        .labor-model-coverage-cell-shell:focus-within .labor-model-cell-toolbar,
	        .labor-model-coverage-cell-shell.is-selected .labor-model-cell-toolbar {
	          opacity: 1;
	          pointer-events: auto;
	          transform: translateY(0) scale(1);
	        }
	        .labor-model-cell-tool {
	          width: 19px;
	          height: 19px;
	          display: inline-flex;
	          align-items: center;
	          justify-content: center;
	          border: 1px solid rgba(15, 23, 42, 0.12);
	          border-radius: 6px;
	          background: rgba(255,255,255,0.96);
	          color: ${C.textSec};
	          padding: 0;
	          font-family: inherit;
	          font-size: 8px;
	          font-weight: 950;
	          line-height: 1;
	          cursor: pointer;
	          box-shadow: 0 7px 16px rgba(15, 23, 42, 0.14);
	          transition: background 120ms ease, color 120ms ease, border-color 120ms ease, transform 120ms ease;
	        }
	        .labor-model-cell-tool:hover {
	          background: #f8fafc;
	          border-color: rgba(20, 83, 45, 0.24);
	          color: ${C.pri};
	          transform: translateY(-1px);
	        }
	        .labor-model-cell-tool.is-selected {
	          background: #2563eb;
	          border-color: #2563eb;
	          color: #fff;
	        }
	        .labor-model-cell-tool.is-delete {
	          color: #b91c1c;
	        }
	        .labor-model-cell-tool.is-delete:hover {
	          background: #fee2e2;
	          border-color: rgba(185, 28, 28, 0.28);
	          color: #991b1b;
	        }
	        .labor-model-cell-position-panel {
	          position: absolute;
	          z-index: 70;
	          top: calc(100% + 7px);
	          right: 0;
	          width: 250px;
	          border: 1px solid ${C.border};
	          border-radius: 14px;
	          background: rgba(255,255,255,0.98);
	          box-shadow: 0 24px 55px rgba(15, 23, 42, 0.16);
	          padding: 12px;
	          text-align: left;
	          animation: filterSlideIn 0.2s cubic-bezier(0.22, 1, 0.36, 1);
	        }
        .labor-model-cell-position-section + .labor-model-cell-position-section {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(226, 232, 240, 0.85);
        }
		        .labor-model-fill-handle {
		          position: absolute;
		          top: 5px;
		          right: -3px;
		          bottom: 5px;
	          width: 8px;
	          border-radius: 999px;
	          background: rgba(255,255,255,0.92);
	          box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08), 0 6px 12px rgba(15, 23, 42, 0.12);
	          cursor: ew-resize;
	          opacity: 0;
	          transform: scaleY(0.72);
	          transition: opacity 120ms ease, transform 120ms cubic-bezier(0.22, 1, 0.36, 1), background 120ms ease;
	          z-index: 6;
	        }
	        .labor-model-coverage-cell-shell:hover .labor-model-fill-handle,
	        .labor-model-coverage-cell-shell:focus-within .labor-model-fill-handle {
	          opacity: 1;
	          transform: scaleY(1);
	        }
	        .labor-model-fill-handle:hover {
	          background: #fff7ed;
	        }
        .labor-model-hours-cell {
          min-width: 0;
          color: ${C.pri};
          font-size: 11px;
          font-weight: 950;
          text-align: right;
        }
        .labor-model-delete-cell {
          min-width: 0;
        }
	        .labor-model-row-insert {
	          position: absolute;
	          left: 50%;
	          bottom: -11px;
	          z-index: 12;
	          width: 22px;
	          height: 22px;
	          border-radius: 999px;
	          border: 1px solid rgba(249, 115, 22, 0.34);
	          background: #fff7ed;
	          color: #c2410c;
	          box-shadow: 0 10px 20px rgba(249, 115, 22, 0.18);
	          cursor: pointer;
	          opacity: 0;
	          transform: translateX(-50%) scale(0.82);
	          display: inline-flex;
	          align-items: center;
	          justify-content: center;
	          transition: opacity 150ms ease, transform 150ms cubic-bezier(0.22, 1, 0.36, 1), background 150ms ease;
	        }
	        .labor-model-position-cell:hover .labor-model-row-insert,
	        .labor-model-position-cell:focus-within .labor-model-row-insert {
	          opacity: 1;
	          transform: translateX(-50%) scale(1);
	        }
	        .labor-model-row-insert:hover {
	          background: #ffedd5;
	          transform: translateX(-50%) scale(1.08);
	        }
	        .labor-model-empty-add {
	          display: inline-flex;
	          align-items: center;
	          gap: 7px;
	          border: 1px solid rgba(249, 115, 22, 0.34);
	          border-radius: 999px;
	          background: #fff7ed;
	          color: #c2410c;
	          padding: 8px 12px;
	          font-family: inherit;
	          font-size: 12px;
	          font-weight: 950;
	          cursor: pointer;
	        }
	        .labor-model-delete-button {
          opacity: 0.18;
          width: 24px;
          height: 24px;
          border-radius: 7px;
        }
	        .labor-model-grid-row:hover .labor-model-delete-button,
	        .labor-model-grid-row:focus-within .labor-model-delete-button {
	          opacity: 1;
	        }
	        .labor-model-total-row td {
	          position: sticky;
	          bottom: 0;
	          z-index: 10;
	          border-top: 2px solid rgba(20, 83, 45, 0.22);
	          background: linear-gradient(180deg, #f8fafc, #fff);
	          color: ${C.text};
	          font-size: 10px;
	          font-weight: 950;
	          text-align: center;
	          box-shadow: 0 -8px 18px rgba(15, 23, 42, 0.035);
	        }
	        .labor-model-total-row td:first-child,
	        .labor-model-total-row td:nth-child(2) {
	          text-align: left;
	        }
	        .labor-model-total-row small,
	        .labor-model-total-cell small {
	          display: block;
	          margin-top: 2px;
	          color: #0e7490;
	          font-size: 8px;
	          font-weight: 950;
	        }
		        .labor-model-total-cell {
		          color: ${C.pri} !important;
		        }
        .labor-model-breaker-editor {
          display: grid;
          gap: 14px;
        }
        .labor-model-breaker-day-tabs {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 6px;
        }
        .labor-model-breaker-day-tab {
          min-height: 48px;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: #fff;
          color: ${C.textSec};
          font-family: inherit;
          cursor: pointer;
          display: grid;
          place-items: center;
          gap: 2px;
          transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease;
        }
        .labor-model-breaker-day-tab:hover {
          background: #f8fafc;
          border-color: #b8c5d5;
          transform: translateY(-1px);
        }
        .labor-model-breaker-day-tab.is-active {
          background: #f0fdf4;
          border-color: rgba(20, 83, 45, 0.34);
          color: ${C.pri};
        }
        .labor-model-breaker-day-tab span {
          font-size: 11px;
          font-weight: 950;
        }
        .labor-model-breaker-day-tab small {
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 900;
        }
        .labor-model-breaker-panel,
        .labor-model-breaker-copy-panel {
          border: 1px solid ${C.border};
          border-radius: 8px;
          background: #fff;
          padding: 13px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.045);
        }
        .labor-model-breaker-panel-header,
        .labor-model-breaker-copy-panel {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .labor-model-breaker-panel-header strong,
        .labor-model-breaker-copy-panel strong {
          display: block;
          color: ${C.text};
          font-size: 13px;
          font-weight: 950;
        }
        .labor-model-breaker-panel-header span,
        .labor-model-breaker-copy-panel span {
          display: block;
          margin-top: 3px;
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 760;
        }
        .labor-model-breaker-panel-actions,
        .labor-model-breaker-copy-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .labor-model-breaker-panel-actions button,
        .labor-model-breaker-copy-actions button,
        .labor-model-breaker-delete {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #d9e2ec;
          border-radius: 8px;
          background: #fff;
          color: ${C.textSec};
          padding: 7px 10px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 950;
          cursor: pointer;
        }
        .labor-model-breaker-panel-actions button:hover,
        .labor-model-breaker-copy-actions button:hover {
          background: #f8fafc;
          color: ${C.pri};
        }
        .labor-model-breaker-list {
          display: grid;
          gap: 8px;
          margin-top: 12px;
        }
        .labor-model-breaker-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid ${C.borderLight};
          border-radius: 8px;
          background: #f8fafc;
          padding: 9px 10px;
        }
        .labor-model-breaker-row > div {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .labor-model-breaker-row span {
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .labor-model-breaker-time-input {
          width: 92px;
          height: 32px;
          border: 1px solid #d9e2ec;
          border-radius: 8px;
          background: #fff;
          color: ${C.text};
          padding: 7px 9px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
          text-align: center;
          outline: none;
        }
        .labor-model-breaker-delete {
          width: 32px;
          padding: 0;
          color: #b91c1c;
        }
        .labor-model-breaker-empty {
          border: 1px dashed ${C.border};
          border-radius: 8px;
          background: #f8fafc;
          padding: 14px;
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 800;
          text-align: center;
        }
        .labor-model-breaker-copy-panel {
          align-items: center;
        }
        .labor-model-breaker-copy-grid {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .labor-model-breaker-copy-check {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid ${C.borderLight};
          border-radius: 999px;
          background: #f8fafc;
          padding: 6px 9px;
          cursor: pointer;
        }
        .labor-model-breaker-copy-check input {
          accent-color: ${C.pri};
        }
        .labor-model-breaker-copy-check span {
          margin: 0;
          color: ${C.textSec};
          font-size: 11px;
          font-weight: 950;
        }
        .labor-view-switcher {
          --labor-view-count: 1;
          --labor-view-active-index: 0;
          position: relative;
          display: grid;
          grid-template-columns: repeat(var(--labor-view-count), minmax(0, 1fr));
          gap: 0;
          min-height: 82px;
          margin-bottom: 18px;
          padding: 6px;
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.9));
          box-shadow: 0 14px 36px rgba(15, 23, 42, 0.05);
          overflow: hidden;
          animation: laborControlSettle 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .labor-view-switcher-indicator {
          position: absolute;
          top: 6px;
          bottom: 6px;
          left: 6px;
          width: calc((100% - 12px) / var(--labor-view-count));
          border-radius: 12px;
          background:
            radial-gradient(circle at 18% 18%, rgba(132,204,22,0.18), transparent 34%),
            linear-gradient(135deg, rgba(240,253,244,0.96), rgba(236,253,245,0.92));
          border: 1px solid rgba(20, 83, 45, 0.55);
          box-shadow: 0 16px 38px rgba(20, 83, 45, 0.12);
          transform: translateX(calc(var(--labor-view-active-index) * 100%));
          transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
          z-index: 0;
        }
        .labor-view-option {
          position: relative;
          z-index: 1;
          min-width: 0;
          border: none;
          border-radius: 12px;
          background: transparent;
          color: ${C.textSec};
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          padding: 14px 16px;
          display: grid;
          gap: 4px;
          align-content: center;
          transition: color 200ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background 200ms ease;
        }
        .labor-view-option:hover {
          background: rgba(20, 83, 45, 0.045);
          transform: translateY(-1px);
        }
        .labor-view-option.is-active {
          color: ${C.pri};
        }
        .labor-view-option span {
          font-size: 14px;
          font-weight: 950;
          letter-spacing: 0;
        }
        .labor-view-option small {
          font-size: 12px;
          color: ${C.textMut};
          line-height: 1.35;
          font-weight: 650;
        }
        .labor-module-panel {
          min-height: 560px;
          animation: laborModuleEnter 360ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity;
        }
	        @media (prefers-reduced-motion: reduce) {
	          .labor-module-panel,
	          .labor-view-switcher,
	          .labor-tab-indicator::after,
            .hour-analysis-card,
            .hour-analysis-person-row.is-what-if,
            .hour-analysis-decision-card.is-recent-change,
            .hour-analysis-hire-card.is-recent-change,
            .hour-analysis-person-row.is-recent-change,
            .hour-analysis-picker-panel,
            .hour-analysis-split-panel,
            .hour-analysis-position-panel,
            .hour-analysis-picker-option,
            .hour-analysis-audit-row,
            .hour-analysis-capacity-total::after,
            .hour-analysis-capacity-row,
            .hour-analysis-capacity-row::after,
            .hour-analysis-capacity-fill::after,
            .labor-model-role-color-settings { animation: none; }
	          .labor-tab-indicator,
	          .labor-view-switcher-indicator,
	          .labor-tab-button,
	          .labor-view-option,
            .labor-template-gear-button,
            .labor-template-gear-button svg,
            .hour-analysis-mini-button,
            .hour-analysis-person-row,
            .hour-analysis-number-input,
            .hour-analysis-note-input,
            .hour-analysis-picker-trigger,
            .hour-analysis-split-trigger,
            .hour-analysis-position-trigger,
            .hour-analysis-picker-option,
            .hour-analysis-progress-fill,
            .hour-analysis-capacity-fill,
            .hour-analysis-capacity-marker { transition: none; }
	        }
	        @media (max-width: 880px) {
	          .labor-page-shell { padding: 14px 8px 28px; }
          .labor-module-header { align-items: flex-start; flex-direction: column; }
          .labor-header-action-slot { width: 100%; justify-content: flex-start; }
          .labor-home-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .labor-home-top-grid { grid-template-columns: 1fr; }
          .labor-module-tabs {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 4px;
            overflow: visible;
          }
          .labor-tab-indicator {
            display: none;
          }
          .labor-tab-button {
            height: auto;
            min-height: 40px;
            padding: 7px 8px;
            white-space: normal;
            line-height: 1.15;
          }
          .labor-tab-button.is-active {
            background: linear-gradient(135deg, #14532d 0%, #166534 56%, #3f6212 100%);
            box-shadow: 0 10px 24px rgba(20, 83, 45, 0.18), inset 0 1px 0 rgba(255,255,255,0.16);
          }
          .labor-view-switcher {
            grid-template-columns: 1fr;
            min-height: 0;
          }
          .labor-view-switcher-indicator { display: none; }
          .hour-analysis-summary-grid { grid-template-columns: 1fr; }
          .hour-analysis-roster-summary { grid-template-columns: 1fr; }
          .hour-analysis-decision-grid { grid-template-columns: 1fr; }
          .hour-analysis-capacity-dashboard { grid-template-columns: 1fr; }
          .hour-analysis-capacity-visual { grid-template-columns: 1fr; }
          .hour-analysis-capacity-buffer-note { justify-self: start; }
          .hour-analysis-capacity-row-header { align-items: flex-start; }
          .hour-analysis-capacity-bar { height: 52px; }
          .hour-analysis-capacity-fill { top: 24px; }
          .hour-analysis-capacity-hover-zone.is-expected { top: 16px; }
          .hour-analysis-capacity-delta-float { top: 8px; right: 8px; }
          .hour-analysis-capacity-standard { grid-template-columns: 1fr; }
          .hour-analysis-capacity-grid { grid-template-columns: 1fr; }
          .hour-analysis-card-header { align-items: flex-start; flex-direction: column; }
          .labor-model-role-color-grid { grid-template-columns: 1fr; }
          .labor-model-shell.is-page .labor-model-tabs {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            grid-auto-rows: minmax(38px, auto);
            overflow: visible;
          }
          .labor-model-shell.is-page .labor-model-tab-indicator { display: none; }
          .labor-model-summary-cards,
          .labor-model-summary-grid,
          .labor-model-summary-layout { grid-template-columns: 1fr; }
          .labor-model-day-header { align-items: flex-start; flex-direction: column; }
	        }
	      `}</style>
	      <div className="labor-module-header">
        <div className="labor-module-title">
          <I.GraduationCap />
          <span>Labor Management</span>
        </div>
        <div className="labor-header-action-slot">{headerAction}</div>
      </div>

      {visibleTabs.length > 0 && (
        <div
          className="labor-module-tabs"
          style={{
            "--labor-tab-count": visibleTabs.length,
            "--labor-active-index": activeLaborTabIndex,
          }}
        >
          <div className="labor-tab-indicator" aria-hidden="true" />
          {visibleTabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => changeLaborTab(t.id)}
              className={`labor-tab-button${displayLaborTab === t.id ? " is-active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: 60, color: C.textMut }}>Loading labor data...</div>}
      {!loading && visibleTabs.length === 0 && (
        <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
          You do not have permission to access Labor Management.
        </Card>
      )}

      <div
        key={buildLaborModulePanelKey({ tab, interviewView, attendanceView, capacityPlanningView })}
        className="labor-module-panel"
      >
      {!loading && tab === "home" && canUseLaborTab("home") && (
        <div>
          {savedRosterViews.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.surface, marginBottom: 12, flexWrap: "wrap", animation: "filterSlideIn 0.2s ease-out" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>Saved Views</span>
              <div style={{ width: 1, height: 16, background: C.border, margin: "0 2px" }} />
              {savedRosterViews.map((view, index) => (
                <div key={view.id} style={{ display: "inline-flex", alignItems: "center", gap: 2, animation: `filterChipIn 0.25s ease-out ${index * 0.05}s both` }}>
                  <button
                    onClick={() => loadRosterView(view)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${activeRosterViewId === view.id ? C.pri : C.borderLight}`,
                      background: activeRosterViewId === view.id ? C.pri : "#fff",
                      color: activeRosterViewId === view.id ? "#fff" : C.text,
                      fontSize: 11,
                      fontWeight: activeRosterViewId === view.id ? 700 : 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)",
                      boxShadow: activeRosterViewId === view.id ? "0 2px 8px rgba(20,83,45,0.2)" : "0 1px 3px rgba(0,0,0,0.04)",
                    }}
                  >
                    {view.name}
                    {activeRosterViewId === view.id && <span style={{ marginLeft: 4, fontSize: 9 }}>({Object.keys(view.filters || {}).length})</span>}
                  </button>
                  {isRosterFilterAdmin && (
                    <button onClick={() => deleteRosterView(view.id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: "2px", display: "flex" }} title="Delete view">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              ))}
              {activeRosterViewId && (
                <button
                  onClick={() => {
                    setActiveRosterViewId(null);
                    setRosterDraftFilters(DEFAULT_ROSTER_FILTERS);
                    setRosterFilters(DEFAULT_ROSTER_FILTERS);
                  }}
                  style={{ fontSize: 10, fontWeight: 600, color: C.dan, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", marginLeft: 4, opacity: 0.7 }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {showRosterFilterPanel && (
            <div style={{ marginBottom: 16, borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.bg, boxShadow: "0 8px 40px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", minHeight: 48 }}>
                {rosterUsedKeys.length === 0 && !showRosterFilterPicker && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", animation: "filterFadeIn 0.2s ease-out" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="1.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    <span style={{ fontSize: 13, color: C.textMut, fontWeight: 500 }}>No filters active</span>
                  </div>
                )}

                {rosterUsedKeys.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showRosterFilterPicker ? 12 : 0 }}>
                    {rosterUsedKeys.map((key, index) => {
                      const field = LABOR_ROSTER_FILTER_FIELDS.find((candidate) => candidate.key === key);
                      if (!field) return null;
                      const filter = rosterDraftFilters[key];
                      const isConfiguring = configuringRosterKey === key;
                      return (
                        <div key={key} style={{ animation: `filterChipIn 0.2s ease-out ${index * 0.04}s both` }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", boxShadow: isConfiguring ? "0 0 0 3px rgba(20,83,45,0.06)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.25s cubic-bezier(0.2,0.8,0.2,1)", overflow: "hidden" }}>
                            <button
                              onClick={() => {
                                setConfiguringRosterKey(isConfiguring ? null : key);
                                setShowRosterFilterPicker(false);
                              }}
                              style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}
                            >
                              {field.label}
                            </button>
                            <div style={{ padding: "6px 0", display: "flex", alignItems: "center" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: `${C.pri}12`, fontSize: 10, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}>
                                {LC_OP_LABELS[filter.op] || filter.op}
                              </span>
                            </div>
                            {rosterNeedsValue(filter.op) && filter.val !== "" && (
                              <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>{filter.val}</span>
                            )}
                            {rosterNeedsValue(filter.op) && filter.val === "" && (
                              <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 500, color: C.dan, fontStyle: "italic", whiteSpace: "nowrap" }}>set value</span>
                            )}
                            <button onClick={() => removeRosterFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>

                          {isConfiguring && (
                            <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,0.1)", animation: "configSlide 0.25s ease-out", overflow: "hidden" }}>
                              <div style={{ marginBottom: rosterNeedsValue(filter.op) ? 10 : 0 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Condition</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {field.ops.map((op, opIndex) => (
                                    <button
                                      key={op}
                                      onClick={() => {
                                        updateRosterFilter(key, "op", op);
                                        if (!rosterNeedsValue(op)) updateRosterFilter(key, "val", "");
                                      }}
                                      style={{
                                        padding: "5px 12px",
                                        borderRadius: 8,
                                        border: `1.5px solid ${filter.op === op ? C.pri : C.borderLight}`,
                                        background: filter.op === op ? C.pri : "#fff",
                                        color: filter.op === op ? "#fff" : C.text,
                                        fontSize: 11,
                                        fontWeight: filter.op === op ? 700 : 500,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)",
                                        animation: `filterFadeIn 0.2s ease-out ${opIndex * 0.03}s both`,
                                      }}
                                    >
                                      {LC_OP_LABELS[op] || op}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {rosterNeedsValue(filter.op) && (
                                <div style={{ animation: "filterFadeIn 0.2s ease-out 0.1s both" }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Value</div>
                                  {field.type === "select" ? (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {(field.options || []).map((option, optionIndex) => (
                                        <button
                                          key={option}
                                          onClick={() => updateRosterFilter(key, "val", option)}
                                          style={{
                                            padding: "5px 12px",
                                            borderRadius: 8,
                                            border: `1.5px solid ${filter.val === option ? C.pri : C.borderLight}`,
                                            background: filter.val === option ? C.pri : "#fff",
                                            color: filter.val === option ? "#fff" : C.text,
                                            fontSize: 11,
                                            fontWeight: filter.val === option ? 700 : 500,
                                            cursor: "pointer",
                                            fontFamily: "inherit",
                                            animation: `filterFadeIn 0.15s ease-out ${optionIndex * 0.03}s both`,
                                          }}
                                        >
                                          {option || "(none)"}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                      <input
                                        type={field.type === "date" ? (filter.op === "inLastDays" ? "number" : "date") : "text"}
                                        value={filter.val}
                                        onChange={(event) => updateRosterFilter(key, "val", event.target.value)}
                                        onKeyDown={(event) => { if (event.key === "Enter") confirmRosterConfig(); }}
                                        placeholder={filter.op === "inLastDays" ? "Number of days" : field.type === "date" ? "YYYY-MM-DD" : "Type a value..."}
                                        autoFocus
                                        style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff", color: C.text, width: "100%", maxWidth: 220, outline: "none" }}
                                      />
                                      <button onClick={confirmRosterConfig} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Done</button>
                                    </div>
                                  )}
                                </div>
                              )}
                              {!rosterNeedsValue(filter.op) && (
                                <button onClick={confirmRosterConfig} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: "filterFadeIn 0.2s ease-out" }}>Done</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!showRosterFilterPicker ? (
                  <div style={{ marginTop: rosterUsedKeys.length > 0 ? 8 : 0, animation: "filterFadeIn 0.2s ease-out" }}>
                    <button
                      onClick={() => {
                        setShowRosterFilterPicker(true);
                        setRosterFilterPickerReady(false);
                        setConfiguringRosterKey(null);
                        setTimeout(() => setRosterFilterPickerReady(true), 10);
                      }}
                      disabled={rosterAvailableFields.length === 0}
                      style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${rosterAvailableFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: rosterAvailableFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 700, cursor: rosterAvailableFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Filter
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: rosterUsedKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden", animation: "filterSlideIn 0.25s ease-out" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Choose a filter</span>
                      <button onClick={() => setShowRosterFilterPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div style={{ padding: "6px 0" }}>
                      {rosterFilterSections.map((section, sectionIndex) => {
                        const sectionFields = rosterAvailableFields.filter((field) => field.section === section);
                        if (sectionFields.length === 0) return null;
                        return (
                          <div key={section}>
                            <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6, animation: rosterFilterPickerReady ? `filterFadeIn 0.2s ease-out ${sectionIndex * 0.06}s both` : "none" }}>
                              {rosterSectionIcons[section] || null} {section}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                              {sectionFields.map((field, fieldIndex) => {
                                const delay = sectionIndex * 0.06 + fieldIndex * 0.03 + 0.05;
                                return (
                                  <button
                                    key={field.key}
                                    onClick={() => {
                                      selectRosterField(field.key);
                                      setShowRosterFilterPicker(false);
                                    }}
                                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)", animation: rosterFilterPickerReady ? `filterChipIn 0.25s ease-out ${delay}s both` : "none" }}
                                  >
                                    {field.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={applyRosterFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(20,83,45,0.2)" }}>
                    Apply{rosterUsedKeys.length > 0 ? ` (${rosterUsedKeys.length})` : ""}
                  </button>
                  {rosterUsedKeys.length > 0 && (
                    <button onClick={clearRosterFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear All
                    </button>
                  )}
                  <button onClick={() => { setShowRosterFilterPanel(false); setShowRosterFilterPicker(false); setConfiguringRosterKey(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                    Close
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isRosterFilterAdmin && !showSaveRosterView && rosterUsedKeys.length > 0 && (
                    <button onClick={() => setShowSaveRosterView(true)} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                      Save as View
                    </button>
                  )}
                  {showSaveRosterView && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, animation: "filterFadeIn 0.2s ease-out" }}>
                      <input
                        value={rosterViewName}
                        onChange={(event) => setRosterViewName(event.target.value)}
                        placeholder="View name..."
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveRosterView();
                          if (event.key === "Escape") setShowSaveRosterView(false);
                        }}
                        style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", width: 160, background: "#fff", color: C.text, outline: "none" }}
                      />
                      <button onClick={saveRosterView} disabled={!rosterViewName.trim()} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: rosterViewName.trim() ? C.suc : C.textMut, color: "#fff", fontSize: 11, fontWeight: 700, cursor: rosterViewName.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
                        Save
                      </button>
                      <button onClick={() => setShowSaveRosterView(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <SectionHeader title="Roster" count={sortedRosterRows.length}>
            <div className="labor-roster-action-bar">
              {canEditRoster && (
                <button
                  type="button"
                  className="labor-roster-action-button is-icon"
                  title="Labor settings"
                  aria-label="Labor settings"
                  onClick={() => setShowHierarchyManager(true)}
                >
                  <I.Settings />
                </button>
              )}
              <button
                type="button"
                className="labor-roster-action-button"
                onClick={() => handlePrintRoster()}
                disabled={generatingRosterPdf}
              >
                <I.Download />
                <span>{generatingRosterPdf ? "Generating PDF..." : "Roster PDF"}</span>
              </button>
              <LaborSortControl
                sort={rosterSort}
                defaultSort={LABOR_DEFAULT_SORT}
                columns={LABOR_ROSTER_SORT_COLUMNS}
                onChange={setRosterSort}
              />
              <button
                type="button"
                className={`labor-roster-action-button${showRosterFilterPanel || Object.keys(rosterFilters).length > 0 ? " is-active" : ""}`}
                onClick={() => setShowRosterFilterPanel((current) => !current)}
              >
                <I.Search />
                <span>
                Filter{Object.keys(rosterFilters).length > 0 ? ` (${Object.keys(rosterFilters).length})` : ""}
                </span>
              </button>
              <button
                type="button"
                className="labor-roster-action-button"
                onClick={handleDownloadActiveLaborContactCards}
                disabled={contactCardDownloadKey === "bulk" || activeContactCardEmployees.length === 0}
              >
                <I.FileText />
                <span>
                {contactCardDownloadKey === "bulk" ? "Downloading..." : "Download Active Contacts"}
                </span>
              </button>
	              {canEditRoster && (showInlineLaborEmployeeComposer ? (
                <button type="button" className="labor-roster-action-button" onClick={() => closeInlineLaborEmployeeComposer()}>
                  <I.X />
                  <span>Cancel Add</span>
                </button>
              ) : (
                <button type="button" className="labor-roster-action-button is-primary" onClick={openInlineLaborEmployeeComposer}>
                  <I.Plus />
                  <span>Add Employee</span>
                </button>
              ))}
            </div>
          </SectionHeader>
	          {sortedRosterRows.length === 0 && !showInlineLaborEmployeeComposer ? (
            <EmptyState icon="Users" title="No employees yet" subtitle="Add your first employee to start using labor management." />
          ) : (
	            <Card className="labor-roster-table-card" style={{ padding: 0, overflowX: "auto", overflowY: "hidden", marginBottom: 24 }}>
	              <table className="labor-roster-table">
	                <thead><tr>
		                  {[
		                    { key: "name", label: "Name" },
		                    { key: "position", label: "Position" },
		                    { key: "commitment", label: "Commitment" },
		                    { key: "phone", label: "Phone" },
		                    { key: "email", label: "Email" },
		                  ].map((column) => (
                    <th key={column.key} className="labor-roster-table-heading">
                      <button
                        type="button"
                        onClick={() => setRosterSort((current) => ({
                          key: column.key,
                          direction: current.key === column.key && current.direction === "asc" ? "desc" : "asc",
                        }))}
                        className={`labor-roster-header-button${rosterSort.key === column.key ? " is-active" : ""}`}
                      >
                        <span>{column.label}</span>
                        <span>
                          {rosterSort.key === column.key ? (rosterSort.direction === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
	                </tr></thead>
                <tbody>
                  {canEditRoster && showInlineLaborEmployeeComposer && (
                    <tr>
	                      <td colSpan={5} style={{ padding: 12, borderBottom: `1px solid ${C.borderLight}`, background: `${C.priLt}66` }}>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleCreateLaborEmployeeInline();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              closeInlineLaborEmployeeComposer();
                            }
                          }}
                          style={{
                            position: "relative",
                            overflow: "hidden",
                            borderRadius: 8,
                            border: `1px solid ${C.acc}55`,
                            background: "linear-gradient(135deg, rgba(132,204,22,0.14), rgba(20,83,45,0.08) 55%, rgba(255,255,255,0.92))",
                            boxShadow: "0 24px 50px rgba(20, 83, 45, 0.12)",
                            padding: "16px 16px 14px",
                            opacity: inlineLaborEmployeeComposerEntered ? 1 : 0,
                            transform: inlineLaborEmployeeComposerEntered ? "translateY(0) scale(1)" : "translateY(-18px) scale(0.985)",
                            filter: inlineLaborEmployeeComposerEntered ? "blur(0)" : "blur(4px)",
                            transition: `opacity ${INLINE_ROSTER_COMPOSER_TRANSITION_MS}ms ease, transform ${INLINE_ROSTER_COMPOSER_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), filter ${INLINE_ROSTER_COMPOSER_TRANSITION_MS}ms ease`,
                            animation: inlineLaborEmployeeComposerEntered ? "laborRosterComposerIn 380ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
                          }}
                        >
                          <div
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              inset: "-24% auto -24% -16%",
                              width: "34%",
                              background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.26), rgba(190,242,100,0.28), rgba(255,255,255,0.88), rgba(255,255,255,0))",
                              transform: "translate3d(-200%, 0, 0) skewX(-18deg)",
                              opacity: 0,
                              animation: inlineLaborEmployeeComposerEntered ? "laborRosterComposerSweep 1850ms cubic-bezier(0.22, 1, 0.36, 1) infinite" : "none",
                              willChange: "transform, opacity",
                              mixBlendMode: "screen",
                              filter: "blur(2px)",
                              pointerEvents: "none",
                            }}
                          />
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: C.pri }}>New roster row</div>
                              <div style={{ fontSize: 12, color: C.textMut }}>Start typing immediately. Tab moves left-to-right across the row.</div>
                            </div>
                            <div style={{ fontSize: 11, color: C.textMut, fontWeight: 700 }}>Esc to cancel · Enter to save</div>
                          </div>
	                          <div className="labor-roster-new-grid">
                            <label className="labor-roster-new-field is-first">
                              <span className="labor-roster-new-field-label">First Name</span>
                              <input
                                ref={firstRosterNameInputRef}
                                value={newRosterEmployeeFirstName}
                                onChange={(event) => setNewRosterEmployeeFirstName(event.target.value)}
                                placeholder="First name"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label className="labor-roster-new-field is-last">
                              <span className="labor-roster-new-field-label">Last Name</span>
                              <input
                                value={newRosterEmployeeLastName}
                                onChange={(event) => setNewRosterEmployeeLastName(event.target.value)}
                                placeholder="Last name"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label className="labor-roster-new-field is-phone">
                              <span className="labor-roster-new-field-label">Phone</span>
                              <input
                                type="tel"
                                value={fmtPhoneInput(newRosterEmployeePhone)}
                                onChange={(event) => setNewRosterEmployeePhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                                placeholder="(555) 123-4567"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label className="labor-roster-new-field is-email">
                              <span className="labor-roster-new-field-label">Email</span>
                              <input
                                type="email"
                                value={newRosterEmployeeEmail}
                                onChange={(event) => setNewRosterEmployeeEmail(event.target.value)}
                                placeholder="name@k9resorts.com"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
	                            <div className="labor-roster-new-field is-position">
                              <HourAnalysisAnimatedPicker
                                label="Position Title"
                                value={newRosterEmployeeRole}
                                onChange={setNewRosterEmployeeRole}
                                options={approvedLaborPositionOptions}
                                placeholder="Choose approved title"
                              />
	                            </div>
	                            <div className="labor-roster-new-field is-commitment">
	                              <span className="labor-roster-new-field-label">Commitment</span>
	                              <LaborCommitmentSegmentedPicker
	                                value={newRosterEmployeeCommitment}
	                                onChange={setNewRosterEmployeeCommitment}
	                              />
	                            </div>
	                            <label className="labor-roster-new-field is-start">
	                              <span className="labor-roster-new-field-label">Start Date</span>
                              <input
                                type="date"
                                value={newRosterEmployeeStartDate}
                                onChange={(event) => setNewRosterEmployeeStartDate(event.target.value)}
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <div className="labor-roster-new-actions">
                              <button
                                type="button"
                                onClick={() => closeInlineLaborEmployeeComposer()}
                                disabled={savingInlineLaborEmployee}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "10px 16px",
                                  borderRadius: 12,
                                  border: "none",
                                  background: "transparent",
                                  color: C.textSec,
                                  fontSize: 14,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                  cursor: savingInlineLaborEmployee ? "not-allowed" : "pointer",
                                  opacity: savingInlineLaborEmployee ? 0.5 : 1,
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={savingInlineLaborEmployee}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "10px 18px",
                                  borderRadius: 14,
                                  border: "none",
                                  background: C.pri,
                                  color: "#fff",
                                  fontSize: 14,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                  cursor: savingInlineLaborEmployee ? "not-allowed" : "pointer",
                                  opacity: savingInlineLaborEmployee ? 0.55 : 1,
                                  boxShadow: "0 14px 28px rgba(20, 83, 45, 0.18)",
                                }}
                              >
                                {savingInlineLaborEmployee ? "Saving..." : "Create Employee"}
                              </button>
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, color: C.textMut }}>
                            New employees start active. Phone and email appear directly in the roster.
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  {sortedRosterRows.map((row) => {
                    const rowEmployeeId = getLaborEmployeeRowId(row);
                    return (
	                      <tr
	                        key={rowEmployeeId || row.full_name || row.position_title}
	                        className={`labor-roster-row${rowEmployeeId === justCreatedLaborEmployeeId ? " is-new" : ""}`}
	                        role="button"
	                        tabIndex={rowEmployeeId ? 0 : -1}
	                        aria-label={`Open ${row.full_name || "employee"} record`}
	                        onClick={() => { if (rowEmployeeId) openLaborEmployeeProfile(rowEmployeeId, row); }}
	                        onKeyDown={(event) => {
	                          if (event.key === "Enter" || event.key === " ") {
	                            event.preventDefault();
	                            if (rowEmployeeId) openLaborEmployeeProfile(rowEmployeeId, row);
	                          }
	                        }}
	                        style={{
	                          animation: rowEmployeeId === justCreatedLaborEmployeeId ? "laborRosterFreshRow 1.8s ease-out" : "none",
	                          cursor: rowEmployeeId ? "pointer" : "default",
	                        }}
	                      >
		                        <td className="labor-roster-name-cell">
		                          <strong>{row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}</strong>
		                          {!row.is_active && row.end_date ? <small>Inactive since {formatLaborDate(row.end_date)}</small> : null}
		                        </td>
		                        <td className="labor-roster-secondary-cell">{formatLaborPositionTitle(row.position_title) || "—"}</td>
		                        <td className="labor-roster-secondary-cell is-commitment">
		                          <LaborCommitmentBadge value={row.employment_commitment} />
		                        </td>
		                        <td className={`labor-roster-secondary-cell is-nowrap${row.contact_phone ? "" : " is-empty"}`}>
		                          {row.contact_phone ? fmtPhoneInput(row.contact_phone) : "—"}
		                        </td>
                        <td
                          title={row.contact_email || ""}
                          className={`labor-roster-secondary-cell is-email${row.contact_email ? "" : " is-empty"}`}
                        >
                          {row.contact_email || "—"}
                        </td>
		                      </tr>
                    );
                  })}
                  {sortedRosterRows.length === 0 && showInlineLaborEmployeeComposer && (
                    <tr>
	                      <td colSpan={5} style={{ padding: "14px 16px", fontSize: 12, color: C.textMut }}>
                        Your first employee will land directly in the roster the moment you save this row.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {!loading && tab === "attendance" && canUseLaborTab("attendance") && (
        <div>
          <LaborViewSwitcher
            value={attendanceView}
            onChange={changeAttendanceView}
            options={[
              { id: "input", label: "Attendance Input", subtitle: "Attendance marks and policy actions" },
              { id: "summary", label: "Attendance Summary", subtitle: "Summary, history, and reference guidance" },
            ]}
          />

          <AttendanceTrackerPage
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
            params={{ tab: attendanceView === "input" ? "log" : "summary" }}
            embedded
            tabPreset={attendanceView}
            canLogAttendance={canLogAttendance}
            laborPositionOrder={positionHierarchyRows.map((row) => row.position_title)}
          />
        </div>
      )}

      {!loading && tab === "interviews" && canUseLaborTab("interviews") && (
        <div>
          {!interviewDetailOpen && (
            <LaborViewSwitcher
              value={interviewView}
              onChange={changeInterviewView}
              options={[
                { id: "records", label: "Interviews", subtitle: "Candidate records and interview review" },
                canManageInterviews ? { id: "config", label: "Configuration", subtitle: "Position guides, PDFs, and questions" } : null,
              ]}
            />
          )}
          <LaborInterviewsPage
            data={data}
            profile={profile}
            addGlobalToast={addGlobalToast}
            locationName={laborContactLocationName}
            embedded
            viewPreset={interviewView}
            recordIdPreset={routeLaborTab === "interviews" ? routeInterviewId : ""}
            canManage={canManageInterviews}
            onViewChange={changeInterviewView}
            onRecordChange={handleInterviewRecordRouteChange}
            onDetailChange={setInterviewDetailOpen}
          />
        </div>
      )}

      {!loading && tab === "performance-reviews" && canUseLaborTab("performance-reviews") && (
        <div>
          {supportBundleLoading && !supportBundleLoaded ? (
            <Card style={{ padding: 24, textAlign: "center", color: C.textMut, marginBottom: 16 }}>Loading performance reviews...</Card>
          ) : null}
          <SectionHeader title="Performance Reviews" count={activePerformanceReviewRows.length}>
            <LaborSortControl
              sort={performanceReviewSort}
              defaultSort={LABOR_DEFAULT_SORT}
              columns={LABOR_PERFORMANCE_REVIEW_SORT_COLUMNS}
              onChange={setPerformanceReviewSort}
            />
            <Btn variant="ghost" size="sm" icon={<I.RefreshCw />} onClick={() => refreshLaborData()}>Refresh</Btn>
          </SectionHeader>
          {activePerformanceReviewRows.length === 0 ? (
            <EmptyState icon="Users" title="No active employees" subtitle="Roster load required." />
          ) : (
            <>
              <div className="performance-review-queue-grid">
                {performanceReviewOverview.map((stat) => (
                  <div key={stat.label} className="performance-review-queue-stat">
                    <div style={{ fontSize: 10.5, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 7 }}>
                      {stat.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: stat.color }}>{stat.value}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.textMut }}>{stat.helper}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Card style={{ padding: 0, overflowX: "auto", overflowY: "hidden", marginBottom: 24, borderRadius: 8 }}>
                <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Employee</th>
                      <th style={tableHeaderStyle}>Position</th>
                      <th style={tableHeaderStyle}>Start Date</th>
                      <th style={tableHeaderStyle}>Performance Reviews</th>
                      {PERFORMANCE_REVIEW_CYCLES.map((cycle) => (
                        <th key={cycle.id} style={tableHeaderStyle}>{cycle.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPerformanceReviewRows.map((row) => {
                      const employeeId = getLaborEmployeeRowId(row);
                      return (
                        <tr key={employeeId || row.full_name} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                          <td style={{ ...rosterCellStyle, minWidth: 180 }}>
                            <button
                              type="button"
                              onClick={() => openLaborEmployeeProfile(employeeId, row, { recordTab: "reviews" })}
                              style={{ border: "none", background: "transparent", color: C.pri, padding: 0, fontFamily: "inherit", fontSize: 13, fontWeight: 900, cursor: "pointer", textAlign: "left" }}
                            >
                              {row.full_name || "Employee"}
                            </button>
                            <div style={{ fontSize: 11, color: C.textMut, marginTop: 3 }}>{row.contact_phone ? fmtPhoneInput(row.contact_phone) : row.contact_email || "No contact on file"}</div>
                          </td>
                          <td style={{ ...rosterSecondaryCellStyle, minWidth: 170 }}>{formatLaborPositionTitle(row.position_title) || "—"}</td>
                          <td style={{ ...rosterSecondaryCellStyle, whiteSpace: "nowrap" }}>{formatLaborDate(row.start_date)}</td>
                          <td style={{ ...rosterCellStyle, minWidth: 170 }}>
                            <Badge color={row.performance_review_compliance?.color || "default"}>
                              {row.performance_review_compliance?.label || "Needs setup"}
                            </Badge>
                            <div style={{ fontSize: 11, color: C.textMut, marginTop: 5 }}>{row.performance_review_compliance?.detail || "No review schedule"}</div>
                          </td>
                          {row.cycles.map((cycle) => {
                            const signature = isObjectRow(cycle.instance?.metadata?.signature) ? cycle.instance.metadata.signature : {};
                            return (
                              <td key={cycle.id} style={{ ...rosterCellStyle, minWidth: 150, verticalAlign: "top" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-start" }}>
                                  <Badge color={String(cycle.status) === "completed" ? "success" : String(cycle.status) === "overdue" || cycle.presentation?.tone === C.dan ? "danger" : "warning"}>
                                    {String(cycle.status || "not_started").replace(/_/g, " ")}
                                  </Badge>
                                  <div style={{ fontSize: 11, color: C.textMut, fontWeight: 700 }}>Due {cycle.dueDate ? formatLaborDate(cycle.dueDate) : "—"}</div>
                                  {signature.status && (
                                    <div style={{ fontSize: 11, color: signature.status === "completed" ? C.suc : C.warn, fontWeight: 800 }}>
                                      Signature {String(signature.status).replace(/_/g, " ")}
                                    </div>
                                  )}
                                  {cycle.instance ? (
                                    <Btn
                                      variant="secondary"
                                      size="sm"
                                      icon={<I.Eye />}
                                      onClick={() => {
                                        setSelectedLaborEmployeeId(employeeId);
                                        setSelectedLaborEmployeeSeed(row);
                                        setSelectedReviewInstanceId(cycle.instance.id);
                                      }}
                                    >
                                      Open
                                    </Btn>
                                  ) : (
                                    <Btn
                                      variant="ghost"
                                      size="sm"
                                      icon={<I.Plus />}
                                      onClick={() => handleCreateReviewInstanceForEmployee(row, cycle.id)}
                                      disabled={!row.template}
                                    >
                                      Start
                                    </Btn>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </div>
      )}

      {!loading && tab === "training" && canUseLaborTab("training") && (
        <div>
          <LaborViewSwitcher
            value={trainingView}
            onChange={setTrainingView}
            options={TRAINING_VIEW_OPTIONS}
          />
          {trainingBundleLoading && !trainingBundleLoaded ? (
            <Card style={{ padding: 24, textAlign: "center", color: C.textMut, marginBottom: 16 }}>Loading training records…</Card>
          ) : null}
          {trainingView === "board" && (
            <>
              {pctReadinessLoading && !pctReadinessLoaded ? (
                <Card style={{ padding: 24, textAlign: "center", color: C.textMut, marginBottom: 16 }}>Loading Team Readiness Board...</Card>
              ) : null}
              {pctReadinessError ? (
                <Card style={{ padding: 18, marginBottom: 16, borderColor: C.danLt, background: C.danLt }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.dan }}>{pctReadinessError}</div>
                  <Btn variant="secondary" size="sm" icon={<I.RefreshCw />} style={{ marginTop: 10 }} onClick={() => loadPctReadinessBoard(true)}>
                    Retry
                  </Btn>
                </Card>
              ) : null}

              {pctReadinessEmployeeBoardProfile ? (
                <Card style={{ padding: 0, overflow: "hidden", borderRadius: 8 }}>
                  <div style={{ padding: 18, borderBottom: `1px solid ${C.borderLight}`, background: `linear-gradient(135deg, ${C.priLt} 0%, #fff 76%)` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: 0, marginBottom: 5 }}>Single Trainee Readiness Board</div>
                        <div style={{ fontSize: 24, fontWeight: 950, color: C.text }}>{pctReadinessEmployeeBoardProfile.record.employee_full_name || "Employee"}</div>
                        <div style={{ fontSize: 12, color: C.textMut, fontWeight: 800, marginTop: 5 }}>
                          Start Date: {formatLaborDate(pctReadinessEmployeeBoardProfile.record.employee?.start_date || pctReadinessEmployeeBoardProfile.record.training_start_date) || "Not set"}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <div style={{ minWidth: 170 }}>
                          <ProgressBar percent={pctReadinessEmployeeBoardProfile.record.progress_percent} />
                          <div style={{ marginTop: 5, fontSize: 12, fontWeight: 900, color: C.textMut }}>{Math.round(safeTrainingProgress(pctReadinessEmployeeBoardProfile.record.progress_percent))}% ready</div>
                        </div>
                        <Btn
                          variant="secondary"
                          size="sm"
                          icon={<I.Eye />}
                          onClick={() => openLaborEmployeeProfile(
                            pctReadinessEmployeeBoardProfile.record.labor_employee_id,
                            pctReadinessEmployeeBoardProfile.record.employee || {
                              id: pctReadinessEmployeeBoardProfile.record.labor_employee_id,
                              full_name: pctReadinessEmployeeBoardProfile.record.employee_full_name,
                            },
                            { recordTab: "training" },
                          )}
                        >
                          View Profile
                        </Btn>
                        <Btn variant="ghost" size="sm" icon={<I.Back />} onClick={() => setSelectedPctReadinessRecordId("")}>Team Board</Btn>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
                      {pctReadinessEmployeeBoardProfile.categoryRows.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => jumpToPctReadinessSection(category.id)}
                          style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "#fff", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 7 }}>{category.title}</div>
                          <ProgressBar percent={category.percent} />
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 7, fontSize: 11, color: C.textMut, fontWeight: 800 }}>
                            <span>{category.percent}%</span>
                            {category.needsCoachingCount > 0 ? <span style={{ color: C.warn }}>{category.needsCoachingCount} coaching</span> : <span>{category.verifiedCount}/{category.total}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
                      <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.bg }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 8 }}>Open Gaps</div>
                        {pctReadinessEmployeeBoardProfile.gaps.length === 0 ? (
                          <div style={{ fontSize: 12, color: C.textMut }}>No active gaps.</div>
                        ) : pctReadinessEmployeeBoardProfile.gaps.slice(0, 10).map((row) => (
                          <div key={`single-gap-${row.item.id}`} style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45, marginTop: 7 }}>
                            <strong style={{ color: C.text }}>{row.section.title}:</strong> {row.item.label}
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.bg }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 8 }}>Coaching / Comments</div>
                        {pctReadinessEmployeeBoardProfile.coachingNotes.length === 0 ? (
                          <div style={{ fontSize: 12, color: C.textMut }}>No coaching comments.</div>
                        ) : pctReadinessEmployeeBoardProfile.coachingNotes.slice(0, 10).map((row) => (
                          <div key={`single-coach-${row.item.id}`} style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45, marginTop: 7 }}>
                            <strong style={{ color: C.text }}>{row.section.title}:</strong> {row.cell.latest_note || getPctReadinessStatusPresentation(row.status).label}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ maxHeight: "62vh", overflow: "auto", border: `1px solid ${C.borderLight}`, borderRadius: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={pctReadinessEmployeeBoardTableHeaderStyle}>Category</th>
                            <th style={pctReadinessEmployeeBoardTableHeaderStyle}>Task / Skill</th>
                            <th style={pctReadinessEmployeeBoardTableHeaderStyle}>Status</th>
                            <th style={pctReadinessEmployeeBoardTableHeaderStyle}>Actor / Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pctReadinessEmployeeBoardProfile.taskRows.map((row) => {
                            const presentation = getPctReadinessStatusPresentation(row.status);
                            const style = PCT_READINESS_STATUS_STYLES[presentation.value] || PCT_READINESS_STATUS_STYLES.not_started;
                            return (
                              <tr key={`single-${row.item.id}`} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                                <td style={{ padding: "11px 12px", fontSize: 12, color: C.text, fontWeight: 900, verticalAlign: "top", width: 170 }}>{row.section.title}</td>
                                <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec, lineHeight: 1.45, verticalAlign: "top" }}>{row.item.label}</td>
                                <td style={{ padding: "9px 12px", verticalAlign: "top", width: 190 }}>
                                  <button
                                    type="button"
                                    onClick={() => openPctReadinessCellEditor(pctReadinessEmployeeBoardProfile.record, row.item, row.section)}
                                    style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: "6px 9px", borderRadius: 8, border: `1px solid ${style.border}`, background: style.bg, color: style.text, fontSize: 11, fontWeight: 900, fontFamily: "inherit", cursor: "pointer" }}
                                  >
                                    {style.icon} {presentation.label}
                                  </button>
                                </td>
                                <td style={{ padding: "11px 12px", fontSize: 12, color: C.textMut, lineHeight: 1.45, verticalAlign: "top", width: 220 }}>
                                  {row.cell.latest_note || row.cell.verified_by || row.cell.demonstrated_by || "-"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              ) : (
              <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
                <MetricCard
                  label="Active Trainees"
                  value={pctReadinessBoard?.summary?.total_active_pct_trainees ?? pctReadinessRecords.length}
                  color={C.pri}
                />
                <MetricCard
                  label="Average Readiness"
                  value={`${Math.round(Number(pctReadinessBoard?.summary?.average_readiness || 0))}%`}
                  helper="Verified or waived tasks"
                  color={C.suc}
                />
                <MetricCard
                  label="Needs Coaching"
                  value={pctReadinessBoard?.summary?.needs_coaching_count ?? 0}
                  color={C.warn}
                />
                <button
                  type="button"
                  onClick={() => pctReadinessTopHotspot && jumpToPctReadinessSection(pctReadinessTopHotspot.sectionId, { filter: true })}
                  disabled={!pctReadinessTopHotspot}
                  style={{ border: "none", padding: 0, background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: pctReadinessTopHotspot ? "pointer" : "default" }}
                >
                  <MetricCard
                    label="Training Gap Hotspot"
                    value={pctReadinessTopHotspot ? `${pctReadinessTopHotspot.gapPercent}%` : "—"}
                    helper={pctReadinessTopHotspot ? `${pctReadinessTopHotspot.category} · ${pctReadinessTopHotspot.affectedTraineeCount} trainee${pctReadinessTopHotspot.affectedTraineeCount === 1 ? "" : "s"}` : "No active gaps"}
                    color={C.text}
                  />
                </button>
              </div>

              <Card style={{ padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 4 }}>Role / Template</div>
                    <CustomSelect
                      value="pct_team_readiness_board"
                      onChange={() => {}}
                      disabled
                      options={[{ value: "pct_team_readiness_board", label: "PCT Team Readiness Board" }]}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
                    <Btn
                      variant={showPctReadinessFilterPanel || pctReadinessFilterCount > 0 ? "secondary" : "ghost"}
                      size="sm"
                      icon={<I.Filter />}
                      onClick={() => {
                        setShowPctReadinessFilterPanel((current) => !current);
                        setPctReadinessFilterPickerReady(false);
                        window.setTimeout(() => setPctReadinessFilterPickerReady(true), 10);
                      }}
                    >
                      Filter{pctReadinessFilterCount > 0 ? ` (${pctReadinessFilterCount})` : ""}
                    </Btn>
                    <Btn variant="secondary" size="sm" icon={<I.Plus />} onClick={() => setShowPctReadinessNewRecord(true)}>Add Trainee</Btn>
                  </div>
                </div>
                {showPctReadinessFilterPanel && (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: C.surfaceHover, animation: "filterSlideIn 0.18s ease-out" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "end" }}>
                      <div style={{ animation: pctReadinessFilterPickerReady ? "filterChipIn 0.18s ease-out both" : "none" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 4 }}>Employee</div>
                        <CustomSelect
                          value={pctReadinessFilters.employee}
                          onChange={(value) => updatePctReadinessFilter("employee", value)}
                          options={pctReadinessEmployeeFilterOptions}
                          placeholder="All employees"
                          searchable
                        />
                      </div>
                      <div style={{ animation: pctReadinessFilterPickerReady ? "filterChipIn 0.2s ease-out 0.03s both" : "none" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 4 }}>Category</div>
                        <CustomSelect
                          value={pctReadinessFilters.category}
                          onChange={(value) => {
                            updatePctReadinessFilter("category", value);
                            if (value) jumpToPctReadinessSection(value);
                          }}
                          options={pctReadinessCategoryFilterOptions}
                          placeholder="All categories"
                          searchable
                        />
                      </div>
                      <div style={{ animation: pctReadinessFilterPickerReady ? "filterChipIn 0.22s ease-out 0.06s both" : "none" }}>
                        <Inp
                          label="Task or Category"
                          value={pctReadinessFilters.task}
                          onChange={(value) => updatePctReadinessFilter("task", value)}
                          placeholder="Search readiness tasks"
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                      <Inp label="Show gaps only" type="checkbox" value={pctReadinessFilters.showGapsOnly} onChange={(value) => updatePctReadinessFilter("showGapsOnly", value)} />
                      <Inp label="Show needs coaching" type="checkbox" value={pctReadinessFilters.showNeedsCoaching} onChange={(value) => updatePctReadinessFilter("showNeedsCoaching", value)} />
                      <Btn variant="ghost" size="sm" onClick={clearPctReadinessFilters}>Clear</Btn>
                      <span style={{ fontSize: 11, color: C.textMut, fontWeight: 700 }}>Board updates after saves and realtime changes.</span>
                    </div>
                  </div>
                )}
              </Card>

              {pctReadinessRecords.length === 0 && !pctReadinessLoading ? (
                <EmptyState icon="ClipboardCheck" title="No PCT readiness records yet" subtitle="Add a trainee to start the board." />
              ) : (
                <Card style={{ padding: 0, overflow: "hidden", borderRadius: 8, position: "relative" }}>
                  <div
                    aria-label="Category navigator"
                    style={{
                      position: "absolute",
                      top: 72,
                      right: 8,
                      bottom: 12,
                      zIndex: 8,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 5,
                      pointerEvents: "none",
                    }}
                  >
                    {filteredPctReadinessSections.map((section) => {
                      const selected = activePctReadinessSectionId === section.id || pctReadinessFilters.category === section.id;
                      const hovered = hoveredPctReadinessSectionId === section.id;
                      return (
                        <button
                          key={section.id}
                          type="button"
                          onMouseEnter={() => setHoveredPctReadinessSectionId(section.id)}
                          onMouseLeave={() => setHoveredPctReadinessSectionId("")}
                          onClick={() => jumpToPctReadinessSection(section.id)}
                          title={section.title}
                          aria-label={`Jump to ${section.title}`}
                          style={{
                            width: selected || hovered ? 72 : 34,
                            height: 6,
                            borderRadius: 999,
                            border: "none",
                            background: selected ? C.pri : hovered ? C.acc : "#CBD5E1",
                            cursor: "pointer",
                            pointerEvents: "auto",
                            transition: "width 160ms ease, background 160ms ease",
                            position: "relative",
                          }}
                        >
                          {hovered && (
                            <span style={{
                              position: "absolute",
                              right: 82,
                              top: "50%",
                              transform: "translateY(-50%)",
                              padding: "5px 8px",
                              borderRadius: 8,
                              background: C.text,
                              color: "#fff",
                              fontSize: 10.5,
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                              boxShadow: "0 6px 18px rgba(15,23,42,0.18)",
                            }}>
                              {section.title}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div ref={pctReadinessScrollRef} onScroll={handlePctReadinessMatrixScroll} style={{ overflow: "auto", maxHeight: "68vh", paddingRight: 42 }}>
                    <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead>
                        <tr>
                          <th
                            style={{
                              ...tableHeaderStyle,
                              position: "sticky",
                              left: 0,
                              top: 0,
                              zIndex: 4,
                              minWidth: 320,
                              background: "#fff",
                              boxShadow: `1px 0 0 ${C.border}`,
                            }}
                          >
                            Task / Skill
                          </th>
                          {filteredPctReadinessRecords.map((record) => (
                            <th
                              key={record.id}
                              style={{
                                ...tableHeaderStyle,
                                position: "sticky",
                                top: 0,
                                zIndex: 3,
                                minWidth: 156,
                                maxWidth: 180,
                                background: "#fff",
                                verticalAlign: "bottom",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedPctReadinessRecordId(record.id)}
                                style={{ border: "none", background: "transparent", padding: 0, color: C.pri, fontFamily: "inherit", fontSize: 12, fontWeight: 900, textAlign: "left", cursor: "pointer", lineHeight: 1.25 }}
                              >
                                {record.employee_full_name || "Employee"}
                              </button>
                              <div style={{ fontSize: 10.5, color: C.textMut, fontWeight: 700, marginTop: 4, textTransform: "none" }}>
                                {record.employee?.start_date ? `Start Date: ${formatLaborDate(record.employee.start_date)}` : "Start Date: Not set"}
                              </div>
                              <div style={{ marginTop: 6 }}>
                                <ProgressBar percent={record.progress_percent} />
                                <div style={{ fontSize: 10.5, color: C.textMut, marginTop: 3, fontWeight: 800 }}>{Math.round(safeTrainingProgress(record.progress_percent))}%</div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPctReadinessSections.map((section) => {
                          const collapsed = pctReadinessCollapsedSections[section.id] === true;
                          return (
                            <React.Fragment key={section.id}>
                              <tr data-pct-section-id={section.id}>
                                <td
                                  colSpan={filteredPctReadinessRecords.length + 1}
                                  style={{
                                    position: "sticky",
                                    left: 0,
                                    zIndex: 2,
                                    background: C.surfaceHover,
                                    borderBottom: `1px solid ${C.border}`,
                                    padding: 0,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setPctReadinessCollapsedSections((prev) => ({ ...prev, [section.id]: !collapsed }))}
                                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: "10px 12px", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}
                                  >
                                    <span style={{ display: "inline-flex", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}><I.ChevronDown /></span>
                                    <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{section.title}</span>
                                    <span style={{ fontSize: 11, color: C.textMut, fontWeight: 800 }}>{section.items.length} task{section.items.length === 1 ? "" : "s"}</span>
                                  </button>
                                </td>
                              </tr>
                              {!collapsed && section.items.map((item) => (
                                <tr key={item.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                                  <td
                                    style={{
                                      position: "sticky",
                                      left: 0,
                                      zIndex: 1,
                                      minWidth: 320,
                                      maxWidth: 420,
                                      background: "#fff",
                                      boxShadow: `1px 0 0 ${C.borderLight}`,
                                      padding: "10px 12px",
                                      fontSize: 12,
                                      fontWeight: 750,
                                      color: C.text,
                                      lineHeight: 1.45,
                                      verticalAlign: "top",
                                    }}
                                  >
                                    {item.label}
                                  </td>
                                  {filteredPctReadinessRecords.map((record) => {
                                    const cell = pctReadinessCells[`${record.id}:${item.id}`] || {};
                                    const presentation = getPctReadinessStatusPresentation(cell.readiness_status || cell.status);
                                    const statusStyle = PCT_READINESS_STATUS_STYLES[presentation.value] || PCT_READINESS_STATUS_STYLES.not_started;
                                    return (
                                      <td key={`${record.id}:${item.id}`} style={{ padding: 7, minWidth: 156, borderBottom: `1px solid ${C.borderLight}`, background: "#fff", verticalAlign: "top" }}>
                                        <button
                                          type="button"
                                          onClick={() => openPctReadinessCellEditor(record, item, section)}
                                          title={`${record.employee_full_name || "Employee"} - ${item.label}`}
                                          style={{
                                            width: "100%",
                                            minHeight: 54,
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "flex-start",
                                            justifyContent: "center",
                                            gap: 4,
                                            border: `1px solid ${statusStyle.border}`,
                                            borderRadius: 8,
                                            background: statusStyle.bg,
                                            color: statusStyle.text,
                                            fontFamily: "inherit",
                                            padding: "7px 8px",
                                            cursor: "pointer",
                                            textAlign: "left",
                                          }}
                                        >
                                          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 900, lineHeight: 1.1 }}>
                                            <span style={{ minWidth: 20 }}>{statusStyle.icon}</span>
                                            <span>{presentation.label}</span>
                                          </span>
                                          {(cell.latest_note || cell.demonstrated_by || cell.verified_by) && (
                                            <span style={{ fontSize: 10.5, color: statusStyle.text, opacity: 0.78, lineHeight: 1.25 }}>
                                              {cell.latest_note ? "Comment" : cell.verified_by || cell.demonstrated_by}
                                            </span>
                                          )}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {pctReadinessGapHotspots.length > 0 && (
                <Card style={{ padding: 16, marginTop: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: C.text, marginBottom: 10 }}>Gap Hotspots by Category</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    {pctReadinessGapHotspots.slice(0, 6).map((gap) => (
                      <button
                        key={gap.sectionId}
                        type="button"
                        onClick={() => jumpToPctReadinessSection(gap.sectionId, { filter: true })}
                        style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "#fff", textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 4 }}>{gap.category || "Category"}</div>
                        <div style={{ fontSize: 22, color: C.warn, fontWeight: 950, lineHeight: 1 }}>{gap.gapPercent}%</div>
                        <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800, marginTop: 8 }}>
                          {gap.gapCells}/{gap.totalCells} task cells need work · {gap.affectedTraineeCount} trainee{gap.affectedTraineeCount === 1 ? "" : "s"}
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              )}
              </>
              )}
            </>
          )}

          {trainingView === "records" && (
            <>
              <SectionHeader title="Active Training Records" count={activeRecords.length}>
                <LaborSortControl
                  sort={trainingSort}
                  defaultSort={LABOR_DEFAULT_SORT}
                  columns={LABOR_TRAINING_SORT_COLUMNS}
                  onChange={setTrainingSort}
                />
              </SectionHeader>
              {activeRecords.length === 0 ? (
                <EmptyState icon="GraduationCap" title="No active records" subtitle="Create a new training record to get started" />
              ) : (
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={tableHeaderStyle}>Employee</th>
                      <th style={tableHeaderStyle}>Position</th>
                      <th style={tableHeaderStyle}>Training Plan</th>
                      <th style={tableHeaderStyle}>Progress</th>
                      <th style={tableHeaderStyle}>Status</th>
                      <th style={tableHeaderStyle}>Target</th>
                    </tr></thead>
                    <tbody>{sortedActiveRecords.map(r => <RecordRow key={r.id} rec={r} />)}</tbody>
                  </table>
                </Card>
              )}
              <div style={{ height: 20 }} />
              <SectionHeader title="Completed Training Records" count={completedRecords.length}>
                <LaborSortControl
                  sort={trainingSort}
                  defaultSort={LABOR_DEFAULT_SORT}
                  columns={LABOR_TRAINING_SORT_COLUMNS}
                  onChange={setTrainingSort}
                />
              </SectionHeader>
              {completedRecords.length === 0 ? (
                <EmptyState icon="CheckCircle" title="No completed records" subtitle="Completed training records will appear here" />
              ) : (
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={tableHeaderStyle}>Employee</th>
                      <th style={tableHeaderStyle}>Position</th>
                      <th style={tableHeaderStyle}>Training Plan</th>
                      <th style={tableHeaderStyle}>Progress</th>
                      <th style={tableHeaderStyle}>Status</th>
                      <th style={tableHeaderStyle}>Target</th>
                    </tr></thead>
                    <tbody>{sortedCompletedRecords.map((record) => <RecordRow key={record.id} rec={record} />)}</tbody>
                  </table>
                </Card>
              )}
            </>
          )}

          {trainingView === "history" && (
            <Card style={{ padding: 0, overflow: "hidden", borderRadius: 8 }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>Training History</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: C.textMut, fontWeight: 700 }}>Create, update, import, link, and reconciliation events from training records.</div>
                </div>
                <Badge color={trainingHistoryRows.length > 0 ? "info" : "default"}>{trainingHistoryRows.length} events</Badge>
              </div>
              {trainingHistoryRows.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: C.textMut, fontSize: 13 }}>No training history has been logged yet.</div>
              ) : (
                <div style={{ maxHeight: "70vh", overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={tableHeaderStyle}>When</th>
                        <th style={tableHeaderStyle}>Employee</th>
                        <th style={tableHeaderStyle}>Action</th>
                        <th style={tableHeaderStyle}>Record / Task</th>
                        <th style={tableHeaderStyle}>Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainingHistoryRows.map((event) => (
                        <tr key={event.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                          <td style={{ ...rosterSecondaryCellStyle, whiteSpace: "nowrap" }}>{formatTrainingTimestamp(event.created_at)}</td>
                          <td style={{ ...rosterCellStyle, minWidth: 180 }}>{event.employeeName}</td>
                          <td style={{ ...rosterCellStyle, minWidth: 170 }}>{String(event.event_type || "training_event").replace(/_/g, " ")}</td>
                          <td style={{ ...rosterSecondaryCellStyle, minWidth: 260, lineHeight: 1.45 }}>{event.summary}</td>
                          <td style={{ ...rosterSecondaryCellStyle, whiteSpace: "nowrap" }}>{event.actor_name || "Staff"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {!loading && tab === "templates" && canUseLaborTab("templates") && !previewTemplateId && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "inactive", label: "Inactive" },
              ].map((option) => (
                <Btn
                  key={option.id}
                  variant={templateStatusFilter === option.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTemplateStatusFilter(option.id)}
                >
                  {option.label}
                </Btn>
              ))}
            </div>
            {canManageTemplates && (
              <Btn variant="primary" size="sm" onClick={() => setShowCreateTemplateModal(true)}>New Template</Btn>
            )}
          </div>
          {templateGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: 24 }}>
              <SectionHeader title={group.label} count={group.rows.length} />
              {group.rows.length === 0 ? (
                <EmptyState icon="FileText" title={`No ${group.label.toLowerCase()} yet`} subtitle="Templates will appear here." />
              ) : (
                <Card style={{ padding: 0, overflow: "hidden" }}>
	                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
	                    <thead><tr>
	                      <th style={tableHeaderStyle}>Name</th>
	                    </tr></thead>
	                    <tbody>
	                      {group.rows.map((row) => {
                        return (
                          <tr
                            key={`${row.kind}_${row.id}`}
                            onClick={() => openTemplatePreview(row.id, row.version?.id || null, row.kind)}
                            style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
	                          >
	                            <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: C.pri }}>
                                {row.name}
                                {row.is_active === false && <span style={{ marginLeft: 8, fontSize: 11, color: C.textMut, fontWeight: 700 }}>Inactive</span>}
                              </td>
	                          </tr>
	                        );
	                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "templates" && canUseLaborTab("templates") && previewTemplateId && previewTemplate && (
        <div>
          <button onClick={() => { setPreviewTemplateId(null); setPreviewTemplateVersionId(null); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
            <I.Back /> Back to Templates
          </button>

          <Card style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                {canManageTemplates && previewTemplate.version?.status === "draft" ? (
                  <input
                    defaultValue={previewTemplate.name}
                    onBlur={(event) => handleUpdateTemplateName(event.target.value)}
                    style={{ width: "100%", maxWidth: 420, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "inherit", marginBottom: 8 }}
                  />
	                ) : (
	                  <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>{previewTemplate.name}</div>
	                )}
	                {previewTemplate.version && (
	                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut }}>
	                    <span>Version {previewTemplate.version.version_no}</span>
	                    {previewTemplate.version.published_at && <span>Published: {formatTrainingTimestamp(previewTemplate.version.published_at)}</span>}
	                  </div>
	                )}
	              </div>
	              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
	                <div style={{ marginTop: 8, fontSize: 12, color: C.textMut }}>{(templateStats[previewTemplate.id] || {}).sectionCount || 0} sections — {(templateStats[previewTemplate.id] || {}).itemCount || 0} items</div>
	                {canManageTemplates && (
	                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={handleCreateTemplateDraft}
                      disabled={savingTemplateAction === "draft"}
                    >
	                      {savingTemplateAction === "draft" ? "Cloning..." : "New Draft"}
	                    </Btn>
	                    {previewTemplate.version?.status === "draft" && (
	                      <Btn
	                        variant="danger"
	                        size="sm"
	                        onClick={handleDeleteTemplateDraft}
	                        disabled={savingTemplateAction === "delete-draft"}
	                      >
	                        {savingTemplateAction === "delete-draft" ? "Deleting..." : "Delete Draft"}
	                      </Btn>
	                    )}
	                    {previewTemplate.version?.status === "draft" && (
	                      <Btn
	                        variant="primary"
                        size="sm"
                        onClick={handlePublishTemplateVersion}
                        disabled={savingTemplateAction === "publish"}
                      >
                        {savingTemplateAction === "publish" ? "Publishing..." : "Publish Draft"}
                      </Btn>
                    )}
                    {previewTemplate.version && previewTemplate.version.status !== "draft" && (
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={handleRestoreTemplateVersion}
                        disabled={savingTemplateAction === "restore"}
                      >
	                        {savingTemplateAction === "restore" ? "Restoring..." : "Restore To Draft"}
	                      </Btn>
	                    )}
	                    <Btn
	                      variant="ghost"
	                      size="sm"
	                      onClick={handleToggleTemplateActive}
	                      disabled={savingTemplateAction === "activate" || savingTemplateAction === "deactivate"}
	                    >
	                      {previewTemplate.is_active === false
	                        ? (savingTemplateAction === "activate" ? "Marking Active..." : "Mark Active")
	                        : (savingTemplateAction === "deactivate" ? "Marking Inactive..." : "Mark Inactive")}
	                    </Btn>
	                  </div>
	                )}
	              </div>
            </div>
          </Card>

          <Card style={{ padding: 16, marginBottom: 16 }}>
            <SectionHeader title="Version History" count={previewTemplateVersionHistory.length} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {previewTemplateVersionHistory.map((version) => {
                const selected = previewTemplate.version?.id === version.id;
                return (
                  <button
                    key={version.id}
                    onClick={() => setPreviewTemplateVersionId(version.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      borderRadius: 12,
                      border: selected ? `1.5px solid ${C.pri}` : `1px solid ${C.borderLight}`,
                      background: selected ? C.priLt : C.surface,
                      padding: "12px 14px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          v{version.version_no} {version.is_current ? "· Current" : ""}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                          {version.published_at
                            ? `Published ${formatTrainingTimestamp(version.published_at)}`
                            : `Created ${formatTrainingTimestamp(version.created_at)}`}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: version.status === "published" ? C.suc : version.status === "draft" ? C.warn : C.textMut }}>
                        {version.status}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

	          <SectionHeader title={previewTemplate.kind === "review" ? "Review Structure" : "Template Structure"} count={previewTemplate.sections.length}>
	            {canManageTemplates && previewTemplate.version?.status === "draft" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn variant={templateManageStructure ? "secondary" : "ghost"} size="sm" onClick={() => setTemplateManageStructure((current) => !current)}>
                    {templateManageStructure ? "Done Managing" : "Manage Structure"}
                  </Btn>
	                <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateSection(null)}>Add Section</Btn>
                </div>
	            )}
	          </SectionHeader>
	          {previewTemplate.kind === "review" ? previewTemplate.sections.map((sec) => {
	            const isOpen = templateManageStructure || expandedSections[`review_${sec.id}`];
            const isDraft = canManageTemplates && previewTemplate.version?.status === "draft";
            return (
              <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => toggleSection(`review_${sec.id}`)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}><I.ChevronRight /></span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{sec.title}</div>
                      {sec.instructions && <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>{sec.instructions}</div>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMut }}>{sec.items.length} prompt{sec.items.length !== 1 ? "s" : ""}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {isDraft && (
                      <Card style={{ padding: 12, marginTop: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <input
                            defaultValue={sec.title}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value && value !== sec.title) {
                                handleUpdateTemplateSection(sec.id, { title: value });
                              }
                            }}
                            placeholder="Section title"
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                          />
                          <textarea
                            defaultValue={sec.instructions || ""}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value !== (sec.instructions || "")) {
                                handleUpdateTemplateSection(sec.id, { instructions: value || null });
                              }
                            }}
                            placeholder="Section description"
                            rows={2}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                          />
	                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, -1)}>Move Up</Btn>
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, 1)}>Move Down</Btn>
	                            <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateItem(sec.id)}>Add Prompt</Btn>
	                            <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateSection(sec.id)}>Delete Section</Btn>
	                          </div>
                        </div>
                      </Card>
                    )}
                    <div style={{ marginTop: 12 }}>
                      {sec.items.map((item) => renderTemplatePreviewItem(item, isDraft))}
                    </div>
                  </div>
                )}
              </Card>
            );
	          }) : previewTemplate.sections.map(sec => {
	            const isOpen = templateManageStructure || expandedSections[`tpl_${sec.id}`];
            const totalItems = sec.children.reduce((sum, c) => sum + c.items.length, 0) + sec.directItems.length;
            const isDraft = canManageTemplates && previewTemplate.version?.status === "draft";
            return (
              <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
                <button onClick={() => toggleSection(`tpl_${sec.id}`)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}><I.ChevronRight /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.title}</div>
                      {(sec.day_number || sec.time_block_start) && <div style={{ fontSize: 11, color: C.textMut }}>
                        {formatTrainingTimeRange(sec.time_block_start, sec.time_block_end) || `Day ${sec.day_number}`}
                      </div>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600, flexShrink: 0 }}>
                    {sec.children.length > 0 ? `${sec.children.length} module${sec.children.length !== 1 ? "s" : ""}` : ""}{sec.children.length > 0 && totalItems > 0 ? " — " : ""}{totalItems > 0 ? `${totalItems} item${totalItems !== 1 ? "s" : ""}` : ""}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {isDraft && (
                      <Card style={{ padding: 12, marginTop: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <input
                            defaultValue={sec.title}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value && value !== sec.title) {
                                handleUpdateTemplateSection(sec.id, { title: value });
                              }
                            }}
                            placeholder="Section title"
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                          />
                          <textarea
                            defaultValue={sec.instructions || ""}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value !== (sec.instructions || "")) {
                                handleUpdateTemplateSection(sec.id, { instructions: value || null });
                              }
                            }}
                            placeholder="Section description"
                            rows={2}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                          />
	                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, -1)}>Move Up</Btn>
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, 1)}>Move Down</Btn>
	                            <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateSection(sec.id)}>Add Module</Btn>
	                            <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateItem(sec.id)}>Add Task</Btn>
	                            <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateSection(sec.id)}>Delete Section</Btn>
                          </div>
                        </div>
                      </Card>
                    )}
                    {sec.children.map(child => (
                      <div key={child.id} style={{ marginTop: 12 }}>
                        {isDraft ? (
                          <Card style={{ padding: 12, background: C.surface, border: `1px solid ${C.borderLight}` }}>
                            <div style={{ display: "grid", gap: 10 }}>
                              <input
                                defaultValue={child.title}
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value && value !== child.title) {
                                    handleUpdateTemplateSection(child.id, { title: value });
                                  }
                                }}
                                placeholder="Module title"
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.pri }}
                              />
                              <textarea
                                defaultValue={child.instructions || ""}
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value !== (child.instructions || "")) {
                                    handleUpdateTemplateSection(child.id, { instructions: value || null });
                                  }
                                }}
                                placeholder="Module description"
                                rows={2}
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                              />
	                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
	                                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(child.id, -1)}>Move Up</Btn>
	                                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(child.id, 1)}>Move Down</Btn>
	                                <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateItem(child.id)}>Add Task</Btn>
	                                <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateSection(child.id)}>Delete Module</Btn>
	                              </div>
                              {child.items.map((item) => renderTemplatePreviewItem(item, true))}
                            </div>
                          </Card>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{child.title}</div>
                            {child.items.map((item) => renderTemplatePreviewItem(item))}
                          </>
                        )}
                      </div>
                    ))}
                    {sec.directItems.map(item => renderTemplatePreviewItem(item, isDraft))}
                    {!isDraft && sec.instructions && <div style={{ marginTop: 8, fontSize: 11, color: C.textMut, fontStyle: "italic" }}>{sec.instructions}</div>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && tab === "notes" && canUseLaborTab("notes") && (
        <div>
          {supportBundleLoading && !supportBundleLoaded ? (
            <Card style={{ padding: 24, textAlign: "center", color: C.textMut, marginBottom: 16 }}>Loading employee notes…</Card>
          ) : null}
          <SectionHeader title="Global Notes Feed" count={filteredGlobalNotes.length}>
            {canAccessEmployeeNotes && <Btn variant="secondary" size="sm" onClick={() => setShowGlobalNoteModal(true)}>Add Employee Note</Btn>}
          </SectionHeader>
	          <Card style={{ padding: 16, marginBottom: 16 }}>
	            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
	              <Inp
	                label="Search Notes"
	                value={noteSearchText}
	                onChange={setNoteSearchText}
	                placeholder="Search note text, employee, author, source"
	              />
	              <Inp
	                label="Employee"
                type="select"
                value={noteFilterEmployeeId}
                onChange={setNoteFilterEmployeeId}
                options={[{ value: "", label: "All employees" }, ...globalNoteEmployeeOptions]}
              />
              <Inp
                label="Source"
                type="select"
                value={noteFilterSource}
                onChange={setNoteFilterSource}
                options={[
                  { value: "all", label: "All sources" },
                  { value: "labor", label: "Employee Notes" },
                  { value: "training", label: "Training Notes" },
                ]}
              />
              <Inp
                label="Note Type"
                type="select"
                value={noteFilterType}
                onChange={setNoteFilterType}
                options={[
                  { value: "all", label: "All note types" },
                  ...LABOR_NOTE_TYPE_OPTIONS,
                  { value: "record_note", label: "Record Notes" },
                  { value: "task_observation", label: "Task Observations" },
                ]}
              />
              <Inp
                label="Date Range"
                type="select"
                value={noteFilterDateRange}
                onChange={setNoteFilterDateRange}
                options={[
                  { value: "all", label: "All time" },
                  { value: "7d", label: "Last 7 days" },
                  { value: "30d", label: "Last 30 days" },
                  { value: "90d", label: "Last 90 days" },
                ]}
              />
            </div>
          </Card>

          {filteredGlobalNotes.length === 0 ? (
            <EmptyState icon="FileText" title="No notes match these filters" subtitle="Employee notes and task observations will appear here." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredGlobalNotes.map((note) => (
                <Card key={note.id} style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{note.employeeName}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                        <Badge color="default">{note.sourceModule}</Badge>
                        <Badge color="default">{String(note.noteType).replace(/_/g, " ")}</Badge>
                        <span style={{ fontSize: 11, color: C.textMut }}>{note.sourceLabel}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{note.createdByName}</div>
                      <div style={{ fontSize: 11, color: C.textMut }}>{formatTrainingTimestamp(note.createdAt)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>{note.noteText}</div>
                  {toObjectRows(note.documents || []).length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {toObjectRows(note.documents || []).map((document) => renderEmployeeDocumentButton(document))}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <Btn variant="ghost" size="sm" onClick={() => openLaborEmployeeProfile(note.employeeId)}>Open Employee</Btn>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && tab === "hour-analysis" && canUseLaborTab("hour-analysis") && (
        <div className="capacity-planning-page">
          <LaborViewSwitcher
            value={capacityPlanningView}
            onChange={changeCapacityPlanningView}
            options={CAPACITY_PLANNING_VIEWS}
          />
          {capacityPlanningView === "staffing-capacity" && (
        <div className="hour-analysis-shell">
          <div className="hour-analysis-card">
            <div className="hour-analysis-card-header">
              <div>
                <h3 className="hour-analysis-card-title">Staffing Capacity Variance</h3>
              </div>
            </div>
            <div className="hour-analysis-capacity-dashboard">
              <div className={`hour-analysis-capacity-total is-${hourAnalysisCapacityDelta.tone}`}>
                <strong>{hourAnalysisCapacityDelta.value}</strong>
              </div>
              <div className="hour-analysis-capacity-buffer-note">
                CSR/PCT: 15%-25% range
              </div>
            </div>
            <div className={`hour-analysis-capacity-visual${hourAnalysisChangedKeys.has("capacity") ? " is-recent-change" : ""}`}>
              {hourAnalysisCapacityLayoutColumns.map((columnRows, columnIndex) => (
                <div className="hour-analysis-capacity-column" key={columnIndex === 0 ? "leadership" : "frontline"}>
                  {columnRows.map((row) => {
                    const visual = buildHourAnalysisCapacityRowVisualModel(row);
                    const rowIndex = hourAnalysisCapacityRows.findIndex((item) => item.key === row.key);
                    const expectedHover = {
                      rowKey: row.key,
                      label: "Expected",
                      value: `${formatHourAnalysisHours(visual.expected)} hrs`,
                      caption: "planned weekly hours",
                      tone: visual.delta.tone,
                    };
                    const floorHover = {
                      rowKey: row.key,
                      label: "Operational floor",
                      value: `${formatHourAnalysisHours(visual.floor)} hrs`,
                      caption: "minimum weekly coverage",
                      tone: "floor",
                    };
                    const targetLowHover = {
                      rowKey: row.key,
                      label: "Lower bound",
                      value: `${formatHourAnalysisHours(visual.targetLow)} hrs`,
                      caption: `${HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT}% above floor`,
                      tone: "target",
                    };
                    const targetHighHover = {
                      rowKey: row.key,
                      label: "Upper bound",
                      value: `${formatHourAnalysisHours(visual.targetHigh)} hrs`,
                      caption: `${HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT}% above floor`,
                      tone: "target",
                    };
                    const activeHover = hourAnalysisCapacityHover?.rowKey === row.key ? hourAnalysisCapacityHover : null;
                    return (
                      <div
                        key={row.key}
                        className={`hour-analysis-capacity-row is-${visual.tone}`}
                        tabIndex={0}
                        onPointerLeave={clearHourAnalysisCapacityHover}
                        onBlur={clearHourAnalysisCapacityHover}
                        style={{ "--capacity-row-delay": `${Math.max(0, rowIndex) * 48}ms` }}
                      >
                        <div className="hour-analysis-capacity-row-header">
                          <div className="hour-analysis-capacity-role">
                            <strong>{visual.roleLabel}</strong>
                          </div>
                        </div>
                        <div
                          className="hour-analysis-capacity-bar"
                          aria-label={`${visual.roleLabel} expected ${formatHourAnalysisHours(visual.expected)} hours, floor ${formatHourAnalysisHours(visual.floor)} hours, ${visual.isFrontline ? `target range ${formatHourAnalysisHours(visual.targetLow)} to ${formatHourAnalysisHours(visual.targetHigh)} hours` : `target ${formatHourAnalysisHours(visual.target)} hours`}, variance ${visual.delta.value}`}
                        >
                          {visual.isFrontline && (
                            <div
                              className="hour-analysis-capacity-buffer"
                              style={{ left: `${visual.bufferLeftPct}%`, width: `${visual.bufferWidthPct}%` }}
                            />
                          )}
                          <div className="hour-analysis-capacity-fill" style={{ width: `${visual.expectedPct}%` }} />
                          <div className="hour-analysis-capacity-marker is-floor" style={{ left: `${visual.floorPct}%` }} />
                          {visual.isFrontline && (
                            <>
                              <div className="hour-analysis-capacity-marker is-target" style={{ left: `${visual.targetLowPct}%` }} />
                              <div className="hour-analysis-capacity-marker is-target" style={{ left: `${visual.targetHighPct}%` }} />
                            </>
                          )}
                          <div
                            className="hour-analysis-capacity-hover-zone is-expected"
                            style={{ width: `${visual.expectedPct}%` }}
                            onPointerEnter={(event) => updateHourAnalysisCapacityHover(event, expectedHover)}
                            onPointerMove={(event) => updateHourAnalysisCapacityHover(event, expectedHover)}
                            aria-hidden="true"
                          />
                          <div
                            className="hour-analysis-capacity-hover-zone is-marker is-floor"
                            style={{ left: `${visual.floorPct}%` }}
                            onPointerEnter={(event) => updateHourAnalysisCapacityHover(event, floorHover)}
                            onPointerMove={(event) => updateHourAnalysisCapacityHover(event, floorHover)}
                            aria-hidden="true"
                          />
                          {visual.isFrontline && (
                            <>
                              <div
                                className="hour-analysis-capacity-hover-zone is-marker is-target"
                                style={{ left: `${visual.targetLowPct}%` }}
                                onPointerEnter={(event) => updateHourAnalysisCapacityHover(event, targetLowHover)}
                                onPointerMove={(event) => updateHourAnalysisCapacityHover(event, targetLowHover)}
                                aria-hidden="true"
                              />
                              <div
                                className="hour-analysis-capacity-hover-zone is-marker is-target"
                                style={{ left: `${visual.targetHighPct}%` }}
                                onPointerEnter={(event) => updateHourAnalysisCapacityHover(event, targetHighHover)}
                                onPointerMove={(event) => updateHourAnalysisCapacityHover(event, targetHighHover)}
                                aria-hidden="true"
                              />
                            </>
                          )}
                          <span className={`hour-analysis-capacity-delta-float is-${visual.delta.tone}`}>
                            {visual.delta.value}
                          </span>
                          {activeHover && (
                            <span
                              className={`hour-analysis-capacity-cursor-tooltip is-${activeHover.tone}`}
                              style={{ left: `${activeHover.x}px`, top: `${activeHover.y}px` }}
                            >
                              <span>{activeHover.label} {activeHover.value}</span>
                              {activeHover.caption ? <small>{activeHover.caption}</small> : null}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="hour-analysis-card">
            <div className="hour-analysis-card-header">
              <div>
                <h3 className="hour-analysis-card-title">Headcount & Expected Hours</h3>
                <div className="hour-analysis-card-subtitle">Active roster and planning rows by role and commitment.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {hourAnalysisModel.whatIfRows.length > 0 && (
                  <span className="hour-analysis-what-if-tag">WHAT IF {hourAnalysisModel.whatIfRows.length}</span>
                )}
                {!canEditRoster && <span className="hour-analysis-status-pill" style={{ background: "#f8fafc", borderColor: C.border, color: C.textMut }}>Read Only</span>}
              </div>
            </div>
            <div className="hour-analysis-roster-summary">
              <div className="hour-analysis-roster-summary-item is-primary">
                <div className="hour-analysis-summary-label">Total Headcount</div>
                <div className="hour-analysis-summary-value">{hourAnalysisModel.totals.projectedHeadcount}</div>
                <div className="hour-analysis-summary-note">
                  {hourAnalysisModel.headcountTotals.total} roster
                  {hourAnalysisModel.headcountTotals.whatIfTotal ? ` + ${hourAnalysisModel.headcountTotals.whatIfTotal} what-if` : ""}
                  {" "}employees
                </div>
              </div>
              <div className="hour-analysis-roster-summary-item">
                <div className="hour-analysis-summary-label">Full-Time</div>
                <div className="hour-analysis-summary-value">{hourAnalysisModel.totals.projectedFullTimeHeadcount}</div>
                <div className="hour-analysis-summary-note">
                  {hourAnalysisModel.headcountTotals.fullTime} roster
                  {hourAnalysisModel.headcountTotals.whatIfFullTime ? ` + ${hourAnalysisModel.headcountTotals.whatIfFullTime} what-if` : ""}
                </div>
              </div>
              <div className="hour-analysis-roster-summary-item">
                <div className="hour-analysis-summary-label">Part-Time</div>
                <div className="hour-analysis-summary-value">{hourAnalysisModel.totals.projectedPartTimeHeadcount}</div>
                <div className="hour-analysis-summary-note">
                  {hourAnalysisModel.headcountTotals.partTime} roster
                  {hourAnalysisModel.headcountTotals.whatIfPartTime ? ` + ${hourAnalysisModel.headcountTotals.whatIfPartTime} what-if` : ""}
                </div>
              </div>
              <div className="hour-analysis-roster-summary-item">
                <div className="hour-analysis-summary-label">Expected Hours</div>
                <div className="hour-analysis-summary-value">{formatHourAnalysisHours(hourAnalysisModel.totals.projectedExpected)}</div>
                <div className="hour-analysis-summary-note">hrs / wk after what-if scenarios</div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="hour-analysis-table hour-analysis-planning-table">
                <colgroup>
                  <col className="hour-analysis-col-position" />
                  <col className="hour-analysis-col-total" />
                  <col className="hour-analysis-col-count" />
                  <col className="hour-analysis-col-hours" />
                  <col className="hour-analysis-col-count" />
                  <col className="hour-analysis-col-hours" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="hour-analysis-sticky-heading" rowSpan={2}>Position</th>
                    <th className="hour-analysis-sticky-heading" rowSpan={2} style={{ textAlign: "center" }}>Total Headcount</th>
                    <th className="hour-analysis-group-heading" colSpan={2}>Full-Time</th>
                    <th className="hour-analysis-group-heading" colSpan={2}>Part-Time</th>
                  </tr>
                  <tr>
                    <th className="hour-analysis-sub-heading">Headcount</th>
                    <th className="hour-analysis-sub-heading">Expected Hours</th>
                    <th className="hour-analysis-sub-heading">Headcount</th>
                    <th className="hour-analysis-sub-heading">Expected Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {hourAnalysisGroups.map((group) => {
                    const headcount = hourAnalysisModel.headcountRows.find((row) => row.key === group.key) || {};
                    const expectation = hourAnalysisSettings.expectations[group.key] || DEFAULT_HOUR_ANALYSIS_EXPECTATIONS[group.key] || {};
                    return (
                      <tr key={group.key}>
                        <td>{group.label}</td>
                        <td className="hour-analysis-count-cell">
                          {renderHourAnalysisHeadcount(headcount.total || 0, headcount.whatIfTotal || 0)}
                        </td>
                        <td className="hour-analysis-count-cell">
                          {renderHourAnalysisHeadcount(headcount.fullTime || 0, headcount.whatIfFullTime || 0)}
                        </td>
                        <td className="hour-analysis-hours-cell">
                          <HourAnalysisNumberInput
                            value={expectation.full_time?.expected ?? 0}
                            disabled={!canEditRoster}
                            onCommit={(nextValue) => updateHourExpectation(group.key, "full_time", "expected", nextValue)}
                            ariaLabel={`${group.label} full-time expected weekly hours`}
                          />
                        </td>
                        <td className="hour-analysis-count-cell">
                          {renderHourAnalysisHeadcount(headcount.partTime || 0, headcount.whatIfPartTime || 0)}
                        </td>
                        <td className="hour-analysis-hours-cell">
                          <HourAnalysisNumberInput
                            value={expectation.part_time?.expected ?? 0}
                            disabled={!canEditRoster}
                            onCommit={(nextValue) => updateHourExpectation(group.key, "part_time", "expected", nextValue)}
                            ariaLabel={`${group.label} part-time expected weekly hours`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ fontWeight: 950 }}>Total</td>
                    <td className="hour-analysis-count-cell">
                      {renderHourAnalysisHeadcount(hourAnalysisModel.headcountTotals.total, hourAnalysisModel.headcountTotals.whatIfTotal)}
                    </td>
                    <td className="hour-analysis-count-cell">
                      {renderHourAnalysisHeadcount(hourAnalysisModel.headcountTotals.fullTime, hourAnalysisModel.headcountTotals.whatIfFullTime)}
                    </td>
                    <td className="hour-analysis-hours-cell">
                      {formatHourAnalysisHours(hourAnalysisModel.totals.projectedFullTimeRange?.expected ?? 0)}
                    </td>
                    <td className="hour-analysis-count-cell">
                      {renderHourAnalysisHeadcount(hourAnalysisModel.headcountTotals.partTime, hourAnalysisModel.headcountTotals.whatIfPartTime)}
                    </td>
                    <td className="hour-analysis-hours-cell">
                      {formatHourAnalysisHours(hourAnalysisModel.totals.projectedPartTimeRange?.expected ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="hour-analysis-card">
            <div className="hour-analysis-card-header">
              <div>
                <h3 className="hour-analysis-card-title">Expected Hours By Person</h3>
                <div className="hour-analysis-card-subtitle">Click a position to model a role movement. Override hours only when a person differs from the default.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <LaborSortControl
                  sort={hourAnalysisPersonSort}
                  defaultSort={LABOR_DEFAULT_SORT}
                  columns={LABOR_HOUR_PERSON_SORT_COLUMNS}
                  onChange={setHourAnalysisPersonSort}
                />
                <span className="hour-analysis-status-pill" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
                  {hourAnalysisModel.rows.length} rows
                </span>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="hour-analysis-table" style={{ minWidth: 1120 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Commitment</th>
                    <th style={{ textAlign: "right" }}>Expected Hours</th>
                    <th>Coverage Split</th>
                    <th>Justification</th>
                    <th style={{ width: 92 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHourAnalysisRows.map((row) => {
                    const rowKey = row.employeeKey || row.id || row.full_name;
                    return (
                      <tr key={rowKey} className={`hour-analysis-person-row${row.isWhatIf ? " is-what-if" : ""}${row.isMovement ? " is-movement" : ""}${hourAnalysisChangedKeys.has(`row:${rowKey}`) ? " is-recent-change" : ""}`}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 950 }}>{row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}</span>
                            {row.isWhatIf && <span className="hour-analysis-what-if-tag">WHAT IF</span>}
                            {row.isMovement && <span className="hour-analysis-move-tag">MOVE</span>}
                            {row.isSplit && <span className="hour-analysis-status-pill" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>Split</span>}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 10.5, color: C.textMut, fontWeight: 800 }}>
                            {row.isMovement ? `${row.sourceGroupLabel} -> ${row.groupLabel}` : row.groupLabel}
                            {row.sourceMissing ? " · source not active" : ""}
                          </div>
                        </td>
                        <td style={{ color: row.position_title ? C.textSec : C.textMut }}>
                          {row.isWhatIf ? (
                            row.isMovement ? (
                              <span className="hour-analysis-position-display is-static">
                                <span className="hour-analysis-position-original">{formatLaborPositionTitle(row.sourcePositionTitle) || "Current role"}</span>
                                <span className="hour-analysis-arrow">→</span>
                                <span>{formatLaborPositionTitle(row.position_title) || "Target role"}</span>
                              </span>
                            ) : (
                              formatLaborPositionTitle(row.position_title) || "—"
                            )
                          ) : (
                            <HourAnalysisPositionMoveControl
                              row={row}
                              options={hourAnalysisPositionOptions}
                              disabled={!canEditRoster}
                              onChange={(nextPositionTitle) => updateHourAnalysisPositionMovement(row, nextPositionTitle)}
                            />
                          )}
                        </td>
                        <td><LaborCommitmentBadge value={row.employment_commitment} /></td>
                        <td style={{ textAlign: "right" }}>
                          <div className="hour-analysis-preferred-cell" style={{ justifyContent: "flex-end" }}>
                            {row.isOverride ? (
                              <>
                                <span className="hour-analysis-inherited-hours is-overridden">{formatHourAnalysisHours(row.inheritedHours || 0)}</span>
                                <span className="hour-analysis-arrow">→</span>
                                <HourAnalysisNumberInput
                                  value={row.preferredHours || 0}
                                  disabled={!canEditRoster}
                                  onCommit={(nextValue) => (
                                    row.isWhatIf
                                      ? updateHourAnalysisWhatIfOverride(row.id, "expected", nextValue)
                                      : setHourAnalysisEmployeeOverride(row.employeeKey, "expected", nextValue)
                                  )}
                                  ariaLabel={`${row.full_name || "Employee"} expected weekly hours override`}
                                />
                                {canEditRoster && (
                                  <button
                                    type="button"
                                    className="hour-analysis-mini-button"
                                    onClick={() => (
                                      row.isWhatIf
                                        ? clearHourAnalysisWhatIfOverride(row.id, "expected")
                                        : clearHourAnalysisEmployeeOverride(row.employeeKey, "expected")
                                    )}
                                  >
                                    Inherit
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="hour-analysis-inherited-hours">{formatHourAnalysisHours(row.inheritedHours || 0)}</span>
                                {canEditRoster && (
                                  <button
                                    type="button"
                                    className="hour-analysis-mini-button"
                                    onClick={() => (
                                      row.isWhatIf
                                        ? updateHourAnalysisWhatIfOverride(row.id, "expected", row.inheritedHours || 0)
                                        : setHourAnalysisEmployeeOverride(row.employeeKey, "expected", row.inheritedHours || 0)
                                    )}
                                  >
                                    Override
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <HourAnalysisSplitControl
                            row={row}
                            disabled={!canEditRoster}
                            onChange={(updates) => updateHourAnalysisCoverageSplit(rowKey, updates)}
                          />
                        </td>
                        <td>
                          <HourAnalysisNoteInput
                            value={row.note || ""}
                            disabled={!canEditRoster}
                            onCommit={(nextNote) => updateHourAnalysisNote(rowKey, nextNote)}
                            ariaLabel={`${row.full_name || "Employee"} hour justification note`}
                            placeholder={row.isOverride || row.isSplit ? "Document the reason..." : "Optional note"}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {row.isWhatIf && canEditRoster ? (
                            <button
                              type="button"
                              className="hour-analysis-mini-button hour-analysis-danger-button"
                              onClick={() => removeHourAnalysisWhatIfRow(row.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {hourAnalysisModel.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.textMut }}>
                        Add employees to the roster to calculate hour ranges.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
          )}

          {capacityPlanningView === "labor-model" && (
        <div className="labor-model-page">
          <div className="labor-model-page-header">
            <div>
              <div className="labor-model-page-kicker">Capacity Planning</div>
              <div className="labor-model-page-title">Labor Model</div>
              <div className="labor-model-page-subtitle">Operating floor builder for staffing capacity.</div>
            </div>
            <div className="labor-model-page-stat">
              <span>Weekly Floor</span>
              <strong>{formatHourAnalysisHours(hourAnalysisLaborModelSummary.totalWeekly)}</strong>
            </div>
          </div>

          <div className="labor-model-shell is-page">
            <div className="labor-model-tabs" style={{ "--labor-model-tab-count": LABOR_MODEL_DAY_KEYS.length + 1, "--labor-model-active-index": Math.max(0, [LABOR_MODEL_SUMMARY_TAB, ...LABOR_MODEL_DAY_KEYS].indexOf(hourAnalysisLaborModelTab)) }}>
              <span className="labor-model-tab-indicator" aria-hidden="true" />
              {laborModelTabItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`labor-model-tab-button${hourAnalysisLaborModelTab === item.id ? " is-active" : ""}`}
                  onClick={() => setHourAnalysisLaborModelTab(item.id)}
                >
                  <span>{item.label}</span>
                  <small>
                    {item.detail}
                    {item.marketingDetail ? <em>{item.marketingDetail}</em> : null}
                  </small>
                </button>
              ))}
            </div>

            {hourAnalysisLaborModelTab === LABOR_MODEL_SUMMARY_TAB ? (
              <div className="labor-model-summary-view">
                <div className="labor-model-summary-cards">
                  <div className="labor-model-metric-card">
                    <span>Average Day</span>
                    <strong>{formatHourAnalysisHours(hourAnalysisLaborModelSummary.averageDaily)} hrs</strong>
                    <em>{hourAnalysisLaborModelSummary.highestDay?.label || "No day"} is highest</em>
                  </div>
	                  <div className="labor-model-metric-card">
	                    <span>Frontline Floor</span>
	                    <strong>{formatHourAnalysisHours((hourAnalysisLaborModelSummary.roleWeekly.csr || 0) + (hourAnalysisLaborModelSummary.roleWeekly.pct || 0))} hrs</strong>
	                    <em>CSR + PCT</em>
	                  </div>
	                  <div className="labor-model-metric-card is-marketing">
	                    <span>MKTG</span>
	                    <strong>{formatHourAnalysisHours(hourAnalysisLaborModelSummary.totalMarketingWeekly || 0)} hrs</strong>
	                    <em>Tracked separately from the operating floor</em>
	                  </div>
	                </div>
                <div className="labor-model-summary-layout" style={{ marginTop: 12 }}>
                  <div className="labor-model-summary-main">
                    <LaborModelHoursLineGraph days={hourAnalysisLaborModelSummary.dayRows} />
                    <div className="labor-model-panel">
                      <div className="labor-model-panel-title">Hours By Day</div>
                      <table className="labor-model-summary-table">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>GM</th>
                            <th>AM</th>
                            <th>SUP</th>
                            <th>CSR</th>
                            <th>PCT</th>
	                          <th>MKTG</th>
	                          <th>Total</th>
	                          <th>Peak</th>
	                        </tr>
                        </thead>
                        <tbody>
                          {hourAnalysisLaborModelSummary.dayRows.map((day) => (
                            <tr key={day.key}>
                              <td>{day.label}</td>
                              <td>{formatHourAnalysisHours(day.roleHours.general_manager || 0)}</td>
                              <td>{formatHourAnalysisHours(day.roleHours.assistant_manager || 0)}</td>
	                            <td>{formatHourAnalysisHours(day.roleHours.supervisor || 0)}</td>
                              <td>{formatHourAnalysisHours(day.roleHours.csr || 0)}</td>
                              <td>{formatHourAnalysisHours(day.roleHours.pct || 0)}</td>
	                            <td>{formatHourAnalysisHours(day.marketingHours || 0)}</td>
	                            <td>{formatHourAnalysisHours(day.totalHours)}</td>
	                            <td>{formatHourAnalysisHours(day.peakCoverage)}</td>
	                          </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="labor-model-panel">
                    <div className="labor-model-panel-title">Weekly Role Floors</div>
                    <table className="labor-model-summary-table">
                      <thead>
                        <tr>
                          <th>Position</th>
                          <th>Floor</th>
                          <th>Target</th>
                          <th>Expected</th>
                          <th>Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hourAnalysisModel.weeklyRows.map((row) => (
                          <tr key={row.key}>
                            <td>{getHourAnalysisGroupShortLabel(row.key)}</td>
                            <td>{formatHourAnalysisHours(row.requiredWeekly)}</td>
                            <td>{formatHourAnalysisHours(row.targetWeekly)}</td>
                            <td>{formatHourAnalysisHours(row.expected)}</td>
                            <td style={{ color: row.expectedGapToTarget < 0 ? "#b45309" : "#047857", fontWeight: 950 }}>
                              {row.expectedGapToTarget < 0 ? `${formatHourAnalysisHours(Math.abs(row.expectedGapToTarget))} short` : `${formatHourAnalysisHours(row.expectedGapToTarget)} surplus`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
	            ) : (
		              <div className="labor-model-day-view">
		                <div className="labor-model-grid-toolbar">
		                  <div>
		                    <div className="labor-model-grid-title">
		                      {activeHourAnalysisLaborModelDaySummary?.label || LABOR_MODEL_DAY_LABELS[activeHourAnalysisLaborModelDayKey]}
		                      <span>{formatHourAnalysisHours(activeHourAnalysisLaborModelDaySummary?.totalHours || 0)} operating hrs</span>
		                      {activeHourAnalysisLaborModelDaySummary?.marketingHours ? <em>{formatHourAnalysisHours(activeHourAnalysisLaborModelDaySummary.marketingHours)} MKTG hrs</em> : null}
		                    </div>
		                    <div className="labor-model-grid-meta">{activeLaborModelBreakers.length} grey bar{activeLaborModelBreakers.length === 1 ? "" : "s"} configured for this day.</div>
		                    {activeHourAnalysisLaborModelDaySummary?.columnValidation?.valid === false && (
		                      <div className="labor-model-grid-meta">Fix time continuity before this day feeds Staffing Capacity.</div>
		                    )}
		                  </div>
		                  <div className="labor-model-grid-actions">
		                    {canEditRoster && (
		                      <>
		                        <button
		                          type="button"
		                          className="labor-model-settings-button"
		                          onClick={() => setShowHierarchyManager(true)}
		                        >
		                          <I.Settings />
		                          <span>Settings</span>
		                        </button>
		                        <button
		                          type="button"
		                          className="labor-model-settings-button"
		                          onClick={() => {
		                            setLaborModelBreakerEditorDay(activeHourAnalysisLaborModelDayKey);
		                            setLaborModelBreakerCopyTargets([]);
		                            setShowLaborModelBreakerSettings(true);
		                          }}
		                        >
		                          <I.Settings />
		                          <span>Grey Bars</span>
		                        </button>
		                      </>
		                    )}
		                  </div>
		                </div>
	                <div className="labor-model-grid-wrap">
	                  <table className="labor-model-grid-table">
	                    <thead>
	                      <tr>
	                        <th className="labor-model-position-col">Position</th>
	                        <th className="labor-model-shift-col">Time</th>
	                        {(activeHourAnalysisLaborModelDay?.columns || []).map((column, columnIndex) => {
	                          const breakerMeta = getLaborModelColumnBreakerMeta(activeHourAnalysisLaborModelDayKey, column, hourAnalysisSettings.laborModel);
	                          return (
	                            <th
	                              key={column.id}
	                              style={breakerMeta.style}
	                              className={`labor-model-time-heading${breakerMeta.className}${hourAnalysisChangedKeys.has(`labor-model-column:${column.id}`) ? " is-recent-change" : ""}${column.is_valid === false ? " is-invalid" : ""}`}
	                            >
	                              <div className="labor-model-time-editor">
	                                <LaborModelInlineInput
	                                  value={column.label}
	                                  disabled={!canEditRoster}
	                                  ariaLabel={`${activeHourAnalysisLaborModelDaySummary?.label || "Day"} time slot label`}
	                                  className="labor-model-time-input"
	                                  onCommit={(nextValue) => updateHourAnalysisLaborModelColumn(activeHourAnalysisLaborModelDayKey, columnIndex, { label: nextValue })}
	                                />
	                              </div>
	                              {canEditRoster && (
	                                <div className="labor-model-column-actions">
	                                  <button
	                                    type="button"
	                                    className="labor-model-column-action"
	                                    aria-label={`Insert time before ${column.label}`}
	                                    onClick={() => insertHourAnalysisLaborModelColumn(activeHourAnalysisLaborModelDayKey, columnIndex, "left")}
	                                  >
	                                    <I.Plus />
	                                  </button>
	                                  <button
	                                    type="button"
	                                    className="labor-model-column-action is-delete"
	                                    aria-label={`Delete ${column.label}`}
	                                    disabled={(activeHourAnalysisLaborModelDay?.columns || []).length <= 1}
	                                    onClick={() => removeHourAnalysisLaborModelColumn(activeHourAnalysisLaborModelDayKey, columnIndex)}
	                                  >
	                                    <I.Trash />
	                                  </button>
	                                  <button
	                                    type="button"
	                                    className="labor-model-column-action"
	                                    aria-label={`Insert time after ${column.label}`}
	                                    onClick={() => insertHourAnalysisLaborModelColumn(activeHourAnalysisLaborModelDayKey, columnIndex, "right")}
	                                  >
	                                    <I.Plus />
	                                  </button>
	                                </div>
	                              )}
	                            </th>
	                          );
	                        })}
	                        <th className="labor-model-hours-col">Hours</th>
	                        <th className="labor-model-actions-col" aria-label="Actions" />
	                      </tr>
                    </thead>
                    <tbody>
                      {(activeHourAnalysisLaborModelDay?.rows || []).map((row) => {
                        const rowSummary = activeHourAnalysisLaborModelDaySummary?.rows.find((item) => item.id === row.id) || row;
                        return (
                          <tr
                            key={row.id}
                            className={`labor-model-grid-row${hourAnalysisChangedKeys.has(`labor-model-row:${row.id}`) ? " is-recent-change" : ""}`}
                          >
	                            <td className="labor-model-position-cell">
	                              <div className="labor-model-position-stack">
	                                <HourAnalysisAnimatedPicker
                                  value={row.group_key}
                                  options={LABOR_MODEL_GROUP_OPTIONS}
                                  disabled={!canEditRoster}
                                  placeholder="Position"
                                  onChange={(nextValue) => updateHourAnalysisLaborModelRow(activeHourAnalysisLaborModelDayKey, row.id, { group_key: nextValue })}
                                />
                                {rowSummary.runLength > 1 && rowSummary.runIndex === 1 && (
                                  <span className="labor-model-run-badge">
                                    {rowSummary.runLength} consecutive {LABOR_MODEL_SHIFT_TYPE_LABELS[rowSummary.shift_type] || "Opening"}
	                                  </span>
	                                )}
	                              </div>
	                              {canEditRoster && (
	                                <button
	                                  type="button"
	                                  className="labor-model-row-insert"
	                                  aria-label={`Insert row after ${getHourAnalysisGroupLabel(row.group_key)} ${LABOR_MODEL_SHIFT_TYPE_LABELS[row.shift_type] || "line"}`}
	                                  title="Insert row here"
	                                  onClick={() => insertHourAnalysisLaborModelRow(activeHourAnalysisLaborModelDayKey, row.id)}
	                                >
	                                  <I.Plus />
	                                </button>
	                              )}
	                            </td>
                            <td className="labor-model-shift-cell">
                              <LaborModelTimeControl
                                row={row}
                                disabled={!canEditRoster}
                                onChange={(updates) => updateHourAnalysisLaborModelRow(activeHourAnalysisLaborModelDayKey, row.id, updates)}
                              />
                            </td>
	                            {(activeHourAnalysisLaborModelDay?.columns || []).map((column, columnIndex) => {
		                              const breakerMeta = getLaborModelColumnBreakerMeta(activeHourAnalysisLaborModelDayKey, column, hourAnalysisSettings.laborModel);
		                              const cellKey = makeLaborModelCellKey(activeHourAnalysisLaborModelDayKey, row.id, columnIndex);
		                              const cellConflict = activeHourAnalysisLaborModelDaySummary?.columnValidation?.errors?.some((error) => error.index === columnIndex);
		                              return (
		                                <td key={`${row.id}-${column.id}`} style={breakerMeta.style} className={`labor-model-coverage-cell${breakerMeta.className}`}>
		                                  <LaborModelCoverageCell
		                                    value={row.coverage[columnIndex] || ""}
		                                    disabled={!canEditRoster}
		                                    selected={selectedLaborModelCells.has(cellKey)}
		                                    dragging={laborModelDragSelection?.dayKey === activeHourAnalysisLaborModelDayKey}
		                                    saving={savingHourAnalysis}
		                                    conflict={cellConflict}
		                                    bulkMode={selectedLaborModelCellCount > 0}
		                                    selectedCount={selectedLaborModelCellCount}
		                                    positionOptions={laborModelCoveragePositionOptions}
		                                    roleColors={hourAnalysisSettings.laborModelRoleColors}
		                                    rowGroupKey={row.group_key}
		                                    rowId={row.id}
		                                    columnIndex={columnIndex}
		                                    onCreate={(targetRowId, targetColumnIndex, nextValue) => updateHourAnalysisLaborModelCell(activeHourAnalysisLaborModelDayKey, targetRowId, targetColumnIndex, nextValue)}
		                                    onFillStart={(targetRowId, targetColumnIndex, fillValue) => startLaborModelCoverageDrag(activeHourAnalysisLaborModelDayKey, targetRowId, targetColumnIndex, fillValue)}
		                                    onEnter={(targetRowId, targetColumnIndex) => enterLaborModelCoverageDrag(activeHourAnalysisLaborModelDayKey, targetRowId, targetColumnIndex)}
		                                    onPositionChange={(targetRowId, targetColumnIndex, nextValue, action) => updateHourAnalysisLaborModelCellOrSelection(activeHourAnalysisLaborModelDayKey, targetRowId, targetColumnIndex, nextValue, action)}
		                                    onToggleSelected={(targetRowId, targetColumnIndex) => toggleLaborModelCellSelection(activeHourAnalysisLaborModelDayKey, targetRowId, targetColumnIndex)}
		                                  />
		                                </td>
	                              );
	                            })}
	                            <td className="labor-model-hours-cell">{formatHourAnalysisHours(rowSummary?.hours || calculateLaborModelRowHours(row, activeHourAnalysisLaborModelDay?.columns || []))}</td>
                            <td className="labor-model-delete-cell">
                              {canEditRoster && (
                                <button
                                  type="button"
                                  className="labor-model-delete-button"
                                  aria-label={`Delete ${getHourAnalysisGroupLabel(row.group_key)} ${LABOR_MODEL_SHIFT_TYPE_LABELS[row.shift_type] || "line"}`}
                                  onClick={() => removeHourAnalysisLaborModelRow(activeHourAnalysisLaborModelDayKey, row.id)}
                                >
                                  <I.Trash />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
	                      {(activeHourAnalysisLaborModelDay?.rows || []).length === 0 && (
	                        <tr>
	                          <td colSpan={(activeHourAnalysisLaborModelDay?.columns || []).length + 4} style={{ padding: 24, textAlign: "center", color: C.textMut, fontWeight: 820 }}>
	                            {canEditRoster ? (
	                              <button type="button" className="labor-model-empty-add" onClick={() => insertHourAnalysisLaborModelRow(activeHourAnalysisLaborModelDayKey)}>
	                                <I.Plus /> Add first row
	                              </button>
	                            ) : "Add a Labor Model line to begin building the operating floor."}
	                          </td>
	                        </tr>
	                      )}
	                    </tbody>
	                    <tfoot>
	                      <tr className="labor-model-total-row">
	                        <td>Operating floor</td>
	                        <td>
	                          {formatHourAnalysisHours(activeHourAnalysisLaborModelDaySummary?.totalHours || 0)} hrs
	                          {activeHourAnalysisLaborModelDaySummary?.marketingHours ? <small>{formatHourAnalysisHours(activeHourAnalysisLaborModelDaySummary.marketingHours)} MKTG</small> : null}
	                        </td>
	                        {(activeHourAnalysisLaborModelDay?.columns || []).map((column, columnIndex) => {
	                          const columnTotal = activeHourAnalysisLaborModelDaySummary?.columnTotals?.[columnIndex] || {};
	                          const breakerMeta = getLaborModelColumnBreakerMeta(activeHourAnalysisLaborModelDayKey, column, hourAnalysisSettings.laborModel);
	                          return (
	                            <td
	                              key={`total-${column.id}`}
	                              style={breakerMeta.style}
	                              className={`labor-model-total-cell${breakerMeta.className}`}
	                              title={`${formatHourAnalysisHours(columnTotal.operatingHours || 0)} operating hrs${columnTotal.marketingHours ? `; ${formatHourAnalysisHours(columnTotal.marketingHours)} marketing hrs` : ""}`}
	                            >
	                              {formatHourAnalysisHours(columnTotal.operatingCoverage || 0)}
	                              {columnTotal.marketingCoverage ? <small>M{formatHourAnalysisHours(columnTotal.marketingCoverage)}</small> : null}
	                            </td>
	                          );
	                        })}
	                        <td className="labor-model-hours-cell">{formatHourAnalysisHours(activeHourAnalysisLaborModelDaySummary?.totalHours || 0)}</td>
	                        <td />
	                      </tr>
	                    </tfoot>
	                  </table>
	                </div>
              </div>
            )}
          </div>
        </div>
          )}
        </div>
      )}
      </div>

      {canEditRoster && showLaborModelBreakerSettings && (
        <Modal title="Labor Model Grey Bars" onClose={() => setShowLaborModelBreakerSettings(false)}>
          <div className="labor-model-breaker-editor">
            <div className="labor-model-breaker-day-tabs">
              {LABOR_MODEL_DAY_KEYS.map((dayKey) => (
                <button
                  key={dayKey}
                  type="button"
                  className={`labor-model-breaker-day-tab${laborModelBreakerEditorDay === dayKey ? " is-active" : ""}`}
                  onClick={() => {
                    setLaborModelBreakerEditorDay(dayKey);
                    setLaborModelBreakerCopyTargets((prev) => prev.filter((targetDay) => targetDay !== dayKey));
                  }}
                >
                  <span>{LABOR_MODEL_DAY_SHORT_LABELS[dayKey]}</span>
                  <small>{getLaborModelBreakersForDay(hourAnalysisSettings.laborModel?.breakers, dayKey).length}</small>
                </button>
              ))}
            </div>

            <div className="labor-model-breaker-panel">
              <div className="labor-model-breaker-panel-header">
                <div>
                  <strong>{LABOR_MODEL_DAY_LABELS[laborModelBreakerEditorDay]} grey bars</strong>
                  <span>Bars render as vertical grey dividers inside matching time slots.</span>
                </div>
                <div className="labor-model-breaker-panel-actions">
                  <button type="button" onClick={() => addLaborModelBreaker(laborModelBreakerEditorDay)}>
                    <I.Plus /> Add bar
                  </button>
                  <button type="button" onClick={() => resetLaborModelBreakers(laborModelBreakerEditorDay)}>
                    Default bars
                  </button>
                </div>
              </div>

              <div className="labor-model-breaker-list">
                {getLaborModelBreakersForDay(hourAnalysisSettings.laborModel?.breakers, laborModelBreakerEditorDay).map((breaker, index) => (
                  <div key={`${breaker.id}-${index}`} className="labor-model-breaker-row">
                    <div>
                      <span>Bar {index + 1}</span>
                      <LaborModelInlineInput
                        value={formatLaborModelTimePoint(breaker.minutes)}
                        onCommit={(nextValue) => updateLaborModelBreaker(laborModelBreakerEditorDay, index, nextValue)}
                        ariaLabel={`Grey bar ${index + 1} time`}
                        className="labor-model-breaker-time-input"
                      />
                    </div>
                    <button
                      type="button"
                      className="labor-model-breaker-delete"
                      aria-label={`Delete grey bar ${index + 1}`}
                      onClick={() => deleteLaborModelBreaker(laborModelBreakerEditorDay, index)}
                    >
                      <I.Trash />
                    </button>
                  </div>
                ))}
                {getLaborModelBreakersForDay(hourAnalysisSettings.laborModel?.breakers, laborModelBreakerEditorDay).length === 0 && (
                  <div className="labor-model-breaker-empty">No grey bars on this day.</div>
                )}
              </div>
            </div>

            <div className="labor-model-breaker-copy-panel">
              <div>
                <strong>Copy this day</strong>
                <span>Use this when weekday or weekend layouts should share the same grey bars.</span>
              </div>
              <div className="labor-model-breaker-copy-grid">
                {LABOR_MODEL_DAY_KEYS.filter((dayKey) => dayKey !== laborModelBreakerEditorDay).map((dayKey) => (
                  <label key={dayKey} className="labor-model-breaker-copy-check">
                    <input
                      type="checkbox"
                      checked={laborModelBreakerCopyTargets.includes(dayKey)}
                      onChange={(event) => {
                        setLaborModelBreakerCopyTargets((prev) => (
                          event.target.checked
                            ? [...new Set([...prev, dayKey])]
                            : prev.filter((targetDay) => targetDay !== dayKey)
                        ));
                      }}
                    />
                    <span>{LABOR_MODEL_DAY_SHORT_LABELS[dayKey]}</span>
                  </label>
                ))}
              </div>
              <div className="labor-model-breaker-copy-actions">
                <button type="button" onClick={() => copyLaborModelBreakersToTargets(laborModelBreakerEditorDay, laborModelBreakerCopyTargets)}>
                  Copy to Selected
                </button>
                <button
                  type="button"
                  onClick={() => copyLaborModelBreakersToTargets(
                    laborModelBreakerEditorDay,
                    LABOR_MODEL_DAY_KEYS.filter((dayKey) => dayKey !== laborModelBreakerEditorDay)
                  )}
                >
                  Copy to All Days
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {canEditRoster && showHourAnalysisWhatIfModal && (
        <Modal title="Add Employee / What If" onClose={() => { setShowHourAnalysisWhatIfModal(false); resetWhatIfHourAnalysisForm(); }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: C.textMut }}>
              Add a planning-only employee to test new headcount. To model a current employee changing roles, use the position dropdown in the person table.
            </div>
            <Inp label="Name" value={whatIfEmployeeName} onChange={setWhatIfEmployeeName} placeholder="Candidate or placeholder name" />
            <HourAnalysisAnimatedPicker
              label="Position"
              value={whatIfPosition}
              onChange={setWhatIfPosition}
              options={hourAnalysisPositionOptions}
              placeholder="Choose position"
            />
            <HourAnalysisAnimatedPicker
              label="Commitment"
              value={whatIfCommitment}
              onChange={setWhatIfCommitment}
              options={hourAnalysisCommitmentOptions}
              placeholder="Choose commitment"
            />
            <div>
              <div style={{ fontSize: 11, fontWeight: 750, color: C.textSec, marginBottom: 7, letterSpacing: 0, textTransform: "uppercase" }}>
                Expected Hours
              </div>
              <HourAnalysisNumberInput
                value={whatIfHourOverrides.expected ?? whatIfPreviewRange.expected ?? 0}
                onCommit={(nextValue) => setWhatIfHourOverrides((prev) => ({ ...prev, expected: nextValue }))}
                ariaLabel="What-if expected weekly hours"
                style={{ width: 140, textAlign: "left" }}
              />
              <div style={{ marginTop: 7, fontSize: 11, color: C.textMut, fontWeight: 700 }}>
                Inherits {getHourAnalysisGroupLabel(whatIfPreviewGroupKey)} / {getLaborEmploymentCommitmentLabel(whatIfPreviewCommitment)} defaults unless changed.
              </div>
            </div>
            <HourAnalysisNoteInput
              value={whatIfNote}
              onCommit={setWhatIfNote}
              ariaLabel="What-if justification note"
              placeholder="Why are we testing this person?"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="ghost" onClick={() => { setShowHourAnalysisWhatIfModal(false); resetWhatIfHourAnalysisForm(); }}>Cancel</Btn>
              <Btn variant="primary" disabled={!canAddHourAnalysisWhatIf} onClick={addHourAnalysisWhatIfRow}>
                Add What If
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showHourAnalysisAudit && (
        <Modal title="Capacity Planning Activity" onClose={() => setShowHourAnalysisAudit(false)}>
          <div className="hour-analysis-audit-list">
            {(hourAnalysisSettings.auditLog || []).length === 0 ? (
              <div style={{ padding: 16, color: C.textMut, fontSize: 13, fontWeight: 720 }}>
                No Capacity Planning changes have been logged yet.
              </div>
            ) : (
              hourAnalysisSettings.auditLog.map((entry, index) => (
                <div key={entry.id || index} className="hour-analysis-audit-row" style={{ animationDelay: `${Math.min(index, 8) * 18}ms` }}>
                  <div>
                    <strong>{entry.summary || String(entry.action || "Change").replace(/_/g, " ")}</strong>
                    <span>{entry.entity_label || entry.entity_id || "Capacity Planning"}</span>
                    {(entry.before != null || entry.after != null) && (
                      <small>
                        {entry.before != null ? `From: ${typeof entry.before === "object" ? JSON.stringify(entry.before) : entry.before}` : ""}
                        {entry.before != null && entry.after != null ? "  " : ""}
                        {entry.after != null ? `To: ${typeof entry.after === "object" ? JSON.stringify(entry.after) : entry.after}` : ""}
                      </small>
                    )}
                    {entry.note ? <small>Note: {entry.note}</small> : null}
                  </div>
                  <div style={{ textAlign: "right", minWidth: 140 }}>
                    <span style={{ color: C.text, fontWeight: 900 }}>{entry.actor_name || "Staff"}</span>
                    <small>{formatTrainingTimestamp(entry.occurred_at)}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {canEditRoster && showHierarchyManager && (
        <Modal title="Labor Settings" onClose={() => setShowHierarchyManager(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
              Approved titles are the only positions shown in movement and what-if pickers. Drag the list into the default labor-table order. Roster, Training, Performance Reviews, Attendance, and Capacity Planning use this order until a manager chooses another sort.
            </div>
            <div className="labor-model-role-color-settings">
              <div className="labor-model-role-color-header">
                <div>
                  <strong>Labor Model Colors</strong>
                  <span>Grid role colors. Auto-saved.</span>
                </div>
              </div>
              <div className="labor-model-role-color-grid">
                {LABOR_MODEL_ROLE_COLOR_OPTIONS.map((option) => {
                  const palette = getLaborModelRolePalette(option.groupKey, hourAnalysisSettings.laborModelRoleColors);
                  const defaultPalette = LABOR_MODEL_ROLE_PALETTE[option.groupKey] || LABOR_MODEL_ROLE_PALETTE.other;
                  const isDefaultColor = palette.strong === defaultPalette.strong;
                  return (
                    <div
                      key={option.groupKey}
                      className="labor-model-role-color-row"
                      style={getLaborModelCoverageRoleStyle(option.groupKey, hourAnalysisSettings.laborModelRoleColors)}
                    >
                      <div className="labor-model-role-color-sample">
                        <span>{option.label}</span>
                      </div>
                      <label className="labor-model-role-color-control">
                        <span>{option.label}</span>
                        <input
                          type="color"
                          value={palette.strong}
                          aria-label={`${option.label} labor model color`}
                          onChange={(event) => updateLaborModelRoleColor(option.groupKey, event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="labor-model-role-color-reset"
                        onClick={() => updateLaborModelRoleColor(option.groupKey, defaultPalette.strong)}
                        disabled={isDefaultColor}
                        aria-label={`Reset ${option.label} labor model color`}
                        title="Reset color"
                      >
                        <I.RefreshCw />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="labor-position-add-row">
              <input
                value={newHierarchyTitle}
                onChange={(event) => setNewHierarchyTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addHierarchyDraftTitle();
                  }
                  if (event.key === "Escape") setNewHierarchyTitle("");
                }}
                placeholder="Add approved title, e.g. Director of Resorts"
              />
              <button
                type="button"
                className="labor-position-icon-button is-primary"
                onClick={addHierarchyDraftTitle}
                disabled={!newHierarchyTitle.trim()}
                aria-label="Add approved title"
                title="Add approved title"
              >
                <I.Plus />
              </button>
              <Btn variant="ghost" size="sm" onClick={resetHierarchyDraftToDefaults}>
                Reset Defaults
              </Btn>
            </div>
            {hierarchyDraft.length === 0 ? (
              <EmptyState icon="Users" title="No approved titles" subtitle="Add a title or reset to the default labor hierarchy." />
            ) : (
              <div className="labor-position-settings-list">
                {hierarchyDraft.map((row, index) => (
                  <div
                    key={row.normalized_title}
                    className={`labor-position-settings-row${draggingHierarchyTitle === row.normalized_title ? " is-dragging" : ""}`}
                    draggable
                    onDragStart={() => setDraggingHierarchyTitle(row.normalized_title)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleHierarchyDrop(row.normalized_title)}
                    onDragEnd={() => setDraggingHierarchyTitle("")}
                  >
                    <div className="labor-position-row-index">{index + 1}</div>
                    <span style={{ display: "inline-flex", color: C.textMut, cursor: "grab" }} title="Drag to reorder">
                      <I.GripVertical />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 850, color: C.text }}>{formatLaborPositionTitle(row.position_title)}</div>
                      <div style={{ fontSize: 11, color: C.textMut, marginTop: 3 }}>Approved title</div>
                    </div>
                    <button
                      type="button"
                      className="labor-position-icon-button is-danger"
                      onClick={() => removeHierarchyDraftTitle(row.normalized_title)}
                      aria-label={`Remove ${row.position_title}`}
                      title="Remove title"
                    >
                      <I.Trash />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowHierarchyManager(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveHierarchy} disabled={savingHierarchy}>
                {savingHierarchy ? "Saving…" : "Save Labor Settings"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {canUseLaborTab("training") && showPctReadinessNewRecord && (
        <Modal title="Add PCT Readiness Trainee" onClose={() => { setShowPctReadinessNewRecord(false); setNewPctReadinessEmployeeId(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 4 }}>Employee</div>
              <CustomSelect
                value={newPctReadinessEmployeeId}
                onChange={setNewPctReadinessEmployeeId}
                options={pctReadinessNewEmployeeOptions}
                placeholder="Select active employee"
                searchable
              />
            </div>
            {selectedNewPctReadinessEmployee ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.surfaceHover }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0 }}>Name</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginTop: 4 }}>{selectedNewPctReadinessEmployee.full_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0 }}>Role</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.textSec, marginTop: 4 }}>{formatLaborPositionTitle(selectedNewPctReadinessEmployee.position_title) || "Employee"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0 }}>Start Date</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.textSec, marginTop: 4 }}>{formatLaborDate(selectedNewPctReadinessEmployee.start_date || selectedNewPctReadinessEmployee.first_shift_date) || "Not set"}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5 }}>
                Active employees are sorted by most recent start date. Employees already on this readiness board are hidden.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowPctReadinessNewRecord(false); setNewPctReadinessEmployeeId(""); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreatePctReadinessRecord} disabled={creatingPctReadinessRecord || !newPctReadinessEmployeeId}>
                {creatingPctReadinessRecord ? "Adding..." : "Add Trainee"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {canUseLaborTab("training") && pctReadinessCellEditor && (
        <Modal title="Update Readiness Cell" onClose={closePctReadinessCellEditor}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.surfaceHover }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{pctReadinessCellEditor.record?.employee_full_name || "Employee"}</div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 5, lineHeight: 1.45 }}>{pctReadinessCellEditor.item?.label}</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>{pctReadinessCellEditor.section?.title}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 4 }}>Status</div>
              <CustomSelect
                value={pctReadinessEditorStatus}
                onChange={(value) => setPctReadinessEditorStatus(normalizePctReadinessStatus(value))}
                options={PCT_READINESS_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
            </div>
            <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.bg }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 5 }}>Actor Attribution</div>
              <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>
                This update will be stamped as <strong style={{ color: C.text }}>{actorName}</strong> from the logged-in account. Imported workbook names remain visible as historical data only.
              </div>
              {(pctReadinessCellEditor.cell?.demonstrated_by || pctReadinessCellEditor.cell?.verified_by) && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.textMut, fontWeight: 700 }}>
                  Legacy import: {pctReadinessCellEditor.cell?.verified_by || pctReadinessCellEditor.cell?.demonstrated_by}
                </div>
              )}
            </div>
            <Inp
              label="Comment"
              type="textarea"
              rows={3}
              value={pctReadinessEditorComment}
              onChange={setPctReadinessEditorComment}
              placeholder="Optional coaching note or context"
            />
            <div style={{ fontSize: 11, color: C.textMut, fontWeight: 700 }}>
              {pctReadinessCellEditor.cell?.updated_at ? `Last updated ${formatTrainingTimestamp(pctReadinessCellEditor.cell.updated_at)}` : "No prior update timestamp"}
              {pctReadinessCellEditor.cell?.latest_note ? ` - Latest comment: ${pctReadinessCellEditor.cell.latest_note}` : ""}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={closePctReadinessCellEditor}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSavePctReadinessCell} disabled={savingPctReadinessCell}>
                {savingPctReadinessCell ? "Saving..." : "Save Cell"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {canUseLaborTab("training") && showNewRecord && (
        <Modal title="New Training Record" onClose={() => { setShowNewRecord(false); resetNewRecordForm(); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CustomSelect
              value={newLaborEmployeeId}
              onChange={(value) => {
                setNewLaborEmployeeId(value);
                const employee = toObjectRows(laborEmployees).find((entry) => entry.id === value);
                if (!employee) return;
                setNewEmployeeName(employee.full_name || "");
                setNewTargetRole(employee.position_title || "");
                setNewHireDate(employee.start_date || "");
                const match = templateOptions.find((template) =>
                  template.roleScopes.some((scope) => scope.toUpperCase() === String(employee.position_title || "").toUpperCase())
                );
                if (match) setNewTemplateId(match.value);
              }}
              options={laborEmployeeOptions}
              placeholder="Select from roster (recommended)"
            />
            <Inp label="Employee Full Name" value={newEmployeeName} onChange={setNewEmployeeName} required />
            <CustomSelect label="Target Role" value={formatLaborPositionTitle(newTargetRole)} onChange={v => {
              setNewTargetRole(v);
              // Auto-select first template whose role_scopes includes the selected role
              const match = templateOptions.find(t =>
                t.roleScopes.some(rs => rs.toUpperCase() === v.toUpperCase())
              );
              if (match) setNewTemplateId(match.value);
            }} options={getLaborPositionOptionsWithCurrent(newTargetRole)} />
            <CustomSelect label="Training Template" value={newTemplateId} onChange={v => setNewTemplateId(v)} options={templateOptions} />
            {newTemplateId && (() => {
              const opt = templateOptions.find(o => o.value === newTemplateId);
              const st = opt?.stats || {};
              return st.sectionCount > 0 ? (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: C.priLt, fontSize: 12, color: C.pri, fontWeight: 600 }}>
                  {st.sectionCount} section{st.sectionCount !== 1 ? "s" : ""} — {st.itemCount} checklist item{st.itemCount !== 1 ? "s" : ""}
                </div>
              ) : null;
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Start Date" type="date" value={newHireDate} onChange={setNewHireDate} />
              <Inp label="Training Start Date" type="date" value={newStartDate} onChange={setNewStartDate} />
            </div>
            <Inp label="Target End Date" type="date" value={newTargetEndDate} onChange={setNewTargetEndDate} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowNewRecord(false); resetNewRecordForm(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreateRecord} disabled={creating}>{creating ? "Creating..." : "Create Record"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {laborEmployeeEditorModal}
      {employeeNoteEditorModal}
      {attachmentPreviewModal}

      {canAccessEmployeeNotes && showGlobalNoteModal && (
        <Modal title="Add Employee Note" onClose={() => setShowGlobalNoteModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CustomSelect
              value={globalNoteEmployeeId}
              onChange={setGlobalNoteEmployeeId}
              options={globalNoteEmployeeOptions}
              placeholder="Choose employee"
            />
            <Inp
              label="Note Type"
              type="select"
              value={globalNoteType}
              onChange={setGlobalNoteType}
              options={LABOR_NOTE_TYPE_OPTIONS}
            />
            <Inp
              label="Note"
              type="textarea"
              rows={4}
              value={globalNoteText}
              onChange={setGlobalNoteText}
              placeholder="Add a manager-facing note for this employee"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowGlobalNoteModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleAddGlobalEmployeeNote} disabled={savingGlobalNote}>
                {savingGlobalNote ? "Saving..." : "Add Note"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {canManageTemplates && showCreateTemplateModal && (
        <Modal title="Create Template" onClose={resetCreateTemplateModal}>
          <div style={{ display: "grid", gap: 14, minWidth: 560, maxWidth: 620 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, marginBottom: 6 }}>Template Type</div>
                <CustomSelect
                  value={createTemplateKind}
                  onChange={(value) => setCreateTemplateKind(value || "training")}
                  options={[
                    { value: "training", label: "Training Template" },
                    { value: "review", label: "30 / 60 / 90 Review Template" },
                  ]}
                />
              </div>
              {createTemplateKind === "training" ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, marginBottom: 6 }}>Template Class</div>
                  <CustomSelect
                    value={createTemplateClass}
                    onChange={(value) => setCreateTemplateClass(value || "training_plan")}
                    options={[
                      { value: "training_plan", label: "Training Plan" },
                      { value: "written_certification", label: "Written Certification" },
                      { value: "live_evaluation", label: "Live Evaluation" },
                      { value: "competency_guide", label: "Competency Guide" },
                      { value: "master_dependency_checklist", label: "Master Dependency Checklist" },
                    ]}
                  />
                </div>
              ) : (
                <div style={{ paddingTop: 24, fontSize: 12, color: C.textMut }}>
                  Review templates open directly into the full-page 30 / 60 / 90 workflow.
                </div>
              )}
            </div>
            <Inp label="Template Name" value={createTemplateName} onChange={setCreateTemplateName} placeholder={createTemplateKind === "review" ? "Assistant Manager 30 / 60 / 90 Day Review" : "Bathing Certification"} />
            <Inp
              label="Role Scopes"
              value={createTemplateRoleScopesText}
              onChange={setCreateTemplateRoleScopesText}
              placeholder="Pet Care Technician, Customer Service Representative, Supervisor"
              help="Comma-separated roles. Leave blank to make the template available to all roles."
            />
            <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5 }}>
              The template will open as a draft immediately so you can rename sections, add modules, and publish when it is ready.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="ghost" onClick={resetCreateTemplateModal}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreateTemplateShell} disabled={creatingTemplate}>
                {creatingTemplate ? "Creating..." : "Create Template"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

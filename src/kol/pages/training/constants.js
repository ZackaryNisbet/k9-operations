// K9 Operations — Training Module: extracted static constants.
// Pure data moved verbatim from TrainingPage.jsx (no behavior change).

import { LABOR_EMPLOYMENT_COMMITMENT_OPTIONS } from "../../trainingData";

export const ITEM_STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#94A3B8" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8" },
  complete: { bg: "#DCFCE7", text: "#15803D" },
  passed: { bg: "#DCFCE7", text: "#15803D" },
  failed: { bg: "#FEE2E2", text: "#DC2626" },
  needs_coaching: { bg: "#FEF3C7", text: "#D97706" },
  blocked: { bg: "#F1F5F9", text: "#94A3B8" },
  waived: { bg: "#F1F5F9", text: "#94A3B8" },
};

export const PCT_READINESS_STATUS_STYLES = {
  not_started: { bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0", icon: "O" },
  demonstrated: { bg: "#E0F2FE", text: "#0369A1", border: "#BAE6FD", icon: "D" },
  verified: { bg: "#DCFCE7", text: "#15803D", border: "#BBF7D0", icon: "OK" },
  needs_coaching: { bg: "#FEF3C7", text: "#B45309", border: "#FDE68A", icon: "!" },
  blocked: { bg: "#FEE2E2", text: "#B91C1C", border: "#FECACA", icon: "X" },
  waived: { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1", icon: "W" },
};

export const DEFAULT_PCT_READINESS_FILTERS = {
  employee: "",
  task: "",
  category: "",
  showGapsOnly: false,
  showNeedsCoaching: false,
};

export const DEFAULT_TRAINING_HISTORY_FILTERS = {
  date: "",
  employee: "",
  categoryTask: "",
  actor: "",
};

export const DEFAULT_COMPLIANCE_HISTORY_FILTERS = {
  date: "",
  employee: "",
  categoryTask: "",
  actor: "",
};

export const TRAINING_RECORD_EMPLOYEE_STATUS_OPTIONS = [
  { id: "active", label: "Active employees" },
  { id: "inactive", label: "Inactive employees" },
  { id: "all", label: "All employees" },
];

export const TRAINING_REALTIME_TABLES = [
  "training_records",
  "training_record_item_results",
  "training_record_notes",
  "training_record_events",
];

export const TRAINING_REALTIME_REFRESH_DELAY_MS = 150;

export const HIDDEN_LABOR_TABS = [
  { id: "templates", label: "Templates" },
  { id: "notes", label: "Notes" }, // hidden from the module nav per request (still routable)
];

export const LABOR_TAB_PERMISSION_MAP = {
  home: "Labor Roster",
  training: "Labor Roster",
  "performance-reviews": "Labor Compliance View",
  templates: "Labor Templates",
  attendance: "Labor Attendance",
  interviews: "Labor Interviews",
  notes: "Labor Employee Notes",
  "hour-analysis": "Labor Roster",
  "labor-model": "Labor Roster",
};

export const normalizeAttendanceView = (value) => value === "summary" ? "summary" : "input";

export const normalizeInterviewView = (value) => value === "config" ? "config" : "records";

export const CAPACITY_PLANNING_VIEWS = [
  { id: "staffing-capacity", label: "Staffing Capacity", subtitle: "Expected hours, coverage gaps, and hiring pressure" },
  { id: "labor-model", label: "Labor Model", subtitle: "Build the operating floor that feeds staffing capacity" },
];

export const TRAINING_GRACE_PERIOD_DAYS = 14;

export const REVIEW_WARNING_WINDOW_DAYS = 7;

export const LABOR_ROSTER_VIEWS_SETTING_KEY = "labor_roster_views";

export const LABOR_HOUR_ANALYSIS_SETTING_KEY = "labor_hour_analysis";

export const LABOR_POSITION_ACRONYMS_SETTING_KEY = "labor_position_acronyms";

export const LABOR_CAPACITY_MODEL_DEFAULT_NAME = "Current Adair Forsythe Operating Model";

export const LABOR_CAPACITY_MODEL_TABLE_MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST116"]);

export const DEFAULT_ROSTER_FILTERS = { employment_status: { op: "is", val: "active" } };

export const LABOR_COMMITMENT_SELECT_OPTIONS = [
  { value: "", label: "Unassigned" },
  ...LABOR_EMPLOYMENT_COMMITMENT_OPTIONS,
];

export const HOUR_ANALYSIS_GROUPS = [
  { key: "general_manager", label: "General Manager" },
  { key: "assistant_manager", label: "Assistant Manager" },
  { key: "supervisor", label: "Supervisor" },
  { key: "csr", label: "Customer Service Representative" },
  { key: "pct", label: "Pet Care Technician" },
  { key: "other", label: "Other" },
];

export const HOUR_ANALYSIS_GROUP_SHORT_LABELS = {
  general_manager: "GM",
  assistant_manager: "AM",
  supervisor: "SUP",
  csr: "CSR",
  pct: "PCT",
  other: "Other",
};

export const DEFAULT_LABOR_POSITION_TITLES = [
  "General Manager",
  "Assistant Manager",
  "Supervisor",
  "Customer Service Representative",
  "Pet Care Technician",
];

export const DEFAULT_LABOR_POSITION_ACRONYMS = {
  "general manager": "GM",
  "assistant manager": "AM",
  supervisor: "SUP",
  "customer service representative": "CSR",
  "pet care technician": "PCT",
};

export const LABOR_DEFAULT_SORT = { key: "hierarchy", direction: "asc" };

export const LABOR_ROSTER_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "name", label: "Name" },
  { key: "position", label: "Position" },
  { key: "commitment", label: "Commitment" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "training", label: "Training" },
  { key: "performance_reviews", label: "Compliance" },
  { key: "notes", label: "Notes" },
];

export const LABOR_TRAINING_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "employee", label: "Employee" },
  { key: "position", label: "Position" },
  { key: "plan", label: "Training Plan" },
  { key: "progress", label: "Progress" },
  { key: "status", label: "Status" },
  { key: "target", label: "Target Date" },
];

export const REVIEW_CYCLE_SORT_KEY_PREFIX = "review_cycle:";

export const COMPLIANCE_EVIDENCE_REQUIRED_POLICIES = new Set(["file_required", "url_or_reference"]);

export const LABOR_HOUR_PERSON_SORT_COLUMNS = [
  { key: "hierarchy", label: "Position Order" },
  { key: "name", label: "Name" },
  { key: "position", label: "Position" },
  { key: "commitment", label: "Commitment" },
  { key: "preferred", label: "Expected Hours" },
  { key: "split", label: "Coverage Split" },
  { key: "note", label: "Justification" },
];

export const HOUR_ANALYSIS_RANGE_KEYS = ["min", "expected", "max"];

export const HOUR_ANALYSIS_RANGE_LABELS = {
  min: "Min",
  expected: "Expected",
  max: "Max",
};

export const DEFAULT_HOUR_ANALYSIS_EXPECTATIONS = {
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

export const DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON = {
  general_manager: 8,
  assistant_manager: 8,
  supervisor: 16,
  csr: 24,
  pct: 43.5,
  other: 0,
};

export const HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT = 15;

export const HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT = 20;

export const HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT = 25;

export const HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT = 30;

export const HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT = 2;

export const HOUR_ANALYSIS_MIN_TOLERANCE_HOURS = 1;

export const HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS = new Set(["csr", "pct"]);

export const HOUR_ANALYSIS_STAFFING_CAPACITY_GROUP_KEYS = ["general_manager", "assistant_manager", "supervisor", "csr", "pct"];

export const HOUR_ANALYSIS_SPLIT_TARGET_OPTIONS = [
  { value: "", label: "Primary role" },
  { value: "csr", label: "Customer Service Representative floor" },
  { value: "pct", label: "Pet Care Technician floor" },
];

export const HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS = 35;

export const HOUR_ANALYSIS_STAFFING_SOURCES = [
  { label: "NICE shrinkage staffing formula", href: "https://help.nice-incontact.com/content/workforcemanagement/staffingrequirementcalculations.htm" },
  { label: "BLS absence baseline", href: "https://www.bls.gov/cps/cpsaat47.htm" },
  { label: "SWPP shrinkage survey", href: "https://swpp.org/surveys/SWPP%20Survey%20Results%20Spring%202024%20-%20Shrinkage.pdf" },
  { label: "SHRM absence cost study", href: "https://www.shrm.org/content/dam/en/shrm/topics-tools/news/hr-magazine/kronos_us_executive_summary_final.pdf" },
  { label: "Gap stable-scheduling study", href: "https://worklifelaw.org/projects/stable-scheduling-study/report/" },
];

export const LABOR_MODEL_SUMMARY_TAB = "summary";

export const LABOR_MODEL_DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const LABOR_MODEL_DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const LABOR_MODEL_DAY_SHORT_LABELS = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const LABOR_MODEL_SHIFT_TYPE_OPTIONS = [
  { value: "opening", label: "Opening" },
  { value: "mid", label: "Mid" },
  { value: "close", label: "Close" },
];

export const LABOR_MODEL_FULL_COVERAGE_VALUE = "1";

export const LABOR_MODEL_HALF_COVERAGE_VALUE = "0.5";

export const LABOR_MODEL_MARKETING_COVERAGE_VALUE = "MKTG";

export const LABOR_MODEL_MARKETING_TOKENS = new Set(["mktg", "marketing"]);

export const LABOR_MODEL_ROLE_COVERAGE_OPTIONS = [
  { groupKey: "general_manager", label: "GM", aliases: ["gm", "general manager", "generalmanager"] },
  { groupKey: "assistant_manager", label: "AM", aliases: ["am", "assistant manager", "assistantmanager"] },
  { groupKey: "supervisor", label: "SUP", aliases: ["sup", "supervisor"] },
  { groupKey: "csr", label: "CSR", aliases: ["csr", "customer service representative", "customerservicerepresentative"] },
  { groupKey: "pct", label: "PCT", aliases: ["pct", "pet care technician", "petcaretechnician"] },
];

export const LABOR_MODEL_ROLE_PALETTE = {
  general_manager: { strong: "#14532d", accent: "#16a34a", soft: "#dcfce7", text: "#14532d" },
  assistant_manager: { strong: "#3730a3", accent: "#6366f1", soft: "#e0e7ff", text: "#312e81" },
  supervisor: { strong: "#92400e", accent: "#f59e0b", soft: "#fef3c7", text: "#78350f" },
  csr: { strong: "#c2410c", accent: "#fb923c", soft: "#ffedd5", text: "#9a3412" },
  pct: { strong: "#0e7490", accent: "#06b6d4", soft: "#cffafe", text: "#155e75" },
  other: { strong: "#334155", accent: "#64748b", soft: "#e2e8f0", text: "#334155" },
};

export const LABOR_MODEL_WEEKDAY_COLUMNS = [
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

export const LABOR_MODEL_WEEKEND_COLUMNS = [
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

export const LABOR_MODEL_WEEKDAY_EMPTY = "- - - - - - - - - - - - - - - -";

export const LABOR_MODEL_WEEKEND_EMPTY = "- - - - - - - - - - - - -";

export const LABOR_MODEL_WEEKDAY_BREAKERS = [6 * 60, 13 * 60, 19 * 60];

export const LABOR_MODEL_WEEKEND_BREAKERS = [7 * 60, 13 * 60, (18 * 60) + 30];

export const LABOR_MODEL_WEEKDAY_PATTERNS = {
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

export const LABOR_MODEL_WEEKEND_PATTERNS = {
  am: "- x x x x x x - - - - - -",
  pm: "- - - - - - - x x x x x -",
};

export const LEGACY_LABOR_MODEL_ACTIVE_TOKENS = new Set(["x", "e", "pct", "run", "yes", "true", "1", "✓"]);

export const LABOR_ROSTER_PRINT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export const EMPTY_REVIEW_PDF_DRAFT = {
  rating: "",
  managerNotes: "",
  actionPlan: "",
  overallRating: "",
  overallComments: "",
};

export const RESTARTED_REVIEW_METADATA_KEYS = [
  "performance_review_rating",
  "manager_notes",
  "action_plan",
  "overall_rating",
  "overall_comments",
  "pdf_draft_saved_at",
  "signature",
];

export const SAVING_ALL_REVIEW_RESPONSES_ID = "__all_review_responses__";

export const REVIEW_RESPONSE_FIELDS = ["rating_value", "response_text"];

export const LABOR_NOTE_TYPE_OPTIONS = [
  { value: "general", label: "General" },
  { value: "personal", label: "Personal" },
  { value: "performance", label: "Performance" },
  { value: "attendance", label: "Attendance" },
  { value: "training", label: "Training" },
  { value: "hr", label: "HR" },
];

export const CAPACITY_PLANNING_VIEW_IDS = new Set(CAPACITY_PLANNING_VIEWS.map((view) => view.id));

export const HOUR_ANALYSIS_GROUP_LABELS = Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, group.label]));

export const HOUR_ANALYSIS_FRONTLINE_TARGET_RANGE_LABEL = `${HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT}-${HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT}% frontline target range`;

export const LABOR_MODEL_SHIFT_TYPE_LABELS = Object.fromEntries(LABOR_MODEL_SHIFT_TYPE_OPTIONS.map((option) => [option.value, option.label]));

export const LABOR_MODEL_GROUP_OPTIONS = HOUR_ANALYSIS_GROUPS
  .filter((group) => group.key !== "other")
  .map((group) => ({ value: group.key, label: HOUR_ANALYSIS_GROUP_SHORT_LABELS[group.key] || group.label }));

export const LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP = new Map(
  LABOR_MODEL_ROLE_COVERAGE_OPTIONS.flatMap((option) => (
    [option.label, option.groupKey, ...option.aliases].map((alias) => [
      String(alias || "").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " "),
      option,
    ])
  ))
);

export const LABOR_MODEL_DEFAULT_BREAKERS_BY_DAY = Object.fromEntries(LABOR_MODEL_DAY_KEYS.map((dayKey) => [
  dayKey,
  ["saturday", "sunday"].includes(dayKey) ? LABOR_MODEL_WEEKEND_BREAKERS : LABOR_MODEL_WEEKDAY_BREAKERS,
]));

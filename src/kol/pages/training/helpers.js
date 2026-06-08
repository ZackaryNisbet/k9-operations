// K9 Operations — Training Module: extracted pure helper functions.
// Moved verbatim from TrainingPage.jsx (no behavior change).

import { TEAM_READINESS_TEMPLATE_OPTIONS, getPctReadinessStatusPresentation, normalizePctReadinessStatus, readLaborEmployeeContactValue, readLaborEmploymentCommitment } from "../../trainingData";
import { HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT, HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS, HOUR_ANALYSIS_GROUPS, HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT, HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT, HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT, HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT, LABOR_CAPACITY_MODEL_DEFAULT_NAME, LABOR_CAPACITY_MODEL_TABLE_MISSING_CODES, LABOR_MODEL_DAY_KEYS, LABOR_ROSTER_PRINT_DATE_FORMATTER, REVIEW_CYCLE_SORT_KEY_PREFIX } from "./constants";
import { PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY, normalizePerformanceReviewTemplateRoleKey } from "../../performanceReviewData";
import { PCT_READINESS_TEMPLATE_SLUG, getLaborRosterPositionGroup, getTeamReadinessTemplateOption, normalizeLaborShirtSize } from "../../trainingData";
import { DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON, HOUR_ANALYSIS_GROUP_LABELS, HOUR_ANALYSIS_MIN_TOLERANCE_HOURS, HOUR_ANALYSIS_RANGE_KEYS, LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP, RESTARTED_REVIEW_METADATA_KEYS, REVIEW_RESPONSE_FIELDS } from "./constants";

export function buildPerformanceReviewSortKey(cycle = {}) {
  return `${REVIEW_CYCLE_SORT_KEY_PREFIX}${cycle.id || cycle.slug || cycle.requirementId || cycle.policyKey || "review"}`;
}

export function normalizeLocalReviewCycleKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^review_/, "")
    .replace(/_day$/, "");
}

export function hasOwnReviewDraftField(draft, field) {
  return Boolean(draft && Object.prototype.hasOwnProperty.call(draft, field));
}

export function normalizeReviewResponseValue(value) {
  return String(value ?? "").trim();
}

export function normalizePositionTitle(value = "") {
  const title = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!title) return "";
  if (/^(gm|general manager)$/.test(title)) return "general manager";
  if (/^(am|agm|assistant manager|assistant general manager)$/.test(title)) return "assistant manager";
  if (/^(csr|customer service representative|front desk|guest service representative)$/.test(title)) return "customer service representative";
  if (/^(pct|pet care technician|pet care tech|technician|kennel technician)$/.test(title)) return "pet care technician";
  if (/^(supervisor|shift supervisor|shift lead|lead)$/.test(title)) return "supervisor";
  return title;
}

export function isPersistedLaborPositionRowTrusted(row = {}) {
  return Boolean(row.created_by_user_id || row.updated_by_user_id || row.created_by_name || row.updated_by_name);
}

export function compareLaborSortValues(left, right) {
  const leftValue = left == null ? "" : left;
  const rightValue = right == null ? "" : right;
  if (typeof leftValue === "number" && typeof rightValue === "number") return leftValue - rightValue;
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
}

export function formatRosterLocationName(value = "") {
  const cleanName = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleanName) return "K9 Resorts";
  if (/^k9 resorts\b/i.test(cleanName)) return cleanName;
  if (/^k9 operations\b/i.test(cleanName)) return cleanName;
  return `K9 Resorts of ${cleanName}`;
}

export function formatRosterPrintDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return LABOR_ROSTER_PRINT_DATE_FORMATTER.format(new Date());
  return LABOR_ROSTER_PRINT_DATE_FORMATTER.format(date);
}

export function formatRosterPdfDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  const year = String(safeDate.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

export function getCommitmentBadgeTone(value) {
  const normalized = readLaborEmploymentCommitment({ employment_commitment: value });
  if (normalized === "full_time") return { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" };
  if (normalized === "part_time") return { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" };
  return { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" };
}

export function normalizeLaborContactEmail(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function normalizeLaborContactPhone(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "").slice(0, 10);
  return digitsOnly || null;
}

export function readLaborEmployeeContact(employee, key) {
  return readLaborEmployeeContactValue(employee, key);
}

export function isReadinessVerifiedStatus(status = "") {
  return ["verified", "waived"].includes(normalizePctReadinessStatus(status));
}

export function formatReviewWorkflowLabel(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .replace(/\b30\s*\/\s*60\s*\/\s*90\s*day\s*review\b/gi, "Policy Review")
    .replace(/\b30\s*\/\s*60\s*\/\s*90\s*workflow\b/gi, "policy checkpoint workflow")
    .replace(/\b30\s*\/\s*60\s*\/\s*90\b/gi, "policy")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function splitEmployeeName(fullName = "") {
  const tokens = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: "" };
  return {
    firstName: tokens.slice(0, -1).join(" "),
    lastName: tokens[tokens.length - 1],
  };
}

export function normalizeEmployeeName(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isObjectRow(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeComplianceEvidencePolicy(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function readTrainingRequirementDueRule(requirementRow = {}) {
  const dueRule = requirementRow.dueRule
    || requirementRow.due_rule
    || requirementRow.requirement?.due_rule
    || requirementRow.policyRequirement?.due_rule
    || requirementRow.metadata?.due_rule
    || requirementRow.requirement?.metadata?.due_rule
    || {};
  return dueRule && typeof dueRule === "object" ? dueRule : {};
}

export function normalizeComplianceRequirementLabel(row = {}) {
  return String(row.label || row.title || row.name || row.slug || "Requirement").trim() || "Requirement";
}

export function formatComplianceRequirementEvidence(row = {}) {
  const policy = String(row.evidence_policy || "checkbox_only");
  if (policy === "checkbox_only") return "Yes/no";
  if (policy === "file_required") return "PDF required";
  if (policy === "url_or_reference") return "URL or reference";
  return policy.replace(/_/g, " ");
}

export function compareTemplateVersionRecency(left = {}, right = {}) {
  const leftVersion = Number(left.version_no ?? 0);
  const rightVersion = Number(right.version_no ?? 0);
  if (rightVersion !== leftVersion) return rightVersion - leftVersion;
  return String(right.created_at || right.updated_at || "").localeCompare(String(left.created_at || left.updated_at || ""));
}

export function normalizeTemplateRequiredTextInput(value = "", currentValue = "", fieldLabel = "Field") {
  const nextText = String(value || "").trim();
  const currentText = String(currentValue || "").trim();
  const label = String(fieldLabel || "Field").trim() || "Field";
  if (!nextText) {
    return {
      valid: false,
      changed: false,
      value: currentText,
      error: `${label} is required.`,
    };
  }
  return {
    valid: true,
    changed: nextText !== currentText,
    value: nextText,
    error: "",
  };
}

export function isMissingTeamReadinessRpcError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "PGRST202"
    || (
      message.includes("schema cache")
      && (
        message.includes("get_training_readiness_board")
        || message.includes("create_training_readiness_record")
        || message.includes("update_training_readiness_cell")
      )
    );
}

export function buildEmptyReadinessBoard(option = TEAM_READINESS_TEMPLATE_OPTIONS[0]) {
  return {
    template: null,
    sections: [],
    records: [],
    cells: {},
    available_employees: [],
    summary: {
      template_slug: option.slug,
      total_active_trainees: 0,
      total_active_pct_trainees: 0,
      average_demonstrated: 0,
      average_completion: 0,
      average_readiness: 0,
      needs_coaching_count: 0,
      weakest_task_gaps: [],
    },
    import_report: {},
  };
}

export function normalizeHourAnalysisNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 10) / 10;
}

export function normalizeHourAnalysisDelta(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10) / 10;
}

export function readHourAnalysisRangeNumber(value) {
  if (value == null || value === "") return 0;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10) / 10;
}

export function slugifyLaborModelId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || `item-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseLaborModelCoverage(value = "") {
  if (Array.isArray(value)) return value.map((cell) => String(cell || "").trim());
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((cell) => (cell === "-" ? "" : cell.trim()));
}

export function normalizeLaborModelCoverageAlias(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeLaborModelHexColor(value = "", fallback = "#334155") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split("").map((char) => `${char}${char}`).join("")}`.toLowerCase();
  }
  return fallback;
}

export function isLaborModelCoverageActive(value = "") {
  return Boolean(String(value || "").trim());
}

export function parseLaborModelTimePoint(value = "", fallbackSuffix = "") {
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

export function formatLaborModelTimePoint(minutes = 0) {
  const normalized = ((Math.round(Number(minutes) || 0) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? "p" : "a";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${suffix}`;
}

export function makeLaborModelCellKey(dayKey = "monday", rowId = "", columnIndex = 0) {
  const normalizedDay = LABOR_MODEL_DAY_KEYS.includes(dayKey) ? dayKey : "monday";
  return `${normalizedDay}::${String(rowId || "").trim()}::${Number(columnIndex)}`;
}

export function normalizeLaborModelShiftType(value = "", row = {}) {
  const raw = String(value || row.shift_type || row.shiftType || row.time_type || row.timeType || row.time || "").trim().toLowerCase();
  if (["opening", "open", "am", "morning"].includes(raw)) return "opening";
  if (["mid", "middle", "swing"].includes(raw)) return "mid";
  if (["close", "closing", "pm", "evening"].includes(raw)) return "close";
  const label = String(row.role_label || row.roleLabel || row.label || row.shift_label || row.shiftLabel || "").toLowerCase();
  if (/\b(mid|middle)\b/.test(label)) return "mid";
  if (/\b(pm|close|closing)\b/.test(label)) return "close";
  return "opening";
}

export function normalizeLaborModelBreakMinutes(value, fallback = 30) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(240, parsed));
}

export function makeLaborModelRoleHoursBucket() {
  return Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, 0]));
}

export function normalizeHourAnalysisScenarioType(value = "") {
  const normalized = String(value || "").trim().replace(/[-\s]+/g, "_").toLowerCase();
  return ["move", "movement", "transfer", "role_move", "role_change"].includes(normalized) ? "move" : "add";
}

export function getDefaultStaffingCapacityRoleSettings(groupKey = "other") {
  const isFrontline = HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS.has(groupKey);
  return {
    tolerancePercent: HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT,
    lowerBufferPercent: isFrontline ? HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT : 0,
    targetBufferPercent: isFrontline ? HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT : 0,
    upperBufferPercent: isFrontline ? HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT : 0,
    overRosteredBufferPercent: isFrontline ? HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT : 0,
  };
}

export function makeLaborCapacityModelTempId(prefix = "labor-model") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeLaborCapacityModelName(value = "", fallback = LABOR_CAPACITY_MODEL_DEFAULT_NAME) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  return name || fallback;
}

export function getLaborCapacityModelLoadMissing(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return LABOR_CAPACITY_MODEL_TABLE_MISSING_CODES.has(code)
    || message.includes("labor_capacity_models")
    || message.includes("could not find the table");
}

export function getLaborCapacityModelVersionLoadMissing(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return LABOR_CAPACITY_MODEL_TABLE_MISSING_CODES.has(code)
    || message.includes("labor_capacity_model_versions")
    || message.includes("could not find the table");
}

export function getOutOfPositionCompareKey(roleKey = "") {
  if (["general_manager", "assistant_manager", "management"].includes(roleKey)) return "management";
  return roleKey || "";
}

export function parseLaborShiftMinutes(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes >= 60) return null;
  const suffix = match[3] || "";
  if ((suffix === "p" || suffix === "pm") && hours < 12) hours += 12;
  if ((suffix === "a" || suffix === "am") && hours === 12) hours = 0;
  if (!suffix && hours > 23) return null;
  return (hours * 60) + minutes;
}

export function makeHourAnalysisRangeTotals() {
  return { min: 0, expected: 0, max: 0 };
}

export function clampHourAnalysisPercent(value, min = 0, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

export function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
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

export function downloadBinaryFile(filename, bytes, mimeType = "application/octet-stream") {
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

export async function copyTextToClipboard(value, environment = {}) {
  const text = String(value || "").trim();
  if (!text) return false;
  const runtimeNavigator = environment.navigator || (typeof navigator !== "undefined" ? navigator : null);
  const runtimeDocument = environment.document || (typeof document !== "undefined" ? document : null);
  const runtimeWindow = environment.window || (typeof window !== "undefined" ? window : null);

  if (runtimeNavigator?.clipboard?.writeText) {
    try {
      await runtimeNavigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea copy path when browser permission checks reject.
    }
  }

  if (!runtimeDocument?.createElement || !runtimeDocument?.body?.appendChild || typeof runtimeDocument.execCommand !== "function") {
    return false;
  }

  const activeElement = runtimeDocument.activeElement;
  const selection = runtimeWindow?.getSelection?.();
  const ranges = [];
  if (selection?.rangeCount) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      ranges.push(selection.getRangeAt(index));
    }
  }

  const textarea = runtimeDocument.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  try {
    runtimeDocument.body.appendChild(textarea);
    textarea.focus?.({ preventScroll: true });
    textarea.select?.();
    textarea.setSelectionRange?.(0, text.length);
    return Boolean(runtimeDocument.execCommand("copy"));
  } catch {
    return false;
  } finally {
    textarea.remove?.();
    if (selection && ranges.length > 0) {
      try {
        selection.removeAllRanges();
        ranges.forEach((range) => selection.addRange(range));
      } catch {
        // Restoring selection is best-effort only.
      }
    }
    if (activeElement && activeElement !== textarea && typeof activeElement.focus === "function") {
      try {
        activeElement.focus({ preventScroll: true });
      } catch {
        activeElement.focus();
      }
    }
  }
}

export function safeTrainingProgress(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

export function slugifyTemplateName(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
}

export function addDaysToDateString(dateValue, days) {
  if (!dateValue || !Number.isFinite(Number(days))) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
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

export function isEmailLike(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function resolveActorProfileDisplayName(profileRow = {}) {
  return String(profileRow.full_name || profileRow.name || profileRow.email || "").trim();
}

export function actorFirstNameMatches(emailFirstName = "", employeeFirstName = "") {
  if (!emailFirstName || !employeeFirstName) return false;
  return emailFirstName === employeeFirstName
    || (emailFirstName.length >= 4 && employeeFirstName.startsWith(emailFirstName))
    || (employeeFirstName.length >= 4 && emailFirstName.startsWith(employeeFirstName));
}

export function formatTrainingHistoryStatusLabel(status = "") {
  const normalized = normalizePctReadinessStatus(status);
  return getPctReadinessStatusPresentation(normalized).label || String(normalized || "").replace(/_/g, " ");
}

export function getTrainingHistoryActionLabel(event = {}) {
  if (event.event_type === "item_status_changed") return "Status changed";
  if (event.event_type === "note_added") return "Observation added";
  if (event.event_type === "record_created") return "Record created";
  if (event.event_type === "record_reopened") return "Record updated";
  return String(event.event_type || "training_event").replace(/_/g, " ");
}

export function getLocalDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function normalizeComplianceHistoryCycleLabel(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dayMatch = raw.match(/(?:review[_\s-]*)?(\d+)[_\s-]*(?:day)?/i);
  if (dayMatch?.[1]) return `${dayMatch[1]} Day`;
  return raw
    .replace(/^performance\s+review\s*/i, "")
    .replace(/^review[_\s-]*/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeComplianceHistoryActionLabel(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "Compliance update";
  return raw
    .replace(/performance\s+review/gi, "Compliance checkpoint")
    .replace(/performance\s+response/gi, "Compliance response")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

export function getComplianceHistoryStatusLabel(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "";
  const labels = {
    scheduled: "Scheduled",
    in_progress: "In Progress",
    completed: "Complete",
    complete: "Complete",
    waived: "Waived",
    overdue: "Overdue",
    evidence_due: "Overdue",
    not_started: "Not Started",
  };
  return labels[normalized] || normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isComplianceHistoryEvent(event = {}) {
  const text = [
    event.event_category,
    event.category,
    event.module,
    event.event_type,
    event.source_table,
    event.title,
    event.summary,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return text.includes("employee_review")
    || text.includes("performance_review")
    || text.includes("performance response")
    || text.includes("performance")
    || text.includes("compliance")
    || text.includes("review checkpoint");
}

export function getComplianceStateLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["complete", "completed"].includes(normalized)) return "Completed";
  if (normalized === "waived") return "Waived";
  if (["not_started", "not-started", "scheduled"].includes(normalized)) return "Not Started";
  if (normalized === "overdue") return "Overdue";
  return normalized ? normalized.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}

export function reviewCycleMatchesKey(cycle = {}, value = "") {
  const target = normalizeLocalReviewCycleKey(value);
  if (!target) return false;
  return [cycle.id, cycle.slug, cycle.baseKey, cycle.requirementId, cycle.policyKey, cycle.requirement?.slug]
    .filter(Boolean)
    .some((candidate) => normalizeLocalReviewCycleKey(candidate) === target);
}

export function getReviewCyclePolicyCell(reviewCycle = {}) {
  return isObjectRow(reviewCycle?.policyCell)
    ? reviewCycle.policyCell
    : isObjectRow(reviewCycle?.requirementStatus)
      ? reviewCycle.requirementStatus
      : {};
}

export function getReviewDraftValue(response, draft, field) {
  if (hasOwnReviewDraftField(draft, field)) return draft[field] ?? "";
  return response?.[field] ?? "";
}

export function isReviewItemDraftDirty(response, draft = {}) {
  return REVIEW_RESPONSE_FIELDS.some((field) => (
    hasOwnReviewDraftField(draft, field)
    && normalizeReviewResponseValue(draft[field]) !== normalizeReviewResponseValue(response?.[field])
  ));
}

export function formatLaborPositionTitle(value = "") {
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

export function getLaborPositionSortIndex(positionTitle, positionHierarchyIndex = {}) {
  return positionHierarchyIndex[normalizePositionTitle(positionTitle)] ?? Number.MAX_SAFE_INTEGER;
}

export function getDefaultPositionWeight(value = "") {
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

export function formatRosterLocationTitle(value = "") {
  return `${formatRosterLocationName(value)} - Team Roster`;
}

export function formatRosterPdfFilename(locationName = "", value = new Date()) {
  return `${formatRosterLocationName(locationName)} Roster - ${formatRosterPdfDate(value)}.pdf`;
}

export function buildUpdatedLaborMetadata(existingMetadata = {}, updates = {}) {
  const nextMetadata = { ...(existingMetadata || {}) };
  const hasEmail = Object.prototype.hasOwnProperty.call(updates, "email");
  const hasPhone = Object.prototype.hasOwnProperty.call(updates, "phone");
  const hasShirtSize = Object.prototype.hasOwnProperty.call(updates, "shirtSize");
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

  if (hasShirtSize) {
    const normalizedShirtSize = normalizeLaborShirtSize(updates.shirtSize);
    if (normalizedShirtSize) nextMetadata.shirt_size = normalizedShirtSize;
    else delete nextMetadata.shirt_size;
  }

  if (hasPerformanceReviewTemplateRole) {
    const roleKey = normalizePerformanceReviewTemplateRoleKey(updates.performanceReviewTemplateRole);
    if (roleKey) nextMetadata[PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY] = roleKey;
    else delete nextMetadata[PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY];
  }

  return nextMetadata;
}

export function clearRestartedReviewMetadata(existingMetadata = {}, restartDetails = {}) {
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

export function getTrainingResultReadinessStatus(result = {}) {
  const metadata = isObjectRow(result?.metadata) ? result.metadata : {};
  const metadataStatus = metadata.pct_readiness_status
    || result.pct_readiness_status
    || result.readiness_status
    || "";
  const normalizedMetadataStatus = normalizePctReadinessStatus(metadataStatus);
  if (normalizedMetadataStatus && normalizedMetadataStatus !== "not_started") return normalizedMetadataStatus;

  const rawStatus = String(result?.status || "").trim().toLowerCase();
  if (rawStatus === "complete" || rawStatus === "completed" || rawStatus === "passed") return "verified";
  if (rawStatus === "waived") return "waived";
  if (rawStatus === "in_progress") return "demonstrated";
  return normalizePctReadinessStatus(rawStatus);
}

export function isReadinessDemonstratedStatus(status = "") {
  const normalized = normalizePctReadinessStatus(status);
  return normalized === "demonstrated" || isReadinessVerifiedStatus(normalized);
}

export function toObjectRows(rows = []) {
  return Array.isArray(rows) ? rows.filter(isObjectRow) : [];
}

export function trainingRequirementEvidencePolicy(requirementRow = {}) {
  return normalizeComplianceEvidencePolicy(
    requirementRow.evidencePolicy
    || requirementRow.evidence_policy
    || requirementRow.requirement?.evidence_policy
    || requirementRow.policyRequirement?.evidence_policy
    || requirementRow.metadata?.evidence_policy
    || requirementRow.requirement?.metadata?.evidence_policy
    || requirementRow.evidenceMode
    || requirementRow.evidence_mode
  );
}

export function getTrainingRequirementRenewalIntervalDays(requirementRow = {}) {
  const dueRule = readTrainingRequirementDueRule(requirementRow);
  const rawValue = requirementRow.renewalIntervalDays
    ?? requirementRow.renewal_interval_days
    ?? requirementRow.requirement?.renewal_interval_days
    ?? requirementRow.policyRequirement?.renewal_interval_days
    ?? requirementRow.metadata?.renewal_interval_days
    ?? requirementRow.requirement?.metadata?.renewal_interval_days
    ?? dueRule.renewal_interval_days
    ?? dueRule.renewalIntervalDays;
  const days = Number(rawValue);
  return Number.isFinite(days) && days > 0 ? days : null;
}

export function isCustomComplianceRequirement(row = {}) {
  if (!isObjectRow(row) || row.is_active === false) return false;
  const metadata = isObjectRow(row.metadata) ? row.metadata : {};
  return String(row.scope_type || "") === "location"
    && String(row.requirement_kind || "") === "review_checkpoint"
    && (
      String(row.display_group || "") === "custom"
      || metadata.ui_kind === "custom_yes_no"
      || String(row.slug || "").startsWith("custom_")
    );
}

export function getOffsetDaysForRequirement(row = {}) {
  const dueRule = isObjectRow(row.due_rule) ? row.due_rule : (isObjectRow(row.dueRule) ? row.dueRule : {});
  const candidates = [
    row.offset_days,
    row.offsetDays,
    dueRule.offset_days,
    dueRule.offsetDays,
    row.metadata && isObjectRow(row.metadata) ? row.metadata.offset_days : null,
    row.metadata && isObjectRow(row.metadata) ? row.metadata.offsetDays : null,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function formatComplianceRequirementDueRule(row = {}) {
  const dueRule = isObjectRow(row.due_rule) ? row.due_rule : {};
  const offsetDays = Number(dueRule.offset_days);
  if (dueRule.anchor === "start_date" && Number.isFinite(offsetDays) && offsetDays > 0) {
    return `Start date + ${offsetDays} days`;
  }
  const renewalDays = Number(dueRule.renewal_interval_days);
  if (Number.isFinite(renewalDays) && renewalDays > 0) return `Renews every ${renewalDays} days`;
  return row.renewal_due_date_required ? "Renewal date required" : "One time";
}

export function normalizeLegacyPctReadinessBoard(boardData = null) {
  if (!isObjectRow(boardData)) return buildEmptyReadinessBoard(getTeamReadinessTemplateOption(PCT_READINESS_TEMPLATE_SLUG));
  const summary = isObjectRow(boardData.summary) ? boardData.summary : {};
  const totalActiveTrainees = Number(summary.total_active_trainees ?? summary.total_active_pct_trainees ?? 0);
  const averageReadiness = Number(summary.average_readiness ?? summary.average_completion ?? 0);
  return {
    ...boardData,
    summary: {
      ...summary,
      template_slug: PCT_READINESS_TEMPLATE_SLUG,
      total_active_trainees: totalActiveTrainees,
      total_active_pct_trainees: Number(summary.total_active_pct_trainees ?? totalActiveTrainees),
      average_demonstrated: Number(summary.average_demonstrated ?? averageReadiness),
      average_completion: Number(summary.average_completion ?? averageReadiness),
      average_readiness: averageReadiness,
    },
  };
}

export function getLaborEmployeeRowId(row = {}) {
  if (!isObjectRow(row)) return null;
  return row.labor_employee_id || row.employee_id || row.id || null;
}

export function getTrainingRecordEmployeeId(record = {}) {
  if (!isObjectRow(record)) return null;
  return record.labor_employee_id || record.employee_id || null;
}

export function formatHourAnalysisHours(value) {
  const normalized = normalizeHourAnalysisNumber(value, 0);
  if (Number.isInteger(normalized)) return String(normalized);
  return normalized.toFixed(1).replace(/\.0$/, "");
}

export function normalizeHourAnalysisGroupKey(value, row = {}) {
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

export function getHourAnalysisGroupLabel(value) {
  return HOUR_ANALYSIS_GROUP_LABELS[value] || HOUR_ANALYSIS_GROUP_LABELS.other;
}

export function getLaborModelCoverageRoleOption(value = "") {
  const alias = normalizeLaborModelCoverageAlias(value);
  if (!alias) return null;
  return LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP.get(alias) || LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP.get(alias.replace(/\s+/g, "")) || null;
}

export function mixLaborModelHexColor(base = "#334155", mix = "#ffffff", mixWeight = 0.5) {
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

export function parseLaborModelTimeRange(label = "") {
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

export function formatLaborModelTimeRange(start = 0, end = 0) {
  return `${formatLaborModelTimePoint(start)}-${formatLaborModelTimePoint(end)}`;
}

export function normalizeLaborModelBreakerMinute(value) {
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

export function normalizeHourAnalysisRangeOrder(range = {}) {
  const rawExpected = normalizeHourAnalysisNumber(range.expected ?? range.preferred ?? range.hours, 0);
  const rawMin = normalizeHourAnalysisNumber(range.min ?? range.minimum ?? range.min_hours, rawExpected);
  const rawMax = normalizeHourAnalysisNumber(range.max ?? range.maximum ?? range.max_hours, Math.max(rawExpected, rawMin));
  const min = Math.min(rawMin, rawExpected, rawMax);
  const max = Math.max(rawMin, rawExpected, rawMax);
  const expected = Math.max(min, Math.min(max, rawExpected));
  return { min, expected, max };
}

export function readHourAnalysisGroupInput(input = {}, groupKey = "other") {
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

export function normalizeHourAnalysisOverrideRange(value = {}) {
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

export function normalizeHourAnalysisNotes(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    const note = String(value || "").trim();
    if (!employeeKey || !note) return [];
    return [[employeeKey, note]];
  }));
}

export function normalizeHourAnalysisSkeletonMap(input = {}) {
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

export function readStaffingCapacityPercent(source = {}, keys = [], fallback = 0) {
  const matchedKey = keys.find((key) => source[key] != null && source[key] !== "");
  return clampHourAnalysisPercent(matchedKey ? source[matchedKey] : fallback, 0, 90);
}

export function calculateLaborShiftHours(startValue, endValue, fallbackHours = null) {
  const explicit = Number(fallbackHours);
  const start = parseLaborShiftMinutes(startValue);
  const end = parseLaborShiftMinutes(endValue);
  if (start == null || end == null) {
    return Number.isFinite(explicit) && explicit > 0 ? normalizeHourAnalysisNumber(explicit, 0) : 0;
  }
  const adjustedEnd = end <= start ? end + (24 * 60) : end;
  return normalizeHourAnalysisNumber((adjustedEnd - start) / 60, 0);
}

export function addHourAnalysisRangeDelta(target, range = {}, delta = 1) {
  const multiplier = Number(delta);
  const normalizedDelta = Number.isFinite(multiplier) ? multiplier : 1;
  HOUR_ANALYSIS_RANGE_KEYS.forEach((key) => {
    target[key] = normalizeHourAnalysisDelta(target[key] + (readHourAnalysisRangeNumber(range[key]) * normalizedDelta));
  });
}

export function getHourAnalysisDefaultCoverageSplit(row = {}, groupKey = "other") {
  const title = normalizePositionTitle(row.position_title || row.position || "");
  if (groupKey === "supervisor" && title.includes("csr") && title.includes("supervisor")) {
    return { floor_group: "csr", admin_hours: 8 };
  }
  if (groupKey === "supervisor" && title.includes("pct") && title.includes("supervisor")) {
    return { floor_group: "pct", admin_hours: 8 };
  }
  return { floor_group: "", admin_hours: null };
}

export function buildHourAnalysisRangeFromHours(hours = 0) {
  const expected = normalizeHourAnalysisNumber(hours, 0);
  return { min: expected, expected, max: expected };
}

export function calculateHourAnalysisRecommendedTarget(requiredWeekly = 0, reservePercent = HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT) {
  const required = normalizeHourAnalysisNumber(requiredWeekly, 0);
  const reserve = Math.max(0, Math.min(90, normalizeHourAnalysisNumber(reservePercent, HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT)));
  if (required <= 0) return 0;
  if (reserve <= 0) return required;
  return normalizeHourAnalysisNumber(required * (1 + (reserve / 100)), 0);
}

export function getHourAnalysisToleranceHours(boundaryValue = 0, tolerancePercent = HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT) {
  const boundary = normalizeHourAnalysisNumber(Math.abs(Number(boundaryValue) || 0), 0);
  const tolerance = clampHourAnalysisPercent(tolerancePercent, 0, 90);
  if (boundary <= 0 || tolerance <= 0) return 0;
  return normalizeHourAnalysisDelta(Math.max(HOUR_ANALYSIS_MIN_TOLERANCE_HOURS, boundary * (tolerance / 100)));
}

export function getNiceStaffingCapacityChartMax(maxValue = 0) {
  const paddedMax = Math.max(10, normalizeHourAnalysisNumber(maxValue, 0) * 1.12);
  const magnitude = 10 ** Math.floor(Math.log10(paddedMax));
  const normalized = paddedMax / magnitude;
  const niceNormalized = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 2.5
        ? 2.5
        : normalized <= 5
          ? 5
          : normalized <= 6
            ? 6
            : 10;
  return normalizeHourAnalysisNumber(niceNormalized * magnitude, 0);
}

export function getStaffingCapacityChartPct(value = 0, chartMax = 0) {
  const max = normalizeHourAnalysisNumber(chartMax, 0);
  if (max <= 0) return 0;
  return clampHourAnalysisPercent((normalizeHourAnalysisNumber(value, 0) / max) * 100, 0, 100);
}

export function openPdfBlob(filename, bytes, { print = false } = {}) {
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

export function normalizeActorLookupEmail(value = "") {
  const email = String(value || "").trim().toLowerCase();
  return isEmailLike(email) ? email : "";
}

export function getNormalizedNameTokens(value = "") {
  return normalizeEmployeeName(value)
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function resolveVerifiedActorDisplayName(row = {}, fallback = "Staff") {
  const candidates = [
    row.actor_full_name,
    row.actorFullName,
    row.verified_actor_name,
    row.verifiedActorName,
    row.created_by_full_name,
    row.createdByFullName,
    row.updated_by_full_name,
    row.updatedByFullName,
    row.actor_name,
    row.actorName,
    row.created_by_name,
    row.createdByName,
    row.updated_by_name,
    row.updatedByName,
    row.email,
    row.actor_email,
    row.created_by_email,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const fullName = candidates.find((value) => !isEmailLike(value));
  return fullName || candidates[0] || fallback;
}

export function getTrainingHistoryStateStatus(state = {}) {
  if (!isObjectRow(state)) return "";
  const metadata = isObjectRow(state.metadata) ? state.metadata : {};
  return normalizePctReadinessStatus(
    metadata.pct_readiness_status
    || state.pct_readiness_status
    || state.readiness_status
    || state.status
    || state.item_status
    || state.training_item_status
    || ""
  );
}

export function resolveTrainingHistoryRecord(row = {}, recordMap = {}) {
  return recordMap[row.record_id] || (isObjectRow(row.training_records) ? row.training_records : {}) || {};
}

export function getTrainingHistoryRowDate(row = {}) {
  return getLocalDateKey(row.created_at || row.occurred_at || row.updated_at);
}

export function readComplianceHistoryState(event = {}, key = "new") {
  const preferred = key === "old"
    ? (event.old_values || event.before_state)
    : (event.new_values || event.after_state);
  return isObjectRow(preferred) ? preferred : {};
}

export function readComplianceHistoryMetadata(row = {}) {
  return isObjectRow(row.metadata) ? row.metadata : {};
}

export function readComplianceAuditSnapshot(event = {}, key = "after_snapshot") {
  return isObjectRow(event?.[key]) ? event[key] : {};
}

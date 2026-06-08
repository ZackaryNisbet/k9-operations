// K9 Operations — Training Module: extracted pure helper functions.
// Moved verbatim from TrainingPage.jsx (no behavior change).

import { TEAM_READINESS_TEMPLATE_OPTIONS, getPctReadinessStatusPresentation, normalizePctReadinessStatus, readLaborEmployeeContactValue, readLaborEmploymentCommitment } from "../../trainingData";
import { HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT, HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS, HOUR_ANALYSIS_GROUPS, HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT, HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT, HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT, HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT, LABOR_CAPACITY_MODEL_DEFAULT_NAME, LABOR_CAPACITY_MODEL_TABLE_MISSING_CODES, LABOR_MODEL_DAY_KEYS, LABOR_ROSTER_PRINT_DATE_FORMATTER, REVIEW_CYCLE_SORT_KEY_PREFIX } from "./constants";
import { PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY, normalizePerformanceReviewTemplateRoleKey } from "../../performanceReviewData";
import { PCT_READINESS_TEMPLATE_SLUG, getLaborRosterPositionGroup, getTeamReadinessTemplateOption, normalizeLaborShirtSize } from "../../trainingData";
import { DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON, HOUR_ANALYSIS_GROUP_LABELS, HOUR_ANALYSIS_MIN_TOLERANCE_HOURS, HOUR_ANALYSIS_RANGE_KEYS, LABOR_MODEL_ROLE_COVERAGE_ALIAS_MAP, RESTARTED_REVIEW_METADATA_KEYS, REVIEW_RESPONSE_FIELDS } from "./constants";
import { normalizeOptionalUuid } from "../../trainingData";
import { HOUR_ANALYSIS_GROUP_SHORT_LABELS, HOUR_ANALYSIS_STAFFING_CAPACITY_GROUP_KEYS, LABOR_DEFAULT_SORT, LABOR_MODEL_FULL_COVERAGE_VALUE, LABOR_MODEL_HALF_COVERAGE_VALUE, LABOR_MODEL_MARKETING_COVERAGE_VALUE, LABOR_MODEL_MARKETING_TOKENS, LEGACY_LABOR_MODEL_ACTIVE_TOKENS } from "./constants";
import { getTeamReadinessTemplateDisplayLabel } from "../../trainingData";
import { COMPLIANCE_EVIDENCE_REQUIRED_POLICIES, DEFAULT_LABOR_POSITION_ACRONYMS, HOUR_ANALYSIS_FRONTLINE_TARGET_RANGE_LABEL, LABOR_MODEL_DEFAULT_BREAKERS_BY_DAY } from "./constants";
import { DEFAULT_HOUR_ANALYSIS_EXPECTATIONS } from "./constants";

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

export function findReviewCycleRowBySortKey(row = {}, sortKey = "") {
  if (!String(sortKey || "").startsWith(REVIEW_CYCLE_SORT_KEY_PREFIX)) return null;
  const cycleKey = String(sortKey).slice(REVIEW_CYCLE_SORT_KEY_PREFIX.length);
  return toObjectRows(row.cycles || row.performance_review_compliance?.cycleRows)
    .find((cycle) => reviewCycleMatchesKey(cycle, cycleKey)) || null;
}

export function getReviewCycleRequirementId(reviewCycle = {}) {
  const policyCell = getReviewCyclePolicyCell(reviewCycle);
  return normalizeOptionalUuid(reviewCycle?.requirementId)
    || normalizeOptionalUuid(reviewCycle?.requirement?.id)
    || normalizeOptionalUuid(policyCell.requirement_id)
    || normalizeOptionalUuid(policyCell.requirementId)
    || normalizeOptionalUuid(reviewCycle?.policyKey)
    || normalizeOptionalUuid(reviewCycle?.requirement?.parent_requirement_id)
    || normalizeOptionalUuid(policyCell.parent_requirement_id)
    || normalizeOptionalUuid(policyCell.policy_key)
    || "";
}

export function getReviewCycleLegacyReviewCycle(reviewCycle = {}) {
  const policyCell = getReviewCyclePolicyCell(reviewCycle);
  const compatibility = isObjectRow(policyCell.compatibility) ? policyCell.compatibility : {};
  const requirementMetadata = isObjectRow(reviewCycle?.requirement?.metadata) ? reviewCycle.requirement.metadata : {};
  return reviewCycle?.legacyReviewCycle
    || policyCell.legacy_review_cycle
    || policyCell.legacyReviewCycle
    || compatibility.legacy_review_cycle
    || requirementMetadata.legacy_review_cycle
    || "";
}

export function getReviewCycleOffsetDays(reviewCycle = {}) {
  const policyCell = getReviewCyclePolicyCell(reviewCycle);
  const dueRule = isObjectRow(reviewCycle?.dueRule)
    ? reviewCycle.dueRule
    : isObjectRow(reviewCycle?.requirement?.due_rule)
      ? reviewCycle.requirement.due_rule
      : isObjectRow(policyCell.due_rule)
        ? policyCell.due_rule
        : {};
  const numericCandidates = [
    reviewCycle?.offsetDays,
    reviewCycle?.offset_days,
    reviewCycle?.requirement?.offset_days,
    reviewCycle?.requirement?.offsetDays,
    policyCell.offset_days,
    policyCell.offsetDays,
    dueRule.offset_days,
    dueRule.offsetDays,
    reviewCycle?.shortLabel,
  ];
  for (const candidate of numericCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const labelMatch = String(reviewCycle?.label || reviewCycle?.title || reviewCycle?.slug || "").match(/(\d+)\s*-?\s*day/i);
  return labelMatch ? Number(labelMatch[1]) : null;
}

export function getReviewCycleEvidencePolicy(reviewCycle = {}) {
  const policyCell = getReviewCyclePolicyCell(reviewCycle);
  return reviewCycle?.evidencePolicy
    || reviewCycle?.requirement?.evidence_policy
    || policyCell.evidence_policy
    || policyCell.evidencePolicy
    || "checkbox_only";
}

export function isReviewItemAnswered(response, draft = {}) {
  return REVIEW_RESPONSE_FIELDS.some((field) => normalizeReviewResponseValue(getReviewDraftValue(response, draft, field)));
}

export function deriveLaborPositionInitials(title = "") {
  const words = formatLaborPositionTitle(title)
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.map((word) => word.charAt(0)).join("").toUpperCase().slice(0, 6);
}

export function sortLaborRowsByConfig(rows = [], sort = LABOR_DEFAULT_SORT, positionHierarchyIndex = {}, getSortValue = () => "") {
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

export function trainingRequirementAllowsReferenceUrl(requirementRow = {}) {
  const policy = trainingRequirementEvidencePolicy(requirementRow);
  return ["url_or_reference", "pdf_or_url", "reference_url", "external_url"].includes(policy);
}

export function trainingRequirementRequiresFileEvidence(requirementRow = {}) {
  const policy = trainingRequirementEvidencePolicy(requirementRow);
  return !["checkbox_only", "none", "internal_module"].includes(policy);
}

export function trainingRequirementRequiresRenewalDueDate(requirementRow = {}) {
  if (requirementRow.renewalDueDateRequired === true || requirementRow.renewal_due_date_required === true) return true;
  if (requirementRow.requirement?.renewal_due_date_required === true || requirementRow.policyRequirement?.renewal_due_date_required === true) return true;
  if (requirementRow.metadata?.renewal_due_date_required === true || requirementRow.requirement?.metadata?.renewal_due_date_required === true) return true;
  const frequency = String(requirementRow.frequency || requirementRow.requirement?.frequency || requirementRow.metadata?.frequency || "").toLowerCase();
  return ["annual", "annually", "renewing", "recurring"].includes(frequency) || Boolean(getTrainingRequirementRenewalIntervalDays(requirementRow));
}

export function findPolicyReviewCellForCycle(cells = [], cycle = {}) {
  const cycleRequirementId = String(cycle.requirementId || cycle.requirement?.id || "");
  const cycleSlug = String(cycle.requirement?.slug || cycle.id || "");
  return toObjectRows(cells).find((cell) => {
    const cellRequirementId = String(cell.requirement_id || cell.requirementId || "");
    const cellParentRequirementId = String(cell.parent_requirement_id || cell.parentRequirementId || "");
    const cellSlug = String(cell.slug || cell.requirement_slug || "");
    return (cycleRequirementId && (cellRequirementId === cycleRequirementId || cellParentRequirementId === cycleRequirementId))
      || (cycleSlug && (cellSlug === cycleSlug || cellSlug.replace(/_day$/, "") === cycleSlug.replace(/_day$/, "")));
  }) || null;
}

export function getEditableTemplateDraftVersion(versions = [], templateId = "") {
  const targetTemplateId = String(templateId || "").trim();
  if (!targetTemplateId) return null;
  return toObjectRows(versions)
    .filter((version) => String(version.template_id || "") === targetTemplateId && String(version.status || "").toLowerCase() === "draft")
    .sort(compareTemplateVersionRecency)[0] || null;
}

export function buildTemplatePreviewVersionStats({
  kind = "training",
  versionId = "",
  sections = [],
  items = [],
  reviewSections = [],
  reviewItems = [],
} = {}) {
  const targetVersionId = String(versionId || "").trim();
  if (!targetVersionId) return { sectionCount: 0, itemCount: 0 };
  if (kind === "review") {
    return {
      sectionCount: toObjectRows(reviewSections).filter((section) => section.template_version_id === targetVersionId).length,
      itemCount: toObjectRows(reviewItems).filter((item) => item.template_version_id === targetVersionId).length,
    };
  }
  return {
    sectionCount: toObjectRows(sections).filter((section) => section.template_version_id === targetVersionId && !section.parent_section_id).length,
    itemCount: toObjectRows(items).filter((item) => item.template_version_id === targetVersionId).length,
  };
}

export function flattenTrainingTemplatePreviewItems(section = {}) {
  const directItems = toObjectRows(section.directItems);
  const childItems = toObjectRows(section.children).flatMap((child) => toObjectRows(child.items));
  return [...directItems, ...childItems];
}

export function formatHourAnalysisHoursWithUnit(value) {
  const normalized = normalizeHourAnalysisNumber(value, 0);
  return `${formatHourAnalysisHours(normalized)} hr${normalized === 1 ? "" : "s"}`;
}

export function getHourAnalysisEmployeeKey(row = {}) {
  return getLaborEmployeeRowId(row)
    || normalizeLaborContactEmail(row.contact_email || row.email)
    || normalizeEmployeeName(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "));
}

export function getHourAnalysisGroupKey(row = {}) {
  const positionTitle = row.position_title || row.position || "";
  const normalizedTitle = normalizePositionTitle(positionTitle);
  if (normalizedTitle.includes("assistant manager")) return "assistant_manager";
  if (normalizedTitle.includes("general manager") || normalizedTitle.includes("director") || normalizedTitle.includes("regional") || normalizedTitle.includes("manager")) return "general_manager";
  const explicitGroup = row.hour_analysis_group || row.group_key || row.groupKey || row.position_group;
  if (explicitGroup) return normalizeHourAnalysisGroupKey(explicitGroup, { position_title: positionTitle });
  return normalizeHourAnalysisGroupKey(getLaborRosterPositionGroup(positionTitle), { position_title: positionTitle });
}

export function getHourAnalysisGroupShortLabel(value) {
  return HOUR_ANALYSIS_GROUP_SHORT_LABELS[value] || getHourAnalysisGroupLabel(value);
}

export function getConfiguredHourAnalysisGroupLabel(value, groupDisplay = null) {
  return groupDisplay?.[value]?.label || getHourAnalysisGroupLabel(value);
}

export function parseLaborModelCoverageCompound(value = "") {
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

export function normalizeLaborModelBreakerList(value, fallback = []) {
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

export function validateLaborModelColumns(columns = []) {
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

export function normalizeHourAnalysisLaborModelColumn(column = {}, index = 0, dayKey = "day") {
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

export function buildPlannedCrossRoleCoverageRows({ modelCoverageRows = [], personRows = [] } = {}) {
  const modelRows = toObjectRows(modelCoverageRows).map((row) => ({
    key: `model:${row.key}`,
    type: "model",
    source_label: `${row.from_label} model row`,
    home_label: row.from_label,
    covers_label: row.to_label,
    hours: normalizeHourAnalysisNumber(row.hours, 0),
    detail_label: (Array.isArray(row.day_labels) ? row.day_labels : []).filter(Boolean).join(", ") || "Active model",
    sort_key: `1:${row.from_label}:${row.to_label}`,
  }));
  const splitRows = toObjectRows(personRows)
    .filter((row) => row.isSplit && row.split?.floor_group && normalizeHourAnalysisNumber(row.split?.floor_hours, 0) > 0)
    .map((row) => {
      const homeLabel = row.groupLabel || getHourAnalysisGroupLabel(row.groupKey);
      const floorLabel = getHourAnalysisGroupLabel(row.split.floor_group);
      const primaryHours = normalizeHourAnalysisNumber(row.split.primary_hours ?? row.split.admin_hours ?? row.preferredHours, 0);
      const floorHours = normalizeHourAnalysisNumber(row.split.floor_hours, 0);
      return {
        key: `split:${row.employeeKey || row.id || row.full_name}`,
        type: row.isWhatIf ? "what_if_split" : "person_split",
        source_label: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed employee",
        home_label: homeLabel,
        covers_label: floorLabel,
        hours: floorHours,
        detail_label: `${formatHourAnalysisHours(primaryHours)} ${homeLabel} + ${formatHourAnalysisHours(floorHours)} ${floorLabel}`,
        sort_key: `0:${row.full_name || ""}:${floorLabel}`,
      };
    });

  return [...splitRows, ...modelRows]
    .filter((row) => row.hours > 0)
    .sort((left, right) => left.sort_key.localeCompare(right.sort_key));
}

export function buildHourAnalysisRangeFromExpected(value, defaults = {}, commitment = "full_time") {
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

export function updateHourAnalysisRangeBand(range = {}, band = "expected", value = 0) {
  const normalizedBand = HOUR_ANALYSIS_RANGE_KEYS.includes(band) ? band : "expected";
  return normalizeHourAnalysisRangeOrder({
    ...normalizeHourAnalysisRangeOrder(range),
    [normalizedBand]: normalizeHourAnalysisNumber(value, 0),
  });
}

export function normalizeHourAnalysisOverrides(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    if (!employeeKey) return [];
    const overrides = normalizeHourAnalysisOverrideRange(value);
    if (Object.keys(overrides).length === 0) return [];
    return [[employeeKey, overrides]];
  }));
}

export function normalizeHourAnalysisCoverageSplit(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const floorGroup = normalizeHourAnalysisGroupKey(source.floor_group || source.floorGroup || source.floor_role || source.floorRole);
  const normalizedFloorGroup = ["csr", "pct"].includes(floorGroup) ? floorGroup : "";
  const hasAdminHours = source.admin_hours != null || source.adminHours != null || source.primary_hours != null || source.primaryHours != null;
  return {
    floor_group: normalizedFloorGroup,
    admin_hours: hasAdminHours ? normalizeHourAnalysisNumber(source.admin_hours ?? source.adminHours ?? source.primary_hours ?? source.primaryHours, 0) : null,
  };
}

export function normalizeHourAnalysisAuditLog(input = []) {
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

export function normalizeStaffingCapacitySettings(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const roleSource = source.roles || source.role_settings || source.roleSettings || source.groups || source.position_groups || {};
  const normalizedRoles = Object.fromEntries(HOUR_ANALYSIS_STAFFING_CAPACITY_GROUP_KEYS.map((groupKey) => {
    const rawRole = isObjectRow(roleSource[groupKey]) ? roleSource[groupKey] : {};
    const defaults = getDefaultStaffingCapacityRoleSettings(groupKey);
    const tolerancePercent = readStaffingCapacityPercent(rawRole, ["tolerancePercent", "tolerance_percent", "varianceTolerancePercent", "variance_tolerance_percent"], defaults.tolerancePercent);
    const rawLower = readStaffingCapacityPercent(rawRole, ["lowerBufferPercent", "lower_buffer_percent", "healthyMinPercent", "healthy_min_percent"], defaults.lowerBufferPercent);
    const rawTarget = readStaffingCapacityPercent(rawRole, ["targetBufferPercent", "target_buffer_percent", "reservePercent", "reserve_percent"], defaults.targetBufferPercent);
    const rawUpper = readStaffingCapacityPercent(rawRole, ["upperBufferPercent", "upper_buffer_percent", "healthyMaxPercent", "healthy_max_percent"], defaults.upperBufferPercent);
    const lowerBufferPercent = Math.min(rawLower, rawUpper);
    const upperBufferPercent = Math.max(rawLower, rawUpper);
    const targetBufferPercent = clampHourAnalysisPercent(rawTarget, lowerBufferPercent, upperBufferPercent);
    const overRosteredBufferPercent = Math.max(
      upperBufferPercent,
      readStaffingCapacityPercent(rawRole, ["overRosteredBufferPercent", "over_rostered_buffer_percent", "overRosteredPercent", "over_rostered_percent"], defaults.overRosteredBufferPercent),
    );
    return [groupKey, {
      tolerancePercent,
      lowerBufferPercent,
      targetBufferPercent,
      upperBufferPercent,
      overRosteredBufferPercent,
    }];
  }));
  return { roles: normalizedRoles };
}

export function normalizeStaffingRoleKey(value = "", row = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (["pct", "pet care technician", "pet care tech", "kennel technician"].includes(normalized)) return "pct";
  if (["csr", "customer service representative", "guest service representative", "front desk"].includes(normalized)) return "csr";
  if (["sup", "supervisor", "shift supervisor", "shift lead"].includes(normalized)) return "supervisor";
  if (["gm", "general manager"].includes(normalized)) return "general_manager";
  if (["am", "agm", "assistant manager", "assistant general manager"].includes(normalized)) return "assistant_manager";
  if (["mod", "manager on duty", "manager"].includes(normalized)) return "management";
  const hourGroup = normalizeHourAnalysisGroupKey(raw, row);
  return hourGroup === "other" ? "" : hourGroup;
}

export function getStaffPlanEntries(plan = {}) {
  const entries = Array.isArray(plan.shift_entries)
    ? plan.shift_entries
    : Array.isArray(plan.staff_names)
      ? plan.staff_names
      : [];
  return entries.map((entry, index) => {
    if (typeof entry === "string") {
      return {
        id: `${plan.id || plan.plan_date || "plan"}-${index}`,
        labor_employee_id: "",
        name: entry,
        position: "",
        shift_start: "",
        shift_end: "",
        hours: 0,
      };
    }
    const source = isObjectRow(entry) ? entry : {};
    const start = source.shift_start || source.start_time || source.startTime || source.start || "";
    const end = source.shift_end || source.end_time || source.endTime || source.end || "";
    const hours = calculateLaborShiftHours(start, end, source.hours ?? source.duration_hours ?? source.durationHours);
    return {
      id: String(source.id || `${plan.id || plan.plan_date || "plan"}-${index}`).trim(),
      labor_employee_id: String(source.labor_employee_id || source.laborEmployeeId || source.employee_id || source.employeeId || "").trim(),
      name: String(source.name || source.full_name || source.employee_name || source.employeeName || "").trim(),
      position: String(source.position || source.role || source.shift_position || source.shiftPosition || "").trim(),
      shift_start: String(start || "").trim(),
      shift_end: String(end || "").trim(),
      hours,
    };
  });
}

export function addHourAnalysisRange(target, range = {}) {
  addHourAnalysisRangeDelta(target, range, 1);
}

export function mergeHourAnalysisRange(inheritedRange = {}, overrideRange = {}) {
  const inherited = normalizeHourAnalysisRangeOrder(inheritedRange);
  const overrides = normalizeHourAnalysisOverrideRange(overrideRange);
  return normalizeHourAnalysisRangeOrder(Object.fromEntries(HOUR_ANALYSIS_RANGE_KEYS.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : inherited[key],
  ])));
}

export function buildHourAnalysisCapacityStandard(requiredWeekly = 0, reliefPercent = HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT, settings = {}) {
  const floor = normalizeHourAnalysisNumber(requiredWeekly, 0);
  const source = isObjectRow(settings) ? settings : {};
  const relief = Math.max(0, Math.min(90, normalizeHourAnalysisNumber(source.targetBufferPercent ?? source.target_buffer_percent ?? reliefPercent, 0)));
  const healthyMinPercent = relief > 0
    ? readStaffingCapacityPercent(source, ["lowerBufferPercent", "lower_buffer_percent", "healthyMinPercent", "healthy_min_percent"], HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT)
    : 0;
  const healthyMaxPercent = relief > 0
    ? Math.max(
      healthyMinPercent,
      readStaffingCapacityPercent(source, ["upperBufferPercent", "upper_buffer_percent", "healthyMaxPercent", "healthy_max_percent"], HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT),
    )
    : 0;
  const overRosteredPercent = relief > 0
    ? Math.max(
      healthyMaxPercent,
      readStaffingCapacityPercent(source, ["overRosteredBufferPercent", "over_rostered_buffer_percent", "overRosteredPercent", "over_rostered_percent"], HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT),
    )
    : 0;
  const tolerancePercent = readStaffingCapacityPercent(source, ["tolerancePercent", "tolerance_percent", "varianceTolerancePercent", "variance_tolerance_percent"], HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT);
  const targetWeekly = calculateHourAnalysisRecommendedTarget(floor, relief);
  const healthyLowWeekly = calculateHourAnalysisRecommendedTarget(floor, healthyMinPercent);
  const healthyHighWeekly = calculateHourAnalysisRecommendedTarget(floor, healthyMaxPercent);
  const overRosteredWeekly = calculateHourAnalysisRecommendedTarget(floor, overRosteredPercent);
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
    healthyMinPercent,
    healthyMaxPercent,
    overRosteredPercent,
    tolerancePercent,
    targetUtilization: targetWeekly > 0 ? normalizeHourAnalysisNumber((floor / targetWeekly) * 100, 0) : 0,
  };
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

export function formatHourAnalysisSignedDelta(value = 0) {
  const delta = normalizeHourAnalysisDelta(value);
  if (delta === 0) return "0 hrs";
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatHourAnalysisHours(Math.abs(delta))} hrs`;
}

export function buildHourAnalysisCapacityToleranceState({
  expected = 0,
  floor = 0,
  targetLow = 0,
  targetHigh = 0,
  target = 0,
  hasTargetRange = false,
  tolerancePercent = HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT,
} = {}) {
  const value = normalizeHourAnalysisNumber(expected, 0);
  const targetFloor = normalizeHourAnalysisNumber(floor, 0);
  const targetMid = normalizeHourAnalysisNumber(target, targetFloor);
  const lower = normalizeHourAnalysisNumber(targetLow, targetMid);
  const upper = normalizeHourAnalysisNumber(targetHigh, lower);
  if (hasTargetRange && value < lower) {
    const delta = normalizeHourAnalysisDelta(value - lower);
    const toleranceHours = getHourAnalysisToleranceHours(lower, tolerancePercent);
    return {
      relation: "below-range",
      delta,
      boundary: lower,
      boundaryLabel: "lower range",
      toleranceHours,
      withinTolerance: Math.abs(delta) <= toleranceHours,
    };
  }
  if (hasTargetRange && value > upper) {
    const delta = normalizeHourAnalysisDelta(value - upper);
    const toleranceHours = getHourAnalysisToleranceHours(upper, tolerancePercent);
    return {
      relation: "above-range",
      delta,
      boundary: upper,
      boundaryLabel: "upper range",
      toleranceHours,
      withinTolerance: Math.abs(delta) <= toleranceHours,
    };
  }
  if (hasTargetRange) {
    return {
      relation: "in-range",
      delta: 0,
      boundary: targetMid,
      boundaryLabel: "target range",
      toleranceHours: getHourAnalysisToleranceHours(targetMid, tolerancePercent),
      withinTolerance: true,
    };
  }
  const delta = normalizeHourAnalysisDelta(value - targetMid);
  const toleranceHours = getHourAnalysisToleranceHours(targetMid || targetFloor, tolerancePercent);
  return {
    relation: delta < 0 ? "below-target" : delta > 0 ? "above-target" : "aligned",
    delta,
    boundary: targetMid,
    boundaryLabel: targetMid === targetFloor ? "floor / target" : "target",
    toleranceHours,
    withinTolerance: Math.abs(delta) <= toleranceHours,
  };
}

export function formatStaffingCapacityBarHours(value = 0) {
  return `${formatHourAnalysisHours(value)}h`;
}

export function isTrainingRecordForEmployee(record = {}, employee = {}) {
  const employeeId = getLaborEmployeeRowId(employee);
  const recordEmployeeId = getTrainingRecordEmployeeId(record);
  if (employeeId && recordEmployeeId) return employeeId === recordEmployeeId;

  const employeeName = normalizeEmployeeName(employee.full_name);
  const recordName = normalizeEmployeeName(record.employee_full_name);
  return Boolean(employeeName && recordName && employeeName === recordName);
}

export function getActorEmailNameParts(value = "") {
  const email = normalizeActorLookupEmail(value);
  if (!email) return null;
  const tokens = email
    .split("@")[0]
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 2) return null;
  return {
    firstName: tokens[0],
    lastName: tokens[tokens.length - 1],
  };
}

export function collectTrainingActorLookupEmails(...rowGroups) {
  return Array.from(new Set(rowGroups
    .flatMap((rows) => toObjectRows(rows))
    .flatMap((row) => [
      row.actor_email,
      row.created_by_email,
      row.updated_by_email,
      row.deleted_by_email,
      row.uploaded_by_email,
      row.reviewer_email,
      row.actor_name,
      row.actorName,
      row.created_by_name,
      row.createdByName,
      row.updated_by_name,
      row.updatedByName,
      row.deleted_by_name,
      row.uploaded_by_name,
      row.email,
    ])
    .map(normalizeActorLookupEmail)
    .filter(Boolean)));
}

export function getTrainingHistoryStatusChange(event = {}) {
  const nextStatus = getTrainingHistoryStateStatus(event.after_state);
  if (!nextStatus || nextStatus === "not_started") return null;
  const previousStatus = getTrainingHistoryStateStatus(event.before_state);
  if (previousStatus && previousStatus !== nextStatus) {
    return {
      previousStatus,
      previousLabel: formatTrainingHistoryStatusLabel(previousStatus),
      nextStatus,
      nextLabel: formatTrainingHistoryStatusLabel(nextStatus),
    };
  }
  return {
    previousStatus: "",
    previousLabel: "",
    nextStatus,
    nextLabel: formatTrainingHistoryStatusLabel(nextStatus),
  };
}

export function buildUniqueHistoryOptions(rows = [], accessor = () => "") {
  const seen = new Set();
  return toObjectRows(rows)
    .map((row) => String(accessor(row) || "").trim())
    .filter(Boolean)
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((label) => ({ value: label, label }));
}

export function applyTrainingHistoryFilters(rows = [], filters = {}) {
  const targetDate = String(filters.date || "").trim();
  const employee = String(filters.employee || "").trim().toLowerCase();
  const actor = String(filters.actor || "").trim().toLowerCase();
  const categoryTask = String(filters.categoryTask || "").trim().toLowerCase();
  return toObjectRows(rows).filter((row) => {
    if (targetDate && getTrainingHistoryRowDate(row) !== targetDate) return false;
    if (employee && String(row.employeeName || "").trim().toLowerCase() !== employee) return false;
    if (actor && String(row.actorDisplayName || "").trim().toLowerCase() !== actor) return false;
    if (categoryTask) {
      const haystack = [
        row.categoryTaskLabel,
        row.summary,
        row.item?.label,
        row.section?.title,
        row.record?.template_name_snapshot,
      ].map((value) => String(value || "").trim().toLowerCase());
      if (!haystack.some((value) => value === categoryTask || value.includes(categoryTask))) return false;
    }
    return true;
  });
}

export function findComplianceHistoryReviewInstance(event = {}, reviewInstanceMap = {}) {
  const sourceId = String(event.source_id || "").trim();
  if (sourceId && reviewInstanceMap[sourceId]) return reviewInstanceMap[sourceId];
  const nextState = readComplianceHistoryState(event, "new");
  const previousState = readComplianceHistoryState(event, "old");
  const reviewInstanceId = nextState.review_instance_id || previousState.review_instance_id || readComplianceHistoryMetadata(event).review_instance_id;
  return reviewInstanceId ? (reviewInstanceMap[reviewInstanceId] || null) : null;
}

export function findComplianceHistoryCycle(reviewCycle = "", reviewCycles = []) {
  return toObjectRows(reviewCycles).find((cycle) => reviewCycleMatchesKey(cycle, reviewCycle)) || null;
}

export function findComplianceHistoryRequirement(reviewCycle = "", requirementId = "", requirements = []) {
  const normalizedCycle = normalizeLocalReviewCycleKey(reviewCycle);
  const normalizedRequirementId = String(requirementId || "");
  return toObjectRows(requirements).find((requirement) => {
    if (normalizedRequirementId && String(requirement.id || "") === normalizedRequirementId) return true;
    const metadata = readComplianceHistoryMetadata(requirement);
    const legacyCycle = metadata.legacy_review_cycle || requirement.review_cycle || requirement.cycle_id || requirement.slug || "";
    return normalizedCycle && normalizeLocalReviewCycleKey(legacyCycle) === normalizedCycle;
  }) || null;
}

export function getComplianceHistoryStatusChange(event = {}) {
  const previousState = readComplianceHistoryState(event, "old");
  const nextState = readComplianceHistoryState(event, "new");
  const previousStatus = String(previousState.status || previousState.compliance_status || "").trim().toLowerCase();
  const nextStatus = String(nextState.status || nextState.compliance_status || "").trim().toLowerCase();
  if (!nextStatus || previousStatus === nextStatus) return null;
  return {
    previousStatus,
    previousLabel: getComplianceHistoryStatusLabel(previousStatus),
    nextStatus,
    nextLabel: getComplianceHistoryStatusLabel(nextStatus),
  };
}

export function getComplianceHistoryActor(event = {}, reviewInstance = {}) {
  return resolveVerifiedActorDisplayName({
    ...reviewInstance,
    ...event,
    actor_full_name: event.actor_full_name || event.actor_name || reviewInstance.reviewer_name,
    actor_name: event.actor_name || reviewInstance.reviewer_name,
    actor_user_id: event.actor_user_id || reviewInstance.reviewer_user_id,
  });
}

export function getComplianceAuditRequirementId(event = {}) {
  const before = readComplianceAuditSnapshot(event, "before_snapshot");
  const after = readComplianceAuditSnapshot(event, "after_snapshot");
  return normalizeOptionalUuid(event.requirement_id)
    || normalizeOptionalUuid(after.requirement_id)
    || normalizeOptionalUuid(before.requirement_id)
    || "";
}

export function getComplianceAuditEmployeeId(event = {}) {
  const before = readComplianceAuditSnapshot(event, "before_snapshot");
  const after = readComplianceAuditSnapshot(event, "after_snapshot");
  return normalizeOptionalUuid(event.labor_employee_id)
    || normalizeOptionalUuid(after.labor_employee_id)
    || normalizeOptionalUuid(before.labor_employee_id)
    || "";
}

export function getComplianceAuditActionLabel(event = {}) {
  const tableName = String(event.table_name || "").trim();
  const operation = String(event.operation || "").trim().toUpperCase();
  const before = readComplianceAuditSnapshot(event, "before_snapshot");
  const after = readComplianceAuditSnapshot(event, "after_snapshot");
  const afterMetadata = readComplianceHistoryMetadata(after);
  const beforeMetadata = readComplianceHistoryMetadata(before);
  const nextMode = afterMetadata.completion_mode || after.exception_kind || after.source_note || after.status || "";
  const previousMode = beforeMetadata.completion_mode || before.exception_kind || before.source_note || before.status || "";

  if (tableName === "labor_compliance_evidence_links" && operation === "INSERT") {
    if (String(nextMode).toLowerCase().includes("waived")) return "Marked Waived";
    return "Marked Completed";
  }
  if (tableName === "labor_compliance_exceptions" && operation === "INSERT") return "Waiver Added";
  if (tableName === "labor_compliance_due_date_overrides" && operation === "INSERT") return "Due Date Set";
  if (tableName === "labor_compliance_due_date_overrides" && operation === "UPDATE") return "Due Date Changed";
  if (operation === "UPDATE" && after.superseded_at && !before.superseded_at) return "Previous State Superseded";
  if (previousMode && nextMode && previousMode !== nextMode) {
    return `${getComplianceStateLabel(previousMode)} to ${getComplianceStateLabel(nextMode)}`;
  }
  if (operation === "INSERT") return "Compliance Entry Added";
  if (operation === "UPDATE") return "Compliance Entry Updated";
  return "Compliance Activity";
}

export function getReviewCycleInstanceKeys(reviewCycle = {}) {
  const policyCell = getReviewCyclePolicyCell(reviewCycle);
  const keys = new Set([
    reviewCycle?.id,
    reviewCycle?.slug,
    reviewCycle?.baseKey,
    reviewCycle?.requirementId,
    reviewCycle?.policyKey,
    reviewCycle?.requirement?.id,
    reviewCycle?.requirement?.slug,
    policyCell.requirement_id,
    policyCell.requirementId,
    policyCell.slug,
    policyCell.policy_key,
    policyCell.policyKey,
    getReviewCycleLegacyReviewCycle(reviewCycle),
  ].filter(Boolean).map((value) => String(value)));
  const offsetDays = getReviewCycleOffsetDays(reviewCycle);
  if (Number.isFinite(offsetDays) && offsetDays > 0) {
    keys.add(`${offsetDays}_day`);
    keys.add(`review_${offsetDays}`);
    keys.add(`review_${offsetDays}_day`);
  }
  return Array.from(keys);
}

export function isDirectComplianceRequirementCycle(reviewCycle = {}) {
  return Boolean(reviewCycle?.isDirectComplianceRequirement || (getReviewCycleRequirementId(reviewCycle) && !getReviewCycleLegacyReviewCycle(reviewCycle)));
}

export function isReviewCycleEvidenceRequired(reviewCycle = {}) {
  return Boolean(reviewCycle?.evidenceRequired || reviewCycle?.requiresEvidence || COMPLIANCE_EVIDENCE_REQUIRED_POLICIES.has(getReviewCycleEvidencePolicy(reviewCycle)));
}

export function getReviewCycleDueDateForSort(row = {}, sortKey = "") {
  const cycle = findReviewCycleRowBySortKey(row, sortKey);
  return cycle?.dueDate || cycle?.due_date || "";
}

export function normalizeLaborPositionAcronym(value = "", positionTitle = "") {
  const normalizedTitle = normalizePositionTitle(positionTitle || value);
  const fallback = DEFAULT_LABOR_POSITION_ACRONYMS[normalizedTitle] || deriveLaborPositionInitials(positionTitle || value);
  const cleaned = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return cleaned || fallback || "";
}

export function buildPerformanceReviewPolicyFields(policyEmployee = {}, cycles = []) {
  const cells = toObjectRows(policyEmployee?.requirements)
    .filter((cell) => String(cell.requirement_kind || "") === "review_checkpoint");
  if (cells.length === 0) return {};
  return toObjectRows(cycles).reduce((acc, cycle) => {
    const cell = findPolicyReviewCellForCycle(cells, cycle);
    if (!cell) return acc;
    acc[cycle.dueDateKey] = cell.adjusted_due_date || cell.due_date || cell.original_due_date || null;
    acc[cycle.statusKey] = cell.status || "not_started";
    acc[cycle.completedDateKey] = cell.completed_on || null;
    acc[`${cycle.baseKey || cycle.statusKey}_upload_timestamp`] = cell.uploaded_at || cell.updated_at || null;
    acc[`${cycle.baseKey || cycle.statusKey}_policy_cell`] = cell;
    return acc;
  }, {});
}

export function validateTemplateVersionForPublish(template = {}) {
  const errors = [];
  const kind = template?.kind === "review" ? "review" : "training";
  const name = String(template?.name || "").trim();
  const version = isObjectRow(template?.version) ? template.version : null;
  const sectionsForValidation = toObjectRows(template?.sections);
  const addError = (message) => {
    if (!errors.includes(message)) errors.push(message);
  };

  if (!name) addError("Template name is required.");
  if (!version?.id) addError("Choose a draft version before publishing.");
  if (version?.id && String(version.status || "").toLowerCase() !== "draft") {
    addError("Only draft versions can be published.");
  }

  if (kind === "review") {
    const reviewItemsForValidation = sectionsForValidation.flatMap((section) => toObjectRows(section.items));
    if (reviewItemsForValidation.length === 0) addError("Add at least one review prompt before publishing.");
    sectionsForValidation.forEach((section) => {
      if (!String(section.title || "").trim()) addError("Every review section needs a title before publishing.");
    });
    reviewItemsForValidation.forEach((item) => {
      if (!String(item.prompt || "").trim()) addError("Every review prompt needs text before publishing.");
    });
  } else {
    const trainingItemsForValidation = sectionsForValidation.flatMap(flattenTrainingTemplatePreviewItems);
    if (trainingItemsForValidation.length === 0) addError("Add at least one task before publishing.");
    sectionsForValidation.forEach((section) => {
      if (!String(section.title || "").trim()) addError("Every section needs a title before publishing.");
      toObjectRows(section.children).forEach((child) => {
        if (!String(child.title || "").trim()) addError("Every module needs a title before publishing.");
      });
    });
    trainingItemsForValidation.forEach((item) => {
      if (!String(item.label || "").trim()) addError("Every task needs a label before publishing.");
    });
  }

  return { valid: errors.length === 0, errors };
}

export function getConfiguredHourAnalysisGroupShortLabel(value, groupDisplay = null) {
  return groupDisplay?.[value]?.shortLabel || getHourAnalysisGroupShortLabel(value);
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

export function inferLaborModelGroupKeyFromLabel(value = "") {
  const label = String(value || "").trim().toLowerCase();
  if (!label) return "other";
  if (/^(csr|customer service representative)\b/.test(label)) return "csr";
  if (/^(pct|pet care technician)\b/.test(label)) return "pct";
  if (/^(sup|supervisor)\b/.test(label)) return "supervisor";
  if (/^(mod|am|assistant manager)\b/.test(label)) return "assistant_manager";
  if (/^(gm|general manager)\b/.test(label)) return "general_manager";
  return getHourAnalysisGroupKey({ position_title: value });
}

export function normalizeHourAnalysisRangeValue(value, defaults = {}, commitment = "full_time") {
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

export function normalizeHourAnalysisSplits(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    if (!employeeKey) return [];
    const split = normalizeHourAnalysisCoverageSplit(value);
    if (!split.floor_group && split.admin_hours == null) return [];
    return [[employeeKey, split]];
  }));
}

export function normalizeHourAnalysisPositionMovement(value = {}) {
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

export function normalizeHourAnalysisWhatIfRows(input = []) {
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

export function getStaffingCapacityRoleSettings(settings = {}, groupKey = "other") {
  const normalized = normalizeStaffingCapacitySettings(settings);
  return normalized.roles[groupKey] || getDefaultStaffingCapacityRoleSettings(groupKey);
}

export function normalizeHourAnalysisThresholds(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const skeletonSource = source.daily_skeleton || source.dailySkeleton || source.skeleton_daily || source.skeletonDaily;
  const staffingCapacitySource = source.staffing_capacity || source.staffingCapacity || source.staffingCapacitySettings || source.capacity_settings || source.capacitySettings;
  const hasSavedThresholds = isObjectRow(skeletonSource);
  if (!hasSavedThresholds) {
    return {
      reserve_percent: HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT,
      daily_skeleton: normalizeHourAnalysisSkeletonMap(DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON),
      staffing_capacity: normalizeStaffingCapacitySettings(staffingCapacitySource),
    };
  }
  const normalized = {
    reserve_percent: HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT,
    daily_skeleton: normalizeHourAnalysisSkeletonMap(skeletonSource),
    staffing_capacity: normalizeStaffingCapacitySettings(staffingCapacitySource),
  };
  const allSkeletonValuesAreZero = Object.values(normalized.daily_skeleton).every((hours) => normalizeHourAnalysisNumber(hours, 0) === 0);
  if (allSkeletonValuesAreZero) {
    return {
      reserve_percent: HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT,
      daily_skeleton: normalizeHourAnalysisSkeletonMap(DEFAULT_HOUR_ANALYSIS_DAILY_SKELETON),
      staffing_capacity: normalized.staffing_capacity,
    };
  }
  return normalized;
}

export function getOutOfPositionRoleLabel(roleKey = "", fallback = "Unclassified") {
  if (roleKey === "management") return "MOD";
  return roleKey ? getHourAnalysisGroupShortLabel(roleKey) : fallback;
}

export function sumHourAnalysisRanges(...ranges) {
  const total = makeHourAnalysisRangeTotals();
  ranges.forEach((range) => addHourAnalysisRange(total, range));
  return total;
}

export function resolveHourAnalysisCoverageSplit({ row = {}, groupKey = "other", preferredHours = 0, split = {} } = {}) {
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

export function combineHourAnalysisCapacityStandards(rows = []) {
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

export function buildHourAnalysisCapacityStatus({ requiredWeekly = 0, targetWeekly = 0, capacity = {}, standard = null } = {}) {
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
  const toleranceState = buildHourAnalysisCapacityToleranceState({
    expected,
    floor: required,
    targetLow: healthyLow,
    targetHigh: healthyHigh,
    target,
    hasTargetRange,
    tolerancePercent: capacityStandard.tolerancePercent,
  });
  if (toleranceState.withinTolerance && toleranceState.delta !== 0 && !["aligned", "in-range"].includes(toleranceState.relation)) {
    return { key: "within_tolerance", label: "Within tolerance", tone: "success", message: `Expected capacity is ${formatHourAnalysisHours(Math.abs(toleranceState.delta))} hrs/wk outside the ${toleranceState.boundaryLabel}, inside the configured ${formatHourAnalysisHours(toleranceState.toleranceHours)} hrs/wk tolerance.` };
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

export function formatHourAnalysisCapacityRangeDelta(expected = 0, standard = null) {
  const capacityStandard = standard || buildHourAnalysisCapacityStandard(0);
  const targetBufferPercent = normalizeHourAnalysisNumber(capacityStandard.targetBufferPercent, 0);
  const tolerancePercent = normalizeHourAnalysisNumber(capacityStandard.tolerancePercent, HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT);
  if (targetBufferPercent <= 0) {
    const delta = normalizeHourAnalysisDelta(expected - normalizeHourAnalysisNumber(capacityStandard.targetWeekly, capacityStandard.floor));
    const toleranceHours = getHourAnalysisToleranceHours(capacityStandard.targetWeekly || capacityStandard.floor, tolerancePercent);
    if (Math.abs(delta) <= toleranceHours) {
      return {
        value: formatHourAnalysisSignedDelta(delta),
        tone: "healthy",
        label: "Within tolerance",
      };
    }
    return formatHourAnalysisCapacityDelta(delta);
  }
  const healthyLow = normalizeHourAnalysisNumber(capacityStandard.healthyLowWeekly, 0);
  const healthyHigh = normalizeHourAnalysisNumber(capacityStandard.healthyHighWeekly, healthyLow);
  const value = normalizeHourAnalysisNumber(expected, 0);

  if (healthyLow > 0 && value < healthyLow) {
    const delta = normalizeHourAnalysisDelta(value - healthyLow);
    const toleranceHours = getHourAnalysisToleranceHours(healthyLow, tolerancePercent);
    if (Math.abs(delta) <= toleranceHours) {
      return {
        value: formatHourAnalysisSignedDelta(delta),
        tone: "healthy",
        label: "Within tolerance",
      };
    }
    return {
      value: `-${formatHourAnalysisHours(Math.abs(delta))} hrs`,
      tone: "short",
      label: "Below target range",
    };
  }
  if (healthyHigh > 0 && value > healthyHigh) {
    const delta = normalizeHourAnalysisDelta(value - healthyHigh);
    const toleranceHours = getHourAnalysisToleranceHours(healthyHigh, tolerancePercent);
    if (Math.abs(delta) <= toleranceHours) {
      return {
        value: formatHourAnalysisSignedDelta(delta),
        tone: "healthy",
        label: "Within tolerance",
      };
    }
    return {
      value: `+${formatHourAnalysisHours(delta)} hrs`,
      tone: "surplus",
      label: "Above target range",
    };
  }
  return {
    value: "In range",
    tone: "healthy",
    label: "Target range",
  };
}

export function resolveLaborActorNameByEmail(value = "", employeeRows = []) {
  const emailName = getActorEmailNameParts(value);
  if (!emailName) return "";
  const match = toObjectRows(employeeRows).find((employee) => {
    const tokens = getNormalizedNameTokens(employee.full_name || employee.name);
    if (tokens.length < 2) return false;
    const firstName = tokens[0];
    const lastName = tokens[tokens.length - 1];
    return lastName === emailName.lastName && actorFirstNameMatches(emailName.firstName, firstName);
  });
  return String(match?.full_name || match?.name || "").trim();
}

export function enrichTrainingActorProfileName(row = {}, {
  userKey = "",
  nameKey = "",
  actorNameById = new Map(),
  actorNameByEmail = new Map(),
} = {}) {
  const actorId = normalizeOptionalUuid(row?.[userKey]);
  const verifiedName = actorId ? actorNameById.get(actorId) : "";
  if (verifiedName) return { ...row, [nameKey]: verifiedName };

  const actorEmail = collectTrainingActorLookupEmails([row])[0] || "";
  const verifiedEmailName = actorEmail ? actorNameByEmail.get(actorEmail) : "";
  return verifiedEmailName ? { ...row, [nameKey]: verifiedEmailName } : row;
}

export function buildTrainingHistoryRows({
  events = [],
  notes = [],
  recordMap = {},
  laborEmployeeMap = {},
  getItemById: itemLookup = () => null,
  getSectionById: sectionLookup = () => null,
} = {}) {
  const noteRows = toObjectRows(notes).map((note) => {
    const record = resolveTrainingHistoryRecord(note, recordMap);
    const item = note.template_item_id ? itemLookup(note.template_item_id) : null;
    const section = note.template_section_id ? sectionLookup(note.template_section_id) : null;
    const employee = laborEmployeeMap[record.labor_employee_id] || {};
    const categoryTaskLabel = item?.label || section?.title || getTeamReadinessTemplateDisplayLabel(record.template_name_snapshot) || "Training Record";
    return {
      ...note,
      id: `note_${note.id}`,
      entityId: note.id,
      historyKind: "note",
      record,
      item,
      section,
      categoryTaskLabel,
      employeeName: employee.full_name || record.employee_full_name || "Unknown employee",
      event_type: note.template_item_id ? "task_note_added" : "record_note_added",
      actionLabel: note.template_item_id ? "Observation added" : "Record note added",
      actorDisplayName: resolveVerifiedActorDisplayName(note),
      summary: [
        categoryTaskLabel,
        note.note_text,
      ].filter(Boolean).join(": "),
    };
  });
  const noteEntityIds = new Set(noteRows.map((row) => row.entityId).filter(Boolean));
  const eventRows = toObjectRows(events)
    .filter((event) => {
      if (String(event.event_type || "") !== "note_added") return true;
      const afterState = isObjectRow(event.after_state) ? event.after_state : {};
      return !afterState.id || !noteEntityIds.has(afterState.id);
    })
    .map((event) => {
      const record = resolveTrainingHistoryRecord(event, recordMap);
      const item = event.template_item_id ? itemLookup(event.template_item_id) : null;
      const section = event.template_section_id ? sectionLookup(event.template_section_id) : null;
      const employee = laborEmployeeMap[record.labor_employee_id] || {};
      const statusChange = getTrainingHistoryStatusChange(event);
      const categoryTaskLabel = item?.label || section?.title || getTeamReadinessTemplateDisplayLabel(record.template_name_snapshot) || String(event.event_type || "Training event").replace(/_/g, " ");
      return {
        ...event,
        id: `event_${event.id}`,
        entityId: event.id,
        historyKind: "event",
        record,
        item,
        section,
        categoryTaskLabel,
        employeeName: employee.full_name || record.employee_full_name || "Unknown employee",
        actionLabel: getTrainingHistoryActionLabel(event),
        actorDisplayName: resolveVerifiedActorDisplayName(event),
        statusChange,
        summary: categoryTaskLabel,
      };
    });

  return [...eventRows, ...noteRows]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export function buildTrainingHistoryFilterOptions(rows = []) {
  return {
    employees: [
      { value: "", label: "All employees" },
      ...buildUniqueHistoryOptions(rows, (row) => row.employeeName),
    ],
    actors: [
      { value: "", label: "All actors" },
      ...buildUniqueHistoryOptions(rows, (row) => row.actorDisplayName),
    ],
    categoryTasks: [
      { value: "", label: "All categories / tasks" },
      ...buildUniqueHistoryOptions(rows, (row) => row.categoryTaskLabel || row.summary),
    ],
  };
}

export function reviewInstanceMatchesReviewCycle(instance = {}, reviewCycle = {}) {
  const instanceCycle = String(instance?.review_cycle || "");
  if (!instanceCycle) return false;
  const normalizedInstanceCycle = normalizeLocalReviewCycleKey(instanceCycle);
  return getReviewCycleInstanceKeys(reviewCycle).some((key) => (
    String(key) === instanceCycle
    || normalizeLocalReviewCycleKey(key) === normalizedInstanceCycle
  ));
}

export function getDefaultLaborPositionAcronym(positionTitle = "") {
  return normalizeLaborPositionAcronym(DEFAULT_LABOR_POSITION_ACRONYMS[normalizePositionTitle(positionTitle)] || "", positionTitle);
}

export function normalizeLaborPositionAcronymSettings(value = {}) {
  if (Array.isArray(value)) {
    return value.reduce((acc, row) => {
      if (!isObjectRow(row)) return acc;
      const title = row.position_title || row.positionTitle || row.title || row.normalized_title || row.normalizedTitle || "";
      const normalizedTitle = normalizePositionTitle(title);
      if (!normalizedTitle) return acc;
      acc[normalizedTitle] = normalizeLaborPositionAcronym(row.position_acronym || row.positionAcronym || row.acronym, title);
      return acc;
    }, {});
  }
  if (!isObjectRow(value)) return {};
  return Object.entries(value).reduce((acc, [title, acronym]) => {
    const normalizedTitle = normalizePositionTitle(title);
    if (!normalizedTitle) return acc;
    acc[normalizedTitle] = normalizeLaborPositionAcronym(acronym, title);
    return acc;
  }, {});
}

export function buildLaborPositionAcronymSettings(rows = []) {
  return toObjectRows(rows).reduce((acc, row) => {
    const positionTitle = formatLaborPositionTitle(row.position_title);
    const normalizedTitle = normalizePositionTitle(positionTitle);
    if (!normalizedTitle) return acc;
    acc[normalizedTitle] = normalizeLaborPositionAcronym(row.position_acronym || row.acronym, positionTitle);
    return acc;
  }, {});
}

export function buildLaborPositionOption(title, acronym = "") {
  const label = formatLaborPositionTitle(title);
  if (!label) return null;
  return {
    value: label,
    label,
    normalizedTitle: normalizePositionTitle(label),
    acronym: normalizeLaborPositionAcronym(acronym, label),
  };
}

export function buildHourAnalysisGroupDisplay(positionRows = []) {
  const display = Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [
    group.key,
    {
      label: group.label,
      shortLabel: getHourAnalysisGroupShortLabel(group.key),
      sort: 5000,
    },
  ]));

  toObjectRows(positionRows).forEach((row, index) => {
    const positionTitle = formatLaborPositionTitle(row.position_title);
    const groupKey = getHourAnalysisGroupKey({ position_title: positionTitle });
    if (!groupKey || groupKey === "other" || !display[groupKey]) return;
    const sort = Number.isFinite(row.sort_order) ? row.sort_order : index;
    if (display[groupKey].configured && display[groupKey].sort <= sort) return;
    display[groupKey] = {
      label: positionTitle || display[groupKey].label,
      shortLabel: normalizeLaborPositionAcronym(row.position_acronym || row.acronym, positionTitle) || getHourAnalysisGroupShortLabel(groupKey),
      sort,
      configured: true,
    };
  });

  return display;
}

export function normalizeLaborModelCoverageCells(value = [], targetLength = 0) {
  const cells = parseLaborModelCoverage(value);
  const nextCells = Array.from({ length: targetLength }, (_, index) => normalizeLaborModelCoverageCell(cells[index] || ""));
  return nextCells;
}

export function isLaborModelMarketingCoverage(value = "") {
  return normalizeLaborModelCoverageCell(value) === LABOR_MODEL_MARKETING_COVERAGE_VALUE;
}

export function getLaborModelCoverageKind(value = "") {
  const normalized = normalizeLaborModelCoverageCell(value);
  if (!normalized) return "empty";
  if (normalized.startsWith(`${LABOR_MODEL_HALF_COVERAGE_VALUE}:`)) return "half";
  if (normalized === LABOR_MODEL_HALF_COVERAGE_VALUE) return "half";
  if (normalized === LABOR_MODEL_MARKETING_COVERAGE_VALUE) return "marketing";
  if (getLaborModelCoverageRoleOption(normalized)) return "role";
  return "full";
}

export function getLaborModelCoverageExplicitRoleOption(value = "") {
  const normalized = normalizeLaborModelCoverageCell(value);
  if (!normalized || normalized === LABOR_MODEL_MARKETING_COVERAGE_VALUE) return null;
  if (normalized.includes(":")) {
    const roleToken = normalized.split(":").find((part) => getLaborModelCoverageRoleOption(part));
    return getLaborModelCoverageRoleOption(roleToken);
  }
  return getLaborModelCoverageRoleOption(normalized);
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

export function normalizeLaborModelGroupKey(value = "", row = {}) {
  const explicit = normalizeHourAnalysisGroupKey(value, row);
  if (explicit !== "other") return explicit;
  const inferred = inferLaborModelGroupKeyFromLabel(row.role_label || row.roleLabel || row.label || row.shift_label || row.shiftLabel || "");
  return HOUR_ANALYSIS_GROUP_LABELS[inferred] ? inferred : "other";
}

export function normalizeHourAnalysisExpectationMap(input = {}) {
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

export function normalizeHourAnalysisPositionMovements(input = {}) {
  if (!isObjectRow(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const employeeKey = String(key || "").trim();
    if (!employeeKey) return [];
    const movement = normalizeHourAnalysisPositionMovement(value);
    if (!movement.position_title) return [];
    return [[employeeKey, movement]];
  }));
}

export function buildComplianceHistoryFilterOptions(rows = []) {
  const options = buildTrainingHistoryFilterOptions(rows);
  return {
    ...options,
    categoryTasks: [
      { value: "", label: "All checkpoints / requirements" },
      ...options.categoryTasks.slice(1),
    ],
  };
}

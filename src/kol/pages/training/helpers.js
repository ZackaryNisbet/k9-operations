// K9 Operations — Training Module: extracted pure helper functions.
// Moved verbatim from TrainingPage.jsx (no behavior change).

import { TEAM_READINESS_TEMPLATE_OPTIONS, getPctReadinessStatusPresentation, normalizePctReadinessStatus, readLaborEmployeeContactValue, readLaborEmploymentCommitment } from "../../trainingData";
import { HOUR_ANALYSIS_DEFAULT_TOLERANCE_PERCENT, HOUR_ANALYSIS_FRONTLINE_GROUP_KEYS, HOUR_ANALYSIS_GROUPS, HOUR_ANALYSIS_HEALTHY_BUFFER_MAX_PERCENT, HOUR_ANALYSIS_HEALTHY_BUFFER_MIN_PERCENT, HOUR_ANALYSIS_OVER_ROSTERED_BUFFER_PERCENT, HOUR_ANALYSIS_RECOMMENDED_RESERVE_PERCENT, LABOR_CAPACITY_MODEL_DEFAULT_NAME, LABOR_CAPACITY_MODEL_TABLE_MISSING_CODES, LABOR_MODEL_DAY_KEYS, LABOR_ROSTER_PRINT_DATE_FORMATTER, REVIEW_CYCLE_SORT_KEY_PREFIX } from "./constants";

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

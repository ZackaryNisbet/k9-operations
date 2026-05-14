const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTIVE_TRAINING_RECORD_STATUSES = [
  "not_started",
  "in_progress",
  "needs_follow_up",
  "retest_required",
];

export const COMPLETED_TRAINING_RECORD_STATUSES = [
  "complete",
  "passed",
  "failed",
  "archived",
];

export const PCT_READINESS_TEMPLATE_SLUG = "pct_team_readiness_board";
export const CSR_READINESS_TEMPLATE_SLUG = "csr_team_readiness_board";
export const PCT_READINESS_TEMPLATE_LABEL = "Angelina's PCT Training Plan v1";
export const CSR_READINESS_TEMPLATE_LABEL = "Angelina's CSR Training Plan v1";
const LEGACY_PCT_READINESS_TEMPLATE_LABEL = "Angelina's PCT Training Guide v1";
const LEGACY_CSR_READINESS_TEMPLATE_LABEL = "Angelina's CSR Training Guide v1";

export const TEAM_READINESS_TEMPLATE_OPTIONS = [
  {
    value: PCT_READINESS_TEMPLATE_SLUG,
    slug: PCT_READINESS_TEMPLATE_SLUG,
    label: PCT_READINESS_TEMPLATE_LABEL,
    roleLabel: "PCT",
    roleName: "Pet Care Technician",
  },
  {
    value: CSR_READINESS_TEMPLATE_SLUG,
    slug: CSR_READINESS_TEMPLATE_SLUG,
    label: CSR_READINESS_TEMPLATE_LABEL,
    roleLabel: "CSR",
    roleName: "Customer Service Representative",
  },
];

const TEAM_READINESS_TEMPLATE_SLUG_SET = new Set(TEAM_READINESS_TEMPLATE_OPTIONS.map((option) => option.slug));
const PCT_READINESS_TEMPLATE_NAMES = new Set([
  PCT_READINESS_TEMPLATE_LABEL.toLowerCase(),
  LEGACY_PCT_READINESS_TEMPLATE_LABEL.toLowerCase(),
  "pct team readiness board",
]);
const TEAM_READINESS_TEMPLATE_NAMES = new Set([
  ...PCT_READINESS_TEMPLATE_NAMES,
  CSR_READINESS_TEMPLATE_LABEL.toLowerCase(),
  LEGACY_CSR_READINESS_TEMPLATE_LABEL.toLowerCase(),
  "csr team readiness board",
]);

export function getTeamReadinessTemplateOption(slug = PCT_READINESS_TEMPLATE_SLUG) {
  return TEAM_READINESS_TEMPLATE_OPTIONS.find((option) => option.slug === slug || option.value === slug)
    || TEAM_READINESS_TEMPLATE_OPTIONS[0];
}

export function getTeamReadinessTemplateDisplayLabel(value = "") {
  const label = String(value || "").trim();
  const normalized = label.toLowerCase();
  if (!normalized) return "";
  if (normalized === PCT_READINESS_TEMPLATE_SLUG || PCT_READINESS_TEMPLATE_NAMES.has(normalized)) {
    return PCT_READINESS_TEMPLATE_LABEL;
  }
  if (normalized === CSR_READINESS_TEMPLATE_SLUG || normalized === CSR_READINESS_TEMPLATE_LABEL.toLowerCase() || normalized === LEGACY_CSR_READINESS_TEMPLATE_LABEL.toLowerCase() || normalized === "csr team readiness board") {
    return CSR_READINESS_TEMPLATE_LABEL;
  }
  return label;
}

export function isTeamReadinessTemplateSlug(slug = "") {
  return TEAM_READINESS_TEMPLATE_SLUG_SET.has(String(slug || ""));
}

export const PCT_READINESS_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started", itemStatus: "not_started", tone: "muted" },
  { value: "demonstrated", label: "Demonstrated", itemStatus: "in_progress", tone: "info" },
  { value: "verified", label: "Verified / Qualified", itemStatus: "complete", tone: "success" },
  { value: "needs_coaching", label: "Needs Coaching", itemStatus: "needs_coaching", tone: "warning" },
  { value: "blocked", label: "Blocked", itemStatus: "blocked", tone: "danger" },
  { value: "waived", label: "Waived", itemStatus: "waived", tone: "neutral" },
];

export const PCT_READINESS_GAP_STATUSES = new Set([
  "not_started",
  "demonstrated",
  "needs_coaching",
  "blocked",
  "retest_required",
  "needs_follow_up",
  "incomplete",
]);

const PCT_READINESS_STATUS_BY_VALUE = Object.fromEntries(
  PCT_READINESS_STATUS_OPTIONS.map((option) => [option.value, option])
);

export function normalizePctReadinessText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePctReadinessStatus(value = "") {
  const normalized = normalizePctReadinessText(value).replace(/\s+/g, "_");
  if (normalized === "verified_qualified" || normalized === "qualified" || normalized === "complete" || normalized === "passed") return "verified";
  if (normalized === "in_progress" || normalized === "demo" || normalized === "demonstrate") return "demonstrated";
  if (normalized === "needs_follow_up" || normalized === "needs_review" || normalized === "coaching") return "needs_coaching";
  if (normalized === "retest" || normalized === "retest_required") return "retest_required";
  if (normalized === "incomplete" || normalized === "missing") return "incomplete";
  if (PCT_READINESS_STATUS_BY_VALUE[normalized]) return normalized;
  return "not_started";
}

export function getPctReadinessStatusPresentation(value = "") {
  const normalized = normalizePctReadinessStatus(value);
  return PCT_READINESS_STATUS_BY_VALUE[normalized] || PCT_READINESS_STATUS_BY_VALUE.not_started;
}

export function classifyPctReadinessVerifierValue(value = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return { kind: "blank", value: "" };
  const lower = text.toLowerCase();
  const noteSignals = [
    "not ",
    "need",
    "struggle",
    "quality",
    "walkie",
    "moves",
    "too fast",
    "slow",
    "work on",
    "because",
    "lacks",
  ];
  if (noteSignals.some((signal) => lower.includes(signal))) {
    return { kind: "note", value: text };
  }
  if (text.length > 34 || /[!?]/.test(text) || /[.,;:]\s+\w{4,}/.test(text)) {
    return { kind: "note", value: text };
  }
  const words = text.replace(/\./g, "").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  const looksLikeName = words.length >= 1
    && words.length <= 4
    && words.every((word) => /^[A-Za-z][A-Za-z']*$/.test(word));
  return looksLikeName ? { kind: "person", value: text } : { kind: "note", value: text };
}

export function normalizePctWorkbookStatus({
  checkboxStatus = null,
  demonstratedBy = "",
  verifierValue = "",
} = {}) {
  const checked = checkboxStatus === true
    || ["true", "yes", "y", "1", "complete", "completed"].includes(String(checkboxStatus || "").trim().toLowerCase());
  const verifier = classifyPctReadinessVerifierValue(verifierValue);
  const demoName = String(demonstratedBy || "").trim();

  if (verifier.kind === "note") {
    return {
      readinessStatus: "needs_coaching",
      itemStatus: "needs_coaching",
      demonstratedBy: demoName,
      verifiedBy: "",
      noteText: verifier.value,
    };
  }

  if (checked && verifier.kind === "person") {
    return {
      readinessStatus: "verified",
      itemStatus: "complete",
      demonstratedBy: demoName,
      verifiedBy: verifier.value,
      noteText: "",
    };
  }

  if (checked) {
    return {
      readinessStatus: "demonstrated",
      itemStatus: "in_progress",
      demonstratedBy: demoName,
      verifiedBy: "",
      noteText: "",
    };
  }

  if (demoName) {
    return {
      readinessStatus: "demonstrated",
      itemStatus: "in_progress",
      demonstratedBy: demoName,
      verifiedBy: "",
      noteText: "",
    };
  }

  return {
    readinessStatus: "not_started",
    itemStatus: "not_started",
    demonstratedBy: demoName,
    verifiedBy: "",
    noteText: "",
  };
}

export function buildPctReadinessCellUpdateArgs({
  recordId,
  templateItemId,
  readinessStatus = "not_started",
  comment = "",
  actorUserId = null,
  actorName = null,
} = {}) {
  return {
    p_record_id: recordId,
    p_template_item_id: templateItemId,
    p_readiness_status: normalizePctReadinessStatus(readinessStatus),
    p_demonstrated_by: null,
    p_verified_by: null,
    p_comment: String(comment || "").trim() || null,
    p_actor_user_id: normalizeOptionalUuid(actorUserId),
    p_actor_name: String(actorName || "").trim() || null,
  };
}

export function isPctReadinessGapStatus(status = "") {
  const normalized = normalizePctReadinessStatus(status);
  return PCT_READINESS_GAP_STATUSES.has(normalized);
}

export function buildPctReadinessCategoryHotspots({
  sections = [],
  records = [],
  cells = {},
} = {}) {
  const recordRows = Array.isArray(records) ? records.filter(Boolean) : [];
  const cellMap = cells && typeof cells === "object" ? cells : {};
  if (recordRows.length === 0) return [];

  return (Array.isArray(sections) ? sections : [])
    .map((section) => {
      const items = Array.isArray(section?.items) ? section.items.filter(Boolean) : [];
      const totalCells = items.length * recordRows.length;
      if (totalCells === 0) return null;

      let gapCells = 0;
      const affectedRecordIds = new Set();
      const statusCounts = {};

      recordRows.forEach((record) => {
        let recordHasGap = false;
        items.forEach((item) => {
          const cell = cellMap[`${record.id}:${item.id}`] || {};
          const status = normalizePctReadinessStatus(
            cell.readiness_status
            || cell.metadata?.pct_readiness_status
            || cell.status
            || cell.item_status
            || "not_started"
          );
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          if (isPctReadinessGapStatus(status)) {
            gapCells += 1;
            recordHasGap = true;
          }
        });
        if (recordHasGap) affectedRecordIds.add(record.id);
      });

      return {
        id: section.id,
        sectionId: section.id,
        category: section.title || "Category",
        taskCount: items.length,
        traineeCount: recordRows.length,
        affectedTraineeCount: affectedRecordIds.size,
        gapCells,
        totalCells,
        gapRate: totalCells > 0 ? gapCells / totalCells : 0,
        gapPercent: totalCells > 0 ? Math.round((gapCells / totalCells) * 100) : 0,
        statusCounts,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      b.gapRate - a.gapRate
      || b.affectedTraineeCount - a.affectedTraineeCount
      || b.gapCells - a.gapCells
      || String(a.category).localeCompare(String(b.category))
    ));
}

export function reconcilePctReadinessLegacyActorName(employees = [], rawName = "") {
  const classification = classifyPctReadinessVerifierValue(rawName);
  if (classification.kind !== "person") {
    return { status: classification.kind === "note" ? "note" : "blank", originalName: classification.value, employee: null };
  }

  const originalName = classification.value;
  const normalizedCompact = normalizePctReadinessText(originalName).replace(/\s+/g, "");
  const employeeRows = Array.isArray(employees) ? employees.filter(Boolean) : [];
  const employeeScore = (employee) => (isLaborEmployeeActive(employee) ? 0 : 1);
  const findBest = (predicate) => employeeRows
    .filter(predicate)
    .sort((a, b) => employeeScore(a) - employeeScore(b) || String(a.full_name || "").localeCompare(String(b.full_name || "")))[0] || null;

  const aliasMatch = (() => {
    if (["angelinad", "anglelinad", "angleinad"].includes(normalizedCompact)) {
      return findBest((employee) => normalizePctReadinessText(employee.full_name || employee.name || "").startsWith("angelina d"));
    }
    if (["zachc", "zackc"].includes(normalizedCompact)) {
      return findBest((employee) => {
        const normalized = normalizePctReadinessText(employee.full_name || employee.name || "");
        return normalized.includes("zach") && normalized.includes("cruz");
      });
    }
    if (normalizedCompact === "juliaz") {
      return findBest((employee) => normalizePctReadinessText(employee.full_name || employee.name || "").startsWith("julia "));
    }
    return null;
  })();

  if (aliasMatch) {
    return { status: "matched", originalName, employee: aliasMatch, matchMethod: "known_alias" };
  }

  const words = normalizePctReadinessText(originalName).split(/\s+/).filter(Boolean);
  if (words.length === 2 && words[1].length === 1) {
    const firstName = words[0];
    const lastInitial = words[1];
    const initialMatch = findBest((employee) => {
      const employeeWords = normalizePctReadinessText(employee.full_name || employee.name || "").split(/\s+/).filter(Boolean);
      return employeeWords[0] === firstName && employeeWords.some((word, index) => index > 0 && word.startsWith(lastInitial));
    });
    if (initialMatch) return { status: "matched", originalName, employee: initialMatch, matchMethod: "first_name_last_initial" };
  }

  const exactMatch = matchPctReadinessEmployeeByName(employeeRows, originalName);
  if (exactMatch.status === "matched") {
    return { status: "matched", originalName, employee: exactMatch.employee, matchMethod: "exact_name" };
  }

  return { status: "unmatched", originalName, employee: null, matchMethod: "unresolved" };
}

export function isPctReadinessTemplate(template = {}) {
  return String(template?.slug || "") === PCT_READINESS_TEMPLATE_SLUG;
}

export function isPctReadinessRecord(record = {}) {
  return String(record?.template_slug || record?.metadata?.template_slug || "") === PCT_READINESS_TEMPLATE_SLUG
    || PCT_READINESS_TEMPLATE_NAMES.has(String(record?.template_name_snapshot || "").trim().toLowerCase());
}

export function isTeamReadinessRecord(record = {}) {
  const templateSlug = String(record?.template_slug || record?.metadata?.template_slug || "");
  const templateName = String(record?.template_name_snapshot || "").trim().toLowerCase();
  return isTeamReadinessTemplateSlug(templateSlug) || TEAM_READINESS_TEMPLATE_NAMES.has(templateName);
}

export function hasActivePctReadinessRecord(records = [], laborEmployeeId = "") {
  const normalizedEmployeeId = normalizeOptionalUuid(laborEmployeeId);
  if (!normalizedEmployeeId) return false;
  return (Array.isArray(records) ? records : []).some((record) => {
    if (!record || typeof record !== "object") return false;
    if (!isTeamReadinessRecord(record)) return false;
    if (String(record.labor_employee_id || record.employee_id || "") !== normalizedEmployeeId) return false;
    return String(record.overall_status || "") !== "archived";
  });
}

export function matchPctReadinessEmployeeByName(employees = [], workbookName = "") {
  const normalizedWorkbookName = normalizePctReadinessText(workbookName).replace(/\s+/g, "");
  if (!normalizedWorkbookName) return { status: "unmatched", matches: [] };
  const matches = (Array.isArray(employees) ? employees : []).filter((employee) => (
    normalizePctReadinessText(employee?.full_name || employee?.name || "").replace(/\s+/g, "") === normalizedWorkbookName
  ));
  if (matches.length === 1) return { status: "matched", employee: matches[0], matches };
  if (matches.length > 1) return { status: "ambiguous", matches };
  return { status: "unmatched", matches: [] };
}

export function buildPctReadinessEmployeeOptions({
  employees = [],
  records = [],
  excludeExistingReadinessRecords = true,
} = {}) {
  return (Array.isArray(employees) ? employees : [])
    .filter((employee) => employee && typeof employee === "object")
    .filter((employee) => isLaborEmployeeActive(employee))
    .filter((employee) => {
      const employeeId = normalizeOptionalUuid(employee.id || employee.labor_employee_id);
      return !excludeExistingReadinessRecords || !hasActivePctReadinessRecord(records, employeeId);
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.start_date || a.first_shift_date || "") || 0;
      const bTime = Date.parse(b.start_date || b.first_shift_date || "") || 0;
      if (aTime !== bTime) return bTime - aTime;
      return String(a.full_name || "").localeCompare(String(b.full_name || ""));
    })
    .map((employee) => ({
      value: employee.id || employee.labor_employee_id,
      label: employee.full_name || employee.name || "Employee",
      employee,
    }));
}

export const LABOR_EMPLOYEE_ATTACHMENT_BUCKET = "labor-employee-attachments";
export const LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES = 5;
export const LABOR_EMPLOYEE_ATTACHMENT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const LABOR_EMPLOYEE_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const LABOR_EMPLOYEE_ATTACHMENT_ACCEPT = LABOR_EMPLOYEE_ATTACHMENT_MIME_TYPES.join(",");

export const LABOR_TRAINING_REQUIREMENT_SLUGS = {
  INCITE: "incite_modules",
  CPR: "dog_cpr_annual",
  PPBC_LEVEL_1: "ppbc_level_1",
  PPBC_LEVEL_2: "ppbc_level_2",
};

export const LABOR_TRAINING_REQUIREMENT_PDF_ACCEPT = "application/pdf";

export const LABOR_TRAINING_REQUIREMENT_DEFINITIONS = [
  {
    slug: LABOR_TRAINING_REQUIREMENT_SLUGS.INCITE,
    label: "Incite Modules",
    helper: "Manual completion with uploaded PDF evidence.",
    evidenceMode: "pdf",
    frequency: "one_time",
    order: 10,
  },
  {
    slug: LABOR_TRAINING_REQUIREMENT_SLUGS.CPR,
    label: "CPR Certification",
    helper: "Annual certification with a PDF upload or certificate link.",
    evidenceMode: "pdf_or_url",
    frequency: "annual",
    order: 20,
  },
  {
    slug: LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_1,
    label: "PPBC Level 1",
    helper: "Online certification required for non-PCT and non-CSR positions.",
    evidenceMode: "pdf",
    frequency: "one_time",
    ppbcOnly: true,
    order: 30,
  },
  {
    slug: LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_2,
    label: "PPBC Level 2",
    helper: "Online certification required for non-PCT and non-CSR positions.",
    evidenceMode: "pdf",
    frequency: "one_time",
    ppbcOnly: true,
    order: 40,
  },
];

export function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function normalizeOptionalUuid(value) {
  const trimmed = String(value || "").trim();
  return isUuid(trimmed) ? trimmed : null;
}

export function inferLaborAttachmentMimeType(file = {}) {
  const explicitType = String(file?.type || "").trim().toLowerCase();
  if (LABOR_EMPLOYEE_ATTACHMENT_MIME_TYPES.includes(explicitType)) return explicitType;

  const name = String(file?.name || "").trim().toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return explicitType || "application/octet-stream";
}

export function sanitizeLaborAttachmentFilename(value = "") {
  const rawName = String(value || "attachment")
    .split(/[\\/]/)
    .pop()
    .trim();
  const withoutControlChars = rawName.replace(/[\x00-\x1F\x7F]/g, "");
  const safe = withoutControlChars
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[._-]+$/, "")
    .slice(0, 120);
  return safe || "attachment";
}

export function buildLaborEmployeeAttachmentPath({
  laborEmployeeId,
  noteId,
  fileName,
  randomId,
} = {}) {
  const employeeId = normalizeOptionalUuid(laborEmployeeId);
  const cleanNoteId = normalizeOptionalUuid(noteId);
  if (!employeeId) throw new Error("Valid labor employee id is required");
  if (!cleanNoteId) throw new Error("Valid employee note id is required");

  const uniqueId = String(
    randomId
    || globalThis.crypto?.randomUUID?.()
    || Date.now()
  )
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    || "attachment";

  return `${employeeId}/${cleanNoteId}/${uniqueId}-${sanitizeLaborAttachmentFilename(fileName)}`;
}

export function normalizeLaborTrainingPosition(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function requiresPpbcTrainingForPosition(positionTitle = "") {
  const normalized = normalizeLaborTrainingPosition(positionTitle);
  if (!normalized) return false;
  return !/(pet\s*care\s*technician|\bpct\b|customer\s*service\s*representative|\bcsr\b)/i.test(normalized);
}

export function getLaborTrainingRequirementDefinitionsForEmployee(employee = {}) {
  const positionTitle = employee?.position_title || employee?.position || employee?.target_role || "";
  const ppbcRequired = requiresPpbcTrainingForPosition(positionTitle);
  return LABOR_TRAINING_REQUIREMENT_DEFINITIONS
    .filter((definition) => !definition.ppbcOnly || ppbcRequired)
    .sort((a, b) => a.order - b.order);
}

export function inferLaborTrainingRequirementEvidenceMimeType(file = {}) {
  const explicitType = String(file?.type || "").trim().toLowerCase();
  if (explicitType === "application/pdf") return explicitType;
  const name = String(file?.name || "").trim().toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  return explicitType || "application/octet-stream";
}

export function validateLaborTrainingRequirementEvidenceFile(file) {
  if (!file) return { acceptedFile: null, error: "" };
  const mimeType = inferLaborTrainingRequirementEvidenceMimeType(file);
  const fileName = String(file?.name || "training evidence").trim() || "training evidence";
  const fileSize = Number(file?.size || 0);

  if (mimeType !== "application/pdf") {
    return { acceptedFile: null, error: `${fileName} must be a PDF file.` };
  }

  if (fileSize > LABOR_EMPLOYEE_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return { acceptedFile: null, error: `${fileName} is larger than 20 MB.` };
  }

  return { acceptedFile: file, error: "" };
}

export function buildLaborEmployeeRequirementEvidencePath({
  laborEmployeeId,
  requirementSlug,
  fileName,
  randomId,
} = {}) {
  const employeeId = normalizeOptionalUuid(laborEmployeeId);
  if (!employeeId) throw new Error("Valid labor employee id is required");

  const cleanSlug = String(requirementSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleanSlug) throw new Error("Valid training requirement slug is required");

  const uniqueId = String(
    randomId
    || globalThis.crypto?.randomUUID?.()
    || Date.now()
  )
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    || "training-evidence";

  return `${employeeId}/requirements/${cleanSlug}/${uniqueId}-${sanitizeLaborAttachmentFilename(fileName)}`;
}

export function validateLaborEmployeeAttachmentFiles(files = []) {
  const fileList = Array.from(files || []);
  const errors = [];
  const acceptedFiles = [];

  if (fileList.length > LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES) {
    errors.push(`Attach up to ${LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES} files per note.`);
  }

  fileList.slice(0, LABOR_EMPLOYEE_ATTACHMENT_MAX_FILES).forEach((file) => {
    const mimeType = inferLaborAttachmentMimeType(file);
    const fileName = String(file?.name || "attachment").trim() || "attachment";
    const fileSize = Number(file?.size || 0);

    if (!LABOR_EMPLOYEE_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
      errors.push(`${fileName} must be a PDF, PNG, JPG, or WEBP file.`);
      return;
    }

    if (fileSize > LABOR_EMPLOYEE_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
      errors.push(`${fileName} is larger than 20 MB.`);
      return;
    }

    acceptedFiles.push(file);
  });

  return { acceptedFiles, errors };
}

export function formatLaborAttachmentFileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function getLaborAttachmentPreviewKind(document = {}) {
  const mimeType = String(document?.mime_type || document?.metadata?.mime_type || "").toLowerCase();
  const name = String(document?.file_name || "").toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  return "unsupported";
}

export function isLaborEmployeeNoteDeleted(note = {}) {
  return Boolean(note?.deleted_at);
}

export function isLaborEmployeeDocumentDeleted(document = {}) {
  return Boolean(document?.deleted_at);
}

export function groupLaborEmployeeDocumentsByNote(documents = []) {
  return documents.reduce((acc, document) => {
    if (!document || typeof document !== "object") return acc;
    if (isLaborEmployeeDocumentDeleted(document)) return acc;
    const key = document.labor_employee_note_id || "__unlinked__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(document);
    acc[key].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
    return acc;
  }, {});
}

function getIsoDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function findCertificationForRequirement(certifications = [], requirement = {}, definition = {}) {
  const requirementId = requirement?.id;
  const slug = definition?.slug || requirement?.slug || "";
  const matchingRows = (Array.isArray(certifications) ? certifications : [])
    .filter((certification) => {
      if (!certification || typeof certification !== "object") return false;
      if (requirementId && certification.requirement_id === requirementId) return true;
      return String(certification.requirement_slug || certification.metadata?.requirement_slug || "") === slug;
    })
    .sort((a, b) => new Date(b.completed_on || b.created_at || 0) - new Date(a.completed_on || a.created_at || 0));
  return matchingRows[0] || null;
}

function findRequirementDocument({ certification = {}, documents = [], requirementSlug = "" } = {}) {
  const rows = (Array.isArray(documents) ? documents : []).filter((document) => !isLaborEmployeeDocumentDeleted(document));
  if (certification?.labor_employee_document_id) {
    const directMatch = rows.find((document) => document?.id === certification.labor_employee_document_id);
    if (directMatch) return directMatch;
  }

  return rows
    .filter((document) => {
      if (!document || typeof document !== "object") return false;
      if (String(document.document_type || "") !== "training_requirement_evidence") return false;
      return String(document.metadata?.requirement_slug || "") === requirementSlug;
    })
    .sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0))[0] || null;
}

export function buildEmployeeTrainingRequirementRows({
  employee = {},
  certifications = [],
  requirements = [],
  documents = [],
  today = new Date(),
} = {}) {
  const todayKey = getIsoDateKey(today) || getIsoDateKey(new Date());
  const requirementRowsBySlug = Object.fromEntries(
    (Array.isArray(requirements) ? requirements : []).map((requirement) => [requirement.slug, requirement])
  );

  return getLaborTrainingRequirementDefinitionsForEmployee(employee).map((definition) => {
    const requirement = requirementRowsBySlug[definition.slug] || null;
    const certification = findCertificationForRequirement(certifications, requirement, definition);
    const evidenceDocument = findRequirementDocument({
      certification,
      documents,
      requirementSlug: definition.slug,
    });
    const externalUrl = String(certification?.external_document_url || "").trim();
    const hasDocumentEvidence = Boolean(evidenceDocument);
    const hasEvidence = definition.evidenceMode === "pdf_or_url"
      ? Boolean(hasDocumentEvidence || externalUrl)
      : hasDocumentEvidence;
    const isExpired = Boolean(certification?.expires_on && getIsoDateKey(certification.expires_on) < todayKey);
    const isComplete = Boolean(certification?.completed_on && hasEvidence && !isExpired);
    const status = isComplete
      ? "complete"
      : isExpired
        ? "expired"
        : certification?.completed_on
          ? "needs_evidence"
          : "missing";

    return {
      ...definition,
      requirement,
      requirementId: requirement?.id || null,
      certification,
      evidenceDocument,
      externalUrl,
      hasEvidence,
      isComplete,
      status,
    };
  });
}

export function summarizeEmployeeTrainingRequirementCompliance(rows = []) {
  const requirementRows = Array.isArray(rows) ? rows : [];
  const incompleteRows = requirementRows.filter((row) => !row?.isComplete);
  const expiredRows = requirementRows.filter((row) => row?.status === "expired");
  const needsEvidenceRows = requirementRows.filter((row) => row?.status === "needs_evidence");

  if (requirementRows.length > 0 && incompleteRows.length === 0) {
    return {
      isCompliant: true,
      label: "Compliant",
      color: "success",
      missingCount: 0,
      helper: "All required training evidence is current.",
    };
  }

  const helper = expiredRows.length > 0
    ? `${expiredRows.length} expired requirement${expiredRows.length === 1 ? "" : "s"}`
    : needsEvidenceRows.length > 0
      ? `${needsEvidenceRows.length} requirement${needsEvidenceRows.length === 1 ? "" : "s"} need evidence`
      : `${incompleteRows.length || requirementRows.length} requirement${(incompleteRows.length || requirementRows.length) === 1 ? "" : "s"} incomplete`;

  return {
    isCompliant: false,
    label: "Non-Compliant",
    color: "danger",
    missingCount: incompleteRows.length || requirementRows.length,
    helper,
  };
}

export function getNextEmployeeReviewCycle(reviewCycleRows = []) {
  const cleanRows = (Array.isArray(reviewCycleRows) ? reviewCycleRows : [])
    .filter((row) => row && typeof row === "object")
    .filter((row) => String(row.status || "").toLowerCase() !== "completed");

  if (cleanRows.length === 0) return null;

  const rowsWithDueDates = cleanRows
    .filter((row) => row.dueDate)
    .map((row) => ({ ...row, dueTime: new Date(`${row.dueDate}T12:00:00`).getTime() }))
    .filter((row) => Number.isFinite(row.dueTime))
    .sort((a, b) => a.dueTime - b.dueTime);

  return rowsWithDueDates[0] || cleanRows[0] || null;
}

export function buildEmployeeRecordMetricCards({
  employeeSnapshot = {},
  reviewCycleRows = [],
  attendanceIncidentCount30d = 0,
} = {}) {
  const nextReview = getNextEmployeeReviewCycle(reviewCycleRows);
  return [
    {
      id: "training_compliance",
      label: "Training Compliance",
      value: employeeSnapshot?.training_compliance_flag ? "Compliant" : "Not Complete",
      tone: employeeSnapshot?.training_compliance_flag ? "success" : "warning",
    },
    {
      id: "next_review",
      label: "Next Review",
      value: nextReview?.label || "No Open Reviews",
      helper: nextReview?.dueDate ? `Due ${nextReview.dueDate}` : "No due date",
      tone: nextReview?.status === "overdue" ? "danger" : "default",
    },
    {
      id: "attendance_marks",
      label: "Attendance Marks",
      value: Number(attendanceIncidentCount30d || 0),
      helper: "Last 30 days",
      tone: Number(attendanceIncidentCount30d || 0) > 0 ? "warning" : "default",
    },
  ];
}

function getHistoryTimestampValue(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function humanizeHistoryToken(value = "") {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function toHistoryArray(value = []) {
  return Array.isArray(value) ? value : [];
}

const DERIVED_EMPLOYEE_HISTORY_EVENT_TYPES = new Set([
  "employee_document_deleted",
  "employee_note_deleted",
]);

export function buildEmployeeHistoryTimeline({
  historyEvents = [],
  notes = [],
  documents = [],
  attendanceIncidents = [],
  trainingEvents = [],
  trainingRecordMap = {},
  trainingItemMap = {},
} = {}) {
  const items = [];

  toHistoryArray(historyEvents).forEach((event) => {
    if (!event || typeof event !== "object") return;
    if (DERIVED_EMPLOYEE_HISTORY_EVENT_TYPES.has(event.event_type)) return;
    items.push({
      id: `history-${event.id}`,
      category: event.event_category || "employee",
      type: event.event_type || "history_event",
      title: event.title || humanizeHistoryToken(event.event_type || "History event"),
      summary: event.summary || "",
      oldValue: event.old_value || "",
      newValue: event.new_value || "",
      occurredAt: event.occurred_at || event.created_at,
      actorName: event.actor_name || "Staff",
      source: event.source_table || "history",
      raw: event,
    });
  });

  toHistoryArray(notes).forEach((note) => {
    if (!note || typeof note !== "object") return;
    items.push({
      id: `note-created-${note.id}`,
      category: "notes",
      type: "employee_note_created",
      title: "Employee note added",
      summary: note.note_text || "",
      occurredAt: note.created_at,
      actorName: note.created_by_name || "Staff",
      source: "labor_employee_notes",
      note,
    });

    if (isLaborEmployeeNoteDeleted(note)) {
      items.push({
        id: `note-deleted-${note.id}`,
        category: "notes",
        type: "employee_note_deleted",
        title: "Employee note removed",
        summary: note.note_text || "",
        occurredAt: note.deleted_at,
        actorName: note.deleted_by_name || "Staff",
        source: "labor_employee_notes",
        tone: "danger",
        note,
      });
    }
  });

  toHistoryArray(documents).forEach((document) => {
    if (!document || typeof document !== "object") return;
    items.push({
      id: `document-uploaded-${document.id}`,
      category: "documents",
      type: "employee_document_uploaded",
      title: "Attachment uploaded",
      summary: document.file_name || "Attachment",
      occurredAt: document.uploaded_at,
      actorName: document.uploaded_by_name || "Staff",
      source: "labor_employee_documents",
      document,
    });

    if (isLaborEmployeeDocumentDeleted(document)) {
      items.push({
        id: `document-deleted-${document.id}`,
        category: "documents",
        type: "employee_document_deleted",
        title: "Attachment removed",
        summary: document.file_name || "Attachment",
        occurredAt: document.deleted_at,
        actorName: document.deleted_by_name || "Staff",
        source: "labor_employee_documents",
        tone: "danger",
        document,
      });
    }
  });

  toHistoryArray(attendanceIncidents).forEach((incident) => {
    if (!incident || typeof incident !== "object") return;
    items.push({
      id: `attendance-${incident.id}`,
      category: "attendance",
      type: "attendance_mark_recorded",
      title: "Attendance mark recorded",
      summary: incident.detail || humanizeHistoryToken(incident.incident_type || "Attendance mark"),
      occurredAt: incident.created_at || incident.incident_date,
      actorName: incident.created_by_name || "Staff",
      source: "attendance_incidents",
      raw: incident,
    });
  });

  toHistoryArray(trainingEvents).forEach((event) => {
    if (!event || typeof event !== "object") return;
    const record = trainingRecordMap[event.record_id] || {};
    const item = trainingItemMap[event.template_item_id] || {};
    items.push({
      id: `training-event-${event.id}`,
      category: "training",
      type: event.event_type || "training_event",
      title: humanizeHistoryToken(event.event_type || "Training event"),
      summary: item.label || item.title || record.template_name_snapshot || record.employee_full_name || "",
      occurredAt: event.created_at,
      actorName: event.actor_name || "Staff",
      source: "training_record_events",
      raw: event,
    });
  });

  return items
    .filter((item) => item.occurredAt)
    .sort((a, b) => getHistoryTimestampValue(b.occurredAt) - getHistoryTimestampValue(a.occurredAt));
}

export function buildTrainingTemplateScopeClause(locationId) {
  return locationId ? `location_id.is.null,location_id.eq.${locationId}` : "location_id.is.null";
}

export function buildCreateTrainingRecordRpcArgs({
  templateId,
  locationRef,
  employeeFullName,
  targetRole,
  hireDate = null,
  trainingStartDate = null,
  targetEndDate = null,
  assignedTrainerName = null,
  assignedManagerName = null,
  actorUserId = null,
  actorName = null,
  laborEmployeeId = null,
}) {
  return {
    p_template_id: templateId,
    p_location_ref: locationRef,
    p_employee_full_name: employeeFullName?.trim?.() || "",
    p_target_role: targetRole?.trim?.() || "",
    p_hire_date: hireDate || null,
    p_training_start_date: trainingStartDate || null,
    p_target_end_date: targetEndDate || null,
    p_assigned_trainer_name: assignedTrainerName?.trim?.() || null,
    p_assigned_manager_name: assignedManagerName?.trim?.() || null,
    p_actor_user_id: normalizeOptionalUuid(actorUserId),
    p_actor_name: actorName?.trim?.() || null,
    p_labor_employee_id: normalizeOptionalUuid(laborEmployeeId),
  };
}

export function buildUpdateTrainingRecordConfigArgs({
  recordId,
  laborEmployeeId = null,
  employeeFullName = null,
  targetRole = null,
  hireDate = null,
  trainingStartDate = null,
  targetEndDate = null,
  assignedTrainerName = null,
  assignedManagerName = null,
  actorUserId = null,
  actorName = null,
}) {
  return {
    p_record_id: recordId,
    p_labor_employee_id: normalizeOptionalUuid(laborEmployeeId),
    p_employee_full_name: employeeFullName?.trim?.() || null,
    p_target_role: targetRole?.trim?.() || null,
    p_hire_date: hireDate || null,
    p_training_start_date: trainingStartDate || null,
    p_target_end_date: targetEndDate || null,
    p_assigned_trainer_name: assignedTrainerName?.trim?.() || null,
    p_assigned_manager_name: assignedManagerName?.trim?.() || null,
    p_actor_user_id: normalizeOptionalUuid(actorUserId),
    p_actor_name: actorName?.trim?.() || null,
  };
}

export const LABOR_EMPLOYMENT_COMMITMENT_OPTIONS = [
  { value: "full_time", label: "Full-Time", shortLabel: "FT" },
  { value: "part_time", label: "Part-Time", shortLabel: "PT" },
];

const LABOR_EMPLOYMENT_COMMITMENT_LABELS = Object.fromEntries(
  LABOR_EMPLOYMENT_COMMITMENT_OPTIONS.map((option) => [option.value, option])
);

export function normalizeLaborEmploymentCommitment(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "ft" || normalized === "fulltime") return "full_time";
  if (normalized === "pt" || normalized === "parttime") return "part_time";
  return LABOR_EMPLOYMENT_COMMITMENT_LABELS[normalized] ? normalized : null;
}

export function getLaborEmploymentCommitmentLabel(value, { short = false } = {}) {
  const normalized = normalizeLaborEmploymentCommitment(value);
  if (!normalized) return short ? "Unassigned" : "Unassigned";
  const option = LABOR_EMPLOYMENT_COMMITMENT_LABELS[normalized];
  return short ? option.shortLabel : option.label;
}

export function readLaborEmploymentCommitment(employee = {}) {
  if (!employee || typeof employee !== "object") return null;
  return normalizeLaborEmploymentCommitment(
    employee.employment_commitment
    || employee.employmentCommitment
    || employee.commitment
    || employee.metadata?.employment_commitment
  );
}

export const LABOR_SHIRT_SIZE_OPTIONS = [
  { value: "XS", label: "XS" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
  { value: "2XL", label: "2XL" },
  { value: "3XL", label: "3XL" },
  { value: "4XL", label: "4XL" },
  { value: "unknown", label: "Other/Unknown" },
];

const LABOR_SHIRT_SIZE_LABELS = Object.fromEntries(
  LABOR_SHIRT_SIZE_OPTIONS.map((option) => [option.value, option.label])
);

export function normalizeLaborShirtSize(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^XXL$/, "2XL")
    .replace(/^XXXL$/, "3XL")
    .replace(/^XXXXL$/, "4XL");
  if (!normalized) return null;
  if (["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"].includes(normalized)) return normalized;
  if (["OTHER", "UNKNOWN", "OTHER/UNKNOWN", "N/A", "NA"].includes(normalized)) return "unknown";
  return "unknown";
}

export function getLaborShirtSizeLabel(value) {
  const normalized = normalizeLaborShirtSize(value);
  return normalized ? LABOR_SHIRT_SIZE_LABELS[normalized] || LABOR_SHIRT_SIZE_LABELS.unknown : "Not listed";
}

export function readLaborEmployeeShirtSize(employee = {}) {
  if (!employee || typeof employee !== "object") return null;
  return normalizeLaborShirtSize(
    employee.shirt_size
    || employee.shirtSize
    || employee.uniform_shirt_size
    || employee.metadata?.shirt_size
    || employee.metadata?.shirtSize
    || employee.metadata?.uniform_shirt_size
  );
}

export function isValidLaborContactEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

export function buildLaborEmailRecipient(employee = {}) {
  if (!employee || typeof employee !== "object") return "";
  const email = readLaborEmployeeContactValue(employee, "contact_email") || employee.email || "";
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!isValidLaborContactEmail(normalizedEmail)) return "";
  const name = String(employee.full_name || employee.name || [employee.first_name, employee.last_name].filter(Boolean).join(" ") || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return name ? `${name} <${normalizedEmail}>` : normalizedEmail;
}

export function buildLaborEmailRecipients(employees = []) {
  const seen = new Set();
  return (Array.isArray(employees) ? employees : [])
    .filter((employee) => isLaborEmployeeActive(employee))
    .map((employee) => buildLaborEmailRecipient(employee))
    .filter((recipient) => {
      const email = recipient.match(/<([^>]+)>$/)?.[1] || recipient;
      const key = email.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildLaborEmailRecipientList(employees = []) {
  return buildLaborEmailRecipients(employees).join(", ");
}

export function buildLaborEmployeeShirtSizeHistoryEvent({
  laborEmployeeId,
  oldValue = null,
  newValue = null,
  actorUserId = null,
  actorName = null,
  occurredAt = null,
} = {}) {
  const normalizedOld = normalizeLaborShirtSize(oldValue);
  const normalizedNew = normalizeLaborShirtSize(newValue);
  if (!laborEmployeeId || normalizedOld === normalizedNew) return null;
  return {
    labor_employee_id: laborEmployeeId,
    event_category: "employee",
    event_type: "employee_field_changed",
    source_table: "labor_employees",
    source_id: laborEmployeeId,
    field_name: "shirt_size",
    title: "Shirt size changed",
    summary: "Employee shirt size changed",
    old_value: normalizedOld ? getLaborShirtSizeLabel(normalizedOld) : null,
    new_value: normalizedNew ? getLaborShirtSizeLabel(normalizedNew) : null,
    old_values: { shirt_size: normalizedOld },
    new_values: { shirt_size: normalizedNew },
    actor_user_id: normalizeOptionalUuid(actorUserId),
    actor_name: actorName?.trim?.() || null,
    occurred_at: occurredAt || new Date().toISOString(),
  };
}

export const LABOR_ROSTER_POSITION_GROUPS = [
  { key: "manager", label: "Managers" },
  { key: "supervisor", label: "Supervisors" },
  { key: "csr", label: "CSRs" },
  { key: "pct", label: "PCTs" },
  { key: "other", label: "Other" },
];

const LABOR_ROSTER_POSITION_GROUP_BY_KEY = Object.fromEntries(
  LABOR_ROSTER_POSITION_GROUPS.map((group) => [group.key, group])
);

export function getLaborRosterPositionGroup(positionTitle = "") {
  const title = String(positionTitle || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!title) return "other";
  if (/(director|regional|general manager|\bgm\b|assistant manager|\bagm\b|manager)/.test(title)) return "manager";
  if (/(supervisor|lead)/.test(title)) return "supervisor";
  if (/(customer service representative|\bcsr\b)/.test(title)) return "csr";
  if (/(pet care technician|\bpct\b|technician)/.test(title)) return "pct";
  return "other";
}

export function buildLaborRosterStaffingSummary(rosterSnapshot = []) {
  const emptyRowsByGroup = Object.fromEntries(
    LABOR_ROSTER_POSITION_GROUPS.map((group) => [
      group.key,
      {
        key: group.key,
        label: group.label,
        fullTime: 0,
        partTime: 0,
        unassigned: 0,
        total: 0,
      },
    ])
  );
  const activeRows = (Array.isArray(rosterSnapshot) ? rosterSnapshot : [])
    .filter((row) => row && typeof row === "object")
    .filter((row) => isLaborEmployeeActive(row));

  activeRows.forEach((row) => {
    const groupKey = LABOR_ROSTER_POSITION_GROUP_BY_KEY[row.position_group]
      ? row.position_group
      : getLaborRosterPositionGroup(row.position_title);
    const matrixRow = emptyRowsByGroup[groupKey] || emptyRowsByGroup.other;
    const commitment = readLaborEmploymentCommitment(row);
    if (commitment === "full_time") {
      matrixRow.fullTime += 1;
    } else if (commitment === "part_time") {
      matrixRow.partTime += 1;
    } else {
      matrixRow.unassigned += 1;
    }
    matrixRow.total += 1;
  });

  const staffingMatrix = LABOR_ROSTER_POSITION_GROUPS
    .map((group) => emptyRowsByGroup[group.key])
    .filter((row) => row.key !== "other" || row.total > 0 || row.unassigned > 0);

  return {
    activeEmployeeCount: activeRows.length,
    managerCount: emptyRowsByGroup.manager.total,
    supervisorCount: emptyRowsByGroup.supervisor.total,
    csrCount: emptyRowsByGroup.csr.total,
    pctCount: emptyRowsByGroup.pct.total,
    otherPositionCount: emptyRowsByGroup.other.total,
    fullTimeCount: activeRows.filter((row) => readLaborEmploymentCommitment(row) === "full_time").length,
    partTimeCount: activeRows.filter((row) => readLaborEmploymentCommitment(row) === "part_time").length,
    unassignedCommitmentCount: activeRows.filter((row) => !readLaborEmploymentCommitment(row)).length,
    staffingMatrix,
  };
}

export function buildCreateLaborEmployeeRpcArgs({
  locationRef,
  fullName,
  positionTitle,
  startDate,
  endDate = null,
  employmentCommitment = null,
  linkedUserId = null,
  actorUserId = null,
  actorName = null,
}) {
  return {
    p_location_ref: locationRef,
    p_full_name: fullName?.trim?.() || "",
    p_position_title: positionTitle?.trim?.() || "",
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_employment_commitment: normalizeLaborEmploymentCommitment(employmentCommitment),
    p_linked_user_id: normalizeOptionalUuid(linkedUserId),
    p_actor_user_id: normalizeOptionalUuid(actorUserId),
    p_actor_name: actorName?.trim?.() || null,
  };
}

export function buildUpdateLaborEmployeeRpcArgs({
  employeeId,
  fullName = null,
  positionTitle = null,
  startDate = null,
  endDate = null,
  employmentCommitment = null,
  linkedUserId = null,
  actorUserId = null,
}) {
  return {
    p_employee_id: employeeId,
    p_full_name: fullName?.trim?.() || null,
    p_position_title: positionTitle?.trim?.() || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_end_date_provided: true,
    p_employment_commitment: normalizeLaborEmploymentCommitment(employmentCommitment),
    p_employment_commitment_provided: true,
    p_linked_user_id: normalizeOptionalUuid(linkedUserId),
    p_actor_user_id: normalizeOptionalUuid(actorUserId),
  };
}

function normalizeTimeParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [hoursText = "", minutesText = "00"] = raw.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

export function formatTrainingClock(value) {
  const parts = normalizeTimeParts(value);
  if (!parts) return "";
  const date = new Date(Date.UTC(2000, 0, 1, parts.hours, parts.minutes));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

export function formatTrainingTimeRange(start, end) {
  const startLabel = formatTrainingClock(start);
  const endLabel = formatTrainingClock(end);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || "";
}

export function formatTrainingTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function groupTrainingNotes(notes = []) {
  const itemNotes = {};
  const sectionNotes = {};
  const generalNotes = [];

  notes.forEach((note) => {
    if (!note || typeof note !== "object") return;
    if (note.template_item_id) {
      if (!itemNotes[note.template_item_id]) itemNotes[note.template_item_id] = [];
      itemNotes[note.template_item_id].push(note);
      return;
    }

    if (note.template_section_id) {
      if (!sectionNotes[note.template_section_id]) sectionNotes[note.template_section_id] = [];
      sectionNotes[note.template_section_id].push(note);
      return;
    }

    generalNotes.push(note);
  });

  return { itemNotes, sectionNotes, generalNotes };
}

export function groupLaborEmployeeNotes(notes = []) {
  return notes.reduce((acc, note) => {
    if (!note || typeof note !== "object") return acc;
    if (isLaborEmployeeNoteDeleted(note)) return acc;
    const key = note.labor_employee_id || "__unlinked__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});
}

export function splitLaborEmployeeName(fullName = "") {
  const tokens = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: "" };
  return {
    firstName: tokens.slice(0, -1).join(" "),
    lastName: tokens[tokens.length - 1],
  };
}

export function readLaborEmployeeContactValue(employee = {}, key) {
  if (!employee || typeof employee !== "object") return "";
  return String(employee?.metadata?.[key] || employee?.[key] || "").trim();
}

export function isLaborEmployeeActive(employee) {
  if (!employee || typeof employee !== "object") return false;
  const explicitStatus = String(employee.employment_status || "").trim().toLowerCase();
  if (explicitStatus === "active") return true;
  if (explicitStatus === "inactive" || explicitStatus === "terminated") return false;
  if (typeof employee.is_active === "boolean") return employee.is_active;
  return !employee.end_date;
}

function cleanContactText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function escapeVCardText(value) {
  return cleanContactText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldVCardLine(line) {
  const raw = String(line || "");
  if (raw.length <= 75) return raw;
  const chunks = [];
  let remaining = raw;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = remaining.slice(75);
  }
  chunks.push(remaining);
  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

function vCardDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function normalizeVCardPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function makeVCardLine(name, value) {
  const cleaned = cleanContactText(value);
  if (!cleaned) return null;
  return foldVCardLine(`${name}:${escapeVCardText(cleaned)}`);
}

function makeVCardRawLine(name, value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  return foldVCardLine(`${name}:${cleaned}`);
}

export function buildLaborEmployeeContactCard(employee = {}, { locationName = "K9 Operations", generatedAt = null } = {}) {
  const fullName = cleanContactText(employee.full_name || employee.name || "");
  const { firstName, lastName } = splitLaborEmployeeName(fullName);
  const positionTitle = cleanContactText(employee.position_title || employee.role || "");
  const cleanLocationName = cleanContactText(locationName || employee.location_name || "K9 Operations");
  const email = cleanContactText(readLaborEmployeeContactValue(employee, "contact_email") || employee.email);
  const phone = normalizeVCardPhone(readLaborEmployeeContactValue(employee, "contact_phone") || employee.phone);
  const title = [positionTitle, cleanLocationName].filter(Boolean).join(" - ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    foldVCardLine(`N:${escapeVCardText(lastName)};${escapeVCardText(firstName)};;;`),
    makeVCardLine("FN", fullName || "Employee"),
    makeVCardLine("ORG", title || cleanLocationName || "K9 Operations"),
    makeVCardLine("TITLE", title),
    makeVCardRawLine("TEL;TYPE=CELL,VOICE", phone),
    makeVCardRawLine("EMAIL;TYPE=INTERNET", email),
    makeVCardLine("NOTE", employee.start_date ? `Start date: ${employee.start_date}` : ""),
    makeVCardRawLine("UID", employee.id ? `k9-operations-labor-${employee.id}` : null),
    makeVCardRawLine("REV", vCardDateTime(generatedAt)),
    "END:VCARD",
  ].filter(Boolean);

  return `${lines.join("\r\n")}\r\n`;
}

export function buildLaborEmployeeContactCardFile(employees = [], options = {}) {
  return (Array.isArray(employees) ? employees : [])
    .filter((employee) => employee && typeof employee === "object")
    .map((employee) => buildLaborEmployeeContactCard(employee, options))
    .join("\r\n");
}

export function buildLaborEmployeeContactCardFilename(employee = {}, { locationName = "K9 Operations", bulk = false } = {}) {
  const base = bulk
    ? `${locationName || "K9 Operations"} active employee contacts`
    : `${employee.full_name || employee.name || "employee"} contact card`;
  const slug = String(base || "labor-contact-card")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "labor-contact-card"}.vcf`;
}

function toDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysAgoDateOnly(asOf, days) {
  const source = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date();
  const date = new Date(source.getFullYear(), source.getMonth(), source.getDate(), 12);
  date.setDate(date.getDate() - days);
  return date;
}

export function buildLaborDashboardMetrics({ rosterSnapshot = [], employeeNotes = [], attendanceIncidents = [] }) {
  const now = new Date();
  const thirtyDaysAgoDateOnly = daysAgoDateOnly(now, 30);
  const dayMs = 24 * 60 * 60 * 1000;
  const cleanRosterSnapshot = rosterSnapshot.filter((row) => row && typeof row === "object");
  const cleanEmployeeNotes = employeeNotes.filter((note) => note && typeof note === "object");
  const cleanAttendanceIncidents = attendanceIncidents.filter((incident) => incident && typeof incident === "object");
  const activeRows = cleanRosterSnapshot.filter((row) => isLaborEmployeeActive(row));
  const activeEmployeeIds = new Set(
    activeRows
      .map((row) => row.labor_employee_id || row.id)
      .filter(Boolean)
  );
  const noteCount30d = cleanEmployeeNotes.filter((note) => {
    const createdAt = note?.created_at ? new Date(note.created_at) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && now - createdAt <= 30 * dayMs;
  }).length;
  const attendanceMarkCount30d = cleanAttendanceIncidents.filter((incident) => {
    if (activeEmployeeIds.size > 0 && !activeEmployeeIds.has(incident?.labor_employee_id)) return false;
    const incidentDate = toDateOnly(incident?.incident_date);
    return incidentDate && incidentDate >= thirtyDaysAgoDateOnly;
  }).length;
  const newHireCount30d = activeRows.filter((row) => {
    const startDate = toDateOnly(row.start_date);
    return startDate && startDate >= thirtyDaysAgoDateOnly;
  }).length;
  const terminationCount30d = cleanRosterSnapshot.filter((row) => {
    const endDate = toDateOnly(row.end_date);
    return endDate && endDate >= thirtyDaysAgoDateOnly;
  }).length;
  const activeTraineeCount = activeRows.filter((row) => Number(row.open_training_record_count || 0) > 0).length;
  const trainingComplianceNumerator = activeRows.filter((row) => {
    if (typeof row.training_compliance_flag === "boolean") return row.training_compliance_flag;
    const openCount = Number(row.open_training_record_count || 0);
    const completedCount = Number(row.completed_training_record_count || 0);
    return openCount === 0 && completedCount > 0;
  }).length;
  const trainingComplianceDenominator = activeRows.length;
  const staffingSummary = buildLaborRosterStaffingSummary(cleanRosterSnapshot);

  return {
    ...staffingSummary,
    activeEmployeeCount: activeRows.length,
    employeeNoteCount30d: noteCount30d,
    attendanceMarkCount30d,
    newHireCount30d,
    terminationCount30d,
    activeTraineeCount,
    trainingComplianceNumerator,
    trainingComplianceDenominator,
    trainingComplianceScore: trainingComplianceDenominator
      ? Math.round((trainingComplianceNumerator / trainingComplianceDenominator) * 100)
      : 0,
  };
}

export function summarizeTrainingWorkflow({ templates, versions, records }) {
  const availableCount = (templates || []).filter(
    (template) =>
      template.template_class === "training_plan" &&
      (versions || []).some((version) => version.template_id === template.id)
  ).length;
  const activeRecords = (records || []).filter((record) =>
    ACTIVE_TRAINING_RECORD_STATUSES.includes(record.overall_status)
  ).length;

  if (activeRecords > 0) {
    return {
      status: "in_progress",
      progress: 0,
      countLabel: `${activeRecords} active record${activeRecords > 1 ? "s" : ""}`,
    };
  }

  if (availableCount > 0) {
    return {
      status: "not_started",
      progress: 0,
      countLabel: `${availableCount} template${availableCount > 1 ? "s" : ""} available`,
    };
  }

  return {
    status: "not_started",
    progress: 0,
    countLabel: "No templates",
  };
}

export async function resolveTrainingLocationId(client, locationRef, userId) {
  const trimmedLocationRef = String(locationRef || "").trim();
  const normalizedUserId = normalizeOptionalUuid(userId);
  if (!trimmedLocationRef || trimmedLocationRef === "enterprise") return null;
  if (isUuid(trimmedLocationRef)) return trimmedLocationRef;

  try {
    const { data: locationData } = await client
      .from("locations")
      .select("id")
      .eq("slug", trimmedLocationRef)
      .limit(1)
      .maybeSingle();

    if (locationData?.id && isUuid(locationData.id)) {
      return locationData.id;
    }
  } catch {
    // Fall through to user-linked location lookup.
  }

  if (!normalizedUserId) return null;

  try {
    const { data: profileLocation } = await client
      .from("profile_locations")
      .select("location_id")
      .eq("profile_id", normalizedUserId)
      .limit(1)
      .maybeSingle();

    if (profileLocation?.location_id && isUuid(profileLocation.location_id)) {
      return profileLocation.location_id;
    }
  } catch {
    // Fall through and return null so callers can avoid malformed UUID filters.
  }

  return null;
}

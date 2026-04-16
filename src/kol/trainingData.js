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

export function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function normalizeOptionalUuid(value) {
  const trimmed = String(value || "").trim();
  return isUuid(trimmed) ? trimmed : null;
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

export function buildCreateLaborEmployeeRpcArgs({
  locationRef,
  fullName,
  positionTitle,
  startDate,
  endDate = null,
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

export function buildLaborDashboardMetrics({ rosterSnapshot = [], employeeNotes = [], attendanceIncidents = [] }) {
  const now = new Date();
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
    return incidentDate && now - incidentDate <= 30 * dayMs;
  }).length;
  const newHireCount30d = activeRows.filter((row) => {
    const startDate = toDateOnly(row.start_date);
    return startDate && now - startDate <= 30 * dayMs;
  }).length;
  const terminationCount30d = cleanRosterSnapshot.filter((row) => {
    const endDate = toDateOnly(row.end_date);
    return endDate && now - endDate <= 30 * dayMs;
  }).length;
  const activeTraineeCount = activeRows.filter((row) => Number(row.open_training_record_count || 0) > 0).length;
  const trainingComplianceNumerator = activeRows.filter((row) => {
    if (typeof row.training_compliance_flag === "boolean") return row.training_compliance_flag;
    const openCount = Number(row.open_training_record_count || 0);
    const completedCount = Number(row.completed_training_record_count || 0);
    return openCount === 0 && completedCount > 0;
  }).length;
  const trainingComplianceDenominator = activeRows.length;

  return {
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

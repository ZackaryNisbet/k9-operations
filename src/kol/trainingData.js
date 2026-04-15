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
    const key = note.labor_employee_id || "__unlinked__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});
}

export function isLaborEmployeeActive(employee) {
  return !employee?.end_date;
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
  const activeRows = rosterSnapshot.filter((row) => isLaborEmployeeActive(row));
  const activeEmployeeIds = new Set(
    activeRows
      .map((row) => row.labor_employee_id || row.id)
      .filter(Boolean)
  );
  const noteCount30d = employeeNotes.filter((note) => {
    const createdAt = note?.created_at ? new Date(note.created_at) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && now - createdAt <= 30 * dayMs;
  }).length;
  const attendanceMarkCount30d = attendanceIncidents.filter((incident) => {
    if (activeEmployeeIds.size > 0 && !activeEmployeeIds.has(incident?.labor_employee_id)) return false;
    const incidentDate = toDateOnly(incident?.incident_date);
    return incidentDate && now - incidentDate <= 30 * dayMs;
  }).length;
  const newHireCount30d = activeRows.filter((row) => {
    const startDate = toDateOnly(row.start_date);
    return startDate && now - startDate <= 30 * dayMs;
  }).length;
  const terminationCount30d = rosterSnapshot.filter((row) => {
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

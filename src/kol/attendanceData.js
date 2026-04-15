import { todayStr } from "../shared/theme";

export const ATTENDANCE_INCIDENT_OPTIONS = [
  { value: "tardy", label: "Tardy", color: "#F0AD4E" },
  { value: "early_release", label: "Early Release", color: "#E67E22" },
  { value: "call_out_2_plus_hours", label: "Call Out (2+ hrs)", color: "#E74C3C" },
  { value: "late_call_out_under_2_hours", label: "Late Call Out (<2 hrs)", color: "#C0392B" },
  { value: "no_call_no_show", label: "No Call / No Show", color: "#922B21" },
];

export const ATTENDANCE_POLICY_ACTION_OPTIONS = [
  { value: "coaching_note", label: "Coaching Note" },
  { value: "verbal_warning", label: "Verbal Warning" },
  { value: "written_warning", label: "Written Warning" },
  { value: "final_written_warning", label: "Final Written Warning" },
  { value: "termination", label: "Termination" },
];

const INCIDENT_LABEL_BY_VALUE = Object.fromEntries(
  ATTENDANCE_INCIDENT_OPTIONS.map((option) => [option.value, option.label]),
);

const ACTION_LABEL_BY_VALUE = Object.fromEntries(
  ATTENDANCE_POLICY_ACTION_OPTIONS.map((option) => [option.value, option.label]),
);

const LEGACY_INCIDENT_TYPE_TO_VALUE = {
  Tardy: "tardy",
  "Early Release": "early_release",
  "Call Out (2+ hrs)": "call_out_2_plus_hours",
  "Late Call Out (<2 hrs)": "late_call_out_under_2_hours",
  "No Call / No Show": "no_call_no_show",
};

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isActiveEmployee(employee) {
  return !employee?.end_date && !employee?.endDate;
}

function toDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysAgoDate(asOf, days) {
  return new Date(asOf.getTime() - days * 24 * 60 * 60 * 1000);
}

export function getAttendanceIncidentLabel(value) {
  return INCIDENT_LABEL_BY_VALUE[value] || value || "Incident";
}

export function getAttendanceActionLabel(value) {
  return ACTION_LABEL_BY_VALUE[value] || value || "Policy Action";
}

export function summarizeAttendanceIncidents({ laborEmployees = [], incidents = [], asOf = new Date() }) {
  const thresholdDate = daysAgoDate(asOf, 30);
  const rows = laborEmployees
    .filter((employee) => isActiveEmployee(employee))
    .map((employee) => {
      const employeeIncidents = incidents.filter(
        (incident) => incident.labor_employee_id === employee.id,
      );

      const byType = Object.fromEntries(
        ATTENDANCE_INCIDENT_OPTIONS.map((option) => {
          const typed = employeeIncidents.filter((incident) => incident.incident_type === option.value);
          return [
            option.value,
            {
              label: option.label,
              allTime: typed.length,
              last30: typed.filter((incident) => {
                const incidentDate = toDateOnly(incident.incident_date);
                return incidentDate && incidentDate >= thresholdDate;
              }).length,
            },
          ];
        }),
      );

      const totalAll = employeeIncidents.length;
      const total30 = employeeIncidents.filter((incident) => {
        const incidentDate = toDateOnly(incident.incident_date);
        return incidentDate && incidentDate >= thresholdDate;
      }).length;

      return {
        ...employee,
        byType,
        totalAll,
        total30,
      };
    })
    .sort((a, b) => b.totalAll - a.totalAll || String(a.full_name || "").localeCompare(String(b.full_name || "")));

  const totals = ATTENDANCE_INCIDENT_OPTIONS.reduce((acc, option) => {
    acc[option.value] = {
      allTime: rows.reduce((sum, row) => sum + row.byType[option.value].allTime, 0),
      last30: rows.reduce((sum, row) => sum + row.byType[option.value].last30, 0),
    };
    return acc;
  }, {});

  return {
    rows,
    totals: {
      byType: totals,
      totalAll: rows.reduce((sum, row) => sum + row.totalAll, 0),
      total30: rows.reduce((sum, row) => sum + row.total30, 0),
    },
  };
}

export function buildAttendanceActivityFeed({
  incidents = [],
  policyActions = [],
  employeeMap = {},
}) {
  const incidentFeed = incidents.map((incident) => ({
    id: `incident:${incident.id}`,
    kind: "incident",
    laborEmployeeId: incident.labor_employee_id,
    employeeName: employeeMap[incident.labor_employee_id]?.full_name || "Unknown Employee",
    typeLabel: getAttendanceIncidentLabel(incident.incident_type),
    noteText: incident.detail || "",
    effectiveDate: incident.incident_date,
    createdAt: incident.created_at,
    createdByName: incident.created_by_name || "Staff",
    metadata: incident.metadata || {},
  }));

  const actionFeed = policyActions.map((action) => ({
    id: `action:${action.id}`,
    kind: "policy_action",
    laborEmployeeId: action.labor_employee_id,
    employeeName: employeeMap[action.labor_employee_id]?.full_name || "Unknown Employee",
    typeLabel: getAttendanceActionLabel(action.action_type),
    noteText: action.note_text || "",
    effectiveDate: action.action_date,
    createdAt: action.created_at,
    createdByName: action.created_by_name || "Staff",
    metadata: action.metadata || {},
    incidentId: action.incident_id || null,
  }));

  return [...incidentFeed, ...actionFeed].sort((a, b) => {
    const left = new Date(b.createdAt || b.effectiveDate || 0).getTime();
    const right = new Date(a.createdAt || a.effectiveDate || 0).getTime();
    return left - right;
  });
}

export function planLegacyAttendanceImport({
  legacyRoster = [],
  legacyEntries = [],
  laborEmployees = [],
  importedLegacyEntryIds = [],
  fallbackStartDate = todayStr(),
}) {
  const existingEmployeesByName = new Map(
    laborEmployees
      .filter((employee) => normalizeName(employee.full_name))
      .map((employee) => [normalizeName(employee.full_name), employee]),
  );

  const legacyEmployeeRefs = new Map();
  const employeeCreates = [];

  legacyRoster.forEach((row, index) => {
    const normalized = normalizeName(row?.name);
    if (!normalized || legacyEmployeeRefs.has(normalized)) return;

    const existing = existingEmployeesByName.get(normalized);
    if (existing) {
      legacyEmployeeRefs.set(normalized, { mode: "existing", id: existing.id, employee: existing });
      return;
    }

    const tempKey = `legacy-create-${index}`;
    const createPlan = {
      tempKey,
      fullName: String(row?.name || "").trim(),
      positionTitle: String(row?.title || "").trim() || "Team Member",
      startDate: row?.startDate || fallbackStartDate,
      endDate: row?.endDate || null,
    };
    employeeCreates.push(createPlan);
    legacyEmployeeRefs.set(normalized, { mode: "create", tempKey: createPlan.tempKey, plan: createPlan });
  });

  const importedSet = new Set(importedLegacyEntryIds.filter(Boolean).map(String));
  const incidentCreates = [];
  const unmatchedEntries = [];
  const skippedEntries = [];

  legacyEntries.forEach((entry) => {
    if (!entry?.id || importedSet.has(String(entry.id))) {
      if (entry?.id) skippedEntries.push(entry.id);
      return;
    }

    const normalized = normalizeName(entry?.name);
    const employeeRef = legacyEmployeeRefs.get(normalized) || existingEmployeesByName.get(normalized);
    const incidentType = LEGACY_INCIDENT_TYPE_TO_VALUE[entry?.type];

    if (!employeeRef || !incidentType) {
      unmatchedEntries.push({
        id: entry?.id || null,
        name: entry?.name || "",
        type: entry?.type || "",
        reason: !employeeRef ? "employee_not_found" : "incident_type_not_mapped",
      });
      return;
    }

    incidentCreates.push({
      legacyId: entry.id,
      laborEmployeeId: employeeRef.id || null,
      laborEmployeeTempKey: employeeRef.tempKey || null,
      incidentType,
      incidentDate: entry.date || fallbackStartDate,
      coverageSecured: String(entry.coverage || "").trim().toLowerCase() === "yes",
      detail: String(entry.notes || "").trim() || null,
      metadata: {
        legacy_entry_id: entry.id,
        legacy_source: "attendance_tracker_local",
        legacy_name: entry.name || "",
        legacy_logged_by: entry.loggedBy || null,
        legacy_logged_at: entry.loggedAt || entry.createdAt || null,
        legacy_last_edited_by: entry.lastEditedBy || null,
        legacy_last_edited_at: entry.lastEditedAt || null,
      },
    });
  });

  return {
    employeeCreates,
    incidentCreates,
    unmatchedEntries,
    skippedEntries,
  };
}

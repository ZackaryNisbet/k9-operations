import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, Card, CustomSelect, Inp, MiniDatePicker, Modal } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import {
  ATTENDANCE_INCIDENT_OPTIONS,
  ATTENDANCE_POLICY_ACTION_OPTIONS,
  buildAttendanceActivityFeed,
  getAttendanceActionLabel,
  getAttendanceIncidentLabel,
  planLegacyAttendanceImport,
  summarizeAttendanceIncidents,
} from "../attendanceData";
import {
  buildCreateLaborEmployeeRpcArgs,
  buildUpdateLaborEmployeeRpcArgs,
  normalizeOptionalUuid,
  resolveTrainingLocationId,
} from "../trainingData";

const INCIDENT_COLOR_BY_VALUE = Object.fromEntries(
  ATTENDANCE_INCIDENT_OPTIONS.map((option) => [option.value, option.color]),
);

const POLICY_REFERENCE_SECTIONS = [
  {
    title: "Attendance Types",
    subtitle: "Use these categories when logging attendance incidents. Listed from least to most severe.",
    items: ATTENDANCE_INCIDENT_OPTIONS.map((option) => ({
      label: option.label,
      body: {
        tardy: "Employee arrived 5 or more minutes after their scheduled shift start time.",
        early_release: "Employee left their shift before the scheduled end time and was not released early by management due to staffing needs.",
        call_out_2_plus_hours: "Employee called out at least 2 hours before shift start.",
        late_call_out_under_2_hours: "Employee called out with less than 2 hours notice before shift start.",
        no_call_no_show: "Employee did not report to work and did not contact management at all.",
      }[option.value],
    })),
  },
  {
    title: "Progressive Counseling Process",
    subtitle: "Escalate with documentation. Track the formal outcome in Policy Actions so it lives with the employee’s labor history.",
    items: [
      { label: "Coaching Note", body: "Use when attendance concerns need formal documentation but have not yet crossed the verbal-warning threshold." },
      { label: "Verbal Warning", body: "Use for repeated lower-level violations or the first significant attendance breakdown that requires coaching." },
      { label: "Written Warning", body: "Use when a new attendance violation happens after a verbal warning or the pattern is continuing." },
      { label: "Final Written Warning", body: "Use when attendance issues continue after prior counseling and the next violation risks termination." },
      { label: "Termination", body: "Use for final separation tied to repeated attendance violations or a major offense such as a No Call / No Show." },
    ],
  },
  {
    title: "Important Notes",
    subtitle: null,
    items: [
      { label: "Coverage Responsibility", body: "Employees are expected to actively seek coverage from other trained staff when calling out." },
      { label: "Emergency Review", body: "Emergency situations are reviewed case-by-case in partnership with leadership and may require documentation." },
      { label: "Voluntary Resignation", body: "Three consecutive missed scheduled shifts without communication should be treated as a voluntary resignation review item." },
    ],
  },
];

function formatTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateOnly(value) {
  return value ? fmtDate(value) : "—";
}

function StatusPill({ active }) {
  return active ? <Badge color="success">Active</Badge> : <Badge color="warning">Inactive</Badge>;
}

function TypePill({ label, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: `${color}18`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </Card>
  );
}

export default function AttendanceTrackerPage({ data, save, nav, profile, addGlobalToast = () => {}, params = {} }) {
  const [tab, setTab] = useState("roster");
  const [loading, setLoading] = useState(true);
  const [resolvedLocationId, setResolvedLocationId] = useState("");
  const [laborEmployees, setLaborEmployees] = useState([]);
  const [rosterSnapshot, setRosterSnapshot] = useState([]);
  const [attendanceIncidents, setAttendanceIncidents] = useState([]);
  const [attendancePolicyActions, setAttendancePolicyActions] = useState([]);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeTitle, setEmployeeTitle] = useState("");
  const [employeeStartDate, setEmployeeStartDate] = useState(todayStr());
  const [employeeEndDate, setEmployeeEndDate] = useState("");
  const [savingEmployee, setSavingEmployee] = useState(false);

  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [editingIncidentId, setEditingIncidentId] = useState(null);
  const [incidentEmployeeId, setIncidentEmployeeId] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [incidentDate, setIncidentDate] = useState(todayStr());
  const [incidentCoverage, setIncidentCoverage] = useState("no");
  const [incidentDetail, setIncidentDetail] = useState("");
  const [savingIncident, setSavingIncident] = useState(false);

  const [showPolicyActionModal, setShowPolicyActionModal] = useState(false);
  const [editingPolicyActionId, setEditingPolicyActionId] = useState(null);
  const [policyEmployeeId, setPolicyEmployeeId] = useState("");
  const [policyIncidentId, setPolicyIncidentId] = useState("");
  const [policyActionType, setPolicyActionType] = useState("");
  const [policyActionDate, setPolicyActionDate] = useState(todayStr());
  const [policyActionNote, setPolicyActionNote] = useState("");
  const [savingPolicyAction, setSavingPolicyAction] = useState(false);

  const [historyEmployeeFilter, setHistoryEmployeeFilter] = useState("");
  const [historyKindFilter, setHistoryKindFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [importingLegacy, setImportingLegacy] = useState(false);

  const locationRef = profile?.location_id || data?.locationId || "";
  const laborLocationRef = resolvedLocationId || locationRef || "";
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const canManage = hasLeanPermission(profile, "Attendance Tracker");
  const legacyRoster = data?.attendanceRoster || [];
  const legacyEntries = data?.attendanceEntries || [];

  useEffect(() => {
    const employeeId = normalizeOptionalUuid(params?.employeeId);
    const requestedTab = String(params?.tab || "").trim();
    if (employeeId) {
      setHistoryEmployeeFilter(employeeId);
      setIncidentEmployeeId((current) => current || employeeId);
      setPolicyEmployeeId((current) => current || employeeId);
    }
    if (["roster", "incidents", "policy", "history", "reference"].includes(requestedTab)) {
      setTab(requestedTab);
    } else if (employeeId) {
      setTab("history");
    }
  }, [params?.employeeId, params?.tab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const locationId = await resolveTrainingLocationId(supabase, locationRef, actorUserId);
      if (!locationId) {
        setResolvedLocationId("");
        setLaborEmployees([]);
        setRosterSnapshot([]);
        setAttendanceIncidents([]);
        setAttendancePolicyActions([]);
        setLoading(false);
        return;
      }

      setResolvedLocationId(locationId);

      const [employeesRes, dashboardRes] = await Promise.all([
        supabase.from("labor_employees").select("*").eq("location_id", locationId).order("full_name"),
        supabase.rpc("get_labor_dashboard_snapshot", {
          p_location_ref: locationId,
          p_actor_user_id: actorUserId,
        }),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (dashboardRes.error) throw dashboardRes.error;

      const employeeRows = employeesRes.data || [];
      const rosterRows = Array.isArray(dashboardRes.data?.roster) ? dashboardRes.data.roster : [];
      const employeeIds = employeeRows.map((employee) => employee.id);

      const [incidentRes, actionRes] = await Promise.all([
        employeeIds.length > 0
          ? supabase
              .from("attendance_incidents")
              .select("*")
              .in("labor_employee_id", employeeIds)
              .order("incident_date", { ascending: false })
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase
              .from("attendance_policy_actions")
              .select("*")
              .in("labor_employee_id", employeeIds)
              .order("action_date", { ascending: false })
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (incidentRes.error) throw incidentRes.error;
      if (actionRes.error) throw actionRes.error;

      setLaborEmployees(employeeRows);
      setRosterSnapshot(rosterRows);
      setAttendanceIncidents(incidentRes.data || []);
      setAttendancePolicyActions(actionRes.data || []);
    } catch (error) {
      console.error("Attendance load error:", error);
      addGlobalToast(`Failed to load attendance: ${error.message || "Unknown error"}`, "error");
    }
    setLoading(false);
  }, [actorUserId, addGlobalToast, locationRef]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const employeeMap = useMemo(
    () => Object.fromEntries(laborEmployees.map((employee) => [employee.id, employee])),
    [laborEmployees],
  );

  const snapshotMap = useMemo(
    () => Object.fromEntries(rosterSnapshot.map((row) => [row.labor_employee_id, row])),
    [rosterSnapshot],
  );

  const employeeSelectOptions = useMemo(
    () =>
      laborEmployees
        .map((employee) => ({
          value: employee.id,
          label: `${employee.full_name} (${employee.position_title})`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [laborEmployees],
  );

  const incidentStatsByEmployee = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return attendanceIncidents.reduce((acc, incident) => {
      const key = incident.labor_employee_id;
      if (!acc[key]) {
        acc[key] = {
          totalAll: 0,
          total30: 0,
          lastIncidentDate: null,
        };
      }
      acc[key].totalAll += 1;
      const incidentDate = new Date(`${incident.incident_date}T12:00:00`);
      if (!Number.isNaN(incidentDate.getTime()) && incidentDate >= threshold) {
        acc[key].total30 += 1;
      }
      if (!acc[key].lastIncidentDate || incident.incident_date > acc[key].lastIncidentDate) {
        acc[key].lastIncidentDate = incident.incident_date;
      }
      return acc;
    }, {});
  }, [attendanceIncidents]);

  const policyActionStatsByEmployee = useMemo(() => {
    return attendancePolicyActions.reduce((acc, action) => {
      acc[action.labor_employee_id] = (acc[action.labor_employee_id] || 0) + 1;
      return acc;
    }, {});
  }, [attendancePolicyActions]);

  const activeEmployees = useMemo(
    () => laborEmployees.filter((employee) => !employee.end_date),
    [laborEmployees],
  );

  const inactiveEmployees = useMemo(
    () => laborEmployees.filter((employee) => !!employee.end_date),
    [laborEmployees],
  );

  const rosterRows = useMemo(() => {
    return [...laborEmployees]
      .map((employee) => {
        const snapshot = snapshotMap[employee.id];
        const incidentStats = incidentStatsByEmployee[employee.id] || {
          totalAll: 0,
          total30: 0,
          lastIncidentDate: null,
        };
        return {
          ...employee,
          is_active: !employee.end_date,
          recent_attendance_incident_count:
            snapshot?.recent_attendance_incident_count ?? incidentStats.total30,
          policy_action_count: policyActionStatsByEmployee[employee.id] || 0,
          last_attendance_incident_at: snapshot?.last_attendance_incident_at || incidentStats.lastIncidentDate,
        };
      })
      .sort((a, b) => Number(!!b.is_active) - Number(!!a.is_active) || a.full_name.localeCompare(b.full_name));
  }, [incidentStatsByEmployee, laborEmployees, policyActionStatsByEmployee, snapshotMap]);

  const attendanceSummary = useMemo(() => {
    return summarizeAttendanceIncidents({
      laborEmployees,
      incidents: attendanceIncidents,
    });
  }, [attendanceIncidents, laborEmployees]);

  const activityFeed = useMemo(() => {
    return buildAttendanceActivityFeed({
      incidents: attendanceIncidents,
      policyActions: attendancePolicyActions,
      employeeMap,
    });
  }, [attendanceIncidents, attendancePolicyActions, employeeMap]);

  const filteredHistory = useMemo(() => {
    const query = String(historySearch || "").trim().toLowerCase();
    return activityFeed.filter((entry) => {
      if (historyEmployeeFilter && entry.laborEmployeeId !== historyEmployeeFilter) return false;
      if (historyKindFilter !== "all" && entry.kind !== historyKindFilter) return false;
      if (!query) return true;
      return (
        entry.employeeName.toLowerCase().includes(query) ||
        entry.typeLabel.toLowerCase().includes(query) ||
        String(entry.noteText || "").toLowerCase().includes(query)
      );
    });
  }, [activityFeed, historyEmployeeFilter, historyKindFilter, historySearch]);

  const importedLegacyEntryIds = useMemo(() => {
    return attendanceIncidents
      .map((incident) => incident?.metadata?.legacy_entry_id)
      .filter(Boolean)
      .map(String);
  }, [attendanceIncidents]);

  const legacyImportPlan = useMemo(() => {
    return planLegacyAttendanceImport({
      legacyRoster,
      legacyEntries,
      laborEmployees,
      importedLegacyEntryIds,
    });
  }, [importedLegacyEntryIds, laborEmployees, legacyEntries, legacyRoster]);

  const employeeIncidentOptions = useMemo(() => {
    return attendanceIncidents
      .filter((incident) => !policyEmployeeId || incident.labor_employee_id === policyEmployeeId)
      .map((incident) => ({
        value: incident.id,
        label: `${getAttendanceIncidentLabel(incident.incident_type)} • ${employeeMap[incident.labor_employee_id]?.full_name || "Employee"} • ${formatDateOnly(incident.incident_date)}`,
      }));
  }, [attendanceIncidents, employeeMap, policyEmployeeId]);

  const resetEmployeeModal = useCallback(() => {
    setEditingEmployeeId(null);
    setEmployeeName("");
    setEmployeeTitle("");
    setEmployeeStartDate(todayStr());
    setEmployeeEndDate("");
  }, []);

  const openEmployeeModal = useCallback((employee = null) => {
    if (!employee) {
      resetEmployeeModal();
      setShowEmployeeModal(true);
      return;
    }
    setEditingEmployeeId(employee.id);
    setEmployeeName(employee.full_name || "");
    setEmployeeTitle(employee.position_title || "");
    setEmployeeStartDate(employee.start_date || todayStr());
    setEmployeeEndDate(employee.end_date || "");
    setShowEmployeeModal(true);
  }, [resetEmployeeModal]);

  const resetIncidentModal = useCallback(() => {
    setEditingIncidentId(null);
    setIncidentEmployeeId("");
    setIncidentType("");
    setIncidentDate(todayStr());
    setIncidentCoverage("no");
    setIncidentDetail("");
  }, []);

  const openIncidentModal = useCallback((incident = null) => {
    if (!incident) {
      resetIncidentModal();
      setShowIncidentModal(true);
      return;
    }
    setEditingIncidentId(incident.id);
    setIncidentEmployeeId(incident.labor_employee_id || "");
    setIncidentType(incident.incident_type || "");
    setIncidentDate(incident.incident_date || todayStr());
    setIncidentCoverage(incident?.metadata?.coverage_secured ? "yes" : "no");
    setIncidentDetail(incident.detail || "");
    setShowIncidentModal(true);
  }, [resetIncidentModal]);

  const resetPolicyActionModal = useCallback(() => {
    setEditingPolicyActionId(null);
    setPolicyEmployeeId("");
    setPolicyIncidentId("");
    setPolicyActionType("");
    setPolicyActionDate(todayStr());
    setPolicyActionNote("");
  }, []);

  const openPolicyActionModal = useCallback((action = null) => {
    if (!action) {
      resetPolicyActionModal();
      setShowPolicyActionModal(true);
      return;
    }
    setEditingPolicyActionId(action.id);
    setPolicyEmployeeId(action.labor_employee_id || "");
    setPolicyIncidentId(action.incident_id || "");
    setPolicyActionType(action.action_type || "");
    setPolicyActionDate(action.action_date || todayStr());
    setPolicyActionNote(action.note_text || "");
    setShowPolicyActionModal(true);
  }, [resetPolicyActionModal]);

  const handleSaveEmployee = useCallback(async () => {
    if (!employeeName.trim() || !employeeTitle.trim() || !employeeStartDate) {
      addGlobalToast("Employee name, position title, and start date are required", "error");
      return;
    }
    setSavingEmployee(true);
    try {
      if (editingEmployeeId) {
        const { error } = await supabase.rpc("update_labor_employee", buildUpdateLaborEmployeeRpcArgs({
          employeeId: editingEmployeeId,
          fullName: employeeName,
          positionTitle: employeeTitle,
          startDate: employeeStartDate,
          endDate: employeeEndDate,
          actorUserId,
        }));
        if (error) throw error;
        addGlobalToast("Employee updated", "success");
      } else {
        const { error } = await supabase.rpc("create_labor_employee", buildCreateLaborEmployeeRpcArgs({
          locationRef: laborLocationRef,
          fullName: employeeName,
          positionTitle: employeeTitle,
          startDate: employeeStartDate,
          endDate: employeeEndDate,
          actorUserId,
          actorName,
        }));
        if (error) throw error;
        addGlobalToast("Employee added", "success");
      }
      setShowEmployeeModal(false);
      resetEmployeeModal();
      await loadData();
    } catch (error) {
      console.error("Attendance employee save error:", error);
      addGlobalToast(`Failed to save employee: ${error.message || "Unknown error"}`, "error");
    }
    setSavingEmployee(false);
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    editingEmployeeId,
    employeeEndDate,
    employeeName,
    employeeStartDate,
    employeeTitle,
    laborLocationRef,
    loadData,
    resetEmployeeModal,
  ]);

  const handleSaveIncident = useCallback(async () => {
    if (!incidentEmployeeId || !incidentType || !incidentDate) {
      addGlobalToast("Employee, incident type, and shift date are required", "error");
      return;
    }
    setSavingIncident(true);
    try {
      if (editingIncidentId) {
        const existing = attendanceIncidents.find((incident) => incident.id === editingIncidentId);
        const { error } = await supabase
          .from("attendance_incidents")
          .update({
            labor_employee_id: incidentEmployeeId,
            incident_type: incidentType,
            incident_date: incidentDate,
            detail: incidentDetail.trim() || null,
            metadata: {
              ...(existing?.metadata || {}),
              coverage_secured: incidentCoverage === "yes",
              last_edited_at: new Date().toISOString(),
              last_edited_by_name: actorName,
            },
          })
          .eq("id", editingIncidentId);
        if (error) throw error;
        addGlobalToast("Attendance incident updated", "success");
      } else {
        const { error } = await supabase.from("attendance_incidents").insert({
          labor_employee_id: incidentEmployeeId,
          incident_type: incidentType,
          incident_date: incidentDate,
          detail: incidentDetail.trim() || null,
          metadata: {
            coverage_secured: incidentCoverage === "yes",
            created_via: "attendance_page",
          },
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        });
        if (error) throw error;
        addGlobalToast("Attendance incident logged", "success");
      }
      setShowIncidentModal(false);
      resetIncidentModal();
      await loadData();
    } catch (error) {
      console.error("Attendance incident save error:", error);
      addGlobalToast(`Failed to save incident: ${error.message || "Unknown error"}`, "error");
    }
    setSavingIncident(false);
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    attendanceIncidents,
    editingIncidentId,
    incidentCoverage,
    incidentDate,
    incidentDetail,
    incidentEmployeeId,
    incidentType,
    loadData,
    resetIncidentModal,
  ]);

  const handleSavePolicyAction = useCallback(async () => {
    if (!policyEmployeeId || !policyActionType || !policyActionDate) {
      addGlobalToast("Employee, action type, and action date are required", "error");
      return;
    }
    setSavingPolicyAction(true);
    try {
      if (editingPolicyActionId) {
        const existing = attendancePolicyActions.find((action) => action.id === editingPolicyActionId);
        const { error } = await supabase
          .from("attendance_policy_actions")
          .update({
            labor_employee_id: policyEmployeeId,
            incident_id: policyIncidentId || null,
            action_type: policyActionType,
            action_date: policyActionDate,
            note_text: policyActionNote.trim() || null,
            metadata: {
              ...(existing?.metadata || {}),
              last_edited_at: new Date().toISOString(),
              last_edited_by_name: actorName,
            },
          })
          .eq("id", editingPolicyActionId);
        if (error) throw error;
        addGlobalToast("Policy action updated", "success");
      } else {
        const { error } = await supabase.from("attendance_policy_actions").insert({
          labor_employee_id: policyEmployeeId,
          incident_id: policyIncidentId || null,
          action_type: policyActionType,
          action_date: policyActionDate,
          note_text: policyActionNote.trim() || null,
          metadata: {
            created_via: "attendance_page",
          },
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        });
        if (error) throw error;
        addGlobalToast("Policy action logged", "success");
      }
      setShowPolicyActionModal(false);
      resetPolicyActionModal();
      await loadData();
    } catch (error) {
      console.error("Attendance policy action save error:", error);
      addGlobalToast(`Failed to save policy action: ${error.message || "Unknown error"}`, "error");
    }
    setSavingPolicyAction(false);
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    attendancePolicyActions,
    editingPolicyActionId,
    loadData,
    policyActionDate,
    policyActionNote,
    policyActionType,
    policyEmployeeId,
    policyIncidentId,
    resetPolicyActionModal,
  ]);

  const handleImportLegacyAttendance = useCallback(async () => {
    if (!legacyImportPlan.employeeCreates.length && !legacyImportPlan.incidentCreates.length) {
      addGlobalToast("No legacy attendance data is waiting to be imported", "error");
      return;
    }
    setImportingLegacy(true);
    try {
      const tempKeyToEmployeeId = {};

      for (const employeePlan of legacyImportPlan.employeeCreates) {
        const { data: created, error } = await supabase.rpc("create_labor_employee", buildCreateLaborEmployeeRpcArgs({
          locationRef: laborLocationRef,
          fullName: employeePlan.fullName,
          positionTitle: employeePlan.positionTitle,
          startDate: employeePlan.startDate,
          endDate: employeePlan.endDate,
          actorUserId,
          actorName,
        }));
        if (error) throw error;
        const createdEmployee = Array.isArray(created) ? created[0] : created;
        if (createdEmployee?.id) {
          tempKeyToEmployeeId[employeePlan.tempKey] = createdEmployee.id;
        }
      }

      const incidentRows = [];
      const unresolvedIncidentIds = [];

      legacyImportPlan.incidentCreates.forEach((incident) => {
        const laborEmployeeId = incident.laborEmployeeId || tempKeyToEmployeeId[incident.laborEmployeeTempKey];
        if (!laborEmployeeId) {
          unresolvedIncidentIds.push(incident.legacyId);
          return;
        }
        incidentRows.push({
          labor_employee_id: laborEmployeeId,
          incident_date: incident.incidentDate,
          incident_type: incident.incidentType,
          detail: incident.detail,
          metadata: {
            ...incident.metadata,
            coverage_secured: incident.coverageSecured,
            imported_via: "attendance_page",
          },
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        });
      });

      if (incidentRows.length > 0) {
        const { error } = await supabase.from("attendance_incidents").insert(incidentRows);
        if (error) throw error;
      }

      const remainingLegacyEntryIds = new Set(
        [...legacyImportPlan.unmatchedEntries.map((entry) => String(entry.id)), ...unresolvedIncidentIds.map(String)],
      );
      if (typeof save === "function") {
        save({
          ...data,
          attendanceRoster: [],
          attendanceEntries: legacyEntries.filter((entry) => remainingLegacyEntryIds.has(String(entry.id))),
          attendanceAuditLog: data?.attendanceAuditLog || [],
        });
      }

      await loadData();
      addGlobalToast(
        `Imported ${legacyImportPlan.employeeCreates.length} employees and ${incidentRows.length} attendance incidents`,
        "success",
      );
      if (legacyImportPlan.unmatchedEntries.length || unresolvedIncidentIds.length) {
        addGlobalToast(
          `${legacyImportPlan.unmatchedEntries.length + unresolvedIncidentIds.length} legacy attendance rows still need manual reconciliation`,
          "error",
        );
      }
    } catch (error) {
      console.error("Legacy attendance import error:", error);
      addGlobalToast(`Failed to import legacy attendance: ${error.message || "Unknown error"}`, "error");
    }
    setImportingLegacy(false);
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    data,
    laborLocationRef,
    legacyEntries,
    legacyImportPlan,
    loadData,
    save,
  ]);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <Card style={{ padding: 28, textAlign: "center", color: C.textMut }}>Loading attendance…</Card>
      </div>
    );
  }

  if (!laborLocationRef) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          title="Attendance is unavailable for this location"
          subtitle="The labor module could not resolve the current location to a canonical labor location ID."
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <button
          onClick={() => nav("training")}
          style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, display: "flex", padding: 4 }}
        >
          <I.Back />
        </button>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Attendance</div>
          <div style={{ fontSize: 13, color: C.textMut }}>
            Canonical labor attendance for {(data?.locationName) || "this location"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {[
          { id: "roster", label: "Roster" },
          { id: "log", label: "Incident Log" },
          { id: "summary", label: "Summary" },
          { id: "policy", label: "Policy Actions" },
          { id: "history", label: "History" },
        ].map((tabOption) => (
          <button
            key={tabOption.id}
            onClick={() => setTab(tabOption.id)}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: `1.5px solid ${tab === tabOption.id ? C.pri : C.border}`,
              background: tab === tabOption.id ? C.priLt : C.surface,
              color: tab === tabOption.id ? C.pri : C.textSec,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tabOption.label}
          </button>
        ))}
      </div>

      {tab === "roster" && (
        <>
          {(legacyRoster.length > 0 || legacyEntries.length > 0) && (
            <Card style={{ marginBottom: 18, padding: 18, border: `1px solid ${C.accLt}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Legacy Attendance Import</div>
                  <div style={{ fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
                    {legacyRoster.length} legacy roster rows and {legacyEntries.length} legacy attendance entries are still in the old local tracker.
                    This import moves them into the canonical labor structure.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <Badge color="info">{legacyImportPlan.employeeCreates.length} employees to create</Badge>
                    <Badge color="warning">{legacyImportPlan.incidentCreates.length} incidents to import</Badge>
                    <Badge color={legacyImportPlan.unmatchedEntries.length ? "danger" : "success"}>
                      {legacyImportPlan.unmatchedEntries.length} unresolved rows
                    </Badge>
                  </div>
                </div>
                <Btn
                  variant="accent"
                  onClick={handleImportLegacyAttendance}
                  disabled={!canManage || importingLegacy}
                >
                  {importingLegacy ? "Importing..." : "Import Legacy Attendance"}
                </Btn>
              </div>
            </Card>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{activeEmployees.length}</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Active employees</div>
            </Card>
            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{inactiveEmployees.length}</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Inactive employees</div>
            </Card>
            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{attendanceSummary.totals.total30}</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Incidents in last 30 days</div>
            </Card>
            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{attendancePolicyActions.length}</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Policy actions logged</div>
            </Card>
          </div>

          <Card style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Labor Roster</div>
                <div style={{ fontSize: 12, color: C.textMut }}>Attendance now reads the canonical labor employee roster.</div>
              </div>
              <Btn variant="primary" onClick={() => openEmployeeModal()} disabled={!canManage}>Add Employee</Btn>
            </div>

            {rosterRows.length === 0 ? (
              <EmptyState title="No labor employees yet" subtitle="Create an employee here or from Labor Home to start tracking attendance." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      {["Employee", "Status", "Position", "Start", "End", "30 Days", "Policy Actions", "Last Incident", "Actions"].map((label) => (
                        <th key={label} style={{ padding: "10px 8px", textAlign: "left", color: C.textMut, fontSize: 11, textTransform: "uppercase" }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((row) => (
                      <tr key={row.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <td style={{ padding: "12px 8px" }}>
                          <div style={{ fontWeight: 700, color: C.text }}>{row.full_name}</div>
                          <div style={{ fontSize: 11, color: C.textMut }}>{row.id}</div>
                        </td>
                        <td style={{ padding: "12px 8px" }}><StatusPill active={row.is_active} /></td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>{row.position_title || "—"}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>{formatDateOnly(row.start_date)}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>{formatDateOnly(row.end_date)}</td>
                        <td style={{ padding: "12px 8px", fontWeight: 700, color: C.text }}>{row.recent_attendance_incident_count || 0}</td>
                        <td style={{ padding: "12px 8px", fontWeight: 700, color: C.text }}>{row.policy_action_count || 0}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>
                          {row.last_attendance_incident_at ? formatDateOnly(row.last_attendance_incident_at) : "—"}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Btn variant="ghost" size="sm" onClick={() => openEmployeeModal(row)} disabled={!canManage}>Edit</Btn>
                            <Btn
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                resetIncidentModal();
                                setIncidentEmployeeId(row.id);
                                setShowIncidentModal(true);
                              }}
                              disabled={!canManage}
                            >
                              Log Incident
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "log" && (
        <Card style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Attendance Incidents</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Logged against canonical labor employee records.</div>
            </div>
            <Btn variant="primary" onClick={() => openIncidentModal()} disabled={!canManage}>Log Incident</Btn>
          </div>

          {attendanceIncidents.length === 0 ? (
            <EmptyState title="No attendance incidents yet" subtitle="Log the first incident to start the attendance record." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    {["Employee", "Type", "Shift Date", "Coverage", "Notes", "Logged By", "Actions"].map((label) => (
                      <th key={label} style={{ padding: "10px 8px", textAlign: "left", color: C.textMut, fontSize: 11, textTransform: "uppercase" }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendanceIncidents.map((incident) => (
                    <tr key={incident.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: "12px 8px", fontWeight: 700, color: C.text }}>
                        {employeeMap[incident.labor_employee_id]?.full_name || "Unknown Employee"}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <TypePill
                          label={getAttendanceIncidentLabel(incident.incident_type)}
                          color={INCIDENT_COLOR_BY_VALUE[incident.incident_type] || C.textMut}
                        />
                      </td>
                      <td style={{ padding: "12px 8px", color: C.textSec }}>{formatDateOnly(incident.incident_date)}</td>
                      <td style={{ padding: "12px 8px", color: C.textSec }}>
                        {incident?.metadata?.coverage_secured ? "Yes" : "No"}
                      </td>
                      <td style={{ padding: "12px 8px", color: C.textSec, minWidth: 220 }}>
                        {incident.detail || "—"}
                      </td>
                      <td style={{ padding: "12px 8px", color: C.textSec }}>
                        <div>{incident.created_by_name || "Staff"}</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>{formatTimestamp(incident.created_at)}</div>
                        {incident?.metadata?.last_edited_by_name && (
                          <div style={{ fontSize: 11, color: C.textMut }}>
                            edited by {incident.metadata.last_edited_by_name}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <Btn variant="ghost" size="sm" onClick={() => openIncidentModal(incident)} disabled={!canManage}>Edit</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "summary" && (
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>Attendance Summary</div>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 16 }}>
            Active employees only. Counts are calculated from canonical attendance incidents.
          </div>

          {attendanceSummary.rows.length === 0 ? (
            <EmptyState title="No active employees to summarize" subtitle="Add employees to the labor roster to start building attendance reporting." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ padding: "8px 10px", background: "#1B3A5C", color: "#fff", textAlign: "left" }}>Employee</th>
                    {ATTENDANCE_INCIDENT_OPTIONS.map((option) => (
                      <th key={option.value} colSpan={2} style={{ padding: "6px 8px", background: option.color, color: "#fff", textAlign: "center" }}>
                        {option.label}
                      </th>
                    ))}
                    <th colSpan={2} style={{ padding: "6px 8px", background: "#1B3A5C", color: "#fff", textAlign: "center" }}>Total</th>
                  </tr>
                  <tr>
                    {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                      <th key={`${option.value}-30`} style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", textAlign: "center" }}>30 Days</th>,
                      <th key={`${option.value}-all`} style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", textAlign: "center" }}>All Time</th>,
                    ]))}
                    <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", textAlign: "center" }}>30 Days</th>
                    <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", textAlign: "center" }}>All Time</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.rows.map((row, index) => (
                    <tr key={row.id} style={{ background: index % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700, borderRight: `1px solid ${C.borderLight}` }}>{row.full_name}</td>
                      {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                        <td key={`${row.id}-${option.value}-30`} style={{ padding: "6px 8px", textAlign: "center", color: C.text }}>{row.byType[option.value].last30 || "—"}</td>,
                        <td key={`${row.id}-${option.value}-all`} style={{ padding: "6px 8px", textAlign: "center", borderRight: `1px solid ${C.borderLight}`, color: C.text }}>{row.byType[option.value].allTime || "—"}</td>,
                      ]))}
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800 }}>{row.total30 || "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800 }}>{row.totalAll || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#1B3A5C", color: "#fff" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 800 }}>Total</td>
                    {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                      <td key={`totals-${option.value}-30`} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800 }}>{attendanceSummary.totals.byType[option.value].last30 || "—"}</td>,
                      <td key={`totals-${option.value}-all`} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800 }}>{attendanceSummary.totals.byType[option.value].allTime || "—"}</td>,
                    ]))}
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800 }}>{attendanceSummary.totals.total30 || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800 }}>{attendanceSummary.totals.totalAll || "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "policy" && (
        <>
          {POLICY_REFERENCE_SECTIONS.map((section) => (
            <Card key={section.title} style={{ marginBottom: 18, padding: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>{section.title}</div>
              {section.subtitle && <div style={{ fontSize: 12, color: C.textMut, marginBottom: 12 }}>{section.subtitle}</div>}
              <div style={{ display: "grid", gap: 10 }}>
                {section.items.map((item) => (
                  <div key={item.label} style={{ padding: 12, borderRadius: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>{item.body}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <Card style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Policy Actions</div>
                <div style={{ fontSize: 12, color: C.textMut }}>Formal attendance counseling and escalation tied to labor employees.</div>
              </div>
              <Btn variant="primary" onClick={() => openPolicyActionModal()} disabled={!canManage}>Log Policy Action</Btn>
            </div>

            {attendancePolicyActions.length === 0 ? (
              <EmptyState title="No policy actions yet" subtitle="When attendance counseling happens, log it here so it stays in the employee’s labor history." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      {["Employee", "Action", "Date", "Linked Incident", "Notes", "Logged By", "Actions"].map((label) => (
                        <th key={label} style={{ padding: "10px 8px", textAlign: "left", color: C.textMut, fontSize: 11, textTransform: "uppercase" }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendancePolicyActions.map((action) => (
                      <tr key={action.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <td style={{ padding: "12px 8px", fontWeight: 700 }}>{employeeMap[action.labor_employee_id]?.full_name || "Unknown Employee"}</td>
                        <td style={{ padding: "12px 8px" }}>
                          <Badge color="warning">{getAttendanceActionLabel(action.action_type)}</Badge>
                        </td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>{formatDateOnly(action.action_date)}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>
                          {action.incident_id ? "Linked" : "—"}
                        </td>
                        <td style={{ padding: "12px 8px", color: C.textSec, minWidth: 220 }}>{action.note_text || "—"}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>
                          <div>{action.created_by_name || "Staff"}</div>
                          <div style={{ fontSize: 11, color: C.textMut }}>{formatTimestamp(action.created_at)}</div>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <Btn variant="ghost" size="sm" onClick={() => openPolicyActionModal(action)} disabled={!canManage}>Edit</Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "history" && (
        <Card style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Attendance History</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Combined feed of incidents and policy actions.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ minWidth: 240 }}>
                <CustomSelect
                  value={historyEmployeeFilter}
                  onChange={setHistoryEmployeeFilter}
                  options={employeeSelectOptions}
                  placeholder="Filter employee"
                  small
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <CustomSelect
                  value={historyKindFilter}
                  onChange={setHistoryKindFilter}
                  options={[
                    { value: "all", label: "All activity" },
                    { value: "incident", label: "Incidents" },
                    { value: "policy_action", label: "Policy actions" },
                  ]}
                  placeholder="Filter type"
                  small
                />
              </div>
              <div style={{ minWidth: 220 }}>
                <Inp value={historySearch} onChange={setHistorySearch} placeholder="Search history" />
              </div>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <EmptyState title="No history matches the current filters" subtitle="Try clearing the filters or log the first attendance activity." />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredHistory.map((entry) => (
                <div key={entry.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${C.borderLight}`, background: C.surface }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        {entry.kind === "incident" ? (
                          <TypePill label={entry.typeLabel} color={INCIDENT_COLOR_BY_VALUE[ATTENDANCE_INCIDENT_OPTIONS.find((option) => option.label === entry.typeLabel)?.value] || C.info} />
                        ) : (
                          <Badge color="warning">{entry.typeLabel}</Badge>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{entry.employeeName}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
                        {entry.noteText || "No additional notes"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, color: C.textMut }}>
                      <div>{formatDateOnly(entry.effectiveDate)}</div>
                      <div>{formatTimestamp(entry.createdAt)}</div>
                      <div>by {entry.createdByName || "Staff"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showEmployeeModal && (
        <Modal title={editingEmployeeId ? "Edit Employee" : "Add Employee"} onClose={() => { setShowEmployeeModal(false); resetEmployeeModal(); }}>
          <div style={{ display: "grid", gap: 14 }}>
            <Inp label="Employee Full Name" value={employeeName} onChange={setEmployeeName} required />
            <Inp label="Position Title" value={employeeTitle} onChange={setEmployeeTitle} required />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Start Date</div>
                <MiniDatePicker value={employeeStartDate} onChange={(value) => setEmployeeStartDate(value || todayStr())} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>End Date</div>
                <MiniDatePicker value={employeeEndDate} onChange={setEmployeeEndDate} placeholder="Optional" />
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textMut }}>
              End date is optional. If it is blank, the employee is treated as active.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="secondary" onClick={() => { setShowEmployeeModal(false); resetEmployeeModal(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSaveEmployee} disabled={!canManage || savingEmployee}>
                {savingEmployee ? "Saving..." : editingEmployeeId ? "Save Employee" : "Create Employee"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showIncidentModal && (
        <Modal title={editingIncidentId ? "Edit Attendance Incident" : "Log Attendance Incident"} onClose={() => { setShowIncidentModal(false); resetIncidentModal(); }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Employee</div>
              <CustomSelect
                value={incidentEmployeeId}
                onChange={setIncidentEmployeeId}
                options={employeeSelectOptions.filter((option) => !employeeMap[option.value]?.end_date)}
                placeholder="Select employee"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Incident Type</div>
              <CustomSelect
                value={incidentType}
                onChange={setIncidentType}
                options={ATTENDANCE_INCIDENT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                placeholder="Select incident type"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Shift Date</div>
              <MiniDatePicker value={incidentDate} onChange={(value) => setIncidentDate(value || todayStr())} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 8 }}>Coverage Secured</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant={incidentCoverage === "yes" ? "success" : "secondary"} onClick={() => setIncidentCoverage("yes")}>Yes</Btn>
                <Btn variant={incidentCoverage === "no" ? "danger" : "secondary"} onClick={() => setIncidentCoverage("no")}>No</Btn>
              </div>
            </div>
            <Inp label="Notes" type="textarea" value={incidentDetail} onChange={setIncidentDetail} placeholder="Optional context for the incident" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="secondary" onClick={() => { setShowIncidentModal(false); resetIncidentModal(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSaveIncident} disabled={!canManage || savingIncident}>
                {savingIncident ? "Saving..." : editingIncidentId ? "Save Incident" : "Log Incident"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showPolicyActionModal && (
        <Modal title={editingPolicyActionId ? "Edit Policy Action" : "Log Policy Action"} onClose={() => { setShowPolicyActionModal(false); resetPolicyActionModal(); }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Employee</div>
              <CustomSelect
                value={policyEmployeeId}
                onChange={(value) => {
                  setPolicyEmployeeId(value);
                  if (policyIncidentId && !attendanceIncidents.some((incident) => incident.id === policyIncidentId && incident.labor_employee_id === value)) {
                    setPolicyIncidentId("");
                  }
                }}
                options={employeeSelectOptions}
                placeholder="Select employee"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Linked Incident</div>
              <CustomSelect
                value={policyIncidentId}
                onChange={setPolicyIncidentId}
                options={employeeIncidentOptions}
                placeholder="Optional linked incident"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Policy Action</div>
              <CustomSelect
                value={policyActionType}
                onChange={setPolicyActionType}
                options={ATTENDANCE_POLICY_ACTION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                placeholder="Select policy action"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Action Date</div>
              <MiniDatePicker value={policyActionDate} onChange={(value) => setPolicyActionDate(value || todayStr())} />
            </div>
            <Inp label="Notes" type="textarea" value={policyActionNote} onChange={setPolicyActionNote} placeholder="Describe the counseling or outcome" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="secondary" onClick={() => { setShowPolicyActionModal(false); resetPolicyActionModal(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSavePolicyAction} disabled={!canManage || savingPolicyAction}>
                {savingPolicyAction ? "Saving..." : editingPolicyActionId ? "Save Action" : "Log Action"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

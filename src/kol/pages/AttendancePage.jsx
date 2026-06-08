import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, LC_OP_LABELS, todayStr } from "../../shared/theme";
import { Badge, Btn, Card, CustomSelect, Inp, MiniDatePicker, Modal, LaborSearchBar, LaborIntro } from "../../shared/ui";
import { nextSort, compareValues } from "../../shared/listSurface";
import { LABOR_INTRO_DEFAULTS } from "../laborIntros";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import {
  ATTENDANCE_INCIDENT_OPTIONS,
  buildAttendanceActivityFeed,
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

import {
  ATTENDANCE_DEFAULT_SORT,
  ATTENDANCE_MARK_FILTER_FIELDS,
  ATTENDANCE_ROSTER_SORT_COLUMNS,
  ATTENDANCE_SUMMARY_DEFAULT_SORT,
  ATTENDANCE_SUMMARY_GROUP_DIVIDER,
  DEFAULT_ATTENDANCE_POSITION_ORDER,
  INCIDENT_COLOR_BY_VALUE,
} from "./attendance/constants";

import {
  attendanceMarkNeedsValue,
  compareAttendanceSortValues,
  formatAttendancePositionTitle,
  formatDateOnly,
  formatTimestamp,
  normalizeAttendancePositionTitle,
  parseAttendanceDateOnly,
} from "./attendance/format";

function AttendanceSortControl({ sort, onChange }) {
  const [open, setOpen] = useState(false);
  const activeColumn = ATTENDANCE_ROSTER_SORT_COLUMNS.find((column) => column.key === sort.key) || ATTENDANCE_ROSTER_SORT_COLUMNS[0];
  const isDefault = sort.key === ATTENDANCE_DEFAULT_SORT.key && sort.direction === ATTENDANCE_DEFAULT_SORT.direction;
  const label = isDefault ? `Sort: ${activeColumn.label}` : `Sort: ${activeColumn.label} ${sort.direction === "desc" ? "Descending" : "Ascending"}`;
  return (
    <div className="attendance-sort-control">
      <button type="button" className={`attendance-sort-trigger${open ? " is-open" : ""}${!isDefault ? " is-active" : ""}`} onClick={() => setOpen((prev) => !prev)}>
        <I.SortNone />
        <span>{label}</span>
        <I.ChevronDown />
      </button>
      {open && (
        <div className="attendance-sort-panel">
          <button
            type="button"
            className={`attendance-sort-reset${isDefault ? " is-active" : ""}`}
            onClick={() => {
              onChange(ATTENDANCE_DEFAULT_SORT);
              setOpen(false);
            }}
          >
            Reset to position order
          </button>
          <div className="attendance-sort-options">
            {ATTENDANCE_ROSTER_SORT_COLUMNS.map((column, index) => (
              <div key={column.key} className="attendance-sort-row" style={{ animationDelay: `${index * 28}ms` }}>
                <span>{column.label}</span>
                <div>
                  {["asc", "desc"].map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      className={sort.key === column.key && sort.direction === direction ? "is-active" : ""}
                      onClick={() => {
                        onChange({ key: column.key, direction });
                        setOpen(false);
                      }}
                    >
                      {direction === "desc" ? "Descending" : "Ascending"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

export default function AttendanceTrackerPage({ data, save, nav, profile, addGlobalToast = () => {}, params = {}, embedded = false, tabPreset = "full", canLogAttendance = null, laborPositionOrder = [], searchSlot = null, introValue = "", canEditIntro = false, onSaveIntro = null }) {
  const [tab, setTab] = useState("roster");
  const [loading, setLoading] = useState(true);
  const [resolvedLocationId, setResolvedLocationId] = useState("");
  const [laborEmployees, setLaborEmployees] = useState([]);
  const [rosterSnapshot, setRosterSnapshot] = useState([]);
  const [attendanceIncidents, setAttendanceIncidents] = useState([]);

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
  const [deletingIncidentId, setDeletingIncidentId] = useState(null);
  const [markFilters, setMarkFilters] = useState({});
  const [markDraftFilters, setMarkDraftFilters] = useState({});
  const [showMarkFilterPanel, setShowMarkFilterPanel] = useState(false);
  const [showMarkFilterPicker, setShowMarkFilterPicker] = useState(false);
  const [markFilterPickerReady, setMarkFilterPickerReady] = useState(false);
  const [configuringMarkFilterKey, setConfiguringMarkFilterKey] = useState(null);
  const [markSearch, setMarkSearch] = useState("");
  const [markTypePills, setMarkTypePills] = useState(() => new Set());
  const [rosterSort, setRosterSort] = useState(ATTENDANCE_DEFAULT_SORT);
  const [summarySort, setSummarySort] = useState(ATTENDANCE_SUMMARY_DEFAULT_SORT);
  const [summarySearch, setSummarySearch] = useState("");

  const [historyEmployeeFilter, setHistoryEmployeeFilter] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [importingLegacy, setImportingLegacy] = useState(false);
  const prevMarkFilterOpen = useRef(false);

  const locationRef = profile?.location_id || data?.locationId || "";
  const laborLocationRef = resolvedLocationId || locationRef || "";
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const canManage = canLogAttendance ?? (hasLeanPermission(profile, "Labor Log Attendance") || hasLeanPermission(profile, "Attendance Tracker"));
  const legacyRoster = data?.attendanceRoster || [];
  const legacyEntries = data?.attendanceEntries || [];
  const positionOrderIndex = useMemo(() => {
    const source = laborPositionOrder.length > 0 ? laborPositionOrder : DEFAULT_ATTENDANCE_POSITION_ORDER;
    return Object.fromEntries(source.map((title, index) => [normalizeAttendancePositionTitle(title), index]));
  }, [laborPositionOrder]);
  const attendancePositionOptions = useMemo(() => {
    const source = laborPositionOrder.length > 0 ? laborPositionOrder : DEFAULT_ATTENDANCE_POSITION_ORDER;
    const seen = new Set();
    const options = source
      .map((title) => {
        const label = formatAttendancePositionTitle(title);
        const normalized = normalizeAttendancePositionTitle(label);
        if (!label || seen.has(normalized)) return null;
        seen.add(normalized);
        return { value: label, label };
      })
      .filter(Boolean);
    const currentLabel = formatAttendancePositionTitle(employeeTitle);
    const currentNormalized = normalizeAttendancePositionTitle(currentLabel);
    if (currentLabel && !seen.has(currentNormalized)) options.unshift({ value: currentLabel, label: `${currentLabel} (current)` });
    return options;
  }, [employeeTitle, laborPositionOrder]);

  useEffect(() => {
    const employeeId = normalizeOptionalUuid(params?.employeeId);
    const requestedTab = String(params?.tab || "").trim();
    if (employeeId) {
      setHistoryEmployeeFilter(employeeId);
      setIncidentEmployeeId((current) => current || employeeId);
    }
    if (["roster", "incidents", "log", "summary", "history"].includes(requestedTab)) {
      setTab(requestedTab === "incidents" ? "log" : requestedTab);
    } else if (requestedTab === "input") {
      setTab("log");
    } else if (requestedTab === "attendance-summary") {
      setTab("summary");
    } else if (requestedTab === "attendance-input") {
      setTab("log");
    } else if (requestedTab === "summary") {
      setTab(requestedTab);
    } else if (employeeId) {
      setTab("history");
    }
  }, [params?.employeeId, params?.tab]);

  const tabOptions = useMemo(() => {
    // Embedded Labor-module view: one flat tab bar (no Input/Summary switcher).
    if (tabPreset === "labor") {
      return [
        { id: "summary", label: "Summary" },
        { id: "log", label: "Marks" },
        { id: "history", label: "History" },
      ];
    }
    return [
      { id: "roster", label: "Roster" },
      { id: "log", label: "Marks" },
      { id: "summary", label: "Summary" },
      { id: "history", label: "History" },
    ];
  }, [tabPreset]);

  useEffect(() => {
    if (!tabOptions.some((option) => option.id === tab)) {
      setTab(tabOptions[0]?.id || "roster");
    }
  }, [tab, tabOptions]);

  useEffect(() => {
    if (showMarkFilterPanel && !prevMarkFilterOpen.current) {
      setMarkDraftFilters({ ...markFilters });
      setShowMarkFilterPicker(false);
      setConfiguringMarkFilterKey(null);
    }
    prevMarkFilterOpen.current = showMarkFilterPanel;
  }, [markFilters, showMarkFilterPanel]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const locationId = await resolveTrainingLocationId(supabase, locationRef, actorUserId);
      if (!locationId) {
        setResolvedLocationId("");
        setLaborEmployees([]);
        setRosterSnapshot([]);
        setAttendanceIncidents([]);
        if (!silent) setLoading(false);
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

      const incidentRes = employeeIds.length > 0
        ? await supabase
            .from("attendance_incidents")
            .select("*")
            .in("labor_employee_id", employeeIds)
            .order("incident_date", { ascending: false })
            .order("created_at", { ascending: false })
        : { data: [], error: null };

      if (incidentRes.error) throw incidentRes.error;

      setLaborEmployees(employeeRows);
      setRosterSnapshot(rosterRows);
      setAttendanceIncidents(incidentRes.data || []);
    } catch (error) {
      console.error("Attendance load error:", error);
      addGlobalToast(`Failed to load attendance: ${error.message || "Unknown error"}`, "error");
    }
    if (!silent) setLoading(false);
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
          label: `${employee.full_name} (${formatAttendancePositionTitle(employee.position_title) || "Employee"})`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [laborEmployees],
  );

  const activeEmployeeSelectOptions = useMemo(
    () => employeeSelectOptions.filter((option) => !employeeMap[option.value]?.end_date),
    [employeeMap, employeeSelectOptions],
  );

  const markComposerEmployeeOptions = useMemo(() => {
    if (!incidentEmployeeId || !employeeMap[incidentEmployeeId]?.end_date) return activeEmployeeSelectOptions;
    if (activeEmployeeSelectOptions.some((option) => option.value === incidentEmployeeId)) return activeEmployeeSelectOptions;
    const inactiveEmployee = employeeMap[incidentEmployeeId];
    return [
      {
        value: inactiveEmployee.id,
        label: `${inactiveEmployee.full_name} (${formatAttendancePositionTitle(inactiveEmployee.position_title) || "Employee"})`,
      },
      ...activeEmployeeSelectOptions,
    ];
  }, [activeEmployeeSelectOptions, employeeMap, incidentEmployeeId]);

  const markFilterSections = useMemo(
    () => [...new Set(ATTENDANCE_MARK_FILTER_FIELDS.map((field) => field.section))],
    [],
  );

  const markFilterFieldByKey = useMemo(
    () => Object.fromEntries(ATTENDANCE_MARK_FILTER_FIELDS.map((field) => [field.key, field])),
    [],
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

  const activeEmployees = useMemo(
    () => laborEmployees.filter((employee) => !employee.end_date),
    [laborEmployees],
  );

  const inactiveEmployees = useMemo(
    () => laborEmployees.filter((employee) => !!employee.end_date),
    [laborEmployees],
  );

  const rosterRows = useMemo(() => {
    const direction = rosterSort.direction === "desc" ? -1 : 1;
    const getSortValue = (row, key) => {
      switch (key) {
        case "hierarchy":
          return positionOrderIndex[normalizeAttendancePositionTitle(row.position_title)] ?? Number.MAX_SAFE_INTEGER;
        case "employee":
          return row.full_name || "";
        case "status":
          return row.is_active ? "active" : "inactive";
        case "position":
          return formatAttendancePositionTitle(row.position_title);
        case "start":
          return row.start_date || "";
        case "end":
          return row.end_date || "";
        case "marks30":
          return Number(row.recent_attendance_incident_count || 0);
        case "last":
          return row.last_attendance_incident_at || "";
        default:
          return row.full_name || "";
      }
    };
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
          last_attendance_incident_at: snapshot?.last_attendance_incident_at || incidentStats.lastIncidentDate,
        };
      })
      .sort((a, b) => {
        const activeDelta = Number(!!b.is_active) - Number(!!a.is_active);
        if (activeDelta !== 0) return activeDelta;
        if (rosterSort.key === "hierarchy") {
          const hierarchyDelta = getSortValue(a, "hierarchy") - getSortValue(b, "hierarchy");
          if (hierarchyDelta !== 0) return hierarchyDelta * direction;
          return compareAttendanceSortValues(a.full_name, b.full_name);
        }
        return compareAttendanceSortValues(getSortValue(a, rosterSort.key), getSortValue(b, rosterSort.key)) * direction;
      });
  }, [incidentStatsByEmployee, laborEmployees, positionOrderIndex, rosterSort, snapshotMap]);

  const attendanceSummary = useMemo(() => {
    return summarizeAttendanceIncidents({
      laborEmployees,
      incidents: attendanceIncidents,
    });
  }, [attendanceIncidents, laborEmployees]);

  // Attendance Summary grid: filter by the employee search, then sort by the
  // active metric. The grouped header (type → 30-day / all-time sub-columns) is a
  // hand-built table below; here we just order the employee rows. The totals row
  // is rendered in the table footer so it stays pinned and never sorts.
  const summarySortValueOf = useCallback((row, key) => {
    if (key === "employee") return String(row.full_name || "").toLowerCase();
    if (key === "total30") return row.total30;
    if (key === "totalAll") return row.totalAll;
    const match = /^(.+)_(30|all)$/.exec(key);
    if (match) {
      const stat = row.byType[match[1]];
      return match[2] === "30" ? stat?.last30 : stat?.allTime;
    }
    return 0;
  }, []);

  const sortedSummaryRows = useMemo(() => {
    const query = summarySearch.trim().toLowerCase();
    const base = query
      ? attendanceSummary.rows.filter((row) => String(row.full_name || "").toLowerCase().includes(query))
      : attendanceSummary.rows;
    if (!summarySort || !summarySort.direction) return base;
    const direction = summarySort.direction === "desc" ? -1 : 1;
    return [...base].sort((a, b) => {
      const primary = compareValues(summarySortValueOf(a, summarySort.key), summarySortValueOf(b, summarySort.key)) * direction;
      if (primary !== 0) return primary;
      return compareValues(String(a.full_name || "").toLowerCase(), String(b.full_name || "").toLowerCase());
    });
  }, [attendanceSummary.rows, summarySearch, summarySort, summarySortValueOf]);

  const activityFeed = useMemo(() => {
    return buildAttendanceActivityFeed({
      incidents: attendanceIncidents,
      employeeMap,
    });
  }, [attendanceIncidents, employeeMap]);

  const filteredHistory = useMemo(() => {
    const query = String(historySearch || "").trim().toLowerCase();
    return activityFeed.filter((entry) => {
      if (historyEmployeeFilter && entry.laborEmployeeId !== historyEmployeeFilter) return false;
      if (!query) return true;
      return (
        entry.employeeName.toLowerCase().includes(query) ||
        entry.typeLabel.toLowerCase().includes(query) ||
        String(entry.noteText || "").toLowerCase().includes(query)
      );
    });
  }, [activityFeed, historyEmployeeFilter, historySearch]);

  const filteredAttendanceMarks = useMemo(() => {
    const today = todayStr();
    return attendanceIncidents.filter((incident) => {
      return Object.entries(markFilters).every(([key, filter]) => {
        if (!filter) return true;
        const op = filter.op;
        const val = filter.val;
        if (attendanceMarkNeedsValue(op) && val === "") return true;

        if (key === "employee") {
          const employeeId = incident.labor_employee_id || "";
          if (op === "is") return employeeId === val;
          if (op === "isNot") return employeeId !== val;
          return true;
        }
        if (key === "type") {
          const typeValue = incident.incident_type || "";
          if (op === "is") return typeValue === val;
          if (op === "isNot") return typeValue !== val;
          return true;
        }
        if (key === "coverage") {
          const coverageValue = incident?.metadata?.coverage_secured ? "yes" : "no";
          if (op === "is") return coverageValue === val;
          if (op === "isNot") return coverageValue !== val;
          return true;
        }
        if (key === "shift_date") {
          const dateValue = parseAttendanceDateOnly(incident.incident_date);
          if (op === "today") return dateValue === today;
          if (!dateValue) return false;
          if (op === "on") return dateValue === val;
          if (op === "after") return dateValue > val;
          if (op === "before") return dateValue < val;
          if (op === "inLastDays") {
            const days = Number.parseInt(val, 10);
            if (!Number.isFinite(days)) return true;
            const diff = Math.floor((new Date(`${today}T12:00:00`) - new Date(`${dateValue}T12:00:00`)) / 86400000);
            return diff >= 0 && diff <= days;
          }
        }
        return true;
      });
    });
  }, [attendanceIncidents, markFilters]);

  const visibleAttendanceMarks = useMemo(() => {
    const query = markSearch.trim().toLowerCase();
    const hasPills = markTypePills.size > 0;
    if (!query && !hasPills) return filteredAttendanceMarks;
    return filteredAttendanceMarks.filter((incident) => {
      if (hasPills && !markTypePills.has(incident.incident_type)) return false;
      if (query) {
        const name = employeeMap[incident.labor_employee_id]?.full_name || "";
        const detail = incident.detail || "";
        const recorder = incident.created_by_name || "";
        if (!`${name} ${detail} ${recorder}`.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [filteredAttendanceMarks, markSearch, markTypePills, employeeMap]);

  const toggleMarkTypePill = useCallback((value) => {
    setMarkTypePills((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const markUsedKeys = Object.keys(markDraftFilters);
  const markAvailableFields = ATTENDANCE_MARK_FILTER_FIELDS.filter((field) => !markDraftFilters[field.key]);
  const configuringMarkField = configuringMarkFilterKey ? markFilterFieldByKey[configuringMarkFilterKey] : null;
  const configuringMarkValue = configuringMarkFilterKey ? markDraftFilters[configuringMarkFilterKey] : null;
  const markFilterSectionIcons = {
    Employee: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    "Mark Details": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 12 2 2 4-4"/><path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z"/></svg>,
    Timing: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>,
  };

  const formatMarkFilterValue = useCallback((key, value) => {
    if (key === "employee") return employeeMap[value]?.full_name || "Employee";
    if (key === "type") return getAttendanceIncidentLabel(value);
    if (key === "coverage") return value === "yes" ? "Coverage secured" : "Coverage not secured";
    return value;
  }, [employeeMap]);

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

  const closeIncidentComposer = useCallback(() => {
    setShowIncidentModal(false);
    resetIncidentModal();
  }, [resetIncidentModal]);

  const openIncidentComposer = useCallback((incident = null, { preferredEmployeeId = "" } = {}) => {
    if (!incident) {
      resetIncidentModal();
      if (preferredEmployeeId) setIncidentEmployeeId(preferredEmployeeId);
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

  const updateMarkFilter = useCallback((key, field, value) => {
    setMarkDraftFilters((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const removeMarkFilter = useCallback((key) => {
    setMarkDraftFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (configuringMarkFilterKey === key) setConfiguringMarkFilterKey(null);
  }, [configuringMarkFilterKey]);

  const confirmMarkConfig = useCallback(() => {
    if (!configuringMarkFilterKey) return;
    const filter = markDraftFilters[configuringMarkFilterKey];
    if (!filter) {
      setConfiguringMarkFilterKey(null);
      return;
    }
    if (attendanceMarkNeedsValue(filter.op) && filter.val === "") return;
    setConfiguringMarkFilterKey(null);
  }, [configuringMarkFilterKey, markDraftFilters]);

  const selectMarkField = useCallback((key) => {
    const field = markFilterFieldByKey[key];
    if (!field) return;
    setMarkDraftFilters((prev) => ({ ...prev, [key]: { op: field.ops[0], val: "" } }));
    setConfiguringMarkFilterKey(key);
  }, [markFilterFieldByKey]);

  const applyMarkFilters = useCallback(() => {
    setMarkFilters(markDraftFilters);
    setShowMarkFilterPanel(false);
    setShowMarkFilterPicker(false);
    setConfiguringMarkFilterKey(null);
  }, [markDraftFilters]);

  const clearMarkFilters = useCallback(() => {
    setMarkDraftFilters({});
    setMarkFilters({});
    setShowMarkFilterPicker(false);
    setConfiguringMarkFilterKey(null);
  }, []);

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
          positionTitle: formatAttendancePositionTitle(employeeTitle),
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
          positionTitle: formatAttendancePositionTitle(employeeTitle),
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
      await loadData({ silent: true });
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
      addGlobalToast("Employee, mark type, and shift date are required", "error");
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
        addGlobalToast("Attendance mark updated", "success");
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
        addGlobalToast("Attendance mark saved", "success");
      }
      closeIncidentComposer();
      await loadData({ silent: true });
    } catch (error) {
      console.error("Attendance mark save error:", error);
      addGlobalToast(`Failed to save attendance mark: ${error.message || "Unknown error"}`, "error");
    }
    setSavingIncident(false);
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    attendanceIncidents,
    closeIncidentComposer,
    editingIncidentId,
    incidentCoverage,
    incidentDate,
    incidentDetail,
    incidentEmployeeId,
    incidentType,
    loadData,
  ]);

  const handleDeleteIncident = useCallback(async (incident) => {
    if (!incident?.id) return;
    const employeeName = employeeMap[incident.labor_employee_id]?.full_name || "this employee";
    if (!window.confirm(`Delete this attendance mark for ${employeeName}?`)) return;
    setDeletingIncidentId(incident.id);
    try {
      const { error } = await supabase.from("attendance_incidents").delete().eq("id", incident.id);
      if (error) throw error;
      if (editingIncidentId === incident.id) {
        closeIncidentComposer();
      }
      await loadData({ silent: true });
      addGlobalToast("Attendance mark deleted", "success");
    } catch (error) {
      console.error("Attendance mark delete error:", error);
      addGlobalToast(`Failed to delete attendance mark: ${error.message || "Unknown error"}`, "error");
    }
    setDeletingIncidentId(null);
  }, [addGlobalToast, closeIncidentComposer, editingIncidentId, employeeMap, loadData]);

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
        `Imported ${legacyImportPlan.employeeCreates.length} employees and ${incidentRows.length} attendance marks`,
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

  // When embedded in the Labor module, don't gate the whole view on loading —
  // that would empty the search slot above the tabs and make the search bar
  // flash on tab switch. Render immediately (the search bar needs no data); the
  // marks list fills in once data arrives.
  if (loading && !embedded) {
    return (
      <div style={{ padding: 24 }}>
        <Card style={{ padding: 28, textAlign: "center", color: C.textMut }}>Loading attendance…</Card>
      </div>
    );
  }

  if (!laborLocationRef && !loading) {
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
    <div style={{ maxWidth: embedded ? "100%" : 1180, margin: "0 auto", padding: embedded ? "0 0 8px" : "24px 16px 40px" }}>
      <style>{`
        @keyframes attendanceFilterSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes attendanceFilterFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes attendanceFilterChipIn { from { opacity: 0; transform: translateX(-6px) scale(0.9); } to { opacity: 1; transform: translateX(0) scale(1); } }
        @keyframes attendanceConfigSlide { from { opacity: 0; max-height: 0; transform: translateY(-4px); } to { opacity: 1; max-height: 240px; transform: translateY(0); } }
        .attendance-sort-control { position: relative; display: inline-flex; }
        .attendance-sort-trigger {
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
          transition: all 160ms ease;
          box-shadow: 0 1px 4px rgba(15,23,42,0.04);
        }
        .attendance-sort-trigger:hover,
        .attendance-sort-trigger.is-open,
        .attendance-sort-trigger.is-active {
          border-color: ${C.pri};
          background: ${C.priLt};
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(20,83,45,0.11);
        }
        .attendance-sort-panel {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: min(520px, 88vw);
          z-index: 60;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid ${C.border};
          background: rgba(255,255,255,0.98);
          box-shadow: 0 24px 60px rgba(15,23,42,0.16);
          animation: attendanceFilterSlideIn 0.22s ease-out;
        }
        .attendance-sort-reset {
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          margin-bottom: 8px;
          border-radius: 10px;
          border: 1.5px dashed ${C.pri};
          background: #fff;
          color: ${C.pri};
          font-family: inherit;
          font-size: 12px;
          font-weight: 850;
          cursor: pointer;
        }
        .attendance-sort-reset.is-active { background: ${C.priLt}; }
        .attendance-sort-options { display: grid; gap: 8px; }
        .attendance-sort-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 8px;
          border-radius: 10px;
          border: 1px solid ${C.borderLight};
          background: #f8fafc;
          animation: attendanceFilterChipIn 0.24s ease-out both;
        }
        .attendance-sort-row > span { color: ${C.text}; font-size: 12px; font-weight: 900; }
        .attendance-sort-row > div { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .attendance-sort-row button {
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
        .attendance-sort-row button:hover,
        .attendance-sort-row button.is-active {
          border-color: ${C.pri};
          background: ${C.pri};
          color: #fff;
          transform: translateY(-1px);
        }
      `}</style>
      {!embedded ? (
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
      ) : null}

      {tabOptions.length > 1 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          {tabOptions.map((tabOption) => (
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
      )}

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
                    <Badge color="warning">{legacyImportPlan.incidentCreates.length} marks to import</Badge>
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
              <div style={{ fontSize: 12, color: C.textMut }}>Marks in last 30 days</div>
            </Card>
          </div>

          <Card style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Labor Roster</div>
                <div style={{ fontSize: 12, color: C.textMut }}>Attendance now reads the canonical labor employee roster.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <AttendanceSortControl sort={rosterSort} onChange={setRosterSort} />
                <Btn variant="primary" onClick={() => openEmployeeModal()} disabled={!canManage}>Add Employee</Btn>
              </div>
            </div>

            {rosterRows.length === 0 ? (
              <EmptyState title="No labor employees yet" subtitle="Create an employee here or from Labor Roster to start tracking attendance." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      {["Employee", "Status", "Position", "Start", "End", "30 Days", "Last Mark", "Actions"].map((label) => (
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
                        <td style={{ padding: "12px 8px", color: C.textSec }}>{formatAttendancePositionTitle(row.position_title) || "—"}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>{formatDateOnly(row.start_date)}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>{formatDateOnly(row.end_date)}</td>
                        <td style={{ padding: "12px 8px", fontWeight: 700, color: C.text }}>{row.recent_attendance_incident_count || 0}</td>
                        <td style={{ padding: "12px 8px", color: C.textSec }}>
                          {row.last_attendance_incident_at ? formatDateOnly(row.last_attendance_incident_at) : "—"}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Btn variant="ghost" size="sm" onClick={() => openEmployeeModal(row)} disabled={!canManage}>Edit</Btn>
                            <Btn
                              variant="ghost"
                              size="sm"
                              onClick={() => openIncidentComposer(null, { preferredEmployeeId: row.id })}
                              disabled={!canManage}
                            >
                              Add Mark
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
          {(() => { const __searchHeader = (
          <div style={{ marginBottom: searchSlot ? 0 : 14 }}>
            <LaborSearchBar value={markSearch} onChange={setMarkSearch} placeholder="Search marks by employee, note, or recorder…">
              {ATTENDANCE_INCIDENT_OPTIONS.map((option) => {
                const on = markTypePills.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleMarkTypePill(option.value)}
                    aria-pressed={on}
                    title={`Filter by ${option.label}`}
                    style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${on ? option.color : C.border}`, background: on ? option.color : "transparent", color: on ? "#fff" : C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                  >
                    {option.label}
                  </button>
                );
              })}
              <span style={{ width: 1, alignSelf: "stretch", minHeight: 24, background: C.border, margin: "0 4px" }} aria-hidden="true" />
              <Btn
                variant={showMarkFilterPanel || Object.keys(markFilters).length > 0 ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowMarkFilterPanel((current) => !current)}
              >
                Filter{Object.keys(markFilters).length > 0 ? ` (${Object.keys(markFilters).length})` : ""}
              </Btn>
              <Btn variant="primary" size="sm" onClick={() => openIncidentComposer()} disabled={!canManage}>Add Mark</Btn>
            </LaborSearchBar>
            <LaborIntro
              value={introValue}
              defaultValue={LABOR_INTRO_DEFAULTS.attendance}
              canEdit={canEditIntro}
              onSave={onSaveIntro}
              prefix={<>Showing {visibleAttendanceMarks.length} of {filteredAttendanceMarks.length} mark{filteredAttendanceMarks.length === 1 ? "" : "s"} · </>}
            />
          </div>
          ); return searchSlot ? createPortal(__searchHeader, searchSlot) : __searchHeader; })()}

          {showMarkFilterPanel && (
            <div style={{ marginBottom: 16, borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.bg, boxShadow: "0 8px 40px rgba(0,0,0,0.08)", overflow: "hidden", animation: "attendanceFilterSlideIn 0.22s ease-out" }}>
              <div style={{ padding: "14px 18px", minHeight: 48 }}>
                {markUsedKeys.length === 0 && !showMarkFilterPicker && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", animation: "attendanceFilterFadeIn 0.2s ease-out" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="1.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    <span style={{ fontSize: 13, color: C.textMut, fontWeight: 500 }}>No filters active</span>
                  </div>
                )}

                {markUsedKeys.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showMarkFilterPicker ? 12 : 0 }}>
                    {markUsedKeys.map((key, index) => {
                      const field = markFilterFieldByKey[key];
                      if (!field) return null;
                      const filter = markDraftFilters[key];
                      const isConfiguring = configuringMarkFilterKey === key;
                      return (
                        <div key={key} style={{ animation: `attendanceFilterChipIn 0.2s ease-out ${index * 0.04}s both` }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", boxShadow: isConfiguring ? "0 0 0 3px rgba(20,83,45,0.06)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.25s cubic-bezier(0.2,0.8,0.2,1)", overflow: "hidden" }}>
                            <button
                              onClick={() => {
                                setConfiguringMarkFilterKey(isConfiguring ? null : key);
                                setShowMarkFilterPicker(false);
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
                            {attendanceMarkNeedsValue(filter.op) && filter.val !== "" ? (
                              <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>
                                {formatMarkFilterValue(key, filter.val)}
                              </span>
                            ) : null}
                            {attendanceMarkNeedsValue(filter.op) && filter.val === "" ? (
                              <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 500, color: C.dan, fontStyle: "italic", whiteSpace: "nowrap" }}>set value</span>
                            ) : null}
                            <button onClick={() => removeMarkFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>

                          {isConfiguring && configuringMarkField && configuringMarkValue && (
                            <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,0.1)", animation: "attendanceConfigSlide 0.25s ease-out", overflow: "hidden" }}>
                              <div style={{ marginBottom: attendanceMarkNeedsValue(configuringMarkValue.op) ? 10 : 0 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Condition</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {configuringMarkField.ops.map((op, opIndex) => (
                                    <button
                                      key={op}
                                      onClick={() => {
                                        updateMarkFilter(configuringMarkFilterKey, "op", op);
                                        if (!attendanceMarkNeedsValue(op)) updateMarkFilter(configuringMarkFilterKey, "val", "");
                                      }}
                                      style={{
                                        padding: "5px 12px",
                                        borderRadius: 8,
                                        border: `1.5px solid ${configuringMarkValue.op === op ? C.pri : C.borderLight}`,
                                        background: configuringMarkValue.op === op ? C.pri : "#fff",
                                        color: configuringMarkValue.op === op ? "#fff" : C.text,
                                        fontSize: 11,
                                        fontWeight: configuringMarkValue.op === op ? 700 : 500,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)",
                                        animation: `attendanceFilterFadeIn 0.2s ease-out ${opIndex * 0.03}s both`,
                                      }}
                                    >
                                      {LC_OP_LABELS[op] || op}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {attendanceMarkNeedsValue(configuringMarkValue.op) && (
                                <div style={{ animation: "attendanceFilterFadeIn 0.2s ease-out 0.1s both" }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Value</div>
                                  {configuringMarkField.type === "custom_select" ? (
                                    <div style={{ maxWidth: 280 }}>
                                      <CustomSelect
                                        value={configuringMarkValue.val}
                                        onChange={(value) => updateMarkFilter(configuringMarkFilterKey, "val", value)}
                                        options={employeeSelectOptions}
                                        placeholder="Select employee"
                                      />
                                    </div>
                                  ) : configuringMarkField.type === "select" ? (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {(configuringMarkField.options || []).map((option, optionIndex) => (
                                        <button
                                          key={option}
                                          onClick={() => updateMarkFilter(configuringMarkFilterKey, "val", option)}
                                          style={{
                                            padding: "5px 12px",
                                            borderRadius: 8,
                                            border: `1.5px solid ${configuringMarkValue.val === option ? C.pri : C.borderLight}`,
                                            background: configuringMarkValue.val === option ? C.pri : "#fff",
                                            color: configuringMarkValue.val === option ? "#fff" : C.text,
                                            fontSize: 11,
                                            fontWeight: configuringMarkValue.val === option ? 700 : 500,
                                            cursor: "pointer",
                                            fontFamily: "inherit",
                                            animation: `attendanceFilterFadeIn 0.15s ease-out ${optionIndex * 0.03}s both`,
                                          }}
                                        >
                                          {formatMarkFilterValue(configuringMarkFilterKey, option)}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                      <input
                                        type={configuringMarkValue.op === "inLastDays" ? "number" : "date"}
                                        value={configuringMarkValue.val}
                                        onChange={(event) => updateMarkFilter(configuringMarkFilterKey, "val", event.target.value)}
                                        onKeyDown={(event) => { if (event.key === "Enter") confirmMarkConfig(); }}
                                        placeholder={configuringMarkValue.op === "inLastDays" ? "Number of days" : "YYYY-MM-DD"}
                                        autoFocus
                                        style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff", color: C.text, width: "100%", maxWidth: 220, outline: "none" }}
                                      />
                                      <button onClick={confirmMarkConfig} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Done</button>
                                    </div>
                                  )}
                                  {configuringMarkField.type !== "date" ? (
                                    <div style={{ marginTop: 8 }}>
                                      <button onClick={confirmMarkConfig} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                              {!attendanceMarkNeedsValue(configuringMarkValue.op) && (
                                <button onClick={confirmMarkConfig} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: "attendanceFilterFadeIn 0.2s ease-out" }}>Done</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!showMarkFilterPicker ? (
                  <div style={{ marginTop: markUsedKeys.length > 0 ? 8 : 0, animation: "attendanceFilterFadeIn 0.2s ease-out" }}>
                    <button
                      onClick={() => {
                        setShowMarkFilterPicker(true);
                        setMarkFilterPickerReady(false);
                        setConfiguringMarkFilterKey(null);
                        setTimeout(() => setMarkFilterPickerReady(true), 10);
                      }}
                      disabled={markAvailableFields.length === 0}
                      style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${markAvailableFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: markAvailableFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 700, cursor: markAvailableFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Filter
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: markUsedKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden", animation: "attendanceFilterSlideIn 0.25s ease-out" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Choose a filter</span>
                      <button onClick={() => setShowMarkFilterPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div style={{ padding: "6px 0" }}>
                      {markFilterSections.map((section, sectionIndex) => {
                        const sectionFields = markAvailableFields.filter((field) => field.section === section);
                        if (sectionFields.length === 0) return null;
                        return (
                          <div key={section}>
                            <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6, animation: markFilterPickerReady ? `attendanceFilterFadeIn 0.2s ease-out ${sectionIndex * 0.06}s both` : "none" }}>
                              {markFilterSectionIcons[section] || null} {section}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                              {sectionFields.map((field, fieldIndex) => {
                                const delay = sectionIndex * 0.06 + fieldIndex * 0.03 + 0.05;
                                return (
                                  <button
                                    key={field.key}
                                    onClick={() => {
                                      selectMarkField(field.key);
                                      setShowMarkFilterPicker(false);
                                    }}
                                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)", animation: markFilterPickerReady ? `attendanceFilterChipIn 0.25s ease-out ${delay}s both` : "none" }}
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

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={applyMarkFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(20,83,45,0.2)" }}>
                    Apply{markUsedKeys.length > 0 ? ` (${markUsedKeys.length})` : ""}
                  </button>
                  {markUsedKeys.length > 0 && (
                    <button onClick={clearMarkFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear All
                    </button>
                  )}
                  <button onClick={() => { setShowMarkFilterPanel(false); setShowMarkFilterPicker(false); setConfiguringMarkFilterKey(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {visibleAttendanceMarks.length === 0 ? (
            <EmptyState
              title={Object.keys(markFilters).length > 0 || markTypePills.size > 0 || markSearch.trim() ? "No attendance marks match the current filters" : "No attendance marks yet"}
              subtitle={Object.keys(markFilters).length > 0 || markTypePills.size > 0 || markSearch.trim() ? "Clear or change the filters, or add a new attendance mark." : "Add the first attendance mark to start the record."}
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    {["Employee", "Mark Type", "Shift Date", "Coverage", "Notes", "Recorded By", "Actions"].map((label) => (
                      <th key={label} style={{ padding: "8px 10px", textAlign: "left", color: C.textMut, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAttendanceMarks.map((incident) => (
                    <tr key={incident.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: C.text }}>
                        {employeeMap[incident.labor_employee_id]?.full_name || "Unknown Employee"}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        <TypePill
                          label={getAttendanceIncidentLabel(incident.incident_type)}
                          color={INCIDENT_COLOR_BY_VALUE[incident.incident_type] || C.textMut}
                        />
                      </td>
                      <td style={{ padding: "7px 10px", color: C.textSec }}>{formatDateOnly(incident.incident_date)}</td>
                      <td style={{ padding: "7px 10px", color: C.textSec }}>
                        {incident?.metadata?.coverage_secured ? "Yes" : "No"}
                      </td>
                      <td style={{ padding: "7px 10px", color: C.textSec, minWidth: 220 }}>
                        {incident.detail || "—"}
                      </td>
                      <td style={{ padding: "7px 10px", color: C.textSec }}>
                        <div>{incident.created_by_name || "Staff"}</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>{formatTimestamp(incident.created_at)}</div>
                        {incident?.metadata?.last_edited_by_name && (
                          <div style={{ fontSize: 11, color: C.textMut }}>
                            edited by {incident.metadata.last_edited_by_name}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Btn variant="ghost" size="sm" onClick={() => openIncidentComposer(incident)} disabled={!canManage || deletingIncidentId === incident.id}>Edit</Btn>
                          <Btn variant="ghost" size="sm" onClick={() => handleDeleteIncident(incident)} disabled={!canManage || deletingIncidentId === incident.id} style={{ color: C.dan }}>
                            {deletingIncidentId === incident.id ? "Deleting..." : "Delete"}
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
      )}

      {tab === "summary" && (
        <Card style={{ padding: 18 }}>
          {(() => { const __summarySearch = (
            <div style={{ marginBottom: searchSlot ? 0 : 14 }}>
              <LaborSearchBar value={summarySearch} onChange={setSummarySearch} placeholder="Search employees…">
                <Btn variant="primary" size="sm" onClick={() => openIncidentComposer()} disabled={!canManage}>Add Mark</Btn>
              </LaborSearchBar>
              <LaborIntro
                value={introValue}
                defaultValue={LABOR_INTRO_DEFAULTS.attendance}
                canEdit={canEditIntro}
                onSave={onSaveIntro}
                prefix={<>{attendanceSummary.rows.length} active {attendanceSummary.rows.length === 1 ? "employee" : "employees"} · </>}
              />
            </div>
          ); return searchSlot ? createPortal(__summarySearch, searchSlot) : __summarySearch; })()}

          {attendanceSummary.rows.length === 0 ? (
            <EmptyState title="No active employees to summarize" subtitle="Add employees to the labor roster to start building attendance reporting." />
          ) : (() => {
            const isActiveSort = (key) => Boolean(summarySort && summarySort.key === key && summarySort.direction);
            const sortArrow = (key) => (isActiveSort(key) ? (summarySort.direction === "asc" ? " ▲" : " ▼") : "");
            const onSort = (key) => setSummarySort((current) => nextSort(current, key));
            const subHead = (key, label, groupStart) => (
              <th
                key={key}
                onClick={() => onSort(key)}
                title="Click to sort ascending / descending"
                style={{ padding: "6px 8px", background: "#F1F5F9", color: isActiveSort(key) ? C.pri : C.textMut, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", borderLeft: groupStart ? ATTENDANCE_SUMMARY_GROUP_DIVIDER : undefined, borderBottom: `1.5px solid ${C.border}` }}
              >
                {label}{sortArrow(key)}
              </th>
            );
            return (
              <div style={{ overflowX: "auto", border: `1.5px solid ${C.border}`, borderRadius: 10 }}>
                <table style={{ width: "100%", minWidth: 1040, borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        onClick={() => onSort("employee")}
                        title="Click to sort ascending / descending"
                        style={{ padding: "8px 12px", background: "#F1F5F9", color: isActiveSort("employee") ? C.pri : C.textMut, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "left", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", borderBottom: `1.5px solid ${C.border}` }}
                      >
                        Employee{sortArrow("employee")}
                      </th>
                      {ATTENDANCE_INCIDENT_OPTIONS.map((option) => (
                        <th key={option.value} colSpan={2} style={{ padding: "7px 10px", background: option.color, color: "#fff", fontSize: 11, fontWeight: 800, textAlign: "center", whiteSpace: "nowrap", borderLeft: ATTENDANCE_SUMMARY_GROUP_DIVIDER }}>
                          {option.label}
                        </th>
                      ))}
                      <th colSpan={2} style={{ padding: "7px 10px", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 800, textAlign: "center", whiteSpace: "nowrap", borderLeft: ATTENDANCE_SUMMARY_GROUP_DIVIDER }}>
                        Total
                      </th>
                    </tr>
                    <tr>
                      {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                        subHead(`${option.value}_30`, "30 Days", true),
                        subHead(`${option.value}_all`, "All Time", false),
                      ]))}
                      {subHead("total30", "30 Days", true)}
                      {subHead("totalAll", "All Time", false)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSummaryRows.map((row, index) => (
                      <tr key={row.id} style={{ background: index % 2 === 1 ? "#F6FAEE" : "#FFFFFF" }}>
                        <td style={{ padding: "7px 12px", fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{row.full_name}</td>
                        {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                          <td key={`${row.id}-${option.value}-30`} style={{ padding: "6px 8px", textAlign: "center", color: C.text, borderLeft: ATTENDANCE_SUMMARY_GROUP_DIVIDER }}>{row.byType[option.value].last30 || "—"}</td>,
                          <td key={`${row.id}-${option.value}-all`} style={{ padding: "6px 8px", textAlign: "center", color: C.text }}>{row.byType[option.value].allTime || "—"}</td>,
                        ]))}
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, color: C.text, borderLeft: ATTENDANCE_SUMMARY_GROUP_DIVIDER }}>{row.total30 || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, color: C.text }}>{row.totalAll || "—"}</td>
                      </tr>
                    ))}
                    {sortedSummaryRows.length === 0 && (
                      <tr>
                        <td colSpan={3 + ATTENDANCE_INCIDENT_OPTIONS.length * 2} style={{ padding: 20, textAlign: "center", color: C.textMut }}>
                          No active employees match “{summarySearch.trim()}”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: C.pri, color: "#fff", fontWeight: 800 }}>
                      <td style={{ padding: "8px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Total</td>
                      {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                        <td key={`totals-${option.value}-30`} style={{ padding: "6px 8px", textAlign: "center", borderLeft: "2.5px solid rgba(255,255,255,0.35)" }}>{attendanceSummary.totals.byType[option.value].last30 || "—"}</td>,
                        <td key={`totals-${option.value}-all`} style={{ padding: "6px 8px", textAlign: "center" }}>{attendanceSummary.totals.byType[option.value].allTime || "—"}</td>,
                      ]))}
                      <td style={{ padding: "6px 8px", textAlign: "center", borderLeft: "2.5px solid rgba(255,255,255,0.35)" }}>{attendanceSummary.totals.total30 || "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>{attendanceSummary.totals.totalAll || "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </Card>
      )}

      {tab === "history" && (
        <Card style={{ padding: 18 }}>
          {(() => { const __historySearch = (
            <div style={{ marginBottom: searchSlot ? 0 : 14 }}>
              <LaborSearchBar value={historySearch} onChange={setHistorySearch} placeholder="Search history by employee, mark, or note…">
                <div style={{ minWidth: 220 }}>
                  <CustomSelect
                    value={historyEmployeeFilter}
                    onChange={setHistoryEmployeeFilter}
                    options={employeeSelectOptions}
                    placeholder="Filter employee"
                    small
                    searchable
                    searchPlaceholder="Search employees"
                  />
                </div>
              </LaborSearchBar>
              <LaborIntro
                value={introValue}
                defaultValue={LABOR_INTRO_DEFAULTS.attendance}
                canEdit={canEditIntro}
                onSave={onSaveIntro}
                prefix={<>Feed of attendance marks · {filteredHistory.length} shown · </>}
              />
            </div>
          ); return searchSlot ? createPortal(__historySearch, searchSlot) : __historySearch; })()}

          {filteredHistory.length === 0 ? (
            <EmptyState title="No history matches the current filters" subtitle="Try clearing the filters or log the first attendance activity." />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredHistory.map((entry) => (
                <div key={entry.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${C.borderLight}`, background: C.surface }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <TypePill label={entry.typeLabel} color={INCIDENT_COLOR_BY_VALUE[ATTENDANCE_INCIDENT_OPTIONS.find((option) => option.label === entry.typeLabel)?.value] || C.info} />
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

      {showIncidentModal && (
        <Modal title={editingIncidentId ? "Edit Attendance Mark" : "Add Attendance Mark"} onClose={closeIncidentComposer}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Employee</div>
              <CustomSelect
                value={incidentEmployeeId}
                onChange={setIncidentEmployeeId}
                options={markComposerEmployeeOptions}
                placeholder="Select employee"
                searchable
                searchPlaceholder="Search employees"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Mark Type</div>
              <CustomSelect
                value={incidentType}
                onChange={setIncidentType}
                options={ATTENDANCE_INCIDENT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                placeholder="Select mark type"
                searchable
                searchPlaceholder="Search mark types"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Shift Date</div>
                <MiniDatePicker value={incidentDate} onChange={(value) => setIncidentDate(value || todayStr())} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Coverage Secured</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setIncidentCoverage("yes")} style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${incidentCoverage === "yes" ? C.suc : C.border}`, background: incidentCoverage === "yes" ? `${C.suc}12` : C.surface, color: incidentCoverage === "yes" ? C.suc : C.textSec, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Yes</button>
                  <button type="button" onClick={() => setIncidentCoverage("no")} style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${incidentCoverage === "no" ? C.dan : C.border}`, background: incidentCoverage === "no" ? `${C.dan}12` : C.surface, color: incidentCoverage === "no" ? C.dan : C.textSec, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>No</button>
                </div>
              </div>
            </div>
            <Inp label="Notes" type="textarea" value={incidentDetail} onChange={setIncidentDetail} placeholder="Optional context for this attendance mark" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="secondary" onClick={closeIncidentComposer} disabled={savingIncident}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSaveIncident} disabled={!canManage || savingIncident}>
                {savingIncident ? "Saving..." : editingIncidentId ? "Save Mark" : "Add Mark"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showEmployeeModal && (
        <Modal title={editingEmployeeId ? "Edit Employee" : "Add Employee"} onClose={() => { setShowEmployeeModal(false); resetEmployeeModal(); }}>
          <div style={{ display: "grid", gap: 14 }}>
            <Inp label="Employee Full Name" value={employeeName} onChange={setEmployeeName} required />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 6 }}>Position Title</div>
              <CustomSelect
                value={formatAttendancePositionTitle(employeeTitle)}
                onChange={setEmployeeTitle}
                options={attendancePositionOptions}
                placeholder="Choose approved title"
              />
            </div>
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
    </div>
  );
}

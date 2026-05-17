// K9 Operations - Enterprise Attendance

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { ATTENDANCE_INCIDENT_OPTIONS } from "../attendanceData";
import {
  buildEnterpriseAttendanceRows,
  normalizeLocationRows,
} from "./enterpriseAggregation";

const HEAD = { padding: "8px 10px", background: "#1B3A5C", color: "#fff", fontSize: 11, fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" };

async function runQuery(label, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message || "Supabase query failed"}`);
  return data || [];
}

export default function EnterpriseAttendance({ userLocationIds }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    locations: [],
    laborEmployees: [],
    attendanceIncidents: [],
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      let locationQuery = supabase.from("locations").select("id,name,slug").order("name", { ascending: true });
      if (Array.isArray(userLocationIds)) {
        if (!userLocationIds.length) {
          setState({ loading: false, error: "", locations: [], laborEmployees: [], attendanceIncidents: [] });
          return;
        }
        locationQuery = locationQuery.in("id", userLocationIds);
      }
      const locations = normalizeLocationRows(await runQuery("locations", locationQuery));
      const locationIds = locations.map((location) => location.id);
      const laborEmployees = locationIds.length
        ? await runQuery(
          "labor employees",
          supabase.from("labor_employees").select("*").in("location_id", locationIds).order("full_name", { ascending: true }),
        )
        : [];
      const employeeIds = laborEmployees.map((employee) => employee.id).filter(Boolean);
      const attendanceIncidents = employeeIds.length
        ? await runQuery(
          "attendance incidents",
          supabase.from("attendance_incidents").select("id,labor_employee_id,incident_type,incident_date,created_at").in("labor_employee_id", employeeIds),
        )
        : [];
      setState({ loading: false, error: "", locations, laborEmployees, attendanceIncidents });
    } catch (error) {
      console.error("Enterprise attendance load error", error);
      setState((current) => ({ ...current, loading: false, error: error.message || "Attendance could not be loaded." }));
    }
  }, [userLocationIds]);

  useEffect(() => {
    load();
  }, [load]);

  const attendance = useMemo(
    () => buildEnterpriseAttendanceRows({ locations: state.locations, laborEmployees: state.laborEmployees, incidents: state.attendanceIncidents }),
    [state.attendanceIncidents, state.laborEmployees, state.locations],
  );
  const locationCountLabel = `${state.locations.length} ${state.locations.length === 1 ? "resort" : "resorts"}`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.text }}>Enterprise Attendance</h2>
          <div style={{ marginTop: 5, fontSize: 13, color: C.textMut }}>
            {locationCountLabel} · {attendance.totals.activeEmployees} active employees
          </div>
        </div>
        <button type="button" onClick={load} style={{ borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "8px 12px", fontSize: 12, fontWeight: 850, cursor: "pointer", fontFamily: "inherit" }}>
          Refresh
        </button>
      </div>
      {state.error && (
        <div style={{ padding: "11px 13px", borderRadius: 10, background: C.danLt, color: C.dan, fontSize: 12, fontWeight: 850 }}>
          {state.error}
        </div>
      )}
      {state.loading ? (
        <div style={{ padding: 24, border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, color: C.textMut, textAlign: "center" }}>Loading attendance...</div>
      ) : (
        <div style={{ overflowX: "auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...HEAD, textAlign: "left" }}>Resort</th>
                <th rowSpan={2} style={HEAD}>Active Employees</th>
                {ATTENDANCE_INCIDENT_OPTIONS.map((option) => (
                  <th key={option.value} colSpan={2} style={{ padding: "6px 8px", background: option.color, color: "#fff", textAlign: "center" }}>
                    {option.label}
                  </th>
                ))}
                <th colSpan={2} style={HEAD}>Total</th>
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
              {attendance.rows.map((row, index) => (
                <tr key={row.id} style={{ background: index % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 850, borderRight: `1px solid ${C.borderLight}` }}>{row.locationName}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 850 }}>{row.activeEmployees || "—"}</td>
                  {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                    <td key={`${row.id}-${option.value}-30`} style={{ padding: "6px 8px", textAlign: "center", color: C.text }}>{row.byType[option.value].last30 || "—"}</td>,
                    <td key={`${row.id}-${option.value}-all`} style={{ padding: "6px 8px", textAlign: "center", borderRight: `1px solid ${C.borderLight}`, color: C.text }}>{row.byType[option.value].allTime || "—"}</td>,
                  ]))}
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 900 }}>{row.total30 || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 900 }}>{row.totalAll || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#1B3A5C", color: "#fff" }}>
                <td style={{ padding: "8px 10px", fontWeight: 900 }}>Total</td>
                <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 900 }}>{attendance.totals.activeEmployees || "—"}</td>
                {ATTENDANCE_INCIDENT_OPTIONS.flatMap((option) => ([
                  <td key={`totals-${option.value}-30`} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 900 }}>{attendance.totals.byType[option.value].last30 || "—"}</td>,
                  <td key={`totals-${option.value}-all`} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 900 }}>{attendance.totals.byType[option.value].allTime || "—"}</td>,
                ]))}
                <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 900 }}>{attendance.totals.total30 || "—"}</td>
                <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 900 }}>{attendance.totals.totalAll || "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

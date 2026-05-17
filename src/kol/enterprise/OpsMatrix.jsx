// K9 Operations - Enterprise View
// Cross-location operating dashboard backed by canonical Supabase tables.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import {
  ENTERPRISE_DATE_PRESETS,
  buildEnterpriseLicenseRows,
  buildEnterpriseVendorRows,
  buildEnterpriseVolumeModel,
  buildPerformanceComplianceRows,
  formatEnterpriseDateRangeLabel,
  getEnterpriseDateRange,
  getEnterpriseVendorTradeOptions,
  normalizeLocationRows,
} from "./enterpriseAggregation";

const CELL = { padding: "9px 10px", borderBottom: `1px solid ${C.borderLight}`, verticalAlign: "middle" };
const HEAD = { padding: "8px 10px", background: "#1B3A5C", color: "#fff", fontSize: 11, fontWeight: 900, textAlign: "center", whiteSpace: "nowrap" };
const FILTER_BUTTON = {
  borderRadius: 999,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.textSec,
  padding: "7px 10px",
  fontSize: 11,
  fontWeight: 850,
  cursor: "pointer",
  fontFamily: "inherit",
};

function activeFilterStyle(active) {
  return active
    ? { ...FILTER_BUTTON, background: C.priLt, borderColor: C.pri, color: C.pri }
    : FILTER_BUTTON;
}

function toneColor(value, goodAt = 90, warningAt = 70) {
  if (value >= goodAt) return C.suc;
  if (value >= warningAt) return C.warn;
  return C.dan;
}

function PercentPill({ value, goodAt = 90, warningAt = 70 }) {
  const color = toneColor(value, goodAt, warningAt);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 56, padding: "5px 9px", borderRadius: 999, background: `${color}18`, color, fontSize: 12, fontWeight: 900 }}>
      {value}%
    </span>
  );
}

function Section({ title, subtitle, actions, children }) {
  return (
    <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 900 }}>{title}</h3>
          {subtitle && <div style={{ marginTop: 4, color: C.textMut, fontSize: 12, lineHeight: 1.45 }}>{subtitle}</div>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, sub, tone = C.text }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, background: "#FAFBFC", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 25, lineHeight: 1.1, fontWeight: 950, color: tone }}>{value}</div>
      {sub && <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>{sub}</div>}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div style={{ padding: 22, border: `1px dashed ${C.border}`, borderRadius: 10, color: C.textMut, fontSize: 13, textAlign: "center", background: "#FAFBFC" }}>
      {children}
    </div>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{ padding: "11px 13px", borderRadius: 10, background: C.danLt, color: C.dan, fontSize: 12, fontWeight: 850, lineHeight: 1.5 }}>
      {message}
    </div>
  );
}

function formatVolumeTotal(row) {
  if (!row?.total?.hasValue) return row?.total?.unavailableLabel || "No history";
  return row.total.value.toLocaleString("en-US", { maximumFractionDigits: row.format === "percent" ? 1 : 0 }) + (row.format === "percent" ? "%" : "");
}

function formatVolumeCurrentTotal(row) {
  if (!row?.currentTotal?.hasValue) return "";
  return row.currentTotal.value.toLocaleString("en-US", { maximumFractionDigits: row.format === "percent" ? 1 : 0 }) + (row.format === "percent" ? "%" : "");
}

async function runQuery(label, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message || "Supabase query failed"}`);
  return data || [];
}

async function loadRosterSnapshotForLocation(locationId, actorUserId, fallbackRows = []) {
  const withLocation = (rows = []) => rows.map((row) => ({
    ...row,
    id: row.labor_employee_id || row.id,
    labor_employee_id: row.labor_employee_id || row.id,
    location_id: row.location_id || locationId,
  }));

  try {
    const { data, error } = await supabase.rpc("get_labor_dashboard_snapshot", {
      p_location_ref: locationId,
      p_actor_user_id: actorUserId || null,
    });
    if (error) throw error;
    if (Array.isArray(data?.roster)) return withLocation(data.roster);
    throw new Error("Dashboard roster snapshot did not return roster rows.");
  } catch (dashboardError) {
    try {
      const { data, error } = await supabase.rpc("get_labor_roster_snapshot", {
        p_location_ref: locationId,
        p_actor_user_id: actorUserId || null,
      });
      if (error) throw error;
      if (Array.isArray(data)) return withLocation(data);
    } catch (rosterError) {
      console.warn("Enterprise performance roster snapshot fallback used", dashboardError, rosterError);
    }
  }

  return withLocation(fallbackRows.filter((row) => row.location_id === locationId));
}

async function loadEnterprisePerformanceRosterRows({ locationIds = [], actorUserId = null, fallbackRows = [] } = {}) {
  const rowsByLocation = await Promise.all(
    locationIds.map((locationId) => loadRosterSnapshotForLocation(locationId, actorUserId, fallbackRows)),
  );
  return rowsByLocation.flat();
}

export default function EnterpriseOpsMatrix({ profile, userLocationIds, view = "volume" }) {
  const today = todayStr();
  const actorUserId = profile?.user_id || null;
  const [rangeKey, setRangeKey] = useState("mtd");
  const [matrixMode, setMatrixMode] = useState("current");
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [reloadKey, setReloadKey] = useState(0);
  const [vendorTradeFilter, setVendorTradeFilter] = useState("all");
  const [vendorLocationFilter, setVendorLocationFilter] = useState("all");
  const [licenseStatusFilter, setLicenseStatusFilter] = useState("all");
  const [expandedVolumeGroups, setExpandedVolumeGroups] = useState(() => new Set());
  const [state, setState] = useState({
    loading: true,
    error: "",
    locations: [],
    matrixRows: [],
    laborEmployees: [],
    vendors: [],
    licenses: [],
  });

  const dateRange = useMemo(
    () => getEnterpriseDateRange(rangeKey, customStart, customEnd, today),
    [customEnd, customStart, rangeKey, today],
  );

  const loadEnterpriseData = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      let locationQuery = supabase.from("locations").select("id,name,slug").order("name", { ascending: true });
      if (Array.isArray(userLocationIds)) {
        if (userLocationIds.length === 0) {
          setState((current) => ({ ...current, loading: false, locations: [], matrixRows: [], laborEmployees: [], vendors: [], licenses: [] }));
          return;
        }
        locationQuery = locationQuery.in("id", userLocationIds);
      }

      const locations = normalizeLocationRows(await runQuery("locations", locationQuery));
      const locationIds = locations.map((location) => location.id);

      if (!locationIds.length) {
        setState((current) => ({ ...current, loading: false, locations, matrixRows: [], laborEmployees: [], vendors: [], licenses: [] }));
        return;
      }

      const [
        matrixRows,
        rawLaborEmployees,
        vendors,
        licenses,
      ] = await Promise.all([
        runQuery(
          "scheduling volume",
          supabase
            .from("scheduling_matrix_daily")
            .select("*")
            .in("location_id", locationIds)
            .gte("matrix_date", dateRange.startDate)
            .lte("matrix_date", dateRange.endDate)
            .order("matrix_date", { ascending: true }),
        ),
        runQuery(
          "labor employees",
          supabase
            .from("labor_employees")
            .select("*")
            .in("location_id", locationIds)
            .order("full_name", { ascending: true }),
        ),
        runQuery(
          "vendors",
          supabase
            .from("resort_upkeep_vendors")
            .select("*")
            .in("location_id", locationIds)
            .eq("is_archived", false)
            .order("business_name", { ascending: true }),
        ),
        runQuery(
          "licenses",
          supabase
            .from("resort_upkeep_licenses")
            .select("*")
            .in("location_id", locationIds)
            .eq("is_active", true)
            .order("status", { ascending: true })
            .order("expiration_date", { ascending: true, nullsFirst: false }),
        ),
      ]);

      const laborEmployees = view === "performance"
        ? await loadEnterprisePerformanceRosterRows({ locationIds, actorUserId, fallbackRows: rawLaborEmployees })
        : rawLaborEmployees;

      setState({
        loading: false,
        error: "",
        locations,
        matrixRows,
        laborEmployees,
        vendors,
        licenses,
      });
    } catch (error) {
      console.error("Enterprise view load error", error);
      setState((current) => ({ ...current, loading: false, error: error.message || "Enterprise data could not be loaded." }));
    }
  }, [actorUserId, dateRange.endDate, dateRange.startDate, userLocationIds, view]);

  useEffect(() => {
    loadEnterpriseData();
  }, [loadEnterpriseData, reloadKey]);

  const volume = useMemo(
    () => buildEnterpriseVolumeModel({ locations: state.locations, matrixRows: state.matrixRows, mode: matrixMode }),
    [matrixMode, state.locations, state.matrixRows],
  );
  const performance = useMemo(
    () => buildPerformanceComplianceRows({ locations: state.locations, laborEmployees: state.laborEmployees, todayValue: today }),
    [state.laborEmployees, state.locations, today],
  );
  const vendorRows = useMemo(
    () => buildEnterpriseVendorRows({ vendors: state.vendors, locations: state.locations }),
    [state.locations, state.vendors],
  );
  const licenseRows = useMemo(
    () => buildEnterpriseLicenseRows({ licenses: state.licenses, locations: state.locations }),
    [state.licenses, state.locations],
  );
  const tradeOptions = useMemo(() => getEnterpriseVendorTradeOptions(state.vendors), [state.vendors]);
  const allVolumeGroupsExpanded = volume.rowGroups.length > 0 && volume.rowGroups.every((group) => expandedVolumeGroups.has(group.section));

  const filteredVendorRows = useMemo(() => vendorRows.filter((row) => (
    (vendorTradeFilter === "all" || row.tradeKey === vendorTradeFilter)
    && (vendorLocationFilter === "all" || row.location_id === vendorLocationFilter)
  )), [vendorLocationFilter, vendorRows, vendorTradeFilter]);

  const filteredLicenseRows = useMemo(() => licenseRows.filter((row) => (
    licenseStatusFilter === "all" || row.status === licenseStatusFilter
  )), [licenseRows, licenseStatusFilter]);

  const toggleVolumeGroup = useCallback((section) => {
    setExpandedVolumeGroups((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const toggleAllVolumeGroups = useCallback(() => {
    setExpandedVolumeGroups(allVolumeGroupsExpanded ? new Set() : new Set(volume.rowGroups.map((group) => group.section)));
  }, [allVolumeGroupsExpanded, volume.rowGroups]);

  const rangeLabel = formatEnterpriseDateRangeLabel(dateRange.startDate, dateRange.endDate);
  const locationCountLabel = `${state.locations.length} ${state.locations.length === 1 ? "resort" : "resorts"}`;
  const pageTitle = {
    volume: "Enterprise Volume",
    performance: "Performance Management",
    vendors: "Vendor Database",
    licenses: "Licenses",
  }[view] || "Enterprise Volume";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <style>{`
        @media (max-width: 820px) {
          .enterprise-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .enterprise-controls { align-items: stretch !important; }
          .enterprise-controls > * { width: 100%; }
          .enterprise-date-row { align-items: stretch !important; }
          .enterprise-date-strip { width: 100%; overflow-x: auto; justify-content: flex-start !important; }
        }
        @media (max-width: 560px) {
          .enterprise-kpi-grid { grid-template-columns: 1fr !important; }
        }
        .enterprise-date-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .enterprise-date-strip {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 4px;
          border: 1px solid ${C.border};
          border-radius: 999px;
          background: linear-gradient(180deg, #FFFFFF 0%, #F6FAF5 100%);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255,255,255,.8);
        }
        .enterprise-date-icon {
          width: 29px;
          height: 29px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: ${C.pri};
          background: ${C.priLt};
          flex: 0 0 auto;
        }
        .enterprise-date-icon svg {
          width: 15px;
          height: 15px;
        }
        .enterprise-date-option {
          border: none;
          border-radius: 999px;
          background: transparent;
          color: ${C.textSec};
          height: 29px;
          padding: 0 12px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
          transition: background .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease;
        }
        .enterprise-date-option:hover {
          background: rgba(11, 93, 30, .08);
          color: ${C.pri};
        }
        .enterprise-date-option.is-active {
          background: ${C.pri};
          color: #fff;
          box-shadow: 0 6px 14px rgba(11, 93, 30, .18);
        }
        .enterprise-date-option.is-active:hover {
          color: #fff;
          transform: translateY(-1px);
        }
        .enterprise-date-input {
          height: 37px;
          padding: 0 11px;
          border-radius: 9px;
          border: 1px solid ${C.border};
          font-family: inherit;
          font-size: 12px;
          color: ${C.text};
          background: #fff;
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: C.text }}>{pageTitle}</h2>
          <div style={{ marginTop: 5, fontSize: 13, color: C.textMut }}>
            {locationCountLabel}{view === "volume" ? ` · ${rangeLabel}` : ""}
          </div>
        </div>
        <div className="enterprise-controls" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} style={FILTER_BUTTON} title="Refresh enterprise data">
            <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 6 }}><I.RefreshCw /></span>
            Refresh
          </button>
        </div>
      </div>

      <ErrorBanner message={state.error} />

      {view === "volume" && (
        <>
          <div className="enterprise-date-row">
            <div className="enterprise-date-strip" role="group" aria-label="Enterprise volume date range">
              <span className="enterprise-date-icon"><I.Calendar /></span>
              {ENTERPRISE_DATE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  aria-pressed={rangeKey === preset.key}
                  onClick={() => setRangeKey(preset.key)}
                  className={`enterprise-date-option${rangeKey === preset.key ? " is-active" : ""}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {rangeKey === "custom" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="enterprise-date-input" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                <input className="enterprise-date-input" type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} />
              </div>
            )}
          </div>

          <div className="enterprise-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
            <Metric label="Total Dog Volume" value={Math.round(volume.metrics.totalDogVolume).toLocaleString()} sub={matrixMode === "projected" ? "Projected dog-days" : "Booked dog-days"} tone={C.pri} />
            <Metric label="Daycare" value={Math.round(volume.metrics.daycare).toLocaleString()} sub="Dog-days" />
            <Metric label="Boarding" value={Math.round(volume.metrics.boardingOpening).toLocaleString()} sub="Dog-days" />
            <Metric label="Departure Baths" value={Math.round(volume.metrics.departureBaths).toLocaleString()} sub="Support workload" />
            <Metric label="Tours" value={Math.round(volume.metrics.tours).toLocaleString()} sub="Support workload" />
          </div>
        </>
      )}

      {view === "volume" && (
        <Section
          title="Volume Statistics"
          actions={(
            <>
              <button type="button" onClick={toggleAllVolumeGroups} style={FILTER_BUTTON}>
                <span style={{ display: "inline-flex", transform: allVolumeGroupsExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", verticalAlign: "middle", marginRight: 6 }}><I.ChevronDown /></span>
                {allVolumeGroupsExpanded ? "Collapse All" : "Expand All"}
              </button>
              {[
                { key: "current", label: "Currently Booked" },
                { key: "projected", label: "Projected" },
              ].map((option) => (
                <button key={option.key} type="button" onClick={() => setMatrixMode(option.key)} style={activeFilterStyle(matrixMode === option.key)}>
                  {option.label}
                </button>
              ))}
            </>
          )}
        >
          {state.loading ? <EmptyState>Loading enterprise volume...</EmptyState> : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: 250 + (state.locations.length + 1) * 132, borderCollapse: "separate", borderSpacing: 0, fontSize: 12, tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#F8FAFC", width: 250, padding: "12px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut }}>
                      Operational Metric
                    </th>
                    {state.locations.map((location) => <th key={location.id} style={{ width: 132, padding: "12px 8px", textAlign: "center", borderBottom: `1px solid ${C.border}`, background: "#F8FAFC", fontSize: 12, fontWeight: 850, color: C.text }}>{location.name}</th>)}
                    <th style={{ position: "sticky", right: 0, zIndex: 3, width: 132, padding: "12px 8px", textAlign: "center", borderBottom: `1px solid ${C.border}`, background: "#F8FAFC", boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)", fontSize: 12, fontWeight: 850, color: C.text }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {volume.rowGroups.flatMap((group) => {
                    const groupExpanded = expandedVolumeGroups.has(group.section);
                    const visibleRows = group.rows.filter((row) => {
                      if (groupExpanded) return true;
                      if (group.hideRowsWhenCollapsed) return false;
                      return row.totalRow || row.alwaysVisible;
                    });
                    return [
                      <tr key={`${group.section}-section`}>
                        <td style={{ position: "sticky", left: 0, zIndex: 2, padding: "8px 12px", background: "#F8FAFC", borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}` }}>
                          <button type="button" onClick={() => toggleVolumeGroup(group.section)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "transparent", padding: 0, color: C.textMut, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                            <span style={{ display: "flex", transform: groupExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><I.ChevronDown /></span>
                            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group.section}</span>
                            {!groupExpanded && <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut }}>+{Math.max(group.rows.length - visibleRows.length, 0)}</span>}
                          </button>
                        </td>
                        {state.locations.map((location) => <td key={`${group.section}-${location.id}`} style={{ background: "#F8FAFC", borderBottom: `1px solid ${C.borderLight}` }} />)}
                        <td style={{ position: "sticky", right: 0, zIndex: 2, background: "#F8FAFC", borderBottom: `1px solid ${C.borderLight}`, boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)" }} />
                      </tr>,
                      ...visibleRows.map((row) => (
                        <tr key={row.key}>
                          <td style={{ position: "sticky", left: 0, zIndex: 2, padding: "9px 12px", background: row.totalRow ? "#F4F7FB" : C.surface, borderBottom: row.totalRow ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}`, fontSize: 12, fontWeight: row.totalRow ? 800 : 600, color: C.text }}>
                            {row.label}
                          </td>
                          {row.locations.map((cell) => (
                            <td key={`${row.key}-${cell.locationId}`} style={{ textAlign: "center", padding: "10px 8px", borderBottom: row.totalRow ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`, background: row.totalRow ? "#F4F7FB" : C.surface, color: cell.hasValue ? C.textSec : C.textMut, fontSize: cell.hasValue ? 16 : 11, fontWeight: row.totalRow ? 800 : 700 }}>
                              {matrixMode === "projected" && cell.currentLabel && !row.comparison ? (
                                <span><span style={{ color: C.textMut, fontWeight: 650 }}>{cell.currentLabel}</span> <span style={{ color: C.pri }}>→</span> {cell.label}</span>
                              ) : cell.label}
                            </td>
                          ))}
                          <td style={{ position: "sticky", right: 0, zIndex: 2, textAlign: "center", padding: "10px 8px", borderBottom: row.totalRow ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`, background: row.totalRow ? "#F4F7FB" : "#F8FAFC", boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)", color: row.total.hasValue ? C.text : C.textMut, fontSize: row.total.hasValue ? 16 : 11, fontWeight: 850 }}>
                            {matrixMode === "projected" && row.currentTotal?.hasValue && !row.comparison ? (
                              <span><span style={{ color: C.textMut, fontWeight: 650 }}>{formatVolumeCurrentTotal(row)}</span> <span style={{ color: C.pri }}>→</span> {formatVolumeTotal(row)}</span>
                            ) : formatVolumeTotal(row)}
                          </td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {view === "performance" && (
        <>
          <div className="enterprise-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            <Metric label="Review Compliance" value={`${performance.totals.compliancePct}%`} sub={`${performance.totals.compliantEmployees}/${performance.totals.activeEmployees} active employees`} tone={toneColor(performance.totals.compliancePct, 90, 70)} />
            <Metric label="Completed Employees" value={performance.totals.completedEmployees.toLocaleString()} sub="At least one completed review" tone={C.suc} />
            <Metric label="Overdue Employees" value={performance.totals.overdueEmployees.toLocaleString()} sub="Any overdue review checkpoint" tone={performance.totals.overdueEmployees ? C.dan : C.suc} />
            <Metric label="Needs Setup" value={performance.totals.needsSetupEmployees.toLocaleString()} sub="No review schedule/status" tone={performance.totals.needsSetupEmployees ? C.warn : C.suc} />
          </div>
          <Section title="Performance Management">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...HEAD, textAlign: "left" }}>Resort</th>
                <th style={HEAD}>Compliance</th>
                <th style={HEAD}>Completed</th>
                <th style={HEAD}>Active Employees</th>
                <th style={HEAD}>Overdue Employees</th>
                <th style={HEAD}>Needs Setup</th>
                <th style={HEAD}>Completed Cycles</th>
              </tr>
            </thead>
            <tbody>
              {performance.rows.map((row, index) => (
                <tr key={row.id} style={{ background: index % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                  <td style={{ ...CELL, fontWeight: 850 }}>{row.locationName}</td>
                  <td style={{ ...CELL, textAlign: "center" }}><PercentPill value={row.compliancePct} /></td>
                  <td style={{ ...CELL, textAlign: "center", fontWeight: 850 }}>{row.completedEmployees}</td>
                  <td style={{ ...CELL, textAlign: "center" }}>{row.activeEmployees}</td>
                  <td style={{ ...CELL, textAlign: "center", color: row.overdueEmployees ? C.dan : C.text }}>{row.overdueEmployees || "—"}</td>
                  <td style={{ ...CELL, textAlign: "center", color: row.needsSetupEmployees ? C.warn : C.text }}>{row.needsSetupEmployees || "—"}</td>
                  <td style={{ ...CELL, textAlign: "center" }}>{row.completedCycles || "—"}</td>
                </tr>
              ))}
              <tr style={{ background: "#1B3A5C", color: "#fff" }}>
                <td style={{ padding: "8px 10px", fontWeight: 900 }}>Total</td>
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900 }}>{performance.totals.compliancePct}%</td>
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900 }}>{performance.totals.completedEmployees}</td>
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900 }}>{performance.totals.activeEmployees}</td>
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900 }}>{performance.totals.overdueEmployees || "—"}</td>
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900 }}>{performance.totals.needsSetupEmployees || "—"}</td>
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900 }}>{performance.totals.completedCycles || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
          </Section>
        </>
      )}

      {view === "vendors" && (
        <Section
        title="Vendor Database"
        actions={(
          <>
            <button type="button" onClick={() => setVendorLocationFilter("all")} style={activeFilterStyle(vendorLocationFilter === "all")}>All Resorts</button>
            {state.locations.map((location) => (
              <button key={location.id} type="button" onClick={() => setVendorLocationFilter(location.id)} style={activeFilterStyle(vendorLocationFilter === location.id)}>
                {location.name}
              </button>
            ))}
          </>
        )}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" onClick={() => setVendorTradeFilter("all")} style={activeFilterStyle(vendorTradeFilter === "all")}>All Trades</button>
          {tradeOptions.map((trade) => (
            <button key={trade.key} type="button" onClick={() => setVendorTradeFilter(trade.key)} style={activeFilterStyle(vendorTradeFilter === trade.key)}>
              {trade.label}
            </button>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...HEAD, textAlign: "left" }}>Location</th>
                <th style={{ ...HEAD, textAlign: "left" }}>Trade</th>
                <th style={{ ...HEAD, textAlign: "left" }}>Business</th>
                <th style={{ ...HEAD, textAlign: "left" }}>Primary Contact</th>
                <th style={{ ...HEAD, textAlign: "left" }}>Address</th>
                <th style={HEAD}>Contract</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendorRows.map((vendor, index) => (
                <tr key={vendor.id} style={{ background: index % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                  <td style={{ ...CELL, fontWeight: 850 }}>{vendor.locationName}</td>
                  <td style={CELL}>{vendor.tradeLabel}</td>
                  <td style={{ ...CELL, fontWeight: 850 }}>{vendor.business_name || "Untitled vendor"}</td>
                  <td style={CELL}>{vendor.primaryContact || "—"}</td>
                  <td style={CELL}>{vendor.business_address || vendor.address_line_1 || "—"}</td>
                  <td style={{ ...CELL, textAlign: "center" }}>{vendor.has_contract ? <I.Check /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filteredVendorRows.length && <EmptyState>No vendor records match the current filters.</EmptyState>}
        </Section>
      )}

      {view === "licenses" && (
        <Section
        title="Licenses"
        actions={(
          <>
            {["all", "compliant", "non_compliant"].map((status) => (
              <button key={status} type="button" onClick={() => setLicenseStatusFilter(status)} style={activeFilterStyle(licenseStatusFilter === status)}>
                {status === "all" ? "All" : status.replace("_", " ")}
              </button>
            ))}
          </>
        )}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 780, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...HEAD, textAlign: "left" }}>Location</th>
                <th style={{ ...HEAD, textAlign: "left" }}>Requirement</th>
                <th style={{ ...HEAD, textAlign: "left" }}>Organization</th>
                <th style={HEAD}>Status</th>
                <th style={HEAD}>Expiration</th>
                <th style={HEAD}>Next Expected</th>
              </tr>
            </thead>
            <tbody>
              {filteredLicenseRows.map((license, index) => (
                <tr key={license.id} style={{ background: index % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                  <td style={{ ...CELL, fontWeight: 850 }}>{license.locationName}</td>
                  <td style={{ ...CELL, fontWeight: 850 }}>{license.requirement_name || "Untitled requirement"}</td>
                  <td style={CELL}>{license.issuing_organization || "—"}</td>
                  <td style={{ ...CELL, textAlign: "center" }}><StatusPill status={license.status} /></td>
                  <td style={{ ...CELL, textAlign: "center" }}>{license.expiration_date || "—"}</td>
                  <td style={{ ...CELL, textAlign: "center" }}>{license.next_expected_date || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filteredLicenseRows.length && <EmptyState>No license records match the current filters.</EmptyState>}
        </Section>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const danger = status === "overdue" || status === "submitted_late" || status === "non_compliant";
  const good = status === "submitted" || status === "ready_to_submit" || status === "compliant";
  const color = danger ? C.dan : good ? C.suc : C.textMut;
  return (
    <span style={{ borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900, background: danger ? C.danLt : good ? C.sucLt : C.borderLight, color }}>
      {String(status || "open").replace(/_/g, " ")}
    </span>
  );
}

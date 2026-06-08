// K9 Operations — Scheduling Page
// Week plan + optimal headcount + BE rotation + explanations + warnings + assumptions.
// Uses live Supabase data from scheduling_matrix_daily.

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { C, todayStr, addDays } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, CalendarPicker } from "../../shared/ui";
import { supabase } from "../../supabaseClient";
import { buildSchedulingDateRange, useSchedulingData } from "../../hooks/useSchedulingData";
import { useWeatherData } from "../../hooks/useWeatherData";
import { useWeatherDisplaySettings } from "../../hooks/useWeatherDisplaySettings";
import {
  TASK_COLORS,
  SHIFT_POSITION_OPTIONS,
  applyOverride,
  getMatrixDisplay,
  getMatrixProjectedDisplay,
  getMatrixProjection,
  getMatrixComparison,
  deriveStaffPlanFromShiftEntries,
  getShiftEntries,
} from "../../shared/schedulingEngine";
import {
  MATRIX_PAGE_SIZE,
  buildDemandMatrixExportModel,
  buildDemandMatrixRangeReadiness,
  buildDemandMatrixRowGroups,
  buildHistoricalRangeSummary,
  buildSchedulingNarrative,
  buildSchedulingNarrativeHtml,
  formatDemandMatrixValue as formatMatrixValue,
  getDayProjectedDisplay,
  getDayProjection,
  summarizeAggregateMatrixCell,
  sumMatrixValues,
} from "./schedulingDemandMatrixModel";
import {
  buildDemandMatrixExportFilename,
  createDemandMatrixXlsxBlob,
  downloadBlob,
} from "./schedulingDemandMatrixXlsx";
import {
  buildDayCapacityIndicators,
  getVisibleCapacityIndicators,
} from "../scheduling/capacityIndicators";
import {
  buildRotationTemplateMatches,
  getRotationTemplateCatalogSummary,
  getTemplateDisplayName,
} from "../scheduling/rotationTemplateMatcher";
import RotationCreationStudio from "../scheduling/RotationCreationStudio";
import {
  dateIndexInRange,
  formatDemandRangeLabel,
  formatMatrixDate,
  getDemandRange,
  getMondayStart,
  getMonthEnd,
  getMonthStart,
  getYearStart,
  shiftDemandAnchor,
} from "./scheduling/schedulingDates";
import { isUuid, resolveSchedulingLocationName } from "./scheduling/schedulingLocation";
import { sortRotationLanes } from "./scheduling/rotationLanes";
import { copySchedulingNarrativeToClipboard } from "./scheduling/schedulingClipboard";
import {
  getProjectionFormulaLine,
  getProjectionHeadline,
  getProjectionMethodologySteps,
  getProjectionSummaryLines,
} from "./scheduling/projectionCopy";
import { getCapacityRiskLines, getProjectionHistoryPoints } from "./scheduling/projectionHistory";
import {
  STAFFING_MATRIX_ROLES,
  STAFFING_MATRIX_SHIFTS,
  buildDefaultStaffingMatrix,
  buildShiftEntriesFromStaffingMatrix,
  createDefaultShiftEntry,
} from "./scheduling/staffingMatrix";
import { countShiftCoverage, getShiftHourSummary, summarizeSupportRoles } from "./scheduling/shiftSummary";
import { buildMatrixColumns, buildMonthWeekSegments } from "./scheduling/matrixColumns";
import { CapacityPill, MetricPill, SectionCard, TrustBadge } from "./scheduling/schedulingPrimitives";
import { SchedulingSubtabs, getInitialSchedulingTab } from "./scheduling/schedulingSubtabs";
import { renderAggregateMatrixCellValue, renderMatrixCellValue } from "./scheduling/matrixCellValue";
import { ProjectionHistoryChart } from "./scheduling/projectionHistoryChart";
import { CapacityWatchPanel } from "./scheduling/capacityWatchPanel";

export {
  buildHistoricalRangeSummary,
  buildMatrixColumns,
  buildMonthWeekSegments,
  buildSchedulingNarrative,
  buildSchedulingNarrativeHtml,
  getProjectionFormulaLine,
  getProjectionHeadline,
  getProjectionHistoryPoints,
  getProjectionMethodologySteps,
  getProjectionSummaryLines,
  summarizeAggregateMatrixCell,
};

const MATRIX_TABLE_FONT = "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── Utility Components ───────────────────────────────────────────────────

function formatVisibleSchedulingCopy(value) {
  return String(value ?? "").replace(/\bGingr\b/g, "Gingr");
}

function ProjectionMethodologyPanel({ day }) {
  const steps = getProjectionMethodologySteps(day);
  const headline = getProjectionHeadline(day);
  const formulaLine = getProjectionFormulaLine(day);
  if (!steps.length) {
    return (
      <div style={{ fontSize: 11, color: C.textMut, borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, marginTop: 14 }}>
        Selected day: <span style={{ fontWeight: 700, color: C.text }}>{day?.dayName} {formatMatrixDate(day?.date || todayStr())}</span>. Projected mode uses prior-year booking pace from Gingr created dates.
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, marginTop: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.textMut }}>
          Selected day: <span style={{ fontWeight: 800, color: C.text }}>{day?.dayName} {formatMatrixDate(day?.date || todayStr())}</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>Projection Method</span>
      </div>
      {headline && (
        <div style={{ fontSize: 11, color: C.text, fontWeight: 700, lineHeight: 1.45, marginBottom: 6 }}>
          {headline}
        </div>
      )}
      {formulaLine && (
        <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.5, borderLeft: `3px solid ${C.pri}`, paddingLeft: 9, marginBottom: 9 }}>
          <span style={{ fontWeight: 800, color: C.text }}>Formula: </span>
          {formulaLine}
        </div>
      )}
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10, maxWidth: 1060 }}>
        {steps.map((step, index) => (
          <li key={step.label} style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", gap: 8, color: C.textMut, fontSize: 12, lineHeight: 1.5 }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#EEF4FF", color: C.pri, fontSize: 11, fontWeight: 800 }}>
              {index + 1}
            </span>
            <span>
              <span style={{ display: "block", fontWeight: 800, color: C.text, marginBottom: 1 }}>{step.label.replace(/^\d+\.\s*/, "")}</span>
              <span>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div style={{ fontSize: 11, color: C.textMut, marginTop: 9 }}>
        Weekly totals shown in the workbook are dog-days, not unique reservations.
      </div>
    </div>
  );
}

function ForecastDetailsPanel({ day, matrixMode, expanded, onToggle }) {
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.borderLight}`, paddingTop: 12 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          background: expanded ? "#F8FAFC" : C.surface,
          color: C.text,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span>
          <span style={{ display: "block", fontSize: 12, fontWeight: 900 }}>Demand Forecast Details</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 11, color: C.textMut }}>
            Projection math, historical accuracy, and capacity risk for {day?.dayName} {formatMatrixDate(day?.date || todayStr())}
          </span>
        </span>
        <span style={{ display: "flex", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", color: C.textMut }}>
          <I.ChevronDown />
        </span>
      </button>
      {expanded && (
        <>
          {matrixMode === "projected" ? (
            <ProjectionMethodologyPanel day={day} />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 11, color: C.textMut }}>
                Selected day: <span style={{ fontWeight: 700, color: C.text }}>{day?.dayName} {formatMatrixDate(day?.date || todayStr())}</span>
              </span>
              <span style={{ fontSize: 11, color: C.textMut }}>
                Weekly totals shown in the workbook are dog-days, not unique reservations.
              </span>
            </div>
          )}
          <ProjectionAccuracyPanel day={day} />
        </>
      )}
    </div>
  );
}

function ProjectionAccuracyPanel({ day }) {
  if (!day) return null;
  const points = getProjectionHistoryPoints(day);
  const capacityLines = getCapacityRiskLines(day);

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.borderLight}`, display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(240px, 0.8fr)", gap: 18 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Projection Accuracy</div>
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>Achievable total dog volume by days out for {day.dayName} {formatMatrixDate(day.date)}</div>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, fontWeight: 700, color: C.textMut, flexWrap: "wrap" }}>
            <span><span style={{ color: C.pri }}>●</span> Achievable</span>
            <span><span style={{ color: "#7C3AED" }}>●</span> Unconstrained</span>
            <span><span style={{ color: C.textMut }}>●</span> Booked</span>
            <span><span style={{ color: C.suc }}>●</span> Actual</span>
          </div>
        </div>
        {points.length ? (
          <ProjectionHistoryChart points={points} />
        ) : (
          <div style={{ padding: "20px 0", fontSize: 12, color: C.textMut }}>Projection history will appear after the next daily compute snapshot.</div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8 }}>Capacity Check</div>
        {capacityLines.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {capacityLines.map((line) => (
              <div key={line} style={{ fontSize: 11, color: C.dan, lineHeight: 1.45, fontWeight: 700 }}>{line}</div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.5 }}>
            No projected capacity breach for configured boarding or play-yard limits.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Staff Shift Input ────────────────────────────────────────────────────

function StaffingMatrixGenerator({ day, rotation, matrixMode, onGenerate, disabled }) {
  const defaultMatrix = useMemo(() => buildDefaultStaffingMatrix(day, rotation), [day?.date, rotation?.shift_recommendations]);
  const [staffingMatrix, setStaffingMatrix] = useState(defaultMatrix);
  const demandDisplay = matrixMode === "projected" ? day?.projectedDisplay : day?.currentDisplay;
  const matches = useMemo(
    () => buildRotationTemplateMatches({
      date: day?.date,
      staffingMatrix,
      demandDisplay,
    }),
    [day?.date, staffingMatrix, demandDisplay],
  );

  useEffect(() => {
    setStaffingMatrix(defaultMatrix);
  }, [defaultMatrix]);

  const inputStyle = {
    width: "100%",
    minWidth: 68,
    padding: "7px 8px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 800,
    color: C.text,
    fontFamily: "inherit",
    background: C.surface,
    textAlign: "center",
  };

  const updateCount = (shiftKey, roleKey, value) => {
    const count = Math.max(0, Math.min(24, Math.round(Number(value) || 0)));
    setStaffingMatrix((current) => ({
      ...current,
      [shiftKey]: {
        ...current[shiftKey],
        [roleKey]: count,
      },
    }));
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 580 }}>
          <thead>
            <tr>
              <th style={{ width: 120, padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut, background: "#F8FAFC" }}>Shift</th>
              {STAFFING_MATRIX_ROLES.map((role) => (
                <th key={role.key} style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut, background: "#F8FAFC" }}>
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAFFING_MATRIX_SHIFTS.map((shift) => (
              <tr key={shift.key}>
                <td style={{ padding: "10px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, fontWeight: 900, color: C.text }}>
                  {shift.label}
                </td>
                {STAFFING_MATRIX_ROLES.map((role) => (
                  <td key={role.key} style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={staffingMatrix[shift.key]?.[role.key] ?? 0}
                      onChange={(event) => updateCount(shift.key, role.key, event.target.value)}
                      disabled={disabled}
                      style={inputStyle}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        {STAFFING_MATRIX_SHIFTS.map((shift) => {
          const match = matches[shift.key];
          const template = getTemplateDisplayName(match);
          return (
            <div key={shift.key} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#F8FAFC" }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.text, marginBottom: 4 }}>{shift.label} Template Match</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: match?.template ? C.pri : C.dan }}>
                {match?.template ? `Matched: ${template}` : "No matching template"}
              </div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 4, lineHeight: 1.45 }}>
                {match?.template ? `Reason: ${match.explanation}` : match?.explanation}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Btn variant="primary" size="sm" onClick={() => onGenerate(staffingMatrix, matches)} disabled={disabled}>
          Generate From Staffing Matrix
        </Btn>
        <span style={{ fontSize: 11, color: C.textMut, lineHeight: 1.5 }}>
          Names and one-off time changes stay optional and can be adjusted below after generation.
        </span>
      </div>
    </div>
  );
}

function StaffShiftPlanner({ day, rotation, matrixMode, onSave, onGenerated, disabled }) {
  const existingEntries = useMemo(() => getShiftEntries(day?.staffPlan), [day?.date, day?.staffPlan]);
  const [shiftEntries, setShiftEntries] = useState(existingEntries.length ? existingEntries : [createDefaultShiftEntry(day)]);
  const [dirty, setDirty] = useState(false);

  React.useEffect(() => {
    const nextEntries = existingEntries.length ? existingEntries : [createDefaultShiftEntry(day)];
    setShiftEntries(nextEntries);
    setDirty(false);
  }, [day?.date, day?.staffPlan, existingEntries]);

  const updateEntry = (id, patch) => {
    setShiftEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    setDirty(true);
  };

  const removeEntry = (id) => {
    setShiftEntries((current) => current.filter((entry) => entry.id !== id));
    setDirty(true);
  };

  const addEntry = () => {
    setShiftEntries((current) => [...current, createDefaultShiftEntry(day)]);
    setDirty(true);
  };

  const buildPlanFromEntries = (entries) => {
    const cleaned = entries
      .map((entry) => ({
        ...entry,
        name: String(entry.name || "").trim(),
        shift_start: String(entry.shift_start || "").slice(0, 5),
        shift_end: String(entry.shift_end || "").slice(0, 5),
      }))
      .filter((entry) => entry.shift_start && entry.shift_end);

    return deriveStaffPlanFromShiftEntries({
      locationId: day?.matrix?.location_id,
      planDate: day.date,
      shiftEntries: cleaned,
    });
  };

  const handleSave = () => {
    const plan = buildPlanFromEntries(shiftEntries);

    onSave(plan);
    setDirty(false);
    onGenerated?.();
  };

  const handleGenerateFromMatrix = (staffingMatrix, templateMatches) => {
    const generatedEntries = buildShiftEntriesFromStaffingMatrix(day, staffingMatrix);
    setShiftEntries(generatedEntries);
    const plan = buildPlanFromEntries(generatedEntries);
    onSave(plan);
    setDirty(false);
    onGenerated?.(templateMatches);
  };

  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "inherit",
    background: C.surface,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StaffingMatrixGenerator
        day={day}
        rotation={rotation}
        matrixMode={matrixMode}
        onGenerate={handleGenerateFromMatrix}
        disabled={disabled}
      />
      <div style={{ height: 1, background: C.borderLight, margin: "2px 0" }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 4 }}>Shift Details</div>
        <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45 }}>
          Use this table for optional names, custom roles, and start/end micro-adjustments after the staffing matrix creates the base plan.
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 620 }}>
          <thead>
            <tr>
              {["Position", "Name", "Shift Start", "Shift End", ""].map((label) => (
                <th
                  key={label || "actions"}
                  style={{
                    padding: "8px 10px",
                    textAlign: label === "" ? "right" : "left",
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: C.textMut,
                    background: "#F8FAFC",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shiftEntries.map((entry) => (
              <tr key={entry.id}>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <select value={entry.position} onChange={(e) => updateEntry(entry.id, { position: e.target.value })} style={inputStyle} disabled={disabled}>
                    {SHIFT_POSITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <input value={entry.name} onChange={(e) => updateEntry(entry.id, { name: e.target.value })} placeholder="Optional name" style={inputStyle} disabled={disabled} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <input type="time" value={entry.shift_start} onChange={(e) => updateEntry(entry.id, { shift_start: e.target.value })} style={inputStyle} disabled={disabled} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <input type="time" value={entry.shift_end} onChange={(e) => updateEntry(entry.id, { shift_end: e.target.value })} style={inputStyle} disabled={disabled} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}`, textAlign: "right" }}>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    disabled={disabled || shiftEntries.length === 1}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <button
          onClick={addEntry}
          disabled={disabled}
          style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Add Shift
        </button>
        {dirty && <span style={{ fontSize: 11, color: C.warn }}>Unsaved shift edits</span>}
        <div style={{ flex: 1 }} />
        <Btn variant="primary" size="sm" onClick={handleSave} disabled={disabled}>
          Save Shifts & Generate Actual Staffing Schedule
        </Btn>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function SchedulingPage({ data, nav, profile, addGlobalToast }) {
  const locationId = profile?.location_id;
  const { showSchedulingWeather } = useWeatherDisplaySettings(locationId || "cherry-hill");
  const today = todayStr();
  const [viewStartDate, setViewStartDate] = useState(getMondayStart(today));
  const [matrixRangeMode, setMatrixRangeMode] = useState("week");
  const [customStartDate, setCustomStartDate] = useState(getMondayStart(today));
  const [customEndDate, setCustomEndDate] = useState(addDays(getMondayStart(today), 6));
  const [matrixPage, setMatrixPage] = useState(0);
  const [matrixMode, setMatrixMode] = useState("current");
  const [expandedMonthSegments, setExpandedMonthSegments] = useState(new Set());
  const [activeSchedulingTab, setActiveSchedulingTab] = useState(getInitialSchedulingTab);
  const [forecastDetailsExpanded, setForecastDetailsExpanded] = useState(false);
  const [headcountExpanded, setHeadcountExpanded] = useState(false);
  const demandRange = useMemo(
    () => getDemandRange(matrixRangeMode, viewStartDate, customStartDate, customEndDate),
    [matrixRangeMode, viewStartDate, customStartDate, customEndDate],
  );
  const schedulingDataOptions = useMemo(() => ({
    endDate: demandRange.endDate,
    projectionScopeDateFrom: demandRange.startDate,
    projectionScopeDateTo: demandRange.endDate,
    recomputeLimitDays: 14,
  }), [demandRange.startDate, demandRange.endDate]);

  const {
    weekData,
    config,
    loading,
    error,
    refresh,
    upsertStaffPlan,
    saveSchedule,
    publishSchedule,
    applyScheduleOverride,
    fetchScheduleVersions,
    fetchScheduleVersionSummaries,
    computeRotationSchedule,
  } = useSchedulingData(locationId, demandRange.startDate, schedulingDataOptions);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [selectedDateTarget, setSelectedDateTarget] = useState(today);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const handleSchedulingTabChange = useCallback((nextTab) => {
    const normalized = nextTab === "rotation" ? "rotation" : "volume";
    setActiveSchedulingTab(normalized);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (normalized === "volume") url.searchParams.delete("tab");
    else url.searchParams.set("tab", normalized);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const [scheduleView, setScheduleView] = useState("optimal");
  const [expandedMatrixGroups, setExpandedMatrixGroups] = useState(new Set());
  const appliedDefaultMatrixGroupsRef = useRef(false);
  const [copyNarrativeStatus, setCopyNarrativeStatus] = useState("idle");
  const [matrixExportState, setMatrixExportState] = useState({ status: "idle", message: "" });
  const [locationMeta, setLocationMeta] = useState(null);
  const [matrixHistoryOrigin, setMatrixHistoryOrigin] = useState({
    status: "idle",
    message: "",
    firstDate: null,
    lastDate: null,
    source: null,
  });
  const [matrixBackfillState, setMatrixBackfillState] = useState({
    status: "idle",
    message: "",
    runId: null,
    completedDays: 0,
    totalDays: 0,
  });
  const readableLocationName = useMemo(
    () => resolveSchedulingLocationName({ profile, locationMeta, locationId }),
    [locationId, locationMeta, profile?.location, profile?.locationName, profile?.location_name, profile?.resort_name],
  );

  useEffect(() => {
    let cancelled = false;
    setLocationMeta(null);
    if (!isUuid(locationId)) return () => {
      cancelled = true;
    };

    supabase
      .from("locations")
      .select("*")
      .eq("id", locationId)
      .maybeSingle()
      .then(({ data: row, error: locationError }) => {
        if (cancelled) return;
        setLocationMeta(locationError ? null : row || null);
      });

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  useEffect(() => {
    setMatrixExportState((current) => (
      current.status === "idle" ? current : { status: "idle", message: "" }
    ));
    setMatrixBackfillState({
      status: "idle",
      message: "",
      runId: null,
      completedDays: 0,
      totalDays: 0,
    });
  }, [locationId, demandRange.startDate, demandRange.endDate]);

  useEffect(() => {
    setMatrixHistoryOrigin({
      status: "idle",
      message: "",
      firstDate: null,
      lastDate: null,
      source: null,
    });
  }, [locationId]);

  // Version & override state
  const [savedVersions, setSavedVersions] = useState([]);
  const [activeScheduleId, setActiveScheduleId] = useState(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // { laneId, slotTime, rect }
  const [overrideTask, setOverrideTask] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [localGrid, setLocalGrid] = useState(null); // For live override preview
  const [optimalRotation, setOptimalRotation] = useState(null);
  const [actualRotation, setActualRotation] = useState(null);
  const [rotationLoading, setRotationLoading] = useState(false);
  const [rotationError, setRotationError] = useState(null);
  const [dragFillState, setDragFillState] = useState(null); // { laneId, startSlot, task, notes }

  const workbookDays = useMemo(
    () => weekData.map(day => ({
      ...day,
      currentDisplay: getMatrixDisplay(day.matrix),
      projectedDisplay: getMatrixProjectedDisplay(day.matrix),
      projection: getMatrixProjection(day.matrix),
      comparison: getMatrixComparison(day.matrix),
    })),
    [weekData]
  );
  const demandRangeDates = useMemo(
    () => buildSchedulingDateRange(demandRange.startDate, demandRange.endDate),
    [demandRange.startDate, demandRange.endDate],
  );
  const matrixRangeReadiness = useMemo(() => buildDemandMatrixRangeReadiness({
    days: workbookDays,
    expectedDates: demandRangeDates,
    loading,
    error,
    today,
  }), [workbookDays, demandRangeDates, loading, error, today]);
  const matrixExportReady = matrixRangeReadiness.status === "ready";
  const historicalBackfillAvailable = demandRange.endDate < today && matrixRangeReadiness.missingDays.length > 0;
  const backfillRunning = ["queued", "running", "starting"].includes(matrixBackfillState.status);
  const refreshMatrixBackfillStatus = useCallback(async (runId) => {
    if (!runId) return null;
    const { data: statusData, error: statusError } = await supabase.functions.invoke("scheduling-matrix-backfill", {
      body: {
        action: "status",
        run_id: runId,
      },
    });
    if (statusError || statusData?.error) {
      throw new Error(statusError?.message || statusData?.error || "Failed to load historical matrix backfill status.");
    }

    const run = statusData?.run || {};
    const coverage = statusData?.coverage || run.coverage_snapshot || {};
    const completedDays = Number(coverage.computed_days ?? run.completed_days ?? 0);
    const totalDays = Number(coverage.expected_days ?? run.total_days ?? 0);
    const status = run.status || "running";
    const message = status === "complete"
      ? `Historical matrix backfill complete: ${completedDays}/${totalDays} computed days.`
      : status === "failed"
        ? `Historical matrix backfill failed: ${run.error_message || "See backfill run details."}`
        : `Historical matrix backfill running: ${completedDays}/${totalDays} computed days.`;

    setMatrixBackfillState({
      status,
      message,
      runId,
      completedDays,
      totalDays,
    });

    if (status === "complete") {
      await refresh();
      addGlobalToast?.(message, "success");
    }

    return { run, coverage };
  }, [addGlobalToast, refresh]);

  const startHistoricalMatrixBackfill = useCallback(async () => {
    if (!historicalBackfillAvailable || backfillRunning) return;
    setMatrixBackfillState({
      status: "starting",
      message: "Starting historical matrix backfill...",
      runId: null,
      completedDays: matrixRangeReadiness.computedMatrixRowCount,
      totalDays: matrixRangeReadiness.expectedDayCount,
    });

    try {
      const { data: startData, error: startError } = await supabase.functions.invoke("scheduling-matrix-backfill", {
        body: {
          action: "start",
          location_id: locationId,
          date_from: demandRange.startDate,
          date_to: demandRange.endDate,
          batch_size: 14,
          mode: "historical_location_bootstrap",
        },
      });
      if (startError || startData?.error) {
        throw new Error(startError?.message || startData?.error || "Failed to start historical matrix backfill.");
      }

      const run = startData?.run || {};
      const coverage = startData?.coverage || {};
      const completedDays = Number(coverage.computed_days ?? run.completed_days ?? 0);
      const totalDays = Number(coverage.expected_days ?? run.total_days ?? 0);
      const status = run.status || "queued";
      const message = status === "complete"
        ? `Historical matrix backfill complete: ${completedDays}/${totalDays} computed days.`
        : `Historical matrix backfill queued: ${completedDays}/${totalDays} computed days.`;

      setMatrixBackfillState({
        status,
        message,
        runId: run.id || null,
        completedDays,
        totalDays,
      });
      addGlobalToast?.(message, status === "complete" ? "success" : "info");
      if (status === "complete") await refresh();
    } catch (backfillError) {
      const message = backfillError?.message || "Failed to start historical matrix backfill.";
      setMatrixBackfillState({
        status: "failed",
        message,
        runId: null,
        completedDays: matrixRangeReadiness.computedMatrixRowCount,
        totalDays: matrixRangeReadiness.expectedDayCount,
      });
      addGlobalToast?.(message, "error");
    }
  }, [
    addGlobalToast,
    backfillRunning,
    demandRange.endDate,
    demandRange.startDate,
    historicalBackfillAvailable,
    locationId,
    matrixRangeReadiness.computedMatrixRowCount,
    matrixRangeReadiness.expectedDayCount,
    refresh,
  ]);

  useEffect(() => {
    if (!matrixBackfillState.runId || !backfillRunning || matrixBackfillState.status === "starting") return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await refreshMatrixBackfillStatus(matrixBackfillState.runId);
        if (!cancelled && result?.run?.status && !["queued", "running"].includes(result.run.status)) {
          return false;
        }
      } catch (pollError) {
        if (!cancelled) {
          setMatrixBackfillState((current) => ({
            ...current,
            status: "failed",
            message: pollError?.message || "Failed to refresh historical matrix backfill status.",
          }));
        }
        return false;
      }
      return true;
    };
    const intervalId = window.setInterval(() => {
      poll();
    }, 5000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [backfillRunning, matrixBackfillState.runId, matrixBackfillState.status, refreshMatrixBackfillStatus]);
  const matrixColumnState = useMemo(() => buildMatrixColumns({
    days: workbookDays,
    rangeMode: matrixRangeMode,
    rangeStart: demandRange.startDate,
    rangeEnd: demandRange.endDate,
    expandedMonthSegments,
    page: matrixPage,
    pageSize: MATRIX_PAGE_SIZE,
  }), [workbookDays, matrixRangeMode, demandRange.startDate, demandRange.endDate, expandedMonthSegments, matrixPage]);
  const matrixPageCount = matrixColumnState.pageCount;
  const visibleMatrixColumns = matrixColumnState.columns;
  const visibleMatrixDays = matrixColumnState.visibleDays;
  const visibleWeatherRange = useMemo(() => {
    const ordered = [...(visibleMatrixDays || [])]
      .map((day) => day?.date)
      .filter(Boolean)
      .sort();
    return {
      startDate: ordered[0] || null,
      endDate: ordered[ordered.length - 1] || null,
    };
  }, [visibleMatrixDays]);
  const {
    rows: weatherRows,
  } = useWeatherData(
    locationId,
    demandRangeDates.length <= 370 ? demandRange.startDate : visibleWeatherRange.startDate,
    demandRangeDates.length <= 370 ? demandRange.endDate : visibleWeatherRange.endDate,
    {
      enabled: showSchedulingWeather && activeSchedulingTab === "volume" && Boolean(visibleWeatherRange.startDate && visibleWeatherRange.endDate),
    },
  );
  const weatherRowsByDate = useMemo(() => {
    if (!showSchedulingWeather) return new Map();
    return new Map((weatherRows || []).map((row) => [String(row.weather_date || "").slice(0, 10), row]));
  }, [showSchedulingWeather, weatherRows]);
  const attachWeatherToDay = useCallback((day) => ({
    ...day,
    weather: showSchedulingWeather ? weatherRowsByDate.get(String(day?.date || "").slice(0, 10)) || null : null,
  }), [showSchedulingWeather, weatherRowsByDate]);
  const visibleMatrixDaysWithWeather = useMemo(() => (visibleMatrixDays || []).map(attachWeatherToDay), [attachWeatherToDay, visibleMatrixDays]);
  const workbookDaysWithWeather = useMemo(() => (workbookDays || []).map(attachWeatherToDay), [attachWeatherToDay, workbookDays]);
  const selectedDay = workbookDays[selectedDayIdx] || workbookDays[0];
  const visibleMatrixColumnsWithWeather = useMemo(() => (visibleMatrixColumns || []).map((column) => ({
    ...column,
    day: column.day ? attachWeatherToDay(column.day) : column.day,
    days: Array.isArray(column.days) ? column.days.map(attachWeatherToDay) : column.days,
  })), [attachWeatherToDay, visibleMatrixColumns]);
  const narrativeDays = matrixRangeMode === "week" ? workbookDays : visibleMatrixDays;
  const schedulingNarrativeText = useMemo(() => buildSchedulingNarrative(narrativeDays), [narrativeDays]);
  const schedulingNarrativeHtml = useMemo(() => buildSchedulingNarrativeHtml(narrativeDays), [narrativeDays]);
  const matrixRowGroups = useMemo(() => {
    const groups = buildDemandMatrixRowGroups(visibleMatrixDaysWithWeather);
    return showSchedulingWeather ? groups : groups.filter((group) => group.section !== "Weather Data");
  }, [showSchedulingWeather, visibleMatrixDaysWithWeather]);
  const allMatrixGroupsExpanded = matrixRowGroups.length > 0 && matrixRowGroups.every((group) => expandedMatrixGroups.has(group.section));
  useEffect(() => {
    if (appliedDefaultMatrixGroupsRef.current) return;
    const defaultExpandedSections = matrixRowGroups
      .filter((group) => group.defaultExpanded)
      .map((group) => group.section);
    if (!defaultExpandedSections.length) return;
    setExpandedMatrixGroups((current) => new Set([...current, ...defaultExpandedSections]));
    appliedDefaultMatrixGroupsRef.current = true;
  }, [matrixRowGroups]);
  const toggleMonthSegment = useCallback((segmentId) => {
    setExpandedMonthSegments((current) => {
      const next = new Set(current);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
  }, []);
  const toggleMatrixGroup = useCallback((section) => {
    setExpandedMatrixGroups((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);
  const toggleAllMatrixGroups = useCallback(() => {
    setExpandedMatrixGroups(allMatrixGroupsExpanded ? new Set() : new Set(matrixRowGroups.map((group) => group.section)));
  }, [allMatrixGroupsExpanded, matrixRowGroups]);
  const selectedShiftEntries = useMemo(() => getShiftEntries(selectedDay?.staffPlan), [selectedDay?.staffPlan]);
  const visibleRotation = scheduleView === "actual_staffing" && actualRotation ? actualRotation : optimalRotation;
  const hasAdjustedSchedule = !!actualRotation;
  const showingAdjustedSchedule = scheduleView === "actual_staffing" && hasAdjustedSchedule;

  React.useEffect(() => {
    let cancelled = false;
    async function loadRotationSchedules() {
      if (!selectedDay?.date || !selectedDay?.matrix || !selectedDay?.canGenerate) {
        setOptimalRotation(null);
        setActualRotation(null);
        return;
      }
      setRotationLoading(true);
      setRotationError(null);
      try {
        const optimal = await computeRotationSchedule({
          scheduleDate: selectedDay.date,
          mode: "optimal",
        });
        if (cancelled) return;
        setOptimalRotation(optimal);

        if (selectedDay?.staffPlan) {
          const actual = await computeRotationSchedule({
            scheduleDate: selectedDay.date,
            mode: "actual_staffing",
          });
          if (cancelled) return;
          setActualRotation(actual);
        } else {
          setActualRotation(null);
        }
      } catch (err) {
        if (cancelled) return;
        setRotationError(err?.message || "Failed to compute BE rotation schedule");
      } finally {
        if (!cancelled) setRotationLoading(false);
      }
    }

    loadRotationSchedules();
    return () => {
      cancelled = true;
    };
  }, [selectedDay?.date, selectedDay?.matrix?.computed_at, selectedDay?.staffPlan?.updated_at, selectedDay?.canGenerate, computeRotationSchedule]);

  // Reset override state when day changes
  const prevDayRef = React.useRef(selectedDayIdx);
  React.useEffect(() => {
    if (prevDayRef.current !== selectedDayIdx) {
      setOverrideMode(false);
      setSelectedCell(null);
      setLocalGrid(null);
      setDragFillState(null);
      setActiveScheduleId(null);
      setSavedVersions([]);
      setScheduleView("optimal");
      prevDayRef.current = selectedDayIdx;
    }
  }, [selectedDayIdx]);

  React.useEffect(() => {
    const targetDate = selectedDateTarget >= demandRange.startDate && selectedDateTarget <= demandRange.endDate
      ? selectedDateTarget
      : today;
    const nextIndex = dateIndexInRange(demandRange.startDate, demandRange.endDate, targetDate);
    setSelectedDayIdx(nextIndex);
    setMatrixPage(0);
    setExpandedMonthSegments(new Set());
  }, [demandRange.startDate, demandRange.endDate, selectedDateTarget, today]);

  React.useEffect(() => {
    if (matrixPage >= matrixPageCount) {
      setMatrixPage(Math.max(0, matrixPageCount - 1));
    }
  }, [matrixPage, matrixPageCount]);

  const copyNarrativeTimerRef = React.useRef(null);
  React.useEffect(() => () => {
    if (copyNarrativeTimerRef.current) {
      window.clearTimeout(copyNarrativeTimerRef.current);
    }
  }, []);

  const handleCopySchedulingNarrative = useCallback(async () => {
    if (!schedulingNarrativeText) {
      addGlobalToast?.("No week narrative available yet", "info");
      return;
    }

    try {
      await copySchedulingNarrativeToClipboard({
        text: schedulingNarrativeText,
        html: schedulingNarrativeHtml,
      });
      setCopyNarrativeStatus("copied");
      addGlobalToast?.("Scheduling narrative copied", "success");
      if (copyNarrativeTimerRef.current) {
        window.clearTimeout(copyNarrativeTimerRef.current);
      }
      copyNarrativeTimerRef.current = window.setTimeout(() => {
        setCopyNarrativeStatus("idle");
        copyNarrativeTimerRef.current = null;
      }, 1600);
    } catch (err) {
      setCopyNarrativeStatus("error");
      addGlobalToast?.("Copy failed: " + (err.message || "clipboard unavailable"), "error");
      if (copyNarrativeTimerRef.current) {
        window.clearTimeout(copyNarrativeTimerRef.current);
      }
      copyNarrativeTimerRef.current = window.setTimeout(() => {
        setCopyNarrativeStatus("idle");
        copyNarrativeTimerRef.current = null;
      }, 1800);
    }
  }, [schedulingNarrativeText, schedulingNarrativeHtml, addGlobalToast]);

  const handleExportDemandMatrixXlsx = useCallback(async () => {
    if (!matrixExportReady) {
      const message = matrixRangeReadiness.reason || "Export is blocked until every selected day has a computed Demand Matrix row.";
      setMatrixExportState({ status: "blocked", message });
      addGlobalToast?.(message, matrixRangeReadiness.status === "failed" ? "error" : "info");
      return;
    }

    const generatedAt = new Date().toISOString();
    const model = buildDemandMatrixExportModel({
      days: workbookDaysWithWeather,
      expectedDates: demandRangeDates,
      startDate: demandRange.startDate,
      endDate: demandRange.endDate,
      locationId,
      locationName: readableLocationName,
      generatedAt,
      readiness: matrixRangeReadiness,
    });

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    setMatrixExportState({
      status: "running",
      message: `Generating XLSX with ${model.days.length} day column${model.days.length === 1 ? "" : "s"} and ${model.rows.filter((row) => row.type === "metric").length} matrix rows.`,
    });

    try {
      const blob = await createDemandMatrixXlsxBlob(model);
      const elapsedMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
      downloadBlob(blob, buildDemandMatrixExportFilename(model));
      const message = `XLSX export complete: ${model.days.length} day column${model.days.length === 1 ? "" : "s"}, actual/current canonical values only.`;
      setMatrixExportState({ status: "complete", message: `${message} Generated in ${elapsedMs}ms.` });
      addGlobalToast?.(message, "success");
    } catch (err) {
      const detail = err?.message || "XLSX generation failed";
      const message = `XLSX export failed: ${detail}. If this range keeps failing in-browser, use an async server artifact job instead.`;
      setMatrixExportState({ status: "failed", message });
      addGlobalToast?.(message, "error");
    }
  }, [
    addGlobalToast,
    demandRange.endDate,
    demandRange.startDate,
    demandRangeDates,
    locationId,
    matrixExportReady,
    matrixRangeReadiness,
    readableLocationName,
    workbookDaysWithWeather,
  ]);

  const handleStaffPlanSave = useCallback(async (plan) => {
    try {
      await upsertStaffPlan(plan);
      setScheduleView("actual_staffing");
      addGlobalToast?.("Staff plan saved", "success");
    } catch (err) {
      addGlobalToast?.("Failed to save staff plan: " + (err.message || "unknown error"), "error");
    }
  }, [upsertStaffPlan, addGlobalToast]);

  // Save currently visible schedule
  const handleGenerate = useCallback(async () => {
    if (!selectedDay?.canGenerate || !visibleRotation?.saveable_payload) {
      const blocker = selectedDay?.generationBlockers?.[0];
      addGlobalToast?.(formatVisibleSchedulingCopy(blocker || "This day is not ready for schedule generation yet."), "info");
      return;
    }
    try {
      const payload = localGrid
        ? {
          ...visibleRotation.saveable_payload,
          grid: localGrid,
        }
        : visibleRotation.saveable_payload;
      const result = await saveSchedule(payload);
      setActiveScheduleId(result.id);
      setLocalGrid(null);
      addGlobalToast?.(`Schedule saved as draft v${result.version}: ${showingAdjustedSchedule ? "Actual Staffing" : "Optimal"} view`, "success");

      // Refresh versions
      const versions = await fetchScheduleVersions(selectedDay.date);
      setSavedVersions(versions);
    } catch (err) {
      if (err?.code === "42P01") {
        addGlobalToast?.(`Schedule generated locally (table not deployed yet): ${showingAdjustedSchedule ? "Actual Staffing" : "Optimal"} view`, "success");
      } else {
        addGlobalToast?.("Failed to save schedule: " + (err.message || "unknown error"), "error");
      }
    }
  }, [selectedDay, visibleRotation, localGrid, showingAdjustedSchedule, saveSchedule, fetchScheduleVersions, addGlobalToast]);

  // Publish schedule
  const handlePublish = useCallback(async (scheduleId) => {
    try {
      const result = await publishSchedule(scheduleId || activeScheduleId);
      addGlobalToast?.(`Schedule v${result.version} published`, "success");
      const versions = await fetchScheduleVersions(selectedDay.date);
      setSavedVersions(versions);
    } catch (err) {
      if (err?.code === "42P01") {
        addGlobalToast?.("Publish skipped — rotation_schedules table not deployed yet", "info");
      } else {
        addGlobalToast?.("Failed to publish: " + (err.message || "unknown error"), "error");
      }
    }
  }, [publishSchedule, activeScheduleId, fetchScheduleVersions, selectedDay, addGlobalToast]);

  const handleRangeModeChange = useCallback((mode) => {
    setMatrixRangeMode(mode);
    setMatrixPage(0);
    if (mode === "week") {
      setViewStartDate(getMondayStart(viewStartDate));
    } else if (mode === "month") {
      setViewStartDate(getMonthStart(viewStartDate));
    } else if (mode === "year") {
      setViewStartDate(getYearStart(viewStartDate));
    } else if (mode === "custom") {
      setCustomStartDate(demandRange.startDate);
      setCustomEndDate(demandRange.endDate);
      setViewStartDate(demandRange.startDate);
    }
  }, [viewStartDate, demandRange.startDate, demandRange.endDate]);

  const handleRotationDateSelect = useCallback((date) => {
    if (!date) return;
    const weekStart = getMondayStart(date);
    const weekEnd = addDays(weekStart, 6);
    setSelectedDateTarget(date);
    setMatrixRangeMode("week");
    setViewStartDate(weekStart);
    setCustomStartDate(weekStart);
    setCustomEndDate(weekEnd);
    setSelectedDayIdx(dateIndexInRange(weekStart, weekEnd, date));
    setMatrixPage(0);
    setExpandedMonthSegments(new Set());
  }, []);

  const applyCustomRange = useCallback((startDate, endDate) => {
    const cleanStart = startDate || today;
    const cleanEnd = endDate && endDate >= cleanStart ? endDate : cleanStart;
    setCustomStartDate(cleanStart);
    setCustomEndDate(cleanEnd);
    setViewStartDate(cleanStart);
    setMatrixPage(0);
  }, [today]);

  const applyAllHistoricalRange = useCallback(async () => {
    if (!locationId) {
      const message = "Select a location before loading all historical Scheduling Demand Matrix data.";
      setMatrixHistoryOrigin({ status: "failed", message, firstDate: null, lastDate: null, source: null });
      addGlobalToast?.(message, "error");
      return;
    }

    setMatrixHistoryOrigin({
      status: "checking",
      message: "Finding earliest operational Gingr reservation day for this location...",
      firstDate: null,
      lastDate: null,
      source: null,
    });

    try {
      const { data: originData, error: originError } = await supabase.functions.invoke("scheduling-matrix-backfill", {
        body: {
          action: "origin",
          location_id: locationId,
        },
      });
      if (originError || originData?.error) {
        throw new Error(originError?.message || originData?.error || "Failed to find historical Scheduling Demand Matrix origin.");
      }

      const origin = originData?.origin || {};
      const firstDate = origin.first_operational_date;
      const lastDate = origin.last_historical_date;
      if (!firstDate || !lastDate) {
        throw new Error("No operational Gingr reservation history was found for this location.");
      }

      setMatrixRangeMode("custom");
      applyCustomRange(firstDate, lastDate);
      const dayCount = buildSchedulingDateRange(firstDate, lastDate).length;
      const message = `All history selected for ${readableLocationName}: ${firstDate} through ${lastDate} (${dayCount} days).`;
      setMatrixHistoryOrigin({
        status: "ready",
        message,
        firstDate,
        lastDate,
        source: origin.source || "gingr_reservations",
      });
      addGlobalToast?.(message, "success");
    } catch (originError) {
      const message = originError?.message || "Failed to find historical Scheduling Demand Matrix origin.";
      setMatrixHistoryOrigin({ status: "failed", message, firstDate: null, lastDate: null, source: null });
      addGlobalToast?.(message, "error");
    }
  }, [addGlobalToast, applyCustomRange, locationId, readableLocationName]);

  const handleRangeJump = useCallback((delta) => {
    if (matrixRangeMode === "custom") {
      const start = new Date(`${customStartDate}T12:00:00`);
      const end = new Date(`${customEndDate}T12:00:00`);
      const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const nextStart = addDays(customStartDate, delta * spanDays);
      const nextEnd = addDays(customEndDate, delta * spanDays);
      applyCustomRange(nextStart, nextEnd);
      return;
    }
    setViewStartDate((current) => shiftDemandAnchor(matrixRangeMode, current, delta));
    setMatrixPage(0);
  }, [matrixRangeMode, customStartDate, customEndDate, applyCustomRange]);

  // Apply override
  const handleApplyOverride = useCallback(async () => {
    if (!selectedCell || !overrideTask) return;
    const { laneId, slotTime } = selectedCell;

    if (activeScheduleId) {
      try {
        await applyScheduleOverride(activeScheduleId, laneId, slotTime, overrideTask, overrideNotes);
        addGlobalToast?.(`Override applied: ${laneId} at ${slotTime} → ${TASK_COLORS[overrideTask]?.label || overrideTask}`, "success");
      } catch (err) {
        if (err?.code !== "42P01") {
          addGlobalToast?.("Failed to save override: " + (err.message || "unknown error"), "error");
        }
      }
    }

    const currentGrid = localGrid || visibleRotation?.grid?.cells || {};
    const result = applyOverride(currentGrid, laneId, slotTime, overrideTask, overrideNotes);
    setLocalGrid(result.grid);
    setSelectedCell(null);
    setOverrideTask("");
    setOverrideNotes("");
  }, [selectedCell, overrideTask, overrideNotes, activeScheduleId, localGrid, visibleRotation, applyScheduleOverride, addGlobalToast]);

  // Load versions for selected day
  const handleLoadVersions = useCallback(async () => {
    if (!selectedDay?.date) return;
    try {
      const versions = await fetchScheduleVersions(selectedDay.date);
      setSavedVersions(versions);
    } catch {
      // Silently handle if table not deployed
    }
  }, [selectedDay, fetchScheduleVersions]);

  React.useEffect(() => {
    if (activeSchedulingTab !== "rotation" || !selectedDay?.date) {
      setSavedVersions([]);
      return undefined;
    }

    let cancelled = false;
    fetchScheduleVersions(selectedDay.date)
      .then((versions) => {
        if (!cancelled) setSavedVersions(versions);
      })
      .catch(() => {
        if (!cancelled) setSavedVersions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSchedulingTab, fetchScheduleVersions, selectedDay?.date]);

  const handleCellSelect = useCallback((laneId, slotTime, rect) => {
    const currentGrid = localGrid || visibleRotation?.grid?.cells || {};
    const currentCell = currentGrid?.[laneId]?.[slotTime] || {};
    setSelectedCell({ laneId, slotTime, rect });
    setOverrideTask(currentCell?.task || "");
    setOverrideNotes(currentCell?.notes || "");
  }, [localGrid, visibleRotation]);

  const applyRangeOverride = useCallback(async ({ laneId, startSlot, endSlot, task, notes }) => {
    if (!laneId || !startSlot || !endSlot || !task) return;
    const slotTimes = (visibleRotation?.grid?.slots || []).map((slot) => slot.time);
    const startIndex = slotTimes.indexOf(startSlot);
    const endIndex = slotTimes.indexOf(endSlot);
    if (startIndex === -1 || endIndex === -1) return;

    const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    let nextGrid = { ...(localGrid || visibleRotation?.grid?.cells || {}) };
    for (let index = from; index <= to; index += 1) {
      const slotTime = slotTimes[index];
      const result = applyOverride(nextGrid, laneId, slotTime, task, notes);
      nextGrid = result.grid;
      if (activeScheduleId) {
        try {
          await applyScheduleOverride(activeScheduleId, laneId, slotTime, task, notes);
        } catch (err) {
          if (err?.code !== "42P01") {
            addGlobalToast?.("Failed to save drag-fill override: " + (err.message || "unknown error"), "error");
            break;
          }
        }
      }
    }
    setLocalGrid(nextGrid);
  }, [visibleRotation, localGrid, activeScheduleId, applyScheduleOverride, addGlobalToast]);

  React.useEffect(() => {
    if (!dragFillState) return undefined;
    const handleMouseUp = () => {
      const { laneId, startSlot, targetSlot, task, notes } = dragFillState;
      if (targetSlot && targetSlot !== startSlot) {
        applyRangeOverride({ laneId, startSlot, endSlot: targetSlot, task, notes });
      }
      setDragFillState(null);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragFillState, applyRangeOverride]);

  const openingFrame = visibleRotation?.shift_recommendations?.opening_shift || null;
  const closingFrame = visibleRotation?.shift_recommendations?.closing_shift || null;
  const actualOpeningCount = openingFrame ? countShiftCoverage(selectedShiftEntries.filter((entry) => entry.position === "pct"), openingFrame.start, openingFrame.end) : 0;
  const actualClosingCount = closingFrame ? countShiftCoverage(selectedShiftEntries.filter((entry) => entry.position === "pct"), closingFrame.start, closingFrame.end) : 0;
  const supportRoleSummary = summarizeSupportRoles(selectedShiftEntries);
  const openingHours = getShiftHourSummary(openingFrame, config.break_minutes);
  const closingHours = getShiftHourSummary(closingFrame, config.break_minutes);

  const display = selectedDay?.currentDisplay || getMatrixDisplay(selectedDay?.matrix || {});
  const projectedDisplay = selectedDay?.projectedDisplay || getMatrixProjectedDisplay(selectedDay?.matrix || {});
  const matrixDisplay = matrixMode === "projected" ? projectedDisplay : display;
  const visibleWarnings = (visibleRotation?.warnings || []).map(formatVisibleSchedulingCopy);
  const generateDisabled = !selectedDay?.canGenerate || !visibleRotation?.saveable_payload;
  const generateDisabledReason = formatVisibleSchedulingCopy(rotationError || selectedDay?.generationBlockers?.[0] || "This day is not ready for schedule generation yet.");
  const templateCatalogSummary = useMemo(() => getRotationTemplateCatalogSummary(), []);
  const openCapacitySettings = useCallback(() => {
    nav?.("settings");
    addGlobalToast?.("Open Scheduling Capacity in Settings > Operations.", "info");
  }, [addGlobalToast, nav]);
  const readinessTone = {
    checking: { bg: "#EFF6FF", color: C.pri, label: "Checking Coverage" },
    ready: { bg: C.sucLt, color: C.suc, label: "Ready" },
    blocked: { bg: C.danLt, color: C.dan, label: "Blocked" },
    failed: { bg: C.danLt, color: C.dan, label: "Failed" },
  }[matrixRangeReadiness.status] || { bg: "#F1F5F9", color: C.textMut, label: "Unknown" };
  const matrixExportRunning = matrixExportState.status === "running";
  const matrixExportDisabled = matrixRangeReadiness.status === "checking" || matrixExportRunning;
  const allHistorySelected = matrixRangeMode === "custom"
    && matrixHistoryOrigin.firstDate === demandRange.startDate
    && matrixHistoryOrigin.lastDate === demandRange.endDate;
  const displayedComputedMatrixDays = backfillRunning
    ? Math.min(
      matrixRangeReadiness.expectedDayCount,
      Math.max(matrixRangeReadiness.computedMatrixRowCount, matrixBackfillState.completedDays || 0),
    )
    : matrixRangeReadiness.computedMatrixRowCount;
  const displayedMissingMatrixDays = backfillRunning
    ? Math.max(0, matrixRangeReadiness.expectedDayCount - displayedComputedMatrixDays)
    : matrixRangeReadiness.missingDays.length;
  const readinessReasonText = backfillRunning
    ? `Historical matrix backfill running: ${displayedComputedMatrixDays}/${matrixRangeReadiness.expectedDayCount} computed days. Export unlocks after every selected day has a persisted Demand Matrix row.`
    : matrixRangeReadiness.reason;

  const gridData = visibleRotation?.grid || { lanes: [], slots: [], cells: {} };
  const { lanes, slots, cells: serverGrid } = gridData;
  const orderedLanes = useMemo(() => sortRotationLanes(lanes), [lanes]);

  const fmt12 = (t) => {
    const [h, mn] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(mn).padStart(2, "0")} ${suffix}`;
  };
  const rowH = 46;

  if (loading && weekData.length === 0) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 0", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: C.textMut }}>Loading scheduling data...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 8px 48px" }}>
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Scheduling</h1>
          <p style={{ fontSize: 13, color: C.textMut, marginTop: 2 }}>Volume pressure, capacity risk, and backend rotation planning</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {error && <span style={{ fontSize: 11, color: C.dan }}>{error}</span>}
          <Btn variant="secondary" size="sm" onClick={refresh}>Refresh</Btn>
          <Btn variant="secondary" size="sm" onClick={() => setShowAssumptions(!showAssumptions)}>
            {showAssumptions ? "Hide" : "Show"} Assumptions
          </Btn>
        </div>
      </div>
      <SchedulingSubtabs activeTab={activeSchedulingTab} onChange={handleSchedulingTabChange} />

      {/* ── Section 1: Demand Matrix ──────────────────────────────────── */}
      {activeSchedulingTab === "volume" && (
      <SectionCard title={matrixRangeMode === "week" ? "7-Day Demand Matrix" : "Demand Matrix"} subtitle="Days are columns. Rows separate boarding, daytime dogs, daily volume, departures, total daily volume, play demand, ancillary work, and history." icon={<I.Calendar />}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "week", label: "Week" },
                { id: "month", label: "Month" },
                { id: "year", label: "Year" },
                { id: "custom", label: "Custom" },
              ].map((option) => (
                <button
                key={option.id}
                onClick={() => handleRangeModeChange(option.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${matrixRangeMode === option.id ? C.pri : C.border}`,
                  background: matrixRangeMode === option.id ? C.priLt : C.surface,
                  color: matrixRangeMode === option.id ? C.pri : C.textMut,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={applyAllHistoricalRange}
              disabled={matrixHistoryOrigin.status === "checking"}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${allHistorySelected ? C.pri : C.border}`,
                background: allHistorySelected ? C.priLt : C.surface,
                color: allHistorySelected ? C.pri : C.textMut,
                fontSize: 11,
                fontWeight: 800,
                cursor: matrixHistoryOrigin.status === "checking" ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: matrixHistoryOrigin.status === "checking" ? 0.7 : 1,
              }}
            >
              {matrixHistoryOrigin.status === "checking" ? "Finding History..." : "All History"}
            </button>
            {matrixRangeMode === "custom" && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                padding: "8px 10px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#F8FAFC",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(160px, 1fr)", gap: 8, alignItems: "start" }}>
                  <CalendarPicker
                    label="Start"
                    value={customStartDate}
                    onChange={(value) => applyCustomRange(value, customEndDate)}
                  />
                  <CalendarPicker
                    label="End"
                    value={customEndDate}
                    min={customStartDate}
                    onChange={(value) => applyCustomRange(customStartDate, value)}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  {[
                    { label: "This week", start: getMondayStart(today), end: addDays(getMondayStart(today), 6) },
                    { label: "Next week", start: addDays(getMondayStart(today), 7), end: addDays(getMondayStart(today), 13) },
                    { label: "This month", start: getMonthStart(today), end: getMonthEnd(today) },
                    { label: "Next 30", start: today, end: addDays(today, 29) },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyCustomRange(preset.start, preset.end)}
                      style={{
                        padding: "6px 9px",
                        borderRadius: 999,
                        border: `1px solid ${C.borderLight}`,
                        background: C.surface,
                        color: C.textSec,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Btn variant="secondary" size="sm" onClick={() => handleRangeJump(-1)}>← Previous</Btn>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{formatDemandRangeLabel(demandRange.startDate, demandRange.endDate)}</div>
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => {
                const monday = getMondayStart(today);
                setViewStartDate(matrixRangeMode === "week" ? monday : today);
                if (matrixRangeMode === "custom") {
                  setCustomStartDate(monday);
                  setCustomEndDate(addDays(monday, 6));
                }
              }}
            >
              This Period
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => handleRangeJump(1)}>Next →</Btn>
            {loading && <span style={{ fontSize: 11, color: C.textMut }}>Loading range…</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={handleExportDemandMatrixXlsx}
              disabled={matrixExportDisabled}
              title={matrixRangeReadiness.reason}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${matrixExportReady ? C.suc : C.border}`,
                background: matrixExportReady ? C.sucLt : C.surface,
                color: matrixExportReady ? C.suc : C.text,
                fontSize: 11,
                fontWeight: 800,
                cursor: matrixExportDisabled ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: matrixExportDisabled ? 0.6 : 1,
              }}
            >
              <span style={{ display: "flex" }}>{matrixExportRunning ? <I.RefreshCw /> : <I.Download />}</span>
              {matrixExportRunning ? "Exporting..." : "Export XLSX"}
            </button>
            <button
              onClick={handleCopySchedulingNarrative}
              disabled={!schedulingNarrativeText || loading}
              title="Copy week narrative"
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${copyNarrativeStatus === "copied" ? C.suc : copyNarrativeStatus === "error" ? C.dan : C.border}`,
                background: copyNarrativeStatus === "copied" ? C.sucLt : copyNarrativeStatus === "error" ? C.danLt : C.surface,
                color: copyNarrativeStatus === "copied" ? C.suc : copyNarrativeStatus === "error" ? C.dan : C.text,
                fontSize: 11,
                fontWeight: 800,
                cursor: !schedulingNarrativeText || loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: !schedulingNarrativeText || loading ? 0.55 : 1,
                transform: copyNarrativeStatus === "copied" ? "translateY(-1px) scale(1.04)" : "translateY(0) scale(1)",
                boxShadow: copyNarrativeStatus === "copied"
                  ? "0 0 0 4px rgba(34, 197, 94, 0.16), 0 12px 24px rgba(15, 23, 42, 0.14)"
                  : "0 0 0 0 rgba(34, 197, 94, 0)",
                transition: "transform 0.18s ease, box-shadow 0.22s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease",
              }}
            >
              <span style={{ display: "flex", transition: "transform 0.18s ease", transform: copyNarrativeStatus === "copied" ? "rotate(-8deg) scale(1.15)" : "none" }}>
                {copyNarrativeStatus === "copied" ? <I.Check /> : <I.Clipboard />}
              </span>
              {copyNarrativeStatus === "copied" ? "Copied" : copyNarrativeStatus === "error" ? "Copy Failed" : "Copy Narrative"}
              {copyNarrativeStatus === "copied" && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -28,
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: C.text,
                    color: "#FFFFFF",
                    fontSize: 10,
                    fontWeight: 800,
                    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.18)",
                    pointerEvents: "none",
                  }}
                >
                  Copied to clipboard
                </span>
              )}
            </button>
            <button
              onClick={toggleAllMatrixGroups}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.surface,
                color: C.text,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span style={{ display: "flex", transform: allMatrixGroupsExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><I.ChevronDown /></span>
              {allMatrixGroupsExpanded ? "Collapse All" : "Expand All"}
            </button>
            {[
              { id: "current", label: "Currently Booked" },
              { id: "projected", label: "Projected" },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setMatrixMode(option.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${matrixMode === option.id ? C.pri : C.border}`,
                  background: matrixMode === option.id ? C.priLt : C.surface,
                  color: matrixMode === option.id ? C.pri : C.textMut,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {(matrixMode === "projected" || (matrixRangeMode !== "month" && workbookDays.length > MATRIX_PAGE_SIZE)) && (
          <div style={{ fontSize: 11, color: C.textMut, marginBottom: 14, lineHeight: 1.6 }}>
            {matrixMode === "projected" && "Projected mode shows currently booked values moving to a calibrated forecast using same-season booking curves, same-weekday comparables, and recent YOY pickup."}
            {matrixRangeMode !== "month" && workbookDays.length > MATRIX_PAGE_SIZE && ` Showing ${visibleMatrixDays.length} table days at a time across the ${workbookDays.length}-day range.`}
          </div>
        )}
        {matrixHistoryOrigin.message && (
          <div style={{ fontSize: 11, color: matrixHistoryOrigin.status === "failed" ? C.dan : matrixHistoryOrigin.status === "checking" ? C.pri : C.textMut, marginBottom: 14, lineHeight: 1.55, fontWeight: 700 }}>
            Historical source: {matrixHistoryOrigin.message}
          </div>
        )}
        <CapacityWatchPanel
          selectedDay={selectedDay}
          visibleDays={visibleMatrixDays}
          config={config}
          matrixMode={matrixMode}
          onOpenSettings={openCapacitySettings}
        />
        <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#F8FAFC", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 9px", borderRadius: 999, background: readinessTone.bg, color: readinessTone.color, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {readinessTone.label}
              </span>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 800 }}>
                XLSX readiness: {displayedComputedMatrixDays}/{matrixRangeReadiness.expectedDayCount} computed matrix days
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11, color: C.textMut, fontWeight: 700 }}>
              <span>Missing {displayedMissingMatrixDays}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: matrixRangeReadiness.status === "ready" ? C.suc : matrixRangeReadiness.status === "checking" ? C.pri : C.dan, lineHeight: 1.55, fontWeight: 700 }}>
            {readinessReasonText}
          </div>
          {!backfillRunning && matrixRangeReadiness.blockingReasons.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3, fontSize: 11, color: C.textSec, lineHeight: 1.5 }}>
              {matrixRangeReadiness.blockingReasons.slice(0, 5).map((reason) => <li key={reason}>{formatVisibleSchedulingCopy(reason)}</li>)}
              {matrixRangeReadiness.blockingReasons.length > 5 && <li>{matrixRangeReadiness.blockingReasons.length - 5} more readiness issue groups.</li>}
            </ul>
          )}
          {historicalBackfillAvailable && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={startHistoricalMatrixBackfill}
                disabled={backfillRunning}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: `1px solid ${C.pri}`,
                  background: backfillRunning ? "#EFF6FF" : C.surface,
                  color: C.pri,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: backfillRunning ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ display: "flex" }}><I.RefreshCw /></span>
                {backfillRunning ? "Backfill Running" : "Start Historical Backfill"}
              </button>
              <span style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45 }}>
                Server-side setup job. Computes missing historical matrix days once, then exports read persisted rows.
              </span>
            </div>
          )}
          {matrixBackfillState.message && (
            <div style={{ fontSize: 11, color: matrixBackfillState.status === "complete" ? C.suc : matrixBackfillState.status === "failed" ? C.dan : C.pri, lineHeight: 1.5, fontWeight: 700 }}>
              Backfill status: {matrixBackfillState.message}
            </div>
          )}
          {matrixExportState.message && (
            <div style={{ fontSize: 11, color: matrixExportState.status === "complete" ? C.suc : matrixExportState.status === "failed" || matrixExportState.status === "blocked" ? C.dan : C.textMut, lineHeight: 1.5 }}>
              Export status: {matrixExportState.message}
            </div>
          )}
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, tableLayout: "fixed", fontFamily: MATRIX_TABLE_FONT }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#F8FAFC", width: 250, padding: "12px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut }}>
                  Operational Metric
                </th>
                {visibleMatrixColumnsWithWeather.map((column) => {
                  const columnDays = column.days || [];
                  const day = column.day || columnDays[0] || {};
                  const selected = columnDays.some((candidate) => candidate.date === selectedDay?.date);
                  const blocked = column.type === "segment"
                    ? columnDays.some((candidate) => !candidate.canGenerate)
                    : !day.canGenerate;
                  const trustState = column.type === "segment"
                    ? (blocked ? "blocked" : columnDays.some((candidate) => candidate.matrixTrustState !== "trusted") ? "estimated" : "trusted")
                    : day.matrixTrustState;
                  const generationBlockers = column.type === "segment"
                    ? columnDays.flatMap((candidate) => candidate.generationBlockers || [])
                    : (day.generationBlockers || []);
                  const isExpandedSegment = column.type === "segment" && expandedMonthSegments.has(column.segment.id);
                  const dayCapacityIndicators = column.type === "day"
                    ? getVisibleCapacityIndicators(buildDayCapacityIndicators(day, config, matrixMode), 2)
                    : [];
                  return (
                    <th
                      key={column.key}
                      onClick={() => setSelectedDayIdx(column.absoluteIndex)}
                      style={{
                        cursor: "pointer",
                        width: column.type === "segment" ? 132 : 112,
                        padding: "10px 8px 12px",
                        textAlign: "center",
                        borderBottom: `1px solid ${C.border}`,
                        background: selected ? "#EEF4FF" : column.parentSegmentId ? "#FBFCFF" : "#F8FAFC",
                        boxShadow: selected ? `inset 0 -2px 0 ${C.pri}` : "none",
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 800, color: selected ? C.pri : C.text, lineHeight: 1.1 }}>
                        {column.label}
                      </div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{column.dateLabel}</div>
                      <div style={{ marginTop: 8 }}>
                        <TrustBadge state={trustState} blocked={blocked} />
                      </div>
                      {dayCapacityIndicators.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginTop: 7 }}>
                          {dayCapacityIndicators.map((indicator) => (
                            <CapacityPill key={`${column.key}-${indicator.key}`} indicator={indicator} compact />
                          ))}
                        </div>
                      )}
                      {column.type === "segment" && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleMonthSegment(column.segment.id);
                          }}
                          style={{
                            marginTop: 7,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: `1px solid ${isExpandedSegment ? C.pri : C.borderLight}`,
                            background: isExpandedSegment ? C.priLt : C.surface,
                            color: isExpandedSegment ? C.pri : C.textMut,
                            fontSize: 10,
                            fontWeight: 800,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <span style={{ display: "flex", transform: isExpandedSegment ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><I.ChevronDown /></span>
                          {isExpandedSegment ? "Hide days" : "Show days"}
                        </button>
                      )}
                      {matrixMode === "projected" && (
                        <div style={{ fontSize: 10, color: C.pri, fontWeight: 800, marginTop: 6 }}>
                          {column.type === "segment"
                            ? "Segment total"
                            : getDayProjection(day)?.lead_days > 0 ? `${getDayProjection(day).lead_days}d out projection` : "Actual"}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: blocked ? C.dan : generationBlockers.length > 0 ? C.warn : C.textMut, marginTop: 6, minHeight: 28, lineHeight: 1.35 }}>
                        {blocked
                          ? formatVisibleSchedulingCopy(generationBlockers[0] || "Waiting on matrix")
                          : "Ready to schedule"}
                      </div>
                      {column.type === "day" && matrixMode === "projected" && getProjectionSummaryLines(day).length > 0 && (
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 6, lineHeight: 1.35 }}>
                          {getProjectionSummaryLines(day).map((line) => (
                            <div key={`${day.date}-${line}`}>{line}</div>
                          ))}
                        </div>
                      )}
                    </th>
                  );
                })}
                <th style={{ position: "sticky", right: 0, zIndex: 3, width: 118, padding: "10px 8px 12px", textAlign: "center", borderBottom: `1px solid ${C.border}`, background: "#F8FAFC", boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>
                    {matrixRangeMode === "week" ? "Weekly Total" : "Visible Total"}
                  </div>
                  <div style={{ fontSize: 10, color: C.textMut, marginTop: 6 }}>
                    Dog-days across visible table
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixRowGroups.flatMap((group, groupIndex) => {
                const groupExpanded = expandedMatrixGroups.has(group.section);
                const summaryRow = group.summaryKey ? group.rows.find((row) => row.key === group.summaryKey) : null;
                const detailRows = summaryRow ? group.rows.filter((row) => row.key !== summaryRow.key) : group.rows;
                const visibleRows = summaryRow
                  ? (groupExpanded ? detailRows : [])
                  : detailRows.filter((row) => {
                    if (groupExpanded) return true;
                    if (group.hideRowsWhenCollapsed) return false;
                    return row.total || row.alwaysVisible;
                  });
                const expandable = detailRows.length > 0;
                const sectionBand = groupIndex % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
                const totalBand = groupIndex % 2 === 0 ? "#F7FAFF" : "#F2F6FB";
                const detailBand = (rowIndex) => (rowIndex % 2 === 0 ? "#FFFFFF" : "#FBFCFF");
                const getRowBackground = (row, { summary = false, rowIndex = 0 } = {}) => {
                  if (summary) return sectionBand;
                  if (row.total) return totalBand;
                  return detailBand(rowIndex);
                };
                const renderMetricRow = (row, { summary = false, indented = false, rowIndex = 0 } = {}) => {
                  const rowBackground = getRowBackground(row, { summary, rowIndex });
                  const isStrongRow = row.total || summary;
                  const borderBottom = isStrongRow ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`;
                  const selectedBackground = isStrongRow ? "#EAF2FF" : "#F8FBFF";
                  return (
                    <tr key={summary ? `${group.section}-summary` : row.key}>
                      <td style={{ position: "sticky", left: 0, zIndex: 2, padding: indented ? "8px 12px 8px 34px" : "9px 12px", background: rowBackground, borderBottom, borderRight: `1px solid ${C.border}`, fontSize: isStrongRow ? 13 : 12, fontWeight: isStrongRow ? 700 : 600, color: C.text, fontFamily: MATRIX_TABLE_FONT }}>
                        {summary ? (
                          <button
                            type="button"
                            onClick={() => expandable && toggleMatrixGroup(group.section)}
                            aria-disabled={!expandable}
                            title={group.summaryTitle || row.label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              width: "100%",
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              color: C.text,
                              cursor: expandable ? "pointer" : "default",
                              fontFamily: MATRIX_TABLE_FONT,
                              fontSize: "inherit",
                              fontWeight: "inherit",
                              lineHeight: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ minWidth: 0 }}>{group.summaryLabel || row.label}</span>
                            {expandable && (
                              <span
                                aria-hidden="true"
                                style={{
                                  display: "flex",
                                  flex: "0 0 auto",
                                  transform: groupExpanded ? "rotate(180deg)" : "none",
                                  transition: "transform 0.15s",
                                  color: C.textMut,
                                }}
                              >
                                <I.ChevronDown />
                              </span>
                            )}
                          </button>
                        ) : row.label}
                      </td>
                      {visibleMatrixColumnsWithWeather.map((column) => {
                        const selected = column.days?.some((day) => day.date === selectedDay?.date);
                        const cellValue = column.type === "segment"
                          ? renderAggregateMatrixCellValue({
                            row,
                            days: column.days,
                            mode: matrixMode,
                          })
                          : renderMatrixCellValue({
                            row,
                            day: column.day,
                            mode: matrixMode,
                          });
                        return (
                          <td
                            key={`${row.key}-${column.key}`}
                            onClick={() => setSelectedDayIdx(column.absoluteIndex)}
                            title={cellValue.title}
                            style={{
                              cursor: "pointer",
                              textAlign: "center",
                              padding: "10px 8px",
                              borderBottom,
                              background: selected ? selectedBackground : rowBackground,
                              color: cellValue.missingValue ? C.textMut : isStrongRow ? C.text : C.textSec,
                              fontSize: cellValue.missingValue ? 11 : row.weather ? (isStrongRow ? 12 : 11) : 16,
                              fontWeight: isStrongRow ? 800 : 700,
                              lineHeight: row.weather ? 1.35 : undefined,
                              fontFamily: MATRIX_TABLE_FONT,
                            }}
                          >
                            {cellValue.content}
                          </td>
                        );
                      })}
                      <td
                        style={{
                          position: "sticky",
                          right: 0,
                          zIndex: 2,
                          textAlign: "center",
                          padding: "9px 8px",
                          borderBottom,
                          background: rowBackground,
                          color: isStrongRow ? C.text : C.textSec,
                          fontSize: 16,
                          fontWeight: isStrongRow ? 800 : 700,
                          fontFamily: MATRIX_TABLE_FONT,
                          boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)",
                        }}
                      >
                        {(() => {
                          const aggregate = summarizeAggregateMatrixCell(visibleMatrixDaysWithWeather, row, matrixMode);
                          if (!aggregate.hasValue) {
                            return (
                              <span title={aggregate.unavailableTitle} style={{ fontSize: 11, color: C.textMut, fontWeight: 800 }}>
                                {aggregate.unavailableLabel}
                              </span>
                            );
                          }
                          const total = aggregate.value;

                          if (matrixMode === "projected" && !row.comparison) {
                            const currentTotal = sumMatrixValues(visibleMatrixDaysWithWeather, row, "current");
                            return (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut }}>{currentTotal ?? "No data"}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.pri }}>→</span>
                                <span>{formatMatrixValue(total, row.format)}</span>
                              </div>
                            );
                          }

                          return formatMatrixValue(total, row.format);
                        })()}
                      </td>
                    </tr>
                  );
                };
                const sectionHeaderBg = groupIndex % 2 === 0 ? "#F8FAFC" : "#F3F6FA";
                const sectionHeaderRow = summaryRow ? null : (
                  <tr key={`${group.section}-section`}>
                    <td style={{ position: "sticky", left: 0, zIndex: 2, padding: "8px 12px", background: sectionHeaderBg, borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}` }}>
                      <button
                        onClick={() => toggleMatrixGroup(group.section)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          color: C.textSec,
                          cursor: "pointer",
                          fontFamily: MATRIX_TABLE_FONT,
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          lineHeight: "inherit",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 800 }}>{group.section}</span>
                        <span
                          aria-hidden="true"
                          style={{
                            display: "flex",
                            flex: "0 0 auto",
                            transform: groupExpanded ? "rotate(180deg)" : "none",
                            transition: "transform 0.15s",
                            color: C.textMut,
                          }}
                        >
                          <I.ChevronDown />
                        </span>
                      </button>
                    </td>
                    {visibleMatrixColumns.map((column) => (
                      <td key={`${group.section}-${column.key}`} style={{ background: column.days?.some((day) => day.date === selectedDay?.date) ? "#F8FBFF" : sectionHeaderBg, borderBottom: `1px solid ${C.borderLight}` }} />
                    ))}
                    <td style={{ position: "sticky", right: 0, zIndex: 2, background: sectionHeaderBg, borderBottom: `1px solid ${C.borderLight}`, boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)" }} />
                  </tr>
                );
                return [
                  sectionHeaderRow,
                  summaryRow ? renderMetricRow(summaryRow, { summary: true }) : null,
                  ...visibleRows.map((row, rowIndex) => renderMetricRow(row, { indented: Boolean(summaryRow) || Boolean(row.detail), rowIndex })),
                ].filter(Boolean);
              })}
            </tbody>
          </table>
        </div>
        {matrixRangeMode !== "month" && workbookDays.length > MATRIX_PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ fontSize: 11, color: C.textMut }}>
              Table page {matrixPage + 1} of {matrixPageCount} · {visibleMatrixDays[0]?.date || "—"} to {visibleMatrixDays[visibleMatrixDays.length - 1]?.date || "—"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="secondary" size="sm" onClick={() => setMatrixPage((page) => Math.max(0, page - 1))} disabled={matrixPage <= 0}>Previous Days</Btn>
              <Btn variant="secondary" size="sm" onClick={() => setMatrixPage((page) => Math.min(matrixPageCount - 1, page + 1))} disabled={matrixPage >= matrixPageCount - 1}>Next Days</Btn>
            </div>
          </div>
        )}
        <ForecastDetailsPanel
          day={selectedDay}
          matrixMode={matrixMode}
          expanded={forecastDetailsExpanded}
          onToggle={() => setForecastDetailsExpanded((value) => !value)}
        />
      </SectionCard>
      )}

      {/* ── Section 1b: Staff Plan Input ──────────────────────────────── */}
      {activeSchedulingTab === "rotation" && selectedDay && (
        <SectionCard
          title={`Rotation Builder — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="Configure headcount, preview workbook templates without mutating the draft, apply the best fit, then customize before saving the day."
          icon={<I.Users />}
        >
          <RotationCreationStudio
            day={selectedDay}
            rotation={optimalRotation}
            config={config}
            matrixMode={matrixMode}
            serverGridData={gridData}
            onSaveStaffPlan={handleStaffPlanSave}
            onGenerated={() => setScheduleView("actual_staffing")}
            onApplyTemplateGrid={setLocalGrid}
            onSaveDay={handleGenerate}
            canSaveDay={!generateDisabled}
            saveDisabledReason={generateDisabledReason}
            disabled={rotationLoading}
            templateCatalogSummary={templateCatalogSummary}
            visibleDays={workbookDays}
            today={today}
            onSelectDate={handleRotationDateSelect}
            onFetchScheduleSummaries={fetchScheduleVersionSummaries}
          />
          <p style={{ fontSize: 11, color: C.textMut, marginTop: 10, lineHeight: 1.6 }}>
            Hover preview is intentionally temporary. Click a template to apply it to the local draft grid, then use Save Day Draft when Skyler is ready to persist a version.
          </p>
        </SectionCard>
      )}

      {/* ── Section 2: Optimal Headcount ───────────────────────────────── */}
      {activeSchedulingTab === "rotation" && selectedDay && (
        <SectionCard
          title={`Headcount Reference — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="Compact reference for the model's ideal opening and closing PCT coverage. The staffing generator above is the manager input surface."
          icon={<I.Users />}
          style={{ marginTop: 16 }}
        >
          {!selectedDay.canGenerate || !optimalRotation ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: C.warnLt, border: `1px solid ${C.warn}22` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Headcount stays provisional until this day has a computed Demand Matrix row.
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 6, lineHeight: 1.6 }}>
                {generateDisabledReason}
              </div>
              {selectedDay.generationBlockers.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
                  {selectedDay.generationBlockers.map((blocker, index) => <li key={index}>{formatVisibleSchedulingCopy(blocker)}</li>)}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: headcountExpanded ? 12 : 0 }}>
                <MetricPill label="Opening PCTs" value={openingFrame?.headcount ?? "—"} />
                <MetricPill label="Closing PCTs" value={closingFrame?.headcount ?? "—"} />
                <span style={{ fontSize: 12, color: C.textMut, fontWeight: 700 }}>
                  {projectedDisplay?.support?.total_dog_volume || 0} projected dogs · {hasAdjustedSchedule ? "Actual staffing comparison available" : "No staff-adjusted plan saved yet"}
                </span>
                <button
                  type="button"
                  onClick={() => setHeadcountExpanded((value) => !value)}
                  style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {headcountExpanded ? "Hide Details" : "Show Details"}
                </button>
              </div>
              {headcountExpanded && (
              <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {[openingFrame, closingFrame].filter(Boolean).map((frame, index) => {
                  const assigned = index === 0 ? actualOpeningCount : actualClosingCount;
                  const gap = Math.max(0, frame.headcount - assigned);
                  const hasGap = hasAdjustedSchedule && assigned < frame.headcount;
                  return (
                    <div key={frame.label} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: C.textMut, letterSpacing: "0.04em", marginBottom: 8 }}>{frame.label}</div>
                      <div style={{ display: "flex", gap: 20 }}>
                        <MetricPill label="Optimal PCTs" value={frame.headcount} />
                        {hasAdjustedSchedule && <MetricPill label="Scheduled PCTs" value={assigned} warn={hasGap} />}
                        {hasAdjustedSchedule && <MetricPill label="Gap" value={gap} sub={hasGap ? "short" : "covered"} warn={hasGap} />}
                      </div>
                      <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 11, color: C.textMut, lineHeight: 1.5 }}>
                        <div><strong style={{ color: C.text }}>Role:</strong> {frame.role_label || "Dedicated backend PCTs"}</div>
                        {index === 0 && <div>Supervisor support is shown separately in the rotation grid and is not counted in this PCT headcount.</div>}
                        {((index === 0 ? openingHours : closingHours)) && (
                          <>
                            <div>{frame.headcount} × {(index === 0 ? openingHours : closingHours).scheduledHoursPerShift.toFixed(1)} hr shifts = {(index === 0 ? openingHours : closingHours).totalScheduledHours.toFixed(1)} scheduled hours</div>
                            <div>After {frame.break_minutes_per_shift ?? config.break_minutes}-minute breaks = {(index === 0 ? openingHours : closingHours).totalWorkingHours.toFixed(1)} working hours</div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, padding: "10px 14px", borderRadius: 10, background: C.sucLt, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Projected Demand Basis</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{projectedDisplay?.support?.total_dog_volume || 0} dogs</span>
                <span style={{ fontSize: 12, color: C.textMut }}>{optimalRotation?.peak_active_coverage?.note}</span>
                {hasAdjustedSchedule && (
                  <span style={{ fontSize: 12, color: C.textMut }}>
                    Actual Staffing compares your entered dedicated PCT shifts against the optimal backend PCT requirement.
                  </span>
                )}
                {!hasAdjustedSchedule && (
                  <span style={{ fontSize: 12, color: C.textMut }}>
                    No staff shifts entered yet. The optimal view is the default staffing recommendation.
                  </span>
                )}
                {supportRoleSummary && (
                  <span style={{ fontSize: 12, color: C.textMut }}>
                    Entered support roles: {supportRoleSummary}.
                  </span>
                )}
              </div>
              <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 12, border: `1px solid ${C.border}`, background: "#F8FAFC" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut, marginBottom: 8 }}>
                  Workload Math
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
                  {(optimalRotation?.workload_breakdown || []).map((item) => (
                    <li key={item.key}>
                      <strong>{item.label}:</strong> {item.value}
                      {item.math ? ` — ${item.math}` : ""}
                      {item.note ? ` ${item.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              </>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* ── Section 3: Full-Day Rotation Grid ─────────────────────────── */}
      {activeSchedulingTab === "rotation" && selectedDay && (
        <SectionCard
          title={`Rotation Schedule — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="The ideal BE rotation schedule auto-generates from projected Gingr demand. Save shifts above to compare the optimal plan with a staff-adjusted version."
          icon={<I.Clipboard />}
          style={{ marginTop: 16 }}
        >
          {!selectedDay?.canGenerate ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: C.surfaceHover, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Rotation generation is locked until the selected day has a computed Demand Matrix row.
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 6, lineHeight: 1.6 }}>
                {generateDisabledReason}
              </div>
              {selectedDay.generationBlockers.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
                  {selectedDay.generationBlockers.map((blocker, index) => <li key={index}>{formatVisibleSchedulingCopy(blocker)}</li>)}
                </ul>
              )}
            </div>
          ) : rotationLoading && !visibleRotation ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: C.surfaceHover, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Computing BE rotation schedule…
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 6, lineHeight: 1.6 }}>
                Server-side scheduling is building the {showingAdjustedSchedule ? "Actual Staffing" : "Optimal"} plan for this day.
              </div>
            </div>
          ) : rotationError && !visibleRotation ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: C.danLt, border: `1px solid ${C.dan}22` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Rotation compute failed
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 6, lineHeight: 1.6 }}>
                {rotationError}
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#F8FAFC", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: C.text }}>Template Library</span>
                <span style={{ fontSize: 11, color: C.textMut }}>
                  {templateCatalogSummary.templateCount} extracted workbook templates · {templateCatalogSummary.shiftCounts.AM || 0} AM · {templateCatalogSummary.shiftCounts.PM || 0} PM
                </span>
                <span style={{ fontSize: 11, color: C.textMut }}>
                  Source sheet is shown in the staffing generator match explanation.
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => setScheduleView("optimal")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${!showingAdjustedSchedule ? C.pri : C.border}`,
                    background: !showingAdjustedSchedule ? C.priLt : C.surface,
                    color: !showingAdjustedSchedule ? C.pri : C.textMut,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Optimal
                </button>
                {hasAdjustedSchedule && (
                  <button
                    onClick={() => setScheduleView("actual_staffing")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: `1px solid ${showingAdjustedSchedule ? C.pri : C.border}`,
                      background: showingAdjustedSchedule ? C.priLt : C.surface,
                      color: showingAdjustedSchedule ? C.pri : C.textMut,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Actual Staffing
                  </button>
                )}
                <span style={{ fontSize: 11, color: C.textMut, alignSelf: "center" }}>
                  Viewing {showingAdjustedSchedule ? "actual staffing" : "optimal"} schedule
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => setOverrideMode(!overrideMode)} style={{ padding: "4px 12px", border: `1px solid ${overrideMode ? C.warn : C.border}`, borderRadius: 8, background: overrideMode ? C.warnLt : C.surface, color: overrideMode ? C.warn : C.textMut, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                  {overrideMode ? "Exit Override Mode" : "Override Mode"}
                </button>
                {activeScheduleId && (
                  <Btn variant="primary" size="sm" onClick={() => handlePublish()}>Publish</Btn>
                )}
                <button onClick={handleLoadVersions} style={{ padding: "4px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.textMut, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                  Versions
                </button>
              </div>

              {savedVersions.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {savedVersions.map(v => (
                    <span key={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: v.status === "published" ? C.sucLt : v.id === activeScheduleId ? C.priLt : "#F1F5F9", color: v.status === "published" ? C.suc : v.id === activeScheduleId ? C.pri : C.textMut, border: `1px solid ${v.status === "published" ? C.suc : v.id === activeScheduleId ? C.pri : C.border}22` }}>
                      v{v.version} — {v.status}
                      {(v.overrides || []).length > 0 && <span style={{ fontSize: 9, color: C.warn }}>({v.overrides.length} overrides)</span>}
                    </span>
                  ))}
                </div>
              )}

              {rotationLoading && visibleRotation && (
                <div style={{ marginBottom: 12, padding: "8px 14px", borderRadius: 8, background: C.priLt, border: `1px solid ${C.pri}22`, fontSize: 11, color: C.pri }}>
                  Refreshing server-side rotation payload…
                </div>
              )}

              <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: 920, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ position: "sticky", left: 0, zIndex: 2, background: "#F8FAFC", padding: "6px 10px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textAlign: "left", color: C.textMut }}>Time</th>
                      {orderedLanes.map((lane) => (
                        <th key={lane.id} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textAlign: "center", color: C.textMut, whiteSpace: "nowrap", background: "#F8FAFC" }}>{lane.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot, index) => (
                      <tr key={slot.time}>
                        <td style={{ position: "sticky", left: 0, zIndex: 1, background: slot.segment === "pre_open" ? "#F8FAFC" : index % 2 === 0 ? "#F8FAFC" : "#F1F5F9", padding: `${rowH / 2 - 6}px 10px`, borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}`, fontWeight: slot.segment === "pre_open" ? 700 : 600, color: C.text, whiteSpace: "nowrap", fontSize: 10 }}>{slot.label}</td>
                        {orderedLanes.map((lane) => {
                          const displayGrid = localGrid || serverGrid || {};
                          const cell = displayGrid?.[lane.id]?.[slot.time] || { task: "float", label: TASK_COLORS.float.label };
                          const taskKey = cell?.task || "float";
                          const tc = TASK_COLORS[taskKey] || TASK_COLORS.float;
                          const isSelected = overrideMode && selectedCell?.laneId === lane.id && selectedCell?.slotTime === slot.time;
                          return (
                            <td
                              key={`${lane.id}-${slot.time}`}
                              onClick={overrideMode ? (event) => handleCellSelect(lane.id, slot.time, event.currentTarget.getBoundingClientRect()) : undefined}
                              onMouseEnter={() => {
                                if (dragFillState && dragFillState.laneId === lane.id) {
                                  setDragFillState((current) => current ? { ...current, targetSlot: slot.time } : current);
                                }
                              }}
                              title={cell?.notes ? `${cell.label}${cell.detail ? ` — ${cell.detail}` : ""}\nNote: ${cell.notes}` : `${cell.label}${cell.detail ? ` — ${cell.detail}` : ""}`}
                              style={{
                                position: "relative",
                                padding: "8px 6px",
                                textAlign: "center",
                                borderBottom: `1px solid ${C.borderLight}`,
                                background: isSelected ? "#FEF3C7" : tc.bg,
                                color: isSelected ? "#000" : tc.text,
                                fontWeight: 700,
                                fontSize: 10,
                                cursor: overrideMode ? "pointer" : "default",
                                outline: isSelected ? "2px solid #F59E0B" : "none",
                                minWidth: 150,
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                                <span>{cell?.label || tc.label}</span>
                                {cell?.detail && (
                                  <span style={{ fontSize: 9, fontWeight: 600, color: isSelected ? "#000" : tc.text, opacity: 0.85 }}>
                                    {cell.detail}
                                  </span>
                                )}
                              </div>
                              {cell?.notes && (
                                <span style={{ position: "absolute", top: 4, right: 6, fontSize: 10, fontWeight: 800, color: C.warn }}>
                                  •
                                </span>
                              )}
                              {overrideMode && isSelected && (
                                <span
                                  onMouseDown={(event) => {
                                    event.stopPropagation();
                                    setDragFillState({
                                      laneId: lane.id,
                                      startSlot: slot.time,
                                      targetSlot: slot.time,
                                      task: overrideTask || taskKey,
                                      notes: overrideNotes || cell?.notes || "",
                                    });
                                  }}
                                  style={{
                                    position: "absolute",
                                    right: 2,
                                    bottom: 2,
                                    width: 8,
                                    height: 8,
                                    borderRadius: 2,
                                    background: "#111827",
                                    cursor: "crosshair",
                                  }}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {overrideMode && selectedCell && (
                <div
                  style={{
                    position: "fixed",
                    zIndex: 40,
                    top: typeof window !== "undefined"
                      ? Math.min(selectedCell.rect.bottom + 8, window.innerHeight - 180)
                      : 120,
                    left: typeof window !== "undefined"
                      ? Math.min(selectedCell.rect.left, window.innerWidth - 360)
                      : 40,
                    width: 340,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    boxShadow: "0 16px 32px rgba(15, 23, 42, 0.16)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8 }}>
                    {orderedLanes.find((lane) => lane.id === selectedCell.laneId)?.label} at {fmt12(selectedCell.slotTime)}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <select value={overrideTask} onChange={(e) => setOverrideTask(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}>
                      <option value="">Select task…</option>
                      {Object.entries(TASK_COLORS).map(([key, value]) => (
                        <option key={key} value={key}>{value.label}</option>
                      ))}
                    </select>
                    <input
                      value={overrideNotes}
                      onChange={(e) => setOverrideNotes(e.target.value)}
                      placeholder="Notes"
                      style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn variant="primary" size="sm" onClick={handleApplyOverride} disabled={!overrideTask}>Apply</Btn>
                      <button onClick={() => { setSelectedCell(null); setOverrideTask(""); setOverrideNotes(""); }} style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.textMut, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
                    </div>
                    <div style={{ fontSize: 10, color: C.textMut, lineHeight: 1.5 }}>
                      Drag the black square on the selected cell to fill the same task and notes down this lane.
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {Object.entries(TASK_COLORS).map(([key, value]) => (
                  <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: value.text }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: value.bg, border: `1px solid ${value.text}22` }} />
                    {value.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── Section 5: Shortage / Warnings Area ───────────────────────── */}
      {activeSchedulingTab === "rotation" && (
      <SectionCard
        title="Shortages & Warnings"
        subtitle="Issues that need manager attention for the selected day"
        icon={<I.AlertTriangle />}
        style={{ marginTop: 16 }}
      >
        {visibleWarnings.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
            <I.CheckCircle />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.suc }}>
              {hasAdjustedSchedule ? "No shortages or warnings for this day. The saved shift plan covers every modeled daypart." : "No manager warnings right now. The optimal schedule is being generated directly from projected Gingr demand."}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleWarnings.map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: C.warnLt, border: `1px solid ${C.warn}22` }}>
                <I.AlertTriangle style={{ color: C.warn, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{w}</div>
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                    {w.includes("Opening") && "Opening demand exceeds the currently shown staffing mix. Add an earlier shift or compare against the optimal plan."}
                    {w.includes("Bath") && "Bath throughput may push completion past the target window. Consider adding a dedicated bath opening shift."}
                    {w.includes("PM") && "Closing coverage is short. Return-to-room transport and dinner feed may run late without additional closing support."}
                    {w.includes("unresolved playgroup") && "This is informational, not a hard blocker. The schedule still generates, but verify the final playgroup split before publishing."}
                    {w.includes("PP") && "High private play load may justify a dedicated private play lane during the busiest dayparts."}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      )}

      {/* ── Section 6: Assumptions & Configuration ─────────────────────── */}
      {showAssumptions && (
        <SectionCard
          title="Assumptions & Configuration"
          subtitle="Current values driving headcount and rotation schedule. Overridable per location in Settings."
          icon={<I.Settings />}
          style={{ marginTop: 16 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { group: "Daycare Ratios", items: [{ l: "Large DC ratio", v: `${config.daycare_ratio_large}:1` }, { l: "Small DC ratio", v: `${config.daycare_ratio_small}:1` }] },
              { group: "Capacity", items: [
                { l: "Boarding multi-dog factor", v: config.boarding_multi_dog_factor },
                { l: "Practical boarding cap", v: config.boarding_practical_dog_capacity ?? "rooms x factor" },
                { l: "Large DC cap", v: config.large_daycare_capacity ?? "Not set" },
                { l: "Small DC cap", v: config.small_daycare_capacity ?? "Not set" },
              ] },
              { group: "Transport & Room", items: [{ l: "Group transport (each way)", v: `${config.group_transport_minutes_each_way} min` }, { l: "Morning room clean", v: `${config.morning_room_clean_minutes} min` }] },
              { group: "Private Play", items: [{ l: "PP move (each way)", v: `${config.private_play_move_minutes_each_way} min` }, { l: "PP box dwell", v: `${config.private_play_box_dwell_minutes} min` }, { l: "PP rounds/day", v: config.private_play_rounds_per_day }] },
              { group: "Baths", items: [{ l: "Bath active", v: `${config.bath_active_minutes} min` }, { l: "Passive dry", v: `${config.bath_passive_dry_minutes} min` }, { l: "Dryer capacity", v: config.dryer_capacity }] },
              { group: "Feed & Meds", items: [{ l: "Feed per dog", v: `${config.feeding_minutes_per_dog} min` }, { l: "Med per dog", v: `${config.medication_minutes_per_dog} min` }] },
              { group: "Breaks & Staffing", items: [{ l: "Break length", v: `${config.break_minutes} min` }, { l: "Large team threshold", v: `${config.large_team_threshold}+` }, { l: "SUP buffer", v: `${config.supervisor_buffer_minutes} min` }] },
              { group: "Time Windows", items: [
                { l: "Weekday site hours", v: `${config.weekday_site_hours[0]} – ${config.weekday_site_hours[1]}` },
                { l: "Weekend site hours", v: `${config.weekend_site_hours[0]} – ${config.weekend_site_hours[1]}` },
                { l: "Weekday public hrs", v: `${config.public_hours_weekday[0]} – ${config.public_hours_weekday[1]}` },
              ]},
            ].map(({ group, items }) => (
              <div key={group} style={{ padding: "12px 14px", borderRadius: 10, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.textMut, letterSpacing: "0.04em", marginBottom: 8 }}>{group}</div>
                {items.map(({ l, v }) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                    <span style={{ color: C.textSec }}>{l}</span>
                    <span style={{ fontWeight: 600, color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: C.textMut, marginTop: 14, fontStyle: "italic" }}>
            Values are loaded from the schedule_config key in lite_settings. Defaults are used when no location override exists.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

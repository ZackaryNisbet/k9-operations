// K9 Operations — Scheduling Page
// Week plan + optimal headcount + BE rotation + explanations + warnings + assumptions.
// Uses live Supabase data from scheduling_matrix_daily.

import React, { useState, useMemo, useCallback } from "react";
import { C, todayStr, addDays, DAY_NAMES_SHORT } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn } from "../../shared/ui";
import { useSchedulingData } from "../../hooks/useSchedulingData";
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

// ─── Utility Components ───────────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 16 }}>
        {icon && <span style={{ color: C.pri, display: "flex" }}>{icon}</span>}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h3>
      </div>
      {subtitle && <p style={{ fontSize: 12, color: C.textMut, margin: "0 0 16px 0" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function MetricPill({ label, value, sub, warn }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 56 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: warn ? C.dan : C.text, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>{label}</span>
      {sub !== undefined && <span style={{ fontSize: 10, color: warn ? C.dan : C.textMut }}>{sub}</span>}
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    ok: { bg: C.sucLt, color: C.suc, label: "Covered" },
    short: { bg: C.danLt, color: C.dan, label: "Short" },
    borderline: { bg: C.warnLt, color: C.warn, label: "Borderline" },
    no_plan: { bg: "#F1F5F9", color: C.textMut, label: "No Plan" },
    draft: { bg: C.warnLt, color: C.warn, label: "Draft" },
  };
  const s = map[status] || map.ok;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>;
}

function TrustBadge({ state, blocked }) {
  const effective = blocked ? "blocked" : state;
  const map = {
    trusted: { bg: C.sucLt, color: C.suc, label: "Trusted" },
    estimated: { bg: C.warnLt, color: C.warn, label: "Estimated" },
    missing: { bg: "#FEE2E2", color: "#991B1B", label: "Missing" },
    blocked: { bg: "#FEE2E2", color: "#991B1B", label: "Blocked" },
  };
  const chip = map[effective] || map.missing;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: chip.bg, color: chip.color }}>
      {chip.label}
    </span>
  );
}

const MATRIX_GROUP_TEMPLATES = [
  {
    section: "GINGR Source Counts",
    rows: [
      { key: "source.check_ins", label: "GINGR Check-Ins", source: true },
      { key: "source.check_outs", label: "GINGR Check-Outs", source: true },
      { key: "source.overnight", label: "GINGR Overnight", source: true },
      { key: "source.boarding_opening", label: "Boarding Dogs Opening", total: true, source: true },
      { key: "source.boarding_closing", label: "Boarding Dogs Closing", total: true, source: true },
      { key: "source.daytime_total", label: "GINGR Daytime Dogs", total: true, source: true },
      { key: "source.total", label: "GINGR Total Volume", total: true, source: true },
    ],
  },
  {
    section: "Opening Boarding",
    rows: [
      { key: "opening.large_boarding", label: "Large Boarding Opening" },
      { key: "opening.small_boarding", label: "Small Boarding Opening" },
      { key: "opening.private_play_boarding", label: "Private Play Boarding Opening" },
      { key: "opening.half_and_half_boarding", label: "Half and Half Boarding Opening", optional: true },
      { key: "opening.evaluation_boarding", label: "Evaluation Boarding Opening", optional: true },
      { key: "opening.unclassified_boarding", label: "Unresolved Boarding Opening", optional: true },
      { key: "opening.total_boarding", label: "Total Boarding Dogs Opening", total: true },
    ],
  },
  {
    section: "Closing Boarding",
    rows: [
      { key: "closing.large_boarding", label: "Large Boarding Closing" },
      { key: "closing.small_boarding", label: "Small Boarding Closing" },
      { key: "closing.private_play_boarding", label: "Private Play Boarding Closing" },
      { key: "closing.half_and_half_boarding", label: "Half and Half Boarding Closing", optional: true },
      { key: "closing.evaluation_boarding", label: "Evaluation Boarding Closing", optional: true },
      { key: "closing.unclassified_boarding", label: "Unresolved Boarding Closing", optional: true },
      { key: "closing.total_boarding", label: "Total Boarding Dogs Closing", total: true },
    ],
  },
  {
    section: "Daytime Volume",
    rows: [
      { key: "daycare.evaluations", label: "Evaluations" },
      { key: "daycare.private_play_dayboarding", label: "Private Play Dayboarding" },
      { key: "daycare.half_and_half_daytime", label: "Half and Half Daytime Dogs", optional: true },
      { key: "daycare.large_daycare", label: "Large Daycare" },
      { key: "daycare.small_daycare", label: "Small Daycare" },
      { key: "daycare.unclassified_daycare", label: "Unresolved Daytime Dogs", optional: true },
      { key: "daycare.total_daycare", label: "Total Daycare Dogs", total: true },
    ],
  },
  {
    section: "Support Workload",
    rows: [
      { key: "support.departure_baths", label: "Departure Baths" },
      { key: "support.morning_feeding_dogs", label: "Morning Feeding Dogs" },
      { key: "support.evening_feeding_dogs", label: "Evening Feeding Dogs" },
      { key: "support.medication_dogs", label: "Medication Dogs" },
      { key: "support.total_dog_volume", label: "Total Dog Volume", total: true },
      { key: "play_yard.large_play_dogs", label: "Large Play Demand", alwaysVisible: true },
      { key: "play_yard.small_play_dogs", label: "Small Play Demand", alwaysVisible: true },
      { key: "play_yard.private_play_dogs", label: "Private Play Demand", alwaysVisible: true },
      { key: "play_yard.split_play_dogs", label: "Split Play Demand", optional: true, alwaysVisible: true },
      { key: "comparison.last_year_total_dog_volume", label: "Last Year Total Dog Volume", optional: true, comparison: true },
      { key: "support.tours", label: "Tours" },
    ],
  },
];

function getNestedValue(obj, key) {
  return key.split(".").reduce((acc, part) => acc?.[part], obj);
}

function getDayCurrentDisplay(day) {
  return day?.currentDisplay || getMatrixDisplay(day?.matrix || day || {});
}

function getDayProjectedDisplay(day) {
  return day?.projectedDisplay || getMatrixProjectedDisplay(day?.matrix || day || {});
}

function getDayProjection(day) {
  return day?.projection || getMatrixProjection(day?.matrix || day || {});
}

function getDayComparison(day) {
  return day?.comparison || getMatrixComparison(day?.matrix || day || {});
}

function getDayMatrixValue(day, row, mode = "current") {
  if (row.comparison) {
    return getNestedValue({ comparison: getDayComparison(day) }, row.key);
  }

  const source = (row.source || mode === "current") ? getDayCurrentDisplay(day) : getDayProjectedDisplay(day);
  return getNestedValue(source, row.key);
}

function hasAnyNonZeroValue(days, key) {
  return days.some((day) => {
    const value = key.startsWith("comparison.")
      ? getNestedValue({ comparison: getDayComparison(day) }, key)
      : (
        getNestedValue(getDayCurrentDisplay(day), key)
        ?? getNestedValue(getDayProjectedDisplay(day), key)
      );
    return value !== null && value !== undefined && Number(value) !== 0;
  });
}

function buildMatrixRowGroups(days) {
  return MATRIX_GROUP_TEMPLATES.map((group) => ({
    ...group,
    rows: group.rows.filter((row) => !row.optional || hasAnyNonZeroValue(days, row.key)),
  }));
}

function formatMatrixDate(date) {
  const dt = new Date(`${date}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

function formatWeekRange(startDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getMondayStart(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getDayIndexFromMonday(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function getShiftHourSummary(frame, breakMinutes = 30) {
  if (!frame) return null;
  const scheduledHoursPerShift = (Number(frame.end.slice(0, 2)) * 60 + Number(frame.end.slice(3, 5)) - Number(frame.start.slice(0, 2)) * 60 - Number(frame.start.slice(3, 5))) / 60;
  const workingHoursPerShift = Math.max(0, scheduledHoursPerShift - ((frame.break_minutes_per_shift ?? breakMinutes) / 60));
  return {
    scheduledHoursPerShift,
    workingHoursPerShift,
    totalScheduledHours: frame.scheduled_hours ?? Number((frame.headcount * scheduledHoursPerShift).toFixed(1)),
    totalWorkingHours: frame.working_hours_after_breaks ?? Number((frame.headcount * workingHoursPerShift).toFixed(1)),
  };
}

function summarizeSupportRoles(entries) {
  const counts = entries.reduce((acc, entry) => {
    acc[entry.position] = (acc[entry.position] || 0) + 1;
    return acc;
  }, {});
  const labels = [];
  if (counts.supervisor) labels.push(`${counts.supervisor} supervisor${counts.supervisor === 1 ? "" : "s"}`);
  if (counts.csr) labels.push(`${counts.csr} CSR${counts.csr === 1 ? "" : "s"}`);
  if (counts.mod) labels.push(`${counts.mod} manager${counts.mod === 1 ? "" : "s"}`);
  return labels.join(", ");
}

function formatCompletionRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric * 100)}%`;
}

function humanizeFallbackMode(mode) {
  switch (mode) {
    case "exact_prior_year":
      return "exact prior year";
    case "same_weekday_prior_year":
      return "same weekday prior year";
    case "exact_prior_years_2_to_4":
      return "same date from 2-4 years back";
    case "same_weekday_prior_years_2_to_4":
      return "same weekday from 2-4 years back";
    case "carry_forward_no_history":
      return "carry current bookings";
    default:
      return null;
  }
}

function getProjectionSummaryLines(day) {
  const projection = day?.projection || getMatrixProjection(day?.matrix || day);
  const explanation = projection?.explanations?.support_total_dog_volume;
  if (!explanation || !projection?.lead_days) return [];

  const lines = [];
  if (explanation.exact_prior_year_final !== null && explanation.exact_prior_year_final !== undefined) {
    const completion = explanation.exact_prior_year_final > 0
      ? formatCompletionRate((explanation.exact_prior_year_as_of || 0) / explanation.exact_prior_year_final)
      : null;
    lines.push(`${explanation.lead_days} days out. On this same date last year, ${explanation.exact_prior_year_as_of || 0} of ${explanation.exact_prior_year_final} final dogs were already booked by this point${completion ? ` (${completion})` : ""}.`);
  }
  if (explanation.fallback_mode && explanation.fallback_mode !== "exact_prior_year" && explanation.fallback_mode !== "carry_forward_no_history") {
    lines.push(`Fallback: using ${humanizeFallbackMode(explanation.fallback_mode)} (${explanation.sample_count || 0} sample${explanation.sample_count === 1 ? "" : "s"}).`);
  }
  if (!lines.length) {
    lines.push(`${explanation.lead_days} days out. Projected demand uses historical GINGR booking pace for this same date.`);
  }
  return lines;
}

function getProjectionTooltip({ explanation, currentValue, projectedValue }) {
  if (!explanation) {
    return `${currentValue} currently booked. Projected to ${projectedValue}.`;
  }

  const lines = [
    `${currentValue} currently booked -> ${projectedValue} projected`,
    `${explanation.lead_days || 0} days out`,
  ];

  if (explanation.exact_prior_year_final !== null && explanation.exact_prior_year_final !== undefined) {
    lines.push(`Exact prior year: ${explanation.exact_prior_year_as_of || 0} booked by now, ${explanation.exact_prior_year_final} final`);
  }
  if (explanation.completion_rate !== null && explanation.completion_rate !== undefined) {
    const rate = formatCompletionRate(explanation.completion_rate);
    if (rate) lines.push(`Completion rate used: ${rate}`);
  }
  const fallback = humanizeFallbackMode(explanation.fallback_mode);
  if (fallback && explanation.fallback_mode !== "exact_prior_year") {
    lines.push(`Fallback mode: ${fallback}`);
  }
  if (explanation.sample_count) {
    lines.push(`Sample count: ${explanation.sample_count}`);
  }

  return lines.join("\n");
}

function renderMatrixCellValue({ row, day, mode }) {
  const currentValue = getDayMatrixValue(day, row, "current");
  const projectedValue = getDayMatrixValue(day, row, "projected");
  const comparisonValue = row.comparison ? currentValue : null;
  const projection = getDayProjection(day);
  const missingValue = (mode === "projected" ? projectedValue : currentValue) === null || (mode === "projected" ? projectedValue : currentValue) === undefined;

  if (row.comparison) {
    return {
      title: comparisonValue === null || comparisonValue === undefined ? "No year-over-year comparison available." : `Exact same date last year total dog volume: ${comparisonValue}`,
      content: comparisonValue === null || comparisonValue === undefined ? "—" : comparisonValue,
      missingValue: comparisonValue === null || comparisonValue === undefined,
    };
  }

  if (mode === "projected" && projection?.lead_days > 0) {
    const explanation = projection?.explanations?.[row.key.replaceAll(".", "_")] || null;
    const currentText = currentValue ?? "—";
    const projectedText = projectedValue ?? currentValue ?? "—";
    const title = getProjectionTooltip({
      explanation,
      currentValue: currentText,
      projectedValue: projectedText,
    });

    return {
      title,
      content: (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut }}>{currentText}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.pri }}>→</span>
          <span style={{ fontSize: 16, fontWeight: row.total ? 800 : 700, color: C.text }}>{projectedText}</span>
        </div>
      ),
      missingValue,
    };
  }

  return {
    title: missingValue ? "No data available for this row." : `${currentValue}`,
    content: missingValue ? "—" : currentValue,
    missingValue,
  };
}

// ─── Staff Shift Input ────────────────────────────────────────────────────

function createDefaultShiftEntry(day, position = "pct") {
  const defaultStart = day?.isWeekend ? "07:00" : "06:00";
  const defaultEnd = "13:00";
  return {
    id: `${position}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    position,
    name: "",
    shift_start: defaultStart,
    shift_end: defaultEnd,
  };
}

function StaffShiftPlanner({ day, onSave, onGenerated, disabled }) {
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

  const handleSave = () => {
    const cleaned = shiftEntries
      .map((entry) => ({
        ...entry,
        name: String(entry.name || "").trim(),
        shift_start: String(entry.shift_start || "").slice(0, 5),
        shift_end: String(entry.shift_end || "").slice(0, 5),
      }))
      .filter((entry) => entry.shift_start && entry.shift_end);

    const plan = deriveStaffPlanFromShiftEntries({
      locationId: day?.matrix?.location_id,
      planDate: day.date,
      shiftEntries: cleaned,
    });

    onSave(plan);
    setDirty(false);
    onGenerated?.();
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

function countShiftCoverage(entries, startTime, endTime) {
  const startMinutes = Number(startTime?.split(":")?.[0] || 0) * 60 + Number(startTime?.split(":")?.[1] || 0);
  const endMinutes = Number(endTime?.split(":")?.[0] || 0) * 60 + Number(endTime?.split(":")?.[1] || 0);
  return entries.filter((entry) => {
    const entryStart = Number(entry.shift_start?.split(":")?.[0] || 0) * 60 + Number(entry.shift_start?.split(":")?.[1] || 0);
    const entryEnd = Number(entry.shift_end?.split(":")?.[0] || 0) * 60 + Number(entry.shift_end?.split(":")?.[1] || 0);
    return entryStart < endMinutes && entryEnd > startMinutes;
  }).length;
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function SchedulingPage({ data, nav, profile, addGlobalToast }) {
  const locationId = profile?.location_id;
  const today = todayStr();
  const [viewStartDate, setViewStartDate] = useState(getMondayStart(today));
  const [matrixMode, setMatrixMode] = useState("current");

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
    computeRotationSchedule,
  } = useSchedulingData(locationId, viewStartDate);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [scheduleView, setScheduleView] = useState("optimal");
  const [expandedMatrixGroups, setExpandedMatrixGroups] = useState(new Set());

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
  const matrixRowGroups = useMemo(() => buildMatrixRowGroups(workbookDays), [workbookDays]);
  const allMatrixGroupsExpanded = matrixRowGroups.length > 0 && matrixRowGroups.every((group) => expandedMatrixGroups.has(group.section));
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
  const selectedDay = workbookDays[selectedDayIdx] || workbookDays[0];
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
    setSelectedDayIdx(viewStartDate === getMondayStart(today) ? getDayIndexFromMonday(today) : 0);
  }, [viewStartDate, today]);

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
      addGlobalToast?.(blocker || "This day is not ready for schedule generation yet.", "info");
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
  const visibleWarnings = visibleRotation?.warnings || [];
  const saveButtonLabel = showingAdjustedSchedule ? "Save Staff-Adjusted Schedule" : "Save Optimal Schedule";
  const generateDisabled = !selectedDay?.canGenerate || !visibleRotation?.saveable_payload;
  const generateDisabledReason = rotationError || selectedDay?.generationBlockers?.[0] || "This day is not ready for schedule generation yet.";

  const gridData = visibleRotation?.grid || { lanes: [], slots: [], cells: {} };
  const { lanes, slots, cells: serverGrid } = gridData;

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
          <p style={{ fontSize: 13, color: C.textMut, marginTop: 2 }}>Week plan, required headcount, and rotation rationale</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {error && <span style={{ fontSize: 11, color: C.dan }}>{error}</span>}
          <Btn variant="secondary" size="sm" onClick={refresh}>Refresh</Btn>
          <Btn variant="secondary" size="sm" onClick={() => setShowAssumptions(!showAssumptions)}>
            {showAssumptions ? "Hide" : "Show"} Assumptions
          </Btn>
          <Btn variant="primary" size="sm" onClick={handleGenerate} disabled={generateDisabled} title={generateDisabledReason}>
            {saveButtonLabel}
          </Btn>
        </div>
      </div>

      {/* ── Section 1: 7-Day Workbook Matrix ──────────────────────────── */}
      <SectionCard title="7-Day Demand Matrix" subtitle="Days are columns. Rows show the dogs you walk into at opening, the dogs you close with at night, peak daytime volume, and key support workload." icon={<I.Calendar />}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="secondary" size="sm" onClick={() => setViewStartDate(addDays(viewStartDate, -7))}>← Previous Week</Btn>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{formatWeekRange(viewStartDate)}</div>
            <Btn variant="secondary" size="sm" onClick={() => setViewStartDate(getMondayStart(today))}>This Week</Btn>
            <Btn variant="secondary" size="sm" onClick={() => setViewStartDate(addDays(viewStartDate, 7))}>Next Week →</Btn>
            {loading && <span style={{ fontSize: 11, color: C.textMut }}>Loading week…</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
        <div style={{ fontSize: 11, color: C.textMut, marginBottom: 14, lineHeight: 1.6 }}>
          GINGR source rows mirror Calendar Details totals. Operational rows use the same source totals for top-line counts, with playgroup splits kept separate for staffing workload.
          {matrixMode === "projected" && " Projected mode shows currently booked values moving to a statistically projected final count based on historical pickup pace from Gingr reservation created dates."}
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#F8FAFC", width: 250, padding: "12px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut }}>
                  Operational Metric
                </th>
                {workbookDays.map((day, index) => {
                  const selected = index === selectedDayIdx;
                  const blocked = !day.canGenerate;
                  const comparison = getMatrixComparison(day.matrix || day);
                  return (
                    <th
                      key={day.date}
                      onClick={() => setSelectedDayIdx(index)}
                      style={{
                        cursor: "pointer",
                        width: 112,
                        padding: "10px 8px 12px",
                        textAlign: "center",
                        borderBottom: `1px solid ${C.border}`,
                        background: selected ? "#EEF4FF" : "#F8FAFC",
                        boxShadow: selected ? `inset 0 -2px 0 ${C.pri}` : "none",
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 800, color: selected ? C.pri : C.text, lineHeight: 1.1 }}>
                        {day.dayName}
                      </div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{formatMatrixDate(day.date)}</div>
                      <div style={{ marginTop: 8 }}>
                        <TrustBadge state={day.matrixTrustState} blocked={blocked} />
                      </div>
                      {comparison?.last_year_total_dog_volume !== null && comparison?.last_year_total_dog_volume !== undefined && (
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 6 }}>
                          LY total: {comparison.last_year_total_dog_volume}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: blocked ? C.dan : day.generationBlockers.length > 0 ? C.warn : C.textMut, marginTop: 6, minHeight: 28, lineHeight: 1.35 }}>
                        {blocked
                          ? (day.generationBlockers[0] || "Waiting on matrix")
                          : day.generationBlockers.length > 0
                            ? "Verification warnings to review before publish"
                            : "Ready to schedule"}
                      </div>
                      {matrixMode === "projected" && getProjectionSummaryLines(day).length > 0 && (
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
                    Weekly Total
                  </div>
                  <div style={{ fontSize: 10, color: C.textMut, marginTop: 6 }}>
                    Dog-days across visible week
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixRowGroups.flatMap((group) => {
                const groupExpanded = expandedMatrixGroups.has(group.section);
                const visibleRows = group.rows.filter((row) => groupExpanded || row.total || row.alwaysVisible);
                return (
                  [
                    <tr key={`${group.section}-section`}>
                      <td style={{ position: "sticky", left: 0, zIndex: 2, padding: "8px 12px", background: "#F8FAFC", borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}` }}>
                        <button
                          onClick={() => toggleMatrixGroup(group.section)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            color: C.textMut,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ display: "flex", transform: groupExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><I.ChevronDown /></span>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group.section}</span>
                          {!groupExpanded && <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut }}>+{Math.max(group.rows.length - visibleRows.length, 0)}</span>}
                        </button>
                      </td>
                      {workbookDays.map((day, index) => (
                        <td key={`${group.section}-${day.date}`} style={{ background: index === selectedDayIdx ? "#F8FBFF" : "#F8FAFC", borderBottom: `1px solid ${C.borderLight}` }} />
                      ))}
                      <td style={{ position: "sticky", right: 0, zIndex: 2, background: "#F8FAFC", borderBottom: `1px solid ${C.borderLight}`, boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)" }} />
                    </tr>,
                    ...visibleRows.map((row) => (
                      <tr key={row.key}>
                        <td style={{ position: "sticky", left: 0, zIndex: 2, padding: "9px 12px", background: row.total ? "#F4F7FB" : C.surface, borderBottom: row.total ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}`, fontSize: 12, fontWeight: row.total ? 800 : 600, color: C.text }}>
                          {row.label}
                        </td>
                        {workbookDays.map((day, index) => {
                          const selected = index === selectedDayIdx;
                          const cellValue = renderMatrixCellValue({
                            row,
                            day,
                            mode: matrixMode,
                          });
                          return (
                            <td
                              key={`${row.key}-${day.date}`}
                              onClick={() => setSelectedDayIdx(index)}
                              title={cellValue.title}
                              style={{
                                cursor: "pointer",
                                textAlign: "center",
                                padding: "10px 8px",
                                borderBottom: row.total ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`,
                                background: row.total ? (selected ? "#EAF2FF" : "#F4F7FB") : (selected ? "#F8FBFF" : C.surface),
                                color: cellValue.missingValue ? C.textMut : row.total ? C.text : C.textSec,
                                fontSize: cellValue.missingValue ? 11 : 16,
                                fontWeight: row.total ? 800 : 700,
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
                            borderBottom: row.total ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`,
                            background: row.total ? "#F4F7FB" : C.surface,
                            color: row.total ? C.text : C.textSec,
                            fontSize: 16,
                            fontWeight: row.total ? 800 : 700,
                            boxShadow: "-8px 0 12px rgba(15, 23, 42, 0.05)",
                          }}
                        >
                          {(() => {
                            const total = workbookDays.reduce((sum, day) => {
                              const value = getDayMatrixValue(day, row, matrixMode);
                              const numeric = Number(value);
                              return Number.isFinite(numeric) ? sum + numeric : sum;
                            }, 0);

                            if (matrixMode === "projected" && !row.comparison) {
                              const currentTotal = workbookDays.reduce((sum, day) => {
                                const value = getDayMatrixValue(day, row, "current");
                                const numeric = Number(value);
                                return Number.isFinite(numeric) ? sum + numeric : sum;
                              }, 0);
                              return (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut }}>{currentTotal}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: C.pri }}>→</span>
                                  <span>{total}</span>
                                </div>
                              );
                            }

                            return total;
                          })()}
                        </td>
                      </tr>
                    )),
                  ]
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 11, color: C.textMut }}>
            Selected day: <span style={{ fontWeight: 700, color: C.text }}>{selectedDay?.dayName} {formatMatrixDate(selectedDay?.date || today)}</span>
          </span>
          <span style={{ fontSize: 11, color: C.textMut }}>
            {matrixMode === "projected"
              ? (
                getProjectionSummaryLines(selectedDay).join(" • ")
                || "Projected mode uses prior-year booking pace from GINGR created dates."
              )
              : `Trust notes: ${selectedDay?.trust?.notes?.length ? selectedDay.trust.notes.join(" ") : "Verified rows are ready for staffing logic."}`}
          </span>
          <span style={{ fontSize: 11, color: C.textMut }}>
            Weekly totals shown in the workbook are dog-days, not unique reservations.
          </span>
        </div>
      </SectionCard>

      {/* ── Section 1b: Staff Plan Input ──────────────────────────────── */}
      {selectedDay && (
        <SectionCard
          title={`Staff Shift Plan — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="Optional second step. The ideal BE rotation schedule already auto-generates from projected Gingr demand; enter real shifts to compare and adjust it."
          icon={<I.Users />}
          style={{ marginTop: 16 }}
        >
          <StaffShiftPlanner day={selectedDay} onSave={handleStaffPlanSave} onGenerated={() => setScheduleView("actual_staffing")} />
          <p style={{ fontSize: 11, color: C.textMut, marginTop: 10, lineHeight: 1.6 }}>
            Enter shifts in the format <strong>Position | Name | Shift Start | Shift End</strong>. Saving the shift plan keeps the optimal schedule intact and creates a staff-adjusted comparison view for this day.
          </p>
        </SectionCard>
      )}

      {/* ── Section 2: Optimal Headcount ───────────────────────────────── */}
      {selectedDay && (
        <SectionCard
          title={`Optimal Headcount — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="The ideal opening and closing shift recommendation auto-generates from projected GINGR demand. Peak daytime coverage is absorbed into those two shifts instead of being shown as a third shift."
          icon={<I.Users />}
          style={{ marginTop: 16 }}
        >
          {!selectedDay.canGenerate || !optimalRotation ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: C.warnLt, border: `1px solid ${C.warn}22` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Headcount stays provisional until this day has a trusted matrix.
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 6, lineHeight: 1.6 }}>
                {generateDisabledReason}
              </div>
              {selectedDay.generationBlockers.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
                  {selectedDay.generationBlockers.map((blocker, index) => <li key={index}>{blocker}</li>)}
                </ul>
              )}
            </div>
          ) : (
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
        </SectionCard>
      )}

      {/* ── Section 3: Full-Day Rotation Grid ─────────────────────────── */}
      {selectedDay && (
        <SectionCard
          title={`Rotation Schedule — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="The ideal BE rotation schedule auto-generates from projected Gingr demand. Save shifts above to compare the optimal plan with a staff-adjusted version."
          icon={<I.Clipboard />}
          style={{ marginTop: 16 }}
        >
          {!selectedDay?.canGenerate ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: C.surfaceHover, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Rotation generation is locked until the selected day has a trusted matrix.
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 6, lineHeight: 1.6 }}>
                {generateDisabledReason}
              </div>
              {selectedDay.generationBlockers.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
                  {selectedDay.generationBlockers.map((blocker, index) => <li key={index}>{blocker}</li>)}
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
                      {lanes.map((lane) => (
                        <th key={lane.id} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textAlign: "center", color: C.textMut, whiteSpace: "nowrap", background: "#F8FAFC" }}>{lane.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot, index) => (
                      <tr key={slot.time}>
                        <td style={{ position: "sticky", left: 0, zIndex: 1, background: slot.segment === "pre_open" ? "#F8FAFC" : index % 2 === 0 ? "#F8FAFC" : "#F1F5F9", padding: `${rowH / 2 - 6}px 10px`, borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}`, fontWeight: slot.segment === "pre_open" ? 700 : 600, color: C.text, whiteSpace: "nowrap", fontSize: 10 }}>{slot.label}</td>
                        {lanes.map((lane) => {
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
                    {lanes.find((lane) => lane.id === selectedCell.laneId)?.label} at {fmt12(selectedCell.slotTime)}
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

// K9 Operations — Scheduling Page
// Week Plan + Day Rotation + Required Headcount + Explanation + Warnings + Assumptions
// Uses live Supabase data from scheduling_matrix_daily.

import React, { useState, useMemo, useCallback } from "react";
import { C, todayStr, addDays, DAY_NAMES_SHORT } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn } from "../../shared/ui";
import { useSchedulingData } from "../../hooks/useSchedulingData";
import {
  TASK_COLORS,
  buildDaySummary,
  serializeSchedule,
  applyOverride,
  getMatrixDisplay,
  getMatrixProjectedDisplay,
  getMatrixProjection,
  getMatrixComparison,
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
    section: "Opening Boarding",
    rows: [
      { key: "opening.large_boarding", label: "Large Boarding Opening" },
      { key: "opening.small_boarding", label: "Small Boarding Opening" },
      { key: "opening.private_play_boarding", label: "Private Play Boarding Opening" },
      { key: "opening.half_and_half_boarding", label: "Half and Half Boarding Opening", optional: true },
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
      { key: "comparison.last_year_total_dog_volume", label: "Last Year Total Dog Volume", optional: true, comparison: true },
      { key: "support.tours", label: "Tours" },
    ],
  },
];

function getNestedValue(obj, key) {
  return key.split(".").reduce((acc, part) => acc?.[part], obj);
}

function getDayMatrixValue(day, row, mode = "current") {
  if (row.comparison) {
    return getNestedValue({ comparison: day.comparison || {} }, row.key);
  }

  const source = mode === "projected" ? day.projectedDisplay : day.currentDisplay;
  return getNestedValue(source, row.key);
}

function hasAnyNonZeroValue(days, key) {
  return days.some((day) => {
    const value = key.startsWith("comparison.")
      ? getNestedValue({ comparison: day.comparison || {} }, key)
      : (
        getNestedValue(day.currentDisplay, key)
        ?? getNestedValue(day.projectedDisplay, key)
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

function renderMatrixCellValue({ row, day, mode }) {
  const currentValue = getDayMatrixValue(day, row, "current");
  const projectedValue = getDayMatrixValue(day, row, "projected");
  const comparisonValue = row.comparison ? currentValue : null;
  const missingValue = (mode === "projected" ? projectedValue : currentValue) === null || (mode === "projected" ? projectedValue : currentValue) === undefined;

  if (row.comparison) {
    return {
      title: comparisonValue === null || comparisonValue === undefined ? "No year-over-year comparison available." : `Exact same date last year total dog volume: ${comparisonValue}`,
      content: comparisonValue === null || comparisonValue === undefined ? "—" : comparisonValue,
      missingValue: comparisonValue === null || comparisonValue === undefined,
    };
  }

  if (mode === "projected" && day.projection?.lead_days > 0) {
    const explanation = day.projection?.explanations?.[row.key.replaceAll(".", "_")] || null;
    const currentText = currentValue ?? "—";
    const projectedText = projectedValue ?? currentValue ?? "—";
    const title = explanation
      ? `${currentText} currently booked. Projected to ${projectedText}. ${explanation.sample_count || 0} historical samples at ${explanation.lead_days} days out.`
      : `${currentText} currently booked. Projected to ${projectedText}.`;

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

// ─── Staff Plan Input (inline mini-form) ──────────────────────────────────

function StaffPlanInput({ day, onSave, disabled }) {
  const sp = day.staffPlan || {};
  const [pct, setPct] = useState(sp.pct_count || 0);
  const [csr, setCsr] = useState(sp.csr_count || 0);
  const [supPresent, setSupPresent] = useState(sp.supervisor_present || false);
  const [csrAsPct, setCsrAsPct] = useState(sp.allow_csr_as_pct || false);
  const [dirty, setDirty] = useState(false);

  const handleSave = () => {
    onSave({
      plan_date: day.date,
      shift: "full",
      pct_count: pct,
      csr_count: csr,
      supervisor_count: supPresent ? 1 : 0,
      mod_count: 0,
      supervisor_present: supPresent,
      allow_csr_as_pct: csrAsPct,
      allow_mod_as_pct: false,
      staff_names: [],
    });
    setDirty(false);
  };

  const inputStyle = { width: 48, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: "center", fontFamily: "inherit" };
  const labelStyle = { fontSize: 11, color: C.textMut, fontWeight: 600 };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={labelStyle}>PCTs</span>
        <input type="number" min={0} max={20} value={pct} onChange={e => { setPct(+e.target.value); setDirty(true); }} style={inputStyle} disabled={disabled} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={labelStyle}>CSRs</span>
        <input type="number" min={0} max={10} value={csr} onChange={e => { setCsr(+e.target.value); setDirty(true); }} style={inputStyle} disabled={disabled} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textSec, cursor: "pointer" }}>
        <input type="checkbox" checked={supPresent} onChange={e => { setSupPresent(e.target.checked); setDirty(true); }} disabled={disabled} />
        SUP present
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textSec, cursor: "pointer" }}>
        <input type="checkbox" checked={csrAsPct} onChange={e => { setCsrAsPct(e.target.checked); setDirty(true); }} disabled={disabled} />
        CSR→fPCT
      </label>
      {dirty && <Btn variant="primary" size="sm" onClick={handleSave}>Save Plan</Btn>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function SchedulingPage({ data, nav, profile, addGlobalToast }) {
  const locationId = profile?.location_id;
  const today = todayStr();
  const [viewStartDate, setViewStartDate] = useState(today);
  const [matrixMode, setMatrixMode] = useState("current");

  const { weekData, config, loading, error, refresh, upsertStaffPlan, saveSchedule, publishSchedule, applyScheduleOverride, fetchScheduleVersions, runAudit } = useSchedulingData(locationId, viewStartDate);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [viewDensity, setViewDensity] = useState("standard");
  const [showAssumptions, setShowAssumptions] = useState(false);

  // Version & override state
  const [savedVersions, setSavedVersions] = useState([]);
  const [activeScheduleId, setActiveScheduleId] = useState(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // { lane, slot }
  const [overrideTask, setOverrideTask] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [localGrid, setLocalGrid] = useState(null); // For live override preview
  const [auditResult, setAuditResult] = useState(null);
  const [auditRunning, setAuditRunning] = useState(false);

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
  const auditByDate = useMemo(
    () => new Map((auditResult?.days || []).map((day) => [day.date, day])),
    [auditResult]
  );

  const selectedDay = workbookDays[selectedDayIdx] || workbookDays[0];

  // Build full day summary (including opening solver + grid) for selected day
  const daySummary = useMemo(() => {
    if (!selectedDay?.matrix) return null;
    return buildDaySummary(selectedDay.matrix, selectedDay.staffPlan, config);
  }, [selectedDay, config]);

  // Reset override state when day changes
  const prevDayRef = React.useRef(selectedDayIdx);
  React.useEffect(() => {
    if (prevDayRef.current !== selectedDayIdx) {
      setOverrideMode(false);
      setSelectedCell(null);
      setLocalGrid(null);
      setActiveScheduleId(null);
      setSavedVersions([]);
      prevDayRef.current = selectedDayIdx;
    }
  }, [selectedDayIdx]);

  React.useEffect(() => {
    setSelectedDayIdx(0);
    setAuditResult(null);
  }, [viewStartDate]);

  const handleStaffPlanSave = useCallback(async (plan) => {
    try {
      await upsertStaffPlan(plan);
      addGlobalToast?.("Staff plan saved", "success");
    } catch (err) {
      addGlobalToast?.("Failed to save staff plan: " + (err.message || "unknown error"), "error");
    }
  }, [upsertStaffPlan, addGlobalToast]);

  // Generate & save schedule
  const handleGenerate = useCallback(async () => {
    if (!selectedDay?.staffPlan) {
      addGlobalToast?.("Enter a staff plan first to generate a schedule.", "info");
      return;
    }
    if (!daySummary?.canGenerate || !daySummary?.openingResult) {
      const blocker = daySummary?.generationBlockers?.[0] || selectedDay?.generationBlockers?.[0];
      addGlobalToast?.(blocker || "This day is not ready for schedule generation yet.", "info");
      return;
    }
    try {
      const payload = serializeSchedule(selectedDay.matrix, selectedDay.staffPlan, daySummary, config);
      const result = await saveSchedule(payload);
      setActiveScheduleId(result.id);
      setLocalGrid(null);
      addGlobalToast?.(`Schedule saved as draft v${result.version}: ${daySummary.openingResult.selectedReason}`, "success");

      // Refresh versions
      const versions = await fetchScheduleVersions(selectedDay.date);
      setSavedVersions(versions);
    } catch (err) {
      // If table doesn't exist yet, still show the local schedule
      if (err?.code === "42P01") {
        addGlobalToast?.(`Schedule generated locally (table not deployed yet): ${daySummary.openingResult.selectedReason}`, "success");
      } else {
        addGlobalToast?.("Failed to save schedule: " + (err.message || "unknown error"), "error");
      }
    }
  }, [daySummary, selectedDay, config, saveSchedule, fetchScheduleVersions, addGlobalToast]);

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
    const { lane, slot } = selectedCell;

    if (activeScheduleId) {
      // Persist to DB
      try {
        await applyScheduleOverride(activeScheduleId, lane, slot, overrideTask, overrideReason);
        addGlobalToast?.(`Override applied: ${lane} at ${slot} → ${TASK_COLORS[overrideTask]?.label || overrideTask}`, "success");
      } catch (err) {
        if (err?.code !== "42P01") {
          addGlobalToast?.("Failed to save override: " + (err.message || "unknown error"), "error");
        }
      }
    }

    // Apply locally for immediate visual feedback
    const currentGrid = localGrid || daySummary?.grid?.grid || {};
    const result = applyOverride(currentGrid, lane, slot, overrideTask, overrideReason);
    setLocalGrid(result.grid);
    setSelectedCell(null);
    setOverrideTask("");
    setOverrideReason("");
  }, [selectedCell, overrideTask, overrideReason, activeScheduleId, localGrid, daySummary, applyScheduleOverride, addGlobalToast]);

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

  const handleRunAudit = useCallback(async () => {
    try {
      setAuditRunning(true);
      const result = await runAudit({
        dateFrom: viewStartDate,
        dateTo: addDays(viewStartDate, 6),
      });
      setAuditResult(result);
      const summary = result?.summary || {};
      if ((summary.mismatching_days || 0) > 0 || (summary.missing_days || 0) > 0) {
        addGlobalToast?.(`Audit finished: ${summary.matching_days || 0} matched, ${summary.mismatching_days || 0} mismatched, ${summary.missing_days || 0} missing matrix day(s).`, "info");
      } else {
        addGlobalToast?.(`Audit finished: all ${summary.matching_days || 0} visible day(s) match live Gingr data.`, "success");
      }
    } catch (err) {
      addGlobalToast?.("Scheduling audit failed: " + (err.message || "unknown error"), "error");
    } finally {
      setAuditRunning(false);
    }
  }, [runAudit, viewStartDate, addGlobalToast]);

  const display = selectedDay?.currentDisplay || getMatrixDisplay(selectedDay?.matrix || {});
  const matrixDisplay = matrixMode === "projected"
    ? (selectedDay?.projectedDisplay || display)
    : display;
  const req = daySummary?.required || { am: 0, midday: 0, pm: 0, functionalHours: 0 };
  const assignedPct = selectedDay?.assignedFunctioningPct || 0;
  const generateDisabled = !selectedDay?.staffPlan || !daySummary?.canGenerate;
  const generateDisabledReason = !selectedDay?.staffPlan
    ? "Enter a staff plan to enable schedule generation."
    : (daySummary?.generationBlockers?.[0] || selectedDay?.generationBlockers?.[0] || "This day is not ready for schedule generation.");

  const gridData = daySummary?.grid || { lanes: [], slots: [], grid: {}, phases: null };
  const { lanes, slots, grid, phases } = gridData;

  const fmt12 = (t) => {
    const [h, mn] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(mn).padStart(2, "0")} ${suffix}`;
  };

  const rowH = viewDensity === "compact" ? 26 : viewDensity === "expanded" ? 40 : 32;

  if (loading && weekData.length === 0) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 0", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: C.textMut }}>Loading scheduling data...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 0 48px" }}>
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
            Generate Schedule
          </Btn>
        </div>
      </div>

      {/* ── Section 1: 7-Day Workbook Matrix ──────────────────────────── */}
      <SectionCard title="7-Day Demand Matrix" subtitle="Days are columns. Rows show the dogs you walk into at opening, the dogs you close with at night, peak daytime volume, and key support workload." icon={<I.Calendar />}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="secondary" size="sm" onClick={() => setViewStartDate(addDays(viewStartDate, -7))}>← Previous Week</Btn>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{formatWeekRange(viewStartDate)}</div>
            <Btn variant="secondary" size="sm" onClick={() => setViewStartDate(today)}>This Week</Btn>
            <Btn variant="secondary" size="sm" onClick={() => setViewStartDate(addDays(viewStartDate, 7))}>Next Week →</Btn>
            {loading && <span style={{ fontSize: 11, color: C.textMut }}>Loading week…</span>}
            {auditRunning && <span style={{ fontSize: 11, color: C.textMut }}>Auditing live Gingr…</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Btn variant="secondary" size="sm" onClick={handleRunAudit} disabled={auditRunning || loading}>
              {auditRunning ? "Running Audit…" : "Run Audit"}
            </Btn>
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
          Total dog volume equals total boarding dogs closing plus total daycare dogs. Tours stay separate so the operational dog count is easy to read.
          {matrixMode === "projected" && " Projected mode shows currently booked values moving to a statistically projected final count based on historical pickup pace from Gingr reservation created dates."}
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, minWidth: 1260 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: "#F8FAFC", minWidth: 300, padding: "14px 16px", textAlign: "left", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut }}>
                  Operational Metric
                </th>
                {workbookDays.map((day, index) => {
                  const selected = index === selectedDayIdx;
                  const blocked = day.generationBlockers.length > 0;
                  const auditDay = auditByDate.get(day.date);
                  const baseBackground = auditDay?.status === "match"
                    ? "#F0FDF4"
                    : auditDay?.status === "mismatch"
                      ? "#FEF2F2"
                      : "#F8FAFC";
                  return (
                    <th
                      key={day.date}
                      onClick={() => setSelectedDayIdx(index)}
                      style={{
                        cursor: "pointer",
                        minWidth: 122,
                        padding: "12px 12px 14px",
                        textAlign: "center",
                        borderBottom: `1px solid ${C.border}`,
                        background: selected ? "#EEF4FF" : baseBackground,
                        boxShadow: selected
                          ? `inset 0 -2px 0 ${C.pri}`
                          : auditDay?.status === "match"
                            ? "inset 0 -2px 0 #16A34A"
                            : auditDay?.status === "mismatch"
                              ? "inset 0 -2px 0 #DC2626"
                              : "none",
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 800, color: selected ? C.pri : C.text, lineHeight: 1.1 }}>
                        {day.dayName}
                      </div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{formatMatrixDate(day.date)}</div>
                      <div style={{ marginTop: 8 }}>
                        <TrustBadge state={day.matrixTrustState} blocked={blocked} />
                      </div>
                      {day.comparison?.last_year_total_dog_volume !== null && day.comparison?.last_year_total_dog_volume !== undefined && (
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 6 }}>
                          LY total: {day.comparison.last_year_total_dog_volume}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: blocked ? C.dan : C.textMut, marginTop: 6, minHeight: 14 }}>
                        {blocked ? `${day.generationBlockers.length} blocker${day.generationBlockers.length === 1 ? "" : "s"}` : day.canGenerate ? "Ready to schedule" : "Waiting on matrix"}
                      </div>
                      {auditDay && (
                        <div style={{ fontSize: 10, color: auditDay.status === "match" ? C.suc : auditDay.status === "mismatch" ? C.dan : C.textMut, marginTop: 6, minHeight: 14 }}>
                          {auditDay.status === "match"
                            ? "Audit OK"
                            : auditDay.status === "mismatch"
                              ? `Audit Δ${auditDay.mismatch_count}`
                              : "Audit missing"}
                        </div>
                      )}
                    </th>
                  );
                })}
                <th style={{ minWidth: 132, padding: "12px 12px 14px", textAlign: "center", borderBottom: `1px solid ${C.border}`, background: "#F8FAFC" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>
                    Weekly Total
                  </div>
                  <div style={{ fontSize: 10, color: C.textMut, marginTop: 6 }}>
                    Visible week
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixRowGroups.flatMap((group) => {
                return (
                  [
                    <tr key={`${group.section}-section`}>
                      <td style={{ position: "sticky", left: 0, zIndex: 1, padding: "12px 16px 8px", background: "#F8FAFC", borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}`, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut }}>
                        {group.section}
                      </td>
                      {workbookDays.map((day, index) => (
                        <td key={`${group.section}-${day.date}`} style={{ background: index === selectedDayIdx ? "#F8FBFF" : "#F8FAFC", borderBottom: `1px solid ${C.borderLight}` }} />
                      ))}
                      <td style={{ background: "#F8FAFC", borderBottom: `1px solid ${C.borderLight}` }} />
                    </tr>,
                    ...group.rows.map((row) => (
                      <tr key={row.key}>
                        <td style={{ position: "sticky", left: 0, zIndex: 1, padding: "10px 16px", background: row.total ? "#F4F7FB" : C.surface, borderBottom: row.total ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}`, fontSize: 13, fontWeight: row.total ? 800 : 600, color: C.text }}>
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
                            textAlign: "center",
                            padding: "10px 8px",
                            borderBottom: row.total ? `2px solid ${C.border}` : `1px solid ${C.borderLight}`,
                            background: row.total ? "#F4F7FB" : C.surface,
                            color: row.total ? C.text : C.textSec,
                            fontSize: 16,
                            fontWeight: row.total ? 800 : 700,
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
              ? `Projection basis: ${selectedDay?.projection?.sample_count || 0} historical sample dates at ${selectedDay?.projection?.lead_days || 0} days out.`
              : `Trust notes: ${selectedDay?.trust?.notes?.length ? selectedDay.trust.notes.join(" ") : "Verified rows are ready for staffing logic."}`}
          </span>
          {auditResult?.summary && (
            <span style={{ fontSize: 11, color: C.textMut }}>
              Audit: {auditResult.summary.matching_days} matched, {auditResult.summary.mismatching_days} mismatched, {auditResult.summary.missing_days} missing.
            </span>
          )}
        </div>
        {auditResult?.days?.length > 0 && (
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {auditResult.days.map((dayAudit) => (
              <div
                key={dayAudit.date}
                style={{
                  border: `1px solid ${dayAudit.status === "match" ? "#86EFAC" : dayAudit.status === "mismatch" ? "#FCA5A5" : C.border}`,
                  background: dayAudit.status === "match" ? "#F0FDF4" : dayAudit.status === "mismatch" ? "#FEF2F2" : C.surface,
                  borderRadius: 12,
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                    {new Date(`${dayAudit.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: dayAudit.status === "match" ? C.suc : dayAudit.status === "mismatch" ? C.dan : C.textMut }}>
                    {dayAudit.status === "match" ? "MATCH" : dayAudit.status === "mismatch" ? "MISMATCH" : "MISSING"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>
                  {dayAudit.status === "match"
                    ? "Visible matrix matches live Gingr reservation and icon data."
                    : dayAudit.status === "missing_matrix"
                      ? "This day has no matrix row to compare yet."
                      : `${dayAudit.mismatch_count} metric difference${dayAudit.mismatch_count === 1 ? "" : "s"} found.`}
                </div>
                {dayAudit.status === "mismatch" && (
                  <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                    {dayAudit.mismatches.slice(0, 4).map((mismatch) => (
                      <div key={mismatch.key} style={{ fontSize: 11, color: C.textSec, lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700 }}>{mismatch.label}:</span> matrix {mismatch.matrix_value}, Gingr {mismatch.gingr_value}
                      </div>
                    ))}
                    {dayAudit.mismatches.length > 4 && (
                      <div style={{ fontSize: 11, color: C.textMut }}>
                        {dayAudit.mismatches.length - 4} more difference{dayAudit.mismatches.length - 4 === 1 ? "" : "s"} hidden.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Section 1b: Staff Plan Input ──────────────────────────────── */}
      {selectedDay && (
        <SectionCard
          title={`Staff Plan — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="Enter available staff for this day. Drives required headcount and schedule generation."
          icon={<I.Users />}
          style={{ marginTop: 16 }}
        >
          <StaffPlanInput day={selectedDay} onSave={handleStaffPlanSave} />
          {!selectedDay.staffPlan && (
            <p style={{ fontSize: 11, color: C.warn, marginTop: 8, fontStyle: "italic" }}>
              No staff plan entered yet. Required headcount is computed from the demand matrix; enter a staff plan to see gap analysis and generate schedules.
            </p>
          )}
        </SectionCard>
      )}

      {/* ── Section 2: Required Headcount ──────────────────────────────── */}
      {selectedDay && (
        <SectionCard
          title={`Required Headcount — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="Functioning PCT requirement by daypart, driven by the trusted matrix above"
          icon={<I.Users />}
          style={{ marginTop: 16 }}
        >
          {!selectedDay.canShowHeadcount ? (
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {[
                  { label: "Opening (AM)", required: req.am },
                  { label: "Midday", required: req.midday },
                  { label: "Closing (PM)", required: req.pm },
                ].map(({ label, required: reqVal }) => {
                  const gap = Math.max(0, reqVal - assignedPct);
                  const hasGap = assignedPct > 0 && assignedPct < reqVal;
                  return (
                    <div key={label} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: C.textMut, letterSpacing: "0.04em", marginBottom: 8 }}>{label}</div>
                      <div style={{ display: "flex", gap: 20 }}>
                        <MetricPill label="Required" value={reqVal} />
                        {selectedDay.staffPlan && <MetricPill label="Assigned" value={assignedPct} warn={hasGap} />}
                        {selectedDay.staffPlan && <MetricPill label="Gap" value={gap} sub={hasGap ? "short" : "covered"} warn={hasGap} />}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedDay.staffPlan && (
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, padding: "10px 14px", borderRadius: 10, background: req.functionalHours > 0 ? C.sucLt : C.surfaceHover }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Estimated Functional Hours</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{req.functionalHours} hrs</span>
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* ── Section 3: Full-Day Rotation Grid ─────────────────────────── */}
      {selectedDay && (
        <SectionCard
          title={`Rotation Schedule — ${selectedDay.dayName} ${selectedDay.dayNum}`}
          subtitle="Full-day 15-minute slot assignments. Automated only when the selected day is fully trusted."
          icon={<I.Clipboard />}
          style={{ marginTop: 16 }}
        >
          {!daySummary?.canGenerate ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: C.surfaceHover, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Rotation generation is locked until the selected day is fully trusted.
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
          {/* Toolbar: density + override toggle + publish */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {["compact", "standard", "expanded"].map(d => (
              <button key={d} onClick={() => setViewDensity(d)} style={{ padding: "4px 12px", border: `1px solid ${d === viewDensity ? C.pri : C.border}`, borderRadius: 8, background: d === viewDensity ? C.priLt : C.surface, color: d === viewDensity ? C.pri : C.textMut, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", textTransform: "capitalize" }}>{d}</button>
            ))}
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

          {/* Version selector */}
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

          {/* Violations banner */}
          {(daySummary?.violations || []).length > 0 && (
            <div style={{ marginBottom: 12, padding: "8px 14px", borderRadius: 8, background: C.danLt, border: `1px solid ${C.dan}22` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.dan }}>Constraint Violations ({daySummary.violations.length})</span>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11, color: C.dan }}>
                {daySummary.violations.slice(0, 5).map((v, i) => <li key={i}>{v.message}</li>)}
                {daySummary.violations.length > 5 && <li>...and {daySummary.violations.length - 5} more</li>}
              </ul>
            </div>
          )}

          {/* Override panel */}
          {overrideMode && selectedCell && (
            <div style={{ marginBottom: 12, padding: "12px 16px", borderRadius: 10, background: C.warnLt, border: `1px solid ${C.warn}33` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                Override: {selectedCell.lane} at {fmt12(selectedCell.slot)}
                <span style={{ fontWeight: 400, color: C.textMut, marginLeft: 8 }}>
                  Current: {TASK_COLORS[(localGrid || grid)[selectedCell.lane]?.[selectedCell.slot]]?.label || "—"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={overrideTask} onChange={e => setOverrideTask(e.target.value)} style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}>
                  <option value="">Select task…</option>
                  {Object.entries(TASK_COLORS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <input placeholder="Reason (optional)" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", minWidth: 160 }} />
                <Btn variant="primary" size="sm" onClick={handleApplyOverride} disabled={!overrideTask}>Apply Override</Btn>
                <button onClick={() => { setSelectedCell(null); setOverrideTask(""); setOverrideReason(""); }} style={{ padding: "4px 12px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.textMut, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}` }}>
            <table style={{ borderCollapse: "collapse", fontSize: viewDensity === "compact" ? 10 : 11, minWidth: 600, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: "#F8FAFC", padding: "6px 10px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textAlign: "left", color: C.textMut }}>Time</th>
                  {lanes.map(l => (
                    <th key={l} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textAlign: "center", color: C.textMut, whiteSpace: "nowrap", background: "#F8FAFC" }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((t, ti) => (
                  <tr key={t}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: ti % 4 === 0 ? "#F1F5F9" : "#F8FAFC", padding: `${rowH / 2 - 5}px 10px`, borderBottom: `1px solid ${ti % 4 === 3 ? C.border : C.borderLight}`, borderRight: `1px solid ${C.border}`, fontWeight: ti % 4 === 0 ? 700 : 400, color: ti % 4 === 0 ? C.text : C.textMut, whiteSpace: "nowrap", fontSize: 10 }}>{fmt12(t)}</td>
                    {lanes.map(l => {
                      const displayGrid = localGrid || grid;
                      const taskKey = displayGrid[l]?.[t] || "float";
                      const tc = TASK_COLORS[taskKey] || TASK_COLORS.float;
                      const isSelected = overrideMode && selectedCell?.lane === l && selectedCell?.slot === t;
                      return (
                        <td
                          key={l}
                          onClick={overrideMode ? () => setSelectedCell({ lane: l, slot: t }) : undefined}
                          style={{
                            padding: `${rowH / 2 - 5}px 6px`,
                            textAlign: "center",
                            borderBottom: `1px solid ${ti % 4 === 3 ? C.border : C.borderLight}`,
                            background: isSelected ? "#FBBF24" : tc.bg,
                            color: isSelected ? "#000" : tc.text,
                            fontWeight: 600,
                            fontSize: viewDensity === "compact" ? 9 : 10,
                            whiteSpace: "nowrap",
                            letterSpacing: "0.02em",
                            cursor: overrideMode ? "pointer" : "default",
                            outline: isSelected ? "2px solid #F59E0B" : "none",
                          }}
                        >
                          {viewDensity !== "compact" ? tc.label : taskKey.toUpperCase()}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {Object.entries(TASK_COLORS).map(([k, v]) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: v.text }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: v.bg, border: `1px solid ${v.text}22` }} />
                {v.label}
              </span>
            ))}
          </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── Section 4: Rationale / Explanation Panel ───────────────────── */}
      {daySummary?.openingResult && (
        <SectionCard
          title="Opening Rationale"
          subtitle="Why this headcount was recommended and which strategy was selected"
          icon={<I.InfoCircle />}
          style={{ marginTop: 16 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "12px 16px", borderRadius: 10, background: C.priLt, border: `1px solid ${C.pri}22` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, marginBottom: 4 }}>
                Strategy: {daySummary.openingResult.strategy === "full_pod_pass" ? "Full Pod Pass" : "Split (Group Let-Outs + PP Pod Pass)"}
              </div>
              <p style={{ fontSize: 12, color: C.textSec, margin: 0, lineHeight: 1.6 }}>
                {daySummary.openingResult.selectedReason}
              </p>
            </div>

            {/* Explanation lines */}
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Explanation</span>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
                {daySummary.explanation.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Key Driver</span>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "4px 0 0" }}>
                  {display.support.total_dog_volume || 0} total dogs drive the {req.am} functioning PCT opening requirement
                </p>
              </div>
              {daySummary.openingResult.yardOrder && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>First Yard</span>
                  <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "4px 0 0" }}>
                    {daySummary.openingResult.yardOrder === "large" ? "Large" : "Small"} daycare opened first
                    ({daySummary.openingResult.yardOrder === "large" ? (display.opening.large_boarding || 0) : (display.opening.small_boarding || 0)} dogs &gt; {daySummary.openingResult.yardOrder === "large" ? (display.opening.small_boarding || 0) : (display.opening.large_boarding || 0)} other-side dogs)
                  </p>
                </div>
              )}
              <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Feasibility</span>
                <p style={{ fontSize: 12, fontWeight: 600, color: daySummary.openingResult.feasible ? C.suc : C.dan, margin: "4px 0 0" }}>
                  {daySummary.openingResult.feasible ? "Feasible — opening covered with current staffing" : "Infeasible — additional functioning PCTs needed"}
                </p>
              </div>
              <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Bath Target</span>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "4px 0 0" }}>
                  {display.support.departure_baths || 0} departure baths — {(display.support.departure_baths || 0) > 6 ? "may require dedicated bath fPCT by 07:30" : "manageable within normal rotation"}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Section 5: Shortage / Warnings Area ───────────────────────── */}
      <SectionCard
        title="Shortages & Warnings"
        subtitle="Issues that need manager attention for the selected day"
        icon={<I.AlertTriangle />}
        style={{ marginTop: 16 }}
      >
        {(!selectedDay?.warnings || selectedDay.warnings.length === 0) ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
            <I.CheckCircle />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.suc }}>
              {selectedDay?.staffPlan ? "No shortages or warnings for this day. All dayparts covered." : "Enter a staff plan to see shortage analysis."}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedDay.warnings.map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: C.warnLt, border: `1px solid ${C.warn}22` }}>
                <I.AlertTriangle style={{ color: C.warn, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{w}</div>
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                    {w.includes("Opening") && "Consider moving a CSR to functioning PCT role during early AM or requesting MOD backfill."}
                    {w.includes("Bath") && "Bath throughput may push completion past the target window. Consider starting baths at 06:30 or adding a second bath functioning PCT."}
                    {w.includes("PM") && "Afternoon closing coverage is short. Return-to-room transport and dinner feed may run late."}
                    {w.includes("unknown size") && "Future arrivals lack playgroup icon data. Size classification will update after check-in."}
                    {w.includes("No staff plan") && "Enter a staff plan above to enable gap analysis and schedule generation."}
                    {w.includes("PP") && "High private play load may require a dedicated functioning PCT throughout the day."}
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

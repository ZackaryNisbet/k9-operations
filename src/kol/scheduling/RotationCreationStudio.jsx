import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn } from "../../shared/ui";
import {
  TASK_COLORS,
  deriveStaffPlanFromShiftEntries,
} from "../../shared/schedulingEngine";
import {
  findRotationTemplateCandidates,
  getTemplateDisplayName,
} from "./rotationTemplateMatcher";
import {
  buildBlankRotationPreviewGrid,
  buildTemplatePreviewGrid,
  mapTemplatePreviewToServerGrid,
} from "./rotationTemplatePreview";
import {
  addScheduleDays,
  dateToIso,
  formatDayLabel,
  formatTimeLabel,
  getCalendarMonthLabel,
  getCompactScheduleDateLabel,
  getDateScheduleState,
  getFullScheduleDateLabel,
  getNextSaturday,
  getRelativeScheduleDateLabel,
  getScheduleCalendarDates,
  getScheduleMonthStart,
  getScheduleWeekStart,
  parseScheduleDate,
  shiftScheduleMonth,
} from "./rotationStudio/rotationStudioDates";
import {
  ROLE_CONFIG,
  SHIFT_CONFIG,
  buildDefaultStaffingMatrix,
  countShiftTotal,
  reconcileShiftDetails,
  toCount,
} from "./rotationStudio/rotationStudioStaffing";
import {
  clonePreviewGrid,
  getCandidateId,
  getTaskCell,
} from "./rotationStudio/rotationStudioGrid";
import { rotationStudioStyles } from "./rotationStudio/rotationStudioStyles";
import { CountStepper } from "./rotationStudio/CountStepper";
import { RosterEditor } from "./rotationStudio/RosterEditor";
import { TemplateCard } from "./rotationStudio/TemplateCard";

const TASK_PICKER_KEYS = [
  "lgdc",
  "smdc",
  "pp",
  "break",
  "bath",
  "transport",
  "feed",
  "opening",
  "room_clean",
  "sup",
  "float",
  "off",
];

function PreviewCanvas({
  grid,
  hoverGrid,
  applied,
  customizeMode,
  selectedCell,
  onSelectCell,
}) {
  const lanes = grid.lanes || [];
  const slots = grid.slots || [];
  const isHoveringDifferentTemplate = Boolean(hoverGrid);
  const canEditCells = Boolean(customizeMode && applied);

  return (
    <div className="rotation-preview-canvas">
      <div className="rotation-preview-header">
        <div>
          <span className="rotation-preview-eyebrow">Schedule canvas</span>
          <h4>{applied ? "Template draft" : "Blank grid"}</h4>
        </div>
        <span className={`rotation-preview-status${isHoveringDifferentTemplate ? " is-preview" : applied ? " is-applied" : ""}`}>
          {isHoveringDifferentTemplate ? "Preview only" : applied ? "Cell edits active" : "Choose a template"}
        </span>
      </div>
      <div className="rotation-preview-scroll">
        <div
          className="rotation-preview-grid"
          style={{
            gridTemplateColumns: `92px repeat(${Math.max(lanes.length, 1)}, minmax(128px, 1fr))`,
          }}
        >
          <div className="rotation-preview-axis is-corner">Time</div>
          {lanes.map((lane) => (
            <div key={lane.id} className="rotation-preview-lane">
              <span>{lane.label}</span>
              <small>{lane.role || "pct"}</small>
            </div>
          ))}
          {slots.map((slot) => (
            <React.Fragment key={slot.time}>
              <div className="rotation-preview-time">{slot.label || formatTimeLabel(slot.time)}</div>
              {lanes.map((lane) => {
                const committed = grid.cells?.[lane.id]?.[slot.time] || null;
                const ghost = hoverGrid?.cells?.[lane.id]?.[slot.time] || null;
                const cell = ghost || committed;
                const taskKey = cell?.task || "off";
                const color = TASK_COLORS[taskKey] || TASK_COLORS.float;
                const isSelected = selectedCell?.laneId === lane.id && selectedCell?.slotTime === slot.time;
                return (
                  <button
                    key={`${lane.id}-${slot.time}`}
                    type="button"
                    className={`rotation-preview-cell${ghost ? " is-ghost" : committed ? " is-filled" : " is-empty"}${isSelected ? " is-selected" : ""}${canEditCells ? " is-editable" : ""}`}
                    onClick={() => {
                      if (canEditCells) onSelectCell({ laneId: lane.id, slotTime: slot.time });
                    }}
                    disabled={!canEditCells}
                    style={{
                      "--cell-bg": taskKey === "off" ? "#FFFFFF" : color.bg,
                      "--cell-text": taskKey === "off" ? "#94A3B8" : color.text,
                      "--cell-border": taskKey === "off" ? "#E5E7EB" : `${color.text}24`,
                    }}
                    title={canEditCells ? `Edit ${lane.label} at ${slot.label || formatTimeLabel(slot.time)}` : "Apply a template before editing cells"}
                    aria-label={`${canEditCells ? "Edit" : "Preview"} ${lane.label} at ${slot.label || formatTimeLabel(slot.time)}`}
                  >
                    {cell ? (
                      <>
                        <span>{cell.label || color.label}</span>
                        {cell.detail && <small>{cell.detail}</small>}
                      </>
                    ) : (
                      <span className="rotation-preview-empty-copy">Open</span>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function CellInspector({ cell, laneLabel, onApplyTask, onClose }) {
  if (!cell) return null;
  return (
    <div className="rotation-cell-inspector">
      <div>
        <strong>Cell edit</strong>
        <span>{formatTimeLabel(cell.slotTime)} · {laneLabel || cell.laneId}</span>
      </div>
      <div className="rotation-task-palette">
        {TASK_PICKER_KEYS.map((key) => {
          const task = TASK_COLORS[key];
          if (!task) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onApplyTask(key)}
              style={{
                background: task.bg,
                color: task.text,
                borderColor: `${task.text}22`,
              }}
            >
              {task.label}
            </button>
          );
        })}
      </div>
      <button type="button" className="rotation-inspector-close" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

const CALENDAR_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RotationDateSelector({
  selectedDay,
  today,
  visibleDays,
  monthDate,
  onMonthChange,
  onSelectDate,
  onClose,
  onFetchScheduleSummaries,
}) {
  const selectedDate = selectedDay?.date || today || dateToIso(new Date());
  const calendarDates = useMemo(() => getScheduleCalendarDates(monthDate || selectedDate), [monthDate, selectedDate]);
  const [versionSummaries, setVersionSummaries] = useState({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const visibleByDate = useMemo(() => (
    new Map((visibleDays || []).filter((entry) => entry?.date).map((entry) => [entry.date, entry]))
  ), [visibleDays]);
  const selectedVisibleDay = visibleByDate.get(selectedDate) || selectedDay;
  const selectedSummary = versionSummaries[selectedDate] || null;
  const selectedState = getDateScheduleState({
    date: selectedDate,
    today,
    visibleDay: selectedVisibleDay,
    summary: selectedSummary,
  });
  const quickDates = useMemo(() => {
    const weekStart = getScheduleWeekStart(today || selectedDate);
    return [
      { label: "Today", date: today || selectedDate },
      { label: "Tomorrow", date: addScheduleDays(today || selectedDate, 1) },
      { label: "Next weekend", date: getNextSaturday(today || selectedDate) },
      { label: "Next week", date: addScheduleDays(weekStart, 7) },
      { label: "Last week", date: addScheduleDays(weekStart, -7) },
    ];
  }, [selectedDate, today]);
  const submittedDates = useMemo(() => (
    Object.entries(versionSummaries)
      .filter(([date, summary]) => date.slice(0, 7) === (monthDate || selectedDate).slice(0, 7) && summary?.total > 0)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)
  ), [monthDate, selectedDate, versionSummaries]);

  useEffect(() => {
    if (!onFetchScheduleSummaries || calendarDates.length === 0) return undefined;
    let cancelled = false;
    setSummaryLoading(true);
    onFetchScheduleSummaries({
      startDate: calendarDates[0],
      endDate: calendarDates[calendarDates.length - 1],
    })
      .then((summaries) => {
        if (!cancelled) setVersionSummaries(summaries || {});
      })
      .catch(() => {
        if (!cancelled) setVersionSummaries({});
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [calendarDates, onFetchScheduleSummaries]);

  const chooseDate = useCallback((date) => {
    onSelectDate?.(date);
    onClose?.();
  }, [onClose, onSelectDate]);

  return (
    <div className="rotation-date-panel" role="dialog" aria-label="Select rotation schedule date">
      <div className="rotation-date-panel-header">
        <div className="rotation-date-heading">
          <span className="rotation-date-kicker">Schedule date</span>
          <strong>{getFullScheduleDateLabel(selectedDate)}</strong>
          <span>{selectedState.detail}</span>
        </div>
        <div className="rotation-date-month-controls">
          <button type="button" onClick={() => onMonthChange(shiftScheduleMonth(monthDate, -1))} aria-label="Previous month">
            <I.Back />
          </button>
          <span>{getCalendarMonthLabel(monthDate || selectedDate)}</span>
          <button type="button" onClick={() => onMonthChange(shiftScheduleMonth(monthDate, 1))} aria-label="Next month">
            <I.ChevronRight />
          </button>
          <button type="button" className="rotation-date-close" onClick={onClose} aria-label="Close date selector">
            <I.X />
          </button>
        </div>
      </div>

      <div className="rotation-date-layout">
        <div className="rotation-calendar-pane">
          <div className="rotation-date-quick-row">
            {quickDates.map((quick) => (
              <button
                key={quick.label}
                type="button"
                className={quick.date === selectedDate ? "is-active" : ""}
                onClick={() => chooseDate(quick.date)}
              >
                {quick.label}
              </button>
            ))}
          </div>
          <div className="rotation-calendar-weekdays">
            {CALENDAR_WEEKDAYS.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="rotation-calendar-grid">
            {calendarDates.map((date) => {
              const parsed = parseScheduleDate(date);
              const visibleDay = visibleByDate.get(date);
              const summary = versionSummaries[date] || null;
              const state = getDateScheduleState({ date, today, visibleDay, summary });
              const inMonth = date.slice(0, 7) === (monthDate || selectedDate).slice(0, 7);
              const selected = date === selectedDate;
              const current = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  className={`rotation-calendar-day is-${state.tone}${inMonth ? "" : " is-outside"}${selected ? " is-selected" : ""}${current ? " is-today" : ""}`}
                  onClick={() => chooseDate(date)}
                  aria-label={`${getFullScheduleDateLabel(date)}. ${state.label}`}
                  title={`${getFullScheduleDateLabel(date)}\n${state.detail}`}
                >
                  <span className="rotation-calendar-day-top">
                    <span>{parsed ? parsed.getDate() : ""}</span>
                    {current && <small>Today</small>}
                  </span>
                  <span className="rotation-calendar-day-status">{state.label}</span>
                  <span className="rotation-calendar-day-dots" aria-hidden="true">
                    {summary?.published > 0 && <i className="is-published" />}
                    {summary?.draft > 0 && <i className="is-draft" />}
                    {visibleDay?.staffPlan && <i className="is-staffed" />}
                    {visibleDay?.canGenerate && <i className="is-ready" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rotation-date-summary-panel">
          <div className={`rotation-date-selected-card is-${selectedState.tone}`}>
            <span className="rotation-date-selected-icon"><I.Calendar /></span>
            <div>
              <span>{getRelativeScheduleDateLabel(selectedDate, today) || "Selected"}</span>
              <strong>{getCompactScheduleDateLabel(selectedDate)}</strong>
            </div>
            <span className="rotation-date-state-pill">{selectedState.label}</span>
          </div>

          <div className="rotation-date-signal-grid">
            <div>
              <span>Versions</span>
              <strong>{selectedSummary?.total || 0}</strong>
            </div>
            <div>
              <span>Matrix</span>
              <strong>{selectedVisibleDay?.canGenerate ? "Ready" : selectedVisibleDay?.hasNoData ? "Missing" : "Open"}</strong>
            </div>
            <div>
              <span>Staff</span>
              <strong>{selectedVisibleDay?.staffPlan ? "Saved" : "None"}</strong>
            </div>
          </div>

          <div className="rotation-date-submissions">
            <div className="rotation-date-submissions-title">
              <span>Submitted schedules</span>
              {summaryLoading && <small>Loading</small>}
            </div>
            {submittedDates.length ? (
              submittedDates.map(([date, summary]) => {
                const state = getDateScheduleState({
                  date,
                  today,
                  visibleDay: visibleByDate.get(date),
                  summary,
                });
                return (
                  <button key={date} type="button" onClick={() => chooseDate(date)}>
                    <span>{getCompactScheduleDateLabel(date)}</span>
                    <strong>{state.label}</strong>
                    <small>v{summary.latestVersion || 1}</small>
                  </button>
                );
              })
            ) : (
              <div className="rotation-date-empty-state">
                No saved rotations in {getCalendarMonthLabel(monthDate || selectedDate)}.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function RotationCreationStudio({
  day,
  rotation,
  config,
  matrixMode,
  serverGridData,
  onSaveStaffPlan,
  onGenerated,
  onApplyTemplateGrid,
  onSaveDay,
  canSaveDay,
  saveDisabledReason,
  disabled = false,
  templateCatalogSummary,
  visibleDays = [],
  today,
  onSelectDate,
  onFetchScheduleSummaries,
}) {
  const defaultMatrix = useMemo(() => buildDefaultStaffingMatrix(day, rotation), [day?.date, rotation?.shift_recommendations]);
  const [staffingMatrix, setStaffingMatrix] = useState(defaultMatrix);
  const [activeShift, setActiveShift] = useState("opening");
  const [shiftDetails, setShiftDetails] = useState(() => reconcileShiftDetails(null, defaultMatrix, day, config));
  const [rosterOpen, setRosterOpen] = useState(false);
  const [hoveredTemplateId, setHoveredTemplateId] = useState("");
  const [draftGrids, setDraftGrids] = useState({ opening: null, closing: null });
  const [appliedTemplateIds, setAppliedTemplateIds] = useState({ opening: "", closing: "" });
  const [selectedCell, setSelectedCell] = useState(null);
  const [customizeMode, setCustomizeMode] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(getScheduleMonthStart(day?.date || today));
  const datePickerRef = useRef(null);

  useEffect(() => {
    setStaffingMatrix(defaultMatrix);
    setShiftDetails(reconcileShiftDetails(null, defaultMatrix, day, config));
    setHoveredTemplateId("");
    setDraftGrids({ opening: null, closing: null });
    setAppliedTemplateIds({ opening: "", closing: "" });
    setSelectedCell(null);
    setCustomizeMode(false);
    setCalendarMonth(getScheduleMonthStart(day?.date || today));
  }, [day?.date, defaultMatrix, config, today]);

  useEffect(() => {
    if (!datePickerOpen) return undefined;
    const handlePointerDown = (event) => {
      if (datePickerRef.current?.contains(event.target)) return;
      setDatePickerOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDatePickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [datePickerOpen]);

  const demandDisplay = matrixMode === "projected" ? day?.projectedDisplay : day?.currentDisplay;
  const candidates = useMemo(() => ({
    opening: findRotationTemplateCandidates({
      date: day?.date,
      shift: "opening",
      counts: staffingMatrix.opening,
      demandDisplay,
    }, 7),
    closing: findRotationTemplateCandidates({
      date: day?.date,
      shift: "closing",
      counts: staffingMatrix.closing,
      demandDisplay,
    }, 7),
  }), [day?.date, demandDisplay, staffingMatrix]);

  const activeCandidates = candidates[activeShift] || [];
  const activeCounts = staffingMatrix[activeShift] || {};
  const activeTemplate = activeCandidates.find((match) => getCandidateId(match) === hoveredTemplateId);
  const activeDraftGrid = draftGrids[activeShift];
  const blankGrid = useMemo(
    () => buildBlankRotationPreviewGrid({ shift: activeShift, staffingCounts: activeCounts }),
    [activeShift, activeCounts],
  );
  const hoverGrid = useMemo(() => {
    if (!activeTemplate?.template) return null;
    return buildTemplatePreviewGrid(activeTemplate.template, { shift: activeShift, staffingCounts: activeCounts });
  }, [activeTemplate, activeCounts, activeShift]);
  const displayedGrid = activeDraftGrid || blankGrid;
  const selectedLaneLabel = displayedGrid?.lanes?.find((lane) => lane.id === selectedCell?.laneId)?.label || "";
  const visibleHoverGrid = hoveredTemplateId && hoveredTemplateId !== appliedTemplateIds[activeShift] ? hoverGrid : null;
  const serverGridReady = Boolean(serverGridData?.lanes?.length && serverGridData?.slots?.length);
  const hasAnyDraft = Boolean(draftGrids.opening || draftGrids.closing);
  const appliedMatch = activeCandidates.find((match) => getCandidateId(match) === appliedTemplateIds[activeShift]);

  const syncDraftsToParent = useCallback((nextDrafts) => {
    const activeDrafts = Object.values(nextDrafts || {}).filter(Boolean);
    if (!activeDrafts.length) {
      onApplyTemplateGrid?.(null);
      return;
    }
    if (!serverGridReady) return;
    let combined = serverGridData?.cells || {};
    for (const grid of activeDrafts) {
      combined = mapTemplatePreviewToServerGrid(grid, {
        ...serverGridData,
        cells: combined,
      });
    }
    onApplyTemplateGrid?.(combined);
  }, [onApplyTemplateGrid, serverGridData, serverGridReady]);

  const updateCount = useCallback((shiftKey, roleKey, value) => {
    setStaffingMatrix((current) => {
      const next = {
        ...current,
        [shiftKey]: {
          ...current[shiftKey],
          [roleKey]: toCount(value),
        },
      };
      setShiftDetails((details) => reconcileShiftDetails(details, next, day, config));
      return next;
    });
    setHoveredTemplateId("");
    setDraftGrids((current) => {
      const next = { ...current, [shiftKey]: null };
      syncDraftsToParent(next);
      return next;
    });
    setAppliedTemplateIds((current) => ({ ...current, [shiftKey]: "" }));
    setSelectedCell(null);
  }, [config, day, syncDraftsToParent]);

  const updateRosterRow = useCallback((rowId, patch) => {
    setShiftDetails((current) => ({
      ...current,
      [activeShift]: (current?.[activeShift] || []).map((row) => (
        row.id === rowId ? { ...row, ...patch } : row
      )),
    }));
  }, [activeShift]);

  const applyTemplate = useCallback((match) => {
    if (!match?.template) return;
    const preview = buildTemplatePreviewGrid(match.template, {
      shift: activeShift,
      staffingCounts: staffingMatrix[activeShift],
    });
    const templateId = getCandidateId(match);
    const nextDrafts = { ...draftGrids, [activeShift]: preview };
    setDraftGrids(nextDrafts);
    setAppliedTemplateIds((current) => ({ ...current, [activeShift]: templateId }));
    setCustomizeMode(true);
    setSelectedCell(null);
    syncDraftsToParent(nextDrafts);
  }, [activeShift, draftGrids, staffingMatrix, syncDraftsToParent]);

  const clearActiveTemplate = useCallback(() => {
    const nextDrafts = { ...draftGrids, [activeShift]: null };
    setDraftGrids(nextDrafts);
    setAppliedTemplateIds((current) => ({ ...current, [activeShift]: "" }));
    setSelectedCell(null);
    syncDraftsToParent(nextDrafts);
  }, [activeShift, draftGrids, syncDraftsToParent]);

  const applyTaskToSelectedCell = useCallback((taskKey) => {
    if (!selectedCell || !activeDraftGrid) return;
    const nextGrid = clonePreviewGrid(activeDraftGrid);
    if (!nextGrid.cells[selectedCell.laneId]) nextGrid.cells[selectedCell.laneId] = {};
    nextGrid.cells[selectedCell.laneId][selectedCell.slotTime] = getTaskCell(taskKey);
    const nextDrafts = { ...draftGrids, [activeShift]: nextGrid };
    setDraftGrids(nextDrafts);
    syncDraftsToParent(nextDrafts);
  }, [activeDraftGrid, activeShift, draftGrids, selectedCell, syncDraftsToParent]);

  const saveStaffPlan = useCallback(() => {
    const entries = SHIFT_CONFIG.flatMap((shift) => shiftDetails?.[shift.key] || []);
    const plan = deriveStaffPlanFromShiftEntries({
      locationId: day?.matrix?.location_id,
      planDate: day?.date,
      shiftEntries: entries,
      notes: hasAnyDraft
        ? `Template draft prepared for ${Object.entries(appliedTemplateIds).filter(([, value]) => value).map(([shift]) => shift).join(" and ")}.`
        : "Generated from Scheduling Rotation Studio staffing counts.",
    });
    onSaveStaffPlan?.(plan);
    onGenerated?.();
  }, [appliedTemplateIds, day?.date, day?.matrix?.location_id, hasAnyDraft, onGenerated, onSaveStaffPlan, shiftDetails]);

  const activeShiftRows = shiftDetails?.[activeShift] || [];
  const appliedSummary = appliedMatch?.template
    ? `Matched: ${getTemplateDisplayName(appliedMatch)}`
    : hasAnyDraft
      ? "One shift has an applied template"
      : "Hover a template to preview it in the grid";

  return (
    <div className="rotation-studio-shell">
      <style>{rotationStudioStyles(C)}</style>

      <div className="rotation-date-picker-frame" ref={datePickerRef}>
        <div className="rotation-config-bar" aria-label="Rotation staffing configuration">
          <button
            type="button"
            className={`rotation-config-segment rotation-date-trigger${datePickerOpen ? " is-open" : ""}`}
            onClick={() => {
              setCalendarMonth(getScheduleMonthStart(day?.date || today));
              setDatePickerOpen((value) => !value);
            }}
            aria-expanded={datePickerOpen}
            aria-haspopup="dialog"
          >
            <span className="rotation-config-kicker">Day</span>
            <span className="rotation-date-trigger-row">
              <span className="rotation-config-title">{formatDayLabel(day)}</span>
              <span className="rotation-date-trigger-icon" aria-hidden="true">
                <I.ChevronDown />
              </span>
            </span>
          </button>
          <div className="rotation-config-segment">
            <span className="rotation-config-kicker">Shift</span>
            <div className="rotation-shift-toggle">
              {SHIFT_CONFIG.map((shift) => (
                <button
                  key={shift.key}
                  type="button"
                  className={activeShift === shift.key ? "is-active" : ""}
                  onClick={() => {
                    setActiveShift(shift.key);
                    setHoveredTemplateId("");
                    setSelectedCell(null);
                  }}
                >
                  {shift.label}
                </button>
              ))}
            </div>
          </div>
          {ROLE_CONFIG.map((role) => (
            <div key={role.key} className="rotation-config-segment">
              <CountStepper
                label={role.label}
                value={activeCounts[role.key]}
                disabled={disabled}
                onChange={(value) => updateCount(activeShift, role.key, value)}
              />
            </div>
          ))}
          <div className="rotation-config-segment">
            <span className="rotation-total-pill">
              <I.Users />
              {countShiftTotal(activeCounts)} total
            </span>
          </div>
        </div>

        {datePickerOpen && (
          <RotationDateSelector
            selectedDay={day}
            today={today}
            visibleDays={visibleDays}
            monthDate={calendarMonth}
            onMonthChange={setCalendarMonth}
            onSelectDate={onSelectDate}
            onClose={() => setDatePickerOpen(false)}
            onFetchScheduleSummaries={onFetchScheduleSummaries}
          />
        )}
      </div>

      <div className="rotation-studio-toolbar">
        <div className="rotation-studio-caption">
          <strong>{appliedSummary}</strong>
          <span>
            {serverGridReady
              ? "Hover previews stay temporary. Click applies a template to the local draft grid."
              : "Server grid is still loading, so template previews are local until rotation compute returns."}
          </span>
        </div>
        <div className="rotation-action-buttons">
          <button type="button" className="rotation-muted-button" onClick={() => setRosterOpen((value) => !value)}>
            {rosterOpen ? "Hide names and times" : "Names and time edits"}
          </button>
          {activeDraftGrid && (
            <button type="button" className="rotation-muted-button" onClick={clearActiveTemplate}>
              Clear {SHIFT_CONFIG.find((shift) => shift.key === activeShift)?.short} template
            </button>
          )}
        </div>
      </div>

      {rosterOpen && (
        <div className="rotation-roster-panel">
          <div className="rotation-studio-caption">
            <strong>{SHIFT_CONFIG.find((shift) => shift.key === activeShift)?.label} people</strong>
            <span>Names are optional. Start and end times are saved with the staff plan when you generate actual staffing.</span>
          </div>
          <RosterEditor rows={activeShiftRows} onChange={updateRosterRow} disabled={disabled} />
        </div>
      )}

      <div className="rotation-template-section">
        <div className="rotation-template-section-header">
          <div>
            <h3>Matching templates</h3>
            <p>
              {templateCatalogSummary?.templateCount || 0} templates indexed. Best {activeShift === "opening" ? "AM" : "PM"} matches for active headcount.
            </p>
          </div>
          <span className="rotation-preview-status">
            {activeCandidates.length} candidates
          </span>
        </div>
        <div className="rotation-template-rail" role="listbox" aria-label="Rotation template matches">
          {activeCandidates.map((match) => {
            const id = getCandidateId(match);
            return (
              <TemplateCard
                key={id}
                match={match}
                applied={appliedTemplateIds[activeShift] === id}
                previewing={hoveredTemplateId === id}
                onPreview={() => setHoveredTemplateId(id)}
                onPreviewEnd={() => setHoveredTemplateId("")}
                onApply={() => applyTemplate(match)}
              />
            );
          })}
        </div>
      </div>

      <CellInspector
        cell={selectedCell}
        laneLabel={selectedLaneLabel}
        onApplyTask={applyTaskToSelectedCell}
        onClose={() => setSelectedCell(null)}
      />

      <PreviewCanvas
        grid={displayedGrid}
        hoverGrid={visibleHoverGrid}
        applied={Boolean(activeDraftGrid)}
        customizeMode={customizeMode}
        selectedCell={selectedCell}
        onSelectCell={setSelectedCell}
      />

      <div className="rotation-action-row">
        <div className="rotation-action-note">
          Applying a template creates a local draft overlay only. Saving staff plan and saving the day remain explicit actions.
        </div>
        <div className="rotation-action-buttons">
          <Btn variant="secondary" size="sm" onClick={saveStaffPlan} disabled={disabled || !day?.date}>
            Generate Actual Staffing
          </Btn>
          <Btn variant="primary" size="sm" onClick={onSaveDay} disabled={!canSaveDay} title={saveDisabledReason}>
            Save Day Draft
          </Btn>
        </div>
      </div>
    </div>
  );
}

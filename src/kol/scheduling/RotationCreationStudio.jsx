import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn } from "../../shared/ui";
import { deriveStaffPlanFromShiftEntries } from "../../shared/schedulingEngine";
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
  formatDayLabel,
  getScheduleMonthStart,
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
import { PreviewCanvas } from "./rotationStudio/PreviewCanvas";
import { CellInspector } from "./rotationStudio/CellInspector";
import { RotationDateSelector } from "./rotationStudio/RotationDateSelector";

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

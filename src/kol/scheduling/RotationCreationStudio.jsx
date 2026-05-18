import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const ROLE_CONFIG = [
  { key: "pct", label: "PCT", short: "PCT", position: "pct" },
  { key: "supervisor", label: "Supervisor", short: "SUP", position: "supervisor" },
  { key: "csr", label: "CSR", short: "CSR", position: "csr" },
  { key: "manager", label: "MOD", short: "MOD", position: "mod" },
];

const SHIFT_CONFIG = [
  { key: "opening", label: "Opening", short: "AM" },
  { key: "closing", label: "Closing", short: "PM" },
];

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

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(24, Math.round(number))) : 0;
}

function isWeekendDate(date) {
  const parsed = new Date(`${date || ""}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && [0, 6].includes(parsed.getDay());
}

function formatDayLabel(day) {
  if (!day?.date) return "Fresh schedule";
  const parsed = new Date(`${day.date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return day.date;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeLabel(time) {
  const [hourRaw, minute = "00"] = String(time || "00:00").split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute} ${suffix}`;
}

function getShiftWindows(day, config = {}) {
  const weekend = Boolean(day?.isWeekend ?? isWeekendDate(day?.date));
  const siteHours = weekend
    ? config.weekend_site_hours || ["07:00", "18:00"]
    : config.weekday_site_hours || ["06:00", "19:30"];
  return {
    opening: { start: siteHours[0] || (weekend ? "07:00" : "06:00"), end: "13:00" },
    closing: { start: "13:00", end: siteHours[1] || (weekend ? "18:00" : "19:30") },
  };
}

function buildDefaultStaffingMatrix(day, rotation) {
  return {
    opening: {
      manager: 1,
      supervisor: 1,
      csr: 0,
      pct: 4,
    },
    closing: {
      manager: 1,
      supervisor: 1,
      csr: 0,
      pct: 4,
    },
  };
}

function countShiftTotal(counts = {}) {
  return ROLE_CONFIG.reduce((sum, role) => sum + toCount(counts[role.key]), 0);
}

function buildRowsForShift({ shiftKey, counts, day, config, previousRows = [] }) {
  const windows = getShiftWindows(day, config);
  const rows = [];
  for (const role of ROLE_CONFIG) {
    const count = toCount(counts?.[role.key]);
    const prior = previousRows.filter((row) => row.roleKey === role.key);
    for (let index = 0; index < count; index += 1) {
      const existing = prior[index] || {};
      rows.push({
        id: `${shiftKey}-${role.position}-${index + 1}`,
        shiftKey,
        roleKey: role.key,
        position: role.position,
        label: `${role.short} ${index + 1}`,
        name: existing.name || "",
        shift_start: existing.shift_start || windows[shiftKey].start,
        shift_end: existing.shift_end || windows[shiftKey].end,
      });
    }
  }
  return rows;
}

function reconcileShiftDetails(current, matrix, day, config) {
  return Object.fromEntries(SHIFT_CONFIG.map((shift) => [
    shift.key,
    buildRowsForShift({
      shiftKey: shift.key,
      counts: matrix?.[shift.key] || {},
      day,
      config,
      previousRows: current?.[shift.key] || [],
    }),
  ]));
}

function clonePreviewGrid(grid) {
  return {
    ...grid,
    lanes: [...(grid?.lanes || [])],
    slots: [...(grid?.slots || [])],
    cells: Object.fromEntries(Object.entries(grid?.cells || {}).map(([laneId, laneCells]) => [
      laneId,
      { ...laneCells },
    ])),
  };
}

function getCandidateId(match) {
  return match?.template?.id || match?.template?.sourceSheetName || "";
}

function getTaskCell(taskKey, label = "") {
  const task = TASK_COLORS[taskKey] ? taskKey : "float";
  return {
    task,
    label: label || TASK_COLORS[task]?.label || "Available",
    detail: "Manual draft edit",
    source: "custom",
  };
}

function CountStepper({ label, value, onChange, disabled }) {
  const count = toCount(value);
  return (
    <div className="rotation-count-stepper">
      <div>
        <span className="rotation-count-label">{label}</span>
        <span className="rotation-count-value">{count}</span>
      </div>
      <div className="rotation-count-controls">
        <button type="button" onClick={() => onChange(count - 1)} disabled={disabled || count <= 0} aria-label={`Decrease ${label}`}>
          -
        </button>
        <button type="button" onClick={() => onChange(count + 1)} disabled={disabled || count >= 24} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

function TemplateThumbnail({ match }) {
  const template = match?.template;
  const preview = useMemo(() => buildTemplatePreviewGrid(template, { shift: template?.shift }), [template]);
  const lanes = preview.lanes.slice(0, 3);
  const slots = preview.slots.slice(0, 6);
  return (
    <div className="rotation-template-thumb" aria-hidden="true">
      {lanes.map((lane) => (
        <div key={lane.id} className="rotation-template-thumb-lane">
          {slots.map((slot) => {
            const task = preview.cells?.[lane.id]?.[slot.time]?.task || "off";
            const color = TASK_COLORS[task] || TASK_COLORS.float;
            return (
              <span
                key={`${lane.id}-${slot.time}`}
                style={{
                  background: task === "off" ? "#F8FAFC" : color.bg,
                  borderColor: task === "off" ? "#E5E7EB" : `${color.text}22`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TemplateCard({
  match,
  applied,
  previewing,
  onPreview,
  onPreviewEnd,
  onApply,
}) {
  const displayName = getTemplateDisplayName(match);
  const confidence = match?.confidence || "fallback";
  const fit = Math.round(match?.score || 0);
  const explanation = match?.explanation || "Closest workbook match";
  return (
    <button
      type="button"
      className={`rotation-template-card${applied ? " is-applied" : ""}${previewing ? " is-previewing" : ""}`}
      aria-label={`${displayName}. ${confidence} confidence, ${fit} fit. ${explanation}`}
      title={`${displayName}\n${explanation}`}
      onMouseEnter={onPreview}
      onMouseLeave={onPreviewEnd}
      onFocus={onPreview}
      onBlur={onPreviewEnd}
      onClick={onApply}
    >
      <TemplateThumbnail match={match} />
      <span className="rotation-template-card-name">{displayName}</span>
    </button>
  );
}

function RosterEditor({ rows, onChange, disabled }) {
  if (!rows.length) {
    return (
      <div className="rotation-roster-empty">
        Add at least one employee to this shift to enable name and time adjustments.
      </div>
    );
  }
  return (
    <div className="rotation-roster-grid">
      {rows.map((row) => (
        <div key={row.id} className="rotation-roster-row">
          <div className="rotation-roster-role">
            <strong>{row.label}</strong>
            <span>{ROLE_CONFIG.find((role) => role.key === row.roleKey)?.label}</span>
          </div>
          <input
            type="text"
            value={row.name}
            placeholder="Name optional"
            disabled={disabled}
            onChange={(event) => onChange(row.id, { name: event.target.value })}
          />
          <input
            type="time"
            value={row.shift_start}
            disabled={disabled}
            onChange={(event) => onChange(row.id, { shift_start: event.target.value })}
          />
          <input
            type="time"
            value={row.shift_end}
            disabled={disabled}
            onChange={(event) => onChange(row.id, { shift_end: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

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

  useEffect(() => {
    setStaffingMatrix(defaultMatrix);
    setShiftDetails(reconcileShiftDetails(null, defaultMatrix, day, config));
    setHoveredTemplateId("");
    setDraftGrids({ opening: null, closing: null });
    setAppliedTemplateIds({ opening: "", closing: "" });
    setSelectedCell(null);
    setCustomizeMode(false);
  }, [day?.date, defaultMatrix, config]);

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
      <style>{`
        .rotation-studio-shell {
          --studio-ink: ${C.text};
          --studio-muted: ${C.textMut};
          --studio-border: ${C.border};
          --studio-border-light: ${C.borderLight};
          --studio-primary: ${C.pri};
          --studio-primary-soft: ${C.priLt};
          display: grid;
          gap: 12px;
        }
        .rotation-config-bar {
          display: grid;
          grid-template-columns: minmax(160px, 0.9fr) minmax(190px, 1.1fr) repeat(4, minmax(116px, 1fr)) minmax(132px, 0.75fr);
          align-items: stretch;
          gap: 0;
          min-height: 86px;
          border: 1px solid rgba(148, 163, 184, 0.34);
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96)),
            radial-gradient(circle at 12% 0%, rgba(34, 197, 94, 0.12), transparent 34%);
          box-shadow: 0 24px 52px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
          overflow: hidden;
          animation: rotationStudioSettle 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .rotation-config-segment {
          position: relative;
          display: grid;
          align-content: center;
          gap: 6px;
          min-width: 0;
          padding: 15px 18px;
        }
        .rotation-config-segment + .rotation-config-segment {
          border-left: 1px solid rgba(148, 163, 184, 0.22);
        }
        .rotation-config-kicker,
        .rotation-count-label,
        .rotation-preview-eyebrow {
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .rotation-config-title {
          color: var(--studio-ink);
          font-size: 15px;
          font-weight: 900;
          line-height: 1.1;
        }
        .rotation-shift-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 4px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.26);
          background: rgba(241, 245, 249, 0.78);
        }
        .rotation-shift-toggle button {
          border: 0;
          border-radius: 999px;
          padding: 9px 10px;
          background: transparent;
          color: var(--studio-muted);
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          transition: background 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
        }
        .rotation-shift-toggle button.is-active {
          background: #FFFFFF;
          color: var(--studio-primary);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
        }
        .rotation-shift-toggle button:hover {
          transform: translateY(-1px);
        }
        .rotation-count-stepper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }
        .rotation-count-stepper > div:first-child {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .rotation-count-value {
          color: var(--studio-ink);
          font-size: 24px;
          font-weight: 950;
          line-height: 1;
        }
        .rotation-count-controls {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(241, 245, 249, 0.86);
          border: 1px solid rgba(148, 163, 184, 0.22);
        }
        .rotation-count-controls button {
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 999px;
          background: #FFFFFF;
          color: var(--studio-ink);
          cursor: pointer;
          font: inherit;
          font-size: 17px;
          font-weight: 900;
          line-height: 1;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
          transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
        }
        .rotation-count-controls button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
        }
        .rotation-count-controls button:disabled {
          cursor: default;
          opacity: 0.42;
        }
        .rotation-total-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 44px;
          border-radius: 999px;
          background: #111827;
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 900;
          box-shadow: 0 14px 26px rgba(15, 23, 42, 0.22);
        }
        .rotation-studio-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-studio-caption {
          display: grid;
          gap: 4px;
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 700;
          line-height: 1.45;
        }
        .rotation-studio-caption strong {
          color: var(--studio-ink);
          font-size: 13px;
          font-weight: 900;
        }
        .rotation-roster-panel {
          display: grid;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 14px;
          background: rgba(248, 250, 252, 0.72);
        }
        .rotation-roster-grid {
          display: grid;
          gap: 7px;
        }
        .rotation-roster-row {
          display: grid;
          grid-template-columns: minmax(128px, 0.9fr) minmax(180px, 1fr) 120px 120px;
          align-items: center;
          gap: 8px;
        }
        .rotation-roster-role {
          display: grid;
          gap: 2px;
          min-width: 0;
          color: var(--studio-ink);
          font-size: 12px;
        }
        .rotation-roster-role span,
        .rotation-roster-empty {
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 700;
        }
        .rotation-roster-row input {
          min-width: 0;
          border: 1px solid var(--studio-border);
          border-radius: 10px;
          padding: 8px 10px;
          background: #FFFFFF;
          color: var(--studio-ink);
          font: inherit;
          font-size: 12px;
        }
        .rotation-template-section {
          display: grid;
          gap: 7px;
        }
        .rotation-template-section-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-template-section-header h3 {
          margin: 0;
          color: var(--studio-ink);
          font-size: 13px;
          font-weight: 950;
        }
        .rotation-template-section-header p {
          margin: 2px 0 0;
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 700;
          line-height: 1.35;
        }
        .rotation-template-rail {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(142px, 158px);
          gap: 7px;
          overflow-x: auto;
          padding: 2px 2px 7px;
          scroll-snap-type: x proximity;
        }
        .rotation-template-card {
          position: relative;
          display: grid;
          grid-template-rows: 30px minmax(0, 1fr);
          gap: 5px;
          height: 78px;
          padding: 7px;
          border: 1px solid rgba(148, 163, 184, 0.30);
          border-radius: 10px;
          background: linear-gradient(180deg, #FFFFFF, #F8FAFC);
          color: var(--studio-ink);
          text-align: left;
          font: inherit;
          cursor: pointer;
          scroll-snap-align: start;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
          overflow: hidden;
        }
        .rotation-template-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 18% 0%, rgba(20, 83, 45, 0.11), transparent 34%);
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
        }
        .rotation-template-card:hover,
        .rotation-template-card:focus-visible,
        .rotation-template-card.is-previewing {
          transform: translateY(-1px);
          border-color: rgba(20, 83, 45, 0.34);
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
          outline: none;
        }
        .rotation-template-card:hover::after,
        .rotation-template-card.is-previewing::after {
          opacity: 1;
        }
        .rotation-template-card.is-applied {
          border-color: rgba(20, 83, 45, 0.55);
          background: linear-gradient(180deg, #F0FDF4, #FFFFFF);
          box-shadow: 0 12px 24px rgba(20, 83, 45, 0.13);
        }
        .rotation-template-thumb {
          display: grid;
          gap: 2px;
          padding: 4px;
          border-radius: 8px;
          background: rgba(241, 245, 249, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.22);
          overflow: hidden;
        }
        .rotation-template-thumb-lane {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 2px;
        }
        .rotation-template-thumb-lane span {
          height: 5px;
          border: 1px solid;
          border-radius: 999px;
        }
        .rotation-template-card-name {
          color: var(--studio-ink);
          font-size: 10.5px;
          font-weight: 950;
          line-height: 1.16;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .rotation-preview-canvas {
          display: grid;
          gap: 12px;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.32);
          border-radius: 18px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.92)),
            radial-gradient(circle at 85% 8%, rgba(59, 130, 246, 0.10), transparent 28%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
        }
        .rotation-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-preview-header h4 {
          margin: 2px 0 0;
          color: var(--studio-ink);
          font-size: 15px;
          font-weight: 950;
        }
        .rotation-preview-status {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(241, 245, 249, 0.92);
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 900;
        }
        .rotation-preview-status.is-preview {
          background: ${C.warnLt};
          color: ${C.warn};
        }
        .rotation-preview-status.is-applied {
          background: ${C.sucLt};
          color: ${C.suc};
        }
        .rotation-preview-scroll {
          overflow: auto;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 14px;
          background: #FFFFFF;
        }
        .rotation-preview-grid {
          display: grid;
          min-width: 900px;
          font-size: 11px;
        }
        .rotation-preview-axis,
        .rotation-preview-lane,
        .rotation-preview-time {
          position: sticky;
          z-index: 2;
          background: #F8FAFC;
          border-bottom: 1px solid var(--studio-border-light);
        }
        .rotation-preview-axis,
        .rotation-preview-time {
          left: 0;
          z-index: 3;
          border-right: 1px solid var(--studio-border);
        }
        .rotation-preview-axis,
        .rotation-preview-lane {
          top: 0;
        }
        .rotation-preview-axis {
          padding: 12px 10px;
          color: var(--studio-muted);
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .rotation-preview-lane {
          display: grid;
          gap: 2px;
          padding: 10px 8px;
          text-align: center;
          border-right: 1px solid rgba(226, 232, 240, 0.68);
          color: var(--studio-ink);
          font-weight: 950;
        }
        .rotation-preview-lane small {
          color: var(--studio-muted);
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .rotation-preview-time {
          display: flex;
          align-items: center;
          padding: 10px;
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
        }
        .rotation-preview-cell {
          position: relative;
          min-height: 54px;
          border: 0;
          border-right: 1px solid rgba(226, 232, 240, 0.70);
          border-bottom: 1px solid rgba(226, 232, 240, 0.70);
          background: var(--cell-bg);
          color: var(--cell-text);
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          text-align: center;
          transition: background 130ms ease, color 130ms ease, opacity 130ms ease, box-shadow 130ms ease, transform 130ms ease;
        }
        .rotation-preview-cell:disabled {
          cursor: default;
        }
        .rotation-preview-cell > span {
          display: block;
          padding: 0 7px;
          line-height: 1.25;
        }
        .rotation-preview-cell small {
          display: block;
          margin-top: 2px;
          padding: 0 7px;
          opacity: 0.78;
          font-size: 9px;
          font-weight: 800;
          line-height: 1.25;
        }
        .rotation-preview-cell.is-empty {
          background: linear-gradient(180deg, #FFFFFF, #FBFCFE);
          color: #CBD5E1;
        }
        .rotation-preview-cell.is-filled {
          box-shadow: inset 0 0 0 1px var(--cell-border);
        }
        .rotation-preview-cell.is-ghost {
          opacity: 0.48;
          box-shadow: inset 0 0 0 1px var(--cell-border), inset 0 0 0 999px rgba(255, 255, 255, 0.20);
          animation: rotationGhostIn 140ms ease-out both;
        }
        .rotation-preview-cell.is-selected {
          z-index: 1;
          box-shadow: inset 0 0 0 2px #111827, 0 0 0 3px rgba(17, 24, 39, 0.12);
        }
        .rotation-preview-cell:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: inset 0 0 0 2px rgba(17, 24, 39, 0.38), 0 10px 18px rgba(15, 23, 42, 0.10);
          z-index: 2;
        }
        .rotation-preview-cell.is-editable::after {
          content: "Edit";
          position: absolute;
          right: 5px;
          bottom: 4px;
          padding: 2px 5px;
          border-radius: 999px;
          background: rgba(17, 24, 39, 0.82);
          color: #FFFFFF;
          font-size: 8px;
          font-weight: 950;
          opacity: 0;
          transform: translateY(2px);
          transition: opacity 130ms ease, transform 130ms ease;
          pointer-events: none;
        }
        .rotation-preview-cell.is-editable:hover::after,
        .rotation-preview-cell.is-selected::after {
          opacity: 1;
          transform: translateY(0);
        }
        .rotation-preview-empty-copy {
          opacity: 0;
        }
        .rotation-cell-inspector {
          position: sticky;
          top: 10px;
          z-index: 8;
          display: grid;
          grid-template-columns: minmax(126px, 0.3fr) minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border: 1px solid rgba(17, 24, 39, 0.12);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
          animation: rotationStudioSettle 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          backdrop-filter: blur(12px);
        }
        .rotation-cell-inspector > div:first-child {
          display: grid;
          gap: 2px;
        }
        .rotation-cell-inspector strong {
          color: var(--studio-ink);
          font-size: 13px;
          font-weight: 950;
        }
        .rotation-cell-inspector span {
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 800;
        }
        .rotation-task-palette {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
        .rotation-task-palette button,
        .rotation-inspector-close {
          border: 1px solid;
          border-radius: 999px;
          padding: 5px 8px;
          cursor: pointer;
          font: inherit;
          font-size: 9.5px;
          font-weight: 900;
          transition: transform 130ms ease, box-shadow 130ms ease;
        }
        .rotation-task-palette button:hover,
        .rotation-inspector-close:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 14px rgba(15, 23, 42, 0.10);
        }
        .rotation-inspector-close {
          width: fit-content;
          border-color: var(--studio-border);
          background: #FFFFFF;
          color: var(--studio-muted);
        }
        .rotation-action-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-action-note {
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 700;
          line-height: 1.45;
        }
        .rotation-action-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .rotation-muted-button {
          border: 1px solid var(--studio-border);
          border-radius: 10px;
          background: #FFFFFF;
          color: var(--studio-ink);
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
          padding: 7px 10px;
        }
        @keyframes rotationStudioSettle {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rotationGhostIn {
          from { opacity: 0; transform: scale(0.985); }
          to { opacity: 0.48; transform: scale(1); }
        }
        @media (max-width: 1120px) {
          .rotation-config-bar {
            grid-template-columns: minmax(180px, 1fr) minmax(220px, 1fr);
            border-radius: 24px;
          }
          .rotation-config-segment:nth-child(odd) {
            border-left: 0;
          }
          .rotation-config-segment {
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          }
        }
        @media (max-width: 720px) {
          .rotation-config-bar {
            grid-template-columns: 1fr;
            border-radius: 22px;
          }
          .rotation-config-segment + .rotation-config-segment {
            border-left: 0;
          }
          .rotation-roster-row {
            grid-template-columns: 1fr;
          }
          .rotation-template-rail {
            grid-auto-columns: minmax(148px, 48vw);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rotation-studio-shell *,
          .rotation-studio-shell *::before,
          .rotation-studio-shell *::after {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div className="rotation-config-bar" aria-label="Rotation staffing configuration">
        <div className="rotation-config-segment">
          <span className="rotation-config-kicker">Day</span>
          <span className="rotation-config-title">{formatDayLabel(day)}</span>
        </div>
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

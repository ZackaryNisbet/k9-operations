import React from "react";
import { TASK_COLORS } from "../../../shared/schedulingEngine";
import { formatTimeLabel } from "./rotationStudioDates";

export function PreviewCanvas({
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

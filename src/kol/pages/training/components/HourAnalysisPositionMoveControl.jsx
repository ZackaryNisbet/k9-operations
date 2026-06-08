// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { I } from "../../../../shared/icons";
import { formatLaborPositionTitle, normalizePositionTitle } from "../helpers";
import { useEffect, useRef, useState } from "react";

export function HourAnalysisPositionMoveControl({ row = {}, options = [], disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const pickerRef = useRef(null);
  const sourcePosition = formatLaborPositionTitle(row.sourcePositionTitle || row.position_title || row.position || "");
  const targetPosition = formatLaborPositionTitle(row.position_title || row.position || sourcePosition || "");
  const moved = Boolean(row.isMovement && sourcePosition && targetPosition && normalizePositionTitle(sourcePosition) !== normalizePositionTitle(targetPosition));
  const displayPosition = targetPosition || sourcePosition || "Choose position";
  const resetOption = sourcePosition
    ? [{ value: "", label: `Roster position: ${sourcePosition}`, isReset: true }]
    : [];
  const pickerOptions = [
    ...resetOption,
    ...options.filter((option) => option.normalizedTitle !== normalizePositionTitle(sourcePosition)),
  ];

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const handlePointerDown = (event) => {
      if (!pickerRef.current || pickerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="hour-analysis-position-move" ref={pickerRef}>
      <button
        type="button"
        className={`hour-analysis-position-trigger${moved ? " is-moved" : ""}`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="hour-analysis-position-display">
          {moved ? (
            <>
              <span className="hour-analysis-position-original">{sourcePosition}</span>
              <span className="hour-analysis-arrow">→</span>
              <span>{targetPosition}</span>
            </>
          ) : (
            <span>{displayPosition || "—"}</span>
          )}
        </span>
        {!disabled && (
          <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
            <I.ChevronDown />
          </span>
        )}
      </button>
      {open && !disabled && (
        <div className="hour-analysis-position-panel">
          <div className="hour-analysis-picker-heading">Choose Position</div>
          <div className="hour-analysis-picker-options">
            {pickerOptions.map((option, index) => {
              const active = option.isReset ? !moved : normalizePositionTitle(option.value) === normalizePositionTitle(targetPosition);
              return (
                <button
                  key={option.isReset ? "__reset_position__" : option.value}
                  type="button"
                  className={`hour-analysis-picker-option${active ? " is-active" : ""}${option.isReset ? " is-reset" : ""}`}
                  style={{ animation: ready ? `filterChipIn 0.25s ease-out ${index * 0.035}s both` : "none" }}
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { I } from "../../../../shared/icons";
import { LABOR_MODEL_SHIFT_TYPE_LABELS, LABOR_MODEL_SHIFT_TYPE_OPTIONS } from "../constants";
import { normalizeLaborModelBreakMinutes, normalizeLaborModelShiftType } from "../helpers";
import { HourAnalysisNumberInput } from "./HourAnalysisNumberInput";
import { useEffect, useState } from "react";

export function LaborModelTimeControl({ row = {}, disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const shiftType = normalizeLaborModelShiftType(row.shift_type, row);
  const shiftLabel = LABOR_MODEL_SHIFT_TYPE_LABELS[shiftType] || "Opening";
  const breakEnabled = Boolean(row.break_enabled);
  const breakMinutes = normalizeLaborModelBreakMinutes(row.break_minutes, 30);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div className="labor-model-shift-control">
      <button
        type="button"
        disabled={disabled}
        className={`labor-model-shift-trigger${breakEnabled ? " has-break" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{shiftLabel}</span>
        {breakEnabled && <small>{breakMinutes}m break</small>}
        {!disabled && (
          <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
            <I.ChevronDown />
          </span>
        )}
      </button>
      {open && !disabled && (
        <div className="labor-model-shift-panel">
          <div className="hour-analysis-picker-heading">Choose time</div>
          <div className="hour-analysis-picker-options">
            {LABOR_MODEL_SHIFT_TYPE_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                className={`hour-analysis-picker-option${option.value === shiftType ? " is-active" : ""}`}
                style={{ animation: ready ? `filterChipIn 0.25s ease-out ${index * 0.035}s both` : "none" }}
                onClick={() => onChange?.({ shift_type: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="labor-model-break-row">
            <div>
              <strong>Break</strong>
              <span>{breakEnabled ? "Subtracts from this row." : "No break is deducted."}</span>
            </div>
            <button
              type="button"
              className={`labor-model-break-toggle${breakEnabled ? " is-on" : ""}`}
              onClick={() => onChange?.({ break_enabled: !breakEnabled, break_minutes: breakMinutes || 30 })}
            >
              {breakEnabled ? "On" : "Off"}
            </button>
          </div>
          {breakEnabled && (
            <div className="labor-model-break-duration">
              <span>Minutes</span>
              <HourAnalysisNumberInput
                value={breakMinutes || 30}
                onCommit={(nextValue) => onChange?.({ break_enabled: true, break_minutes: normalizeLaborModelBreakMinutes(nextValue, 30) })}
                ariaLabel="Break duration minutes"
                className="labor-model-break-input"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

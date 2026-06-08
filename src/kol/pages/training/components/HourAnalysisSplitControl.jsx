// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { I } from "../../../../shared/icons";
import { HOUR_ANALYSIS_SPLIT_TARGET_OPTIONS } from "../constants";
import { formatHourAnalysisHours, getHourAnalysisGroupLabel, normalizeHourAnalysisNumber } from "../helpers";
import { HourAnalysisNumberInput } from "./HourAnalysisNumberInput";
import { useEffect, useState } from "react";

export function HourAnalysisSplitControl({ row = {}, disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const canSplitRole = ["general_manager", "assistant_manager", "supervisor", "csr"].includes(row.groupKey);
  const splitFloorGroup = row.split?.floor_group || "";
  const isSplit = Boolean(splitFloorGroup);
  const floorLabel = getHourAnalysisGroupLabel(splitFloorGroup);
  const primaryHours = normalizeHourAnalysisNumber(row.split?.admin_hours ?? row.preferredHours, 0);
  const floorHours = normalizeHourAnalysisNumber(row.split?.floor_hours, 0);
  const disabledTrigger = disabled || !canSplitRole;

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!canSplitRole && !isSplit) {
    return <span className="hour-analysis-split-static">Primary role</span>;
  }

  return (
    <div className="hour-analysis-split-compact">
      <button
        type="button"
        className={`hour-analysis-split-trigger${isSplit ? " is-active" : ""}`}
        disabled={disabledTrigger}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>
          {isSplit
            ? `${formatHourAnalysisHours(primaryHours)} ${row.groupLabel} + ${formatHourAnalysisHours(floorHours)} ${floorLabel}`
            : "Primary role"}
        </span>
        {!disabledTrigger && (
          <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
            <I.ChevronDown />
          </span>
        )}
      </button>
      {open && !disabledTrigger && (
        <div className="hour-analysis-split-panel">
          <div className="hour-analysis-picker-heading">Allocate weekly hours</div>
          <div className="hour-analysis-picker-options">
            {HOUR_ANALYSIS_SPLIT_TARGET_OPTIONS.map((option, index) => (
              <button
                key={option.value || "primary"}
                type="button"
                className={`hour-analysis-picker-option${option.value === splitFloorGroup ? " is-active" : ""}`}
                style={{ animation: ready ? `filterChipIn 0.25s ease-out ${index * 0.035}s both` : "none" }}
                onClick={() => {
                  onChange?.({
                    floor_group: option.value,
                    admin_hours: option.value ? (row.split?.admin_hours ?? Math.min(8, row.preferredHours || 0)) : null,
                  });
                  if (!option.value) setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {isSplit && (
            <div className="hour-analysis-split-editor">
              <div>
                <span>Primary-role hours</span>
                <small>Remaining hours flow to {floorLabel}.</small>
              </div>
              <HourAnalysisNumberInput
                value={primaryHours}
                onCommit={(nextValue) => onChange?.({ admin_hours: nextValue })}
                ariaLabel={`${row.full_name || "Employee"} primary-role coverage hours`}
                style={{ width: 92, textAlign: "right" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { I } from "../../../../shared/icons";
import { C } from "../../../../shared/theme";
import { useEffect, useState } from "react";

export function HourAnalysisAnimatedPicker({ label, value, options = [], onChange, placeholder = "Select...", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 750, color: C.textSec, marginBottom: 5, letterSpacing: 0, textTransform: "uppercase" }}>
          {label}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="hour-analysis-picker-trigger"
      >
        <span>{selected?.label || placeholder}</span>
        <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
          <I.ChevronDown />
        </span>
      </button>
      {open && (
        <div className="hour-analysis-picker-panel">
          <div className="hour-analysis-picker-heading">Choose {label || "value"}</div>
          <div className="hour-analysis-picker-options">
            {options.map((option, index) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`hour-analysis-picker-option${active ? " is-active" : ""}`}
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

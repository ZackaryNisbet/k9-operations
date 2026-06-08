// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { formatHourAnalysisHours, normalizeHourAnalysisNumber } from "../helpers";
import { useCallback, useEffect, useState } from "react";

export function HourAnalysisNumberInput({ value, onCommit, disabled, ariaLabel, className = "hour-analysis-number-input", style = {} }) {
  const formattedValue = formatHourAnalysisHours(value);
  const [draft, setDraft] = useState(formattedValue);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatHourAnalysisHours(value));
  }, [focused, value]);

  const commit = useCallback((rawValue) => {
    const trimmed = String(rawValue ?? "").trim();
    if (!trimmed || trimmed === ".") return;
    const nextValue = normalizeHourAnalysisNumber(trimmed, 0);
    if (nextValue === normalizeHourAnalysisNumber(value, 0)) return;
    onCommit?.(nextValue);
  }, [onCommit, value]);

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.]?[0-9]*"
      value={focused ? draft : formattedValue}
      disabled={disabled}
      aria-label={ariaLabel}
      style={style}
      onFocus={(event) => {
        setFocused(true);
        setDraft(formatHourAnalysisHours(value));
        window.requestAnimationFrame(() => event.target.select());
      }}
      onChange={(event) => {
        const nextValue = event.target.value.replace(/,/g, "");
        if (!/^\d*\.?\d*$/.test(nextValue)) return;
        setDraft(nextValue);
      }}
      onBlur={() => {
        setFocused(false);
        if (!draft || draft === ".") {
          setDraft(formatHourAnalysisHours(value));
          return;
        }
        commit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(formatHourAnalysisHours(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

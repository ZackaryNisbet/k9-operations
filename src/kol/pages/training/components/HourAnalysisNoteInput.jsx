// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { useCallback, useEffect, useState } from "react";

export function HourAnalysisNoteInput({ value = "", onCommit, disabled, ariaLabel, placeholder = "Why this number?" }) {
  const [draft, setDraft] = useState(value || "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value || "");
  }, [focused, value]);

  const commit = useCallback(() => {
    const nextValue = String(draft || "").trim();
    if (nextValue === String(value || "").trim()) return;
    onCommit?.(nextValue);
  }, [draft, onCommit, value]);

  return (
    <textarea
      className="hour-analysis-note-input"
      value={focused ? draft : (value || "")}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      rows={2}
      onFocus={() => setFocused(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value || "");
          event.currentTarget.blur();
        }
      }}
    />
  );
}

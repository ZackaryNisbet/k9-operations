// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { useCallback, useEffect, useState } from "react";

export function LaborModelInlineInput({ value = "", onCommit, disabled = false, ariaLabel, className = "labor-model-text-input", placeholder = "", style = {} }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value ?? ""));
  }, [focused, value]);

  const commit = useCallback(() => {
    const nextValue = String(draft ?? "").trim();
    if (nextValue === String(value ?? "").trim()) return;
    onCommit?.(nextValue);
  }, [draft, onCommit, value]);

  return (
    <input
      type="text"
      className={className}
      value={focused ? draft : String(value ?? "")}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      style={style}
      onFocus={(event) => {
        setFocused(true);
        setDraft(String(value ?? ""));
        window.requestAnimationFrame(() => event.target.select());
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value ?? ""));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

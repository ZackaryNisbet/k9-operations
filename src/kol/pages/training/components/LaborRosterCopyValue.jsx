// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { I } from "../../../../shared/icons";

export function LaborRosterCopyValue({ value, displayValue, copied = false, onCopy, ariaLabel }) {
  if (!value) return "—";
  return (
    <span className="labor-roster-copy-value">
      <span className="labor-roster-copy-text">{displayValue || value}</span>
      <button
        type="button"
        className={`labor-roster-copy-button${copied ? " is-copied" : ""}`}
        aria-label={ariaLabel}
        title={copied ? "Copied" : "Copy"}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCopy?.();
        }}
      >
        {copied ? <I.Check /> : <I.Clipboard />}
      </button>
    </span>
  );
}

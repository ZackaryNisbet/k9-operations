// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { I } from "../../../../shared/icons";

export function CapacitySectionHeader({ title, subtitle, summary, collapsed, onToggle }) {
  return (
    <button
      type="button"
      className={`capacity-section-header${collapsed ? " is-collapsed" : ""}`}
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <span className="capacity-section-title-block">
        <span className="hour-analysis-card-title">{title}</span>
        {subtitle ? <span className="hour-analysis-card-subtitle">{subtitle}</span> : null}
      </span>
      <span className="capacity-section-summary">
        {summary}
        <span className="capacity-section-chevron" aria-hidden="true"><I.ChevronDown /></span>
      </span>
    </button>
  );
}

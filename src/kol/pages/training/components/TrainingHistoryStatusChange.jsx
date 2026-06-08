// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { C } from "../../../../shared/theme";
import { PCT_READINESS_STATUS_STYLES } from "../constants";

export function TrainingHistoryStatusChange({ statusChange }) {
  if (!statusChange?.nextLabel) return null;
  const nextStyle = PCT_READINESS_STATUS_STYLES[statusChange.nextStatus] || PCT_READINESS_STATUS_STYLES.not_started;
  const previousStyle = PCT_READINESS_STATUS_STYLES[statusChange.previousStatus] || PCT_READINESS_STATUS_STYLES.not_started;
  return (
    <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {statusChange.previousLabel ? (
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: 999,
          border: `1px solid ${previousStyle.border}`,
          background: previousStyle.bg,
          color: previousStyle.text,
          padding: "2px 7px",
          fontSize: 10.5,
          fontWeight: 900,
          textDecoration: "line-through",
          opacity: 0.72,
        }}>
          {statusChange.previousLabel}
        </span>
      ) : null}
      {statusChange.previousLabel ? <span style={{ color: C.textMut, fontSize: 11, fontWeight: 900 }}>-&gt;</span> : null}
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${nextStyle.border}`,
        background: nextStyle.bg,
        color: nextStyle.text,
        padding: "2px 7px",
        fontSize: 10.5,
        fontWeight: 950,
      }}>
        {statusChange.nextLabel}
      </span>
    </div>
  );
}

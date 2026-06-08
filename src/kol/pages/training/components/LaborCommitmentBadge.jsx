// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { getLaborEmploymentCommitmentLabel } from "../../../trainingData";
import { getCommitmentBadgeTone } from "../helpers";

export function LaborCommitmentBadge({ value, compact = false }) {
  const tone = getCommitmentBadgeTone(value);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: compact ? 34 : 74,
        padding: compact ? "4px 8px" : "5px 10px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: compact ? 10.5 : 11,
        fontWeight: 900,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {getLaborEmploymentCommitmentLabel(value, { short: compact })}
    </span>
  );
}

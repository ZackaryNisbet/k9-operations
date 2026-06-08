// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { C } from "../../../../shared/theme";
import { safeTrainingProgress } from "../helpers";

export function CompactProgressBar({ percent, color = C.info, height = 5 }) {
  const p = safeTrainingProgress(percent);
  return (
    <div style={{ width: "100%", height, borderRadius: height / 2, background: C.borderLight, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", borderRadius: height / 2, background: color, transition: "width 0.3s" }} />
    </div>
  );
}

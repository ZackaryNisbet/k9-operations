// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { C } from "../../../../shared/theme";
import { safeTrainingProgress } from "../helpers";

export function ProgressBar({ percent, height = 6 }) {
  const p = safeTrainingProgress(percent);
  const color = p >= 100 ? C.suc : p > 50 ? C.acc : C.info;
  return (
    <div style={{ width: "100%", height, borderRadius: height / 2, background: C.borderLight, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", borderRadius: height / 2, background: color, transition: "width 0.3s" }} />
    </div>
  );
}

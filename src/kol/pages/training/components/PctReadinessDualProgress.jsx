// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { C } from "../../../../shared/theme";
import { safeTrainingProgress } from "../helpers";
import { CompactProgressBar } from "./CompactProgressBar";

export function PctReadinessDualProgress({ demonstratedPercent = 0, verifiedPercent = 0 }) {
  const rows = [
    { key: "D", title: "Demonstrated", percent: demonstratedPercent, color: "#0ea5e9" },
    { key: "V", title: "Verified / Qualified", percent: verifiedPercent, color: C.suc },
  ];
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {rows.map((row) => (
        <div key={row.key} title={row.title} style={{ display: "grid", gridTemplateColumns: "12px 1fr 28px", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9.5, fontWeight: 950, color: C.textMut, lineHeight: 1 }}>{row.key}</span>
          <CompactProgressBar percent={row.percent} color={row.color} />
          <span style={{ fontSize: 9.5, fontWeight: 900, color: C.textMut, textAlign: "right", lineHeight: 1 }}>{Math.round(safeTrainingProgress(row.percent))}%</span>
        </div>
      ))}
    </div>
  );
}

// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { I } from "../../../../shared/icons";
import { C } from "../../../../shared/theme";

export function EmptyState({ icon, title, subtitle }) {
  const IconComp = I[icon];
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMut }}>
      {IconComp && <div style={{ marginBottom: 12, opacity: 0.4 }}><IconComp /></div>}
      <div style={{ fontSize: 16, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </div>
  );
}

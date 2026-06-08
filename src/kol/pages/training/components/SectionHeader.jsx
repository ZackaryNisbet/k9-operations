// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { C } from "../../../../shared/theme";
import { Badge } from "../../../../shared/ui";

export function SectionHeader({ title, count, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
        {count != null && <Badge color="default">{count}</Badge>}
      </div>
      {children}
    </div>
  );
}

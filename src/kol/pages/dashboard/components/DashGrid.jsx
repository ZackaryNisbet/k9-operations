import React from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   DashGrid — viewport-filling grid, adapts for ops-only or full analytics layout
   ═══════════════════════════════════════════════════════════════════════════ */
export function DashGrid({ children, analyticsMode }) {
  const COL_GAP = 6;
  const ROW_GAP = 5;
  const LABEL_H = 16;
  // Analytics: 9 cols (original dense layout with lifecycle, financial, charts in sidebar)
  // Ops-only: 5 cols (bigger cells, less whitespace, ops-focused)
  const COLS = analyticsMode ? 9 : 5;
  const templateRows = analyticsMode
    // Analytics: snapshot-label, snapshot-row, lifecycle-label, lifecycle-row, daily-tasks-label, daily-tasks-row, financial-label, financial-row, chart-rows x3 (11 rows)
    ? `${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr 1fr 1fr 1fr`
    // Ops: snapshot-label, snapshot-row, ops-label, ops-row(checklists), ops-row(services+inventory) (5 rows — pure ops, no revenue)
    : `${LABEL_H}px 1fr ${LABEL_H}px 1fr 1fr`;

  return (
    <div
      style={{
        flex: 1, minHeight: 0, overflow: "hidden",
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: templateRows,
        gap: `${ROW_GAP}px ${COL_GAP}px`,
        padding: "0 8px 8px",
      }}
    >
      {children}
    </div>
  );
}

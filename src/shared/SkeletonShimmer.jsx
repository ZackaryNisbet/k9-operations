// K9 Operations — Skeleton Shimmer Loading
// Replaces the full-screen K9 loading animation with skeleton cells
// that match the dashboard grid layout for perceived instant load.

import React from "react";
import { C } from "./theme";

const SHIMMER_CSS = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-cell {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 8px;
  min-height: 0;
}
.skeleton-cell-hero {
  background: linear-gradient(90deg, #1a5c35 25%, #1e6b3e 50%, #1a5c35 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 8px;
  min-height: 0;
}
.skeleton-chart {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 8px;
  min-height: 0;
}
`;

const LABEL_H = 16;
const templateRows = `${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr ${LABEL_H}px 1fr 1fr 1fr 1fr`;

function SkeletonShimmer() {
  return (
    <div style={{
      height: "calc(100vh - 64px)", overflow: "hidden",
      display: "flex", flexDirection: "column",
      fontFamily: "inherit",
      background: "linear-gradient(180deg, #F7FEE7 0%, #ECFDF5 50%, #F0FDF4 100%)",
    }}>
      <style>{SHIMMER_CSS}</style>

      {/* Header skeleton */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px 6px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(20,83,45,0.08)" }} />
          <div style={{ width: 120, height: 16, borderRadius: 4, background: "rgba(20,83,45,0.08)" }} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[80, 60, 50, 60, 50, 50, 60, 55].map((w, i) => (
            <div key={i} style={{ width: w, height: 22, borderRadius: 4, background: "rgba(20,83,45,0.06)" }} />
          ))}
        </div>
      </div>

      {/* Grid skeleton matching 9×11 layout */}
      <div style={{
        flex: 1, minHeight: 0, overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "repeat(9, 1fr)",
        gridTemplateRows: templateRows,
        gap: "3px 4px",
        padding: "0 8px 8px",
      }}>
        {/* Row label: Today's Snapshot */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <div style={{ width: 100, height: 9, borderRadius: 2, background: "rgba(20,83,45,0.08)" }} />
        </div>
        <div style={{ gridColumn: "8", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: 60, height: 9, borderRadius: 2, background: "rgba(20,83,45,0.08)" }} />
        </div>
        <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: 50, height: 9, borderRadius: 2, background: "rgba(20,83,45,0.08)" }} />
        </div>

        {/* Row 1: 7 hero cells + 2 normal */}
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`r1h-${i}`} className="skeleton-cell-hero" />
        ))}
        <div className="skeleton-cell" />
        <div className="skeleton-cell" />

        {/* Row label: Customer Lifecycle */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <div style={{ width: 120, height: 9, borderRadius: 2, background: "rgba(20,83,45,0.08)" }} />
        </div>
        <div style={{ gridColumn: "8 / 10" }} />

        {/* Row 2: 9 normal cells */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={`r2-${i}`} className="skeleton-cell" />
        ))}

        {/* Row label: Daily Tasks */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <div style={{ width: 80, height: 9, borderRadius: 2, background: "rgba(20,83,45,0.08)" }} />
        </div>
        <div style={{ gridColumn: "8 / 10" }} />

        {/* Row 3: 9 cells */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={`r3-${i}`} className="skeleton-cell" />
        ))}

        {/* Row label: Financial Reporting */}
        <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
          <div style={{ width: 110, height: 9, borderRadius: 2, background: "rgba(20,83,45,0.08)" }} />
        </div>
        <div style={{ gridColumn: "8" }} />
        <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: 70, height: 9, borderRadius: 2, background: "rgba(20,83,45,0.08)" }} />
        </div>

        {/* Row 4: 9 cells */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={`r4-${i}`} className="skeleton-cell" />
        ))}

        {/* Rows 5-7: Charts spanning 3 rows + 2 side cells per row */}
        <div className="skeleton-chart" style={{ gridColumn: "1 / 4", gridRow: "span 3" }} />
        <div className="skeleton-chart" style={{ gridColumn: "4", gridRow: "span 3" }} />
        <div className="skeleton-chart" style={{ gridColumn: "5 / 8", gridRow: "span 3" }} />
        <div className="skeleton-cell" />
        <div className="skeleton-cell" />
        <div className="skeleton-cell" />
        <div className="skeleton-cell" />
        <div style={{ gridColumn: "8 / 10", gridRow: "span 1" }} />
        <div style={{ gridColumn: "8 / 10", gridRow: "span 1" }} />
      </div>
    </div>
  );
}

export default SkeletonShimmer;

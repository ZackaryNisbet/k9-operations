// Skeleton loaders extracted from InventoryPage.jsx.

import React from "react";
import { C } from "../../../shared/theme";

export function SkeletonRow() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
      {[180, 80, 60, 60, 80, 80, 70, 70].map((w, i) => (
        <div key={i} style={{ width: w, height: 14, borderRadius: 6, background: `linear-gradient(90deg, ${C.borderLight} 0%, ${C.bg} 50%, ${C.borderLight} 100%)`, backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
      ))}
    </div>
  );
}

export function SkeletonSection() {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "14px 16px", background: C.bg, borderRadius: 10, marginBottom: 2 }}>
        <div style={{ width: 160, height: 16, borderRadius: 6, background: `linear-gradient(90deg, ${C.borderLight} 0%, ${C.bg} 50%, ${C.borderLight} 100%)`, animation: "shimmer 1.4s infinite" }} />
      </div>
      {[0, 1, 2].map(i => <SkeletonRow key={i} />)}
    </div>
  );
}

import React from "react";
import { C } from "../../../../shared/theme";

export function InterviewWorkspaceTabs({ tabs = [], active, onChange }) {
  if (!tabs.length) return null;
  return (
    <div style={{ display: "inline-grid", gridTemplateColumns: `repeat(${tabs.length}, minmax(140px, 1fr))`, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: "#fff", maxWidth: 520 }}>
      {tabs.map((tab, index) => {
        const selected = active === tab.id;
        return (
          <button
            type="button"
            key={tab.id}
            onClick={() => onChange?.(tab.id)}
            style={{
              border: "none",
              borderRight: index === tabs.length - 1 ? "none" : `1px solid ${C.border}`,
              background: selected ? C.pri : "#fff",
              color: selected ? "#fff" : C.textSec,
              padding: "9px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.label}</div>
            {tab.detail && <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, opacity: selected ? 0.86 : 0.72 }}>{tab.detail}</div>}
          </button>
        );
      })}
    </div>
  );
}

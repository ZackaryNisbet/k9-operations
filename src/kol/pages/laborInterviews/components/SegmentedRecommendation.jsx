import React from "react";
import { C } from "../../../../shared/theme";
import { INTERVIEW_RECOMMENDATION_OPTIONS } from "../../../interviewData";

export function SegmentedRecommendation({ value, onChange, disabled }) {
  return (
    <div style={{ display: "inline-grid", gridTemplateColumns: "repeat(2, minmax(96px, 1fr))", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {INTERVIEW_RECOMMENDATION_OPTIONS.map((option) => {
        const selected = value === option.value;
        const selectedColor = option.value === "reject" ? C.dan : C.pri;
        return (
          <button
            type="button"
            key={option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            style={{
              border: "none",
              borderRight: option.value === "reject" ? "none" : `1px solid ${C.border}`,
              background: selected ? selectedColor : "#fff",
              color: selected ? "#fff" : C.textSec,
              padding: "9px 12px",
              fontFamily: "inherit",
              fontWeight: 850,
              fontSize: 12,
              cursor: disabled ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

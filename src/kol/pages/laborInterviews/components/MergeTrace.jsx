import React from "react";
import { C } from "../../../../shared/theme";
import { getInterviewResponseState } from "../../../interviewData";

export function MergeTrace({ responses = [] }) {
  const rows = (Array.isArray(responses) ? responses : [responses]).filter((response) => (
    response?.manual_notes_text || response?.ai_merged_text || getInterviewResponseState(response) === "merged_draft"
  ));
  if (!rows.length) return null;
  return (
    <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, background: "#fbfdff", padding: 10, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Merged Notes</div>
      {rows.slice(0, 3).map((response, index) => (
        <div key={response.id || index} style={{ display: "grid", gap: 5, fontSize: 12, lineHeight: 1.45 }}>
          {response.manual_notes_text && (
            <div style={{ color: "#94a3b8", whiteSpace: "pre-wrap" }}>{response.manual_notes_text}</div>
          )}
          {response.ai_merged_text && (
            <div style={{ color: C.text, whiteSpace: "pre-wrap" }}>{response.ai_merged_text}</div>
          )}
        </div>
      ))}
    </div>
  );
}

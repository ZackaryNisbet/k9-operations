import React from "react";
import { C } from "../../../../shared/theme";
import {
  getInterviewCandidateDisplayLabel,
  getInterviewRecommendation,
  getInterviewRecommendationOption,
} from "../../../interviewData";
import { compactDateTime } from "../helpers";
import { StaticField } from "./StaticField";

export function RestrictedInterviewDetail({ record }) {
  return (
    <div className="interview-detail-card" style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 18, display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Identity Restricted</div>
        <div style={{ marginTop: 5, color: C.textMut, fontSize: 13, lineHeight: 1.45 }}>
          This view intentionally excludes candidate contact details, transcripts, resumes, audio, generated PDFs, and signed storage links.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StaticField label="Candidate" value={getInterviewCandidateDisplayLabel(record)} />
        <StaticField label="Position" value={record.candidate_position || "Interview"} />
        <StaticField label="Interview Date" value={compactDateTime(record)} />
        <StaticField label="Next Step" value={getInterviewRecommendationOption(getInterviewRecommendation(record))?.label || "Pending"} />
      </div>
    </div>
  );
}

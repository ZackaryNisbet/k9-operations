import React from "react";
import { C } from "../../../../shared/theme";
import { Btn } from "../../../../shared/ui";
import {
  canAccessInterviewIdentity,
  getInterviewCandidateDisplayLabel,
  getInterviewRoleLabel,
} from "../../../interviewData";
import { compactDateTime } from "../helpers";
import { IconButton } from "./IconButton";
import { SegmentedRecommendation } from "./SegmentedRecommendation";
import { StaticField } from "./StaticField";

export function CandidateHeader({ record, recommendation, payRateSummary, onRecommendationChange, onEdit, onDelete, onBack, saving, canManage = true }) {
  const position = record.candidate_position || getInterviewRoleLabel(record.template_snapshot?.template?.role_key);
  const canAccessIdentity = canAccessInterviewIdentity(record, canManage);
  return (
    <div className="interview-detail-card" style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 18, borderBottom: `1px solid ${C.borderLight}`, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <IconButton label="Back to interviews" onClick={onBack}>{"<"}</IconButton>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: 26, lineHeight: 1.1, fontWeight: 950, letterSpacing: 0 }}>{getInterviewCandidateDisplayLabel(record, { canAccessIdentity })}</h2>
            <div style={{ marginTop: 7, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.textSec, fontWeight: 800 }}>{position || "Interview"}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <SegmentedRecommendation value={recommendation} onChange={onRecommendationChange} disabled={saving || !canManage} />
          {canManage && <Btn variant="secondary" size="sm" onClick={onEdit}>Edit Details</Btn>}
          {canManage && <Btn variant="danger" size="sm" onClick={onDelete}>Delete</Btn>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, padding: 18 }}>
        <StaticField label="Date" value={compactDateTime(record)} />
        <StaticField label="Pay Range" value={payRateSummary} />
        <StaticField label="Candidate Email" value={canAccessIdentity ? record.candidate_email : "Restricted"} />
        <StaticField label="Candidate Phone" value={canAccessIdentity ? record.candidate_phone : "Restricted"} />
        <StaticField label="Zoom Link" value={canAccessIdentity ? record.zoom_recording_url : "Restricted"} />
        <StaticField label="Zoom Passcode" value={canAccessIdentity ? record.zoom_passcode : "Restricted"} />
      </div>
    </div>
  );
}

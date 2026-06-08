import React from "react";
import { C } from "../../../../shared/theme";
import {
  Badge,
  Btn,
} from "../../../../shared/ui";
import { formatFileSize } from "../helpers";

export function ResumePanel({ resumeArtifact, resumeCount = 0, uploading, onUploadClick, onOpen, onDownload, canUpload = true }) {
  const metadata = resumeArtifact?.metadata && typeof resumeArtifact.metadata === "object" ? resumeArtifact.metadata : {};
  const uploadedAt = resumeArtifact?.created_at ? new Date(resumeArtifact.created_at).toLocaleDateString() : "";
  const sizeLabel = formatFileSize(metadata.size_bytes);
  const hasResume = !!resumeArtifact?.storage_path;
  return (
    <div className="interview-detail-card" style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 950, color: C.text }}>Resume</div>
            <Badge color={hasResume ? "success" : "default"}>{hasResume ? "Attached" : "Missing"}</Badge>
            {resumeCount > 1 && <Badge color="default">{resumeCount} files</Badge>}
          </div>
          <div style={{ marginTop: 4, color: C.textMut, fontSize: 12 }}>
            {hasResume ? "Candidate resume stays with this interview record." : "Attach the applicant's resume before or during the interview."}
          </div>
        </div>
        {canUpload && (
          <Btn variant={hasResume ? "secondary" : "primary"} size="sm" onClick={onUploadClick} disabled={uploading}>
            {uploading ? "Uploading..." : hasResume ? "Replace Resume" : "Upload Resume"}
          </Btn>
        )}
      </div>
      {hasResume ? (
        <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, background: C.surfaceHover, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 950, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {resumeArtifact.file_name || metadata.original_file_name || "Resume"}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: C.textMut, fontWeight: 700 }}>
              {[sizeLabel, uploadedAt ? `Uploaded ${uploadedAt}` : ""].filter(Boolean).join(" - ")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="ghost" size="sm" onClick={() => onOpen?.(resumeArtifact)}>Open</Btn>
            <Btn variant="secondary" size="sm" onClick={() => onDownload?.(resumeArtifact)}>Download</Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

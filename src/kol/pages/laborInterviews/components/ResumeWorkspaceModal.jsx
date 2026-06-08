import React from "react";
import { C } from "../../../../shared/theme";
import {
  Badge,
  Btn,
} from "../../../../shared/ui";
import {
  formatFileSize,
  isPdfResumeArtifact,
} from "../helpers";
import { EmptyState } from "./EmptyState";
import { IconButton } from "./IconButton";
import { InterviewWorkspaceTabs } from "./InterviewWorkspaceTabs";

export function ResumeWorkspaceModal({
  record,
  resumeArtifact,
  resumePreviewUrl,
  resumeCount = 0,
  uploading,
  onUploadClick,
  onOpen,
  onDownload,
  workspaceTabs,
  activePane,
  onPaneChange,
  payRateSummary,
  onClose,
  canUpload = true,
}) {
  const metadata = resumeArtifact?.metadata && typeof resumeArtifact.metadata === "object" ? resumeArtifact.metadata : {};
  const hasResume = !!resumeArtifact?.storage_path;
  const isPdf = isPdfResumeArtifact(resumeArtifact);
  const sizeLabel = formatFileSize(metadata.size_bytes);
  const uploadedAt = resumeArtifact?.created_at ? new Date(resumeArtifact.created_at).toLocaleString() : "";

  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div className="interview-immersive-shell" onClick={(event) => event.stopPropagation()} style={{ width: "min(1280px, 94vw)" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0, display: "grid", gap: 9 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Active Interview</div>
              <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>
                {record.candidate_full_name} - Resume{payRateSummary ? ` - Pay ${payRateSummary}` : ""}
              </div>
            </div>
            <InterviewWorkspaceTabs tabs={workspaceTabs} active={activePane} onChange={onPaneChange} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {canUpload && (
              <Btn variant={hasResume ? "secondary" : "primary"} size="sm" onClick={onUploadClick} disabled={uploading}>
                {uploading ? "Uploading..." : hasResume ? "Replace Resume" : "Upload Resume"}
              </Btn>
            )}
            {hasResume && <Btn variant="secondary" size="sm" onClick={() => onDownload?.(resumeArtifact)}>Download</Btn>}
            <IconButton label="Close resume" onClick={onClose}>{"x"}</IconButton>
          </div>
        </div>

        <div className="interview-resume-shell">
          <div style={{ minHeight: 0, border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
            <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 950, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {resumeArtifact?.file_name || metadata.original_file_name || "Candidate Resume"}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{hasResume ? [sizeLabel, uploadedAt].filter(Boolean).join(" - ") : "No resume attached"}</div>
              </div>
              {hasResume && <Badge color={isPdf ? "success" : "info"}>{isPdf ? "Embedded PDF" : "File attached"}</Badge>}
            </div>
            {!hasResume ? (
              <div style={{ padding: 24, display: "grid", placeItems: "center" }}>
                <EmptyState title="No Resume Attached" body="Accepted formats: PDF, DOC, and DOCX." />
              </div>
            ) : isPdf && resumePreviewUrl ? (
              <iframe className="interview-resume-frame" title={`${record.candidate_full_name || "Candidate"} resume`} src={`${resumePreviewUrl}#toolbar=1&navpanes=0`} />
            ) : (
              <div style={{ padding: 28, display: "grid", placeItems: "center", background: C.surfaceHover }}>
                <div style={{ width: "min(520px, 100%)", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 18, display: "grid", gap: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Resume File Attached</div>
                  <div style={{ fontSize: 13, color: C.textMut, lineHeight: 1.45 }}>{resumeArtifact.file_name || metadata.original_file_name || "Resume"}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                    <Btn variant="primary" onClick={() => onOpen?.(resumeArtifact)}>Open</Btn>
                    <Btn variant="secondary" onClick={() => onDownload?.(resumeArtifact)}>Download</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 14, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Candidate</div>
              <div style={{ fontSize: 18, color: C.text, fontWeight: 950, lineHeight: 1.2 }}>{record.candidate_full_name}</div>
              <div style={{ fontSize: 13, color: C.textSec, fontWeight: 800 }}>{record.candidate_position || "Interview"}</div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 14, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pay Reference</div>
              <div style={{ fontSize: 16, color: C.text, fontWeight: 950 }}>{payRateSummary || "Not configured"}</div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 14, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Resume History</div>
              <div style={{ fontSize: 22, color: C.text, fontWeight: 950 }}>{resumeCount}</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Attached file{resumeCount === 1 ? "" : "s"} on this interview record.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

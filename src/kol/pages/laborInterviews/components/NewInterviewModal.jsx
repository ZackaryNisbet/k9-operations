import React, { useEffect } from "react";
import { C } from "../../../../shared/theme";
import {
  Badge,
  Btn,
  Inp,
} from "../../../../shared/ui";
import {
  INTERVIEW_RESUME_ACCEPT,
  formatInterviewPayRateSummary,
} from "../../../interviewData";
import {
  formatFileSize,
  payRatesFromVersion,
} from "../helpers";
import { EmptyState } from "./EmptyState";
import { IconButton } from "./IconButton";

export function NewInterviewModal({
  draft,
  templateOptions,
  selectedTemplate,
  selectedTemplateVersion,
  resumeFile,
  resumeInputRef,
  saving,
  onDraftChange,
  onTemplateChange,
  onResumeChange,
  onResumeRemove,
  onCreate,
  onClose,
}) {
  const payRates = payRatesFromVersion(selectedTemplateVersion || {});
  const payRateSummary = formatInterviewPayRateSummary(payRates);
  const hasTemplate = !!selectedTemplateVersion;
  const resumeSize = resumeFile ? formatFileSize(resumeFile.size) : "";

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="interview-modal-backdrop" onClick={onClose} style={{ alignItems: "flex-start", overflowY: "auto", paddingTop: 32, paddingBottom: 32 }}>
      <div className="interview-new-dialog" onClick={(event) => event.stopPropagation()}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 950, color: C.text, lineHeight: 1.1 }}>New Interview</div>
            <div style={{ marginTop: 5, fontSize: 12, color: C.textMut, fontWeight: 750 }}>
              Candidate intake for the interview workspace.
            </div>
          </div>
          <IconButton label="Close new interview" onClick={onClose}>{"x"}</IconButton>
        </div>

        <div className="interview-new-body">
          {templateOptions.length === 0 ? (
            <EmptyState title="No Published Templates" body="No role templates are ready for interview creation." />
          ) : (
            <div className="interview-new-grid">
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                  <div style={{ padding: 14, borderBottom: `1px solid ${C.borderLight}` }}>
                    <div style={{ fontSize: 12, color: C.textMut, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Role Template</div>
                    <div style={{ marginTop: 5, fontSize: 18, color: C.text, fontWeight: 950, lineHeight: 1.15 }}>
                      {selectedTemplate?.role_label || "Select a role"}
                    </div>
                  </div>
                  <div style={{ display: "grid", maxHeight: 340, overflowY: "auto" }}>
                    {templateOptions.map((option) => {
                      const selected = option.value === draft.template_version_id;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className="interview-template-option"
                          onClick={() => onTemplateChange(option.value)}
                          style={{
                            border: "none",
                            borderBottom: `1px solid ${C.borderLight}`,
                            background: selected ? "#ecfdf5" : "#fff",
                            color: selected ? C.pri : C.text,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                            padding: "12px 14px",
                            transition: "transform 160ms ease, box-shadow 160ms ease, background 160ms ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{option.label}</span>
                            {selected && <Badge color="success">Selected</Badge>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ border: `1px solid ${payRateSummary ? "#bbf7d0" : C.border}`, borderRadius: 8, background: payRateSummary ? "#f0fdf4" : "#fff", padding: 14, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: C.textMut, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pay Rate</div>
                  <div style={{ fontSize: 20, fontWeight: 950, color: payRateSummary ? C.pri : C.text }}>{payRateSummary || "Not configured"}</div>
                  <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.4 }}>Selected position configuration.</div>
                </div>
              </div>

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                <div style={{ padding: 16, borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 950, color: C.text }}>Candidate Setup</div>
                    <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>Candidate profile and interview logistics.</div>
                  </div>
                  <Badge color={hasTemplate ? "success" : "warning"}>{hasTemplate ? "Template ready" : "Template required"}</Badge>
                </div>

                <div style={{ padding: 16, display: "grid", gap: 16 }}>
                  <div className="interview-field-grid">
                    <Inp label="Candidate Name" required value={draft.candidate_full_name} onChange={(value) => onDraftChange({ candidate_full_name: value })} autoFocus />
                    <Inp label="Position" value={draft.candidate_position} onChange={(value) => onDraftChange({ candidate_position: value })} />
                    <Inp label="Email" value={draft.candidate_email} onChange={(value) => onDraftChange({ candidate_email: value })} />
                    <Inp label="Phone" value={draft.candidate_phone} onChange={(value) => onDraftChange({ candidate_phone: value })} />
                    <Inp label="Interview Date" type="date" value={draft.interview_date} onChange={(value) => onDraftChange({ interview_date: value })} />
                    <Inp label="Interview Time" type="time" value={draft.interview_time} onChange={(value) => onDraftChange({ interview_time: value })} />
                    <Inp label="Zoom Passcode" value={draft.zoom_passcode} onChange={(value) => onDraftChange({ zoom_passcode: value })} />
                    <Inp label="Interviewer" value={draft.interviewer_name} onChange={(value) => onDraftChange({ interviewer_name: value })} />
                  </div>

                  <Inp label="Zoom Recording Link" value={draft.zoom_recording_url} onChange={(value) => onDraftChange({ zoom_recording_url: value })} />

                  <div style={{ border: `1px solid ${resumeFile ? "#bbf7d0" : C.border}`, borderRadius: 8, background: resumeFile ? "#f0fdf4" : C.surfaceHover, padding: 14, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      ref={resumeInputRef}
                      type="file"
                      accept={INTERVIEW_RESUME_ACCEPT}
                      style={{ display: "none" }}
                      onChange={(event) => {
                        onResumeChange(event.target.files?.[0] || null);
                        event.target.value = "";
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.textMut, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Resume</div>
                      <div style={{ marginTop: 5, fontSize: 14, fontWeight: 950, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {resumeFile?.name || "No resume attached"}
                      </div>
                      {resumeSize && <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{resumeSize}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {resumeFile && <Btn variant="ghost" size="sm" onClick={onResumeRemove}>Remove</Btn>}
                      <Btn variant={resumeFile ? "secondary" : "primary"} size="sm" onClick={() => resumeInputRef.current?.click()}>
                        {resumeFile ? "Replace Resume" : "Attach Resume"}
                      </Btn>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}`, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 800 }}>{resumeFile ? "Resume selected" : "No resume selected"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={onCreate} disabled={saving || templateOptions.length === 0}>{saving ? "Creating..." : "Create Interview"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

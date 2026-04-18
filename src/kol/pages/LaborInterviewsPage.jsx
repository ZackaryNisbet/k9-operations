import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, Card, CustomSelect, Inp, Modal } from "../../shared/ui";
import {
  buildInterviewAudioPath,
  buildInterviewArtifactPath,
  buildInterviewTemplatePdfPath,
  buildInterviewTemplateSnapshot,
  buildPdfResponseMap,
  extractPdfFieldManifest,
  fillInterviewPdfBytes,
  getInterviewTranscriptTurns,
  getInterviewRecommendation,
  getInterviewRecommendationOption,
  getInterviewAudioContentType,
  getInterviewRoleLabel,
  getPdfFieldTypeLabel,
  INTERVIEW_AUDIO_ACCEPT,
  INTERVIEW_PDF_ACCEPT,
  INTERVIEW_RECOMMENDATION_OPTIONS,
  LABOR_INTERVIEW_DOCUMENT_BUCKET,
  LABOR_INTERVIEW_STATUS_LABELS,
  LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS,
  normalizeInterviewCandidateDraft,
  normalizeQuestionKey,
  pdfFieldsFromSnapshot,
  PDF_VERIFICATION_LABELS,
  questionRowsFromSnapshot,
  validateInterviewAudioFile,
} from "../interviewData";
import { normalizeOptionalUuid, resolveTrainingLocationId } from "../trainingData";

function defaultInterviewDate() {
  try {
    return todayStr();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildNewInterviewDraft() {
  return {
    candidate_full_name: "",
    candidate_email: "",
    candidate_phone: "",
    candidate_position: "",
    interview_date: defaultInterviewDate(),
    interview_time: "",
    interviewer_name: "",
    zoom_recording_url: "",
    zoom_passcode: "",
    template_version_id: "",
  };
}

const STATUS_BADGE_COLORS = {
  draft: "default",
  in_progress: "info",
  ai_drafted: "warning",
  reviewed: "accent",
  completed: "success",
  archived: "default",
};

const TEMPLATE_STATUS_COLORS = {
  draft: "warning",
  published: "success",
  archived: "default",
};

const VERIFY_STATUS_COLORS = {
  verified_fields: "success",
  missing_pdf: "warning",
  pending_verification: "warning",
  failed_no_fields: "danger",
  failed_invalid_pdf: "danger",
};

function fieldKey(responseType, key) {
  return `${responseType}:${key}`;
}

function responseKeyForQuestion(question) {
  return fieldKey("custom_question", question.question_key);
}

function responseKeyForPdfField(field) {
  return fieldKey("pdf_field", field.name);
}

function compactDateTime(row) {
  if (!row?.interview_date && !row?.interview_time) return "No date set";
  return [row.interview_date ? fmtDate(row.interview_date) : "", row.interview_time || ""].filter(Boolean).join(" at ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readEdgeFunctionError(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  try {
    if (error.context?.json) {
      const body = await error.context.json();
      return body?.error || body?.message || fallbackMessage;
    }
    if (error.context?.text) {
      const text = await error.context.text();
      if (!text) return fallbackMessage;
      try {
        const body = JSON.parse(text);
        return body?.error || body?.message || text;
      } catch {
        return text;
      }
    }
  } catch (_) {
    // Fall through to the SDK message below.
  }
  return error.message || fallbackMessage;
}

function snapshotForRecord(record) {
  if (!record) return {};
  const snapshot = record.template_snapshot || {};
  if (Array.isArray(snapshot.questions)) return snapshot;
  return {
    template: {
      role_key: record.candidate_position,
      role_label: record.candidate_position,
    },
    version: {
      id: record.template_version_id,
      pdf_field_manifest: record.pdf_field_manifest_snapshot || [],
    },
    questions: record.question_snapshot || [],
  };
}

function mapResponsesByTarget(responses = []) {
  return (responses || []).reduce((map, response) => {
    if (response.response_type === "custom_question" && response.question_key) {
      map[fieldKey("custom_question", response.question_key)] = response;
    }
    if (response.response_type === "pdf_field" && response.pdf_field_name) {
      map[fieldKey("pdf_field", response.pdf_field_name)] = response;
    }
    return map;
  }, {});
}

function getResponseDraft(response) {
  return response?.response_text ?? response?.ai_draft_text ?? "";
}

function Metric({ label, value, helper }) {
  return (
    <Card style={{ borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.textSec, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      {helper && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>{helper}</div>}
    </Card>
  );
}

function SectionHeading({ title, detail, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>{title}</h3>
        {detail && <div style={{ marginTop: 3, color: C.textMut, fontSize: 13 }}>{detail}</div>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div style={{ padding: 38, border: `1.5px dashed ${C.border}`, borderRadius: 12, background: C.surfaceHover, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</div>
      <div style={{ fontSize: 13, color: C.textMut, marginTop: 6, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function InterviewStyles() {
  return (
    <style>{`
      @keyframes interviewWaveFloat {
        0%, 100% { transform: scaleY(0.42); opacity: 0.52; }
        50% { transform: scaleY(1); opacity: 1; }
      }
      @keyframes interviewScan {
        0% { transform: translateX(-26%); opacity: 0; }
        18% { opacity: 0.95; }
        82% { opacity: 0.95; }
        100% { transform: translateX(126%); opacity: 0; }
      }
      @keyframes interviewCompletePulse {
        0% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.24); }
        70% { transform: scale(1); box-shadow: 0 0 0 18px rgba(22, 163, 74, 0); }
        100% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
      }
      .interview-row:hover { background: #f8fafc; }
      .interview-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(15, 23, 42, 0.54);
        backdrop-filter: blur(14px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 26px;
      }
      .interview-immersive-shell {
        width: min(1480px, 94vw);
        height: min(900px, 92vh);
        background: #ffffff;
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 26px 80px rgba(2, 6, 23, 0.28);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }
      .interview-transcript-line:hover { border-color: #cbd5e1; background: #ffffff; }
      @media (max-width: 920px) {
        .interview-immersive-shell { width: 96vw; height: 94vh; }
        .interview-guide-grid { grid-template-columns: 1fr !important; overflow-y: auto; }
        .interview-guide-pdf { min-height: 520px; }
        .interview-roster-table { min-width: 780px; }
      }
    `}</style>
  );
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${Math.round(value / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const minutes = Math.floor(value / 60);
  const remainder = Math.round(value % 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatPlaybackTime(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function isTurnActive(turn, currentTime) {
  const time = Number(currentTime || 0);
  if (!Number.isFinite(time) || turn.startSeconds == null || turn.endSeconds == null) return false;
  return time >= turn.startSeconds && time <= turn.endSeconds;
}

function TranscriptWords({ turn, currentTime, maxWords = null }) {
  const words = Array.isArray(turn?.words) && turn.words.length
    ? turn.words
    : String(turn?.text || "").split(/\s+/).filter(Boolean).map((text, index) => ({ id: `${turn?.id || "turn"}-${index}`, text }));
  const visibleWords = maxWords ? words.slice(0, maxWords) : words;
  const time = Number(currentTime || 0);
  return (
    <span>
      {visibleWords.map((word) => {
        const active = Number.isFinite(time)
          && word.startSeconds != null
          && word.endSeconds != null
          && time >= word.startSeconds
          && time <= word.endSeconds;
        return (
          <span
            key={word.id}
            style={{
              display: "inline-block",
              marginRight: 4,
              marginBottom: 2,
              borderRadius: 4,
              padding: "0 2px",
              background: active ? "#dcfce7" : "transparent",
              color: active ? C.pri : "inherit",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {word.text}
          </span>
        );
      })}
      {maxWords && words.length > maxWords && <span style={{ color: C.textMut }}>...</span>}
    </span>
  );
}

function getAutoScoreStorageKey(actorUserId) {
  return `k9:labor-interviews:auto-score:${actorUserId || "local"}`;
}

function readAutoScoreSetting(storageKey) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(storageKey) === "true";
}

function seededWaveBars(seed = "") {
  let state = 0;
  String(seed || "interview").split("").forEach((char) => {
    state = (state * 31 + char.charCodeAt(0)) % 9973;
  });
  return Array.from({ length: 56 }, (_, index) => {
    state = (state * 9301 + 49297 + index) % 233280;
    const ratio = state / 233280;
    return {
      height: 18 + Math.round(ratio * 74),
      delay: -(ratio * 1.8).toFixed(2),
      duration: (0.8 + ratio * 1.4).toFixed(2),
      opacity: 0.42 + ratio * 0.54,
    };
  });
}

function safeUiError(error, fallback) {
  return String(error?.message || fallback || "Something went wrong.")
    .replace(/xAI\s+Grok/gi, "AI")
    .replace(/\bGrok\b/g, "AI")
    .replace(/\bxAI\b/g, "AI");
}

function IconButton({ label, onClick, disabled, children, variant = "default", style = {} }) {
  const colors = {
    default: { bg: "#fff", color: C.textSec, border: C.border },
    primary: { bg: C.pri, color: "#fff", border: C.pri },
    danger: { bg: C.danLt, color: C.dan, border: "#fecaca" },
  };
  const tone = colors[variant] || colors.default;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.48 : 1,
        fontWeight: 900,
        fontSize: 15,
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function RecommendationBadge({ value }) {
  const option = getInterviewRecommendationOption(value);
  return <Badge color={option.tone}>{option.label}</Badge>;
}

function StaticField({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, color: C.text, fontWeight: 700, minHeight: 20, overflowWrap: "anywhere" }}>{value || "-"}</div>
    </div>
  );
}

function SegmentedRecommendation({ value, onChange, disabled }) {
  return (
    <div style={{ display: "inline-grid", gridTemplateColumns: "repeat(4, minmax(80px, 1fr))", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {INTERVIEW_RECOMMENDATION_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            type="button"
            key={option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            style={{
              border: "none",
              borderRight: option.value === "pass" ? "none" : `1px solid ${C.border}`,
              background: selected ? C.pri : "#fff",
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

function InterviewRoster({ records, onOpen }) {
  if (records.length === 0) {
    return <EmptyState title="No Interviews Yet" body="Create the first interview after a position template is published." />;
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflowX: "auto", background: "#fff" }}>
      <div className="interview-roster-table" style={{ minWidth: 900 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.5fr) minmax(180px, 1.1fr) 150px 140px 140px 90px", gap: 0, padding: "12px 16px", background: C.surfaceHover, borderBottom: `1px solid ${C.border}`, color: C.textMut, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <div>Candidate</div>
          <div>Position</div>
          <div>Date Interviewed</div>
          <div>Next Step</div>
          <div>Workflow</div>
          <div />
        </div>
        {records.map((record) => (
          <button
            type="button"
            key={record.id}
            onClick={() => onOpen(record.id)}
            className="interview-row"
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1.5fr) minmax(180px, 1.1fr) 150px 140px 140px 90px",
              gap: 0,
              alignItems: "center",
              padding: "14px 16px",
              border: "none",
              borderBottom: `1px solid ${C.borderLight}`,
              background: "#fff",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.candidate_full_name}</div>
              <div style={{ marginTop: 3, fontSize: 12, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.candidate_email || record.candidate_phone || "No contact saved"}</div>
            </div>
            <div style={{ fontSize: 13, color: C.textSec, fontWeight: 700 }}>{record.candidate_position || getInterviewRoleLabel(record.template_snapshot?.template?.role_key)}</div>
            <div style={{ fontSize: 13, color: C.textSec }}>{record.interview_date ? fmtDate(record.interview_date) : "-"}</div>
            <div><RecommendationBadge value={getInterviewRecommendation(record)} /></div>
            <div><Badge color={STATUS_BADGE_COLORS[record.status] || "default"}>{LABOR_INTERVIEW_STATUS_LABELS[record.status] || record.status}</Badge></div>
            <div style={{ color: C.pri, fontSize: 13, fontWeight: 900, textAlign: "right" }}>Open</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CandidateHeader({ record, recommendation, onRecommendationChange, onEdit, onDelete, onBack, saving }) {
  const position = record.candidate_position || getInterviewRoleLabel(record.template_snapshot?.template?.role_key);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 18, borderBottom: `1px solid ${C.borderLight}`, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <IconButton label="Back to interviews" onClick={onBack}>{"<"}</IconButton>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: 26, lineHeight: 1.1, fontWeight: 950, letterSpacing: 0 }}>{record.candidate_full_name}</h2>
            <div style={{ marginTop: 7, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.textSec, fontWeight: 800 }}>{position || "Interview"}</span>
              <Badge color={STATUS_BADGE_COLORS[record.status] || "default"}>{LABOR_INTERVIEW_STATUS_LABELS[record.status] || record.status}</Badge>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <SegmentedRecommendation value={recommendation} onChange={onRecommendationChange} disabled={saving} />
          <Btn variant="secondary" size="sm" onClick={onEdit}>Edit Details</Btn>
          <Btn variant="danger" size="sm" onClick={onDelete}>Delete</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, padding: 18 }}>
        <StaticField label="Date" value={compactDateTime(record)} />
        <StaticField label="Email" value={record.candidate_email} />
        <StaticField label="Phone" value={record.candidate_phone} />
        <StaticField label="Zoom Link" value={record.zoom_recording_url} />
        <StaticField label="Passcode" value={record.zoom_passcode} />
      </div>
    </div>
  );
}

function AudioUploadPanel({
  record,
  audioFileName,
  transcribing,
  drafting,
  onUpload,
  onTranscriptClick,
  inputRef,
  audioRef,
  audioUrl,
  audioPlaying,
  currentTime,
  audioDuration,
  transcriptTurns = [],
  onPlayToggle,
  onAudioTimeUpdate,
  onAudioLoadedMetadata,
  onAudioEnded,
}) {
  const sourceAudio = record?.metadata?.audio_transcription?.source_audio || {};
  const transcription = record?.metadata?.audio_transcription || {};
  const fileName = audioFileName || sourceAudio.file_name || "";
  const durationSeconds = Number(transcription.duration_seconds || audioDuration || 0);
  const duration = formatDuration(durationSeconds);
  const fileSize = formatFileSize(sourceAudio.size_bytes);
  const complete = !!record?.transcript_text && !transcribing && !drafting;
  const bars = useMemo(() => seededWaveBars(`${record?.id || ""}:${fileName}:${record?.updated_at || ""}`), [record?.id, record?.updated_at, fileName]);
  const safeTranscriptTurns = Array.isArray(transcriptTurns) ? transcriptTurns : [];
  const hasProviderTurns = safeTranscriptTurns.length > 0;
  const activeTurn = safeTranscriptTurns.find((turn) => isTurnActive(turn, currentTime));
  const visibleTurns = activeTurn
    ? [activeTurn, ...safeTranscriptTurns.filter((turn) => turn.id !== activeTurn.id)].slice(0, 4)
    : safeTranscriptTurns.slice(0, 4);

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      style={{
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${complete ? "#bbf7d0" : C.border}`,
        borderRadius: 8,
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 48%, #f0fdf4 100%)",
        padding: 18,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={INTERVIEW_AUDIO_ACCEPT}
        style={{ display: "none" }}
        onChange={(event) => {
          onUpload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" }}>Upload Interview Audio</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950, color: C.text }}>{drafting ? "Populating interview notes" : transcribing ? "Reading the conversation" : complete ? "Audio processed" : "Drop an audio file here"}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 10, color: C.textMut, fontSize: 12, flexWrap: "wrap" }}>
            <span>{fileName || "M4A, MP3, WAV, MP4, MKV"}</span>
            {duration && <span>{duration}</span>}
            {fileSize && <span>{fileSize}</span>}
            {record?.transcript_text && <span>{hasProviderTurns ? `${safeTranscriptTurns.length} speaker turns` : "turn data required"}</span>}
          </div>
        </div>
        <Btn variant={complete ? "success" : "primary"} onClick={() => inputRef.current?.click()} disabled={transcribing || drafting}>
          {transcribing || drafting ? "Processing..." : complete ? "Replace Audio" : "Choose File"}
        </Btn>
      </div>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={onAudioTimeUpdate}
          onLoadedMetadata={onAudioLoadedMetadata}
          onEnded={onAudioEnded}
          style={{ display: "none" }}
        />
      )}
      <div style={{ marginTop: 18, height: 120, borderRadius: 8, background: "rgba(255,255,255,0.72)", border: `1px solid ${C.borderLight}`, overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 18px" }}>
        <div style={{ position: "absolute", inset: 0, opacity: transcribing || drafting ? 1 : 0.35, background: "radial-gradient(circle at 30% 50%, rgba(132,204,22,0.12), transparent 38%), radial-gradient(circle at 70% 50%, rgba(37,99,235,0.10), transparent 32%)" }} />
        {(transcribing || drafting) && <div style={{ position: "absolute", top: 0, bottom: 0, width: "34%", background: "linear-gradient(90deg, transparent, rgba(20,83,45,0.12), transparent)", animation: "interviewScan 2.4s linear infinite" }} />}
        {complete && <div style={{ position: "absolute", right: 16, top: 16, width: 12, height: 12, borderRadius: 99, background: C.suc, animation: "interviewCompletePulse 1.8s ease-out infinite" }} />}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 4, width: "100%", height: 92, justifyContent: "center" }}>
          {bars.map((bar, index) => (
            <div
              key={index}
              style={{
                width: 5,
                height: bar.height,
                borderRadius: 99,
                background: index % 3 === 0 ? C.pri : index % 3 === 1 ? C.accDk : C.info,
                opacity: bar.opacity,
                transformOrigin: "center",
                animation: transcribing || drafting ? `interviewWaveFloat ${bar.duration}s ease-in-out ${bar.delay}s infinite` : "none",
              }}
            />
          ))}
        </div>
      </div>
      {record?.transcript_text && (
        <div style={{ marginTop: 14, border: `1px solid ${C.borderLight}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "11px 12px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Transcript</div>
              <div style={{ marginTop: 2, fontSize: 13, color: C.textSec, fontWeight: 750 }}>
                {safeTranscriptTurns.length} turn{safeTranscriptTurns.length === 1 ? "" : "s"}{duration ? ` across ${duration}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="secondary" size="sm" onClick={onPlayToggle} disabled={!audioUrl}>
                {audioPlaying ? "Pause Audio" : "Play Audio"}
              </Btn>
              <span style={{ minWidth: 92, fontSize: 12, color: C.textMut, fontWeight: 800, textAlign: "right" }}>
                {formatPlaybackTime(currentTime)} / {formatPlaybackTime(durationSeconds || audioDuration)}
              </span>
            </div>
          </div>
          <div style={{ display: "grid" }}>
            {!hasProviderTurns ? (
              <div style={{ padding: 12, color: C.textMut, fontSize: 13 }}>
                This record was transcribed before structured turn data was stored. Replace the audio to regenerate the transcript with provider timestamps and diarization.
              </div>
            ) : visibleTurns.map((turn) => {
              const active = isTurnActive(turn, currentTime);
              return (
                <button
                  type="button"
                  key={turn.id}
                  onClick={onTranscriptClick}
                  style={{
                    border: "none",
                    borderBottom: `1px solid ${C.borderLight}`,
                    background: active ? "#f0fdf4" : "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                    padding: "10px 12px",
                    display: "grid",
                    gridTemplateColumns: "70px 104px minmax(0, 1fr)",
                    gap: 10,
                    fontFamily: "inherit",
                    alignItems: "start",
                  }}
                >
                  <span style={{ color: active ? C.pri : C.textMut, fontSize: 12, fontWeight: 850 }}>{turn.timestamp || "--:--"}</span>
                  <span style={{ color: active ? C.pri : C.textSec, fontSize: 12, fontWeight: 900 }}>{turn.speaker}</span>
                  <span style={{ color: C.textSec, fontSize: 13, lineHeight: 1.45, overflow: "hidden" }}>
                    <TranscriptWords turn={turn} currentTime={currentTime} maxWords={28} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TranscriptModal({ turns, currentTime, onClose }) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const hasSpeakers = safeTurns.some((turn) => turn.speaker !== "Transcript");
  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(960px, 92vw)", maxHeight: "86vh", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 24px 70px rgba(2,6,23,0.24)", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 950, color: C.text }}>Transcript</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{safeTurns.length} {hasSpeakers ? "speaker turn" : "transcript segment"}{safeTurns.length === 1 ? "" : "s"}</div>
          </div>
          <IconButton label="Close transcript" onClick={onClose}>{"x"}</IconButton>
        </div>
        <div style={{ padding: 18, overflowY: "auto", background: C.surfaceHover }}>
          {safeTurns.length === 0 ? (
            <EmptyState title="No Transcript" body="Replace the audio to regenerate this record with structured transcript turns." />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {safeTurns.map((turn) => (
                <div key={turn.id} className="interview-transcript-line" style={{ display: "grid", gridTemplateColumns: "86px 120px minmax(0, 1fr)", gap: 12, alignItems: "start", background: isTurnActive(turn, currentTime) ? "#f0fdf4" : "#fff", border: `1px solid ${isTurnActive(turn, currentTime) ? "#bbf7d0" : C.borderLight}`, borderRadius: 8, padding: "11px 12px" }}>
                  <div style={{ fontSize: 12, color: C.textMut, fontWeight: 850 }}>{turn.timestamp || "--:--"}</div>
                  <div style={{ fontSize: 12, color: C.pri, fontWeight: 900 }}>{turn.speaker}</div>
                  <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55 }}><TranscriptWords turn={turn} currentTime={currentTime} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewGuideModal({
  record,
  fields,
  artifacts,
  pdfUrl,
  loadingPdf,
  responsesByTarget,
  responseDrafts,
  savingKey,
  exporting,
  activeIndex,
  setActiveIndex,
  getFieldValue,
  setFieldDraft,
  saveField,
  approveField,
  exportFinalPdf,
  onClose,
}) {
  const activeField = fields[activeIndex] || fields[0] || null;
  const activeKey = activeField ? responseKeyForPdfField(activeField) : "";
  const activeResponse = responsesByTarget[activeKey] || {};
  const approved = !!activeResponse.metadata?.approved;
  const approvedCount = fields.filter((field) => responsesByTarget[responseKeyForPdfField(field)]?.metadata?.approved).length;
  const activeValue = activeField ? getFieldValue(activeField) : "";

  const goNext = () => {
    if (!fields.length) return;
    const nextUnapproved = fields.findIndex((field, index) => index > activeIndex && !responsesByTarget[responseKeyForPdfField(field)]?.metadata?.approved);
    if (nextUnapproved >= 0) setActiveIndex(nextUnapproved);
    else setActiveIndex(Math.min(fields.length - 1, activeIndex + 1));
  };

  const approveAndNext = async () => {
    if (!activeField) return;
    await approveField(activeField, activeValue);
    goNext();
  };

  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div className="interview-immersive-shell" onClick={(event) => event.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Interview Guide</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{record.candidate_full_name} - {approvedCount}/{fields.length} approved</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Btn variant="success" size="sm" onClick={exportFinalPdf} disabled={exporting || !pdfUrl}>{exporting ? "Exporting..." : "Export Final PDF"}</Btn>
            <IconButton label="Close guide" onClick={onClose}>{"x"}</IconButton>
          </div>
        </div>
        <div className="interview-guide-grid" style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr) 360px", minHeight: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, overflowY: "auto", background: "#fff" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fields</div>
            {fields.length === 0 ? (
              <div style={{ padding: 14, color: C.textMut, fontSize: 13 }}>No PDF fields found.</div>
            ) : fields.map((field, index) => {
              const key = responseKeyForPdfField(field);
              const isActive = index === activeIndex;
              const isApproved = !!responsesByTarget[key]?.metadata?.approved;
              const hasDraft = !!(getFieldValue(field) || "").trim();
              return (
                <button
                  type="button"
                  key={field.name}
                  onClick={() => setActiveIndex(index)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "22px minmax(0, 1fr)",
                    gap: 8,
                    alignItems: "start",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: `1px solid ${C.borderLight}`,
                    background: isActive ? C.priLt : "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${isApproved ? C.suc : C.border}`, background: isApproved ? C.suc : "#fff", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{isApproved ? "✓" : ""}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: C.text, fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field.name}</span>
                    <span style={{ display: "block", color: hasDraft ? C.pri : C.textMut, marginTop: 2, fontSize: 11 }}>Page {field.page_number || "-"} - {getPdfFieldTypeLabel(field.type)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="interview-guide-pdf" style={{ background: "#e5e7eb", padding: 14, minHeight: 0 }}>
            {loadingPdf ? (
              <div style={{ height: "100%", minHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontWeight: 800 }}>Rendering guide...</div>
            ) : pdfUrl ? (
              <iframe title="Filled Interview Guide" src={`${pdfUrl}#page=${activeField?.page_number || 1}&toolbar=0&navpanes=0&scrollbar=0`} style={{ width: "100%", height: "100%", minHeight: 560, border: "none", borderRadius: 6, background: "#fff", boxShadow: "0 10px 30px rgba(15,23,42,0.18)" }} />
            ) : (
              <EmptyState title="No PDF" body="This interview does not have a source guide PDF." />
            )}
          </div>
          <div style={{ borderLeft: `1px solid ${C.border}`, background: "#fff", padding: 16, overflowY: "auto" }}>
            {activeField ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Review Field</div>
                      <div style={{ marginTop: 5, fontSize: 16, color: C.text, fontWeight: 950, overflowWrap: "anywhere" }}>{activeField.name}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>Page {activeField.page_number || "-"} - {getPdfFieldTypeLabel(activeField.type)}</div>
                    </div>
                    <Badge color={approved ? "success" : activeResponse.ai_draft_text ? "warning" : "default"}>{approved ? "Approved" : activeResponse.ai_draft_text ? "AI Draft" : "Manual"}</Badge>
                  </div>
                </div>
                <textarea
                  value={activeValue}
                  onChange={(event) => setFieldDraft(activeField, event.target.value)}
                  onBlur={(event) => saveField(activeField, event.target.value)}
                  rows={9}
                  style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, color: C.text, resize: "vertical", outline: "none", background: "#fff" }}
                />
                {Array.isArray(activeResponse.ai_evidence) && activeResponse.ai_evidence.length > 0 && (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Evidence</div>
                    {activeResponse.ai_evidence.map((entry, index) => (
                      <div key={index} style={{ borderLeft: `3px solid ${C.acc}`, paddingLeft: 10, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>{entry}</div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: C.textMut, fontSize: 12 }}>{savingKey === activeKey ? "Saving..." : "Autosaved by field name"}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="secondary" size="sm" onClick={() => saveField(activeField, activeValue)}>Save</Btn>
                    <Btn variant="primary" size="sm" onClick={approveAndNext}>Approve & Next</Btn>
                  </div>
                </div>
                {artifacts.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Exports</div>
                    {artifacts.slice(0, 3).map((artifact) => (
                      <div key={artifact.id} style={{ fontSize: 12, color: C.textSec, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artifact.file_name}</span>
                        <span>{artifact.created_at ? new Date(artifact.created_at).toLocaleDateString() : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="No Fields" body="Publish a fillable PDF template before reviewing the guide." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionReviewModal({
  record,
  questions,
  responsesByTarget,
  responseDrafts,
  savingKey,
  activeIndex,
  setActiveIndex,
  setQuestionDraft,
  saveQuestionResponse,
  approveQuestion,
  onClose,
}) {
  const activeQuestion = questions[activeIndex] || questions[0] || null;
  const activeKey = activeQuestion ? responseKeyForQuestion(activeQuestion) : "";
  const activeResponse = responsesByTarget[activeKey] || {};
  const approvedCount = questions.filter((question) => responsesByTarget[responseKeyForQuestion(question)]?.metadata?.approved).length;
  const activeValue = activeKey ? (responseDrafts[activeKey] || "") : "";

  const approveAndNext = async () => {
    if (!activeQuestion) return;
    await approveQuestion(activeQuestion, activeValue);
    const nextUnapproved = questions.findIndex((question, index) => index > activeIndex && !responsesByTarget[responseKeyForQuestion(question)]?.metadata?.approved);
    if (nextUnapproved >= 0) setActiveIndex(nextUnapproved);
    else setActiveIndex(Math.min(questions.length - 1, activeIndex + 1));
  };

  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div className="interview-immersive-shell" onClick={(event) => event.stopPropagation()} style={{ width: "min(1120px, 94vw)" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Custom Questions</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{record.candidate_full_name} - {approvedCount}/{questions.length} approved</div>
          </div>
          <IconButton label="Close questions" onClick={onClose}>{"x"}</IconButton>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", minHeight: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, overflowY: "auto", background: "#fff" }}>
            {questions.map((question, index) => {
              const key = responseKeyForQuestion(question);
              const isActive = index === activeIndex;
              const isApproved = !!responsesByTarget[key]?.metadata?.approved;
              return (
                <button
                  type="button"
                  key={question.question_key}
                  onClick={() => setActiveIndex(index)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "22px minmax(0, 1fr)",
                    gap: 8,
                    padding: "12px 14px",
                    border: "none",
                    borderBottom: `1px solid ${C.borderLight}`,
                    background: isActive ? C.priLt : "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${isApproved ? C.suc : C.border}`, background: isApproved ? C.suc : "#fff", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{isApproved ? "✓" : ""}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 950, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{question.prompt}</span>
                    <span style={{ display: "block", marginTop: 3, fontSize: 11, color: C.textMut }}>{question.category || "Interview"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: 18, background: C.surfaceHover, overflowY: "auto" }}>
            {activeQuestion ? (
              <div style={{ maxWidth: 760, display: "grid", gap: 14 }}>
                <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>{activeQuestion.category || "Interview"}</div>
                      <div style={{ marginTop: 7, fontSize: 18, lineHeight: 1.35, color: C.text, fontWeight: 950 }}>{activeQuestion.prompt}</div>
                    </div>
                    <Badge color={activeResponse.metadata?.approved ? "success" : activeResponse.ai_draft_text ? "warning" : "default"}>{activeResponse.metadata?.approved ? "Approved" : activeResponse.ai_draft_text ? "AI Draft" : "Manual"}</Badge>
                  </div>
                </div>
                <textarea
                  value={activeValue}
                  onChange={(event) => setQuestionDraft(activeQuestion, event.target.value)}
                  onBlur={(event) => saveQuestionResponse(activeQuestion, event.target.value)}
                  rows={12}
                  style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 13, fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, color: C.text, resize: "vertical", background: "#fff", outline: "none" }}
                />
                {Array.isArray(activeResponse.ai_evidence) && activeResponse.ai_evidence.length > 0 && (
                  <div style={{ background: "#fff", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 13, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Evidence</div>
                    {activeResponse.ai_evidence.map((entry, index) => (
                      <div key={index} style={{ borderLeft: `3px solid ${C.acc}`, paddingLeft: 10, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>{entry}</div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: C.textMut, fontSize: 12 }}>{savingKey === activeKey ? "Saving..." : "Autosaved"}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="secondary" size="sm" onClick={() => saveQuestionResponse(activeQuestion, activeValue)}>Save</Btn>
                    <Btn variant="primary" size="sm" onClick={approveAndNext}>Approve & Next</Btn>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="No Questions" body="Add shared custom questions in configuration." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LaborInterviewsPage({ data, profile, addGlobalToast, locationName }) {
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const locationRef = profile?.location_id || data?.locationId || "";
  const [locationId, setLocationId] = useState("");
  const [view, setView] = useState("records");
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [records, setRecords] = useState([]);
  const [responses, setResponses] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [showNewInterview, setShowNewInterview] = useState(false);
  const [showCandidateEdit, setShowCandidateEdit] = useState(false);
  const [candidateEditDraft, setCandidateEditDraft] = useState(() => buildNewInterviewDraft());
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [guidePdfUrl, setGuidePdfUrl] = useState("");
  const [guidePdfLoading, setGuidePdfLoading] = useState(false);
  const [pdfReviewIndex, setPdfReviewIndex] = useState(0);
  const [questionReviewIndex, setQuestionReviewIndex] = useState(0);
  const [configQuestionsOpen, setConfigQuestionsOpen] = useState(false);
  const [showNewPosition, setShowNewPosition] = useState(false);
  const [newPositionDraft, setNewPositionDraft] = useState({ role_label: "", description: "" });
  const [dragQuestionId, setDragQuestionId] = useState("");
  const [newInterviewDraft, setNewInterviewDraft] = useState(() => buildNewInterviewDraft());
  const [savingNewInterview, setSavingNewInterview] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState({});
  const [savingResponseKey, setSavingResponseKey] = useState("");
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [newQuestionDrafts, setNewQuestionDrafts] = useState({});
  const [templateActionId, setTemplateActionId] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [audioFileName, setAudioFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showConfigSettings, setShowConfigSettings] = useState(false);
  const [autoScoreCandidates, setAutoScoreCandidates] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [audioTranscribing, setAudioTranscribing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const pdfInputRefs = useRef({});
  const audioInputRef = useRef(null);
  const audioPlayerRef = useRef(null);

  const versionsByTemplate = useMemo(() => {
    return versions.reduce((map, version) => {
      if (!map[version.template_id]) map[version.template_id] = [];
      map[version.template_id].push(version);
      return map;
    }, {});
  }, [versions]);

  const questionsByVersion = useMemo(() => {
    return questions.reduce((map, question) => {
      if (!map[question.template_version_id]) map[question.template_version_id] = [];
      map[question.template_version_id].push(question);
      return map;
    }, {});
  }, [questions]);

  const publishedVersions = useMemo(() => {
    return versions.filter((version) => version.status === "published" && version.is_current);
  }, [versions]);

  const selectedRecord = useMemo(() => {
    return records.find((record) => record.id === selectedRecordId) || null;
  }, [records, selectedRecordId]);

  const selectedSnapshot = useMemo(() => snapshotForRecord(selectedRecord), [selectedRecord]);
  const selectedQuestions = useMemo(() => questionRowsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const selectedPdfFields = useMemo(() => pdfFieldsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const responsesByTarget = useMemo(() => mapResponsesByTarget(responses), [responses]);
  const autoScoreStorageKey = useMemo(() => getAutoScoreStorageKey(actorUserId), [actorUserId]);
  const selectedTranscriptTurns = useMemo(() => {
    const durationSeconds = Number(selectedRecord?.metadata?.audio_transcription?.duration_seconds || audioDuration || 0);
    return getInterviewTranscriptTurns(selectedRecord || {}, { durationSeconds });
  }, [audioDuration, selectedRecord]);

  const metrics = useMemo(() => {
    const completed = records.filter((record) => record.status === "completed").length;
    const aiDrafted = records.filter((record) => record.status === "ai_drafted").length;
    const verifiedTemplates = versions.filter((version) => version.pdf_verification_status === "verified_fields").length;
    return {
      total: records.length,
      completed,
      aiDrafted,
      verifiedTemplates,
    };
  }, [records, versions]);

  const selectedTemplateVersion = useMemo(() => {
    return versions.find((version) => version.id === newInterviewDraft.template_version_id) || null;
  }, [newInterviewDraft.template_version_id, versions]);

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedTemplateVersion?.template_id) || null;
  }, [selectedTemplateVersion, templates]);

  const draftVersions = useMemo(() => versions.filter((version) => version.status === "draft"), [versions]);

  const sharedQuestionSourceVersion = useMemo(() => {
    return draftVersions[0] || publishedVersions[0] || versions[0] || null;
  }, [draftVersions, publishedVersions, versions]);

  const sharedQuestions = useMemo(() => {
    if (!sharedQuestionSourceVersion?.id) return [];
    return [...(questionsByVersion[sharedQuestionSourceVersion.id] || [])]
      .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
  }, [questionsByVersion, sharedQuestionSourceVersion]);

  const showToast = useCallback((message, type = "success") => {
    addGlobalToast?.(message, type);
  }, [addGlobalToast]);

  const loadAll = useCallback(async (resolvedLocationId = locationId) => {
    if (!resolvedLocationId) return;
    setLoading(true);
    setSchemaError("");
    try {
      const templateRes = await supabase
        .from("labor_interview_templates")
        .select("*")
        .eq("location_id", resolvedLocationId)
        .order("role_label", { ascending: true });
      if (templateRes.error) throw templateRes.error;
      const templateRows = templateRes.data || [];
      const templateIds = templateRows.map((template) => template.id);

      const versionRes = templateIds.length
        ? await supabase
            .from("labor_interview_template_versions")
            .select("*")
            .in("template_id", templateIds)
            .order("template_id")
            .order("version_no", { ascending: false })
        : { data: [], error: null };
      if (versionRes.error) throw versionRes.error;
      const versionRows = versionRes.data || [];
      const versionIds = versionRows.map((version) => version.id);

      const questionRes = versionIds.length
        ? await supabase
            .from("labor_interview_template_questions")
            .select("*")
            .in("template_version_id", versionIds)
            .order("sequence_order", { ascending: true })
        : { data: [], error: null };
      if (questionRes.error) throw questionRes.error;

      const recordRes = await supabase
        .from("labor_interview_records")
        .select("*")
        .eq("location_id", resolvedLocationId)
        .order("interview_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (recordRes.error) throw recordRes.error;

      setTemplates(templateRows);
      setVersions(versionRows);
      setQuestions(questionRes.data || []);
      setRecords(recordRes.data || []);
    } catch (error) {
      const missing = error?.code === "PGRST205" || /labor_interview_/i.test(error?.message || "");
      setSchemaError(missing ? "Interview database tables are not available in this environment yet." : (error?.message || "Unable to load interviews."));
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    let active = true;
    resolveTrainingLocationId(supabase, locationRef, actorUserId).then((resolved) => {
      if (!active) return;
      setLocationId(resolved || "");
      if (resolved) loadAll(resolved);
      else setLoading(false);
    });
    return () => { active = false; };
  }, [actorUserId, loadAll, locationRef]);

  useEffect(() => {
    setAutoScoreCandidates(readAutoScoreSetting(autoScoreStorageKey));
  }, [autoScoreStorageKey]);

  useEffect(() => {
    const loadRecordDetail = async () => {
      if (!selectedRecord?.id) {
        setResponses([]);
        setArtifacts([]);
        return;
      }
      const [responseRes, artifactRes] = await Promise.all([
        supabase.from("labor_interview_responses").select("*").eq("interview_id", selectedRecord.id).order("created_at"),
        supabase.from("labor_interview_artifacts").select("*").eq("interview_id", selectedRecord.id).order("created_at", { ascending: false }),
      ]);
      if (responseRes.error) {
        showToast("Failed to load interview responses", "error");
        return;
      }
      setResponses(responseRes.data || []);
      setArtifacts(artifactRes.data || []);
    };
    loadRecordDetail();
  }, [selectedRecord?.id, showToast]);

  useEffect(() => {
    setAudioFileName("");
    setPdfReviewIndex(0);
    setQuestionReviewIndex(0);
    setShowCandidateEdit(false);
    setShowGuideModal(false);
    setShowQuestionsModal(false);
    setShowTranscriptModal(false);
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
  }, [selectedRecord?.id]);

  useEffect(() => {
    if (!selectedRecord) return;
    setCandidateEditDraft({
      candidate_full_name: selectedRecord.candidate_full_name || "",
      candidate_email: selectedRecord.candidate_email || "",
      candidate_phone: selectedRecord.candidate_phone || "",
      candidate_position: selectedRecord.candidate_position || "",
      interview_date: selectedRecord.interview_date || "",
      interview_time: selectedRecord.interview_time || "",
      interviewer_name: selectedRecord.interviewer_name || actorName || "",
      zoom_recording_url: selectedRecord.zoom_recording_url || "",
      zoom_passcode: selectedRecord.zoom_passcode || "",
      template_version_id: selectedRecord.template_version_id || "",
    });
  }, [actorName, selectedRecord]);

  useEffect(() => {
    const nextDrafts = {};
    (responses || []).forEach((response) => {
      if (response.response_type === "custom_question" && response.question_key) {
        nextDrafts[fieldKey("custom_question", response.question_key)] = getResponseDraft(response);
      }
      if (response.response_type === "pdf_field" && response.pdf_field_name) {
        nextDrafts[fieldKey("pdf_field", response.pdf_field_name)] = getResponseDraft(response);
      }
    });
    setResponseDrafts(nextDrafts);
  }, [responses]);

  useEffect(() => {
    const path = selectedSnapshot?.version?.source_pdf_path;
    const bucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!path) {
      setPdfPreviewUrl("");
      return;
    }
    let active = true;
    supabase.storage.from(bucket).createSignedUrl(path, 60 * 30).then(({ data: signed, error }) => {
      if (!active) return;
      setPdfPreviewUrl(error ? "" : signed?.signedUrl || "");
    });
    return () => { active = false; };
  }, [selectedSnapshot]);

  useEffect(() => {
    const sourceAudio = selectedRecord?.metadata?.audio_transcription?.source_audio || {};
    const path = sourceAudio.path;
    const bucket = sourceAudio.bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!path) {
      setAudioUrl("");
      return;
    }
    let active = true;
    supabase.storage.from(bucket).createSignedUrl(path, 60 * 30).then(({ data: signed, error }) => {
      if (!active) return;
      setAudioUrl(error ? "" : signed?.signedUrl || "");
    });
    return () => { active = false; };
  }, [selectedRecord?.metadata?.audio_transcription?.source_audio]);

  useEffect(() => {
    if (!showGuideModal) {
      setGuidePdfUrl("");
      return undefined;
    }
    const path = selectedSnapshot?.version?.source_pdf_path;
    const bucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!path || !selectedRecord?.id) {
      setGuidePdfUrl("");
      return undefined;
    }
    let active = true;
    let objectUrl = "";
    setGuidePdfLoading(true);
    supabase.storage.from(bucket).download(path)
      .then(async ({ data: sourceBlob, error }) => {
        if (error) throw error;
        const bytes = await sourceBlob.arrayBuffer();
        const filledBytes = await fillInterviewPdfBytes(
          bytes,
          buildPdfResponseMap(responses, selectedRecord, selectedPdfFields),
          { flatten: false },
        );
        objectUrl = URL.createObjectURL(new Blob([filledBytes], { type: "application/pdf" }));
        if (active) setGuidePdfUrl(objectUrl);
      })
      .catch((error) => {
        if (active) showToast(safeUiError(error, "Failed to render interview guide"), "error");
      })
      .finally(() => {
        if (active) setGuidePdfLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [responses, selectedPdfFields, selectedRecord, selectedSnapshot, showGuideModal, showToast]);

  const setAutoScorePreference = (enabled) => {
    setAutoScoreCandidates(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(autoScoreStorageKey, enabled ? "true" : "false");
    }
  };

  const toggleAudioPlayback = async () => {
    const player = audioPlayerRef.current;
    if (!player || !audioUrl) return;
    try {
      if (audioPlaying) {
        player.pause();
        setAudioPlaying(false);
      } else {
        await player.play();
        setAudioPlaying(true);
      }
    } catch (error) {
      showToast(safeUiError(error, "Audio playback failed"), "error");
    }
  };

  const createNewInterview = async () => {
    const normalized = normalizeInterviewCandidateDraft({
      ...newInterviewDraft,
      interviewer_name: newInterviewDraft.interviewer_name || actorName,
    });
    if (!normalized.candidate_full_name || !selectedTemplate || !selectedTemplateVersion) {
      showToast("Candidate name and a published role template are required.", "error");
      return;
    }
    const versionQuestions = questionsByVersion[selectedTemplateVersion.id] || [];
    const snapshot = buildInterviewTemplateSnapshot({
      template: selectedTemplate,
      version: selectedTemplateVersion,
      questions: versionQuestions,
    });
    setSavingNewInterview(true);
    try {
      const { data: created, error } = await supabase.from("labor_interview_records").insert({
        location_id: locationId,
        template_id: selectedTemplate.id,
        template_version_id: selectedTemplateVersion.id,
        ...normalized,
        status: "draft",
        interviewer_user_id: actorUserId,
        metadata: {
          hiring_recommendation: "pending",
        },
        template_snapshot: snapshot,
        pdf_field_manifest_snapshot: selectedTemplateVersion.pdf_field_manifest || [],
        question_snapshot: snapshot.questions || [],
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
      }).select("*").single();
      if (error) throw error;
      setRecords((prev) => [created, ...prev]);
      setSelectedRecordId(created.id);
      setShowNewInterview(false);
      setNewInterviewDraft(buildNewInterviewDraft());
      showToast("Interview created");
    } catch (error) {
      showToast(error?.message || "Failed to create interview", "error");
    } finally {
      setSavingNewInterview(false);
    }
  };

  const saveRecordPatch = async (patch) => {
    if (!selectedRecord?.id) return;
    setRecordSaving(true);
    try {
      const { data: updated, error } = await supabase
        .from("labor_interview_records")
        .update({ ...patch, updated_by_user_id: actorUserId, updated_at: new Date().toISOString() })
        .eq("id", selectedRecord.id)
        .select("*")
        .single();
      if (error) throw error;
      setRecords((prev) => prev.map((record) => record.id === updated.id ? updated : record));
      return updated;
    } catch (error) {
      showToast(safeUiError(error, "Failed to save interview"), "error");
      return null;
    } finally {
      setRecordSaving(false);
    }
  };

  const saveRecordMetadataPatch = async (metadataPatch) => {
    if (!selectedRecord?.id) return null;
    return saveRecordPatch({
      metadata: {
        ...(selectedRecord.metadata || {}),
        ...metadataPatch,
      },
    });
  };

  const deleteSelectedInterview = async () => {
    if (!selectedRecord?.id) return;
    if (!window.confirm(`Delete interview for ${selectedRecord.candidate_full_name}?`)) return;
    setRecordSaving(true);
    try {
      const { error } = await supabase
        .from("labor_interview_records")
        .delete()
        .eq("id", selectedRecord.id);
      if (error) throw error;
      setRecords((prev) => prev.filter((record) => record.id !== selectedRecord.id));
      setSelectedRecordId("");
      showToast("Interview deleted");
    } catch (error) {
      showToast(safeUiError(error, "Failed to delete interview"), "error");
    } finally {
      setRecordSaving(false);
    }
  };

  const saveCandidateEdit = async () => {
    const normalized = normalizeInterviewCandidateDraft(candidateEditDraft);
    if (!normalized.candidate_full_name) {
      showToast("Candidate name is required.", "error");
      return;
    }
    const updated = await saveRecordPatch(normalized);
    if (updated) {
      setShowCandidateEdit(false);
      showToast("Candidate details saved");
    }
  };

  const saveResponse = async ({ responseType, key, prompt, value, metadataPatch = null }) => {
    if (!selectedRecord?.id || !key) return;
    const targetKey = fieldKey(responseType, key);
    const existing = responsesByTarget[targetKey];
    setSavingResponseKey(targetKey);
    try {
      if (existing?.id) {
        const { data: updated, error } = await supabase
          .from("labor_interview_responses")
          .update({
            response_text: value || null,
            prompt_snapshot: prompt,
            metadata: metadataPatch ? { ...(existing.metadata || {}), ...metadataPatch } : existing.metadata,
            updated_by_user_id: actorUserId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        setResponses((prev) => prev.map((response) => response.id === updated.id ? updated : response));
      } else {
        const insertRow = {
          interview_id: selectedRecord.id,
          response_type: responseType,
          question_key: responseType === "custom_question" ? key : null,
          pdf_field_name: responseType === "pdf_field" ? key : null,
          prompt_snapshot: prompt,
          response_text: value || null,
          metadata: metadataPatch || {},
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        };
        const { data: created, error } = await supabase
          .from("labor_interview_responses")
          .insert(insertRow)
          .select("*")
          .single();
        if (error) throw error;
        setResponses((prev) => [...prev, created]);
      }
      if (selectedRecord.status === "draft") {
        await saveRecordPatch({ status: "in_progress" });
      }
      return true;
    } catch (error) {
      showToast(safeUiError(error, "Failed to save response"), "error");
      return false;
    } finally {
      setSavingResponseKey("");
    }
  };

  const draftInterview = async (interviewId = selectedRecord?.id, options = {}) => {
    const { requireLocalTranscript = true, quietStart = false } = options;
    if (!interviewId) return null;
    if (requireLocalTranscript && !String(selectedRecord?.transcript_text || "").trim()) {
      showToast("Upload interview audio or a transcript first.", "error");
      return null;
    }
    setAiDrafting(true);
    try {
      const { data: startResult, error: startError } = await supabase.functions.invoke("interview-ai-draft", {
        body: { interview_id: interviewId, action: "start", auto_score_candidate: autoScoreCandidates },
      });
      if (startError) throw new Error(await readEdgeFunctionError(startError, "AI draft failed"));

      let result = startResult;
      if (startResult?.pending) {
        if (!quietStart) showToast(startResult.reused ? "Resuming AI draft" : "AI draft started");
        const requestId = startResult.request_id;
        let completed = false;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await sleep(attempt === 0 ? 5000 : 10000);
          const { data: pollResult, error: pollError } = await supabase.functions.invoke("interview-ai-draft", {
            body: { interview_id: interviewId, action: "poll", request_id: requestId },
          });
          if (pollError) throw new Error(await readEdgeFunctionError(pollError, "AI draft failed"));
          result = pollResult;
          if (!pollResult?.pending) {
            completed = true;
            break;
          }
        }
        if (!completed) {
          throw new Error("AI is still drafting. Reopen this interview in a minute to resume review without resending the transcript.");
        }
      }

      showToast(`AI populated ${result?.saved_count || 0} response${result?.saved_count === 1 ? "" : "s"}`);
      await loadAll(locationId);
      setSelectedRecordId(interviewId);
      return result;
    } catch (error) {
      showToast(safeUiError(error, "AI draft failed"), "error");
      return null;
    } finally {
      setAiDrafting(false);
    }
  };

  const handleAudioUpload = async (file) => {
    if (!selectedRecord?.id || !file) return;
    const validation = validateInterviewAudioFile(file);
    if (!validation.ok) {
      showToast(validation.error, "error");
      return;
    }
    setAudioTranscribing(true);
    try {
      const path = buildInterviewAudioPath({ locationId, interviewId: selectedRecord.id, fileName: file.name });
      const contentType = validation.contentType || getInterviewAudioContentType(file);
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(path, file, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      setAudioFileName(file.name);

      const { data: result, error } = await supabase.functions.invoke("interview-transcribe-audio", {
        body: {
          interview_id: selectedRecord.id,
          audio_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          audio_file_path: path,
          audio_file_name: file.name,
          audio_mime_type: contentType,
        },
      });
      if (error) throw new Error(await readEdgeFunctionError(error, "Failed to transcribe audio"));
      if (!result?.transcript_text) throw new Error("AI returned no transcript text.");

      const minutes = Number(result.duration_seconds) > 0 ? Math.max(1, Math.round(Number(result.duration_seconds) / 60)) : null;
      showToast(minutes ? `Audio processed: ${minutes} min. Drafting responses now.` : "Audio processed. Drafting responses now.");
      await loadAll(locationId);
      setSelectedRecordId(selectedRecord.id);
      await draftInterview(selectedRecord.id, { requireLocalTranscript: false, quietStart: true });
    } catch (error) {
      showToast(safeUiError(error, "Failed to process audio"), "error");
    } finally {
      setAudioTranscribing(false);
    }
  };

  const exportFinalPdf = async () => {
    const path = selectedSnapshot?.version?.source_pdf_path;
    const bucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!selectedRecord?.id || !path) return;
    setExportingPdf(true);
    try {
      const { data: sourceBlob, error: downloadError } = await supabase.storage.from(bucket).download(path);
      if (downloadError) throw downloadError;
      const bytes = await sourceBlob.arrayBuffer();
      const filledBytes = await fillInterviewPdfBytes(bytes, buildPdfResponseMap(responses, selectedRecord, selectedPdfFields), { flatten: true });
      const outputName = `${selectedRecord.candidate_full_name.replace(/[^a-z0-9]+/gi, "-") || "candidate"}-interview.pdf`;
      const artifactPath = buildInterviewArtifactPath({ locationId, interviewId: selectedRecord.id, fileName: outputName });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(artifactPath, new Blob([filledBytes], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      const { data: artifact, error: artifactError } = await supabase
        .from("labor_interview_artifacts")
        .insert({
          interview_id: selectedRecord.id,
          artifact_type: "final_pdf",
          file_name: outputName,
          storage_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          storage_path: artifactPath,
          mime_type: "application/pdf",
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        })
        .select("*")
        .single();
      if (artifactError) throw artifactError;
      setArtifacts((prev) => [artifact, ...prev]);
      await saveRecordPatch({ status: "completed" });
      showToast("Final PDF exported");
    } catch (error) {
      showToast(safeUiError(error, "Failed to export PDF"), "error");
    } finally {
      setExportingPdf(false);
    }
  };

  const getPdfFieldValue = (field) => {
    const key = responseKeyForPdfField(field);
    const metadataValue = buildPdfResponseMap([], selectedRecord, [field])[field.name] || "";
    if (Object.prototype.hasOwnProperty.call(responseDrafts, key)) return responseDrafts[key] || metadataValue || "";
    return metadataValue;
  };

  const setPdfFieldDraft = (field, value) => {
    const key = responseKeyForPdfField(field);
    setResponseDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const setQuestionResponseDraft = (question, value) => {
    const key = responseKeyForQuestion(question);
    setResponseDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const savePdfFieldResponse = (field, value) => saveResponse({
    responseType: "pdf_field",
    key: field.name,
    prompt: field.name,
    value,
  });

  const approvePdfField = (field, value) => saveResponse({
    responseType: "pdf_field",
    key: field.name,
    prompt: field.name,
    value,
    metadataPatch: {
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: actorName,
    },
  });

  const saveCustomQuestionResponse = (question, value) => saveResponse({
    responseType: "custom_question",
    key: question.question_key,
    prompt: question.prompt,
    value,
  });

  const approveCustomQuestion = (question, value) => saveResponse({
    responseType: "custom_question",
    key: question.question_key,
    prompt: question.prompt,
    value,
    metadataPatch: {
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: actorName,
    },
  });

  const uploadTemplatePdf = async (version, file) => {
    if (!version || !file || version.status !== "draft") return;
    setTemplateActionId(version.id);
    try {
      const bytes = await file.arrayBuffer();
      const verification = await extractPdfFieldManifest(bytes);
      if (verification.status === "failed_invalid_pdf") {
        await supabase.from("labor_interview_template_versions").update({
          pdf_verification_status: verification.status,
          pdf_field_manifest: [],
          pdf_page_count: null,
        }).eq("id", version.id);
        throw new Error(verification.error || "Invalid PDF file.");
      }
      const path = buildInterviewTemplatePdfPath({
        locationId,
        templateId: version.template_id,
        versionNo: version.version_no,
        fileName: file.name,
      });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
      if (uploadError) throw uploadError;
      const { data: updated, error } = await supabase
        .from("labor_interview_template_versions")
        .update({
          source_pdf_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          source_pdf_path: path,
          source_pdf_file_name: file.name,
          source_pdf_mime_type: file.type || "application/pdf",
          source_pdf_file_size_bytes: file.size,
          pdf_page_count: verification.pageCount,
          pdf_field_manifest: verification.manifest,
          pdf_verification_status: verification.status,
          metadata: {
            ...(version.metadata || {}),
            verified_at: new Date().toISOString(),
            verified_by: actorUserId,
          },
        })
        .eq("id", version.id)
        .select("*")
        .single();
      if (error) throw error;
      setVersions((prev) => prev.map((row) => row.id === updated.id ? updated : row));
      showToast(verification.ok ? `PDF verified with ${verification.manifest.length} field${verification.manifest.length === 1 ? "" : "s"}` : "PDF uploaded but no form fields were found", verification.ok ? "success" : "error");
    } catch (error) {
      showToast(error?.message || "Failed to upload PDF", "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const publishVersion = async (template, version) => {
    if (!template || !version || version.pdf_verification_status !== "verified_fields") return;
    setTemplateActionId(version.id);
    try {
      const snapshot = buildInterviewTemplateSnapshot({
        template,
        version,
        questions: questionsByVersion[version.id] || [],
      });
      await supabase
        .from("labor_interview_template_versions")
        .update({ is_current: false })
        .eq("template_id", template.id);
      const { data: updated, error } = await supabase
        .from("labor_interview_template_versions")
        .update({
          status: "published",
          is_current: true,
          published_at: new Date().toISOString(),
          published_snapshot: snapshot,
        })
        .eq("id", version.id)
        .select("*")
        .single();
      if (error) throw error;
      setVersions((prev) => prev.map((row) => {
        if (row.template_id === template.id && row.id !== version.id) return { ...row, is_current: false };
        return row.id === version.id ? updated : row;
      }));
      showToast(`${template.role_label} template published`);
    } catch (error) {
      showToast(error?.message || "Failed to publish template", "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const createDraftVersion = async (template) => {
    const templateVersions = versionsByTemplate[template.id] || [];
    const baseVersion = templateVersions.find((version) => version.is_current) || templateVersions[0];
    const nextNo = Math.max(0, ...templateVersions.map((version) => Number(version.version_no || 0))) + 1;
    setTemplateActionId(template.id);
    try {
      const { data: created, error } = await supabase
        .from("labor_interview_template_versions")
        .insert({
          template_id: template.id,
          version_no: nextNo,
          status: "draft",
          is_current: false,
          source_pdf_bucket: baseVersion?.source_pdf_bucket || null,
          source_pdf_path: baseVersion?.source_pdf_path || null,
          source_pdf_file_name: baseVersion?.source_pdf_file_name || null,
          source_pdf_mime_type: baseVersion?.source_pdf_mime_type || null,
          source_pdf_file_size_bytes: baseVersion?.source_pdf_file_size_bytes || null,
          pdf_page_count: baseVersion?.pdf_page_count || null,
          pdf_field_manifest: baseVersion?.pdf_field_manifest || [],
          pdf_verification_status: baseVersion?.pdf_verification_status || "missing_pdf",
          changelog: `Draft copied from version ${baseVersion?.version_no || 1}.`,
          created_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      const baseQuestions = baseVersion ? (questionsByVersion[baseVersion.id] || []) : [];
      if (baseQuestions.length) {
        const clonedQuestions = baseQuestions.map((question) => ({
          template_version_id: created.id,
          question_key: question.question_key,
          category: question.category,
          prompt: question.prompt,
          helper_text: question.helper_text,
          sequence_order: question.sequence_order,
          required: question.required,
          answer_format: question.answer_format,
          mapped_pdf_field_name: question.mapped_pdf_field_name,
          metadata: question.metadata || {},
        }));
        const { error: cloneError } = await supabase.from("labor_interview_template_questions").insert(clonedQuestions);
        if (cloneError) throw cloneError;
      }
      await loadAll(locationId);
      showToast(`Draft version ${nextNo} created`);
    } catch (error) {
      showToast(error?.message || "Failed to create draft", "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const createPositionType = async () => {
    const roleLabel = String(newPositionDraft.role_label || "").trim();
    if (!roleLabel) {
      showToast("Position name is required.", "error");
      return;
    }
    const roleKeyBase = normalizeQuestionKey(roleLabel).replace(/^question_1$/, "position");
    const roleKey = `${roleKeyBase}_${Date.now().toString(36)}`;
    setTemplateActionId("new-position");
    try {
      const { data: template, error: templateError } = await supabase
        .from("labor_interview_templates")
        .insert({
          location_id: locationId,
          role_key: roleKey,
          role_label: roleLabel,
          description: newPositionDraft.description || null,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (templateError) throw templateError;
      const { data: version, error: versionError } = await supabase
        .from("labor_interview_template_versions")
        .insert({
          template_id: template.id,
          version_no: 1,
          status: "draft",
          is_current: false,
          pdf_field_manifest: [],
          pdf_verification_status: "missing_pdf",
          created_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (versionError) throw versionError;
      if (sharedQuestions.length) {
        const rows = sharedQuestions.map((question, index) => ({
          template_version_id: version.id,
          question_key: normalizeQuestionKey(question.prompt, index),
          category: question.category || "Custom",
          prompt: question.prompt,
          helper_text: question.helper_text || null,
          sequence_order: question.sequence_order || ((index + 1) * 10),
          required: !!question.required,
          answer_format: question.answer_format || "long_text",
          mapped_pdf_field_name: question.mapped_pdf_field_name || null,
          metadata: question.metadata || {},
        }));
        const { error: questionError } = await supabase.from("labor_interview_template_questions").insert(rows);
        if (questionError) throw questionError;
      }
      setShowNewPosition(false);
      setNewPositionDraft({ role_label: "", description: "" });
      await loadAll(locationId);
      showToast("Position type created");
    } catch (error) {
      showToast(safeUiError(error, "Failed to create position type"), "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const getDraftQuestionMatches = (question) => {
    const draftIds = new Set(draftVersions.map((version) => version.id));
    return questions.filter((row) => {
      if (!draftIds.has(row.template_version_id)) return false;
      return row.sequence_order === question.sequence_order || row.question_key === question.question_key;
    });
  };

  const saveSharedQuestion = async (question, patch) => {
    const rows = getDraftQuestionMatches(question);
    if (!rows.length) {
      showToast("Create draft template versions before editing shared questions.", "error");
      return;
    }
    try {
      const updates = rows.map((row) => supabase
        .from("labor_interview_template_questions")
        .update({
          category: patch.category ?? row.category,
          prompt: patch.prompt ?? row.prompt,
          helper_text: patch.helper_text ?? row.helper_text,
          mapped_pdf_field_name: patch.mapped_pdf_field_name ?? row.mapped_pdf_field_name,
          required: patch.required ?? row.required,
        })
        .eq("id", row.id)
        .select("*")
        .single());
      const results = await Promise.all(updates);
      const errorResult = results.find((result) => result.error);
      if (errorResult?.error) throw errorResult.error;
      const updatedRows = results.map((result) => result.data);
      setQuestions((prev) => prev.map((row) => updatedRows.find((updated) => updated.id === row.id) || row));
    } catch (error) {
      showToast(safeUiError(error, "Failed to save shared question"), "error");
    }
  };

  const addSharedQuestion = async () => {
    const draft = newQuestionDrafts.shared || {};
    const prompt = String(draft.prompt || "").trim();
    if (!prompt) return;
    if (!draftVersions.length) {
      showToast("Create draft template versions before adding shared questions.", "error");
      return;
    }
    const sequence = Math.max(0, ...sharedQuestions.map((question) => Number(question.sequence_order || 0))) + 10;
    try {
      const rows = draftVersions.map((version, index) => ({
        template_version_id: version.id,
        question_key: normalizeQuestionKey(prompt, sharedQuestions.length + index),
        category: draft.category || "Custom",
        prompt,
        sequence_order: sequence,
        required: !!draft.required,
        answer_format: "long_text",
        mapped_pdf_field_name: draft.mapped_pdf_field_name || null,
      }));
      const { data: created, error } = await supabase
        .from("labor_interview_template_questions")
        .insert(rows)
        .select("*");
      if (error) throw error;
      setQuestions((prev) => [...prev, ...(created || [])]);
      setNewQuestionDrafts((prev) => ({ ...prev, shared: { category: draft.category || "Custom", prompt: "" } }));
      showToast("Shared question added");
    } catch (error) {
      showToast(safeUiError(error, "Failed to add shared question"), "error");
    }
  };

  const deleteSharedQuestion = async (question) => {
    if (!window.confirm("Delete this shared draft question from all draft templates?")) return;
    const rows = getDraftQuestionMatches(question);
    if (!rows.length) return;
    try {
      const ids = rows.map((row) => row.id);
      const { error } = await supabase.from("labor_interview_template_questions").delete().in("id", ids);
      if (error) throw error;
      setQuestions((prev) => prev.filter((row) => !ids.includes(row.id)));
      showToast("Shared question deleted");
    } catch (error) {
      showToast(safeUiError(error, "Failed to delete shared question"), "error");
    }
  };

  const reorderSharedQuestion = async (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId || !draftVersions.length) return;
    const sourceIndex = sharedQuestions.findIndex((question) => question.id === sourceId);
    const targetIndex = sharedQuestions.findIndex((question) => question.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...sharedQuestions];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    const orderMap = new Map(next.map((question, index) => [question.sequence_order, (index + 1) * 10]));
    const rowsToUpdate = questions.filter((row) => draftVersions.some((version) => version.id === row.template_version_id) && orderMap.has(row.sequence_order));
    try {
      await Promise.all(rowsToUpdate.map((row) => supabase
        .from("labor_interview_template_questions")
        .update({ sequence_order: orderMap.get(row.sequence_order) })
        .eq("id", row.id)));
      setQuestions((prev) => prev.map((row) => orderMap.has(row.sequence_order) ? { ...row, sequence_order: orderMap.get(row.sequence_order) } : row));
    } catch (error) {
      showToast(safeUiError(error, "Failed to reorder shared questions"), "error");
    }
  };

  const templateOptions = useMemo(() => {
    return publishedVersions.map((version) => {
      const template = templates.find((row) => row.id === version.template_id);
      return {
        value: version.id,
        label: `${template?.role_label || "Role"} - v${version.version_no}`,
      };
    });
  }, [publishedVersions, templates]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 50, color: C.textMut }}>Loading interviews...</div>;
  }

  if (!locationId) {
    return <EmptyState title="Location Required" body="Labor interviews need a resolved location before templates, records, and private PDFs can be loaded." />;
  }

  if (schemaError) {
    return <EmptyState title="Interview Tables Pending" body={schemaError} />;
  }

  const inInterviewDetail = view === "records" && !!selectedRecord;

  return (
    <div>
      <InterviewStyles />
      {!inInterviewDetail && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
          <Metric label="Interviews" value={metrics.total} helper={locationName || data?.locationName || "Current location"} />
          <Metric label="AI Drafts" value={metrics.aiDrafted} helper="Waiting on manager review" />
          <Metric label="Completed" value={metrics.completed} helper="Final PDF exported" />
          <Metric label="Verified PDFs" value={metrics.verifiedTemplates} helper="AcroForm templates" />
        </div>
      )}

      {!inInterviewDetail && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "inline-flex", border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {[
              { id: "records", label: "Interviews" },
              { id: "config", label: "Configuration" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                style={{
                  border: "none",
                  borderRight: item.id === "records" ? `1px solid ${C.border}` : "none",
                  background: view === item.id ? C.pri : C.surface,
                  color: view === item.id ? "#fff" : C.textSec,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Btn variant="primary" onClick={() => setShowNewInterview(true)} disabled={templateOptions.length === 0}>Add New Interview</Btn>
        </div>
      )}

      {view === "records" && !selectedRecord && (
        <InterviewRoster records={records} onOpen={setSelectedRecordId} />
      )}

      {view === "records" && selectedRecord && (
        <div style={{ display: "grid", gap: 16 }}>
          <CandidateHeader
            record={selectedRecord}
            recommendation={getInterviewRecommendation(selectedRecord)}
            onRecommendationChange={(value) => saveRecordMetadataPatch({ hiring_recommendation: value })}
            onEdit={() => setShowCandidateEdit(true)}
            onDelete={deleteSelectedInterview}
            onBack={() => setSelectedRecordId("")}
            saving={recordSaving}
          />

          <AudioUploadPanel
            record={selectedRecord}
            audioFileName={audioFileName}
            transcribing={audioTranscribing}
            drafting={aiDrafting}
            onUpload={handleAudioUpload}
            onTranscriptClick={() => setShowTranscriptModal(true)}
            inputRef={audioInputRef}
            audioRef={audioPlayerRef}
            audioUrl={audioUrl}
            audioPlaying={audioPlaying}
            currentTime={audioCurrentTime}
            audioDuration={audioDuration}
            transcriptTurns={selectedTranscriptTurns}
            onPlayToggle={toggleAudioPlayback}
            onAudioTimeUpdate={(event) => setAudioCurrentTime(event.currentTarget.currentTime || 0)}
            onAudioLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration || 0)}
            onAudioEnded={() => setAudioPlaying(false)}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              disabled={!selectedSnapshot?.version?.source_pdf_path}
              style={{
                textAlign: "left",
                border: `1px solid ${C.border}`,
                background: "#fff",
                borderRadius: 8,
                padding: 18,
                cursor: selectedSnapshot?.version?.source_pdf_path ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                opacity: selectedSnapshot?.version?.source_pdf_path ? 1 : 0.55,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Fill Out Interview Guide</div>
                <Badge color={selectedPdfFields.length ? "success" : "warning"}>{selectedPdfFields.length} fields</Badge>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: C.textMut }}>{pdfPreviewUrl ? selectedSnapshot?.version?.source_pdf_file_name || "Branded PDF ready" : "No published guide PDF"}</div>
            </button>

            <button
              type="button"
              onClick={() => setShowQuestionsModal(true)}
              style={{ textAlign: "left", border: `1px solid ${C.border}`, background: "#fff", borderRadius: 8, padding: 18, cursor: "pointer", fontFamily: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Custom Questions</div>
                <Badge color={selectedQuestions.length ? "info" : "default"}>{selectedQuestions.length} questions</Badge>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: C.textMut }}>{selectedQuestions.filter((question) => responsesByTarget[responseKeyForQuestion(question)]?.metadata?.approved).length} approved</div>
            </button>
          </div>
        </div>
      )}

      {view === "config" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <SectionHeading title="Interview Configuration" />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="secondary" onClick={() => setShowConfigSettings((prev) => !prev)}>Settings</Btn>
              <Btn variant="primary" onClick={() => setShowNewPosition(true)}>Create Position Type</Btn>
            </div>
          </div>

          {showConfigSettings && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 950, color: C.text }}>Automatically Score Candidates</div>
                <div style={{ marginTop: 4, fontSize: 13, color: C.textMut, lineHeight: 1.45, maxWidth: 720 }}>
                  When enabled, the interview guide scorecard is drafted from the structured transcript during the audio processing pass. The manager still reviews and approves every field.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoScorePreference(!autoScoreCandidates)}
                aria-pressed={autoScoreCandidates}
                style={{
                  width: 142,
                  height: 40,
                  borderRadius: 8,
                  border: `1px solid ${autoScoreCandidates ? C.pri : C.border}`,
                  background: autoScoreCandidates ? C.pri : C.surfaceHover,
                  color: autoScoreCandidates ? "#fff" : C.textSec,
                  fontFamily: "inherit",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {autoScoreCandidates ? "Scoring On" : "Scoring Off"}
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {templates.map((template) => {
              const templateVersions = versionsByTemplate[template.id] || [];
              const current = templateVersions.find((version) => version.is_current);
              const draft = templateVersions.find((version) => version.status === "draft");
              const editableVersion = draft || current || templateVersions[0];
              const pdfFields = Array.isArray(editableVersion?.pdf_field_manifest) ? editableVersion.pdf_field_manifest : [];
              const editable = editableVersion?.status === "draft";
              return (
                <div key={template.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 14, display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 950, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{template.role_label}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>{current ? `Published v${current.version_no}` : "No published version"}</div>
                    </div>
                    <Badge color={editableVersion?.pdf_verification_status === "verified_fields" ? "success" : "warning"}>{pdfFields.length} fields</Badge>
                  </div>
                  <div style={{ display: "grid", gap: 5, fontSize: 12, color: C.textSec }}>
                    <div>{editableVersion?.source_pdf_file_name || "No PDF uploaded"}</div>
                    <div>{editableVersion ? `${LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS[editableVersion.status] || editableVersion.status} v${editableVersion.version_no}` : "No template version"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {editableVersion && (
                      <input
                        ref={(node) => { if (node) pdfInputRefs.current[editableVersion.id] = node; }}
                        type="file"
                        accept={INTERVIEW_PDF_ACCEPT}
                        style={{ display: "none" }}
                        disabled={!editable}
                        onChange={(event) => {
                          uploadTemplatePdf(editableVersion, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    )}
                    <Btn variant="secondary" size="sm" onClick={() => editableVersion && pdfInputRefs.current[editableVersion.id]?.click()} disabled={!editable || templateActionId === editableVersion?.id}>Upload PDF</Btn>
                    <Btn variant="secondary" size="sm" onClick={() => createDraftVersion(template)} disabled={!!draft || templateActionId === template.id}>{draft ? "Draft Ready" : "New Draft"}</Btn>
                    <Btn variant="primary" size="sm" onClick={() => publishVersion(template, editableVersion)} disabled={!editable || editableVersion?.pdf_verification_status !== "verified_fields" || templateActionId === editableVersion?.id}>Publish</Btn>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setConfigQuestionsOpen((prev) => !prev)}
              style={{ width: "100%", padding: "15px 16px", border: "none", background: C.surfaceHover, borderBottom: configQuestionsOpen ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
            >
              <div>
                <div style={{ fontSize: 16, color: C.text, fontWeight: 950 }}>Shared Custom Questions</div>
                <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{sharedQuestions.length} questions</div>
              </div>
              <div style={{ color: C.pri, fontWeight: 950 }}>{configQuestionsOpen ? "Collapse" : "Expand"}</div>
            </button>

            {configQuestionsOpen && (
              <div style={{ padding: 16, display: "grid", gap: 14 }}>
                {Object.entries(sharedQuestions.reduce((groups, question) => {
                  const category = question.category || "Custom";
                  if (!groups[category]) groups[category] = [];
                  groups[category].push(question);
                  return groups;
                }, {})).map(([category, categoryQuestions]) => (
                  <div key={category} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", background: C.surfaceHover, borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>{category}</div>
                      <div style={{ color: C.textMut, fontSize: 12, fontWeight: 800 }}>{categoryQuestions.length} question{categoryQuestions.length === 1 ? "" : "s"}</div>
                    </div>
                    <div style={{ display: "grid" }}>
                      {categoryQuestions.map((question) => {
                        const draft = questionDrafts[question.id] || question;
                        const canEdit = draftVersions.length > 0;
                        return (
                          <div
                            key={question.id}
                            draggable={canEdit}
                            onDragStart={() => setDragQuestionId(question.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              reorderSharedQuestion(dragQuestionId, question.id);
                              setDragQuestionId("");
                            }}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "34px minmax(120px, 180px) minmax(0, 1fr) auto",
                              gap: 10,
                              alignItems: "center",
                              padding: "10px 12px",
                              borderBottom: `1px solid ${C.borderLight}`,
                              background: "#fff",
                            }}
                          >
                            <div style={{ color: C.textMut, fontWeight: 950, textAlign: "center", cursor: canEdit ? "grab" : "default" }}>::</div>
                            <input
                              value={draft.category || ""}
                              disabled={!canEdit}
                              aria-label="Question category"
                              onChange={(event) => setQuestionDrafts((prev) => ({ ...prev, [question.id]: { ...draft, category: event.target.value } }))}
                              onBlur={(event) => saveSharedQuestion(question, { category: event.target.value })}
                              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", color: C.text, background: canEdit ? "#fff" : C.surfaceHover }}
                            />
                            <input
                              value={draft.prompt || ""}
                              disabled={!canEdit}
                              aria-label="Question prompt"
                              onChange={(event) => setQuestionDrafts((prev) => ({ ...prev, [question.id]: { ...draft, prompt: event.target.value } }))}
                              onBlur={(event) => saveSharedQuestion(question, { prompt: event.target.value })}
                              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: C.text, background: canEdit ? "#fff" : C.surfaceHover }}
                            />
                            <Btn variant="danger" size="sm" disabled={!canEdit} onClick={() => deleteSharedQuestion(question)}>Delete</Btn>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {draftVersions.length === 0 && (
                  <div style={{ padding: 12, border: `1px solid ${C.borderLight}`, borderRadius: 8, background: C.surfaceHover, color: C.textMut, fontSize: 13 }}>Create a draft position template to edit shared questions.</div>
                )}

                {draftVersions.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) auto", gap: 10, alignItems: "end", padding: 12, border: `1.5px dashed ${C.border}`, borderRadius: 8, background: C.surfaceHover }}>
                    <Inp label="Category" value={newQuestionDrafts.shared?.category || "Custom"} onChange={(value) => setNewQuestionDrafts((prev) => ({ ...prev, shared: { ...(prev.shared || {}), category: value } }))} />
                    <Inp label="New Question" value={newQuestionDrafts.shared?.prompt || ""} onChange={(value) => setNewQuestionDrafts((prev) => ({ ...prev, shared: { ...(prev.shared || {}), prompt: value } }))} />
                    <Btn variant="secondary" onClick={addSharedQuestion}>Add</Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showNewInterview && (
        <Modal title="Add New Interview" onClose={() => setShowNewInterview(false)} wide>
          {templateOptions.length === 0 ? (
            <EmptyState title="No Published Templates" body="Upload Acrobat-prepared PDFs, verify fields, and publish a role template before creating interview records." />
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <CustomSelect
                value={newInterviewDraft.template_version_id}
                onChange={(value) => {
                  const version = versions.find((row) => row.id === value);
                  const template = templates.find((row) => row.id === version?.template_id);
                  setNewInterviewDraft((prev) => ({
                    ...prev,
                    template_version_id: value,
                    candidate_position: template?.role_label || prev.candidate_position,
                  }));
                }}
                options={templateOptions}
                placeholder="Select published role template"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Inp label="Candidate Name" required value={newInterviewDraft.candidate_full_name} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_full_name: value }))} autoFocus />
                <Inp label="Position" value={newInterviewDraft.candidate_position} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_position: value }))} />
                <Inp label="Email" value={newInterviewDraft.candidate_email} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_email: value }))} />
                <Inp label="Phone" value={newInterviewDraft.candidate_phone} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_phone: value }))} />
                <Inp label="Interview Date" type="date" value={newInterviewDraft.interview_date} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, interview_date: value }))} />
                <Inp label="Interview Time" type="time" value={newInterviewDraft.interview_time} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, interview_time: value }))} />
                <Inp label="Zoom Passcode" value={newInterviewDraft.zoom_passcode} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, zoom_passcode: value }))} />
              </div>
              <Inp label="Zoom Recording Link" value={newInterviewDraft.zoom_recording_url} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, zoom_recording_url: value }))} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <Btn variant="secondary" onClick={() => setShowNewInterview(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={createNewInterview} disabled={savingNewInterview}>{savingNewInterview ? "Creating..." : "Create Interview"}</Btn>
              </div>
            </div>
          )}
        </Modal>
      )}

      {showCandidateEdit && selectedRecord && (
        <Modal title="Edit Interview Details" onClose={() => setShowCandidateEdit(false)} wide>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Candidate Name" required value={candidateEditDraft.candidate_full_name} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_full_name: value }))} autoFocus />
              <Inp label="Position" value={candidateEditDraft.candidate_position} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_position: value }))} />
              <Inp label="Email" value={candidateEditDraft.candidate_email} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_email: value }))} />
              <Inp label="Phone" value={candidateEditDraft.candidate_phone} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_phone: value }))} />
              <Inp label="Interview Date" type="date" value={candidateEditDraft.interview_date} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, interview_date: value }))} />
              <Inp label="Interview Time" type="time" value={candidateEditDraft.interview_time} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, interview_time: value }))} />
              <Inp label="Zoom Passcode" value={candidateEditDraft.zoom_passcode} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, zoom_passcode: value }))} />
              <Inp label="Workflow Status" type="select" value={selectedRecord.status || "draft"} onChange={(value) => saveRecordPatch({ status: value })} options={Object.entries(LABOR_INTERVIEW_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
            </div>
            <Inp label="Zoom Recording Link" value={candidateEditDraft.zoom_recording_url} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, zoom_recording_url: value }))} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setShowCandidateEdit(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveCandidateEdit} disabled={recordSaving}>{recordSaving ? "Saving..." : "Save Details"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showNewPosition && (
        <Modal title="Create Position Type" onClose={() => setShowNewPosition(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <Inp label="Position Name" value={newPositionDraft.role_label} onChange={(value) => setNewPositionDraft((prev) => ({ ...prev, role_label: value }))} autoFocus />
            <Inp label="Description" value={newPositionDraft.description} onChange={(value) => setNewPositionDraft((prev) => ({ ...prev, description: value }))} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setShowNewPosition(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={createPositionType} disabled={templateActionId === "new-position"}>{templateActionId === "new-position" ? "Creating..." : "Create"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showTranscriptModal && selectedRecord && (
        <TranscriptModal turns={selectedTranscriptTurns} currentTime={audioCurrentTime} onClose={() => setShowTranscriptModal(false)} />
      )}

      {showGuideModal && selectedRecord && (
        <ReviewGuideModal
          record={selectedRecord}
          fields={selectedPdfFields}
          artifacts={artifacts}
          pdfUrl={guidePdfUrl}
          loadingPdf={guidePdfLoading}
          responsesByTarget={responsesByTarget}
          responseDrafts={responseDrafts}
          savingKey={savingResponseKey}
          exporting={exportingPdf}
          activeIndex={pdfReviewIndex}
          setActiveIndex={setPdfReviewIndex}
          getFieldValue={getPdfFieldValue}
          setFieldDraft={setPdfFieldDraft}
          saveField={savePdfFieldResponse}
          approveField={approvePdfField}
          exportFinalPdf={exportFinalPdf}
          onClose={() => setShowGuideModal(false)}
        />
      )}

      {showQuestionsModal && selectedRecord && (
        <QuestionReviewModal
          record={selectedRecord}
          questions={selectedQuestions}
          responsesByTarget={responsesByTarget}
          responseDrafts={responseDrafts}
          savingKey={savingResponseKey}
          activeIndex={questionReviewIndex}
          setActiveIndex={setQuestionReviewIndex}
          setQuestionDraft={setQuestionResponseDraft}
          saveQuestionResponse={saveCustomQuestionResponse}
          approveQuestion={approveCustomQuestion}
          onClose={() => setShowQuestionsModal(false)}
        />
      )}
    </div>
  );
}

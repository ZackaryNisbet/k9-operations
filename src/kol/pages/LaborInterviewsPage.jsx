import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, Card, CustomSelect, Inp, Modal } from "../../shared/ui";
import {
  buildInterviewAudioPath,
  buildInterviewArtifactPath,
  buildInterviewTemplatePdfPath,
  buildInterviewTranscriptPath,
  buildInterviewTemplateSnapshot,
  buildPdfResponseMap,
  cleanInterviewTranscriptText,
  countInterviewPdfPages,
  extractPdfFieldManifest,
  fillInterviewPdfBytes,
  getInterviewDraftResponseText,
  getInterviewPdfFieldDisplayRect,
  getInterviewOfficialResponseText,
  getInterviewResponseState,
  getInterviewTranscriptTurns,
  getInterviewRecommendation,
  getInterviewRecommendationOption,
  getInterviewAudioContentType,
  getInterviewRoleLabel,
  sanitizeInterviewFileName,
  INTERVIEW_AI_REVIEW_MODES,
  INTERVIEW_AI_REVIEW_MODE_LABELS,
  INTERVIEW_AUDIO_ACCEPT,
  INTERVIEW_PDF_ACCEPT,
  INTERVIEW_RECOMMENDATION_OPTIONS,
  INTERVIEW_RESPONSE_STATES,
  INTERVIEW_TRANSCRIPT_ACCEPT,
  LABOR_INTERVIEW_DOCUMENT_BUCKET,
  LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS,
  isInterviewResponseReviewed,
  normalizeInterviewCandidateDraft,
  normalizeQuestionKey,
  pdfFieldsFromSnapshot,
  questionRowsFromSnapshot,
  shouldNormalizeInterviewAudioForStt,
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

function normalizeAiReviewMode(value) {
  const text = String(value || "").trim().toLowerCase();
  return INTERVIEW_AI_REVIEW_MODES.some((mode) => mode.value === text) ? text : "literal";
}

function reviewModeDraftInstruction(mode, label) {
  if (mode === "speculative") {
    return `${label} mode selected by the manager. Fill every defensible guide field from the transcript at this evidence strictness. Prefer a concise, evidence-backed inference over leaving a field blank when the transcript logically supports the question. Do not fabricate unsupported facts.`;
  }
  if (mode === "inferred") {
    return `${label} mode selected by the manager. Fill guide fields when the transcript demonstrates a relevant behavior, trait, or response quality, even when the exact question was not asked. Keep unsupported fields blank.`;
  }
  return `${label} mode selected by the manager. Fill guide fields only from direct answers, near-verbatim rephrases, or clearly matching interview exchanges. Keep loosely related fields blank.`;
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

function snapshotForGuide(record, guide) {
  if (guide) {
    return {
      template: {
        id: guide.template_id,
        role_key: guide.role_key,
        role_label: guide.role_label || guide.guide_label,
        location_id: guide.location_id,
      },
      version: {
        id: guide.template_version_id,
        pdf_field_manifest: guide.pdf_field_manifest_snapshot || [],
        source_pdf_bucket: guide.template_snapshot?.version?.source_pdf_bucket,
        source_pdf_path: guide.template_snapshot?.version?.source_pdf_path,
        source_pdf_file_name: guide.template_snapshot?.version?.source_pdf_file_name,
        pdf_page_count: guide.template_snapshot?.version?.pdf_page_count,
      },
      ...(guide.template_snapshot || {}),
      questions: guide.question_snapshot || guide.template_snapshot?.questions || [],
    };
  }
  return snapshotForRecord(record);
}

function buildLegacyGuideFromRecord(record) {
  if (!record?.id) return null;
  const snapshot = snapshotForRecord(record);
  return {
    id: "",
    interview_id: record.id,
    location_id: record.location_id,
    template_id: record.template_id,
    template_version_id: record.template_version_id,
    guide_label: snapshot.template?.role_label || record.candidate_position || "Interview Guide",
    role_key: snapshot.template?.role_key || record.candidate_position || "",
    role_label: snapshot.template?.role_label || record.candidate_position || "Interview Guide",
    guide_status: record.status || "draft",
    sequence_order: 10,
    template_snapshot: snapshot,
    pdf_field_manifest_snapshot: snapshot.version?.pdf_field_manifest || record.pdf_field_manifest_snapshot || [],
    question_snapshot: snapshot.questions || record.question_snapshot || [],
    metadata: { legacy_primary: true },
  };
}

function mapResponsesByTarget(responses = [], guideId = "") {
  return (responses || []).reduce((map, response) => {
    const rowGuideId = response.interview_guide_id || "";
    if (guideId && rowGuideId && rowGuideId !== guideId) return map;
    if (guideId && !rowGuideId) {
      // Legacy responses without a guide id belong to the primary guide only.
      const hasExplicitGuideRows = responses.some((row) => row.interview_guide_id === guideId);
      if (hasExplicitGuideRows) return map;
    }
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
  return getInterviewDraftResponseText(response);
}

function draftMapsEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => String(left?.[key] || "") === String(right?.[key] || ""));
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
      @keyframes interviewWaveGlow {
        0%, 100% { transform: translateX(-8%) scaleX(0.9); opacity: 0.28; }
        50% { transform: translateX(8%) scaleX(1.06); opacity: 0.72; }
      }
      @keyframes interviewSignalTravel {
        0% { transform: translateX(-18%); opacity: 0; }
        12% { opacity: 0.92; }
        88% { opacity: 0.92; }
        100% { transform: translateX(118%); opacity: 0; }
      }
      @keyframes interviewParticleFloat {
        0%, 100% { transform: translate3d(0, 0, 0) scale(0.82); opacity: 0.22; }
        50% { transform: translate3d(0, -10px, 0) scale(1); opacity: 0.82; }
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
      @keyframes interviewPanelEnter {
        0% { opacity: 0; transform: translateY(14px) scale(0.992); filter: blur(3px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes interviewModalEnter {
        0% { opacity: 0; transform: translateY(18px) scale(0.985); filter: blur(5px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes interviewAiAssistantEnter {
        0% { opacity: 0; transform: translateY(-10px) scale(0.97); filter: blur(6px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes interviewAiHalo {
        0%, 100% { opacity: 0.44; transform: scale(0.96); }
        50% { opacity: 0.88; transform: scale(1.04); }
      }
      @keyframes interviewAiSweep {
        0% { transform: translateX(-120%); opacity: 0; }
        15% { opacity: 0.75; }
        85% { opacity: 0.75; }
        100% { transform: translateX(120%); opacity: 0; }
      }
      @keyframes interviewAiDot {
        0%, 100% { transform: translateY(0); opacity: 0.4; }
        50% { transform: translateY(-3px); opacity: 1; }
      }
      @keyframes interviewBackdropIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .interview-row:hover { background: #f8fafc; }
      .interview-action-card:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08); }
      .interview-audio-stage:hover .interview-audio-overlay {
        opacity: 1;
        pointer-events: auto;
      }
      .interview-audio-overlay {
        opacity: 0;
        pointer-events: none;
      }
      .interview-audio-stage:hover .interview-audio-bars {
        filter: blur(2.5px) saturate(1.12);
        transform: scale(0.99);
      }
      .interview-audio-stage:hover .interview-audio-signal {
        filter: blur(1.5px);
        opacity: 0.42;
      }
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
        animation: interviewBackdropIn 180ms ease-out;
      }
      .interview-immersive-shell {
        position: relative;
        width: min(1480px, 94vw);
        height: min(900px, 92vh);
        background: #ffffff;
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 26px 80px rgba(2, 6, 23, 0.28);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        animation: interviewModalEnter 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .interview-transcript-line:hover { border-color: #cbd5e1; background: #ffffff; }
      .interview-question-rail-line:hover .interview-question-tooltip {
        opacity: 1;
        transform: translateX(0);
      }
      .interview-pdf-field-hotspot:hover {
        border-color: rgba(22, 101, 52, 0.72) !important;
        background: rgba(22, 163, 74, 0.1) !important;
      }
      .interview-live-transcript-line:hover {
        border-color: rgba(190, 242, 100, 0.34) !important;
        background: rgba(255,255,255,0.075) !important;
      }
      .interview-live-transcript-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(190, 242, 100, 0.34) rgba(255,255,255,0.04);
      }
      .interview-guide-ai-panel {
        animation: interviewAiAssistantEnter 220ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .interview-guide-ai-panel::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 10px;
        pointer-events: none;
        background: linear-gradient(110deg, transparent 0%, rgba(132, 204, 22, 0.16) 42%, rgba(56, 189, 248, 0.12) 52%, transparent 64%);
        opacity: 0;
      }
      .interview-guide-ai-panel.is-working::before {
        animation: interviewAiSweep 1.9s ease-in-out infinite;
      }
      .interview-ai-dot {
        animation: interviewAiDot 1s ease-in-out infinite;
      }
      .interview-ai-dot:nth-child(2) { animation-delay: 140ms; }
      .interview-ai-dot:nth-child(3) { animation-delay: 280ms; }
      @media (max-width: 920px) {
        .interview-immersive-shell { width: 96vw; height: 94vh; }
        .interview-guide-grid { grid-template-columns: 1fr !important; overflow-y: auto; }
        .interview-guide-pdf { min-height: 520px; }
        .interview-roster-table { min-width: 780px; }
        .interview-guide-ai-panel { left: 14px !important; right: 14px !important; width: auto !important; }
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

function normalizeTranscriptSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function wordMatchesSearch(wordText, query) {
  const normalizedQuery = normalizeTranscriptSearch(query);
  if (!normalizedQuery) return false;
  const normalizedWord = normalizeTranscriptSearch(wordText).replace(/[^\w\s']/g, "");
  const queryParts = normalizedQuery.split(/\s+/).filter((part) => part.length >= 2);
  return normalizedWord.includes(normalizedQuery) || queryParts.some((part) => normalizedWord.includes(part));
}

function TranscriptWords({ turn, currentTime, maxWords = null, searchQuery = "", tone = "light" }) {
  const words = Array.isArray(turn?.words) && turn.words.length
    ? turn.words
    : String(turn?.text || "").split(/\s+/).filter(Boolean).map((text, index) => ({ id: `${turn?.id || "turn"}-${index}`, text }));
  const visibleWords = maxWords ? words.slice(0, maxWords) : words;
  const time = Number(currentTime || 0);
  const dark = tone === "dark";
  return (
    <span>
      {visibleWords.map((word) => {
        const active = Number.isFinite(time)
          && word.startSeconds != null
          && word.endSeconds != null
          && time >= word.startSeconds
          && time <= word.endSeconds;
        const searched = wordMatchesSearch(word.text, searchQuery);
        return (
          <span
            key={word.id}
            style={{
              display: "inline-block",
              marginRight: 5,
              marginBottom: 3,
              borderRadius: 6,
              padding: dark ? "0 3px" : "0 2px",
              background: active
                ? (dark ? "#bef264" : "#dcfce7")
                : searched
                  ? (dark ? "rgba(250,204,21,0.22)" : "#fef3c7")
                  : "transparent",
              color: active ? (dark ? "#052e16" : C.pri) : searched ? (dark ? "#fde68a" : "#92400e") : "inherit",
              boxShadow: active && dark ? "0 0 22px rgba(190, 242, 100, 0.28)" : "none",
              transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease",
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

function wordsFromProviderSegments(turns = []) {
  return (Array.isArray(turns) ? turns : [])
    .flatMap((turn) => {
      const words = Array.isArray(turn?.words) && turn.words.length
        ? turn.words
        : [{ id: `${turn?.id || "segment"}-text`, text: turn?.text, startSeconds: turn?.startSeconds, endSeconds: turn?.endSeconds }];
      return words.map((word, index) => ({
        ...word,
        id: word.id || `${turn?.id || "segment"}-${index}`,
        text: String(word.text || "").trim(),
        startSeconds: word.startSeconds ?? turn?.startSeconds ?? null,
        endSeconds: word.endSeconds ?? turn?.endSeconds ?? null,
      }));
    })
    .filter((word) => word.text);
}

function chunkProviderWords(words = [], size = 22) {
  const chunks = [];
  for (let index = 0; index < words.length; index += size) {
    const slice = words.slice(index, index + size);
    if (!slice.length) continue;
    chunks.push({
      id: `word-chunk-${index}`,
      timestamp: formatPlaybackTime(slice[0]?.startSeconds || 0),
      startSeconds: slice[0]?.startSeconds ?? null,
      endSeconds: slice[slice.length - 1]?.endSeconds ?? null,
      speaker: "Timeline",
      text: slice.map((word) => word.text).join(" "),
      words: slice,
    });
  }
  return chunks;
}

function buildTimedWordsForTurn(turn, turnIndex = 0) {
  const baseWords = Array.isArray(turn?.words) && turn.words.length
    ? turn.words
    : String(turn?.text || "").split(/\s+/).filter(Boolean).map((text, index) => ({ id: `${turn?.id || "turn"}-word-${index}`, text }));
  const start = Number(turn?.startSeconds);
  const end = Number(turn?.endSeconds);
  const canApproximate = Number.isFinite(start) && Number.isFinite(end) && end > start && baseWords.length > 0;
  return baseWords
    .map((word, index) => {
      const wordStart = Number(word?.startSeconds);
      const wordEnd = Number(word?.endSeconds);
      if (Number.isFinite(wordStart) && Number.isFinite(wordEnd) && wordEnd >= wordStart) {
        return {
          ...word,
          id: word.id || `${turn?.id || `turn-${turnIndex}`}-word-${index}`,
          text: String(word.text || "").trim(),
          startSeconds: wordStart,
          endSeconds: wordEnd,
        };
      }
      if (canApproximate) {
        const sliceStart = start + ((end - start) * index) / baseWords.length;
        const sliceEnd = start + ((end - start) * (index + 1)) / baseWords.length;
        return {
          ...word,
          id: word.id || `${turn?.id || `turn-${turnIndex}`}-word-${index}`,
          text: String(word.text || "").trim(),
          startSeconds: sliceStart,
          endSeconds: sliceEnd,
        };
      }
      return {
        ...word,
        id: word.id || `${turn?.id || `turn-${turnIndex}`}-word-${index}`,
        text: String(word.text || "").trim(),
        startSeconds: word.startSeconds ?? turn?.startSeconds ?? null,
        endSeconds: word.endSeconds ?? turn?.endSeconds ?? null,
      };
    })
    .filter((word) => word.text);
}

function chunkTurnForLiveTranscript(turn, turnIndex = 0, wordsPerLine = 14) {
  const words = buildTimedWordsForTurn(turn, turnIndex);
  if (!words.length) return [];
  const lines = [];
  for (let index = 0; index < words.length; index += wordsPerLine) {
    const slice = words.slice(index, index + wordsPerLine);
    const first = slice[0] || {};
    const last = slice[slice.length - 1] || {};
    lines.push({
      id: `${turn?.id || `turn-${turnIndex}`}-line-${index}`,
      parentId: turn?.id || `turn-${turnIndex}`,
      timestamp: index === 0 ? (turn?.timestamp || formatPlaybackTime(first.startSeconds || turn?.startSeconds || 0)) : "",
      startSeconds: first.startSeconds ?? turn?.startSeconds ?? null,
      endSeconds: last.endSeconds ?? turn?.endSeconds ?? null,
      speaker: index === 0 ? (turn?.speaker || "Transcript") : "",
      text: slice.map((word) => word.text).join(" "),
      words: slice,
      turnIndex,
      lineOffset: index,
    });
  }
  return lines;
}

function buildLiveTranscriptLines({ turns = [], wordSegmentMode = false, providerWords = [] }) {
  if (wordSegmentMode) {
    return chunkProviderWords(providerWords, 12).flatMap((turn, index) => chunkTurnForLiveTranscript(turn, index, 12));
  }
  return (Array.isArray(turns) ? turns : []).flatMap((turn, index) => chunkTurnForLiveTranscript(turn, index, 14));
}

function findActiveTranscriptLineIndex(lines = [], currentTime = 0) {
  const time = Number(currentTime || 0);
  if (!Number.isFinite(time) || !lines.length) return 0;
  const directIndex = lines.findIndex((line) => {
    const start = Number(line.startSeconds);
    const end = Number(line.endSeconds);
    return Number.isFinite(start) && Number.isFinite(end) && time >= start && time <= end;
  });
  if (directIndex >= 0) return directIndex;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  lines.forEach((line, index) => {
    const start = Number(line.startSeconds);
    if (!Number.isFinite(start)) return;
    const distance = Math.abs(time - start);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function getTranscriptLineProgress(line, currentTime) {
  const start = Number(line?.startSeconds);
  const end = Number(line?.endSeconds);
  const time = Number(currentTime || 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(1, (time - start) / (end - start)));
}

function getTranscriptSearchResults(lines = [], query = "") {
  const normalized = normalizeTranscriptSearch(query);
  if (!normalized) return [];
  return lines.reduce((matches, line, index) => {
    const text = normalizeTranscriptSearch(line.text);
    const tokenMatch = normalized.split(/\s+/).filter(Boolean).every((part) => text.includes(part));
    if (text.includes(normalized) || tokenMatch) matches.push({ lineIndex: index, line });
    return matches;
  }, []);
}

function getAutoScoreStorageKey(actorUserId) {
  return `k9:labor-interviews:auto-score:${actorUserId || "local"}`;
}

function readAutoScoreSetting(storageKey) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(storageKey) === "true";
}

function seededWaveBars(seed = "", count = 72) {
  let state = 0;
  String(seed || "interview").split("").forEach((char) => {
    state = (state * 31 + char.charCodeAt(0)) % 9973;
  });
  return Array.from({ length: count }, (_, index) => {
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

async function extractAudioWaveformBars(audioUrl, { count = 72, signal } = {}) {
  if (!audioUrl || typeof window === "undefined") return [];
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return [];

  const response = await fetch(audioUrl, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error("Audio waveform could not be loaded.");
  const arrayBuffer = await response.arrayBuffer();
  if (signal?.aborted) return [];

  const context = new AudioContextClass();
  try {
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    if (signal?.aborted) return [];

    const length = audioBuffer.length;
    const channelCount = Math.min(audioBuffer.numberOfChannels || 1, 2);
    const bars = [];
    for (let index = 0; index < count; index += 1) {
      const start = Math.floor((index / count) * length);
      const end = Math.max(start + 1, Math.floor(((index + 1) / count) * length));
      const stride = Math.max(1, Math.floor((end - start) / 420));
      let peak = 0;
      let sumSquares = 0;
      let samples = 0;

      for (let sample = start; sample < end; sample += stride) {
        let mixed = 0;
        for (let channel = 0; channel < channelCount; channel += 1) {
          mixed += audioBuffer.getChannelData(channel)[sample] || 0;
        }
        const amplitude = Math.abs(mixed / channelCount);
        peak = Math.max(peak, amplitude);
        sumSquares += amplitude * amplitude;
        samples += 1;
      }

      const rms = samples ? Math.sqrt(sumSquares / samples) : 0;
      const normalized = Math.min(1, Math.max(peak * 0.85, rms * 2.2));
      bars.push({
        height: 16 + Math.round(Math.pow(normalized, 0.72) * 92),
        delay: -(index * 0.035).toFixed(2),
        duration: (0.78 + (index % 9) * 0.08).toFixed(2),
        opacity: 0.48 + Math.min(0.48, normalized * 0.7),
        actual: true,
      });
    }
    return bars;
  } finally {
    if (typeof context.close === "function") {
      try {
        await context.close();
      } catch {
        // Safari may reject close() for already-closed contexts.
      }
    }
  }
}

function safeUiError(error, fallback) {
  const message = typeof error === "string" ? error : error?.message;
  return String(message || fallback || "Something went wrong.")
    .replace(/xAI\s+Grok/gi, "AI")
    .replace(/\bGrok\b/g, "AI")
    .replace(/\bxAI\b/g, "AI");
}

async function readJsonApiError(response, fallbackMessage) {
  const raw = await response.text();
  try {
    const data = raw ? JSON.parse(raw) : {};
    return safeUiError(data?.error || data?.message || fallbackMessage, fallbackMessage);
  } catch {
    return safeUiError(raw || fallbackMessage, fallbackMessage);
  }
}

async function normalizeInterviewAudioForSttOnServer(payload) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) {
    throw new Error(sessionError?.message || "Your session expired. Sign in again before uploading interview audio.");
  }

  const response = await fetch("/api/interview-normalize-audio", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readJsonApiError(response, "Failed to convert interview audio"));
  }
  return response.json();
}

function inferOriginalAudioPathFromChunk(sourceAudio = {}) {
  const chunks = Array.isArray(sourceAudio.chunks) ? sourceAudio.chunks : [];
  const chunkPath = String(chunks[0]?.path || chunks[0]?.audio_file_path || "").trim();
  const originalFileName = String(sourceAudio.original_file_name || sourceAudio.original_audio_file_name || "").trim();
  if (!chunkPath || !originalFileName) return "";
  const folder = chunkPath.includes("/") ? chunkPath.slice(0, chunkPath.lastIndexOf("/") + 1) : "";
  return `${folder}${sanitizeInterviewFileName(originalFileName)}`;
}

function getInterviewAudioSourceCandidates(sourceAudio = {}) {
  const chunks = Array.isArray(sourceAudio.chunks) ? sourceAudio.chunks : [];
  const candidates = [
    {
      bucket: sourceAudio.original_bucket || sourceAudio.original_audio_file_bucket || sourceAudio.bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
      path: sourceAudio.original_path || sourceAudio.original_audio_file_path || "",
    },
    {
      bucket: sourceAudio.bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
      path: inferOriginalAudioPathFromChunk(sourceAudio),
    },
    {
      bucket: sourceAudio.bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
      path: sourceAudio.path || sourceAudio.audio_file_path || "",
    },
    ...chunks.map((chunk) => ({
      bucket: chunk.bucket || chunk.audio_file_bucket || sourceAudio.bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
      path: chunk.path || chunk.audio_file_path || "",
    })),
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    const bucket = String(candidate.bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET).trim();
    const path = String(candidate.path || "").trim();
    if (!path) return false;
    const key = `${bucket}:${path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    candidate.bucket = bucket;
    candidate.path = path;
    return true;
  });
}

function getInterviewAudioPlaybackCandidates(sourceAudio = {}) {
  const chunks = Array.isArray(sourceAudio.chunks) ? sourceAudio.chunks : [];
  const chunkCandidates = chunks
    .map((chunk) => ({
      bucket: chunk.bucket || chunk.audio_file_bucket || sourceAudio.bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
      path: chunk.path || chunk.audio_file_path || "",
      startSeconds: Number(chunk.start_seconds ?? chunk.startSeconds ?? 0) || 0,
      fileName: chunk.file_name || chunk.audio_file_name || "",
      chunk: true,
    }))
    .filter((candidate) => candidate.path)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  if (chunkCandidates.length > 1) return chunkCandidates;
  return getInterviewAudioSourceCandidates(sourceAudio).map((candidate) => ({
    ...candidate,
    startSeconds: 0,
    fileName: "",
    chunk: false,
  }));
}

async function isSignedAudioUrlReadable(signedUrl) {
  if (!signedUrl) return false;
  try {
    const response = await fetch(signedUrl, { method: "HEAD", cache: "no-store" });
    return response.ok || response.status === 405;
  } catch {
    return true;
  }
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

function humanizePdfFieldName(value = "") {
  const raw = String(value || "").trim();
  const aliases = {
    candidate_name: "Candidate name",
    interview_date: "Interview date",
    interviewer_name: "Interviewer",
    location: "Location",
    scorecard_date: "Scorecard date",
    scorecard_interviewer: "Scorecard interviewer",
    overall_score: "Overall score",
    strongest_area: "Strongest area",
    biggest_concern: "Biggest concern",
  };
  if (aliases[raw]) return aliases[raw];
  return raw
    .replace(/^q(\d+)_/i, "Question $1 ")
    .replace(/^score_notes_/i, "Score notes ")
    .replace(/^score_/i, "Score ")
    .replace(/^decision_/i, "Decision ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fieldValueRows(value = "") {
  const length = String(value || "").length;
  if (length < 80) return 3;
  if (length < 220) return 5;
  if (length < 520) return 7;
  return 9;
}

function getPdfQuestionGroup(fieldName = "") {
  const match = String(fieldName || "").match(/^q(\d{2})_(situation|task|action|result|notes)(?:_(\d+))?$/i);
  if (!match) return null;
  const rawPart = match[2].toLowerCase();
  const part = rawPart === "notes" ? "result" : rawPart;
  return {
    key: `q${match[1]}_${part}`,
    questionKey: `q${match[1]}`,
    number: Number(match[1]),
    part,
    line: rawPart === "notes" ? Number(match[3] || 0) + 1 : Number(match[3] || 0),
    sourcePart: rawPart,
  };
}

function questionPartLabel(item) {
  if (!item || item.type !== "question_part") return "";
  return `Question ${String(item.number).padStart(2, "0")} ${item.partLabel}`;
}

function questionPartShortLabel(item) {
  if (!item || item.type !== "question_part") return "";
  const letter = item.part === "situation" ? "S" : item.part === "task" ? "T" : item.part === "action" ? "A" : "R";
  return `${item.number}${letter}`;
}

function approximatePdfFieldCharLimit(field = {}) {
  const width = Number(field?.rect?.width || 0);
  if (!Number.isFinite(width) || width <= 0) return 95;
  return Math.max(40, Math.min(120, Math.floor(width / 4.75)));
}

function splitTextAcrossPdfFields(value = "", fields = []) {
  const targets = fields || [];
  const text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!targets.length) return [];
  if (targets.length === 1) return [text];
  const chunks = [];
  let remaining = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  targets.forEach((field, index) => {
    if (!remaining) {
      chunks.push("");
      return;
    }
    if (index === targets.length - 1) {
      chunks.push(remaining);
      remaining = "";
      return;
    }
    const limit = approximatePdfFieldCharLimit(field);
    if (remaining.length <= limit) {
      chunks.push(remaining);
      remaining = "";
      return;
    }
    const breakpoint = Math.max(
      remaining.lastIndexOf(" ", limit),
      remaining.lastIndexOf(".", limit),
      remaining.lastIndexOf(";", limit),
      remaining.lastIndexOf(",", limit),
    );
    const cutAt = breakpoint >= Math.floor(limit * 0.55) ? breakpoint : limit;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  });
  return chunks;
}

function getPdfFieldFitLimit(field = {}) {
  const rect = getInterviewPdfFieldDisplayRect(field) || {};
  const width = Number(rect.width || 0);
  const height = Number(rect.height || 0);
  if (!Number.isFinite(width) || width <= 0) return 80;
  const lines = height > 22 ? Math.max(1, Math.floor(height / 9.5)) : 1;
  const charsPerLine = Math.max(16, Math.floor(width / 7.4));
  return Math.max(16, Math.min(220, charsPerLine * lines));
}

function fitPdfFieldValueForSlot(value = "", field = {}) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (field.type && field.type !== "text") return text;
  const limit = getPdfFieldFitLimit(field);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function getPdfExportFieldCharLimit(field = {}) {
  const rect = getInterviewPdfFieldDisplayRect(field) || {};
  const width = Number(rect.width || 0);
  if (!Number.isFinite(width) || width <= 0) return 120;
  return Math.max(60, Math.min(180, Math.floor(width / 3.55)));
}

function splitTextAcrossPdfFieldsForExport(value = "", fields = []) {
  const targets = fields || [];
  const text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!targets.length) return [];
  if (targets.length === 1) return [text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()];
  const chunks = [];
  let remaining = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  targets.forEach((field, index) => {
    if (!remaining) {
      chunks.push("");
      return;
    }
    if (index === targets.length - 1) {
      chunks.push(remaining);
      remaining = "";
      return;
    }
    const limit = getPdfExportFieldCharLimit(field);
    if (remaining.length <= limit) {
      chunks.push(remaining);
      remaining = "";
      return;
    }
    const breakpoint = Math.max(
      remaining.lastIndexOf(" ", limit),
      remaining.lastIndexOf(".", limit),
      remaining.lastIndexOf(";", limit),
      remaining.lastIndexOf(",", limit),
    );
    const cutAt = breakpoint >= Math.floor(limit * 0.45) ? breakpoint : limit;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  });
  return chunks;
}

function buildReadablePdfFieldMap(map = {}, fields = []) {
  const fieldByName = new Map((fields || []).map((field) => [field.name, field]));
  return Object.entries(map || {}).reduce((next, [name, value]) => {
    next[name] = fitPdfFieldValueForSlot(value, fieldByName.get(name) || { name });
    return next;
  }, {});
}

function buildExportPdfFieldMap(map = {}, fields = []) {
  const fieldByName = new Map((fields || []).map((field) => [field.name, field]));
  const next = {};
  const handled = new Set();
  buildPdfReviewItems(fields)
    .filter((item) => item.type === "question_part")
    .forEach((item) => {
      const fullValue = composePdfReviewItemValue(item, (field) => map[field.name] || "");
      const chunks = splitTextAcrossPdfFieldsForExport(fullValue, item.fields || []);
      (item.fields || []).forEach((field, index) => {
        next[field.name] = chunks[index] || "";
        handled.add(field.name);
      });
  });
  Object.entries(map || {}).forEach(([name, value]) => {
    if (handled.has(name)) return;
    const field = fieldByName.get(name) || { name };
    next[name] = field.type && field.type !== "text" ? value : String(value || "").replace(/\s+/g, " ").trim();
  });
  return next;
}

function buildPdfReviewItems(fields = []) {
  const groups = new Map();
  const items = [];
  fields.forEach((field, index) => {
    const group = getPdfQuestionGroup(field.name);
    if (!group) {
      items.push({ type: "field", key: responseKeyForPdfField(field), field, fields: [field], index });
      return;
    }
    if (!groups.has(group.key)) {
      groups.set(group.key, {
        type: "question_part",
        key: `pdf_group:${group.key}`,
        groupKey: group.questionKey,
        number: group.number,
        part: group.part,
        partLabel: group.part.replace(/\b\w/g, (char) => char.toUpperCase()),
        fields: [],
        index,
      });
    }
    groups.get(group.key).fields.push({ ...field, groupPart: group.part, sourcePart: group.sourcePart, line: group.line });
  });
  return [...items, ...groups.values()]
    .map((item) => {
      if (item.type !== "question_part") return item;
      return {
        ...item,
        fields: item.fields.sort((a, b) => {
          const aLine = Number(a.line || 0);
          const bLine = Number(b.line || 0);
          if (aLine !== bLine) return aLine - bLine;
          return String(a.name).localeCompare(String(b.name));
        }),
      };
    })
    .sort((a, b) => a.index - b.index);
}

function cleanPdfQuestionPrompt(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\bPage\s+\d+\s*\|.*$/i, "")
    .replace(/\b(Situation|Task|Action|Result|Follow-Up Probes)\s*:.*$/i, "")
    .trim()
    .slice(0, 900);
}

function extractNumberedPdfQuestionPrompts(fullText = "") {
  const text = String(fullText || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
  const prompts = {};
  const regex = /(?:^|\n)\s*Q\s*(\d{1,2})\.\s*([\s\S]*?)(?=\n\s*(?:Situation\s*:|Task\s*:|Action\s*:|Result\s*:|Follow-Up Probes\s*:|Q\s*\d{1,2}\.|[A-Z][A-Za-z ]+\s+—\s+Scorecard|Rate each competency)|$)/gi;
  let match = regex.exec(text);
  while (match) {
    const key = String(match[1] || "").padStart(2, "0");
    const prompt = cleanPdfQuestionPrompt(match[2]);
    if (key && prompt) prompts[key] = prompt;
    match = regex.exec(text);
  }
  return prompts;
}

function linesFromPdfTextItems(items = []) {
  const positioned = items
    .map((item) => ({
      text: String(item?.str || "").trim(),
      x: Number(item?.transform?.[4] || 0),
      y: Number(item?.transform?.[5] || 0),
    }))
    .filter((item) => item.text);
  positioned.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
  const lines = [];
  positioned.forEach((item) => {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) <= 3);
    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  });
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
    .filter(Boolean);
}

async function extractPdfQuestionPromptMap(pdfBytes) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes.slice(0)) : pdfBytes;
  const loadingTask = pdfjsLib.getDocument({ data });
  const pageTexts = [];
  try {
    const pdf = await loadingTask.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(linesFromPdfTextItems(content.items).join("\n"));
    }
    await pdf.destroy?.();
  } finally {
    try { loadingTask.destroy?.(); } catch (_) {}
  }
  return extractNumberedPdfQuestionPrompts(pageTexts.join("\n"));
}

function composePdfReviewItemValue(item, getFieldValue) {
  if (!item) return "";
  if (item.type !== "question_part") return getFieldValue(item.field);
  return (item.fields || [])
    .map((field) => String(getFieldValue(field) || ""))
    .filter((value) => value.length > 0)
    .join(" ");
}

function splitPdfReviewItemValue(item, value) {
  if (!item) return [];
  if (item.type !== "question_part") return item?.field ? [{ field: item.field, value }] : [];
  const chunks = splitTextAcrossPdfFields(value, item.fields || []);
  return (item.fields || []).map((field, index) => ({ field, value: chunks[index] || "" }));
}

function computeOverallScoreFromPdfMap(map = {}, fields = []) {
  const scoreFieldNames = (fields || [])
    .map((field) => field.name)
    .filter((name) => /^score_/i.test(String(name || ""))
      && !/^score_notes_/i.test(String(name || ""))
      && !/overall/i.test(String(name || "")));
  const scores = scoreFieldNames
    .map((name) => Number(String(map[name] || "").match(/[1-4](?:\.\d+)?/)?.[0]))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 4);
  if (!scores.length) return "";
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Number.isInteger(average) ? String(average) : average.toFixed(1);
}

function conciseBullet(value = "", maxLength = 190) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function normalizeSummaryBulletText(value = "") {
  return String(value || "")
    .replace(/^(\s*[-*•]\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summaryTextToBullets(value = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeSummaryBulletText(line))
    .filter(Boolean);
}

function summaryBulletsToText(bullets = []) {
  return (Array.isArray(bullets) ? bullets : [])
    .map((bullet) => normalizeSummaryBulletText(bullet))
    .filter(Boolean)
    .map((bullet) => `- ${bullet}`)
    .join("\n");
}

function summarySectionKey(value = "") {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || "summary";
}

const SUMMARY_SECTION_KEYS = new Set([
  "call_summary",
  "scorecard",
  "reviewed_guide_responses",
  "reviewed_custom_questions",
]);

function isSummarySectionKey(value = "") {
  return SUMMARY_SECTION_KEYS.has(String(value || ""));
}

function getStoredSummaryEdits(recordOrEdits) {
  const source = recordOrEdits?.metadata?.interview_summary_edits || recordOrEdits || {};
  const sections = source.sections || source;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return {};
  return Object.entries(sections).reduce((next, [key, value]) => {
    if (!isSummarySectionKey(key)) return next;
    const bullets = Array.isArray(value) ? value : summaryTextToBullets(value);
    next[key] = bullets.map((bullet) => normalizeSummaryBulletText(bullet)).filter(Boolean);
    return next;
  }, {});
}

function applySummarySectionEdits(sections = [], summaryEdits = {}) {
  const edits = getStoredSummaryEdits(summaryEdits);
  return (sections || [])
    .map((section) => {
      const key = section.key || summarySectionKey(section.heading);
      if (!Object.prototype.hasOwnProperty.call(edits, key)) return { ...section, key };
      return { ...section, key, bullets: edits[key] || [] };
    })
    .filter((section) => Array.isArray(section.bullets) && section.bullets.length > 0);
}

function getStoredTranscriptSummaryBullets(record) {
  const metadata = record?.metadata || {};
  const source = metadata.interview_summary || metadata.transcript_summary || {};
  const rawBullets = Array.isArray(source) ? source : source.bullets;
  return (Array.isArray(rawBullets) ? rawBullets : [])
    .map((bullet) => normalizeSummaryBulletText(bullet))
    .filter(Boolean)
    .slice(0, 12);
}

function splitTranscriptIntoSummarySentences(record) {
  const text = String(record?.transcript_text || "")
    .replace(/\[[^\]]{0,80}\]/g, " ")
    .replace(/\b(?:Speaker|Person)\s+\d+\s*:/gi, " ")
    .replace(/\b(?:Skyler|Interviewer|Candidate|Alexis)\s*:/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^[-*\s]+/, "").trim())
    .filter((sentence) => sentence.length >= 32 && sentence.length <= 260)
    .filter((sentence) => !/^(yeah|yes|no|okay|right|mhm|um|uh)[\s,.]/i.test(sentence))
    .slice(0, 220);
}

function buildFallbackTranscriptSummaryBullets(record) {
  const sentences = splitTranscriptIntoSummarySentences(record);
  if (!sentences.length) return [];
  const categories = [
    { label: "Role fit / background", terms: ["role", "supervisor", "experience", "manager", "background", "team", "resort", "position"] },
    { label: "Safety / accountability", terms: ["safety", "accountable", "correct", "warning", "policy", "phone", "radio", "leash", "reactive"] },
    { label: "Team motivation / recognition", terms: ["motivat", "burn", "disengaged", "recogn", "praise", "reward", "encourag", "team"] },
    { label: "Customer / conflict handling", terms: ["customer", "client", "owner", "upset", "complaint", "conflict", "escalat"] },
    { label: "Operations / standards", terms: ["clean", "daycare", "groom", "standard", "procedure", "training", "task"] },
    { label: "Follow-up context", terms: ["availability", "schedule", "start", "next", "question", "concern"] },
  ];
  const used = new Set();
  const bullets = categories.map((category) => {
    const sentenceIndex = sentences.findIndex((sentence, index) => {
      if (used.has(index)) return false;
      const lower = sentence.toLowerCase();
      return category.terms.some((term) => lower.includes(term));
    });
    if (sentenceIndex === -1) return "";
    used.add(sentenceIndex);
    return `${category.label}: ${normalizeSummaryBulletText(sentences[sentenceIndex])}`;
  }).filter(Boolean);

  if (bullets.length >= 4) return bullets.slice(0, 8);
  sentences.forEach((sentence, index) => {
    if (bullets.length >= 6 || used.has(index)) return;
    used.add(index);
    bullets.push(normalizeSummaryBulletText(sentence));
  });
  return bullets.slice(0, 8);
}

function getTranscriptSummaryBullets(record) {
  const stored = getStoredTranscriptSummaryBullets(record);
  return stored.length ? stored : buildFallbackTranscriptSummaryBullets(record);
}

function buildInterviewSummaryPages({ record, guide, fields, questions, responsesByTarget, finalMap, summaryEdits = null }) {
  const transcriptBullets = getTranscriptSummaryBullets(record);
  const guideBullets = buildPdfReviewItems(fields)
    .filter((item) => item.type === "question_part")
    .map((item) => {
      const value = composePdfReviewItemValue(item, (field) => finalMap[field.name] || "");
      if (!String(value || "").trim()) return "";
      const label = item.type === "question_part" ? questionPartLabel(item) : humanizePdfFieldName(item.field.name);
      return `${label}: ${normalizeSummaryBulletText(value)}`;
    })
    .filter(Boolean);

  const customBullets = (questions || [])
    .map((question) => {
      const response = responsesByTarget[responseKeyForQuestion(question)] || {};
      const value = getInterviewOfficialResponseText(response);
      if (!value) return "";
      return `${question.prompt}: ${normalizeSummaryBulletText(value)}`;
    })
    .filter(Boolean);

  const scoreBullets = [];
  const overallScore = finalMap.overall_score || computeOverallScoreFromPdfMap(finalMap, fields);
  if (overallScore) scoreBullets.push(`Overall score: ${overallScore}`);
  if (finalMap.strongest_area) scoreBullets.push(`Strongest area: ${normalizeSummaryBulletText(finalMap.strongest_area)}`);
  if (finalMap.biggest_concern) scoreBullets.push(`Biggest concern: ${normalizeSummaryBulletText(finalMap.biggest_concern)}`);
  (fields || [])
    .filter((field) => /^score_notes_/i.test(String(field?.name || "")))
    .map((field) => {
      const value = String(finalMap[field.name] || "").trim();
      if (!value) return "";
      return `${humanizePdfFieldName(field.name).replace(/^Score Notes\s*/i, "")}: ${normalizeSummaryBulletText(value)}`;
    })
    .filter(Boolean)
    .forEach((bullet) => scoreBullets.push(bullet));

  const sections = applySummarySectionEdits([
    transcriptBullets.length ? { key: "call_summary", heading: "Call Summary", bullets: transcriptBullets } : null,
    scoreBullets.length ? { key: "scorecard", heading: "Scorecard", bullets: scoreBullets } : null,
    guideBullets.length ? { key: "reviewed_guide_responses", heading: "Reviewed Guide Responses", bullets: guideBullets } : null,
    customBullets.length ? { key: "reviewed_custom_questions", heading: "Reviewed Custom Questions", bullets: customBullets } : null,
  ].filter(Boolean), summaryEdits || record);

  if (!sections.length) return [];
  const subtitle = `${record?.candidate_full_name || "Candidate"} - ${guide?.guide_label || guide?.role_label || record?.candidate_position || "Interview"}`;
  const callSummarySections = sections.filter((section) => (section.key || summarySectionKey(section.heading)) === "call_summary");
  const detailSections = sections.filter((section) => (section.key || summarySectionKey(section.heading)) !== "call_summary");
  const pages = [];
  if (callSummarySections.length) {
    pages.push({
      title: "Interview Summary",
      subtitle,
      sections: callSummarySections,
    });
  }
  if (detailSections.length) {
    pages.push({
      title: callSummarySections.length ? "Interview Summary (continued)" : "Interview Summary",
      subtitle,
      sections: detailSections,
    });
  }
  return pages;
}

function estimateSummaryBulletLines(text = "") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return Math.max(1, Math.ceil(clean.length / 92));
}

function chunkSummaryBulletForPreview(text = "", maxLines = 8) {
  const clean = normalizeSummaryBulletText(text);
  if (!clean) return [];
  const maxChars = Math.max(120, 92 * maxLines);
  if (clean.length <= maxChars) return [clean];
  const chunks = [];
  let remaining = clean;
  while (remaining.length > maxChars) {
    const breakpoint = Math.max(
      remaining.lastIndexOf(" ", maxChars),
      remaining.lastIndexOf(".", maxChars),
      remaining.lastIndexOf(";", maxChars),
      remaining.lastIndexOf(",", maxChars),
    );
    const cutAt = breakpoint >= Math.floor(maxChars * 0.6) ? breakpoint : maxChars;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function paginateInterviewSummaryPreview(summaryPages = []) {
  const sourcePages = Array.isArray(summaryPages) ? summaryPages.filter(Boolean) : [];
  const previewPages = [];
  const maxLines = 45;

  sourcePages.forEach((summary) => {
    const title = String(summary.title || "Interview Summary");
    const subtitle = String(summary.subtitle || "");
    let page = { title, subtitle, sections: [] };
    let lineCount = 5;

    const pushPage = () => {
      if (page.sections.some((section) => section.bullets?.length)) previewPages.push(page);
      const continuedTitle = /\(continued\)/i.test(title) ? title : `${title} (continued)`;
      page = { title: continuedTitle, subtitle, sections: [] };
      lineCount = 5;
    };

    (summary.sections || []).forEach((section) => {
      const heading = String(section.heading || "").trim();
      const bullets = (Array.isArray(section.bullets) ? section.bullets : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      if (!bullets.length) return;

      let activeSection = null;
      const ensureSection = () => {
        if (!activeSection) {
          activeSection = { heading, bullets: [] };
          page.sections.push(activeSection);
          lineCount += heading ? 2 : 1;
        }
      };

      bullets.flatMap((bullet) => chunkSummaryBulletForPreview(bullet)).forEach((bullet) => {
        const needed = estimateSummaryBulletLines(bullet) + 1;
        if (lineCount + needed > maxLines && page.sections.some((row) => row.bullets?.length)) {
          pushPage();
          activeSection = null;
        }
        ensureSection();
        activeSection.bullets.push(bullet);
        lineCount += needed;
      });
      lineCount += 1;
    });

    pushPage();
  });

  return previewPages;
}

function InterviewSummaryPreviewPage({ page, width }) {
  if (!page) return null;
  const safeWidth = Number(width) > 0 ? Number(width) : 816;
  const scale = safeWidth / 612;
  return (
    <div
      aria-label="Interview summary appendix preview"
      style={{
        width: safeWidth,
        minHeight: 792 * scale,
        background: "#fff",
        boxShadow: "0 1px 12px rgba(15,23,42,0.12)",
        boxSizing: "border-box",
        padding: `${58 * scale}px ${54 * scale}px`,
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 18 * scale, fontWeight: 800, lineHeight: 1.2 }}>{page.title || "Interview Summary"}</div>
      {page.subtitle ? (
        <div style={{ marginTop: 8 * scale, marginBottom: 22 * scale, fontSize: 9 * scale, color: "#64748b", lineHeight: 1.35 }}>{page.subtitle}</div>
      ) : (
        <div style={{ height: 18 * scale }} />
      )}
      <div style={{ display: "grid", gap: 12 * scale }}>
        {(page.sections || []).map((section, sectionIndex) => (
          <div key={`${section.heading || "section"}-${sectionIndex}`} style={{ display: "grid", gap: 6 * scale }}>
            {section.heading ? (
              <div style={{ fontSize: 11 * scale, fontWeight: 800, color: "#111827" }}>{section.heading}</div>
            ) : null}
            <div style={{ display: "grid", gap: 5 * scale }}>
              {(section.bullets || []).map((bullet, bulletIndex) => (
                <div key={bulletIndex} style={{ display: "grid", gridTemplateColumns: `${12 * scale}px minmax(0, 1fr)`, gap: 6 * scale, alignItems: "start", fontSize: 10 * scale, lineHeight: 1.35, color: "#334155" }}>
                  <span>-</span>
                  <span>{String(bullet || "").replace(/^[-*]\s*/, "")}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaticField({ label, value }) {
  const isLink = /^https?:\/\//i.test(String(value || ""));
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, color: C.text, fontWeight: 700, minHeight: 20, overflowWrap: "anywhere" }}>
        {isLink ? <a href={value} target="_blank" rel="noreferrer" style={{ color: C.pri, textDecoration: "none" }}>{value}</a> : (value || "-")}
      </div>
    </div>
  );
}

function MergeTrace({ responses = [] }) {
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

function SegmentedRecommendation({ value, onChange, disabled }) {
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

function InterviewRoster({ records, onOpen, onAdd, canAdd }) {
  if (records.length === 0) {
    return (
      <div style={{ display: "grid", gap: 12, animation: "interviewPanelEnter 240ms ease-out" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="primary" onClick={onAdd} disabled={!canAdd}>Add New Interview</Btn>
        </div>
        <EmptyState title="No Interviews Yet" body="Create the first interview after a position template is published." />
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 12, animation: "interviewPanelEnter 240ms ease-out" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Interviews</div>
          <div style={{ marginTop: 3, fontSize: 13, color: C.textMut }}>{records.length} total interview{records.length === 1 ? "" : "s"}</div>
        </div>
        <Btn variant="primary" onClick={onAdd} disabled={!canAdd}>Add New Interview</Btn>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflowX: "auto", background: "#fff" }}>
      <div className="interview-roster-table" style={{ minWidth: 900 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.5fr) minmax(190px, 1.1fr) 170px 150px 90px", gap: 0, padding: "12px 16px", background: C.surfaceHover, borderBottom: `1px solid ${C.border}`, color: C.textMut, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <div>Candidate</div>
          <div>Position</div>
          <div>Date Interviewed</div>
          <div>Next Step</div>
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
              gridTemplateColumns: "minmax(240px, 1.5fr) minmax(190px, 1.1fr) 170px 150px 90px",
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
            <div style={{ color: C.pri, fontSize: 13, fontWeight: 900, textAlign: "right" }}>Open</div>
          </button>
        ))}
      </div>
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
        <StaticField label="Candidate Email" value={record.candidate_email} />
        <StaticField label="Candidate Phone" value={record.candidate_phone} />
        <StaticField label="Zoom Link" value={record.zoom_recording_url} />
        <StaticField label="Zoom Passcode" value={record.zoom_passcode} />
      </div>
    </div>
  );
}

function LiveTranscriptPanel({
  turns,
  wordSegmentMode,
  providerWords,
  currentTime,
  durationSeconds,
  audioDuration,
  hasProviderTurns,
  providerTurnLabel,
  duration,
  onSeek,
  onOpenFull,
}) {
  const [search, setSearch] = useState("");
  const [activeResult, setActiveResult] = useState(0);
  const lineRefs = useRef({});
  const lines = useMemo(() => buildLiveTranscriptLines({ turns, wordSegmentMode, providerWords }), [providerWords, turns, wordSegmentMode]);
  const activeLineIndex = useMemo(() => findActiveTranscriptLineIndex(lines, currentTime), [currentTime, lines]);
  const searchResults = useMemo(() => getTranscriptSearchResults(lines, search), [lines, search]);
  const focusedLineIndex = search ? searchResults[Math.min(activeResult, Math.max(0, searchResults.length - 1))]?.lineIndex : activeLineIndex;

  useEffect(() => {
    setActiveResult(0);
  }, [search]);

  useEffect(() => {
    if (activeResult > Math.max(0, searchResults.length - 1)) setActiveResult(Math.max(0, searchResults.length - 1));
  }, [activeResult, searchResults.length]);

  useEffect(() => {
    const node = lineRefs.current[focusedLineIndex];
    if (node) node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedLineIndex]);

  const seekLine = (line) => {
    const time = Number(line?.startSeconds);
    if (Number.isFinite(time)) onSeek?.(Math.max(0, time));
  };

  const jumpSearch = (direction = 1) => {
    if (!searchResults.length) return;
    const next = (activeResult + direction + searchResults.length) % searchResults.length;
    setActiveResult(next);
    seekLine(searchResults[next]?.line);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    if (searchResults.length) seekLine(searchResults[Math.min(activeResult, searchResults.length - 1)]?.line);
  };

  return (
    <div className="interview-live-transcript" style={{ marginTop: 14, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(15,23,42,0.12)", background: "#07130d", boxShadow: "0 18px 44px rgba(15,23,42,0.12)" }}>
      <div style={{ padding: "13px 14px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 360px)", gap: 14, alignItems: "center", background: "linear-gradient(135deg, #07130d 0%, #10251a 44%, #13243f 100%)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "rgba(226,232,240,0.72)", fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>Transcript</div>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#84cc16", boxShadow: "0 0 18px rgba(132,204,22,0.72)" }} />
          </div>
          <div style={{ marginTop: 5, color: "rgba(248,250,252,0.9)", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {wordSegmentMode ? `Timestamped transcript${duration ? ` across ${duration}` : ""}` : `${turns.length} ${providerTurnLabel}${turns.length === 1 ? "" : "s"}${duration ? ` across ${duration}` : ""}`}
          </div>
        </div>
        <form onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 7, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "rgba(226,232,240,0.62)" }}>
              <path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6ZM16.1 16.1 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search transcript"
              aria-label="Search transcript"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid rgba(226,232,240,0.18)",
                background: "rgba(255,255,255,0.1)",
                color: "#f8fafc",
                outline: "none",
                borderRadius: 999,
                padding: "9px 36px 9px 34px",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 800,
              }}
            />
            {search && (
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(226,232,240,0.68)", fontSize: 11, fontWeight: 900 }}>
                {searchResults.length ? `${Math.min(activeResult + 1, searchResults.length)}/${searchResults.length}` : "0"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => jumpSearch(-1)}
            disabled={!searchResults.length}
            aria-label="Previous transcript search result"
            style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid rgba(226,232,240,0.2)", background: "rgba(255,255,255,0.08)", color: "#f8fafc", cursor: searchResults.length ? "pointer" : "not-allowed", fontWeight: 950 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 14 12 8l6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => jumpSearch(1)}
            disabled={!searchResults.length}
            aria-label="Next transcript search result"
            style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid rgba(226,232,240,0.2)", background: "rgba(255,255,255,0.08)", color: "#f8fafc", cursor: searchResults.length ? "pointer" : "not-allowed", fontWeight: 950 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m6 10 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
      {!hasProviderTurns ? (
        <div style={{ padding: 18, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          This record was transcribed before structured turn data was stored. Replace the audio to regenerate the transcript with provider timestamps and diarization.
        </div>
      ) : (
        <>
          <div className="interview-live-transcript-scroll" style={{ position: "relative", height: 238, overflowY: "auto", padding: "22px 18px", background: "radial-gradient(circle at 14% 20%, rgba(132,204,22,0.14), transparent 28%), radial-gradient(circle at 82% 30%, rgba(56,189,248,0.12), transparent 32%), #08130f" }}>
            <div style={{ display: "grid", gap: 8 }}>
              {lines.map((line, index) => {
                const active = index === activeLineIndex;
                const focused = index === focusedLineIndex;
                const progress = active ? getTranscriptLineProgress(line, currentTime) : 0;
                return (
                  <button
                    type="button"
                    key={line.id}
                    ref={(node) => { if (node) lineRefs.current[index] = node; }}
                    onClick={() => seekLine(line)}
                    className="interview-live-transcript-line"
                    style={{
                      position: "relative",
                      border: `1px solid ${active ? "rgba(190,242,100,0.45)" : focused ? "rgba(250,204,21,0.42)" : "rgba(148,163,184,0.1)"}`,
                      background: active ? "rgba(15, 118, 58, 0.22)" : focused ? "rgba(250,204,21,0.08)" : "rgba(255,255,255,0.035)",
                      color: active ? "#f8fafc" : "rgba(226,232,240,0.78)",
                      borderRadius: 8,
                      padding: "9px 12px",
                      display: "grid",
                      gridTemplateColumns: wordSegmentMode ? "54px minmax(0, 1fr)" : "54px 88px minmax(0, 1fr)",
                      gap: 10,
                      alignItems: "start",
                      fontFamily: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      opacity: Math.max(0.52, 1 - Math.abs(index - activeLineIndex) * 0.08),
                      transform: active ? "scale(1.012)" : "scale(1)",
                      boxShadow: active ? "0 14px 36px rgba(5, 46, 22, 0.32)" : "none",
                      transition: "border 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease, opacity 160ms ease",
                    }}
                  >
                    <span style={{ color: active ? "#bef264" : "rgba(203,213,225,0.64)", fontSize: 12, fontWeight: 950 }}>{line.timestamp || ""}</span>
                    {!wordSegmentMode && <span style={{ color: active ? "#dcfce7" : "rgba(203,213,225,0.68)", fontSize: 12, fontWeight: 950, minHeight: 18 }}>{line.speaker}</span>}
                    <span style={{ fontSize: active ? 15 : 14, lineHeight: 1.55, fontWeight: active ? 850 : 720 }}>
                      <TranscriptWords turn={line} currentTime={currentTime} searchQuery={search} tone="dark" />
                    </span>
                    {active && (
                      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, overflow: "hidden", borderRadius: "0 0 8px 8px", background: "rgba(255,255,255,0.08)" }}>
                        <span style={{ display: "block", width: `${Math.round(progress * 100)}%`, height: "100%", background: "linear-gradient(90deg, #84cc16, #38bdf8)", transition: "width 120ms linear" }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", color: "rgba(226,232,240,0.7)", fontSize: 12, fontWeight: 850, background: "rgba(2,6,23,0.42)" }}>
            <button type="button" onClick={onOpenFull} style={{ border: "none", background: "transparent", color: "#bef264", fontFamily: "inherit", fontSize: 12, fontWeight: 950, cursor: "pointer", padding: 0 }}>
              Open full transcript
            </button>
            <span>{formatPlaybackTime(currentTime)} / {formatPlaybackTime(durationSeconds || audioDuration)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function AudioUploadPanel({
  record,
  audioFileName,
  transcribing,
  drafting,
  onUpload,
  onTranscriptUpload,
  onTranscriptPasteOpen,
  onTranscriptClick,
  inputRef,
  transcriptInputRef,
  audioRef,
  audioUrl,
  audioPlaying,
  currentTime,
  audioDuration,
  transcriptTurns = [],
  onPlayToggle,
  onAudioSeek,
  onAudioTimeUpdate,
  onAudioLoadedMetadata,
  onAudioEnded,
  onAudioError,
}) {
  const sourceAudio = record?.metadata?.audio_transcription?.source_audio || {};
  const transcription = record?.metadata?.audio_transcription || {};
  const fileName = audioFileName || sourceAudio.original_file_name || sourceAudio.file_name || "";
  const durationSeconds = Number(transcription.duration_seconds || audioDuration || 0);
  const duration = formatDuration(durationSeconds);
  const fileSize = formatFileSize(sourceAudio.original_size_bytes || sourceAudio.size_bytes);
  const complete = !!record?.transcript_text && !transcribing && !drafting;
  const fallbackBars = useMemo(() => seededWaveBars(`${record?.id || ""}:${fileName}`, 72), [record?.id, fileName]);
  const [audioWaveformBars, setAudioWaveformBars] = useState([]);
  const [audioWaveformStatus, setAudioWaveformStatus] = useState("idle");
  const bars = audioWaveformBars.length ? audioWaveformBars : fallbackBars;
  const safeTranscriptTurns = Array.isArray(transcriptTurns) ? transcriptTurns : [];
  const hasProviderTurns = safeTranscriptTurns.length > 0;
  const segmentationSource = String(transcription.segmentation_source || "");
  const wordSegmentMode = segmentationSource === "xai_word_segments" && safeTranscriptTurns.length > 40 && !safeTranscriptTurns.some((turn) => /^(Speaker|Person)\s+\d+/i.test(turn.speaker || ""));
  const providerTurnLabel = wordSegmentMode ? "timeline row" : "speaker turn";
  const providerWords = wordSegmentMode ? wordsFromProviderSegments(safeTranscriptTurns) : [];

  useEffect(() => {
    setAudioWaveformBars([]);
    if (!audioUrl) {
      setAudioWaveformStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setAudioWaveformStatus("loading");
    extractAudioWaveformBars(audioUrl, { count: 72, signal: controller.signal })
      .then((nextBars) => {
        if (cancelled || controller.signal.aborted) return;
        if (nextBars?.length) {
          setAudioWaveformBars(nextBars);
          setAudioWaveformStatus("ready");
        } else {
          setAudioWaveformStatus("fallback");
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) setAudioWaveformStatus("fallback");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [audioUrl]);

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  const seekTranscript = (time) => {
    const nextTime = Number(time || 0);
    if (onAudioSeek) {
      onAudioSeek(nextTime);
      return;
    }
    if (audioRef.current) audioRef.current.currentTime = nextTime;
    onAudioTimeUpdate({ currentTarget: { currentTime: nextTime } });
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
      <input
        ref={transcriptInputRef}
        type="file"
        accept={INTERVIEW_TRANSCRIPT_ACCEPT}
        style={{ display: "none" }}
        onChange={(event) => {
          onTranscriptUpload?.(event.target.files?.[0]);
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
            {audioWaveformStatus === "loading" && <span>Analyzing waveform</span>}
            {audioWaveformStatus === "ready" && <span>Audio-derived waveform</span>}
            {record?.transcript_text && <span>{hasProviderTurns ? (wordSegmentMode ? "Timestamped transcript" : `${safeTranscriptTurns.length} ${providerTurnLabel}${safeTranscriptTurns.length === 1 ? "" : "s"}`) : "turn data required"}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn variant={complete ? "success" : "primary"} onClick={() => inputRef.current?.click()} disabled={transcribing || drafting}>
            {transcribing || drafting ? "Processing..." : complete ? "Replace Audio" : "Choose File"}
          </Btn>
          <Btn variant="secondary" onClick={() => transcriptInputRef.current?.click()} disabled={transcribing || drafting}>Upload Transcript</Btn>
          <Btn variant="secondary" onClick={onTranscriptPasteOpen} disabled={transcribing || drafting}>Paste Transcript</Btn>
        </div>
      </div>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={onAudioTimeUpdate}
          onLoadedMetadata={onAudioLoadedMetadata}
          onEnded={onAudioEnded}
          onError={onAudioError}
          style={{ display: "none" }}
        />
      )}
      <div
        className={`interview-audio-stage${audioPlaying ? " is-playing" : ""}`}
        onClick={audioUrl ? onPlayToggle : undefined}
        style={{
          marginTop: 18,
          height: 176,
          borderRadius: 8,
          background: "linear-gradient(135deg, #07130d 0%, #0f2f20 42%, #13243f 100%)",
          border: "1px solid rgba(20,83,45,0.26)",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px",
          cursor: audioUrl ? "pointer" : "default",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 42px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, opacity: 0.94, background: "radial-gradient(circle at 22% 52%, rgba(132,204,22,0.24), transparent 30%), radial-gradient(circle at 78% 38%, rgba(56,189,248,0.22), transparent 32%), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "auto, auto, 38px 38px, 38px 38px" }} />
        <div style={{ position: "absolute", left: 16, right: 16, top: 18, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.34), transparent)" }} />
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }} />
        <div
          className="interview-audio-signal"
          style={{
            position: "absolute",
            left: "-12%",
            top: 0,
            bottom: 0,
            width: "42%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), rgba(132,204,22,0.22), rgba(56,189,248,0.14), transparent)",
            animation: (transcribing || drafting || audioPlaying) ? "interviewSignalTravel 2.8s linear infinite" : "interviewWaveGlow 4.8s ease-in-out infinite",
            transition: "filter 180ms ease, opacity 180ms ease",
          }}
        />
        {bars.slice(0, 20).map((bar, index) => (
          <span
            key={`particle-${index}`}
            style={{
              position: "absolute",
              left: `${5 + index * 4.7}%`,
              top: `${18 + ((bar.height + index * 11) % 50)}%`,
              width: 3 + (index % 3),
              height: 3 + (index % 3),
              borderRadius: 999,
              background: index % 2 ? "rgba(132,204,22,0.72)" : "rgba(125,211,252,0.72)",
              boxShadow: index % 2 ? "0 0 18px rgba(132,204,22,0.55)" : "0 0 18px rgba(125,211,252,0.52)",
              animation: `interviewParticleFloat ${2.2 + (index % 6) * 0.24}s ease-in-out ${bar.delay}s infinite`,
            }}
          />
        ))}
        {(transcribing || drafting) && <div style={{ position: "absolute", top: 0, bottom: 0, width: "34%", background: "linear-gradient(90deg, transparent, rgba(20,83,45,0.12), transparent)", animation: "interviewScan 2.4s linear infinite" }} />}
        {complete && <div style={{ position: "absolute", right: 16, top: 16, width: 12, height: 12, borderRadius: 99, background: C.suc, animation: "interviewCompletePulse 1.8s ease-out infinite" }} />}
        <div style={{ position: "absolute", left: 24, top: 18, zIndex: 1, color: "rgba(255,255,255,0.66)", fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {audioWaveformStatus === "ready" ? "Audio Fingerprint" : audioWaveformStatus === "loading" ? "Analyzing Audio" : "Interview Audio"}
        </div>
        <div style={{ position: "absolute", right: 24, bottom: 18, zIndex: 1, color: "rgba(255,255,255,0.62)", fontSize: 11, fontWeight: 850 }}>
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(durationSeconds || audioDuration)}
        </div>
        <div className="interview-audio-bars" style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 3, width: "100%", height: 112, justifyContent: "center", transition: "filter 180ms ease, transform 180ms ease" }}>
          {bars.map((bar, index) => (
            <div
              key={index}
              style={{
                width: index % 7 === 0 ? 6 : 4,
                height: bar.height,
                borderRadius: 99,
                background: index % 4 === 0
                  ? "linear-gradient(180deg, #f8fafc, #84cc16)"
                  : index % 4 === 1
                    ? "linear-gradient(180deg, #bae6fd, #38bdf8)"
                    : index % 4 === 2
                      ? "linear-gradient(180deg, #d9f99d, #16a34a)"
                      : "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(148,163,184,0.44))",
                opacity: Math.min(1, bar.opacity + 0.12),
                transformOrigin: "center",
                boxShadow: index % 5 === 0 ? "0 0 18px rgba(132,204,22,0.36)" : "none",
                animation: transcribing || drafting || audioPlaying ? `interviewWaveFloat ${bar.duration}s ease-in-out ${bar.delay}s infinite` : "none",
              }}
            />
          ))}
        </div>
        <div
          className="interview-audio-overlay"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            transition: "opacity 180ms ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(2,6,23,0.48)",
            backdropFilter: "blur(8px)",
            padding: 16,
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPlayToggle?.();
            }}
            disabled={!audioUrl}
            aria-label={audioPlaying ? "Pause interview audio" : "Play interview audio"}
            style={{
              justifySelf: "center",
              width: 58,
              height: 58,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.58)",
              background: "rgba(255,255,255,0.96)",
              color: "#fff",
              fontSize: 22,
              fontWeight: 900,
              cursor: audioUrl ? "pointer" : "not-allowed",
              boxShadow: "0 18px 48px rgba(2,6,23,0.34)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {audioPlaying ? (
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1.5" fill={C.pri} />
                <rect x="14" y="5" width="4" height="14" rx="1.5" fill={C.pri} />
              </svg>
            ) : (
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginLeft: 2 }}>
                <path d="M8 5.8v12.4c0 .9 1 1.45 1.76.96l9.62-6.2a1.14 1.14 0 0 0 0-1.92L9.76 4.84C9 4.35 8 4.9 8 5.8Z" fill={C.pri} />
              </svg>
            )}
          </button>
        </div>
      </div>
      {audioUrl && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "54px minmax(0, 1fr) 54px",
            gap: 10,
            alignItems: "center",
            color: C.textSec,
            fontSize: 12,
            fontWeight: 850,
          }}
        >
          <span>{formatPlaybackTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={Math.max(1, durationSeconds || audioDuration || 1)}
            step="0.1"
            value={Math.min(currentTime, durationSeconds || audioDuration || currentTime || 0)}
            disabled={!audioUrl}
            onChange={(event) => {
              const nextTime = Number(event.target.value || 0);
              if (onAudioSeek) {
                onAudioSeek(nextTime);
                return;
              }
              if (audioRef.current) audioRef.current.currentTime = nextTime;
              onAudioTimeUpdate({ currentTarget: { currentTime: nextTime } });
            }}
            style={{
              width: "100%",
              accentColor: "#84cc16",
              cursor: "pointer",
            }}
          />
          <span style={{ textAlign: "right" }}>{formatPlaybackTime(durationSeconds || audioDuration)}</span>
        </div>
      )}
      {record?.transcript_text && (
        <LiveTranscriptPanel
          turns={safeTranscriptTurns}
          wordSegmentMode={wordSegmentMode}
          providerWords={providerWords}
          currentTime={currentTime}
          durationSeconds={durationSeconds}
          audioDuration={audioDuration}
          hasProviderTurns={hasProviderTurns}
          providerTurnLabel={providerTurnLabel}
          duration={duration}
          onSeek={seekTranscript}
          onOpenFull={onTranscriptClick}
        />
      )}
    </div>
  );
}

function TranscriptModal({ turns, currentTime, segmentationSource = "", onClose }) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const wordSegmentMode = segmentationSource === "xai_word_segments" && safeTurns.length > 40 && !safeTurns.some((turn) => /^(Speaker|Person)\s+\d+/i.test(turn.speaker || ""));
  const providerWords = wordSegmentMode ? wordsFromProviderSegments(safeTurns) : [];
  const providerWordChunks = wordSegmentMode ? chunkProviderWords(providerWords) : [];
  const hasSpeakers = safeTurns.some((turn) => turn.speaker !== "Transcript");
  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(960px, 92vw)", maxHeight: "86vh", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 24px 70px rgba(2,6,23,0.24)", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", animation: "interviewModalEnter 260ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 950, color: C.text }}>Transcript</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{wordSegmentMode ? providerWordChunks.length : safeTurns.length} {hasSpeakers && !wordSegmentMode ? "speaker turn" : "timeline row"}{(wordSegmentMode ? providerWordChunks.length : safeTurns.length) === 1 ? "" : "s"}</div>
          </div>
          <IconButton label="Close transcript" onClick={onClose}>{"x"}</IconButton>
        </div>
        <div style={{ padding: 18, overflowY: "auto", background: C.surfaceHover }}>
          {safeTurns.length === 0 ? (
            <EmptyState title="No Transcript" body="Replace the audio to regenerate this record with structured transcript turns." />
          ) : wordSegmentMode ? (
            <div style={{ display: "grid", gap: 10 }}>
              {providerWordChunks.map((turn) => (
                <div key={turn.id} className="interview-transcript-line" style={{ display: "grid", gridTemplateColumns: "86px minmax(0, 1fr)", gap: 12, alignItems: "start", background: isTurnActive(turn, currentTime) ? "#f0fdf4" : "#fff", border: `1px solid ${isTurnActive(turn, currentTime) ? "#bbf7d0" : C.borderLight}`, borderRadius: 8, padding: "11px 12px" }}>
                  <div style={{ fontSize: 12, color: C.textMut, fontWeight: 850 }}>{turn.timestamp || "--:--"}</div>
                  <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55 }}><TranscriptWords turn={turn} currentTime={currentTime} /></div>
                </div>
              ))}
            </div>
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

const DOCUMENT_PDF_INSTRUCTION_KEY = "__document";
const PDF_POINT_TO_CSS_PX = 96 / 72;

function getPdfFieldPageSize(field, pageFields = []) {
  const sources = [field, ...pageFields];
  for (const source of sources) {
    const size = source?.page_size || source?.pageSize || {};
    const width = Number(source?.page_width || size.width || size.w);
    const height = Number(source?.page_height || size.height || size.h);
    if (width > 0 && height > 0) return { width, height };
  }
  return { width: 612, height: 792 };
}

function getPdfPageOverlayBox(containerSize, pageSize) {
  const width = Number(containerSize?.width || 0);
  const height = Number(containerSize?.height || 0);
  if (!width || !height || !pageSize?.width || !pageSize?.height) return null;
  if (containerSize?.pageAligned) {
    return {
      left: 0,
      top: 0,
      scale: width / pageSize.width,
    };
  }
  const scale = Math.min(PDF_POINT_TO_CSS_PX, Math.max(0.2, (width - 28) / pageSize.width));
  return {
    left: Math.max(0, (width - pageSize.width * scale) / 2),
    top: 0,
    scale,
  };
}

function getPdfFieldOverlayStyle(field, pageBox, pageSize) {
  const rect = getInterviewPdfFieldDisplayRect(field) || {};
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (!pageBox || !pageSize?.height || !Number.isFinite(x) || !Number.isFinite(y) || !width || !height) return null;
  const isSmallField = width <= 14 && height <= 14;
  const pad = isSmallField ? 1.5 : 5;
  const scaledWidth = width * pageBox.scale + pad * 2;
  const scaledHeight = height * pageBox.scale + pad * 2;
  return {
    left: pageBox.left + (x * pageBox.scale) - pad,
    top: pageBox.top + ((pageSize.height - y - height) * pageBox.scale) - pad,
    width: isSmallField ? Math.max(12, scaledWidth) : Math.max(24, scaledWidth),
    height: isSmallField ? Math.max(12, scaledHeight) : Math.max(18, scaledHeight),
  };
}

function getPdfFieldValueOverlayStyle(field, pageBox, pageSize) {
  const rect = getInterviewPdfFieldDisplayRect(field) || {};
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (!pageBox || !pageSize?.height || !Number.isFinite(x) || !Number.isFinite(y) || !width || !height) return null;
  const isSmallField = width <= 14 && height <= 14;
  return {
    left: pageBox.left + (x * pageBox.scale) + (isSmallField ? 0 : 1),
    top: pageBox.top + ((pageSize.height - y - height) * pageBox.scale) + (isSmallField ? 0 : -1),
    width: Math.max(isSmallField ? 10 : 20, width * pageBox.scale),
    height: Math.max(isSmallField ? 10 : 9, height * pageBox.scale),
  };
}

function PdfFieldClickLayer({ fields, activePageNumber, activeKey, containerSize, pageSize: explicitPageSize = null, onSelectField }) {
  const pageFields = fields.filter((field) => Number(field.page_number || 1) === Number(activePageNumber || 1));
  if (!pageFields.length) return null;
  const pageSize = explicitPageSize || getPdfFieldPageSize(pageFields[0], pageFields);
  const pageBox = getPdfPageOverlayBox(containerSize, pageSize);
  if (!pageBox) return null;
  return (
    <div className="interview-pdf-click-layer" style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }}>
      {pageFields.map((field) => {
        const style = getPdfFieldOverlayStyle(field, pageBox, pageSize);
        if (!style) return null;
        const key = responseKeyForPdfField(field);
        const isActive = key === activeKey;
        return (
          <button
            type="button"
            key={field.name}
            aria-label={`Review ${humanizePdfFieldName(field.name)}`}
            title={humanizePdfFieldName(field.name)}
            onClick={(event) => {
              event.stopPropagation();
              onSelectField?.(field);
            }}
            className="interview-pdf-field-hotspot"
            style={{
              position: "absolute",
              left: style.left,
              top: style.top,
              width: style.width,
              height: style.height,
              borderRadius: 3,
              border: `1.5px solid ${isActive ? "rgba(22, 101, 52, 0.85)" : "rgba(22, 101, 52, 0)"}`,
              background: isActive ? "rgba(22, 163, 74, 0.08)" : "rgba(255,255,255,0.001)",
              cursor: "pointer",
              padding: 0,
              pointerEvents: "auto",
            }}
          />
        );
      })}
    </div>
  );
}

function PdfFieldValueLayer({ fields, activePageNumber, activeKey, containerSize, pageSize: explicitPageSize = null, fieldValues = {} }) {
  const pageFields = fields.filter((field) => Number(field.page_number || 1) === Number(activePageNumber || 1));
  if (!pageFields.length) return null;
  const pageSize = explicitPageSize || getPdfFieldPageSize(pageFields[0], pageFields);
  const pageBox = getPdfPageOverlayBox(containerSize, pageSize);
  if (!pageBox) return null;
  return (
    <div className="interview-pdf-value-layer" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
      {pageFields.map((field) => {
        const rawValue = String(fieldValues?.[field.name] || "").trim();
        const isActive = responseKeyForPdfField(field) === activeKey;
        const value = isActive ? rawValue.replace(/\s+/g, " ").trim() : fitPdfFieldValueForSlot(rawValue, field);
        if (!value) return null;
        const style = getPdfFieldValueOverlayStyle(field, pageBox, pageSize);
        if (!style) return null;
        const rect = getInterviewPdfFieldDisplayRect(field) || {};
        const smallField = Number(rect.width || 0) <= 14 && Number(rect.height || 0) <= 14;
        const normalizedRaw = rawValue.replace(/\s+/g, " ").trim();
        const doesFit = normalizedRaw === value;
        if (!smallField && !isActive && !doesFit) {
          return (
            <div
              key={field.name}
              title={rawValue}
              aria-label={`${humanizePdfFieldName(field.name)} filled`}
              style={{
                position: "absolute",
                left: style.left,
                top: style.top + Math.max(1, style.height / 2 - 3),
                width: Math.min(26, Math.max(12, style.width * 0.08)),
                height: 5,
                borderRadius: 999,
                background: "rgba(22, 163, 74, 0.78)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.9)",
              }}
            />
          );
        }
        const activeFitSize = normalizedRaw
          ? Math.max(5.2, Math.min(10.5, style.width / Math.max(1, normalizedRaw.length * 0.48)))
          : 10.5;
        const fontSize = smallField
          ? Math.max(8, style.height * 0.74)
          : isActive
            ? Math.min(activeFitSize, Math.max(8.5, Math.min(10.5, style.height * 0.72)))
            : Math.max(7.25, Math.min(8.75, style.height * 0.72));
        const height = smallField ? style.height : Math.max(style.height, isActive ? 17 : 12);
        return (
          <div
            key={field.name}
            title={rawValue}
            style={{
              position: "absolute",
              left: style.left,
              top: style.top,
              width: style.width,
              height,
              boxSizing: "border-box",
              color: "#0f172a",
              display: smallField ? "grid" : "block",
              placeItems: smallField ? "center" : undefined,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              fontFamily: smallField ? "Arial, sans-serif" : "\"Times New Roman\", Times, serif",
              fontSize,
              lineHeight: smallField ? 1 : `${Math.max(10, height - 3)}px`,
              fontWeight: smallField ? 800 : 500,
              padding: smallField ? 0 : "0 3px",
              background: smallField ? "transparent" : "rgba(255,255,255,0.98)",
              borderRadius: smallField ? 0 : 2,
              boxShadow: smallField ? undefined : "0 0 0 1px rgba(255,255,255,0.8)",
            }}
          >
            {smallField ? "X" : value}
          </div>
        );
      })}
    </div>
  );
}

function PdfGuidePreview({ pdfUrl, loadingPdf, fields, fieldValues, summaryPages, activePageNumber, activeKey, activeSummary = false, onSelectField, onSelectSummary }) {
  const containerRef = useRef(null);
  const pageCanvasRefs = useRef(new Map());
  const pageFrameRefs = useRef(new Map());
  const pdfDocRef = useRef(null);
  const renderRunRef = useRef(0);
  const lastAutoScrollTargetRef = useRef("");
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageState, setPageState] = useState({ loading: false, error: "", pages: [] });
  const summaryPreviewPages = useMemo(() => paginateInterviewSummaryPreview(summaryPages), [summaryPages]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const update = () => setContainerWidth(node.getBoundingClientRect().width || 0);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfUrl || !containerWidth) return undefined;
    let cancelled = false;
    let loadingTask = null;
    setPageState({ loading: true, error: "", pages: [] });
    pageCanvasRefs.current = new Map();
    pageFrameRefs.current = new Map();
    renderRunRef.current += 1;
    lastAutoScrollTargetRef.current = "";
    if (pdfDocRef.current) {
      try { pdfDocRef.current.destroy?.(); } catch (_) {}
      pdfDocRef.current = null;
    }

    async function loadPdfPages() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;
        const maxWidth = Math.max(260, containerWidth - 28);
        const pages = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(PDF_POINT_TO_CSS_PX, maxWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          pages.push({
            pageNumber,
            scale,
            pageSize: { width: baseViewport.width, height: baseViewport.height },
            renderSize: { width: viewport.width, height: viewport.height, pageAligned: true },
          });
        }

        if (cancelled) {
          await pdf.destroy?.();
          return;
        }
        pdfDocRef.current = pdf;
        setPageState({ loading: true, error: "", pages });
      } catch (error) {
        if (!cancelled) {
          setPageState({ loading: false, error: error?.message || "Unable to render PDF preview.", pages: [] });
        }
      }
    }

    loadPdfPages();
    return () => {
      cancelled = true;
      try { loadingTask?.destroy?.(); } catch (_) {}
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy?.(); } catch (_) {}
        pdfDocRef.current = null;
      }
    };
  }, [pdfUrl, containerWidth]);

  useEffect(() => {
    const pdf = pdfDocRef.current;
    const pages = pageState.pages;
    if (!pdf || !pages.length) return undefined;
    let cancelled = false;
    const runId = renderRunRef.current + 1;
    renderRunRef.current = runId;

    async function renderPages() {
      try {
        for (const pageInfo of pages) {
          if (cancelled || runId !== renderRunRef.current) return;
          const canvas = pageCanvasRefs.current.get(pageInfo.pageNumber);
          if (!canvas) continue;
          const page = await pdf.getPage(pageInfo.pageNumber);
          const viewport = page.getViewport({ scale: pageInfo.scale });
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const context = canvas.getContext("2d", { alpha: false });
          context.save();
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.restore();
          await page.render({ canvasContext: context, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
        }
        if (!cancelled && runId === renderRunRef.current) {
          setPageState((prev) => ({ ...prev, loading: false }));
        }
      } catch (error) {
        if (!cancelled && runId === renderRunRef.current) {
          setPageState({ loading: false, error: error?.message || "Unable to render PDF preview.", pages: [] });
        }
      }
    }

    renderPages();
    return () => {
      cancelled = true;
    };
  }, [pageState.pages]);

  useEffect(() => {
    const pageNumber = Math.max(1, Number(activePageNumber || 1));
    const targetKey = activeSummary ? "summary" : `page:${pageNumber}`;
    if (lastAutoScrollTargetRef.current === targetKey) return;
    const node = activeSummary ? pageFrameRefs.current.get("summary-0") : pageFrameRefs.current.get(pageNumber);
    const scroller = containerRef.current;
    if (!node || !scroller) return;
    lastAutoScrollTargetRef.current = targetKey;
    scroller.scrollTo({
      top: Math.max(0, node.offsetTop - 14),
      behavior: "smooth",
    });
  }, [activePageNumber, activeSummary, pageState.pages.length]);

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100%", minHeight: 560, overflow: "auto", borderRadius: 6, background: "#f8fafc", boxShadow: "0 10px 30px rgba(15,23,42,0.18)" }}>
      {pageState.error ? (
        <div style={{ minHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: C.textMut, fontSize: 13, fontWeight: 800, textAlign: "center" }}>
          PDF preview could not render here. Export will still use the filled PDF.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18, justifyItems: "center", padding: 0 }}>
          {pageState.pages.length ? (
            <>
              {pageState.pages.map((pageInfo) => (
                <div
                  key={pageInfo.pageNumber}
                  ref={(node) => {
                    if (node) pageFrameRefs.current.set(pageInfo.pageNumber, node);
                    else pageFrameRefs.current.delete(pageInfo.pageNumber);
                  }}
                  style={{
                    position: "relative",
                    width: pageInfo.renderSize?.width || 1,
                    minHeight: pageInfo.renderSize?.height || 540,
                    background: "#fff",
                    boxShadow: "0 1px 12px rgba(15,23,42,0.12)",
                  }}
                >
                  <canvas
                    ref={(node) => {
                      if (node) pageCanvasRefs.current.set(pageInfo.pageNumber, node);
                      else pageCanvasRefs.current.delete(pageInfo.pageNumber);
                    }}
                    style={{ display: "block", background: "#fff" }}
                  />
                  {pageInfo.pageSize && pageInfo.renderSize && (
                    <>
                      <PdfFieldValueLayer
                        fields={fields}
                        activePageNumber={pageInfo.pageNumber}
                        activeKey={activeKey}
                        containerSize={pageInfo.renderSize}
                        pageSize={pageInfo.pageSize}
                        fieldValues={fieldValues}
                      />
                      <PdfFieldClickLayer
                        fields={fields}
                        activePageNumber={pageInfo.pageNumber}
                        activeKey={activeKey}
                        containerSize={pageInfo.renderSize}
                        pageSize={pageInfo.pageSize}
                        onSelectField={onSelectField}
                      />
                    </>
                  )}
                </div>
              ))}
              {summaryPreviewPages.map((summaryPage, index) => (
                <button
                  type="button"
                  key={`summary-${index}`}
                  ref={(node) => {
                    if (node) pageFrameRefs.current.set(`summary-${index}`, node);
                    else pageFrameRefs.current.delete(`summary-${index}`);
                  }}
                  onClick={onSelectSummary}
                  style={{
                    border: `2px solid ${activeSummary && index === 0 ? C.pri : "transparent"}`,
                    borderRadius: 6,
                    padding: 0,
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <InterviewSummaryPreviewPage
                    page={summaryPage}
                    width={pageState.pages[0]?.renderSize?.width || Math.max(260, containerWidth - 28)}
                  />
                </button>
              ))}
            </>
          ) : (
            <div style={{ minHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: C.textMut, fontSize: 13, fontWeight: 800 }}>
              Loading PDF preview...
            </div>
          )}
        </div>
      )}
      {(loadingPdf || pageState.loading) && (
        <div style={{ position: "absolute", right: 14, top: 14, zIndex: 4, borderRadius: 999, background: "rgba(255,255,255,0.94)", border: `1px solid ${C.borderLight}`, color: C.textSec, fontSize: 11, fontWeight: 900, padding: "5px 9px", boxShadow: "0 8px 20px rgba(15,23,42,0.12)" }}>
          Updating
        </div>
      )}
    </div>
  );
}

const GUIDE_AI_WORK_STEPS = [
  "Reading the transcript",
  "Checking PDF fields",
  "Mapping evidence",
  "Saving guide updates",
];

function buildGuideAiCompletionBullets(result, totalFields) {
  const saved = Number(result?.saved_count || 0);
  const populated = Number(result?.populated_count ?? saved);
  const skipped = Number(result?.skipped_count || 0);
  const reused = result?.reused ? 1 : 0;
  return [
    `Reviewed ${totalFields || 0} PDF fields against the transcript and instruction.`,
    `Wrote text into ${populated} field${populated === 1 ? "" : "s"} and saved ${saved} response row${saved === 1 ? "" : "s"}.`,
    skipped ? `Skipped ${skipped} malformed AI response${skipped === 1 ? "" : "s"} before saving.` : "No malformed AI responses were skipped.",
    reused ? "Resumed the existing AI draft job instead of starting a duplicate." : "Saved the new guide draft responses for review.",
  ];
}

function GuideAiAssistantPanel({
  open,
  messages,
  working,
  workStepIndex,
  fieldCount,
  reviewedCount,
  onClose,
  onSubmit,
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "42px";
    input.style.height = `${Math.min(150, Math.max(42, input.scrollHeight))}px`;
  }, [draft, open]);

  if (!open) return null;

  const submit = async () => {
    const instruction = draft.trim();
    if (!instruction || working) return;
    const ok = await onSubmit?.(instruction);
    if (ok) setDraft("");
  };

  return (
    <div
      className={`interview-guide-ai-panel${working ? " is-working" : ""}`}
      style={{
        position: "absolute",
        top: 64,
        right: 18,
        zIndex: 8,
        width: "min(430px, calc(100vw - 56px))",
        maxHeight: "min(620px, calc(92vh - 104px))",
        borderRadius: 10,
        border: "1px solid rgba(148, 163, 184, 0.24)",
        background: "rgba(255,255,255,0.96)",
        boxShadow: "0 30px 90px rgba(2,6,23,0.26)",
        backdropFilter: "blur(18px)",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 14, borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 54%, #f0fdf4 100%)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div style={{ position: "relative", width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", background: "#052e16", color: "#bef264", fontWeight: 950, boxShadow: "0 10px 28px rgba(5,46,22,0.22)" }}>
            <span style={{ position: "absolute", inset: -4, borderRadius: 13, background: "rgba(132,204,22,0.22)", animation: working ? "interviewAiHalo 1.7s ease-in-out infinite" : "none" }} />
            <span style={{ position: "relative" }}>AI</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontWeight: 950, fontSize: 14 }}>Guide Assistant</div>
            <div style={{ marginTop: 2, color: C.textMut, fontSize: 11, fontWeight: 850 }}>{reviewedCount}/{fieldCount} responses reviewed</div>
          </div>
        </div>
        <IconButton label="Close guide assistant" onClick={onClose}>{"x"}</IconButton>
      </div>
      <div style={{ padding: 14, overflowY: "auto", display: "grid", alignContent: "start", gap: 10, background: "#fbfdff" }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              justifySelf: message.role === "user" ? "end" : "start",
              maxWidth: "92%",
              borderRadius: message.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
              border: `1px solid ${message.role === "user" ? "rgba(22,101,52,0.22)" : C.borderLight}`,
              background: message.role === "user" ? "#ecfdf5" : "#fff",
              color: C.text,
              padding: "10px 11px",
              boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
            }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
            {Array.isArray(message.bullets) && message.bullets.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 5, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>
                {message.bullets.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            )}
          </div>
        ))}
        {working && (
          <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10, boxShadow: "0 10px 24px rgba(15,23,42,0.05)" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center", color: C.pri, fontSize: 12, fontWeight: 950 }}>
              <span>Working</span>
              <span className="interview-ai-dot" style={{ width: 4, height: 4, borderRadius: 999, background: C.pri }} />
              <span className="interview-ai-dot" style={{ width: 4, height: 4, borderRadius: 999, background: C.pri }} />
              <span className="interview-ai-dot" style={{ width: 4, height: 4, borderRadius: 999, background: C.pri }} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {GUIDE_AI_WORK_STEPS.map((step, index) => {
                const done = index < workStepIndex;
                const active = index === workStepIndex;
                return (
                  <div key={step} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 8, alignItems: "center", color: done || active ? C.text : C.textMut, fontSize: 12, fontWeight: active ? 950 : 800 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: done ? C.suc : active ? "#84cc16" : C.border, boxShadow: active ? "0 0 18px rgba(132,204,22,0.48)" : "none" }} />
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${C.borderLight}`, background: "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "end" }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Tell AI what to infer across this guide"
            rows={1}
            disabled={working}
            style={{
              width: "100%",
              minHeight: 42,
              maxHeight: 150,
              boxSizing: "border-box",
              border: `1.5px solid ${C.border}`,
              borderRadius: 9,
              padding: "10px 11px",
              resize: "none",
              overflowY: "auto",
              outline: "none",
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.45,
              color: C.text,
              background: working ? C.surfaceHover : "#fff",
            }}
          />
          <Btn variant="primary" size="sm" onClick={submit} disabled={working || !draft.trim()}>{working ? "Running" : "Send"}</Btn>
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
  pdfFieldValues,
  summaryPages,
  summaryDraftTextByKey,
  summarySavingKey,
  savingKey,
  exporting,
  activeIndex,
  setActiveIndex,
  getFieldValue,
  setFieldDraft,
  onSummarySectionChange,
  approveField,
  rejectField,
  aiDrafting,
  onAiFillDocument,
  exportFinalPdf,
  downloadArtifact,
  onClose,
}) {
  const reviewFields = fields;
  const reviewItems = useMemo(() => buildPdfReviewItems(reviewFields), [reviewFields]);
  const summarySections = (summaryPages || []).flatMap((page) => page?.sections || []);
  const summaryAvailable = summarySections.length > 0;
  const summaryActive = summaryAvailable && activeIndex >= reviewItems.length;
  const boundedIndex = summaryActive ? -1 : Math.min(activeIndex, Math.max(0, reviewItems.length - 1));
  const activeItem = summaryActive ? null : (reviewItems[boundedIndex] || reviewItems[0] || null);
  const activeField = activeItem?.field || activeItem?.fields?.[0] || null;
  const activeKey = activeField ? responseKeyForPdfField(activeField) : "";
  const itemApproved = (item) => !!item?.fields?.length && item.fields.every((field) => isInterviewResponseReviewed(responsesByTarget[responseKeyForPdfField(field)] || {}));
  const approved = !summaryActive && itemApproved(activeItem);
  const approvedCount = reviewItems.filter(itemApproved).length;
  const getItemDraftValue = (item) => {
    if (!item) return "";
    if (item.type === "question_part" && Object.prototype.hasOwnProperty.call(responseDrafts || {}, item.key)) {
      return responseDrafts[item.key] || "";
    }
    return composePdfReviewItemValue(item, getFieldValue);
  };
  const activeValue = activeItem ? getItemDraftValue(activeItem) : "";
  const activeResponses = activeItem?.fields?.map((field) => responsesByTarget[responseKeyForPdfField(field)] || {}).filter(Boolean) || [];
  const activeEvidence = activeResponses.flatMap((response) => Array.isArray(response.ai_evidence) ? response.ai_evidence : []).filter(Boolean);
  const [guideAiOpen, setGuideAiOpen] = useState(false);
  const [guideAiWorking, setGuideAiWorking] = useState(false);
  const [guideAiStepIndex, setGuideAiStepIndex] = useState(0);
  const [guideAiMessages, setGuideAiMessages] = useState(() => [
    {
      id: "guide-ai-ready",
      role: "assistant",
      body: "I can update the whole PDF guide from the transcript, candidate metadata, and any extra instruction you give me.",
    },
  ]);

  const selectField = (field) => {
    const index = reviewItems.findIndex((item) => item.fields?.some((row) => row.name === field?.name));
    if (index >= 0) setActiveIndex(index);
  };

  const goNext = () => {
    if (!reviewItems.length) return;
    const nextUnapproved = reviewItems.findIndex((item, index) => index > boundedIndex && !itemApproved(item));
    if (nextUnapproved >= 0) setActiveIndex(nextUnapproved);
    else setActiveIndex(Math.min(reviewItems.length - 1, boundedIndex + 1));
  };

  const setItemDraft = (item, value) => {
    splitPdfReviewItemValue(item, value).forEach(({ field, value: fieldValue }) => {
      setFieldDraft(field, fieldValue, item?.type === "question_part" ? { aggregateKey: item.key, aggregateValue: value } : null);
    });
  };

  const approveAndNext = async () => {
    if (!activeItem) return;
    const parts = splitPdfReviewItemValue(activeItem, activeValue);
    for (const part of parts) {
      await approveField(part.field, part.value);
    }
    goNext();
  };

  const approveReviewItems = async (items) => {
    for (const item of items) {
      const itemValue = composePdfReviewItemValue(item, getFieldValue);
      const parts = splitPdfReviewItemValue(item, itemValue);
      for (const part of parts) {
        await approveField(part.field, part.value);
      }
    }
  };

  const rejectReviewItems = async (items) => {
    for (const item of items) {
      for (const field of item.fields || []) {
        await rejectField?.(field);
      }
    }
  };

  const activePageItems = reviewItems.filter((item) => item.fields?.some((field) => field.page_number === activeField?.page_number));

  const submitGuideAiInstruction = async (instruction) => {
    const trimmed = String(instruction || "").trim();
    if (!trimmed || guideAiWorking) return false;
    const messageId = Date.now();
    setGuideAiOpen(true);
    setGuideAiStepIndex(0);
    setGuideAiWorking(true);
    setGuideAiMessages((prev) => [
      ...prev,
      { id: `guide-ai-user-${messageId}`, role: "user", body: trimmed },
    ]);
    let stepTimer = null;
    try {
      stepTimer = window.setInterval(() => {
        setGuideAiStepIndex((index) => Math.min(GUIDE_AI_WORK_STEPS.length - 1, index + 1));
      }, 2400);
      const result = await onAiFillDocument?.(trimmed);
      setGuideAiStepIndex(GUIDE_AI_WORK_STEPS.length - 1);
      if (result) {
        setGuideAiMessages((prev) => [
          ...prev,
          {
            id: `guide-ai-assistant-${messageId}`,
            role: "assistant",
            body: "Guide update ready for review.",
            bullets: buildGuideAiCompletionBullets(result, reviewFields.length),
          },
        ]);
        return true;
      }
      setGuideAiMessages((prev) => [
        ...prev,
        {
          id: `guide-ai-error-${messageId}`,
          role: "assistant",
          body: "I could not apply that update. Check the transcript and try a more specific instruction.",
        },
      ]);
      return false;
    } finally {
      if (stepTimer) window.clearInterval(stepTimer);
      setGuideAiWorking(false);
    }
  };

  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div className="interview-immersive-shell" onClick={(event) => event.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Interview Guide</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{record.candidate_full_name} - {approvedCount}/{reviewItems.length} responses reviewed</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <IconButton
              label="AI instructions for this guide"
              onClick={() => setGuideAiOpen((open) => !open)}
              variant={guideAiOpen ? "primary" : "default"}
            >
              AI
            </IconButton>
            <Btn
              variant="primary"
              size="sm"
              onClick={() => submitGuideAiInstruction("Fill this guide from the transcript using the selected strictness mode.")}
              disabled={guideAiWorking || aiDrafting}
            >
              Draft Guide
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => approveReviewItems(activePageItems)} disabled={!activePageItems.length}>Approve Page</Btn>
            <Btn variant="secondary" size="sm" onClick={() => approveReviewItems(reviewItems)} disabled={!reviewItems.length}>Approve All Drafts</Btn>
            <Btn variant="secondary" size="sm" onClick={() => rejectReviewItems(reviewItems)} disabled={!reviewItems.length}>Reject All</Btn>
            <Btn variant="success" size="sm" onClick={exportFinalPdf} disabled={exporting || !pdfUrl}>{exporting ? "Exporting..." : "Export Final PDF"}</Btn>
            <IconButton label="Close guide" onClick={onClose}>{"x"}</IconButton>
          </div>
        </div>
        <GuideAiAssistantPanel
          open={guideAiOpen}
          messages={guideAiMessages}
          working={guideAiWorking || aiDrafting}
          workStepIndex={guideAiStepIndex}
          fieldCount={reviewItems.length}
          reviewedCount={approvedCount}
          onClose={() => setGuideAiOpen(false)}
          onSubmit={submitGuideAiInstruction}
        />
        <div className="interview-guide-grid" style={{ display: "grid", gridTemplateColumns: "74px minmax(0, 1fr) 390px", minHeight: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, overflowY: "auto", background: "#fbfdff", padding: "12px 10px", display: "grid", alignContent: "start", gap: 7 }}>
            {reviewItems.length === 0 ? (
              <div style={{ color: C.textMut, fontSize: 12 }}>No fields</div>
            ) : reviewItems.map((item, index) => {
              const isActive = index === boundedIndex;
              const isApproved = itemApproved(item);
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setActiveIndex(index)}
                  title={item.type === "question_part" ? questionPartLabel(item) : humanizePdfFieldName(item.field.name)}
                  style={{
                    width: "100%",
                    height: 24,
                    borderRadius: 999,
                    border: `1px solid ${isActive ? C.pri : isApproved ? C.suc : C.border}`,
                    background: isActive ? C.pri : isApproved ? "#dcfce7" : "#fff",
                    color: isActive ? "#fff" : isApproved ? C.suc : C.textMut,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  {item.type === "question_part" ? questionPartShortLabel(item) : index + 1}
                </button>
              );
            })}
            {summaryAvailable && (
              <>
                <div style={{ height: 1, background: C.borderLight, margin: "4px 0" }} />
                <button
                  type="button"
                  onClick={() => setActiveIndex(reviewItems.length)}
                  title="Interview Summary"
                  style={{
                    width: "100%",
                    height: 28,
                    borderRadius: 999,
                    border: `1px solid ${summaryActive ? C.pri : "#86efac"}`,
                    background: summaryActive ? C.pri : "#ecfdf5",
                    color: summaryActive ? "#fff" : C.suc,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 10,
                    fontWeight: 950,
                  }}
                >
                  SUM
                </button>
              </>
            )}
          </div>
          <div className="interview-guide-pdf" style={{ background: "#e5e7eb", padding: 14, minHeight: 0 }}>
            {pdfUrl ? (
              <PdfGuidePreview
                pdfUrl={pdfUrl}
                loadingPdf={loadingPdf}
                fields={reviewFields}
                fieldValues={pdfFieldValues}
                summaryPages={summaryPages}
                activePageNumber={activeField?.page_number || 1}
                activeKey={activeKey}
                activeSummary={summaryActive}
                onSelectField={selectField}
                onSelectSummary={() => setActiveIndex(reviewItems.length)}
              />
            ) : loadingPdf ? (
              <div style={{ height: "100%", minHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontWeight: 800 }}>Rendering guide...</div>
            ) : (
              <EmptyState title="No PDF" body="This interview does not have a source guide PDF." />
            )}
          </div>
          <div style={{ borderLeft: `1px solid ${C.border}`, background: "#fff", padding: 16, overflowY: "auto" }}>
            {summaryActive ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Summary Appendix</div>
                  <div style={{ marginTop: 5, fontSize: 16, color: C.text, fontWeight: 950 }}>Interview Summary</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>Edits save into this interview and export with the final PDF.</div>
                </div>
                {summarySections.map((section) => {
                  const sectionKey = section.key || summarySectionKey(section.heading);
                  const textValue = Object.prototype.hasOwnProperty.call(summaryDraftTextByKey || {}, sectionKey)
                    ? summaryDraftTextByKey[sectionKey] || ""
                    : summaryBulletsToText(section.bullets);
                  return (
                    <div key={sectionKey} style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontSize: 12, color: C.text, fontWeight: 950 }}>{section.heading || "Summary"}</div>
                        <span style={{ color: C.textMut, fontSize: 11 }}>{summarySavingKey === sectionKey ? "Saving..." : "Autosaves"}</span>
                      </div>
                      <textarea
                        value={textValue}
                        onChange={(event) => onSummarySectionChange?.(sectionKey, event.target.value)}
                        rows={Math.max(5, Math.min(14, textValue.split("\n").length + 2))}
                        style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, color: C.text, resize: "vertical", outline: "none", background: "#fff", minHeight: 138, whiteSpace: "pre-wrap" }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : activeField ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Review Field</div>
                      <div style={{ marginTop: 5, fontSize: 16, color: C.text, fontWeight: 950, overflowWrap: "anywhere" }}>{activeItem?.type === "question_part" ? questionPartLabel(activeItem) : humanizePdfFieldName(activeField.name)}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>Page {activeField.page_number || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <Badge color={approved ? "success" : "default"}>{approved ? "Reviewed" : "Needs Review"}</Badge>
                    </div>
                  </div>
                </div>
                <textarea
                  value={activeValue}
                  onChange={(event) => setItemDraft(activeItem, event.target.value)}
                  rows={fieldValueRows(activeValue)}
                  placeholder={activeItem?.type === "question_part" ? `${activeItem.partLabel} response` : ""}
                  style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, color: C.text, resize: "vertical", outline: "none", background: "#fff", minHeight: 132, whiteSpace: "pre-wrap" }}
                />
                <MergeTrace responses={activeResponses} />
                {activeEvidence.length > 0 && (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Evidence</div>
                    {activeEvidence.slice(0, 4).map((entry, index) => (
                      <div key={index} style={{ borderLeft: `3px solid ${C.acc}`, paddingLeft: 10, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>{entry}</div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: C.textMut, fontSize: 12 }}>{savingKey === activeKey ? "Saving..." : "Autosaves as you type"}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="secondary" size="sm" onClick={() => rejectReviewItems(activeItem ? [activeItem] : [])}>Reject</Btn>
                    <Btn variant="primary" size="sm" onClick={approveAndNext}>Approve & Next</Btn>
                  </div>
                </div>
                {artifacts.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Exports</div>
                    {artifacts.slice(0, 3).map((artifact) => (
                      <div key={artifact.id} style={{ fontSize: 12, color: C.textSec, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artifact.file_name}</span>
                        <span style={{ flexShrink: 0 }}>{artifact.created_at ? new Date(artifact.created_at).toLocaleDateString() : ""}</span>
                        <button
                          type="button"
                          onClick={() => downloadArtifact?.(artifact)}
                          style={{ border: "none", background: "none", color: C.pri, fontFamily: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer", padding: 0 }}
                        >
                          Download
                        </button>
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
  setQuestionDraft,
  approveQuestion,
  rejectQuestion,
  onAiDraftQuestions,
  onClose,
}) {
  const approvedCount = questions.filter((question) => responsesByTarget[responseKeyForQuestion(question)]?.metadata?.approved).length;
  const grouped = questions.reduce((groups, question, index) => {
    const category = question.category || "Interview";
    if (!groups[category]) groups[category] = [];
    groups[category].push({ question, index });
    return groups;
  }, {});
  const questionRefs = useRef({});
  const scrollToQuestion = (questionKey) => {
    questionRefs.current[questionKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const approveAllQuestions = async () => {
    for (const question of questions) {
      await approveQuestion(question, responseDrafts[responseKeyForQuestion(question)] || "");
    }
  };
  const rejectAllQuestions = async () => {
    for (const question of questions) {
      await rejectQuestion?.(question);
    }
  };

  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div className="interview-immersive-shell" onClick={(event) => event.stopPropagation()} style={{ width: "min(1180px, 94vw)" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Custom Questions</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{record.candidate_full_name} - {approvedCount}/{questions.length} approved</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Btn variant="primary" size="sm" onClick={onAiDraftQuestions} disabled={!questions.length}>Draft Questions</Btn>
            <Btn variant="secondary" size="sm" onClick={approveAllQuestions} disabled={!questions.length}>Approve All Drafts</Btn>
            <Btn variant="secondary" size="sm" onClick={rejectAllQuestions} disabled={!questions.length}>Reject All</Btn>
            <IconButton label="Close questions" onClick={onClose}>{"x"}</IconButton>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "190px minmax(0, 1fr)", minHeight: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, background: "#fff", overflowY: "auto", padding: "18px 16px" }}>
            {Object.entries(grouped).map(([category, rows]) => (
              <div key={category} style={{ marginBottom: 20 }}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 950, marginBottom: 8 }}>{category}</div>
                <div style={{ display: "grid", gap: 5 }}>
                  {rows.map(({ question, index }) => {
                    const key = responseKeyForQuestion(question);
                    const isApproved = !!responsesByTarget[key]?.metadata?.approved;
                    return (
                      <button
                        type="button"
                        key={question.question_key}
                        className="interview-question-rail-line"
                        onClick={() => scrollToQuestion(question.question_key)}
                        style={{
                          position: "relative",
                          height: 8,
                          width: "100%",
                          border: "none",
                          borderRadius: 99,
                          background: isApproved ? C.suc : C.border,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        aria-label={`Jump to question ${index + 1}`}
                      >
                        <span
                          className="interview-question-tooltip"
                          style={{
                            position: "absolute",
                            left: "calc(100% + 10px)",
                            top: "50%",
                            transform: "translate(-6px, -50%)",
                            opacity: 0,
                            pointerEvents: "none",
                            width: 300,
                            borderRadius: 8,
                            background: "#0f172a",
                            color: "#fff",
                            padding: "8px 10px",
                            fontSize: 12,
                            fontWeight: 750,
                            lineHeight: 1.35,
                            zIndex: 5,
                            transition: "opacity 160ms ease, transform 160ms ease",
                            textAlign: "left",
                          }}
                        >
                          {question.prompt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 20, background: C.surfaceHover, overflowY: "auto" }}>
            {questions.length === 0 ? (
              <EmptyState title="No Questions" body="Add shared custom questions in configuration." />
            ) : (
              <div style={{ maxWidth: 880, display: "grid", gap: 20 }}>
                {Object.entries(grouped).map(([category, rows]) => (
                  <section key={category} style={{ display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>{category}</div>
                    {rows.map(({ question, index }) => {
                      const key = responseKeyForQuestion(question);
                      const response = responsesByTarget[key] || {};
                      const value = responseDrafts[key] || "";
                      const approved = !!response.metadata?.approved;
                      const officialValue = getInterviewOfficialResponseText(response);
                      const reviewedDirty = approved && String(value || "").trim() !== String(officialValue || "").trim();
                      const approveLabel = approved ? (reviewedDirty ? "Update Review" : "Reviewed") : "Approve";
                      return (
                        <div
                          key={question.question_key}
                          ref={(node) => { if (node) questionRefs.current[question.question_key] = node; }}
                          style={{ background: "#fff", border: `1px solid ${approved ? "#bbf7d0" : C.border}`, borderRadius: 8, padding: 16, display: "grid", gap: 12 }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 900 }}>Question {index + 1}</div>
                              <div style={{ marginTop: 5, fontSize: 16, lineHeight: 1.4, color: C.text, fontWeight: 900 }}>{question.prompt}</div>
                            </div>
                            <Badge color={approved ? "success" : "default"}>{approved ? "Reviewed" : "Needs Review"}</Badge>
                          </div>
                          <textarea
                            value={value}
                            onChange={(event) => setQuestionDraft(question, event.target.value)}
                            rows={fieldValueRows(value)}
                            style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 13, fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, color: C.text, resize: "vertical", background: "#fff", outline: "none", minHeight: 96 }}
                          />
                          <MergeTrace responses={[response]} />
                          {Array.isArray(response.ai_evidence) && response.ai_evidence.length > 0 && (
                            <div style={{ display: "grid", gap: 6 }}>
                              {response.ai_evidence.slice(0, 2).map((entry, evidenceIndex) => (
                                <div key={evidenceIndex} style={{ borderLeft: `3px solid ${C.acc}`, paddingLeft: 10, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>{entry}</div>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ color: C.textMut, fontSize: 12 }}>{savingKey === key ? "Saving..." : "Autosaves as you type"}</span>
                            <div style={{ display: "flex", gap: 8 }}>
                              <Btn variant="secondary" size="sm" onClick={() => rejectQuestion?.(question)}>Reject</Btn>
                              <Btn
                                variant={approved && !reviewedDirty ? "secondary" : "primary"}
                                size="sm"
                                onClick={() => approveQuestion(question, value)}
                                disabled={approved && !reviewedDirty}
                              >
                                {approveLabel}
                              </Btn>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LaborInterviewsPage({ data, profile, addGlobalToast, locationName, embedded = false, viewPreset = null, onViewChange = null, onDetailChange = null }) {
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const locationRef = profile?.location_id || data?.locationId || "";
  const [locationId, setLocationId] = useState("");
  const [view, setView] = useState(viewPreset || "records");
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [records, setRecords] = useState([]);
  const [guides, setGuides] = useState([]);
  const [responses, setResponses] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [showNewInterview, setShowNewInterview] = useState(false);
  const [showCandidateEdit, setShowCandidateEdit] = useState(false);
  const [candidateEditDraft, setCandidateEditDraft] = useState(() => buildNewInterviewDraft());
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState("");
  const [guideAttachVersionId, setGuideAttachVersionId] = useState("");
  const [aiReviewMode, setAiReviewMode] = useState("literal");
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [pdfReviewIndex, setPdfReviewIndex] = useState(0);
  const [configQuestionsOpen, setConfigQuestionsOpen] = useState(false);
  const [showNewPosition, setShowNewPosition] = useState(false);
  const [newPositionDraft, setNewPositionDraft] = useState({ role_label: "", description: "" });
  const [dragQuestionId, setDragQuestionId] = useState("");
  const [newInterviewDraft, setNewInterviewDraft] = useState(() => buildNewInterviewDraft());
  const [savingNewInterview, setSavingNewInterview] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState({});
  const [savingResponseKey, setSavingResponseKey] = useState("");
  const [summaryDraftTextByKey, setSummaryDraftTextByKey] = useState({});
  const [savingSummaryKey, setSavingSummaryKey] = useState("");
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [newQuestionDrafts, setNewQuestionDrafts] = useState({});
  const [templateActionId, setTemplateActionId] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [audioFileName, setAudioFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioSources, setAudioSources] = useState([]);
  const [activeAudioSourceIndex, setActiveAudioSourceIndex] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showConfigSettings, setShowConfigSettings] = useState(false);
  const [autoScoreCandidates, setAutoScoreCandidates] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [summaryDrafting, setSummaryDrafting] = useState(false);
  const [audioTranscribing, setAudioTranscribing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const pdfInputRefs = useRef({});
  const audioInputRef = useRef(null);
  const transcriptInputRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const pendingAudioPlaybackRef = useRef(null);
  const pdfSaveTimersRef = useRef({});
  const questionSaveTimersRef = useRef({});
  const summarySaveTimerRef = useRef(null);
  const summaryRequestRef = useRef(new Set());

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

  const selectedGuides = useMemo(() => {
    if (!selectedRecord) return [];
    const rows = guides
      .filter((guide) => guide.interview_id === selectedRecord.id)
      .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
    return rows.length ? rows : [buildLegacyGuideFromRecord(selectedRecord)].filter(Boolean);
  }, [guides, selectedRecord]);

  const selectedGuide = useMemo(() => {
    if (!selectedGuides.length) return null;
    return selectedGuides.find((guide) => guide.id === activeGuideId) || selectedGuides[0];
  }, [activeGuideId, selectedGuides]);

  useEffect(() => {
    onDetailChange?.(!!selectedRecordId);
    return () => onDetailChange?.(false);
  }, [onDetailChange, selectedRecordId]);

  useEffect(() => {
    return () => {
      Object.values(pdfSaveTimersRef.current || {}).forEach((timer) => clearTimeout(timer));
      Object.values(questionSaveTimersRef.current || {}).forEach((timer) => clearTimeout(timer));
      if (summarySaveTimerRef.current) clearTimeout(summarySaveTimerRef.current);
    };
  }, []);

  const selectedSnapshot = useMemo(() => snapshotForGuide(selectedRecord, selectedGuide), [selectedGuide, selectedRecord]);
  const selectedQuestions = useMemo(() => questionRowsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const selectedPdfFields = useMemo(() => pdfFieldsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const selectedPdfSourcePath = selectedSnapshot?.version?.source_pdf_path || "";
  const selectedPdfSourceBucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
  const responsesByTarget = useMemo(() => mapResponsesByTarget(responses, selectedGuide?.id || ""), [responses, selectedGuide?.id]);
  const autoScoreStorageKey = useMemo(() => getAutoScoreStorageKey(actorUserId), [actorUserId]);
  const selectedTranscriptTurns = useMemo(() => {
    const durationSeconds = Number(selectedRecord?.metadata?.audio_transcription?.duration_seconds || audioDuration || 0);
    return getInterviewTranscriptTurns(selectedRecord || {}, { durationSeconds });
  }, [audioDuration, selectedRecord]);
  const hasStoredTranscriptSummary = useMemo(() => getStoredTranscriptSummaryBullets(selectedRecord).length > 0, [selectedRecord]);

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

  const changeView = useCallback((nextView) => {
    setView(nextView);
    onViewChange?.(nextView);
  }, [onViewChange]);

  useEffect(() => {
    if (viewPreset && viewPreset !== view) setView(viewPreset);
  }, [view, viewPreset]);

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
      const recordIds = (recordRes.data || []).map((record) => record.id);
      const guideRes = recordIds.length
        ? await supabase
            .from("labor_interview_record_guides")
            .select("*")
            .in("interview_id", recordIds)
            .order("sequence_order", { ascending: true })
            .order("created_at", { ascending: true })
        : { data: [], error: null };
      const guideMissing = guideRes.error?.code === "PGRST205" || /labor_interview_record_guides/i.test(guideRes.error?.message || "");
      if (guideRes.error && !guideMissing) throw guideRes.error;

      setTemplates(templateRows);
      setVersions(versionRows);
      setQuestions(questionRes.data || []);
      setRecords(recordRes.data || []);
      setGuides(guideMissing ? [] : (guideRes.data || []));
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
    if (!selectedRecord?.id) return;
    setAiReviewMode(normalizeAiReviewMode(selectedRecord?.metadata?.ai_review_mode));
  }, [selectedRecord?.id, selectedRecord?.metadata?.ai_review_mode]);

  const loadInterviewDetail = useCallback(async (interviewId) => {
    if (!interviewId) {
      setResponses([]);
      setArtifacts([]);
      return { responses: [], artifacts: [] };
    }
    const [responseRes, artifactRes] = await Promise.all([
      supabase.from("labor_interview_responses").select("*").eq("interview_id", interviewId).order("created_at"),
      supabase.from("labor_interview_artifacts").select("*").eq("interview_id", interviewId).order("created_at", { ascending: false }),
    ]);
    if (responseRes.error) throw responseRes.error;
    if (artifactRes.error) throw artifactRes.error;
    setResponses(responseRes.data || []);
    setArtifacts(artifactRes.data || []);
    return { responses: responseRes.data || [], artifacts: artifactRes.data || [] };
  }, []);

  useEffect(() => {
    const loadRecordDetail = async () => {
      if (!selectedRecord?.id) {
        setResponses([]);
        setArtifacts([]);
        return;
      }
      try {
        await loadInterviewDetail(selectedRecord.id);
      } catch (_) {
        showToast("Failed to load interview responses", "error");
      }
    };
    loadRecordDetail();
  }, [loadInterviewDetail, selectedRecord?.id, showToast]);

  useEffect(() => {
    setAudioFileName("");
    setPdfReviewIndex(0);
    setShowCandidateEdit(false);
    setShowGuideModal(false);
    setShowQuestionsModal(false);
    setShowTranscriptModal(false);
    setShowTranscriptInput(false);
    setTranscriptDraft("");
    setActiveGuideId("");
    setGuideAttachVersionId("");
    setResponseDrafts({});
    setSummaryDraftTextByKey({});
    setSavingSummaryKey("");
    if (summarySaveTimerRef.current) {
      window.clearTimeout(summarySaveTimerRef.current);
      summarySaveTimerRef.current = null;
    }
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setAudioSources([]);
    setActiveAudioSourceIndex(0);
    pendingAudioPlaybackRef.current = null;
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
  }, [selectedRecord?.id]);

  useEffect(() => {
    if (!selectedRecord?.id) {
      setSummaryDraftTextByKey({});
      return;
    }
    const edits = getStoredSummaryEdits(selectedRecord);
    setSummaryDraftTextByKey(Object.fromEntries(
      Object.entries(edits).map(([key, bullets]) => [key, summaryBulletsToText(bullets)]),
    ));
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
    if (!selectedGuides.length) return;
    if (!selectedGuides.some((guide) => guide.id === activeGuideId)) {
      setActiveGuideId(selectedGuides[0]?.id || "");
    }
  }, [activeGuideId, selectedGuides]);

  useEffect(() => {
    const nextDrafts = {};
    Object.values(responsesByTarget || {}).forEach((response) => {
      if (response.response_type === "custom_question" && response.question_key) {
        nextDrafts[fieldKey("custom_question", response.question_key)] = getResponseDraft(response);
      }
      if (response.response_type === "pdf_field" && response.pdf_field_name) {
        nextDrafts[fieldKey("pdf_field", response.pdf_field_name)] = getResponseDraft(response);
      }
    });
    setResponseDrafts((prev) => {
      const preservedGroupedDrafts = Object.entries(prev || {}).reduce((next, [key, value]) => {
        if (key.startsWith("pdf_group:")) next[key] = value;
        return next;
      }, {});
      const mergedDrafts = { ...nextDrafts, ...preservedGroupedDrafts };
      return draftMapsEqual(prev, mergedDrafts) ? prev : mergedDrafts;
    });
  }, [responsesByTarget]);

  useEffect(() => {
    if (!selectedPdfSourcePath) {
      setPdfPreviewUrl("");
      return;
    }
    let active = true;
    supabase.storage.from(selectedPdfSourceBucket).createSignedUrl(selectedPdfSourcePath, 60 * 30).then(({ data: signed, error }) => {
      if (!active) return;
      setPdfPreviewUrl(error ? "" : signed?.signedUrl || "");
    });
    return () => { active = false; };
  }, [selectedPdfSourceBucket, selectedPdfSourcePath]);

  useEffect(() => {
    const sourceAudio = selectedRecord?.metadata?.audio_transcription?.source_audio || {};
    const candidates = getInterviewAudioPlaybackCandidates(sourceAudio);
    if (!candidates.length) {
      setAudioSources([]);
      setActiveAudioSourceIndex(0);
      setAudioUrl("");
      return;
    }
    let active = true;
    setAudioUrl("");
    setAudioSources([]);
    setActiveAudioSourceIndex(0);
    const signFirstReadableSource = async () => {
      const signedSources = [];
      for (const candidate of candidates) {
        const { data: signed, error } = await supabase.storage.from(candidate.bucket).createSignedUrl(candidate.path, 60 * 30);
        if (!active) return;
        const signedUrl = error ? "" : signed?.signedUrl || "";
        if (signedUrl && await isSignedAudioUrlReadable(signedUrl)) {
          signedSources.push({ ...candidate, url: signedUrl });
          if (signedSources.length === 1) {
            setAudioSources([...signedSources]);
            setActiveAudioSourceIndex(0);
            setAudioUrl(signedSources[0]?.url || "");
          }
        }
      }
      if (!active) return;
      setAudioSources(signedSources);
      setActiveAudioSourceIndex((index) => Math.min(index, Math.max(0, signedSources.length - 1)));
      setAudioUrl((currentUrl) => currentUrl || signedSources[0]?.url || "");
    };
    signFirstReadableSource();
    return () => { active = false; };
  }, [selectedRecord?.metadata?.audio_transcription?.source_audio]);

  const buildCurrentPdfResponseMap = useCallback((drafts = responseDrafts) => {
    const map = buildPdfResponseMap([], selectedRecord, selectedPdfFields, { includeDrafts: true });
    Object.entries(drafts || {}).forEach(([key, value]) => {
      if (!key.startsWith("pdf_field:")) return;
      const fieldName = key.replace(/^pdf_field:/, "");
      map[fieldName] = value || "";
    });
    const overallScoreField = selectedPdfFields.find((field) => /^overall_score$/i.test(field.name || ""));
    const overallScore = computeOverallScoreFromPdfMap(map, selectedPdfFields);
    if (overallScoreField && overallScore) map[overallScoreField.name] = overallScore;
    return map;
  }, [responseDrafts, selectedPdfFields, selectedRecord]);

  const guidePreviewFieldValues = useMemo(() => buildCurrentPdfResponseMap(responseDrafts), [buildCurrentPdfResponseMap, responseDrafts]);

  const reviewedSummaryPages = useMemo(() => {
    const guideResponses = Object.values(responsesByTarget || {});
    const finalMap = buildPdfResponseMap(guideResponses, selectedRecord, selectedPdfFields, { includeDrafts: false });
    const overallScoreField = selectedPdfFields.find((field) => /^overall_score$/i.test(field.name || ""));
    const overallScore = computeOverallScoreFromPdfMap(finalMap, selectedPdfFields);
    if (overallScoreField && overallScore) finalMap[overallScoreField.name] = overallScore;
    const liveSummaryEdits = Object.keys(summaryDraftTextByKey || {}).length
      ? {
          sections: Object.entries(summaryDraftTextByKey).reduce((next, [key, text]) => {
            next[key] = summaryTextToBullets(text);
            return next;
          }, {}),
        }
      : selectedRecord;
    return buildInterviewSummaryPages({
      record: selectedRecord,
      guide: selectedGuide,
      fields: selectedPdfFields,
      questions: selectedQuestions,
      responsesByTarget,
      finalMap,
      summaryEdits: liveSummaryEdits,
    });
  }, [responsesByTarget, selectedGuide, selectedPdfFields, selectedQuestions, selectedRecord, summaryDraftTextByKey]);

  const setAutoScorePreference = (enabled) => {
    setAutoScoreCandidates(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(autoScoreStorageKey, enabled ? "true" : "false");
    }
  };

  const findAudioSourceIndexForTime = (seconds) => {
    if (!audioSources.length) return 0;
    const target = Math.max(0, Number(seconds || 0));
    let index = 0;
    audioSources.forEach((source, sourceIndex) => {
      if (Number(source.startSeconds || 0) <= target) index = sourceIndex;
    });
    return index;
  };

  const seekAudioPlayback = (seconds, options = {}) => {
    const target = Math.max(0, Number(seconds || 0));
    setAudioCurrentTime(target);
    if (!audioSources.length) {
      if (audioPlayerRef.current) audioPlayerRef.current.currentTime = target;
      return;
    }
    const nextIndex = findAudioSourceIndexForTime(target);
    const nextSource = audioSources[nextIndex] || audioSources[0];
    const nextRelativeTime = Math.max(0, target - Number(nextSource?.startSeconds || 0));
    const shouldResume = options.play ?? audioPlaying;
    if (nextIndex !== activeAudioSourceIndex) {
      pendingAudioPlaybackRef.current = { currentTime: nextRelativeTime, play: shouldResume };
      setActiveAudioSourceIndex(nextIndex);
      setAudioUrl(nextSource?.url || "");
      return;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = nextRelativeTime;
      if (shouldResume) {
        audioPlayerRef.current.play()
          .then(() => setAudioPlaying(true))
          .catch((error) => showToast(safeUiError(error, "Audio playback failed"), "error"));
      }
    }
  };

  useEffect(() => {
    const pending = pendingAudioPlaybackRef.current;
    const player = audioPlayerRef.current;
    if (!pending || !player || !audioUrl) return;
    pendingAudioPlaybackRef.current = null;
    player.currentTime = Math.max(0, Number(pending.currentTime || 0));
    if (pending.play) {
      player.play()
        .then(() => setAudioPlaying(true))
        .catch((error) => showToast(safeUiError(error, "Audio playback failed"), "error"));
    }
  }, [audioUrl, showToast]);

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

  const handleAudioPlaybackError = () => {
    setAudioPlaying(false);
    showToast("Audio file could not be loaded. Replace the audio if playback still fails.", "error");
  };

  const handleAudioTimeUpdate = (event) => {
    const offset = Number(audioSources[activeAudioSourceIndex]?.startSeconds || 0);
    setAudioCurrentTime(offset + (event.currentTarget.currentTime || 0));
  };

  const handleAudioLoadedMetadata = (event) => {
    if (audioSources.length <= 1) setAudioDuration(event.currentTarget.duration || 0);
  };

  const handleAudioEnded = () => {
    const nextIndex = activeAudioSourceIndex + 1;
    if (audioSources.length > 1 && nextIndex < audioSources.length) {
      const nextSource = audioSources[nextIndex];
      pendingAudioPlaybackRef.current = { currentTime: 0, play: true };
      setActiveAudioSourceIndex(nextIndex);
      setAudioUrl(nextSource?.url || "");
      setAudioCurrentTime(Number(nextSource?.startSeconds || 0));
      return;
    }
    setAudioPlaying(false);
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
      const { data: guide, error: guideError } = await supabase
        .from("labor_interview_record_guides")
        .insert({
          interview_id: created.id,
          location_id: locationId,
          template_id: selectedTemplate.id,
          template_version_id: selectedTemplateVersion.id,
          guide_label: selectedTemplate.role_label,
          role_key: selectedTemplate.role_key,
          role_label: selectedTemplate.role_label,
          guide_status: "draft",
          sequence_order: 10,
          template_snapshot: snapshot,
          pdf_field_manifest_snapshot: selectedTemplateVersion.pdf_field_manifest || [],
          question_snapshot: snapshot.questions || [],
          metadata: { primary: true },
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (guideError) throw guideError;
      setRecords((prev) => [created, ...prev]);
      setGuides((prev) => [guide, ...prev]);
      setSelectedRecordId(created.id);
      setActiveGuideId(guide.id);
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
    const previousRecord = selectedRecord;
    const nextMetadata = {
      ...(selectedRecord.metadata || {}),
      ...metadataPatch,
    };
    setRecords((prev) => prev.map((record) => (
      record.id === selectedRecord.id ? { ...record, metadata: nextMetadata } : record
    )));
    return saveRecordPatch({
      metadata: nextMetadata,
    }).then((updated) => {
      if (!updated) {
        setRecords((prev) => prev.map((record) => (
          record.id === previousRecord.id ? previousRecord : record
        )));
      }
      return updated;
    });
  };

  const saveSummaryDraftsToMetadata = async (draftTextByKey, activeKey = "") => {
    if (!selectedRecord?.id) return null;
    const sections = Object.entries(draftTextByKey || {}).reduce((next, [key, text]) => {
      if (!isSummarySectionKey(key)) return next;
      next[key] = summaryTextToBullets(text);
      return next;
    }, {});
    setSavingSummaryKey(activeKey);
    try {
      return await saveRecordMetadataPatch({
        interview_summary_edits: {
          sections,
          updated_at: new Date().toISOString(),
          updated_by: actorName,
        },
      });
    } finally {
      setSavingSummaryKey("");
    }
  };

  const setSummarySectionDraft = (sectionKey, value) => {
    if (!sectionKey) return;
    setSummaryDraftTextByKey((prev) => {
      const next = { ...(prev || {}), [sectionKey]: value };
      if (summarySaveTimerRef.current) window.clearTimeout(summarySaveTimerRef.current);
      summarySaveTimerRef.current = window.setTimeout(() => {
        summarySaveTimerRef.current = null;
        saveSummaryDraftsToMetadata(next, sectionKey);
      }, 650);
      return next;
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

  const saveResponse = async ({ responseType, key, prompt, value, metadataPatch = null, responseState = null }) => {
    if (!selectedRecord?.id || !key) return;
    const targetKey = fieldKey(responseType, key);
    const existing = responsesByTarget[targetKey];
    const nextState = responseState || (String(value || "").trim() ? "manual" : "blank");
    setSavingResponseKey(targetKey);
    try {
      if (existing?.id) {
        const { data: updated, error } = await supabase
          .from("labor_interview_responses")
          .update({
            response_text: value || null,
            prompt_snapshot: prompt,
            interview_guide_id: selectedGuide?.id || null,
            response_state: nextState,
            metadata: metadataPatch ? { ...(existing.metadata || {}), ...metadataPatch } : existing.metadata,
            reviewed_at: nextState === "ai_approved" || nextState === "manual" ? new Date().toISOString() : existing.reviewed_at,
            reviewed_by_user_id: nextState === "ai_approved" || nextState === "manual" ? actorUserId : existing.reviewed_by_user_id,
            reviewed_by_name: nextState === "ai_approved" || nextState === "manual" ? actorName : existing.reviewed_by_name,
            rejected_at: nextState === "rejected" ? new Date().toISOString() : existing.rejected_at,
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
          interview_guide_id: selectedGuide?.id || null,
          response_type: responseType,
          question_key: responseType === "custom_question" ? key : null,
          pdf_field_name: responseType === "pdf_field" ? key : null,
          prompt_snapshot: prompt,
          response_text: value || null,
          response_state: nextState,
          metadata: metadataPatch || {},
          reviewed_at: nextState === "ai_approved" || nextState === "manual" ? new Date().toISOString() : null,
          reviewed_by_user_id: nextState === "ai_approved" || nextState === "manual" ? actorUserId : null,
          reviewed_by_name: nextState === "ai_approved" || nextState === "manual" ? actorName : null,
          rejected_at: nextState === "rejected" ? new Date().toISOString() : null,
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
    const {
      requireLocalTranscript = true,
      quietStart = false,
      targetPdfFieldName = "",
      pdfPopulationInstruction = "",
      documentPdfInstruction = "",
      pdfOnly = false,
      customOnly = false,
      reviewModeOverride = "",
    } = options;
    const draftReviewMode = normalizeAiReviewMode(reviewModeOverride || aiReviewMode);
    if (!interviewId) return null;
    if (requireLocalTranscript && !String(selectedRecord?.transcript_text || "").trim()) {
      showToast("Upload interview audio or a transcript first.", "error");
      return null;
    }
    setAiDrafting(true);
    try {
      const pdfPopulationInstructions = targetPdfFieldName
        ? { [targetPdfFieldName]: pdfPopulationInstruction }
        : documentPdfInstruction
          ? { [DOCUMENT_PDF_INSTRUCTION_KEY]: documentPdfInstruction }
        : undefined;
      const { data: startResult, error: startError } = await supabase.functions.invoke("interview-ai-draft", {
        body: {
          interview_id: interviewId,
          interview_guide_id: selectedGuide?.id || undefined,
          action: "start",
          auto_score_candidate: autoScoreCandidates,
          review_mode: draftReviewMode,
          target_pdf_field_name: targetPdfFieldName || undefined,
          pdf_population_instructions: pdfPopulationInstructions,
          pdf_only: pdfOnly || !!documentPdfInstruction || undefined,
          custom_only: customOnly || undefined,
        },
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
            body: {
              interview_id: interviewId,
              interview_guide_id: selectedGuide?.id || undefined,
              action: "poll",
              request_id: requestId,
              review_mode: draftReviewMode,
              custom_only: customOnly || undefined,
            },
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

      const populatedCount = Number(result?.populated_count ?? result?.saved_count ?? 0);
      showToast(targetPdfFieldName
        ? "AI updated field"
        : documentPdfInstruction
          ? `AI wrote guide text into ${populatedCount} field${populatedCount === 1 ? "" : "s"}`
          : `AI populated ${result?.saved_count || 0} response${result?.saved_count === 1 ? "" : "s"}`);
      await loadAll(locationId);
      await loadInterviewDetail(interviewId);
      setSelectedRecordId(interviewId);
      return result;
    } catch (error) {
      showToast(safeUiError(error, "AI draft failed"), "error");
      return null;
    } finally {
      setAiDrafting(false);
    }
  };

  const draftTranscriptSummary = async (interviewId = selectedRecord?.id, options = {}) => {
    const { quiet = true } = options;
    if (!interviewId || !String(selectedRecord?.transcript_text || "").trim()) return null;
    setSummaryDrafting(true);
    try {
      const { data: startResult, error: startError } = await supabase.functions.invoke("interview-ai-draft", {
        body: {
          interview_id: interviewId,
          interview_guide_id: selectedGuide?.id || undefined,
          action: "start",
          summary_only: true,
          review_mode: normalizeAiReviewMode(aiReviewMode),
        },
      });
      if (startError) throw new Error(await readEdgeFunctionError(startError, "AI summary failed"));

      let result = startResult;
      if (startResult?.pending) {
        const requestId = startResult.request_id;
        let completed = false;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await sleep(attempt === 0 ? 3000 : 6000);
          const { data: pollResult, error: pollError } = await supabase.functions.invoke("interview-ai-draft", {
            body: {
              interview_id: interviewId,
              interview_guide_id: selectedGuide?.id || undefined,
              action: "poll",
              request_id: requestId,
              summary_only: true,
              review_mode: normalizeAiReviewMode(aiReviewMode),
            },
          });
          if (pollError) throw new Error(await readEdgeFunctionError(pollError, "AI summary failed"));
          result = pollResult;
          if (!pollResult?.pending) {
            completed = true;
            break;
          }
        }
        if (!completed) throw new Error("AI summary is still drafting. Reopen this guide in a minute to resume.");
      }

      await loadAll(locationId);
      await loadInterviewDetail(interviewId);
      setSelectedRecordId(interviewId);
      if (!quiet && Number(result?.transcript_summary_count || 0) > 0) showToast("Call summary updated");
      return result;
    } catch (error) {
      summaryRequestRef.current.delete(interviewId);
      if (!quiet) showToast(safeUiError(error, "AI summary failed"), "error");
      return null;
    } finally {
      setSummaryDrafting(false);
    }
  };

  useEffect(() => {
    if (!showGuideModal || !selectedRecord?.id || !String(selectedRecord?.transcript_text || "").trim()) return;
    if (hasStoredTranscriptSummary || summaryDrafting) return;
    if (summaryRequestRef.current.has(selectedRecord.id)) return;
    summaryRequestRef.current.add(selectedRecord.id);
    draftTranscriptSummary(selectedRecord.id, { quiet: true });
  }, [showGuideModal, selectedRecord?.id, selectedRecord?.transcript_text, hasStoredTranscriptSummary, summaryDrafting]);

  const fillPdfDocumentWithAiInstruction = async (instruction) => {
    if (!selectedRecord?.id || !String(instruction || "").trim()) return null;
    const result = await draftInterview(selectedRecord.id, {
      requireLocalTranscript: true,
      quietStart: true,
      documentPdfInstruction: instruction,
      pdfOnly: true,
    });
    return result;
  };

  const changeAiReviewMode = async (nextValue) => {
    const nextMode = normalizeAiReviewMode(nextValue);
    if (nextMode === aiReviewMode && selectedRecord?.metadata?.ai_review_mode === nextMode) return;
    setAiReviewMode(nextMode);
    await saveRecordMetadataPatch({ ai_review_mode: nextMode });
    const label = INTERVIEW_AI_REVIEW_MODE_LABELS[nextMode] || "AI";
    if (!selectedRecord?.id) return;
    if (!String(selectedRecord?.transcript_text || "").trim()) {
      showToast(`${label} mode selected. Upload interview audio or a transcript before drafting.`, "error");
      return;
    }
    showToast(`${label} mode selected. Redrafting this guide from the transcript.`);
    await draftInterview(selectedRecord.id, {
      reviewModeOverride: nextMode,
      documentPdfInstruction: reviewModeDraftInstruction(nextMode, label),
      pdfOnly: true,
      quietStart: false,
    });
  };

  const waitForInterviewTranscript = async (interviewId) => {
    let latest = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await sleep(attempt === 0 ? 3000 : 5000);
      const { data, error } = await supabase
        .from("labor_interview_records")
        .select("*")
        .eq("id", interviewId)
        .single();
      if (error) throw error;
      latest = data;
      setRecords((prev) => prev.map((record) => record.id === data.id ? data : record));

      if (data?.transcript_status === "failed") {
        const message = data?.metadata?.audio_transcription_error?.message || "AI could not transcribe this audio.";
        throw new Error(message);
      }
      if (data?.transcript_status === "ready" && String(data?.transcript_text || "").trim()) {
        return data;
      }
    }
    throw new Error(latest?.transcript_status === "transcribing"
      ? "Audio is still transcribing. Refresh this interview in a few minutes."
      : "Timed out waiting for interview transcription.");
  };

  const transcribeInterviewAudioChunks = async ({ interviewId, chunks, originalAudio }) => {
    const safeChunks = Array.isArray(chunks) ? chunks.filter((chunk) => chunk?.audio_file_path) : [];
    if (!safeChunks.length) return null;
    const startedAt = new Date().toISOString();
    const chunkResults = [];
    for (let index = 0; index < safeChunks.length; index += 1) {
      const chunk = safeChunks[index];
      showToast(`Transcribing audio ${index + 1}/${safeChunks.length}`);
      const { data, error } = await supabase.functions.invoke("interview-transcribe-audio", {
        body: {
          interview_id: interviewId,
          audio_file_bucket: chunk.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
          audio_file_path: chunk.audio_file_path,
          audio_file_name: chunk.audio_file_name,
          audio_mime_type: chunk.audio_mime_type || "audio/mpeg",
          audio_normalized_for_stt: true,
          original_audio_file_name: originalAudio?.original_audio_file_name,
          original_audio_mime_type: originalAudio?.original_audio_mime_type,
          original_audio_size_bytes: originalAudio?.original_audio_size_bytes,
          save_transcript: false,
        },
      });
      if (error) throw new Error(await readEdgeFunctionError(error, "Failed to transcribe audio"));
      if (!data?.transcript_text) throw new Error(`AI returned no transcript text for audio ${index + 1}.`);
      chunkResults.push({ ...data, chunk });
    }

    const transcriptText = chunkResults
      .map((result) => String(result.transcript_text || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (!transcriptText) throw new Error("AI returned no transcript text.");

    const generatedAt = new Date().toISOString();
    const transcriptTurns = chunkResults.flatMap((result, resultIndex) => {
      const offset = Number(result.chunk?.start_seconds || 0) || 0;
      return (Array.isArray(result.transcript_turns) ? result.transcript_turns : []).map((turn, turnIndex) => ({
        ...turn,
        id: `chunk-${resultIndex + 1}-${turn.id || turnIndex + 1}`,
        start: Number.isFinite(Number(turn.start)) ? Number(turn.start) + offset : null,
        end: Number.isFinite(Number(turn.end)) ? Number(turn.end) + offset : null,
        chunk_index: resultIndex,
      }));
    });
    const wordCount = chunkResults.reduce((sum, result) => sum + (Number(result.word_count) || 0), 0) || null;
    const durationSeconds = chunkResults.reduce((sum, result) => sum + (Number(result.duration_seconds) || 0), 0) || null;
    const updated = await saveRecordPatch({
      transcript_text: transcriptText,
      transcript_status: "ready",
      transcript_source: "audio",
      transcript_uploaded_at: generatedAt,
      status: selectedRecord?.status === "draft" ? "in_progress" : selectedRecord?.status,
      metadata: {
        ...(selectedRecord?.metadata || {}),
        audio_transcription: {
          provider: "xai",
          model: chunkResults[0]?.model || "grok-stt",
          generated_at: generatedAt,
          started_at: startedAt,
          language: chunkResults.find((result) => result.language)?.language || null,
          duration_seconds: durationSeconds,
          word_count: wordCount,
          diarization_enabled: true,
          segmentation_source: chunkResults[0]?.segmentation_source || "provider",
          transcript_turns: transcriptTurns,
          chunk_count: safeChunks.length,
          source_audio: {
            bucket: originalAudio?.original_audio_file_bucket || originalAudio?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
            path: originalAudio?.original_audio_file_path || originalAudio?.audio_file_path || safeChunks[0]?.audio_file_path,
            file_name: originalAudio?.original_audio_file_name || originalAudio?.audio_file_name || safeChunks[0]?.audio_file_name,
            mime_type: originalAudio?.original_audio_mime_type || originalAudio?.audio_mime_type || safeChunks[0]?.audio_mime_type || "audio/mpeg",
            size_bytes: safeChunks.reduce((sum, chunk) => sum + (Number(chunk.audio_size_bytes) || 0), 0) || null,
            original_bucket: originalAudio?.original_audio_file_bucket || originalAudio?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
            original_path: originalAudio?.original_audio_file_path || null,
            original_file_name: originalAudio?.original_audio_file_name || originalAudio?.audio_file_name,
            original_mime_type: originalAudio?.original_audio_mime_type || null,
            original_size_bytes: originalAudio?.original_audio_size_bytes || null,
            normalized_for_stt: !originalAudio?.original_audio_file_path,
            chunks: safeChunks.map((chunk) => ({
              bucket: chunk.audio_file_bucket || originalAudio?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
              path: chunk.audio_file_path,
              file_name: chunk.audio_file_name,
              size_bytes: chunk.audio_size_bytes || null,
              start_seconds: chunk.start_seconds || null,
            })),
          },
        },
      },
    });
    return updated;
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
      const requiresServerNormalization = shouldNormalizeInterviewAudioForStt(file);
      if (requiresServerNormalization) {
        showToast("Uploading Voice Memos audio for server conversion");
      }
      const path = buildInterviewAudioPath({ locationId, interviewId: selectedRecord.id, fileName: file.name });
      const contentType = validation.contentType || getInterviewAudioContentType(file);
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(path, file, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      setAudioFileName(file.name);

      let transcriptionPayload = {
        interview_id: selectedRecord.id,
        audio_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
        audio_file_path: path,
        audio_file_name: file.name,
        audio_mime_type: contentType,
        audio_normalized_for_stt: false,
        original_audio_file_name: file.name || "interview-audio",
        original_audio_mime_type: contentType,
        original_audio_size_bytes: Number(file.size || 0) || null,
      };

      if (requiresServerNormalization) {
        showToast("Converting Voice Memos audio for transcription");
        const normalizedAudio = await normalizeInterviewAudioForSttOnServer(transcriptionPayload);
        transcriptionPayload = {
          interview_id: selectedRecord.id,
          audio_file_bucket: normalizedAudio.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
          audio_file_path: normalizedAudio.audio_file_path,
          audio_file_name: normalizedAudio.audio_file_name,
          audio_mime_type: normalizedAudio.audio_mime_type,
          audio_normalized_for_stt: true,
          original_audio_file_name: normalizedAudio.original_audio_file_name || file.name,
          original_audio_mime_type: normalizedAudio.original_audio_mime_type || contentType,
          original_audio_size_bytes: normalizedAudio.original_audio_size_bytes || Number(file.size || 0) || null,
        };
        if (Array.isArray(normalizedAudio.audio_chunks) && normalizedAudio.audio_chunks.length > 1) {
          const transcriptRecord = await transcribeInterviewAudioChunks({
            interviewId: selectedRecord.id,
            chunks: normalizedAudio.audio_chunks,
            originalAudio: {
              ...normalizedAudio,
              original_audio_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
              original_audio_file_path: path,
              original_audio_file_name: normalizedAudio.original_audio_file_name || file.name,
              original_audio_mime_type: normalizedAudio.original_audio_mime_type || contentType,
              original_audio_size_bytes: normalizedAudio.original_audio_size_bytes || Number(file.size || 0) || null,
            },
          });
          if (!transcriptRecord?.transcript_text) throw new Error("AI returned no transcript text.");
          const durationSeconds = Number(transcriptRecord?.metadata?.audio_transcription?.duration_seconds || 0);
          const minutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null;
          showToast(minutes ? `Audio processed: ${minutes} min. Transcript ready.` : "Audio processed. Transcript ready.");
          await loadAll(locationId);
          setSelectedRecordId(selectedRecord.id);
          return;
        }
        showToast("Audio converted. Sending for transcription.");
      }

      const { data: result, error } = await supabase.functions.invoke("interview-transcribe-audio", {
        body: {
          ...transcriptionPayload,
          async: true,
        },
      });
      if (error) throw new Error(await readEdgeFunctionError(error, "Failed to transcribe audio"));
      const transcriptRecord = result?.transcript_text
        ? null
        : await waitForInterviewTranscript(selectedRecord.id);
      if (!result?.transcript_text && !transcriptRecord?.transcript_text) {
        throw new Error("AI returned no transcript text.");
      }

      const durationSeconds = Number(result?.duration_seconds || transcriptRecord?.metadata?.audio_transcription?.duration_seconds || 0);
      const minutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null;
      showToast(minutes ? `Audio processed: ${minutes} min. Transcript ready.` : "Audio processed. Transcript ready.");
      await loadAll(locationId);
      setSelectedRecordId(selectedRecord.id);
    } catch (error) {
      showToast(safeUiError(error, "Failed to process audio"), "error");
    } finally {
      setAudioTranscribing(false);
    }
  };

  const saveTranscriptText = async ({ text, fileName = "interview-transcript.txt", source = "upload" }) => {
    if (!selectedRecord?.id) return null;
    const cleaned = cleanInterviewTranscriptText(text);
    if (!cleaned) {
      showToast("Transcript text is empty.", "error");
      return null;
    }
    setSavingTranscript(true);
    try {
      const uploadedAt = new Date().toISOString();
      const transcriptPath = buildInterviewTranscriptPath({ locationId, interviewId: selectedRecord.id, fileName });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(transcriptPath, new Blob([cleaned], { type: "text/plain" }), { upsert: true, contentType: "text/plain" });
      if (uploadError) throw uploadError;
      const updated = await saveRecordPatch({
        transcript_text: cleaned,
        transcript_status: "ready",
        transcript_source: source,
        transcript_uploaded_at: uploadedAt,
        transcript_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
        transcript_file_path: transcriptPath,
        status: selectedRecord.status === "draft" ? "in_progress" : selectedRecord.status,
        metadata: {
          ...(selectedRecord.metadata || {}),
          transcript_upload: {
            source,
            uploaded_at: uploadedAt,
            file_name: fileName,
            storage_path: transcriptPath,
            character_count: cleaned.length,
          },
        },
      });
      if (updated) {
        setShowTranscriptInput(false);
        setTranscriptDraft("");
        showToast("Transcript ready for AI drafting");
      }
      return updated;
    } catch (error) {
      showToast(safeUiError(error, "Failed to save transcript"), "error");
      return null;
    } finally {
      setSavingTranscript(false);
    }
  };

  const handleTranscriptUpload = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      await saveTranscriptText({ text, fileName: file.name || "interview-transcript.txt", source: "upload" });
    } catch (error) {
      showToast(safeUiError(error, "Failed to read transcript file"), "error");
    }
  };

  const savePastedTranscript = async () => {
    await saveTranscriptText({ text: transcriptDraft, fileName: "pasted-interview-transcript.txt", source: "paste" });
  };

  const exportFinalPdf = async () => {
    const path = selectedSnapshot?.version?.source_pdf_path;
    const bucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!selectedRecord?.id || !path) return;
    const guideResponses = Object.values(responsesByTarget || {});
    const unreviewedDraftCount = guideResponses.filter((response) => {
      const state = getInterviewResponseState(response);
      return (state === "ai_draft" || state === "merged_draft") && !isInterviewResponseReviewed(response);
    }).length;
    if (unreviewedDraftCount > 0 && !window.confirm(`This guide has ${unreviewedDraftCount} unreviewed AI draft${unreviewedDraftCount === 1 ? "" : "s"}. Final PDF will include reviewed/manual content only. Continue?`)) {
      return;
    }
    setExportingPdf(true);
    try {
      const { data: sourceBlob, error: downloadError } = await supabase.storage.from(bucket).download(path);
      if (downloadError) throw downloadError;
      const bytes = await sourceBlob.arrayBuffer();
      const finalMap = buildPdfResponseMap(guideResponses, selectedRecord, selectedPdfFields, { includeDrafts: false });
      const overallScoreField = selectedPdfFields.find((field) => /^overall_score$/i.test(field.name || ""));
      const overallScore = computeOverallScoreFromPdfMap(finalMap, selectedPdfFields);
      if (overallScoreField && overallScore) finalMap[overallScoreField.name] = overallScore;
      const summaryPages = buildInterviewSummaryPages({
        record: selectedRecord,
        guide: selectedGuide,
        fields: selectedPdfFields,
        questions: selectedQuestions,
        responsesByTarget,
        finalMap,
        summaryEdits: Object.keys(summaryDraftTextByKey || {}).length
          ? {
              sections: Object.entries(summaryDraftTextByKey).reduce((next, [key, text]) => {
                next[key] = summaryTextToBullets(text);
                return next;
              }, {}),
            }
          : selectedRecord,
      });
      const exportFinalMap = buildExportPdfFieldMap(finalMap, selectedPdfFields);
      const filledBytes = await fillInterviewPdfBytes(bytes, exportFinalMap, { flatten: true, summaryPages });
      const sourcePageCount = Number(selectedSnapshot?.version?.pdf_page_count || 0) || (await countInterviewPdfPages(bytes).catch(() => 0));
      const finalPageCount = await countInterviewPdfPages(filledBytes).catch(() => sourcePageCount);
      const summaryPageCount = Math.max(0, finalPageCount - sourcePageCount);
      const guideSlug = (selectedGuide?.guide_label || selectedGuide?.role_label || selectedRecord.candidate_position || "interview").replace(/[^a-z0-9]+/gi, "-");
      const outputName = `${selectedRecord.candidate_full_name.replace(/[^a-z0-9]+/gi, "-") || "candidate"}-${guideSlug}-interview.pdf`;
      const artifactPath = buildInterviewArtifactPath({ locationId, interviewId: selectedRecord.id, fileName: outputName });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(artifactPath, new Blob([filledBytes], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      const { data: artifact, error: artifactError } = await supabase
        .from("labor_interview_artifacts")
        .insert({
          interview_id: selectedRecord.id,
          interview_guide_id: selectedGuide?.id || null,
          artifact_type: "final_pdf",
          file_name: outputName,
          storage_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          storage_path: artifactPath,
          mime_type: "application/pdf",
          metadata: {
            guide_label: selectedGuide?.guide_label || selectedGuide?.role_label || null,
            reviewed_only: true,
            excluded_unreviewed_drafts: unreviewedDraftCount,
            summary_page_count: summaryPageCount,
          },
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        })
        .select("*")
        .single();
      if (artifactError) throw artifactError;
      setArtifacts((prev) => [artifact, ...prev]);
      await saveRecordPatch({ status: "completed" });
      const { data: signed } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .createSignedUrl(artifactPath, 60 * 5, { download: outputName });
      if (signed?.signedUrl && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = signed.signedUrl;
        link.download = outputName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      showToast("Final PDF exported");
    } catch (error) {
      showToast(safeUiError(error, "Failed to export PDF"), "error");
    } finally {
      setExportingPdf(false);
    }
  };

  const downloadArtifact = async (artifact) => {
    if (!artifact?.storage_path) return;
    try {
      const { data: signed, error } = await supabase.storage
        .from(artifact.storage_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .createSignedUrl(artifact.storage_path, 60 * 5, { download: artifact.file_name || "interview.pdf" });
      if (error) throw error;
      if (signed?.signedUrl && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = signed.signedUrl;
        link.download = artifact.file_name || "interview.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error) {
      showToast(safeUiError(error, "Failed to download PDF"), "error");
    }
  };

  const getPdfFieldValue = (field) => {
    const key = responseKeyForPdfField(field);
    const metadataValue = buildPdfResponseMap([], selectedRecord, [field])[field.name] || "";
    if (Object.prototype.hasOwnProperty.call(responseDrafts, key)) return responseDrafts[key] ?? "";
    return metadataValue;
  };

  const setPdfFieldDraft = (field, value, options = null) => {
    const key = responseKeyForPdfField(field);
    setResponseDrafts((prev) => ({
      ...prev,
      ...(options?.aggregateKey ? { [options.aggregateKey]: options.aggregateValue || "" } : {}),
      [key]: value,
    }));
    if (pdfSaveTimersRef.current[key]) clearTimeout(pdfSaveTimersRef.current[key]);
    pdfSaveTimersRef.current[key] = setTimeout(() => {
      savePdfFieldResponse(field, value);
    }, 650);
  };

  const setQuestionResponseDraft = (question, value) => {
    const key = responseKeyForQuestion(question);
    setResponseDrafts((prev) => ({ ...prev, [key]: value }));
    if (questionSaveTimersRef.current[key]) clearTimeout(questionSaveTimersRef.current[key]);
    questionSaveTimersRef.current[key] = setTimeout(() => {
      saveCustomQuestionResponse(question, value);
    }, 650);
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
    responseState: "ai_approved",
    metadataPatch: {
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: actorName,
    },
  });

  const rejectPdfField = (field) => saveResponse({
    responseType: "pdf_field",
    key: field.name,
    prompt: field.name,
    value: "",
    responseState: "rejected",
    metadataPatch: {
      approved: false,
      rejected_at: new Date().toISOString(),
      rejected_by: actorName,
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
    responseState: "ai_approved",
    metadataPatch: {
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: actorName,
    },
  });

  const rejectCustomQuestion = (question) => saveResponse({
    responseType: "custom_question",
    key: question.question_key,
    prompt: question.prompt,
    value: "",
    responseState: "rejected",
    metadataPatch: {
      approved: false,
      rejected_at: new Date().toISOString(),
      rejected_by: actorName,
    },
  });

  const uploadTemplatePdf = async (version, file) => {
    if (!version || !file || version.status !== "draft") return;
    setTemplateActionId(version.id);
    try {
      const bytes = await file.arrayBuffer();
      const verification = await extractPdfFieldManifest(bytes);
      let questionPrompts = {};
      try {
        questionPrompts = await extractPdfQuestionPromptMap(bytes);
      } catch (_) {
        questionPrompts = {};
      }
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
            ...(Object.keys(questionPrompts).length ? { pdf_question_prompts: questionPrompts } : {}),
            pdf_question_count: Object.keys(questionPrompts).length,
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

  const attachGuideToInterview = async () => {
    if (!selectedRecord?.id || !guideAttachVersionId) return;
    const version = publishedVersions.find((row) => row.id === guideAttachVersionId);
    const template = templates.find((row) => row.id === version?.template_id);
    if (!version || !template) {
      showToast("Choose a published guide to attach.", "error");
      return;
    }
    if (selectedGuides.some((guide) => guide.template_version_id === version.id)) {
      showToast("That guide is already attached to this interview.", "error");
      return;
    }
    const versionQuestions = questionsByVersion[version.id] || [];
    const snapshot = buildInterviewTemplateSnapshot({ template, version, questions: versionQuestions });
    const nextSequence = Math.max(0, ...selectedGuides.map((guide) => Number(guide.sequence_order || 0))) + 10;
    setRecordSaving(true);
    try {
      const { data: guide, error } = await supabase
        .from("labor_interview_record_guides")
        .insert({
          interview_id: selectedRecord.id,
          location_id: locationId,
          template_id: template.id,
          template_version_id: version.id,
          guide_label: template.role_label,
          role_key: template.role_key,
          role_label: template.role_label,
          guide_status: "draft",
          sequence_order: nextSequence,
          template_snapshot: snapshot,
          pdf_field_manifest_snapshot: version.pdf_field_manifest || [],
          question_snapshot: snapshot.questions || [],
          metadata: { attached_from_interview: true },
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      setGuides((prev) => [...prev, guide]);
      setActiveGuideId(guide.id);
      setGuideAttachVersionId("");
      showToast(`${template.role_label} guide attached`);
    } catch (error) {
      showToast(safeUiError(error, "Failed to attach guide"), "error");
    } finally {
      setRecordSaving(false);
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

  const attachGuideOptions = useMemo(() => {
    const attached = new Set(selectedGuides.map((guide) => guide.template_version_id));
    return templateOptions.filter((option) => !attached.has(option.value));
  }, [selectedGuides, templateOptions]);

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
      {!inInterviewDetail && !embedded && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "inline-flex", border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {[
              { id: "records", label: "Interviews" },
              { id: "config", label: "Configuration" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => changeView(item.id)}
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
        <InterviewRoster records={records} onOpen={setSelectedRecordId} onAdd={() => setShowNewInterview(true)} canAdd={templateOptions.length > 0} />
      )}

      {view === "records" && selectedRecord && (
        <div style={{ display: "grid", gap: 16, animation: "interviewPanelEnter 260ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
          <CandidateHeader
            record={selectedRecord}
            recommendation={getInterviewRecommendation(selectedRecord)}
            onRecommendationChange={(value) => saveRecordMetadataPatch({ hiring_recommendation: value })}
            onEdit={() => setShowCandidateEdit(true)}
            onDelete={deleteSelectedInterview}
            onBack={() => setSelectedRecordId("")}
            saving={recordSaving}
          />

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 14, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 950, color: C.text }}>Attached Guides</div>
                <div style={{ marginTop: 4, color: C.textMut, fontSize: 12 }}>One transcript can fill multiple role guides for this candidate.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) auto", gap: 8, alignItems: "center" }}>
                <CustomSelect
                  value={guideAttachVersionId}
                  onChange={setGuideAttachVersionId}
                  options={attachGuideOptions}
                  placeholder={attachGuideOptions.length ? "Attach another guide" : "All guides attached"}
                />
                <Btn variant="secondary" size="sm" onClick={attachGuideToInterview} disabled={!guideAttachVersionId || recordSaving}>Attach</Btn>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedGuides.map((guide) => {
                const active = guide === selectedGuide || guide.id === selectedGuide?.id;
                const guideResponses = responses.filter((response) => (guide.id ? response.interview_guide_id === guide.id : !response.interview_guide_id));
                const approved = guideResponses.filter(isInterviewResponseReviewed).length;
                const drafts = guideResponses.filter((response) => getInterviewResponseState(response) === "ai_draft" || getInterviewResponseState(response) === "merged_draft").length;
                return (
                  <button
                    type="button"
                    key={guide.id || "legacy-guide"}
                    onClick={() => setActiveGuideId(guide.id || "")}
                    style={{
                      border: `1px solid ${active ? C.pri : C.border}`,
                      background: active ? "#ecfdf5" : "#fff",
                      color: active ? C.pri : C.textSec,
                      borderRadius: 8,
                      padding: "9px 11px",
                      fontFamily: "inherit",
                      cursor: "pointer",
                      minWidth: 170,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 950, color: active ? C.pri : C.text }}>{guide.guide_label || guide.role_label}</div>
                    <div style={{ marginTop: 3, fontSize: 11, color: C.textMut }}>{approved} approved / {drafts} draft</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
              <CustomSelect
                value={aiReviewMode}
                onChange={changeAiReviewMode}
                options={INTERVIEW_AI_REVIEW_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
                placeholder="AI strictness"
                disabled={aiDrafting || recordSaving}
              />
              <div style={{ color: C.textMut, fontSize: 12, lineHeight: 1.45 }}>
                {aiDrafting ? "AI is drafting responses with the selected strictness." : INTERVIEW_AI_REVIEW_MODES.find((mode) => mode.value === aiReviewMode)?.description}
              </div>
            </div>
          </div>

          <AudioUploadPanel
            record={selectedRecord}
            audioFileName={audioFileName}
            transcribing={audioTranscribing}
            drafting={aiDrafting}
            onUpload={handleAudioUpload}
            onTranscriptUpload={handleTranscriptUpload}
            onTranscriptPasteOpen={() => {
              setTranscriptDraft(selectedRecord.transcript_text || "");
              setShowTranscriptInput(true);
            }}
            onTranscriptClick={() => setShowTranscriptModal(true)}
            inputRef={audioInputRef}
            transcriptInputRef={transcriptInputRef}
            audioRef={audioPlayerRef}
            audioUrl={audioUrl}
            audioPlaying={audioPlaying}
            currentTime={audioCurrentTime}
            audioDuration={audioDuration}
            transcriptTurns={selectedTranscriptTurns}
            onPlayToggle={toggleAudioPlayback}
            onAudioSeek={seekAudioPlayback}
            onAudioTimeUpdate={handleAudioTimeUpdate}
            onAudioLoadedMetadata={handleAudioLoadedMetadata}
            onAudioEnded={handleAudioEnded}
            onAudioError={handleAudioPlaybackError}
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
            </div>
            <Inp label="Zoom Recording Link" value={candidateEditDraft.zoom_recording_url} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, zoom_recording_url: value }))} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setShowCandidateEdit(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveCandidateEdit} disabled={recordSaving}>{recordSaving ? "Saving..." : "Save Details"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showTranscriptInput && selectedRecord && (
        <Modal title="Paste Interview Transcript" onClose={() => setShowTranscriptInput(false)} wide>
          <div style={{ display: "grid", gap: 12 }}>
            <textarea
              value={transcriptDraft}
              onChange={(event) => setTranscriptDraft(event.target.value)}
              placeholder="Paste the full interview transcript here"
              rows={16}
              style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 13, fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, color: C.text, resize: "vertical", outline: "none" }}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ color: C.textMut, fontSize: 12 }}>{cleanInterviewTranscriptText(transcriptDraft).length.toLocaleString()} characters</span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <Btn variant="secondary" onClick={() => setShowTranscriptInput(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={savePastedTranscript} disabled={savingTranscript || !cleanInterviewTranscriptText(transcriptDraft)}>{savingTranscript ? "Saving..." : "Save Transcript"}</Btn>
              </div>
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
        <TranscriptModal
          turns={selectedTranscriptTurns}
          currentTime={audioCurrentTime}
          segmentationSource={selectedRecord?.metadata?.audio_transcription?.segmentation_source || ""}
          onClose={() => setShowTranscriptModal(false)}
        />
      )}

      {showGuideModal && selectedRecord && (
        <ReviewGuideModal
          record={selectedRecord}
          fields={selectedPdfFields}
          artifacts={artifacts.filter((artifact) => !selectedGuide?.id || !artifact.interview_guide_id || artifact.interview_guide_id === selectedGuide.id)}
          pdfUrl={pdfPreviewUrl}
          loadingPdf={!!selectedSnapshot?.version?.source_pdf_path && !pdfPreviewUrl}
          responsesByTarget={responsesByTarget}
          responseDrafts={responseDrafts}
          pdfFieldValues={guidePreviewFieldValues}
          summaryPages={reviewedSummaryPages}
          summaryDraftTextByKey={summaryDraftTextByKey}
          summarySavingKey={savingSummaryKey}
          savingKey={savingResponseKey}
          exporting={exportingPdf}
          activeIndex={pdfReviewIndex}
          setActiveIndex={setPdfReviewIndex}
          getFieldValue={getPdfFieldValue}
          setFieldDraft={setPdfFieldDraft}
          onSummarySectionChange={setSummarySectionDraft}
          approveField={approvePdfField}
          rejectField={rejectPdfField}
          aiDrafting={aiDrafting}
          onAiFillDocument={fillPdfDocumentWithAiInstruction}
          exportFinalPdf={exportFinalPdf}
          downloadArtifact={downloadArtifact}
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
          setQuestionDraft={setQuestionResponseDraft}
          approveQuestion={approveCustomQuestion}
          rejectQuestion={rejectCustomQuestion}
          onAiDraftQuestions={() => draftInterview(selectedRecord.id, { customOnly: true })}
          onClose={() => setShowQuestionsModal(false)}
        />
      )}
    </div>
  );
}

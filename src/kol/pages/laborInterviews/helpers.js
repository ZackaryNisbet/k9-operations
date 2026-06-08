// Pure helpers for the Labor Interviews workspace.
// Extracted verbatim from LaborInterviewsPage.jsx (no behavior changes).
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { supabase } from "../../../supabaseClient";
import { fmtDate, todayStr } from "../../../shared/theme";
import {
  getInterviewDraftResponseText,
  getInterviewOfficialResponseText,
  getInterviewPdfFieldDisplayRect,
  normalizeInterviewPayRates,
  sanitizeInterviewFileName,
  INTERVIEW_AI_REVIEW_MODES,
  LABOR_INTERVIEW_DOCUMENT_BUCKET,
} from "../../interviewData";
import {
  CUSTOM_SUMMARY_SECTION_PREFIX,
  INTERVIEW_WAVEFORM_BAR_COUNT,
  INTERVIEW_WAVEFORM_DECODE_MAX_BYTES,
  INTERVIEW_WAVEFORM_DECODE_MAX_SECONDS,
  PDF_POINT_TO_CSS_PX,
  SUMMARY_SECTION_KEYS,
} from "./constants";

export function defaultInterviewDate() {
  try {
    return todayStr();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function buildNewInterviewDraft() {
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

export function buildNewPositionDraft() {
  return {
    role_label: "",
    description: "",
    pay_rate_min: "",
    pay_rate_max: "",
    pay_rate_notes: "",
  };
}

export function payRatesFromVersion(version = {}) {
  return normalizeInterviewPayRates(version?.metadata?.pay_rates || {});
}

export function buildPayRateMetadata(version = {}, payRates = {}, actorName = "") {
  const normalized = normalizeInterviewPayRates(payRates);
  const hasValue = normalized.min_rate || normalized.max_rate || normalized.notes;
  const metadata = { ...(version?.metadata || {}) };
  if (hasValue) {
    metadata.pay_rates = normalized;
    metadata.pay_rates_updated_at = new Date().toISOString();
    metadata.pay_rates_updated_by = actorName || null;
  } else {
    delete metadata.pay_rates;
    delete metadata.pay_rates_updated_at;
    delete metadata.pay_rates_updated_by;
  }
  return metadata;
}

export function fieldKey(responseType, key) {
  return `${responseType}:${key}`;
}

export function responseKeyForQuestion(question) {
  return fieldKey("custom_question", question.question_key);
}

export function responseKeyForPdfField(field) {
  return fieldKey("pdf_field", field.name);
}

export function compactDateTime(row) {
  if (!row?.interview_date && !row?.interview_time) return "No date set";
  return [row.interview_date ? fmtDate(row.interview_date) : "", row.interview_time || ""].filter(Boolean).join(" at ");
}

export function normalizeRpcArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.records)) return value.records;
  return [];
}

export function isInterviewRpcMissing(error) {
  return error?.code === "PGRST202"
    || error?.code === "PGRST204"
    || /get_labor_interview_/i.test(error?.message || "")
    || /function .* does not exist/i.test(error?.message || "");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeAiReviewMode(value) {
  const text = String(value || "").trim().toLowerCase();
  return INTERVIEW_AI_REVIEW_MODES.some((mode) => mode.value === text) ? text : "literal";
}

export function reviewModeDraftInstruction(mode, label) {
  if (mode === "speculative") {
    return `${label} mode selected by the manager. Fill every defensible guide field from the transcript at this evidence strictness. Prefer a concise, evidence-backed inference over leaving a field blank when the transcript logically supports the question. Do not fabricate unsupported facts.`;
  }
  if (mode === "inferred") {
    return `${label} mode selected by the manager. Fill guide fields when the transcript demonstrates a relevant behavior, trait, or response quality, even when the exact question was not asked. Keep unsupported fields blank.`;
  }
  return `${label} mode selected by the manager. Fill guide fields only from direct answers, near-verbatim rephrases, or clearly matching interview exchanges. Keep loosely related fields blank.`;
}

export async function readEdgeFunctionError(error, fallbackMessage) {
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

export function snapshotForRecord(record) {
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

export function snapshotForGuide(record, guide) {
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

export function buildLegacyGuideFromRecord(record) {
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

export function mapResponsesByTarget(responses = [], guideId = "") {
  return (responses || []).reduce((map, response) => {
    const rowGuideId = response.interview_guide_id || "";
    if (response.response_type === "custom_question" && response.question_key) {
      const key = fieldKey("custom_question", response.question_key);
      const existing = map[key];
      const existingGuideId = existing?.interview_guide_id || "";
      if (
        !existing
        || (!rowGuideId && existingGuideId)
        || (guideId && rowGuideId === guideId && existingGuideId && existingGuideId !== guideId)
      ) {
        map[key] = response;
      }
      return map;
    }
    if (guideId && rowGuideId && rowGuideId !== guideId) return map;
    if (guideId && !rowGuideId) {
      // Legacy responses without a guide id belong to the primary guide only.
      const hasExplicitGuideRows = responses.some((row) => row.interview_guide_id === guideId);
      if (hasExplicitGuideRows) return map;
    }
    if (response.response_type === "pdf_field" && response.pdf_field_name) {
      map[fieldKey("pdf_field", response.pdf_field_name)] = response;
    }
    return map;
  }, {});
}

export function getResponseDraft(response) {
  return getInterviewDraftResponseText(response);
}

export function draftMapsEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => String(left?.[key] || "") === String(right?.[key] || ""));
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${Math.round(value / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function formatDuration(seconds) {
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

export function formatPlaybackTime(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function isTurnActive(turn, currentTime) {
  const time = Number(currentTime || 0);
  if (!Number.isFinite(time) || turn.startSeconds == null || turn.endSeconds == null) return false;
  return time >= turn.startSeconds && time <= turn.endSeconds;
}

export function normalizeTranscriptSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export function wordMatchesSearch(wordText, query) {
  const normalizedQuery = normalizeTranscriptSearch(query);
  if (!normalizedQuery) return false;
  const normalizedWord = normalizeTranscriptSearch(wordText).replace(/[^\w\s']/g, "");
  const queryParts = normalizedQuery.split(/\s+/).filter((part) => part.length >= 2);
  return normalizedWord.includes(normalizedQuery) || queryParts.some((part) => normalizedWord.includes(part));
}

export function wordsFromProviderSegments(turns = []) {
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

export function chunkProviderWords(words = [], size = 22) {
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

export function buildTimedWordsForTurn(turn, turnIndex = 0) {
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

export function chunkTurnForLiveTranscript(turn, turnIndex = 0, wordsPerLine = 14) {
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

export function buildLiveTranscriptLines({ turns = [], wordSegmentMode = false, providerWords = [] }) {
  if (wordSegmentMode) {
    return chunkProviderWords(providerWords, 12).flatMap((turn, index) => chunkTurnForLiveTranscript(turn, index, 12));
  }
  return (Array.isArray(turns) ? turns : []).flatMap((turn, index) => chunkTurnForLiveTranscript(turn, index, 14));
}

export function findActiveTranscriptLineIndex(lines = [], currentTime = 0) {
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

export function getTranscriptLineProgress(line, currentTime) {
  const start = Number(line?.startSeconds);
  const end = Number(line?.endSeconds);
  const time = Number(currentTime || 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(1, (time - start) / (end - start)));
}

export function getTranscriptSearchResults(lines = [], query = "") {
  const normalized = normalizeTranscriptSearch(query);
  if (!normalized) return [];
  return lines.reduce((matches, line, index) => {
    const text = normalizeTranscriptSearch(line.text);
    const tokenMatch = normalized.split(/\s+/).filter(Boolean).every((part) => text.includes(part));
    if (text.includes(normalized) || tokenMatch) matches.push({ lineIndex: index, line });
    return matches;
  }, []);
}

export function getAutoScoreStorageKey(actorUserId) {
  return `k9:labor-interviews:auto-score:${actorUserId || "local"}`;
}

export function readAutoScoreSetting(storageKey) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(storageKey) === "true";
}

export function seededWaveBars(seed = "", count = 72) {
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


export function shouldDecodeAudioWaveform({ durationSeconds = 0, fileSizeBytes = 0 } = {}) {
  const duration = Number(durationSeconds || 0);
  const size = Number(fileSizeBytes || 0);
  if (Number.isFinite(duration) && duration > INTERVIEW_WAVEFORM_DECODE_MAX_SECONDS) return false;
  if (Number.isFinite(size) && size > INTERVIEW_WAVEFORM_DECODE_MAX_BYTES) return false;
  return true;
}

export function buildTranscriptTimelineWaveBars(turns = [], durationSeconds = 0, count = INTERVIEW_WAVEFORM_BAR_COUNT) {
  const duration = Number(durationSeconds || 0);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(turns) || !turns.length) return [];

  const bucketSeconds = duration / count;
  const buckets = Array.from({ length: count }, () => ({ activeSeconds: 0, weightedWords: 0 }));
  turns.forEach((turn) => {
    const rawStart = Number(turn?.startSeconds);
    const rawEnd = Number(turn?.endSeconds);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) return;
    const start = Math.max(0, Math.min(duration, rawStart));
    const end = Math.max(0, Math.min(duration, rawEnd));
    if (end <= start) return;

    const wordCount = Array.isArray(turn?.words) && turn.words.length
      ? turn.words.length
      : String(turn?.text || "").split(/\s+/).filter(Boolean).length;
    const turnSeconds = Math.max(1, end - start);
    const firstBucket = Math.max(0, Math.floor(start / bucketSeconds));
    const lastBucket = Math.min(count - 1, Math.floor(Math.max(0, end - 0.001) / bucketSeconds));
    for (let index = firstBucket; index <= lastBucket; index += 1) {
      const bucketStart = index * bucketSeconds;
      const bucketEnd = bucketStart + bucketSeconds;
      const overlap = Math.max(0, Math.min(end, bucketEnd) - Math.max(start, bucketStart));
      if (!overlap) continue;
      buckets[index].activeSeconds += overlap;
      buckets[index].weightedWords += wordCount * (overlap / turnSeconds);
    }
  });

  const maxWeightedWords = Math.max(1, ...buckets.map((bucket) => bucket.weightedWords));
  return buckets.map((bucket, index) => {
    const occupancy = Math.min(1, bucket.activeSeconds / bucketSeconds);
    const wordDensity = Math.min(1, bucket.weightedWords / maxWeightedWords);
    const normalized = Math.max(0.08, occupancy * 0.72 + wordDensity * 0.28);
    return {
      height: 16 + Math.round(Math.pow(normalized, 0.74) * 92),
      delay: -(index * 0.035).toFixed(2),
      duration: (0.78 + (index % 9) * 0.08).toFixed(2),
      opacity: 0.44 + Math.min(0.48, normalized * 0.64),
      timeline: true,
    };
  });
}

export async function extractAudioWaveformBars(audioUrl, { count = 72, signal } = {}) {
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

export function safeUiError(error, fallback) {
  const message = typeof error === "string" ? error : error?.message;
  return String(message || fallback || "Something went wrong.")
    .replace(/xAI\s+Grok/gi, "AI")
    .replace(/\bGrok\b/g, "AI")
    .replace(/\bxAI\b/g, "AI");
}

export async function readJsonApiError(response, fallbackMessage) {
  const raw = await response.text();
  try {
    const data = raw ? JSON.parse(raw) : {};
    return safeUiError(data?.error || data?.message || fallbackMessage, fallbackMessage);
  } catch {
    return safeUiError(raw || fallbackMessage, fallbackMessage);
  }
}

export async function normalizeInterviewAudioForSttOnServer(payload) {
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
    throw new Error(await readJsonApiError(response, `Failed to convert interview audio (${response.status})`));
  }
  return response.json();
}

export function inferOriginalAudioPathFromChunk(sourceAudio = {}) {
  const chunks = Array.isArray(sourceAudio.chunks) ? sourceAudio.chunks : [];
  const chunkPath = String(chunks[0]?.path || chunks[0]?.audio_file_path || "").trim();
  const originalFileName = String(sourceAudio.original_file_name || sourceAudio.original_audio_file_name || "").trim();
  if (!chunkPath || !originalFileName) return "";
  const folder = chunkPath.includes("/") ? chunkPath.slice(0, chunkPath.lastIndexOf("/") + 1) : "";
  return `${folder}${sanitizeInterviewFileName(originalFileName)}`;
}

export function getInterviewAudioSourceCandidates(sourceAudio = {}) {
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

export function getInterviewAudioPlaybackCandidates(sourceAudio = {}) {
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

export async function isSignedAudioUrlReadable(signedUrl) {
  if (!signedUrl) return false;
  try {
    const response = await fetch(signedUrl, { method: "HEAD", cache: "no-store" });
    return response.ok || response.status === 405;
  } catch {
    return true;
  }
}

export function humanizePdfFieldName(value = "") {
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

export function fieldValueRows(value = "") {
  const length = String(value || "").length;
  if (length < 80) return 3;
  if (length < 220) return 5;
  if (length < 520) return 7;
  return 9;
}

export function getPdfQuestionGroup(fieldName = "") {
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

export function questionPartLabel(item) {
  if (!item || item.type !== "question_part") return "";
  return `Question ${String(item.number).padStart(2, "0")} ${item.partLabel}`;
}

export function questionPartShortLabel(item) {
  if (!item || item.type !== "question_part") return "";
  const letter = item.part === "situation" ? "S" : item.part === "task" ? "T" : item.part === "action" ? "A" : "R";
  return `${item.number}${letter}`;
}

export function approximatePdfFieldCharLimit(field = {}) {
  const width = Number(field?.rect?.width || 0);
  if (!Number.isFinite(width) || width <= 0) return 95;
  return Math.max(40, Math.min(120, Math.floor(width / 4.75)));
}

export function splitTextAcrossPdfFields(value = "", fields = []) {
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

export function getPdfFieldFitLimit(field = {}) {
  const rect = getInterviewPdfFieldDisplayRect(field) || {};
  const width = Number(rect.width || 0);
  const height = Number(rect.height || 0);
  if (!Number.isFinite(width) || width <= 0) return 80;
  const lines = height > 22 ? Math.max(1, Math.floor(height / 9.5)) : 1;
  const charsPerLine = Math.max(16, Math.floor(width / 7.4));
  return Math.max(16, Math.min(220, charsPerLine * lines));
}

export function fitPdfFieldValueForSlot(value = "", field = {}) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (field.type && field.type !== "text") return text;
  const limit = getPdfFieldFitLimit(field);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

export function getPdfExportFieldCharLimit(field = {}) {
  const rect = getInterviewPdfFieldDisplayRect(field) || {};
  const width = Number(rect.width || 0);
  if (!Number.isFinite(width) || width <= 0) return 120;
  return Math.max(60, Math.min(180, Math.floor(width / 3.55)));
}

export function splitTextAcrossPdfFieldsForExport(value = "", fields = []) {
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

export function buildReadablePdfFieldMap(map = {}, fields = []) {
  const fieldByName = new Map((fields || []).map((field) => [field.name, field]));
  return Object.entries(map || {}).reduce((next, [name, value]) => {
    next[name] = fitPdfFieldValueForSlot(value, fieldByName.get(name) || { name });
    return next;
  }, {});
}

export function buildExportPdfFieldMap(map = {}, fields = []) {
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

export function buildPdfReviewItems(fields = []) {
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

export function cleanPdfQuestionPrompt(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\bPage\s+\d+\s*\|.*$/i, "")
    .replace(/\b(Situation|Task|Action|Result|Follow-Up Probes)\s*:.*$/i, "")
    .trim()
    .slice(0, 900);
}

export function extractNumberedPdfQuestionPrompts(fullText = "") {
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

export function linesFromPdfTextItems(items = []) {
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

export async function extractPdfQuestionPromptMap(pdfBytes) {
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

export function composePdfReviewItemValue(item, getFieldValue) {
  if (!item) return "";
  if (item.type !== "question_part") return getFieldValue(item.field);
  return (item.fields || [])
    .map((field) => String(getFieldValue(field) || ""))
    .filter((value) => value.length > 0)
    .join(" ");
}

export function splitPdfReviewItemValue(item, value) {
  if (!item) return [];
  if (item.type !== "question_part") return item?.field ? [{ field: item.field, value }] : [];
  const chunks = splitTextAcrossPdfFields(value, item.fields || []);
  return (item.fields || []).map((field, index) => ({ field, value: chunks[index] || "" }));
}

export function computeOverallScoreFromPdfMap(map = {}, fields = []) {
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

export function conciseBullet(value = "", maxLength = 190) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

export function normalizeSummaryBulletText(value = "") {
  return String(value || "")
    .replace(/^(\s*[-*•]\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function summaryTextToBullets(value = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeSummaryBulletText(line))
    .filter(Boolean);
}

export function summaryBulletsToText(bullets = []) {
  return (Array.isArray(bullets) ? bullets : [])
    .map((bullet) => normalizeSummaryBulletText(bullet))
    .filter(Boolean)
    .map((bullet) => `- ${bullet}`)
    .join("\n");
}

export function summarySectionKey(value = "") {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || "summary";
}


export function normalizeCustomSummaryPageId(value = "") {
  const key = summarySectionKey(String(value || "").replace(new RegExp(`^${CUSTOM_SUMMARY_SECTION_PREFIX}`), ""));
  return key === "summary" ? "" : key;
}

export function createCustomSummaryPageId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function customSummarySectionKey(pageId = "", index = 0) {
  const id = normalizeCustomSummaryPageId(pageId) || `page_${index + 1}`;
  return `${CUSTOM_SUMMARY_SECTION_PREFIX}${id}`;
}

export function isCustomSummarySectionKey(value = "") {
  return String(value || "").startsWith(CUSTOM_SUMMARY_SECTION_PREFIX);
}


export function isSummarySectionKey(value = "") {
  return SUMMARY_SECTION_KEYS.has(String(value || ""));
}

export function isEditableSummarySectionKey(value = "") {
  return isSummarySectionKey(value) || isCustomSummarySectionKey(value);
}

export function getInterviewSummaryEditSource(recordOrEdits) {
  return recordOrEdits?.metadata?.interview_summary_edits || recordOrEdits || {};
}

export function getStoredSummaryEdits(recordOrEdits) {
  const source = getInterviewSummaryEditSource(recordOrEdits);
  const sections = source.sections || source;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return {};
  return Object.entries(sections).reduce((next, [key, value]) => {
    if (!isEditableSummarySectionKey(key)) return next;
    const bullets = Array.isArray(value) ? value : summaryTextToBullets(value);
    next[key] = bullets.map((bullet) => normalizeSummaryBulletText(bullet)).filter(Boolean);
    return next;
  }, {});
}

export function getStoredCustomSummaryPages(recordOrEdits) {
  const source = getInterviewSummaryEditSource(recordOrEdits);
  const sections = source.sections && typeof source.sections === "object" && !Array.isArray(source.sections) ? source.sections : {};
  const pages = Array.isArray(source.custom_pages) ? source.custom_pages : [];
  return pages.map((page, index) => {
    const rawSectionKey = page?.section_key || page?.sectionKey || "";
    const id = normalizeCustomSummaryPageId(page?.id || page?.key || rawSectionKey) || `page_${index + 1}`;
    const sectionKey = isCustomSummarySectionKey(rawSectionKey) ? rawSectionKey : customSummarySectionKey(id, index);
    const title = String(page?.title || page?.heading || `Custom Summary Page ${index + 1}`).trim() || `Custom Summary Page ${index + 1}`;
    const sectionValue = Object.prototype.hasOwnProperty.call(sections, sectionKey)
      ? sections[sectionKey]
      : (page?.bullets || page?.body || page?.text || "");
    const bullets = (Array.isArray(sectionValue) ? sectionValue : summaryTextToBullets(sectionValue))
      .map((bullet) => normalizeSummaryBulletText(bullet))
      .filter(Boolean);
    return {
      id,
      sectionKey,
      title,
      heading: page?.heading || "Notes",
      bullets,
    };
  });
}

export function applySummarySectionEdits(sections = [], summaryEdits = {}) {
  const edits = getStoredSummaryEdits(summaryEdits);
  return (sections || [])
    .map((section) => {
      const key = section.key || summarySectionKey(section.heading);
      if (!Object.prototype.hasOwnProperty.call(edits, key)) return { ...section, key };
      return { ...section, key, bullets: edits[key] || [] };
    })
    .filter((section) => Array.isArray(section.bullets) && section.bullets.length > 0);
}

export function getStoredTranscriptSummaryBullets(record) {
  const metadata = record?.metadata || {};
  const source = metadata.interview_summary || metadata.transcript_summary || {};
  const rawBullets = Array.isArray(source) ? source : source.bullets;
  return (Array.isArray(rawBullets) ? rawBullets : [])
    .map((bullet) => normalizeSummaryBulletText(bullet))
    .filter(Boolean)
    .slice(0, 12);
}

export function splitTranscriptIntoSummarySentences(record) {
  const text = String(record?.transcript_text || "")
    .replace(/\[[^\]]{0,80}\]/g, " ")
    .replace(/\b(?:Speaker|Person)\s+\d+\s*:/gi, " ")
    .replace(/\b(?:Zack|Interviewer|Candidate|Alexis)\s*:/gi, " ")
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

export function buildFallbackTranscriptSummaryBullets(record) {
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

export function getTranscriptSummaryBullets(record) {
  const stored = getStoredTranscriptSummaryBullets(record);
  return stored.length ? stored : buildFallbackTranscriptSummaryBullets(record);
}

export function buildInterviewSummaryPages({ record, guide, fields, questions, responsesByTarget, finalMap, summaryEdits = null }) {
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
  getStoredCustomSummaryPages(summaryEdits || record).forEach((customPage) => {
    pages.push({
      title: customPage.title,
      subtitle,
      custom: true,
      sections: [{
        key: customPage.sectionKey,
        heading: customPage.heading || "Notes",
        bullets: customPage.bullets || [],
      }],
    });
  });
  if (!pages.length) return [];
  return pages;
}

export function estimateSummaryBulletLines(text = "") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return Math.max(1, Math.ceil(clean.length / 92));
}

export function chunkSummaryBulletForPreview(text = "", maxLines = 8) {
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

export function paginateInterviewSummaryPreview(summaryPages = []) {
  const sourcePages = Array.isArray(summaryPages) ? summaryPages.filter(Boolean) : [];
  const previewPages = [];
  const maxLines = 45;

  sourcePages.forEach((summary) => {
    const title = String(summary.title || "Interview Summary");
    const subtitle = String(summary.subtitle || "");
    const keepEmptySections = !!summary.custom;
    let page = { title, subtitle, sections: [] };
    let lineCount = 5;

    const pushPage = () => {
      if (page.sections.some((section) => section.bullets?.length || (keepEmptySections && section.heading))) previewPages.push(page);
      const continuedTitle = /\(continued\)/i.test(title) ? title : `${title} (continued)`;
      page = { title: continuedTitle, subtitle, sections: [] };
      lineCount = 5;
    };

    (summary.sections || []).forEach((section) => {
      const heading = String(section.heading || "").trim();
      const bullets = (Array.isArray(section.bullets) ? section.bullets : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      if (!bullets.length && keepEmptySections && heading) {
        if (lineCount + 3 > maxLines && page.sections.some((row) => row.bullets?.length || row.heading)) pushPage();
        page.sections.push({ heading, bullets: [] });
        lineCount += 3;
        return;
      }
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

export function isPdfResumeArtifact(artifact) {
  const mime = String(artifact?.mime_type || "").toLowerCase();
  const fileName = String(artifact?.file_name || artifact?.metadata?.original_file_name || "").toLowerCase();
  return mime.includes("pdf") || fileName.endsWith(".pdf");
}

export function getPdfFieldPageSize(field, pageFields = []) {
  const sources = [field, ...pageFields];
  for (const source of sources) {
    const size = source?.page_size || source?.pageSize || {};
    const width = Number(source?.page_width || size.width || size.w);
    const height = Number(source?.page_height || size.height || size.h);
    if (width > 0 && height > 0) return { width, height };
  }
  return { width: 612, height: 792 };
}

export function getPdfPageOverlayBox(containerSize, pageSize) {
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

export function getPdfFieldOverlayStyle(field, pageBox, pageSize) {
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

export function getPdfFieldValueOverlayStyle(field, pageBox, pageSize) {
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

export function buildGuideAiCompletionBullets(result, totalFields) {
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

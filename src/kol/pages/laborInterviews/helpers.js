// Pure helpers for the Labor Interviews workspace.
// Extracted verbatim from LaborInterviewsPage.jsx (no behavior changes).
import { supabase } from "../../../supabaseClient";
import { fmtDate, todayStr } from "../../../shared/theme";
import {
  getInterviewDraftResponseText,
  normalizeInterviewPayRates,
  sanitizeInterviewFileName,
  INTERVIEW_AI_REVIEW_MODES,
  LABOR_INTERVIEW_DOCUMENT_BUCKET,
} from "../../interviewData";
import {
  INTERVIEW_WAVEFORM_BAR_COUNT,
  INTERVIEW_WAVEFORM_DECODE_MAX_BYTES,
  INTERVIEW_WAVEFORM_DECODE_MAX_SECONDS,
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

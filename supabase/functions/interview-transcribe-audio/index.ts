import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") || "";
const XAI_STT_MODEL = Deno.env.get("INTERVIEW_XAI_STT_MODEL") || Deno.env.get("XAI_STT_MODEL") || "grok-stt";
const LABOR_INTERVIEW_DOCUMENT_BUCKET = "labor-interview-documents";
const INTERVIEW_AUDIO_MAX_BYTES = 500 * 1024 * 1024;
const INTERVIEW_AUDIO_ALLOWED_MIME_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/x-matroska",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4",
  "video/x-matroska",
  "application/x-matroska",
]);
const INTERVIEW_AUDIO_CONTENT_TYPES: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
};

class InterviewFunctionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "InterviewFunctionError";
    this.status = status;
  }
}

type SttWord = {
  text?: string;
  word?: string;
  value?: string;
  start?: number;
  start_seconds?: number;
  start_time?: number;
  end?: number;
  end_seconds?: number;
  end_time?: number;
  speaker?: number | string;
  speaker_id?: number | string;
  channel?: number;
  confidence?: number;
};

type TranscriptTurn = {
  id: string;
  speaker: string;
  speaker_id?: number | string | null;
  start: number | null;
  end: number | null;
  text: string;
  words: SttWord[];
};

type SttResult = {
  text?: string;
  transcript?: string;
  language?: string;
  duration?: number;
  words?: SttWord[];
  segments?: Array<Record<string, unknown>>;
  utterances?: Array<Record<string, unknown>>;
  transcript_segments?: Array<Record<string, unknown>>;
  speech_segments?: Array<Record<string, unknown>>;
  turns?: Array<Record<string, unknown>>;
  channels?: Array<{ index?: number; text?: string; transcript?: string; words?: SttWord[] }>;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanJoinedWords(words: SttWord[]) {
  return words
    .map((word) => String(word.text || word.word || word.value || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

function cleanTranscriptText(value: unknown) {
  return String(value || "")
    .replace(/[\u3400-\u9fff\u3040-\u30ff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getWordText(word: SttWord) {
  return cleanTranscriptText(word.text || word.word || word.value || "");
}

function normalizeSttWord(word: SttWord, channel?: number): SttWord | null {
  const text = getWordText(word);
  if (!text) return null;
  return {
    text,
    start: numberOrNull(word.start ?? word.start_seconds ?? word.start_time) ?? undefined,
    end: numberOrNull(word.end ?? word.end_seconds ?? word.end_time) ?? undefined,
    speaker: word.speaker ?? word.speaker_id,
    channel: channel ?? word.channel,
    confidence: numberOrNull(word.confidence) ?? undefined,
  };
}

function normalizeProviderWords(result: SttResult) {
  const topLevelWords = Array.isArray(result.words) ? result.words.map((word) => normalizeSttWord(word)).filter(Boolean) as SttWord[] : [];
  const channelWords = Array.isArray(result.channels)
    ? result.channels.flatMap((channel) => (Array.isArray(channel.words) ? channel.words : [])
        .map((word) => normalizeSttWord(word, channel.index))
        .filter(Boolean) as SttWord[])
    : [];
  return [...topLevelWords, ...channelWords]
    .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
}

function providerPlainTranscriptText(result: SttResult) {
  const topLevelText = cleanTranscriptText(result.text || result.transcript || "");
  if (topLevelText) return topLevelText;
  return Array.isArray(result.channels)
    ? result.channels
        .map((channel) => cleanTranscriptText(channel.text || channel.transcript || ""))
        .filter(Boolean)
        .join("\n\n")
        .trim()
    : "";
}

function speakerLabel(value: unknown) {
  const speaker = value == null || value === "" ? null : value;
  if (speaker == null) return "Person";
  const numeric = Number(speaker);
  if (Number.isInteger(numeric)) return `Person ${numeric + 1}`;
  const text = String(speaker).trim();
  const speakerMatch = text.match(/speaker[_\s-]*(\d+)/i);
  if (speakerMatch) return `Person ${Number(speakerMatch[1]) + (speakerMatch[1] === "0" ? 1 : 0)}`;
  const personMatch = text.match(/person[_\s-]*(\d+)/i);
  if (personMatch) return `Person ${personMatch[1]}`;
  return text;
}

function formatSeconds(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function getFileExtension(fileName = "") {
  const match = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function normalizeAudioMimeType(fileName: string, mimeType: string) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (normalized && normalized !== "application/octet-stream") return normalized;
  return INTERVIEW_AUDIO_CONTENT_TYPES[getFileExtension(fileName)] || "";
}

function turnFromSegment(segment: Record<string, unknown>, index: number): TranscriptTurn | null {
  const rawWords = Array.isArray(segment.words) ? segment.words as SttWord[] : [];
  const words = rawWords.map((word) => normalizeSttWord(word)).filter(Boolean) as SttWord[];
  const text = cleanTranscriptText(
    segment.text || segment.transcript || segment.transcript_text || segment.content || segment.value || cleanJoinedWords(words) || "",
  );
  if (!text) return null;
  const start = numberOrNull(segment.start ?? segment.start_seconds ?? segment.start_time ?? words[0]?.start);
  const end = numberOrNull(segment.end ?? segment.end_seconds ?? segment.end_time ?? words[words.length - 1]?.end);
  const speaker = segment.speaker ?? segment.speaker_id ?? words.find((word) => word.speaker != null)?.speaker ?? null;
  return {
    id: `xai-segment-${index}`,
    speaker: speakerLabel(speaker),
    speaker_id: speaker,
    start,
    end,
    text,
    words,
  };
}

function turnFromPlainTranscriptText(result: SttResult): TranscriptTurn | null {
  const text = providerPlainTranscriptText(result);
  if (!text) return null;
  return {
    id: "xai-text-fallback-0",
    speaker: "Transcript",
    speaker_id: null,
    start: null,
    end: null,
    text,
    words: [],
  };
}

function turnFromProviderWord(word: SttWord, index: number): TranscriptTurn | null {
  const normalized = normalizeSttWord(word);
  if (!normalized) return null;
  const speaker = normalized.speaker ?? null;
  return {
    id: `xai-word-segment-${index}`,
    speaker: speakerLabel(speaker),
    speaker_id: speaker,
    start: numberOrNull(normalized.start),
    end: numberOrNull(normalized.end),
    text: getWordText(normalized),
    words: [normalized],
  };
}

function turnsFromProviderWordsBySpeaker(words: SttWord[]) {
  const normalizedWords = words.map((word) => normalizeSttWord(word)).filter(Boolean) as SttWord[];
  if (!normalizedWords.length) return [];
  const hasSpeakerIds = normalizedWords.some((word) => word.speaker != null && word.speaker !== "");
  if (!hasSpeakerIds) return [];
  const turns: TranscriptTurn[] = [];
  normalizedWords.forEach((word) => {
    const speaker = word.speaker ?? null;
    const previous = turns[turns.length - 1];
    const start = numberOrNull(word.start);
    const end = numberOrNull(word.end);
    const gap = previous?.end != null && start != null ? start - previous.end : 0;
    if (previous && previous.speaker_id === speaker && gap <= 2.4) {
      previous.words.push(word);
      previous.text = cleanJoinedWords(previous.words);
      previous.end = end ?? previous.end;
      return;
    }
    turns.push({
      id: `xai-speaker-turn-${turns.length}`,
      speaker: speakerLabel(speaker),
      speaker_id: speaker,
      start,
      end,
      text: getWordText(word),
      words: [word],
    });
  });
  return turns;
}

function buildProviderTranscriptTurns(result: SttResult) {
  const segmentSources = [
    { source: "xai_segments", segments: result.segments },
    { source: "xai_utterances", segments: result.utterances },
    { source: "xai_transcript_segments", segments: result.transcript_segments },
    { source: "xai_speech_segments", segments: result.speech_segments },
    { source: "xai_turns", segments: result.turns },
  ];
  const providerSource = segmentSources.find((entry) => Array.isArray(entry.segments) && entry.segments.length);
  const providerSegments = providerSource?.segments || [];
  const segmentedTurns = providerSegments
    .map((segment, index) => turnFromSegment(segment, index))
    .filter(Boolean) as TranscriptTurn[];
  if (segmentedTurns.length) return { turns: segmentedTurns, source: providerSource?.source || "xai_segments" };

  const providerWords = normalizeProviderWords(result);
  const speakerTurns = turnsFromProviderWordsBySpeaker(providerWords);
  if (speakerTurns.length) return { turns: speakerTurns, source: "xai_word_speaker_turns" };

  const wordTurns = providerWords
    .map((word, index) => turnFromProviderWord(word, index))
    .filter(Boolean) as TranscriptTurn[];
  if (wordTurns.length) return { turns: wordTurns, source: "xai_word_segments" };

  const textTurn = turnFromPlainTranscriptText(result);
  if (textTurn) return { turns: [textTurn], source: "xai_text_fallback" };

  return { turns: [], source: "xai_missing_turns" };
}

function buildSpeakerTranscript(result: SttResult, turns: TranscriptTurn[], source = "") {
  const plainTranscript = providerPlainTranscriptText(result);
  if (["xai_word_segments", "xai_text_fallback"].includes(source) && plainTranscript) {
    return plainTranscript;
  }
  if (!turns.length) {
    return plainTranscript;
  }

  return turns
    .map((turn) => {
      const timestamp = formatSeconds(turn.start);
      return turn.text ? `${timestamp ? `[${timestamp}] ` : ""}${turn.speaker}: ${turn.text}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function hasProviderDiarization(turns: TranscriptTurn[]) {
  return turns.some((turn) => turn.speaker_id != null && turn.speaker_id !== "");
}

function parseProviderErrorBody(rawBody: string) {
  if (!rawBody) return "";
  try {
    const data = JSON.parse(rawBody);
    const error = data?.error;
    if (typeof error === "string") return error;
    if (typeof error?.message === "string") return error.message;
    if (typeof data?.message === "string") return data.message;
    return rawBody;
  } catch (_) {
    return rawBody;
  }
}

function providerStatusToClientStatus(providerStatus: number) {
  if (providerStatus === 401 || providerStatus === 403) return 500;
  if (providerStatus === 413) return 400;
  if (providerStatus === 429) return 429;
  if (providerStatus >= 500) return 503;
  return 502;
}

function providerMessageForClient(message: string, fileName: string) {
  const text = String(message || "").trim();
  if (/unsupported or corrupt audio format/i.test(text) && /\.m4a$/i.test(fileName || "")) {
    return "AI could not read this M4A audio codec. Re-upload this recording so K9 can normalize it to WAV, or export it as WAV/MP3 and upload that file.";
  }
  return text;
}

async function getAuthenticatedUserId(token: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error_description || data?.msg || data?.message || "Unauthorized.";
    throw new InterviewFunctionError(message, 401);
  }
  const userId = String(data?.id || "").trim();
  if (!userId) throw new InterviewFunctionError("Unauthorized.", 401);
  return userId;
}

async function transcribeWithGrok(audioBlob: Blob, fileName: string, mimeType: string) {
  const typedAudioBlob = audioBlob.type === mimeType ? audioBlob : new Blob([audioBlob], { type: mimeType });
  const formData = new FormData();
  formData.append("format", "true");
  formData.append("language", "en");
  formData.append("diarize", "true");
  formData.append("file", typedAudioBlob, fileName);

  const response = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${XAI_API_KEY}`,
    },
    body: formData,
  });

  const responseText = await response.text();
  const providerMessage = parseProviderErrorBody(responseText);
  if (!response.ok) {
    const message = providerMessageForClient(providerMessage, fileName) || `xAI Grok STT request failed for ${mimeType || "audio"}.`;
    console.error("xAI Grok STT failed", {
      status: response.status,
      statusText: response.statusText,
      message,
      mimeType,
      fileName,
      sizeBytes: audioBlob.size,
    });
    throw new InterviewFunctionError(
      `xAI Grok STT failed (${response.status}): ${String(message).slice(0, 500)}`,
      providerStatusToClientStatus(response.status),
    );
  }

  let data: SttResult & { error?: { message?: string } | string };
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    throw new InterviewFunctionError("xAI Grok STT returned a non-JSON response.", 502);
  }

  if (data.error) {
    const message = parseProviderErrorBody(JSON.stringify(data));
    throw new InterviewFunctionError(`xAI Grok STT failed: ${message || "Provider returned an error."}`, 502);
  }
  return data as SttResult;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return jsonResponse({ error: "Supabase environment variables are missing." }, 500);
    }
    if (!XAI_API_KEY) {
      return jsonResponse({ error: "XAI_API_KEY is not configured." }, 500);
    }

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return jsonResponse({ error: "Missing authorization header." }, 401);
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Missing authorization token." }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    const userId = await getAuthenticatedUserId(token);

    const body = await req.json();
    const interviewId = String(body?.interview_id || "").trim();
    const audioBucket = String(body?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET).trim();
    const audioPath = String(body?.audio_file_path || "").trim();
    const audioFileName = String(body?.audio_file_name || "interview-audio.m4a").trim();
    const audioMimeType = normalizeAudioMimeType(audioFileName, String(body?.audio_mime_type || "audio/mpeg").trim());
    const originalAudioFileName = String(body?.original_audio_file_name || audioFileName).trim();
    const originalAudioMimeType = normalizeAudioMimeType(
      originalAudioFileName,
      String(body?.original_audio_mime_type || body?.audio_mime_type || "").trim(),
    );
    const originalAudioSizeBytes = Number(body?.original_audio_size_bytes || 0) || null;
    const audioNormalizedForStt = Boolean(body?.audio_normalized_for_stt);
    const saveTranscript = body?.save_transcript !== false;
    const runInBackground = body?.async === true || body?.async_transcription === true;

    if (!interviewId) return jsonResponse({ error: "Missing interview_id." }, 400);
    if (!audioPath) return jsonResponse({ error: "Missing audio_file_path." }, 400);
    if (audioBucket !== LABOR_INTERVIEW_DOCUMENT_BUCKET) {
      return jsonResponse({ error: "Interview audio must be stored in the private labor interview bucket." }, 400);
    }

    const { data: record, error: recordError } = await supabase
      .from("labor_interview_records")
      .select("*")
      .eq("id", interviewId)
      .single();
    if (recordError || !record) {
      return jsonResponse({ error: recordError?.message || "Interview not found." }, 404);
    }

    const expectedPrefix = `${record.location_id}/interviews/${interviewId}/audio/`;
    if (!audioPath.startsWith(expectedPrefix)) {
      return jsonResponse({ error: "Audio file path does not match this interview record." }, 400);
    }

    if (!INTERVIEW_AUDIO_ALLOWED_MIME_TYPES.has(audioMimeType)) {
      return jsonResponse({ error: `Unsupported interview audio type: ${audioMimeType}.` }, 400);
    }

    const existingMetadata = (record.metadata || {}) as Record<string, unknown>;
    const markFailed = async (error: unknown) => {
      const failedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : "Interview audio transcription failed.";
      await supabase
        .from("labor_interview_records")
        .update({
          transcript_status: "failed",
          metadata: {
            ...existingMetadata,
            audio_transcription_error: {
              message,
              failed_at: failedAt,
              source_audio: {
                bucket: audioBucket,
                path: audioPath,
                file_name: audioFileName,
                mime_type: audioMimeType,
                original_file_name: originalAudioFileName || audioFileName,
                original_mime_type: originalAudioMimeType || audioMimeType,
                original_size_bytes: originalAudioSizeBytes || null,
                normalized_for_stt: audioNormalizedForStt,
              },
            },
          },
          updated_by_user_id: userId,
          updated_at: failedAt,
        })
        .eq("id", interviewId);
    };

    const runTranscription = async () => {
      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from(audioBucket)
        .download(audioPath);
      if (downloadError || !audioBlob) {
        throw new InterviewFunctionError(downloadError?.message || "Unable to download interview audio.", 500);
      }
      if (audioBlob.size > INTERVIEW_AUDIO_MAX_BYTES) {
        throw new InterviewFunctionError("Interview audio must be 500 MB or smaller.", 400);
      }

      const stt = await transcribeWithGrok(audioBlob, audioFileName, audioMimeType);
      const providerTurns = buildProviderTranscriptTurns(stt);
      if (!providerTurns.turns.length) {
        console.error("xAI Grok STT returned no usable transcript text", {
          responseKeys: Object.keys(stt || {}),
          hasText: !!providerPlainTranscriptText(stt),
          wordCount: normalizeProviderWords(stt).length,
        });
        throw new InterviewFunctionError(
          "xAI Grok STT returned no usable transcript text for this audio.",
          502,
        );
      }

      const transcript = buildSpeakerTranscript(stt, providerTurns.turns, providerTurns.source);
      if (!transcript) {
        throw new InterviewFunctionError("xAI Grok STT returned an empty transcript.", 502);
      }

      const generatedAt = new Date().toISOString();
      const wordCount = normalizeProviderWords(stt).length || null;
      const diarizationEnabled = hasProviderDiarization(providerTurns.turns);
      const result = {
        ok: true,
        provider: "xai",
        model: XAI_STT_MODEL,
        transcript_text: transcript,
        language: stt.language || null,
        duration_seconds: typeof stt.duration === "number" ? stt.duration : null,
        word_count: wordCount,
        turn_count: providerTurns.turns.length,
        segmentation_source: providerTurns.source,
        transcript_turns: providerTurns.turns,
        saved: saveTranscript,
      };

      if (!saveTranscript) return result;

      const { error: updateError } = await supabase
        .from("labor_interview_records")
        .update({
          transcript_text: transcript,
          transcript_status: "ready",
          transcript_source: "audio",
          transcript_uploaded_at: generatedAt,
          status: record.status === "draft" ? "in_progress" : record.status,
          metadata: {
            ...existingMetadata,
            audio_transcription: {
              provider: "xai",
              model: XAI_STT_MODEL,
              generated_at: generatedAt,
              language: stt.language || null,
              duration_seconds: typeof stt.duration === "number" ? stt.duration : null,
              word_count: wordCount,
              diarization_enabled: diarizationEnabled,
              segmentation_source: providerTurns.source,
              transcript_turns: providerTurns.turns,
              source_audio: {
                bucket: audioBucket,
                path: audioPath,
                file_name: audioFileName,
                mime_type: audioMimeType,
                size_bytes: audioBlob.size,
                original_file_name: originalAudioFileName || audioFileName,
                original_mime_type: originalAudioMimeType || audioMimeType,
                original_size_bytes: originalAudioSizeBytes || audioBlob.size,
                normalized_for_stt: audioNormalizedForStt,
              },
            },
          },
          updated_by_user_id: userId,
          updated_at: generatedAt,
        })
        .eq("id", interviewId);
      if (updateError) throw new InterviewFunctionError(updateError.message, 500);
      return result;
    };

    if (runInBackground && saveTranscript) {
      const startedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("labor_interview_records")
        .update({
          transcript_status: "transcribing",
          transcript_source: "audio",
          status: record.status === "draft" ? "in_progress" : record.status,
          metadata: {
            ...existingMetadata,
            audio_transcription_job: {
              provider: "xai",
              model: XAI_STT_MODEL,
              started_at: startedAt,
              mode: "background",
              source_audio: {
                bucket: audioBucket,
                path: audioPath,
                file_name: audioFileName,
                mime_type: audioMimeType,
                original_file_name: originalAudioFileName || audioFileName,
                original_mime_type: originalAudioMimeType || audioMimeType,
                original_size_bytes: originalAudioSizeBytes || null,
                normalized_for_stt: audioNormalizedForStt,
              },
            },
          },
          updated_by_user_id: userId,
          updated_at: startedAt,
        })
        .eq("id", interviewId);
      if (updateError) throw new InterviewFunctionError(updateError.message, 500);

      const backgroundTask = runTranscription().catch(async (error) => {
        console.error("Interview background transcription failed", error);
        await markFailed(error);
      });
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (typeof edgeRuntime?.waitUntil === "function") {
        edgeRuntime.waitUntil(backgroundTask);
        return jsonResponse({
          ok: true,
          status: "transcribing",
          background: true,
          provider: "xai",
          model: XAI_STT_MODEL,
        }, 202);
      }
      const result = await backgroundTask;
      return jsonResponse(result || {
        ok: false,
        status: "failed",
      }, result ? 200 : 500);
    }

    const result = await runTranscription();
    return jsonResponse(result);
  } catch (error) {
    const status = typeof error?.status === "number" ? error.status : 500;
    return jsonResponse({ error: error?.message || "Interview audio transcription failed." }, status);
  }
});

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

type SttWord = {
  text?: string;
  start?: number;
  end?: number;
  speaker?: number;
};

type SttResult = {
  text?: string;
  language?: string;
  duration?: number;
  words?: SttWord[];
  channels?: Array<{ index?: number; text?: string; words?: SttWord[] }>;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanJoinedWords(words: SttWord[]) {
  return words
    .map((word) => String(word.text || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
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

function buildSpeakerTranscript(result: SttResult) {
  const words = Array.isArray(result.words) ? result.words : [];
  if (!words.some((word) => Number.isInteger(word.speaker))) {
    return String(result.text || "").trim();
  }

  const blocks: Array<{ speaker: number; words: SttWord[] }> = [];
  for (const word of words) {
    const speaker = Number.isInteger(word.speaker) ? Number(word.speaker) : 0;
    const previous = blocks[blocks.length - 1];
    if (!previous || previous.speaker !== speaker) {
      blocks.push({ speaker, words: [word] });
    } else {
      previous.words.push(word);
    }
  }

  return blocks
    .map((block) => {
      const label = `Speaker ${block.speaker + 1}`;
      const text = cleanJoinedWords(block.words);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
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

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `xAI Grok STT request failed for ${mimeType || "audio"}.`);
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Unauthorized." }, 401);

    const body = await req.json();
    const interviewId = String(body?.interview_id || "").trim();
    const audioBucket = String(body?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET).trim();
    const audioPath = String(body?.audio_file_path || "").trim();
    const audioFileName = String(body?.audio_file_name || "interview-audio.m4a").trim();
    const audioMimeType = normalizeAudioMimeType(audioFileName, String(body?.audio_mime_type || "audio/mpeg").trim());

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

    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from(audioBucket)
      .download(audioPath);
    if (downloadError || !audioBlob) {
      throw new Error(downloadError?.message || "Unable to download interview audio.");
    }
    if (audioBlob.size > INTERVIEW_AUDIO_MAX_BYTES) {
      return jsonResponse({ error: "Interview audio must be 500 MB or smaller." }, 400);
    }
    if (!INTERVIEW_AUDIO_ALLOWED_MIME_TYPES.has(audioMimeType)) {
      return jsonResponse({ error: `Unsupported interview audio type: ${audioMimeType}.` }, 400);
    }

    const stt = await transcribeWithGrok(audioBlob, audioFileName, audioMimeType);
    const transcript = buildSpeakerTranscript(stt) || String(stt.text || "").trim();
    if (!transcript) {
      throw new Error("xAI Grok STT returned an empty transcript.");
    }

    const existingMetadata = (record.metadata || {}) as Record<string, unknown>;
    const generatedAt = new Date().toISOString();
    const wordCount = Array.isArray(stt.words) ? stt.words.length : null;

    const { error: updateError } = await supabase
      .from("labor_interview_records")
      .update({
        transcript_text: transcript,
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
            diarization_enabled: true,
            source_audio: {
              bucket: audioBucket,
              path: audioPath,
              file_name: audioFileName,
              mime_type: audioMimeType,
              size_bytes: audioBlob.size,
            },
          },
        },
        updated_by_user_id: userData.user.id,
        updated_at: generatedAt,
      })
      .eq("id", interviewId);
    if (updateError) throw updateError;

    return jsonResponse({
      ok: true,
      provider: "xai",
      model: XAI_STT_MODEL,
      transcript_text: transcript,
      language: stt.language || null,
      duration_seconds: typeof stt.duration === "number" ? stt.duration : null,
      word_count: wordCount,
    });
  } catch (error) {
    return jsonResponse({ error: error?.message || "Interview audio transcription failed." }, 500);
  }
});

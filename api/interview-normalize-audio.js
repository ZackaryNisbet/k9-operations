import ffmpegPath from "ffmpeg-static";
import { createClient } from "@supabase/supabase-js";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

const LABOR_INTERVIEW_DOCUMENT_BUCKET = "labor-interview-documents";
const INTERVIEW_AUDIO_MAX_BYTES = 500 * 1024 * 1024;
const NORMALIZED_AUDIO_MIME_TYPE = "audio/mpeg";
const NORMALIZED_AUDIO_SAMPLE_RATE = 16000;
const NORMALIZED_AUDIO_CHUNK_SECONDS = 5 * 60;
const FFMPEG_TIMEOUT_MS = 240000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function sanitizeInterviewFileName(value = "document.pdf") {
  const cleaned = String(value || "document.pdf")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return cleaned || "document.pdf";
}

function buildInterviewSttAudioFileName(fileName = "interview-audio") {
  const sanitized = sanitizeInterviewFileName(fileName || "interview-audio");
  const withoutExtension = sanitized.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "interview-audio"}-stt.mp3`;
}

function buildInterviewSttAudioChunkFileName(fileName = "interview-audio", index = 0) {
  const sanitized = sanitizeInterviewFileName(fileName || "interview-audio");
  const withoutExtension = sanitized.replace(/\.[^.]+$/, "");
  const chunkNo = String(Number(index || 0) + 1).padStart(2, "0");
  return `${withoutExtension || "interview-audio"}-stt-${chunkNo}.mp3`;
}

function buildNormalizedAudioPath(audioPath, audioFileName, index = null) {
  const trimmedPath = String(audioPath || "").trim();
  const folder = trimmedPath.includes("/") ? trimmedPath.slice(0, trimmedPath.lastIndexOf("/") + 1) : "";
  const fileName = index == null
    ? buildInterviewSttAudioFileName(audioFileName)
    : buildInterviewSttAudioChunkFileName(audioFileName, index);
  return `${folder}${fileName}`;
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string" && req.body.trim()) {
    return Promise.resolve(JSON.parse(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg is not available in this deployment."));
      return;
    }

    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Audio conversion timed out before transcription could start."));
    }, FFMPEG_TIMEOUT_MS);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}.`));
    });
  });
}

async function convertToSttAudioChunks(inputBuffer, originalName) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "k9-interview-audio-"));
  const inputPath = path.join(tempDir, sanitizeInterviewFileName(originalName || "interview-audio.m4a"));
  const outputPattern = path.join(tempDir, "interview-stt-%03d.mp3");

  try {
    await writeFile(inputPath, inputBuffer);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(NORMALIZED_AUDIO_SAMPLE_RATE),
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "32k",
      "-f",
      "segment",
      "-segment_time",
      String(NORMALIZED_AUDIO_CHUNK_SECONDS),
      "-reset_timestamps",
      "1",
      outputPattern,
    ]);
    const names = (await readdir(tempDir))
      .filter((name) => /^interview-stt-\d+\.mp3$/i.test(name))
      .sort();
    if (!names.length) {
      throw new Error("Audio conversion produced no STT chunks.");
    }
    const chunks = [];
    for (let index = 0; index < names.length; index += 1) {
      const outputPath = path.join(tempDir, names[index]);
      const outputStats = await stat(outputPath);
      if (outputStats.size <= 1024) {
        throw new Error("Audio conversion produced an empty STT chunk.");
      }
      if (outputStats.size > INTERVIEW_AUDIO_MAX_BYTES) {
        throw new Error("Converted interview audio chunk is larger than the 500 MB transcription limit.");
      }
      chunks.push({
        index,
        start_seconds: index * NORMALIZED_AUDIO_CHUNK_SECONDS,
        duration_hint_seconds: NORMALIZED_AUDIO_CHUNK_SECONDS,
        bytes: await readFile(outputPath),
      });
    }
    return chunks;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 500, { error: "Supabase environment variables are missing." });
      return;
    }

    const authorization = String(req.headers.authorization || "");
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      json(res, 401, { error: "Missing authorization token." });
      return;
    }

    const body = await readJsonBody(req);
    const interviewId = String(body?.interview_id || "").trim();
    const audioBucket = String(body?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET).trim();
    const audioPath = String(body?.audio_file_path || "").trim();
    const audioFileName = String(body?.audio_file_name || "interview-audio.m4a").trim();
    const audioMimeType = String(body?.audio_mime_type || "").trim().toLowerCase();

    if (!interviewId) {
      json(res, 400, { error: "Missing interview_id." });
      return;
    }
    if (!audioPath) {
      json(res, 400, { error: "Missing audio_file_path." });
      return;
    }
    if (audioBucket !== LABOR_INTERVIEW_DOCUMENT_BUCKET) {
      json(res, 400, { error: "Interview audio must be stored in the private labor interview bucket." });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      json(res, 401, { error: userError?.message || "Unauthorized." });
      return;
    }

    const { data: record, error: recordError } = await supabase
      .from("labor_interview_records")
      .select("id, location_id")
      .eq("id", interviewId)
      .single();
    if (recordError || !record) {
      json(res, 404, { error: recordError?.message || "Interview not found." });
      return;
    }

    const expectedPrefix = `${record.location_id}/interviews/${interviewId}/audio/`;
    if (!audioPath.startsWith(expectedPrefix)) {
      json(res, 400, { error: "Audio file path does not match this interview record." });
      return;
    }

    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from(audioBucket)
      .download(audioPath);
    if (downloadError || !audioBlob) {
      json(res, 500, { error: downloadError?.message || "Unable to download interview audio." });
      return;
    }
    if (audioBlob.size > INTERVIEW_AUDIO_MAX_BYTES) {
      json(res, 400, { error: "Interview audio must be 500 MB or smaller." });
      return;
    }

    const inputBuffer = Buffer.from(await audioBlob.arrayBuffer());
    const normalizedChunks = await convertToSttAudioChunks(inputBuffer, audioFileName);
    const uploadedChunks = [];
    for (const chunk of normalizedChunks) {
      const normalizedPath = buildNormalizedAudioPath(audioPath, audioFileName, chunk.index);
      const normalizedFileName = normalizedPath.split("/").pop() || buildInterviewSttAudioChunkFileName(audioFileName, chunk.index);
      const { error: uploadError } = await supabase.storage
        .from(audioBucket)
        .upload(normalizedPath, chunk.bytes, {
          upsert: true,
          contentType: NORMALIZED_AUDIO_MIME_TYPE,
        });
      if (uploadError) {
        json(res, 500, { error: uploadError.message || "Unable to upload normalized interview audio." });
        return;
      }
      uploadedChunks.push({
        audio_file_bucket: audioBucket,
        audio_file_path: normalizedPath,
        audio_file_name: normalizedFileName,
        audio_mime_type: NORMALIZED_AUDIO_MIME_TYPE,
        audio_size_bytes: chunk.bytes.byteLength,
        audio_normalized_for_stt: true,
        chunk_index: chunk.index,
        chunk_total: normalizedChunks.length,
        start_seconds: chunk.start_seconds,
        duration_hint_seconds: chunk.duration_hint_seconds,
      });
    }
    const firstChunk = uploadedChunks[0];

    json(res, 200, {
      ok: true,
      audio_file_bucket: firstChunk.audio_file_bucket,
      audio_file_path: firstChunk.audio_file_path,
      audio_file_name: firstChunk.audio_file_name,
      audio_mime_type: NORMALIZED_AUDIO_MIME_TYPE,
      audio_size_bytes: firstChunk.audio_size_bytes,
      audio_normalized_for_stt: true,
      audio_chunks: uploadedChunks,
      chunk_count: uploadedChunks.length,
      original_audio_file_name: audioFileName,
      original_audio_mime_type: audioMimeType || audioBlob.type || null,
      original_audio_size_bytes: audioBlob.size,
    });
  } catch (error) {
    console.error("Interview audio normalization failed", error);
    json(res, 500, {
      error: error?.message || "Interview audio conversion failed.",
    });
  }
}

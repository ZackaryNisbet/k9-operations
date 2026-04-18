import ffmpegPath from "ffmpeg-static";
import { createClient } from "@supabase/supabase-js";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
const NORMALIZED_AUDIO_MIME_TYPE = "audio/wav";
const NORMALIZED_AUDIO_SAMPLE_RATE = 16000;
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
  return `${withoutExtension || "interview-audio"}-stt.wav`;
}

function buildNormalizedAudioPath(audioPath, audioFileName) {
  const trimmedPath = String(audioPath || "").trim();
  const folder = trimmedPath.includes("/") ? trimmedPath.slice(0, trimmedPath.lastIndexOf("/") + 1) : "";
  return `${folder}${buildInterviewSttAudioFileName(audioFileName)}`;
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

async function convertToSttWav(inputBuffer, originalName) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "k9-interview-audio-"));
  const inputPath = path.join(tempDir, sanitizeInterviewFileName(originalName || "interview-audio.m4a"));
  const outputPath = path.join(tempDir, "interview-stt.wav");

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
      "-sample_fmt",
      "s16",
      outputPath,
    ]);
    const outputStats = await stat(outputPath);
    if (outputStats.size <= 44) {
      throw new Error("Audio conversion produced an empty WAV file.");
    }
    if (outputStats.size > INTERVIEW_AUDIO_MAX_BYTES) {
      throw new Error("Converted interview audio is larger than the 500 MB transcription limit.");
    }
    return await readFile(outputPath);
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
    const wavBuffer = await convertToSttWav(inputBuffer, audioFileName);
    const normalizedPath = buildNormalizedAudioPath(audioPath, audioFileName);
    const normalizedFileName = normalizedPath.split("/").pop() || buildInterviewSttAudioFileName(audioFileName);

    const { error: uploadError } = await supabase.storage
      .from(audioBucket)
      .upload(normalizedPath, wavBuffer, {
        upsert: true,
        contentType: NORMALIZED_AUDIO_MIME_TYPE,
      });
    if (uploadError) {
      json(res, 500, { error: uploadError.message || "Unable to upload normalized interview audio." });
      return;
    }

    json(res, 200, {
      ok: true,
      audio_file_bucket: audioBucket,
      audio_file_path: normalizedPath,
      audio_file_name: normalizedFileName,
      audio_mime_type: NORMALIZED_AUDIO_MIME_TYPE,
      audio_size_bytes: wavBuffer.byteLength,
      audio_normalized_for_stt: true,
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

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") || "";
const XAI_DRAFT_MODEL = Deno.env.get("INTERVIEW_XAI_DRAFT_MODEL") || Deno.env.get("XAI_DRAFT_MODEL") || "grok-4.20-0309-reasoning";

class InterviewFunctionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type DraftTarget = {
  target_type: "custom_question" | "pdf_field";
  key: string;
  prompt: string;
  field_type?: string | null;
  max_length?: number;
};

type AiDraftResponse = {
  target_type: "custom_question" | "pdf_field";
  question_key?: string | null;
  pdf_field_name?: string | null;
  draft_text?: string | null;
  confidence?: number | null;
  evidence?: string[] | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") as Record<string, unknown>[] : [];
}

function buildTargets(record: Record<string, unknown>): DraftTarget[] {
  const snapshot = (record.template_snapshot || {}) as Record<string, unknown>;
  const questions = asArray(snapshot.questions || record.question_snapshot);
  const version = (snapshot.version || {}) as Record<string, unknown>;
  const fields = asArray(version.pdf_field_manifest || record.pdf_field_manifest_snapshot);

  const questionTargets = questions
    .filter((question) => question.question_key && question.prompt)
    .map((question) => ({
      target_type: "custom_question" as const,
      key: String(question.question_key),
      prompt: String(question.prompt),
      max_length: 1200,
    }));

  const fieldTargets = fields
    .filter((field) => field.name && field.type !== "signature")
    .map((field) => ({
      target_type: "pdf_field" as const,
      key: String(field.name),
      prompt: String(field.name),
      field_type: field.type ? String(field.type) : null,
      max_length: field.type === "text" ? 900 : 120,
    }));

  return [...questionTargets, ...fieldTargets];
}

function targetMapKey(response: AiDraftResponse) {
  const key = response.target_type === "pdf_field" ? response.pdf_field_name : response.question_key;
  return `${response.target_type}:${key || ""}`;
}

function clampConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function cleanEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 3);
}

async function readProviderError(response: Response, data: Record<string, unknown> | null) {
  const error = data?.error as Record<string, unknown> | string | undefined;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    return String(error.message || error.code || "xAI Grok request failed.");
  }
  return `xAI Grok request failed with HTTP ${response.status}.`;
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
    throw new InterviewFunctionError(message, response.status);
  }
  const userId = String(data?.id || "").trim();
  if (!userId) throw new InterviewFunctionError("Unauthorized.", 401);
  return userId;
}

function validateDrafts(payload: unknown, targets: DraftTarget[]) {
  const targetByKey = new Map(targets.map((target) => [`${target.target_type}:${target.key}`, target]));
  const rows = asArray((payload as Record<string, unknown>)?.responses);
  const valid: Array<AiDraftResponse & { prompt_snapshot: string }> = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const response = row as AiDraftResponse;
    const mapKey = targetMapKey(response);
    const target = targetByKey.get(mapKey);
    if (!target) {
      skipped.push(mapKey);
      continue;
    }
    const maxLength = target.max_length || 900;
    valid.push({
      target_type: target.target_type,
      question_key: target.target_type === "custom_question" ? target.key : null,
      pdf_field_name: target.target_type === "pdf_field" ? target.key : null,
      draft_text: String(response.draft_text || "").trim().slice(0, maxLength),
      confidence: clampConfidence(response.confidence),
      evidence: cleanEvidence(response.evidence),
      prompt_snapshot: target.prompt,
    });
  }

  return { valid, skipped };
}

function buildGrokPayload(transcript: string, targets: DraftTarget[]) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      responses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            target_type: { type: "string", enum: ["custom_question", "pdf_field"] },
            question_key: { type: "string" },
            pdf_field_name: { type: "string" },
            draft_text: { type: "string" },
            confidence: { type: "number" },
            evidence: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["target_type", "question_key", "pdf_field_name", "draft_text", "confidence", "evidence"],
        },
      },
    },
    required: ["responses"],
  };

  return {
    model: XAI_DRAFT_MODEL,
    temperature: 0.1,
    max_tokens: 12000,
    deferred: true,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "interview_draft_responses",
        strict: true,
        schema,
      },
    },
    messages: [
      {
        role: "system",
        content: [
          "You draft K9 Resorts interview notes for a manager.",
          "Use only facts explicitly supported by the supplied transcript.",
          "If the transcript does not support a field, return an empty draft_text for that field.",
          "Return exactly one response object for every target supplied.",
          "Keep wording concise, factual, and suitable for a manager-edited form.",
          "Do not infer, embellish, or fill gaps from general knowledge.",
          "Include short evidence snippets for non-empty answers.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          transcript,
          targets,
        }),
      },
    ],
  };
}

async function startGrokDraft(transcript: string, targets: DraftTarget[]) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGrokPayload(transcript, targets)),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new InterviewFunctionError(await readProviderError(response, data), response.status || 502);
  }
  const requestId = String(data?.request_id || "").trim();
  if (!requestId) throw new InterviewFunctionError("xAI Grok did not return a deferred request id.", 502);
  return requestId;
}

async function pollGrokDraft(requestId: string) {
  const response = await fetch(`https://api.x.ai/v1/chat/deferred-completion/${encodeURIComponent(requestId)}`, {
    headers: {
      "Authorization": `Bearer ${XAI_API_KEY}`,
    },
  });

  if (response.status === 202) {
    return { pending: true, payload: null, model: XAI_DRAFT_MODEL, usage: null };
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new InterviewFunctionError(await readProviderError(response, data), response.status || 502);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new InterviewFunctionError("xAI Grok returned an empty deferred draft.", 502);
  try {
    return {
      pending: false,
      payload: JSON.parse(content),
      model: data?.model || XAI_DRAFT_MODEL,
      usage: data?.usage || null,
    };
  } catch (error) {
    throw new InterviewFunctionError(`xAI Grok returned invalid deferred draft JSON: ${error?.message || "parse failed"}`, 502);
  }
}

function getRecordMetadata(record: Record<string, unknown>) {
  return ((record.metadata || {}) as Record<string, unknown>);
}

function getDraftJob(record: Record<string, unknown>) {
  return (getRecordMetadata(record).ai_draft_job || {}) as Record<string, unknown>;
}

async function saveDraftPayload(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
  interviewId: string,
  userId: string,
  targets: DraftTarget[],
  aiPayload: unknown,
  options: { requestId: string; model: string; usage: unknown },
) {
  const { valid, skipped } = validateDrafts(aiPayload, targets);

  const { data: existingRows, error: responseError } = await supabase
    .from("labor_interview_responses")
    .select("*")
    .eq("interview_id", interviewId);
  if (responseError) throw responseError;

  const existingByTarget = new Map<string, Record<string, unknown>>();
  for (const row of existingRows || []) {
    if (row.response_type === "custom_question" && row.question_key) {
      existingByTarget.set(`custom_question:${row.question_key}`, row);
    }
    if (row.response_type === "pdf_field" && row.pdf_field_name) {
      existingByTarget.set(`pdf_field:${row.pdf_field_name}`, row);
    }
  }

  let savedCount = 0;
  for (const row of valid) {
    const key = targetMapKey(row);
    const existing = existingByTarget.get(key);
    const payload = {
      ai_draft_text: row.draft_text || null,
      ai_confidence: row.confidence,
      ai_evidence: row.evidence || [],
      prompt_snapshot: row.prompt_snapshot,
      updated_by_user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      const { error } = await supabase
        .from("labor_interview_responses")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("labor_interview_responses")
        .insert({
          interview_id: interviewId,
          response_type: row.target_type,
          question_key: row.question_key,
          pdf_field_name: row.pdf_field_name,
          ...payload,
          created_by_user_id: userId,
        });
      if (error) throw error;
    }
    savedCount += 1;
  }

  const completedAt = new Date().toISOString();
  const metadata = getRecordMetadata(record);
  const draftJob = getDraftJob(record);
  await supabase
    .from("labor_interview_records")
    .update({
      status: "ai_drafted",
      metadata: {
        ...metadata,
        ai_draft_job: {
          ...draftJob,
          provider: "xai",
          model: options.model,
          request_id: options.requestId,
          status: "completed",
          completed_at: completedAt,
          target_count: targets.length,
        },
        last_ai_draft: {
          provider: "xai",
          model: options.model,
          generated_at: completedAt,
          saved_count: savedCount,
          skipped_count: skipped.length,
          target_count: targets.length,
          request_id: options.requestId,
          usage: options.usage,
        },
      },
      updated_by_user_id: userId,
      updated_at: completedAt,
    })
    .eq("id", interviewId);

  return { savedCount, skipped };
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

    const requestBody = await req.json();
    const { interview_id } = requestBody;
    const action = String(requestBody.action || "start").trim();
    if (!interview_id) return jsonResponse({ error: "Missing interview_id." }, 400);
    if (!["start", "poll"].includes(action)) return jsonResponse({ error: "Unsupported Grok draft action." }, 400);

    const { data: record, error: recordError } = await supabase
      .from("labor_interview_records")
      .select("*")
      .eq("id", interview_id)
      .single();
    if (recordError || !record) {
      return jsonResponse({ error: recordError?.message || "Interview not found." }, 404);
    }

    const transcript = String(record.transcript_text || "").trim();
    if (!transcript) {
      return jsonResponse({ error: "Transcript text is required before Grok drafting." }, 400);
    }

    const targets = buildTargets(record as Record<string, unknown>);
    if (targets.length === 0) {
      return jsonResponse({ error: "No interview targets are available for this template snapshot." }, 400);
    }

    const metadata = getRecordMetadata(record as Record<string, unknown>);
    const draftJob = getDraftJob(record as Record<string, unknown>);
    const existingRequestId = String(draftJob.request_id || "").trim();

    if (action === "start") {
      if (draftJob.status === "pending" && existingRequestId) {
        return jsonResponse({
          ok: true,
          pending: true,
          reused: true,
          request_id: existingRequestId,
          provider: "xai",
          model: String(draftJob.model || XAI_DRAFT_MODEL),
          target_count: Number(draftJob.target_count || targets.length),
        });
      }

      const requestId = await startGrokDraft(transcript, targets);
      const startedAt = new Date().toISOString();
      await supabase
        .from("labor_interview_records")
        .update({
          metadata: {
            ...metadata,
            ai_draft_job: {
              provider: "xai",
              model: XAI_DRAFT_MODEL,
              request_id: requestId,
              status: "pending",
              started_at: startedAt,
              target_count: targets.length,
            },
          },
          updated_by_user_id: userId,
          updated_at: startedAt,
        })
        .eq("id", interview_id);

      return jsonResponse({
        ok: true,
        pending: true,
        request_id: requestId,
        provider: "xai",
        model: XAI_DRAFT_MODEL,
        target_count: targets.length,
      });
    }

    const requestId = String(requestBody.request_id || existingRequestId || "").trim();
    if (!requestId) {
      return jsonResponse({ error: "No pending Grok draft request was found for this interview." }, 400);
    }

    const pollResult = await pollGrokDraft(requestId);
    if (pollResult.pending) {
      const polledAt = new Date().toISOString();
      await supabase
        .from("labor_interview_records")
        .update({
          metadata: {
            ...metadata,
            ai_draft_job: {
              ...draftJob,
              provider: "xai",
              model: String(draftJob.model || XAI_DRAFT_MODEL),
              request_id: requestId,
              status: "pending",
              last_polled_at: polledAt,
              target_count: Number(draftJob.target_count || targets.length),
            },
          },
          updated_by_user_id: userId,
          updated_at: polledAt,
        })
        .eq("id", interview_id);

      return jsonResponse({
        ok: true,
        pending: true,
        request_id: requestId,
        provider: "xai",
        model: String(draftJob.model || XAI_DRAFT_MODEL),
        target_count: Number(draftJob.target_count || targets.length),
      });
    }

    const { savedCount, skipped } = await saveDraftPayload(
      supabase,
      record as Record<string, unknown>,
      interview_id,
      userId,
      targets,
      pollResult.payload,
      {
        requestId,
        model: String(pollResult.model || draftJob.model || XAI_DRAFT_MODEL),
        usage: pollResult.usage,
      },
    );

    return jsonResponse({
      ok: true,
      pending: false,
      saved_count: savedCount,
      skipped_targets: skipped,
      provider: "xai",
      model: String(pollResult.model || draftJob.model || XAI_DRAFT_MODEL),
      request_id: requestId,
    });
  } catch (error) {
    return jsonResponse({ error: error?.message || "Interview Grok draft failed." }, error?.status || 500);
  }
});

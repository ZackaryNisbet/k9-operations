import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") || "";
const XAI_DRAFT_MODEL = Deno.env.get("INTERVIEW_XAI_DRAFT_MODEL") || Deno.env.get("XAI_DRAFT_MODEL") || "grok-4.20-0309-reasoning";

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

async function callGrok(transcript: string, targets: DraftTarget[]) {
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

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: XAI_DRAFT_MODEL,
      temperature: 0.1,
      max_tokens: 4096,
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
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "xAI Grok request failed.");
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("xAI Grok returned an empty draft.");
  return JSON.parse(content);
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

    const { interview_id } = await req.json();
    if (!interview_id) return jsonResponse({ error: "Missing interview_id." }, 400);

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

    const aiPayload = await callGrok(transcript, targets);
    const { valid, skipped } = validateDrafts(aiPayload, targets);

    const { data: existingRows, error: responseError } = await supabase
      .from("labor_interview_responses")
      .select("*")
      .eq("interview_id", interview_id);
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
        updated_by_user_id: userData.user.id,
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
            interview_id,
            response_type: row.target_type,
            question_key: row.question_key,
            pdf_field_name: row.pdf_field_name,
            ...payload,
            created_by_user_id: userData.user.id,
          });
        if (error) throw error;
      }
      savedCount += 1;
    }

    await supabase
      .from("labor_interview_records")
      .update({
        status: "ai_drafted",
        metadata: {
          ...((record.metadata || {}) as Record<string, unknown>),
          last_ai_draft: {
            provider: "xai",
            model: XAI_DRAFT_MODEL,
            generated_at: new Date().toISOString(),
            saved_count: savedCount,
            skipped_count: skipped.length,
          },
        },
        updated_by_user_id: userData.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", interview_id);

    return jsonResponse({
      ok: true,
      saved_count: savedCount,
      skipped_targets: skipped,
      provider: "xai",
      model: XAI_DRAFT_MODEL,
    });
  } catch (error) {
    return jsonResponse({ error: error?.message || "Interview Grok draft failed." }, 500);
  }
});

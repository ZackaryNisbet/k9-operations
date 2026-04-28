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
const DOCUMENT_PDF_INSTRUCTION_KEY = "__document";

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
  review_mode?: "literal" | "inferred" | "speculative";
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

function sanitizeManagerInstruction(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1400);
}

function normalizeReviewMode(value: unknown): "literal" | "inferred" | "speculative" {
  const text = String(value || "").trim().toLowerCase();
  if (text === "inferred") return "inferred";
  if (text === "speculative") return "speculative";
  return "literal";
}

function reviewModeInstruction(mode: string) {
  if (mode === "speculative") {
    return [
      "Speculative mode: you may use looser trait matching across the transcript.",
      "The answer still must be logical and relevant to the target, and every non-empty response needs evidence.",
      "Do not invent facts, credentials, events, or outcomes that are not supported by the transcript.",
    ].join(" ");
  }
  if (mode === "inferred") {
    return [
      "Inferred mode: the exact question does not need to be asked.",
      "You may fill a target when the transcript demonstrates a relevant behavior, trait, or response quality.",
      "Keep the wording clear that the answer is based on demonstrated interview evidence.",
    ].join(" ");
  }
  return [
    "Literal mode: fill only when the interviewer asked this exact question, a clear rephrase, or the candidate directly answered the same point.",
    "If the transcript only loosely relates to the target, return an empty draft_text.",
  ].join(" ");
}

function normalizeInstructionMap(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const entries = Object.entries(source)
    .map(([key, instruction]) => [String(key || "").trim(), sanitizeManagerInstruction(instruction)] as const)
    .filter(([key, instruction]) => key && instruction);
  return new Map(entries);
}

function normalizePdfQuestionPrompts(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const map = new Map<string, string>();
  for (const [key, prompt] of Object.entries(source)) {
    const number = String(key || "").match(/\d+/)?.[0] || "";
    const normalizedKey = number ? number.padStart(2, "0") : String(key || "").trim();
    const text = String(prompt || "")
      .replace(/\s+/g, " ")
      .replace(/\bPage\s+\d+\s*\|.*$/i, "")
      .trim();
    if (normalizedKey && text) map.set(normalizedKey, text.slice(0, 900));
  }
  return map;
}

function getSnapshotQuestionPrompts(record: Record<string, unknown>) {
  const snapshot = (record.template_snapshot || {}) as Record<string, unknown>;
  const version = (snapshot.version || {}) as Record<string, unknown>;
  const snapshotMetadata = (snapshot.metadata || {}) as Record<string, unknown>;
  const versionMetadata = (version.metadata || {}) as Record<string, unknown>;
  const guideMetadata = (record.guide_metadata || {}) as Record<string, unknown>;
  return [
    versionMetadata.pdf_question_prompts,
    versionMetadata.pdfQuestionPrompts,
    snapshotMetadata.pdf_question_prompts,
    guideMetadata.pdf_question_prompts,
  ].reduce((merged, value) => {
    for (const [key, prompt] of normalizePdfQuestionPrompts(value).entries()) {
      if (!merged.has(key)) merged.set(key, prompt);
    }
    return merged;
  }, new Map<string, string>());
}

function getPdfQuestionNumber(fieldName: string) {
  const match = String(fieldName || "").match(/^q(\d{1,2})_(situation|task|action|result|notes(?:_\d+)?)$/i);
  return match?.[1] ? match[1].padStart(2, "0") : "";
}

function buildNumberedPdfQuestionPrompt(fieldName: string, questionPrompt = "") {
  const match = String(fieldName || "").match(/^q(\d{2})_(situation|task|action|result|notes(?:_\d+)?)$/i);
  if (!match) return "";
  const questionNo = match[1];
  const section = match[2].replace(/_\d+$/, "").toLowerCase();
  const sectionLabel = section === "notes" ? "supporting notes" : section;
  const questionContext = questionPrompt
    ? `Q${Number(questionNo)}. ${questionPrompt}`
    : `Q${Number(questionNo)} from the PDF interview guide`;
  return [
    `PDF field "${fieldName}" is the ${sectionLabel} line for ${questionContext}.`,
    "Search the entire transcript for this numbered question, a near-verbatim prompt, or the same core phrases.",
    "Use the candidate answer immediately following the direct question before considering any earlier loosely similar exchange.",
    "If the candidate's answer is conversational rather than neatly labeled as STAR, split the supported facts into Situation, Task, Action, and Result lines without adding outside facts.",
    `Return only the ${sectionLabel} content for this STAR field, not the full answer.`,
  ].join(" ");
}

function withManagerInstruction(prompt: string, instruction: string) {
  const cleanInstruction = sanitizeManagerInstruction(instruction);
  if (!cleanInstruction) return prompt;
  const wantsFullInference = /\b(every|all)\s+(pdf\s+)?fields?\b|\binfer\b|\bpopulate\b/i.test(cleanInstruction);
  return [
    prompt,
    `Manager population instruction: ${cleanInstruction}`,
    "Treat this instruction as first-party interviewer guidance about what the manager wants this PDF field to capture.",
    "Use it together with the transcript; when the instruction describes observed reaction or tone, phrase the answer as manager-observed rather than inventing unsupported facts.",
    wantsFullInference
      ? "The manager explicitly wants a fully populated guide. For this PDF field, draft the best manager-ready answer from the entire dialogue and manager instruction instead of leaving it blank for merely implicit support. Use neutral wording when the answer is inferred."
      : "",
  ].join(" ");
}

function getPdfPopulationInstruction(fieldName: string, instructions: Map<string, string>) {
  return [
    instructions.get(DOCUMENT_PDF_INSTRUCTION_KEY) || "",
    instructions.get(fieldName) || "",
  ].filter(Boolean).join(" ");
}

function buildTargets(
  record: Record<string, unknown>,
  options: {
    autoScoreCandidate?: boolean;
    targetPdfFieldName?: string;
    pdfPopulationInstructions?: Map<string, string>;
    pdfOnly?: boolean;
    customOnly?: boolean;
    reviewMode?: "literal" | "inferred" | "speculative";
  } = {},
): DraftTarget[] {
  const snapshot = (record.template_snapshot || {}) as Record<string, unknown>;
  const questions = asArray(snapshot.questions || record.question_snapshot);
  const version = (snapshot.version || {}) as Record<string, unknown>;
  const fields = asArray(version.pdf_field_manifest || record.pdf_field_manifest_snapshot);
  const questionByMappedField = new Map<string, Record<string, unknown>>();
  const pdfQuestionPrompts = getSnapshotQuestionPrompts(record);
  const targetPdfFieldName = String(options.targetPdfFieldName || "").trim();
  const pdfPopulationInstructions = options.pdfPopulationInstructions || new Map<string, string>();

  for (const question of questions) {
    const mapped = String(question.mapped_pdf_field_name || "").trim();
    if (mapped) questionByMappedField.set(mapped, question);
  }

  const questionTargets = questions
    .filter((question) => question.question_key && question.prompt)
    .map((question) => ({
      target_type: "custom_question" as const,
      key: String(question.question_key),
      prompt: String(question.prompt),
      max_length: 1200,
      review_mode: options.reviewMode || "literal",
    }));

  const fieldTargets = fields
    .filter((field) => field.name && field.type !== "signature")
    .filter((field) => !targetPdfFieldName || String(field.name) === targetPdfFieldName)
    .map((field) => {
      const fieldName = String(field.name);
      const mappedQuestion = questionByMappedField.get(fieldName);
      const questionNumber = getPdfQuestionNumber(fieldName);
      const inferredNumberedPrompt = buildNumberedPdfQuestionPrompt(fieldName, questionNumber ? pdfQuestionPrompts.get(questionNumber) || "" : "");
      const basePrompt = mappedQuestion?.prompt
        ? `PDF field "${fieldName}" should answer this interview prompt: ${String(mappedQuestion.prompt)}`
        : inferredNumberedPrompt
          ? inferredNumberedPrompt
        : buildPdfFieldPrompt(fieldName, options);
      const fieldPrompt = withManagerInstruction(basePrompt, getPdfPopulationInstruction(fieldName, pdfPopulationInstructions));
      return {
        target_type: "pdf_field" as const,
        key: fieldName,
        prompt: fieldPrompt,
        field_type: field.type ? String(field.type) : null,
        max_length: field.type === "text" ? 900 : 120,
        review_mode: options.reviewMode || "literal",
      };
    });

  if (options.customOnly) return questionTargets;
  return targetPdfFieldName || options.pdfOnly ? fieldTargets : [...questionTargets, ...fieldTargets];
}

function buildPdfFieldPrompt(fieldName: string, options: { autoScoreCandidate?: boolean } = {}) {
  const normalized = fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/candidate.*name|applicant.*name|full.*name/.test(normalized)) return `Candidate full name from interview metadata for PDF field "${fieldName}".`;
  if (/position|role/.test(normalized)) return `Candidate role or position from interview metadata for PDF field "${fieldName}".`;
  if (/scorecard.*date|interview.*date|date/.test(normalized)) return `Interview date from interview metadata for PDF field "${fieldName}".`;
  if (/interview.*time|time/.test(normalized)) return `Interview time from interview metadata for PDF field "${fieldName}".`;
  if (/interviewer|manager/.test(normalized)) return `Interviewer name from interview metadata for PDF field "${fieldName}".`;
  const scorecardField = /score|decision|strongest|concern|recommend|move.*forward|second.*interview/.test(normalized);
  if (scorecardField && !options.autoScoreCandidate) {
    return `Scorecard field "${fieldName}" is manager-controlled. Return an empty draft_text unless the transcript explicitly contains the manager's stated score or decision.`;
  }
  if (/score.*notes|notes.*score|strongest|concern/.test(normalized)) {
    return `Draft the scorecard note for PDF field "${fieldName}" from transcript evidence only. Be concise, specific, and manager-ready.`;
  }
  if (/^score_|overall_score|rating/.test(normalized)) {
    return `Automatically score PDF field "${fieldName}" from the transcript only. Use a 1-4 score where 1 is poor, 2 is concerning, 3 is solid, and 4 is excellent. Return only the score number.`;
  }
  if (/decision.*do.*not|do.*not.*move|decision.*move.*forward|move.*forward|decision.*reservation|reservation|decision.*second|second.*interview|recommend|next.*step|status/.test(normalized)) {
    return `Choose the hiring recommendation for PDF field "${fieldName}" from transcript evidence only. For selected checkbox-like decision fields, return "X"; for unselected decision fields, return an empty draft_text.`;
  }
  return `PDF field "${fieldName}". Draft only if the transcript clearly supports what belongs in this form field.`;
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

function cleanTranscriptSummaryBullets(payload: unknown) {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const source = Array.isArray(body.transcript_summary_bullets)
    ? body.transcript_summary_bullets
    : Array.isArray(body.summary_bullets)
      ? body.summary_bullets
      : [];
  return source
    .map((entry) => String(entry || "").replace(/\s+/g, " ").trim().slice(0, 260))
    .filter(Boolean)
    .slice(0, 10);
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function draftJobMatchesRequest(
  draftJob: Record<string, unknown>,
  options: {
    interviewGuideId: string;
    targetPdfFieldName: string;
    pdfPopulationInstructions: Map<string, string>;
    pdfOnly: boolean;
    customOnly: boolean;
    summaryOnly?: boolean;
    reviewMode: "literal" | "inferred" | "speculative";
  },
) {
  if (asBoolean(draftJob.summary_only) !== !!options.summaryOnly) return false;
  const existingGuideId = String(draftJob.interview_guide_id || "").trim();
  if (existingGuideId !== options.interviewGuideId) return false;
  const existingMode = normalizeReviewMode(draftJob.review_mode);
  if (existingMode !== options.reviewMode) return false;
  const existingTarget = String(draftJob.target_pdf_field_name || "").trim();
  if (existingTarget !== options.targetPdfFieldName) return false;
  if (asBoolean(draftJob.pdf_only) !== options.pdfOnly) return false;
  if (asBoolean(draftJob.custom_only) !== options.customOnly) return false;
  const existingInstructions = normalizeInstructionMap(draftJob.pdf_population_instructions);
  if (existingInstructions.size !== options.pdfPopulationInstructions.size) return false;
  for (const [key, instruction] of options.pdfPopulationInstructions.entries()) {
    if (existingInstructions.get(key) !== instruction) return false;
  }
  return true;
}

async function readProviderError(response: Response, data: Record<string, unknown> | null) {
  const error = data?.error as Record<string, unknown> | string | undefined;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    return String(error.message || error.code || "xAI Grok request failed.");
  }
  return `xAI Grok request failed with HTTP ${response.status}.`;
}

function getAuthenticatedUserId(token: string) {
  const payload = token.split(".")[1] || "";
  if (!payload) throw new InterviewFunctionError("Unauthorized.", 401);
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(atob(padded));
  } catch (_) {
    throw new InterviewFunctionError("Unauthorized.", 401);
  }
  const userId = String(data?.sub || "").trim();
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

function buildCandidateContext(record: Record<string, unknown>) {
  return {
    candidate_full_name: record.candidate_full_name || null,
    candidate_position: record.candidate_position || null,
    candidate_email: record.candidate_email || null,
    candidate_phone: record.candidate_phone || null,
    interview_date: record.interview_date || null,
    interview_time: record.interview_time || null,
    interviewer_name: record.interviewer_name || null,
  };
}

function buildGrokPayload(transcript: string, targets: DraftTarget[], candidate: Record<string, unknown>) {
  const reviewModes = Array.from(new Set(targets.map((target) => target.review_mode || "literal")));
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
      transcript_summary_bullets: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["responses", "transcript_summary_bullets"],
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
          "Use the supplied review_mode on each target to decide how strict the transcript match must be.",
          "Literal, inferred, and speculative are evidence strictness settings, not permission to fabricate.",
          "Literal mode rule: only fill direct answers or clear rephrases of the target question.",
          "Inferred mode rule: fill when the transcript demonstrates the relevant behavior or trait even if the exact question was not asked.",
          "Speculative mode rule: use looser trait matching, but still keep the answer logical, relevant, and evidence-backed.",
          "Use only facts supported by the supplied transcript or allowed candidate metadata.",
          "You may use supplied candidate metadata only for identity/date/role fields, never for interview substance.",
          "Manager population instructions are first-party manager context and may be used as factual context for PDF drafting.",
          "For numbered PDF STAR fields such as q01_situation, q01_task, q01_action, and q01_result, first find the matching numbered interview question and use the candidate's answer that follows it.",
          "If the interviewer explicitly asks a target question, that direct answer has priority over any similar or hypothetical exchange.",
          "Do not skip a numbered STAR field just because the candidate answered conversationally; extract the supported Situation, Task, Action, and Result from that direct answer when possible.",
          "For Q1 customer-upset fields, search for the interviewer asking about an upset or frustrated customer anywhere in the transcript, including the end of the interview.",
          "Do not invent hypothetical scenarios unless the candidate explicitly framed the answer as hypothetical.",
          "Manager population instructions are allowed source context for what to put in a PDF field, but keep the final wording factual and manager-ready.",
          "If neither the transcript, candidate metadata, nor manager population instruction supports a field, return an empty draft_text for that field.",
          "When a manager population instruction explicitly asks to infer or populate every PDF field, do not leave PDF fields blank just because support is implicit; write the best supported manager-ready draft and keep the language honest about inference.",
          "Also produce transcript_summary_bullets: 6-10 concise bullets summarizing the interview conversation as a whole.",
          "The transcript summary should cover topics discussed, candidate motivations/context, traits demonstrated, interviewer reactions or concerns, and notable follow-up context.",
          "Do not make the transcript summary a field-by-field checklist; write it as HR-ready context for understanding the conversation.",
          "Use only transcript-supported facts in the transcript summary and keep bullets objective and concise.",
          "If no targets are supplied, return responses as an empty array and still produce transcript_summary_bullets.",
          "Return exactly one response object for every target supplied.",
          "Keep wording concise, factual, and suitable for a manager-edited form.",
          "Do not infer, embellish, or fill gaps from general knowledge.",
          "Include short evidence snippets for non-empty answers.",
          `Active review mode guidance: ${reviewModes.map(reviewModeInstruction).join(" ")}`,
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          candidate,
          transcript,
          targets,
        }),
      },
    ],
  };
}

async function startGrokDraft(transcript: string, targets: DraftTarget[], candidate: Record<string, unknown>) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGrokPayload(transcript, targets, candidate)),
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

function recordWithGuideSnapshot(record: Record<string, unknown>, guide: Record<string, unknown> | null) {
  if (!guide) return record;
  return {
    ...record,
    guide_metadata: guide.metadata || {},
    template_id: guide.template_id,
    template_version_id: guide.template_version_id,
    template_snapshot: guide.template_snapshot || {},
    pdf_field_manifest_snapshot: guide.pdf_field_manifest_snapshot || [],
    question_snapshot: guide.question_snapshot || [],
  };
}

function mergeGuideVersionContext(
  guide: Record<string, unknown>,
  version: Record<string, unknown> | null,
) {
  if (!version) return guide;
  const snapshot = (guide.template_snapshot || {}) as Record<string, unknown>;
  const snapshotVersion = (snapshot.version || {}) as Record<string, unknown>;
  const mergedVersion = {
    ...snapshotVersion,
    metadata: {
      ...((snapshotVersion.metadata || {}) as Record<string, unknown>),
      ...((version.metadata || {}) as Record<string, unknown>),
    },
    pdf_field_manifest: Array.isArray(snapshotVersion.pdf_field_manifest) && snapshotVersion.pdf_field_manifest.length
      ? snapshotVersion.pdf_field_manifest
      : version.pdf_field_manifest,
    source_pdf_bucket: snapshotVersion.source_pdf_bucket || version.source_pdf_bucket,
    source_pdf_path: snapshotVersion.source_pdf_path || version.source_pdf_path,
    source_pdf_file_name: snapshotVersion.source_pdf_file_name || version.source_pdf_file_name,
    pdf_page_count: snapshotVersion.pdf_page_count || version.pdf_page_count,
  };
  return {
    ...guide,
    template_snapshot: {
      ...snapshot,
      version: mergedVersion,
    },
  };
}

async function loadInterviewGuide(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
  interviewId: string,
  requestedGuideId: string,
) {
  let query = supabase
    .from("labor_interview_record_guides")
    .select("*")
    .eq("interview_id", interviewId);
  if (requestedGuideId) query = query.eq("id", requestedGuideId);
  query = query.order("sequence_order", { ascending: true }).order("created_at", { ascending: true }).limit(1);

  const { data, error } = await query;
  if (error) throw new InterviewFunctionError(error.message || "Unable to load attached interview guide.", 500);
  const guide = Array.isArray(data) && data.length ? data[0] : null;
  if (requestedGuideId && !guide) throw new InterviewFunctionError("Attached interview guide was not found.", 404);
  if (guide) {
    const templateVersionId = String((guide as Record<string, unknown>).template_version_id || "").trim();
    if (!templateVersionId) return guide as Record<string, unknown>;
    const { data: version } = await supabase
      .from("labor_interview_template_versions")
      .select("metadata,pdf_field_manifest,source_pdf_bucket,source_pdf_path,source_pdf_file_name,pdf_page_count")
      .eq("id", templateVersionId)
      .maybeSingle();
    return mergeGuideVersionContext(guide as Record<string, unknown>, (version || null) as Record<string, unknown> | null);
  }
  return null;
}

async function saveDraftPayload(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
  interviewId: string,
  interviewGuideId: string | null,
  userId: string,
  targets: DraftTarget[],
  aiPayload: unknown,
  options: { requestId: string; model: string; usage: unknown; reviewMode: "literal" | "inferred" | "speculative"; summaryOnly?: boolean },
) {
  const { valid, skipped } = validateDrafts(aiPayload, targets);
  const transcriptSummaryBullets = cleanTranscriptSummaryBullets(aiPayload);

  let responseQuery = supabase
    .from("labor_interview_responses")
    .select("*")
    .eq("interview_id", interviewId);
  responseQuery = interviewGuideId
    ? responseQuery.eq("interview_guide_id", interviewGuideId)
    : responseQuery.is("interview_guide_id", null);
  const { data: existingRows, error: responseError } = await responseQuery;
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
  let populatedCount = 0;
  for (const row of valid) {
    const key = targetMapKey(row);
    const existing = existingByTarget.get(key);
    const draftText = String(row.draft_text || "").trim();
    if (draftText) populatedCount += 1;
    const existingManualText = String(existing?.response_text || "").trim();
    const mergedText = existingManualText && draftText
      ? [existingManualText, draftText].filter((entry, index, list) => list.findIndex((item) => item === entry) === index).join("\n")
      : null;
    const payload = {
      ai_draft_text: draftText || null,
      ai_confidence: row.confidence,
      ai_evidence: row.evidence || [],
      ai_review_mode: options.reviewMode,
      manual_notes_text: existingManualText || existing?.manual_notes_text || null,
      ai_merged_text: mergedText,
      response_state: mergedText ? "merged_draft" : (draftText ? "ai_draft" : "blank"),
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
          interview_guide_id: interviewGuideId,
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
      ...(options.summaryOnly ? {} : { status: "ai_drafted" }),
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
        ...(options.summaryOnly
          ? {
            last_ai_summary: {
              provider: "xai",
              model: options.model,
              generated_at: completedAt,
              bullet_count: transcriptSummaryBullets.length,
              request_id: options.requestId,
              usage: options.usage,
            },
          }
          : {
            last_ai_draft: {
              provider: "xai",
              model: options.model,
              generated_at: completedAt,
              saved_count: savedCount,
              populated_count: populatedCount,
              skipped_count: skipped.length,
              target_count: targets.length,
              review_mode: options.reviewMode,
              request_id: options.requestId,
              usage: options.usage,
            },
          }),
        ...(transcriptSummaryBullets.length
          ? {
            interview_summary: {
              source: "ai_transcript_summary",
              bullets: transcriptSummaryBullets,
              generated_at: completedAt,
              provider: "xai",
              model: options.model,
              review_mode: options.reviewMode,
              request_id: options.requestId,
            },
          }
          : {}),
      },
      updated_by_user_id: userId,
      updated_at: completedAt,
    })
    .eq("id", interviewId);

  if (interviewGuideId && !options.summaryOnly) {
    const guideMetadata = ((record.guide_metadata || {}) as Record<string, unknown>);
    await supabase
      .from("labor_interview_record_guides")
      .update({
        guide_status: "ai_drafted",
        metadata: {
          ...guideMetadata,
          last_ai_draft: {
            provider: "xai",
            model: options.model,
            generated_at: completedAt,
            saved_count: savedCount,
            populated_count: populatedCount,
            review_mode: options.reviewMode,
            request_id: options.requestId,
          },
        },
        updated_by_user_id: userId,
        updated_at: completedAt,
      })
      .eq("id", interviewGuideId);
  }

  return { savedCount, populatedCount, skipped, transcriptSummaryBullets };
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

    const userId = getAuthenticatedUserId(token);

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

    const metadata = getRecordMetadata(record as Record<string, unknown>);
    const draftJob = getDraftJob(record as Record<string, unknown>);
    const autoScoreCandidate = asBoolean(
      requestBody.auto_score_candidate ?? draftJob.auto_score_candidate ?? metadata.auto_score_candidate ?? false,
    );
    const requestedInterviewGuideId = String(requestBody.interview_guide_id || "").trim();
    const storedInterviewGuideId = String(draftJob.interview_guide_id || "").trim();
    const interviewGuideId = action === "poll" ? storedInterviewGuideId : requestedInterviewGuideId;
    const requestedReviewMode = normalizeReviewMode(requestBody.review_mode || metadata.ai_review_mode || "literal");
    const storedReviewMode = normalizeReviewMode(draftJob.review_mode || requestedReviewMode);
    const reviewMode = action === "poll" ? storedReviewMode : requestedReviewMode;
    const guide = await loadInterviewGuide(supabase, record as Record<string, unknown>, String(interview_id), interviewGuideId);
    const targetRecord = recordWithGuideSnapshot(record as Record<string, unknown>, guide);
    const activeGuideId = guide?.id ? String(guide.id) : "";
    const requestedTargetPdfFieldName = String(requestBody.target_pdf_field_name || "").trim();
    const storedTargetPdfFieldName = String(draftJob.target_pdf_field_name || "").trim();
    const targetPdfFieldName = action === "poll" ? storedTargetPdfFieldName : requestedTargetPdfFieldName;
    const requestedPdfOnly = asBoolean(requestBody.pdf_only);
    const storedPdfOnly = asBoolean(draftJob.pdf_only);
    const pdfOnly = action === "poll" ? storedPdfOnly : requestedPdfOnly;
    const requestedCustomOnly = asBoolean(requestBody.custom_only);
    const storedCustomOnly = asBoolean(draftJob.custom_only);
    const customOnly = action === "poll" ? storedCustomOnly : requestedCustomOnly;
    const requestedSummaryOnly = asBoolean(requestBody.summary_only);
    const storedSummaryOnly = asBoolean(draftJob.summary_only);
    const summaryOnly = action === "poll" ? storedSummaryOnly : requestedSummaryOnly;
    const requestedInstructions = normalizeInstructionMap(requestBody.pdf_population_instructions);
    const storedInstructions = normalizeInstructionMap(draftJob.pdf_population_instructions);
    const pdfPopulationInstructions = action === "poll"
      ? storedInstructions
      : requestedInstructions;
    if (targetPdfFieldName && !pdfPopulationInstructions.has(targetPdfFieldName)) {
      return jsonResponse({ error: "PDF population instructions are required for targeted AI fill." }, 400);
    }

    const targets = summaryOnly ? [] : buildTargets(targetRecord as Record<string, unknown>, {
      autoScoreCandidate,
      targetPdfFieldName,
      pdfPopulationInstructions,
      pdfOnly,
      customOnly,
      reviewMode,
    });
    if (!summaryOnly && targets.length === 0) {
      return jsonResponse({ error: "No interview targets are available for this template snapshot." }, 400);
    }

    const existingRequestId = String(draftJob.request_id || "").trim();

    if (action === "start") {
      const canReusePending = draftJobMatchesRequest(draftJob, {
        interviewGuideId: activeGuideId,
        targetPdfFieldName,
        pdfPopulationInstructions,
        pdfOnly,
        customOnly,
        summaryOnly,
        reviewMode,
      });
      if (draftJob.status === "pending" && existingRequestId && canReusePending) {
        return jsonResponse({
          ok: true,
          pending: true,
          reused: true,
          request_id: existingRequestId,
          provider: "xai",
          model: String(draftJob.model || XAI_DRAFT_MODEL),
          target_count: Number(draftJob.target_count || targets.length),
          interview_guide_id: activeGuideId || null,
          review_mode: reviewMode,
          summary_only: summaryOnly,
        });
      }

      const requestId = await startGrokDraft(transcript, targets, buildCandidateContext(record as Record<string, unknown>));
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
              auto_score_candidate: autoScoreCandidate,
              interview_guide_id: activeGuideId || null,
              review_mode: reviewMode,
              target_pdf_field_name: targetPdfFieldName || null,
              pdf_only: pdfOnly,
              custom_only: customOnly,
              summary_only: summaryOnly,
              pdf_population_instructions: Object.fromEntries(pdfPopulationInstructions.entries()),
            },
            auto_score_candidate: autoScoreCandidate,
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
        interview_guide_id: activeGuideId || null,
        review_mode: reviewMode,
        summary_only: summaryOnly,
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
              auto_score_candidate: autoScoreCandidate,
              interview_guide_id: activeGuideId || null,
              review_mode: reviewMode,
              target_pdf_field_name: targetPdfFieldName || null,
              pdf_only: pdfOnly,
              custom_only: customOnly,
              summary_only: summaryOnly,
              pdf_population_instructions: Object.fromEntries(pdfPopulationInstructions.entries()),
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
        interview_guide_id: activeGuideId || null,
        review_mode: reviewMode,
        summary_only: summaryOnly,
      });
    }

    const { savedCount, populatedCount, skipped, transcriptSummaryBullets } = await saveDraftPayload(
      supabase,
      targetRecord as Record<string, unknown>,
      interview_id,
      activeGuideId || null,
      userId,
      targets,
      pollResult.payload,
      {
        requestId,
        model: String(pollResult.model || draftJob.model || XAI_DRAFT_MODEL),
        usage: pollResult.usage,
        reviewMode,
        summaryOnly,
      },
    );

    return jsonResponse({
      ok: true,
      pending: false,
      saved_count: savedCount,
      populated_count: populatedCount,
      skipped_targets: skipped,
      transcript_summary_count: transcriptSummaryBullets.length,
      provider: "xai",
      model: String(pollResult.model || draftJob.model || XAI_DRAFT_MODEL),
      request_id: requestId,
      interview_guide_id: activeGuideId || null,
      review_mode: reviewMode,
      summary_only: summaryOnly,
    });
  } catch (error) {
    return jsonResponse({ error: error?.message || "Interview Grok draft failed." }, error?.status || 500);
  }
});

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DOCUSEAL_API_KEY = Deno.env.get("DOCUSEAL_API_KEY") || "";
const DOCUSEAL_BASE_URL = (Deno.env.get("DOCUSEAL_BASE_URL") || "https://api.docuseal.com").replace(/\/+$/, "");
const DOCUSEAL_WEBHOOK_SECRET = Deno.env.get("DOCUSEAL_WEBHOOK_SECRET") || "";
const LABOR_EMPLOYEE_ATTACHMENT_BUCKET = "labor-employee-attachments";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return String(value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstArray(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value[0] && typeof value[0] === "object" ? value[0] as Record<string, unknown> : null;
}

function getEventType(payload: Record<string, unknown>) {
  return asString(payload.event_type || payload.event || payload.type);
}

function getSubmissionData(payload: Record<string, unknown>) {
  return asObject(payload.data || payload.submission || payload);
}

function findReviewInstanceId(payload: Record<string, unknown>) {
  const data = getSubmissionData(payload);
  const submitter = firstArray(data.submitters) || firstArray(payload.submitters) || asObject(payload.submitter);
  const candidates = [
    asObject(data.metadata).review_instance_id,
    asObject(submitter?.metadata).review_instance_id,
    asObject(payload.metadata).review_instance_id,
  ].map(asString).filter(Boolean);
  if (candidates[0]) return candidates[0];

  const externalId = asString(submitter?.external_id || data.external_id || payload.external_id);
  const match = externalId.match(/^([0-9a-f-]{36}):employee$/i);
  return match?.[1] || "";
}

async function fetchDocuSealDocuments(submissionId: string) {
  if (!DOCUSEAL_API_KEY || !submissionId) return [];
  const response = await fetch(`${DOCUSEAL_BASE_URL}/submissions/${submissionId}/documents?merge=true`, {
    headers: { "X-Auth-Token": DOCUSEAL_API_KEY },
  });
  if (!response.ok) return [];
  const body = await response.json().catch(() => ({}));
  return Array.isArray(body?.documents) ? body.documents : [];
}

async function downloadDocument(url: string) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  return await response.arrayBuffer();
}

function documentFileName(employeeName: string, reviewCycle: string, fallbackName: string) {
  const safeName = String(employeeName || "employee").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "employee";
  const cycle = String(reviewCycle || "review").replace(/_/g, "-");
  const fallback = String(fallbackName || "signed-performance-review.pdf").replace(/[^a-z0-9_.-]+/gi, "-");
  return `${safeName}-${cycle}-${fallback}`.replace(/-+/g, "-");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Supabase service credentials are missing." }, 500);
    }
    if (DOCUSEAL_WEBHOOK_SECRET) {
      const urlSecret = new URL(req.url).searchParams.get("secret") || "";
      if (urlSecret !== DOCUSEAL_WEBHOOK_SECRET) return jsonResponse({ error: "Unauthorized webhook." }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const eventType = getEventType(payload);
    const reviewInstanceId = findReviewInstanceId(payload);
    if (!reviewInstanceId) {
      return jsonResponse({ ok: true, ignored: true, reason: "No review instance metadata found." });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: instance, error: instanceError } = await supabase
      .from("employee_review_instances")
      .select("*")
      .eq("id", reviewInstanceId)
      .single();
    if (instanceError || !instance) {
      return jsonResponse({ ok: true, ignored: true, reason: "Review instance not found." });
    }

    const completed = ["submission.completed", "form.completed", "complete_form", "api_complete_form"].includes(eventType);
    if (!completed) {
      const metadata = asObject(instance.metadata);
      await supabase
        .from("employee_review_instances")
        .update({
          metadata: {
            ...metadata,
            signature: {
              ...asObject(metadata.signature),
              last_event_type: eventType || "unknown",
              last_event_at: new Date().toISOString(),
              last_event_payload: payload,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", reviewInstanceId);
      return jsonResponse({ ok: true, ignored: false, completed: false });
    }

    const data = getSubmissionData(payload);
    const instanceSignature = asObject(asObject(instance.metadata).signature);
    const submissionId = asString(data.id || data.submission_id || instanceSignature.submission_id);
    const documents = await fetchDocuSealDocuments(submissionId);
    const signedDocument = documents[0] || {};
    const dataDocuments = Array.isArray(data.documents) ? data.documents : [];
    const documentUrl = asString(signedDocument.url || data.document_url || asObject(dataDocuments[0]).url);
    const auditLogUrl = asString(data.audit_log_url || signedDocument.audit_log_url);
    let documentId = null;

    if (documentUrl) {
      const pdfBytes = await downloadDocument(documentUrl);
      if (pdfBytes) {
        const { data: employee } = await supabase
          .from("labor_employees")
          .select("id, full_name")
          .eq("id", instance.labor_employee_id)
          .single();
        const outputName = documentFileName(
          asString(employee?.full_name),
          asString(instance.review_cycle),
          asString(signedDocument.name) || "signed-performance-review.pdf",
        );
        const storagePath = [
          instance.labor_employee_id,
          "performance-reviews",
          reviewInstanceId,
          outputName,
        ].join("/");
        await supabase.storage
          .from(LABOR_EMPLOYEE_ATTACHMENT_BUCKET)
          .upload(storagePath, new Blob([pdfBytes], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });

        const { data: documentRow } = await supabase
          .from("labor_employee_documents")
          .insert({
            labor_employee_id: instance.labor_employee_id,
            document_type: "performance_review_signed_pdf",
            file_name: outputName,
            storage_bucket: LABOR_EMPLOYEE_ATTACHMENT_BUCKET,
            storage_path: storagePath,
            external_url: documentUrl,
            mime_type: "application/pdf",
            file_size_bytes: pdfBytes.byteLength,
            metadata: {
              provider: "docuseal",
              review_instance_id: reviewInstanceId,
              submission_id: submissionId,
              audit_log_url: auditLogUrl || null,
              webhook_event_type: eventType,
            },
          })
          .select("id")
          .single();
        documentId = documentRow?.id || null;
      }
    }

    await supabase.rpc("mark_employee_review_signature_completed", {
      p_review_instance_id: reviewInstanceId,
      p_provider: "docuseal",
      p_submission_id: submissionId || null,
      p_document_url: documentUrl || null,
      p_audit_log_url: auditLogUrl || null,
      p_completed_at: asString(data.completed_at) || new Date().toISOString(),
      p_signed_document_id: documentId,
      p_actor_user_id: null,
      p_provider_payload: payload,
    });

    return jsonResponse({ ok: true, completed: true, review_instance_id: reviewInstanceId, signed_document_id: documentId });
  } catch (error) {
    return jsonResponse({ error: error?.message || "DocuSeal webhook failed." }, 500);
  }
});

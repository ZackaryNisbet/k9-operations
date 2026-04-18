import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const DOCUSEAL_API_KEY = Deno.env.get("DOCUSEAL_API_KEY") || "";
const DOCUSEAL_BASE_URL = (Deno.env.get("DOCUSEAL_BASE_URL") || "https://api.docuseal.com").replace(/\/+$/, "");

class ReviewSigningError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ReviewSigningError";
    this.status = status;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return String(value || "").trim();
}

function normalizePhone(value: unknown) {
  const text = asString(value);
  if (!text) return "";
  if (text.startsWith("+")) return text;
  const digits = text.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
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
    throw new ReviewSigningError(message, response.status);
  }
  const userId = asString(data?.id);
  if (!userId) throw new ReviewSigningError("Unauthorized.", 401);
  return userId;
}

async function readProviderError(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body) return `DocuSeal request failed with HTTP ${response.status}.`;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === "string") return parsed.error;
    if (parsed?.error?.message) return String(parsed.error.message);
    if (parsed?.message) return String(parsed.message);
  } catch {
    return body.slice(0, 500);
  }
  return body.slice(0, 500);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return jsonResponse({ error: "Supabase environment variables are missing." }, 500);
    }
    if (!DOCUSEAL_API_KEY) {
      return jsonResponse({
        error: "DOCUSEAL_API_KEY is not configured.",
        code: "missing_docuseal_api_key",
      }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Missing authorization token." }, 401);
    const userId = await getAuthenticatedUserId(token);

    const body = await req.json().catch(() => ({}));
    const reviewInstanceId = asString(body.review_instance_id);
    const pdfBase64 = asString(body.pdf_base64).replace(/^data:application\/pdf;base64,/, "");
    const documentName = asString(body.file_name) || "performance-review.pdf";
    const deliveryMethod = asString(body.delivery_method || "email").toLowerCase();
    const recipientEmail = asString(body.recipient_email).toLowerCase();
    const recipientPhone = normalizePhone(body.recipient_phone);
    const fields = Array.isArray(body.fields) ? body.fields : [];

    if (!reviewInstanceId) return jsonResponse({ error: "Missing review_instance_id." }, 400);
    if (!pdfBase64) return jsonResponse({ error: "Missing PDF payload." }, 400);
    if (pdfBase64.length > 20 * 1024 * 1024) return jsonResponse({ error: "Performance review PDF is too large." }, 413);
    if (deliveryMethod === "sms" && !recipientPhone) return jsonResponse({ error: "Employee phone is required for SMS delivery." }, 400);
    if (deliveryMethod !== "sms" && !recipientEmail) return jsonResponse({ error: "Employee email is required for email delivery." }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: instance, error: instanceError } = await supabase
      .from("employee_review_instances")
      .select("*")
      .eq("id", reviewInstanceId)
      .single();
    if (instanceError || !instance) {
      return jsonResponse({ error: instanceError?.message || "Review instance not found." }, 404);
    }

    const { data: employee, error: employeeError } = await supabase
      .from("labor_employees")
      .select("id, full_name, position_title, metadata")
      .eq("id", instance.labor_employee_id)
      .single();
    if (employeeError || !employee) {
      return jsonResponse({ error: employeeError?.message || "Employee not found." }, 404);
    }

    const employeeName = asString(employee.full_name) || "Employee";
    const sendSms = deliveryMethod === "sms";
    const sendEmail = !sendSms;
    const requirePhone2fa = Boolean(recipientPhone);
    const requireEmail2fa = !recipientPhone && Boolean(recipientEmail);

    const payload = {
      name: documentName,
      send_email: sendEmail,
      send_sms: sendSms,
      order: "preserved",
      documents: [
        {
          name: documentName,
          file: pdfBase64,
          fields,
        },
      ],
      submitters: [
        {
          role: "Employee",
          name: employeeName,
          email: recipientEmail || undefined,
          phone: recipientPhone || undefined,
          external_id: `${reviewInstanceId}:employee`,
          send_email: sendEmail,
          send_sms: sendSms,
          require_phone_2fa: requirePhone2fa,
          require_email_2fa: requireEmail2fa,
          metadata: {
            source: "k9_operations_labor_management",
            review_instance_id: reviewInstanceId,
            labor_employee_id: employee.id,
            actor_user_id: userId,
          },
        },
      ],
      message: {
        subject: `${employeeName} performance review signature`,
        body: "Please review and sign your K9 Resorts performance review. Open the secure link to complete your signature.",
      },
    };

    const response = await fetch(`${DOCUSEAL_BASE_URL}/submissions/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": DOCUSEAL_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new ReviewSigningError(await readProviderError(response), response.status || 502);
    }

    const submission = await response.json();
    const submitter = Array.isArray(submission?.submitters) ? submission.submitters[0] : null;

    const { data: updatedInstance, error: markError } = await supabase.rpc("mark_employee_review_signature_sent", {
      p_review_instance_id: reviewInstanceId,
      p_provider: "docuseal",
      p_submission_id: asString(submission?.id),
      p_submitter_id: asString(submitter?.id || submitter?.uuid),
      p_submitter_slug: asString(submitter?.slug),
      p_embed_src: asString(submitter?.embed_src),
      p_delivery_method: sendSms ? "sms" : "email",
      p_recipient_email: recipientEmail || null,
      p_recipient_phone: recipientPhone || null,
      p_document_name: documentName,
      p_actor_user_id: userId,
      p_provider_payload: submission || {},
    });
    if (markError) throw markError;

    return jsonResponse({
      ok: true,
      provider: "docuseal",
      submission_id: submission?.id || null,
      submitter_id: submitter?.id || submitter?.uuid || null,
      embed_src: submitter?.embed_src || null,
      signature_status: "sent",
      review_instance: updatedInstance || null,
    });
  } catch (error) {
    const status = error instanceof ReviewSigningError ? error.status : 500;
    return jsonResponse({ error: error?.message || "Failed to send performance review for signature." }, status);
  }
});

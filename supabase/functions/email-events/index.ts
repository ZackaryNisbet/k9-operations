// ============================================================================
// Email Events Webhook — K9 Operations
// Receives Resend delivery events (delivered / opened / clicked / bounced /
// complained) and records them against the campaign + recipient via the
// crm_email_ingest_event RPC, which advances state and auto-suppresses hard
// bounces and complaints. Public endpoint (verify_jwt=false); when RESEND_WEBHOOK_SECRET
// is set the Svix signature is verified.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Verify the Svix signature Resend sends. Returns true when valid OR when no secret is
// configured (best-effort, mirroring the existing inbound webhook's optional-secret model).
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
  if (!secret) return true;
  const id = req.headers.get("svix-id") || "";
  const timestamp = req.headers.get("svix-timestamp") || "";
  const signatureHeader = req.headers.get("svix-signature") || "";
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = `${id}.${timestamp}.${rawBody}`;
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // Header is a space-separated list of "v1,<base64sig>"; any match passes.
  return signatureHeader.split(" ").some((part) => {
    const [, sig] = part.split(",");
    return sig === expected;
  });
}

// Normalize Resend's event types to the vocabulary crm_email_ingest_event expects.
function normalizeType(type: string): string {
  return String(type || "").replace(/^email\./, "").toLowerCase();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);

  const raw = await req.text();
  if (!(await verifySignature(req, raw))) return json({ error: "Invalid signature" }, 401);

  let event: { type?: string; created_at?: string; data?: Record<string, unknown> } = {};
  try { event = JSON.parse(raw); } catch (_) { return json({ error: "Invalid JSON" }, 400); }

  const data = event.data || {};
  const type = normalizeType(event.type || "");
  if (!type) return json({ ok: true, ignored: "no type" });

  const providerId = (data.email_id as string) || (data.id as string) || null;
  const toArr = data.to as string[] | string | undefined;
  const email = Array.isArray(toArr) ? toArr[0] : (typeof toArr === "string" ? toArr : null);
  const occurredAt = event.created_at || new Date().toISOString();

  const { error } = await admin.rpc("crm_email_ingest_event", {
    p_provider_message_id: providerId,
    p_event_type: type,
    p_email: email,
    p_payload: data,
    p_occurred_at: occurredAt,
  });
  if (error) {
    console.error("ingest_event failed", error.message);
    return json({ error: error.message }, 500);
  }
  return json({ ok: true, type });
});

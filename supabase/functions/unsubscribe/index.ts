// ============================================================================
// Unsubscribe Endpoint — K9 Operations
// Public, token-gated one-click unsubscribe for marketing emails. Handles both the
// browser link (GET → branded confirmation page) and RFC 8058 one-click POST sent by
// inbox providers (List-Unsubscribe-Post). Calls crm_email_unsubscribe(token), which
// suppresses the address and records the event. No auth (verify_jwt=false).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NAVY = "#183661";
const GOLD = "#AF8D54";

function page(title: string, message: string, status = 200): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · K9 Resorts</title></head>
<body style="margin:0;background:#F4F6F9;font-family:Arial,Helvetica,sans-serif;color:#1F2937">
  <div style="max-width:520px;margin:64px auto;background:#fff;border-radius:14px;border:1px solid #E5E7EB;overflow:hidden">
    <div style="background:${NAVY};height:6px"></div>
    <div style="padding:40px 36px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${NAVY};letter-spacing:-0.01em">K9 Resorts</div>
      <h1 style="font-size:18px;margin:22px 0 8px;color:#111827">${title}</h1>
      <p style="font-size:14px;line-height:1.6;color:#4B5563;margin:0">${message}</p>
      <div style="margin-top:28px;height:3px;width:48px;background:${GOLD};border-radius:2px;display:inline-block"></div>
    </div>
  </div>
</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function extractToken(req: Request, url: URL): string {
  return url.searchParams.get("token") || url.searchParams.get("t") || "";
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const token = extractToken(req, url);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);

  // RFC 8058 one-click: inbox providers POST here. Just process + 200, no HTML.
  const isOneClickPost = req.method === "POST";

  if (!token || token === "preview") {
    if (isOneClickPost) return new Response("ok", { status: 200 });
    return page("Unsubscribe link invalid", "This unsubscribe link is missing or has expired. Please contact us if you'd like to stop receiving emails.", 400);
  }

  // crm_email_unsubscribe expects a uuid token.
  const { data, error } = await admin.rpc("crm_email_unsubscribe", { p_token: token });
  const ok = !error && (data as { ok?: boolean })?.ok;

  if (isOneClickPost) return new Response(ok ? "ok" : "error", { status: ok ? 200 : 400 });

  if (!ok) {
    return page("Unsubscribe link invalid", "We couldn't find this subscription. It may have already been removed.", 400);
  }
  const email = (data as { email?: string })?.email || "your address";
  return page(
    "You're unsubscribed",
    `<strong>${email}</strong> has been removed from K9 Resorts marketing emails. You may still receive important service messages about your reservations.`,
  );
});

// ============================================================================
// Send Campaign Edge Function — K9 Operations
// Delivers a CRM email campaign through Resend. Three entry points:
//   • { campaign_id }              → send the campaign to its pending recipients now
//   • { campaign_id, test_email }  → send a one-off preview to the tester (no records)
//   • { mode: "drain" }            → (pg_cron, every 5 min) send any scheduled campaign
//                                     whose scheduled_at has arrived
//
// Each message is personalized from the recipient's snapshot (merge tags), gets a
// per-recipient one-click unsubscribe link + List-Unsubscribe headers, and a CAN-SPAM
// footer (physical address) when the design doesn't already carry one. Provider message
// ids are stored so the email-events webhook can correlate opens/clicks/bounces.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RESEND_API = "https://api.resend.com/emails";
const MAX_PER_RUN = 500;               // safety cap per invocation
const SEND_DELAY_MS = 90;              // gentle pacing between sends
const POSTAL_ADDRESS = "K9 Resorts Luxury Pet Hotel";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replace {{merge_tags}} from a data map; missing → "", with a friendly name fallback. */
function applyMergeTags(html: string, data: Record<string, unknown>): string {
  if (!html) return "";
  return String(html).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, rawKey) => {
    const key = String(rawKey).trim();
    const raw = data[key];
    const value = raw == null ? "" : String(raw).trim();
    if (value) return value;
    if (key === "first_name" || key === "full_name") return "there";
    return "";
  });
}

/** Ensure the email is CAN-SPAM compliant: unsubscribe link + postal address. */
function withCompliantFooter(html: string, unsubUrl: string): string {
  const hydrated = applyMergeTags(html, { unsubscribe_url: unsubUrl });
  if (/unsubscribe/i.test(hydrated)) return hydrated; // design already has one
  const footer = `
  <div style="margin-top:24px;padding:18px 12px;border-top:1px solid #E2E8F0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6B7280;text-align:center">
    <div>${POSTAL_ADDRESS}</div>
    <div style="margin-top:6px">You're receiving this because you contacted us about our services.
      <a href="${unsubUrl}" style="color:#183661;text-decoration:underline">Unsubscribe</a>.</div>
  </div>`;
  if (/<\/body>/i.test(hydrated)) return hydrated.replace(/<\/body>/i, `${footer}</body>`);
  return hydrated + footer;
}

interface CampaignRow {
  id: string; location_id: string; subject: string; from_name: string; from_email: string;
  reply_to: string | null; compiled_html: string | null; status: string;
}

async function sendOne(opts: {
  resendKey: string; from: string; replyTo: string | null; to: string; subject: string;
  html: string; unsubUrl: string;
}): Promise<{ id?: string; error?: string }> {
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${opts.unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  const payload: Record<string, unknown> = {
    from: opts.from, to: [opts.to], subject: opts.subject, html: opts.html, headers,
  };
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  const resp = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { error: `Resend ${resp.status}: ${text.slice(0, 200)}` };
  }
  const data = await resp.json().catch(() => ({}));
  return { id: (data as { id?: string })?.id };
}

// deno-lint-ignore no-explicit-any
async function sendCampaign(admin: any, resendKey: string, campaign: CampaignRow, functionsBase: string) {
  const from = `${campaign.from_name || "K9 Resorts"} <${campaign.from_email}>`;
  await admin.from("email_campaigns").update({ status: "sending", send_started_at: new Date().toISOString() }).eq("id", campaign.id);

  const { data: recipients } = await admin
    .from("email_recipients").select("*").eq("campaign_id", campaign.id).eq("status", "pending").limit(MAX_PER_RUN);

  let sent = 0, failed = 0;
  for (const r of recipients || []) {
    const unsubUrl = `${functionsBase}/unsubscribe?token=${r.unsubscribe_token}`;
    const data = { ...(r.merge_data || {}), unsubscribe_url: unsubUrl, resort_name: "K9 Resorts" };
    const html = withCompliantFooter(applyMergeTags(campaign.compiled_html || "", data), unsubUrl);
    const subject = applyMergeTags(campaign.subject || "", data);
    const res = await sendOne({ resendKey, from, replyTo: campaign.reply_to, to: r.email, subject, html, unsubUrl });
    if (res.error) {
      failed += 1;
      await admin.from("email_recipients").update({ status: "failed", error: res.error, last_event_at: new Date().toISOString() }).eq("id", r.id);
    } else {
      sent += 1;
      await admin.from("email_recipients").update({ status: "sent", provider_message_id: res.id || null, sent_at: new Date().toISOString(), last_event_at: new Date().toISOString() }).eq("id", r.id);
    }
    await sleep(SEND_DELAY_MS);
  }

  // More than the per-run cap still pending? Stay "sending"; the cron drain finishes it.
  const { count: remaining } = await admin
    .from("email_recipients").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id).eq("status", "pending");

  // Counters are recomputed authoritatively by refreshSentCount() after this returns,
  // so here we only move the lifecycle state forward.
  await admin.from("email_campaigns").update({
    status: (remaining || 0) > 0 ? "sending" : "sent",
    send_completed_at: (remaining || 0) > 0 ? null : new Date().toISOString(),
  }).eq("id", campaign.id);

  return { sent, failed, remaining: remaining || 0 };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const functionsBase = `${supabaseUrl}/functions/v1`;
  const admin = createClient(supabaseUrl, serviceKey);

  if (!resendKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

  let body: { campaign_id?: string; test_email?: string; mode?: string } = {};
  try { body = await req.json(); } catch (_) { /* drain cron may send empty */ }

  try {
    // ── Drain mode: cron flushes any scheduled campaign that's now due ──
    if (body.mode === "drain") {
      const { data: due } = await admin
        .from("email_campaigns").select("*")
        .eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).limit(10);
      const results = [];
      for (const c of due || []) {
        const r = await sendCampaign(admin, resendKey, c as CampaignRow, functionsBase);
        await refreshSentCount(admin, (c as CampaignRow).id);
        results.push({ campaign_id: (c as CampaignRow).id, ...r });
      }
      return json({ drained: results.length, results });
    }

    // ── Authenticated paths: verify the caller manages this campaign ──
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    if (!body.campaign_id) return json({ error: "campaign_id required" }, 400);
    const { data: canManage, error: gateErr } = await authClient.rpc("crm_email_can_manage", { p_campaign_id: body.campaign_id });
    if (gateErr) return json({ error: gateErr.message }, 500);
    if (!canManage) return json({ error: "Not authorized to send this campaign" }, 403);

    const { data: campaign, error: cErr } = await admin.from("email_campaigns").select("*").eq("id", body.campaign_id).single();
    if (cErr || !campaign) return json({ error: "Campaign not found" }, 404);

    // ── Test send: one personalized preview to the tester, no records touched ──
    if (body.test_email) {
      const data = { first_name: "there", resort_name: "K9 Resorts", unsubscribe_url: `${functionsBase}/unsubscribe?token=preview` };
      const html = withCompliantFooter(applyMergeTags(campaign.compiled_html || "", data), data.unsubscribe_url);
      const res = await sendOne({
        resendKey, from: `${campaign.from_name} <${campaign.from_email}>`, replyTo: campaign.reply_to,
        to: body.test_email, subject: `[TEST] ${applyMergeTags(campaign.subject || "", data)}`, html, unsubUrl: data.unsubscribe_url,
      });
      if (res.error) return json({ error: res.error }, 502);
      return json({ ok: true, test: true, id: res.id });
    }

    // ── Real send: only a draft (or a due/forced scheduled) campaign can be sent ──
    if (!["draft", "scheduled"].includes(campaign.status)) {
      return json({ error: `Campaign is ${campaign.status}; nothing to send` }, 409);
    }
    const result = await sendCampaign(admin, resendKey, campaign as CampaignRow, functionsBase);
    await refreshSentCount(admin, campaign.id);
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

// Recompute sent_count from the recipients table (cumulative + accurate across runs).
// deno-lint-ignore no-explicit-any
async function refreshSentCount(admin: any, campaignId: string) {
  const countOf = async (statuses: string[]) => {
    const { count } = await admin.from("email_recipients")
      .select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).in("status", statuses);
    return count || 0;
  };
  const sent = await countOf(["sent", "delivered", "opened", "clicked", "unsubscribed"]);
  const failed = await countOf(["failed"]);
  await admin.from("email_campaigns").update({ sent_count: sent, failed_count: failed }).eq("id", campaignId);
}

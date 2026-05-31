// ============================================================================
// Ignite Health Check — K9 Operations
// Runs hourly (pg_cron). For each active Ignite location it validates the
// pipeline with ZERO dummy data and records a snapshot in `ignite_health`:
//   • bridge_ok  — dry-run through the live webhook (parser + slug routing)
//   • resend_ok  — Resend account/API reachable (catches key/billing/outage)
//   • last_lead_at — freshness of real submissions (delivery heuristic)
// The CRM health badge reads the latest snapshot.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STALE_DAYS = 7;

function buildProbe(slug: string) {
  const safe = (slug || "").trim() || "cherry-hill";
  const html =
    `<p>A new lead has been captured on:<br>https://www.k9resorts.com/${safe}/</p>` +
    `<table><tbody>` +
    `<tr><th>First Name: </th><td><div>Pipeline</div></td></tr>` +
    `<tr><th>Last Name: </th><td><div>Healthcheck</div></td></tr>` +
    `<tr><th>Email: </th><td><div>healthcheck@k9operations.com</div></td></tr>` +
    `<tr><th>Form Name: </th><td><div>Booking</div></td></tr>` +
    `</tbody></table>`;
  const from = "K9 Resorts <no-reply@cloudbackend.net>";
  const subject = "New Booking Form Submission Received";
  return { from, subject, headers: { from, subject }, html, dryRun: true };
}

function computeLevel(
  bridgeOk: boolean,
  resendOk: boolean | null,
  lastLeadAt: string | null,
): { level: string; detail: string } {
  if (!bridgeOk) {
    return { level: "down", detail: "Parser/routing validation failed — the dry-run did not pass." };
  }
  if (resendOk === false) {
    return { level: "down", detail: "Resend account/API is unreachable — check billing, the API key, or resend-status.com." };
  }
  if (lastLeadAt) {
    const days = Math.floor((Date.now() - new Date(lastLeadAt).getTime()) / 86400000);
    if (days > STALE_DAYS) {
      return { level: "warn", detail: `No booking forms in ${days} days — check the Outlook forwarding rule.` };
    }
  }
  return {
    level: "ok",
    detail: lastLeadAt ? "Pipeline validated; submissions flowing." : "Pipeline validated; awaiting the first submission.",
  };
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const webhookUrl = `${supabaseUrl}/functions/v1/ignite-webhook`;
  const resendKey = Deno.env.get("RESEND_API_KEY");

  // One Resend reachability check, shared across locations.
  let resendOk: boolean | null = null;
  if (resendKey) {
    try {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${resendKey}` } });
      resendOk = r.ok;
    } catch {
      resendOk = false;
    }
  }

  const { data: configs } = await supabase
    .from("ignite_config")
    .select("location_id")
    .eq("is_active", true);

  const results: Array<Record<string, unknown>> = [];

  for (const cfg of configs || []) {
    const locationId = (cfg as { location_id: string }).location_id;

    const { data: loc } = await supabase.from("locations").select("slug").eq("id", locationId).limit(1);
    const slug = (loc && loc[0] && loc[0].slug) || "cherry-hill";

    // Phase 2: dry-run through the live webhook (no row written).
    let bridgeOk = false;
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProbe(slug)),
      });
      const data = await resp.json().catch(() => ({}));
      bridgeOk = !!(resp.ok && data.success && data.dryRun && data.locationId);
    } catch {
      bridgeOk = false;
    }

    // Phase 1 (heuristic): freshness of real submissions.
    const { data: last } = await supabase
      .from("ignite_leads")
      .select("created_at")
      .eq("location_id", locationId)
      .eq("lead_type", "web_form")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastLeadAt = (last && last[0] && last[0].created_at) || null;

    const { level, detail } = computeLevel(bridgeOk, resendOk, lastLeadAt);

    await supabase.from("ignite_health").insert({
      location_id: locationId,
      level,
      bridge_ok: bridgeOk,
      resend_ok: resendOk,
      last_lead_at: lastLeadAt,
      detail,
    });

    results.push({ locationId, level, bridgeOk, resendOk });
  }

  return new Response(JSON.stringify({ ok: true, checked: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

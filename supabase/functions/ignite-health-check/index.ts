// ============================================================================
// Ignite Health Check — K9 Operations
// Runs every 15 min (pg_cron). For each active Ignite location it records a rich
// per-run snapshot in `ignite_health` that the CRM health feature shows in full:
//   • bridge   — dry-run through the live webhook (parser + slug routing) + latency
//   • resend   — Resend account/API reachable (key/billing/outage) + latency
//   • db       — Postgres reachable + round-trip latency (the write path)
//   • roundtrip — SYNTHETIC canary: a tagged email sent through the REAL pipeline
//                 (Resend → webhook → ignite_leads), confirmed by the next run,
//                 with end-to-end latency. Flagged is_synthetic so it never
//                 reaches the CRM. No-ops gracefully until RESEND_API_KEY +
//                 IGNITE_INBOUND_ADDRESS are set, so it never sends blind.
//   • freshness — newest NON-synthetic submission (delivery heuristic)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeLevel, nextQuarterHour } from "../_shared/ignite-health-logic.ts";

const PROBE_TIMEOUT_MS = 20 * 60 * 1000; // a pending probe older than this = miss
const SYNTHETIC_TTL_MS = 24 * 60 * 60 * 1000; // purge synthetic leads/probes after a day

function bookingFormRows(slug: string, extra = ""): string {
  const safe = (slug || "").trim() || "cherry-hill";
  return (
    `<p>A new lead has been captured on:<br>https://www.k9resorts.com/${safe}/</p>` +
    `<table><tbody>` +
    `<tr><th>First Name: </th><td><div>Pipeline</div></td></tr>` +
    `<tr><th>Last Name: </th><td><div>Healthcheck</div></td></tr>` +
    `<tr><th>Email: </th><td><div>healthcheck@k9operations.com</div></td></tr>` +
    `<tr><th>Form Name: </th><td><div>Booking</div></td></tr>` +
    extra +
    `</tbody></table>`
  );
}

// Dry-run payload: validates parse + routing WITHOUT writing a lead (no token).
function buildDryRun(slug: string) {
  const from = "K9 Resorts <no-reply@cloudbackend.net>";
  const subject = "New Booking Form Submission Received";
  return { from, subject, headers: { from, subject }, html: bookingFormRows(slug), dryRun: true };
}

// Real synthetic email sent through Resend → carries the probe token marker.
function buildProbeHtml(slug: string, token: string): string {
  return bookingFormRows(slug, `<tr><th>Probe: </th><td><div>IGNITE-HEALTH-PROBE:${token}</div></td></tr>`);
}

async function sendProbe(resendKey: string, from: string, to: string, slug: string, token: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: "New Booking Form Submission Received", html: buildProbeHtml(slug, token) }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const webhookUrl = `${supabaseUrl}/functions/v1/ignite-webhook`;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const inboundAddress = Deno.env.get("IGNITE_INBOUND_ADDRESS");
  const fromAddress = Deno.env.get("IGNITE_HEALTHCHECK_FROM") || "K9 Ops Monitor <monitor@k9resorts.com>";
  const now = new Date();
  const nextRunAt = nextQuarterHour(now);
  const canCanary = !!(resendKey && inboundAddress);

  // Resend reachability — one check, shared across locations, timed.
  let resendOk: boolean | null = null;
  let resendMs: number | null = null;
  if (resendKey) {
    const t = Date.now();
    try {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${resendKey}` } });
      resendOk = r.ok;
    } catch {
      resendOk = false;
    }
    resendMs = Date.now() - t;
  }

  const { data: configs } = await supabase.from("ignite_config").select("location_id").eq("is_active", true);
  const results: Array<Record<string, unknown>> = [];

  for (const cfg of configs || []) {
    const locationId = (cfg as { location_id: string }).location_id;
    const { data: loc } = await supabase.from("locations").select("slug").eq("id", locationId).limit(1);
    const slug = (loc && loc[0] && loc[0].slug) || "cherry-hill";

    // DB ping — the actual write-path dependency, timed.
    let dbOk = false;
    let dbMs: number | null = null;
    {
      const t = Date.now();
      const { error } = await supabase.from("ignite_leads").select("id", { count: "exact", head: true }).eq("location_id", locationId);
      dbOk = !error;
      dbMs = Date.now() - t;
    }

    // Bridge — dry-run through the live webhook (parser + slug routing), timed.
    let bridgeOk = false;
    let bridgeMs: number | null = null;
    {
      const t = Date.now();
      try {
        const resp = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildDryRun(slug)) });
        const data = await resp.json().catch(() => ({}));
        bridgeOk = !!(resp.ok && data.success && data.dryRun && data.locationId);
      } catch {
        bridgeOk = false;
      }
      bridgeMs = Date.now() - t;
    }

    // Synthetic round-trip canary — confirm the PRIOR probe landed, then send a
    // fresh one. No-ops entirely until RESEND_API_KEY + IGNITE_INBOUND_ADDRESS set.
    let roundtripOk: boolean | null = null;
    let roundtripMs: number | null = null;
    let probeSentAt: string | null = null;
    let probeReceivedAt: string | null = null;
    let probeInsertedAt: string | null = null;
    if (canCanary) {
      const { data: prior } = await supabase
        .from("ignite_health_probe")
        .select("*")
        .eq("location_id", locationId)
        .order("sent_at", { ascending: false })
        .limit(1);
      const p = prior && prior[0];
      if (p) {
        if (p.status === "landed") {
          roundtripOk = true;
          roundtripMs = p.latency_ms;
          probeSentAt = p.sent_at;
          probeReceivedAt = p.received_at;
          probeInsertedAt = p.inserted_at;
        } else if (p.status === "pending") {
          probeSentAt = p.sent_at;
          if (now.getTime() - new Date(p.sent_at).getTime() > PROBE_TIMEOUT_MS) {
            roundtripOk = false; // never landed → a real lead would have been lost
            await supabase.from("ignite_health_probe").update({ status: "timeout" }).eq("id", p.id);
          }
          // else: still legitimately in flight → roundtripOk stays null
        }
      }
      const token = crypto.randomUUID().replace(/-/g, "");
      if (await sendProbe(resendKey!, fromAddress, inboundAddress!, slug, token)) {
        await supabase.from("ignite_health_probe").insert({ location_id: locationId, token, slug, sent_at: new Date().toISOString(), status: "pending" });
      }
    }

    // Freshness — newest NON-synthetic real submission.
    const { data: last } = await supabase
      .from("ignite_leads")
      .select("created_at")
      .eq("location_id", locationId)
      .eq("lead_type", "web_form")
      .eq("is_synthetic", false)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastLeadAt = (last && last[0] && last[0].created_at) || null;

    const { level, detail } = computeLevel({ bridgeOk, resendOk, dbOk, roundtripOk, lastLeadAt, now });

    await supabase.from("ignite_health").insert({
      location_id: locationId,
      level,
      bridge_ok: bridgeOk,
      bridge_ms: bridgeMs,
      resend_ok: resendOk,
      resend_ms: resendMs,
      db_ok: dbOk,
      db_ms: dbMs,
      roundtrip_ok: roundtripOk,
      roundtrip_ms: roundtripMs,
      probe_sent_at: probeSentAt,
      probe_received_at: probeReceivedAt,
      probe_inserted_at: probeInsertedAt,
      last_lead_at: lastLeadAt,
      next_run_at: nextRunAt,
      detail,
    });

    results.push({ locationId, level, bridgeOk, bridgeMs, resendOk, dbOk, dbMs, roundtripOk, roundtripMs });
  }

  // Housekeeping — purge old synthetic leads + probe rows so they never accrue.
  const cutoff = new Date(Date.now() - SYNTHETIC_TTL_MS).toISOString();
  await supabase.from("ignite_leads").delete().eq("is_synthetic", true).lt("created_at", cutoff);
  await supabase.from("ignite_health_probe").delete().lt("sent_at", cutoff);

  return new Response(JSON.stringify({ ok: true, checked: results.length, canary: canCanary, nextRunAt, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

// ============================================================================
// Ignite Inbound Backfill — ONE-TIME catch-up (not a poller, no cron).
//
// Lists emails Resend already RECEIVED in the last N hours (default 24) and
// replays each through the live ignite-webhook (type=email.received), so leads
// that arrived while the Resend webhook was disabled get recovered. Idempotent
// via ignite_inbound_seen. Query params:
//   ?dry=1     list only, write nothing (verify first)
//   ?hours=24  window (1..168)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const webhookUrl = `${supabaseUrl}/functions/v1/ignite-webhook`;
  if (!resendKey) return json({ error: "RESEND_API_KEY not set" }, 500);

  // Our own synthetic health-check probes also land in "received" — never
  // re-ingest those, only real inbound mail.
  const fromCfg = Deno.env.get("IGNITE_HEALTHCHECK_FROM") || "";
  const monitorAddr = (fromCfg.match(/<([^>]+)>/)?.[1] || fromCfg).toLowerCase().trim();

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const hours = Math.min(168, Math.max(1, Number(url.searchParams.get("hours") || "24")));
  const sinceMs = Date.now() - hours * 3600 * 1000;

  const out: Record<string, unknown> = { hours, dry, found: 0, leads: 0, duplicates: 0, skipped_seen: 0, synthetic_skipped: 0, failed: 0 };
  const items: unknown[] = [];
  let after: string | null = null;
  let reachedOld = false;
  // Per-invocation cap so we never hit the edge-function wall-clock limit; the
  // dedup ledger lets repeated calls continue where the last one stopped.
  const cap = dry ? 100000 : Math.min(40, Math.max(1, Number(url.searchParams.get("max") || "15")));
  let attempted = 0;

  for (let page = 0; page < 6 && !reachedOld; page++) {
    const u = new URL("https://api.resend.com/emails/receiving");
    u.searchParams.set("limit", "100");
    if (after) u.searchParams.set("after", after);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${resendKey}` } });
    const text = await r.text();
    if (!r.ok) return json({ error: `Resend list failed (${r.status})`, body: text.slice(0, 600) }, 502);
    let body: { data?: any[]; emails?: any[]; has_more?: boolean };
    try { body = JSON.parse(text); } catch { return json({ error: "bad JSON from Resend", body: text.slice(0, 600) }, 502); }
    const rows = body.data ?? body.emails ?? [];
    if (!rows.length) break;

    for (const it of rows) {
      const id = it.id ?? it.email_id;
      const createdAt = new Date(it.created_at ?? it.created ?? 0).getTime();
      if (!id || Number.isNaN(createdAt)) continue;
      if (createdAt < sinceMs) { reachedOld = true; break; }
      if (monitorAddr && String(it.from || "").toLowerCase().includes(monitorAddr)) { (out.synthetic_skipped as number)++; continue; }
      (out.found as number)++;

      const { data: seen } = await supabase.from("ignite_inbound_seen").select("email_id").eq("email_id", id).limit(1);
      const already = !!(seen && seen.length);

      if (dry) { items.push({ id, from: it.from, to: it.to, subject: it.subject, created_at: it.created_at, already }); continue; }
      if (already) { (out.skipped_seen as number)++; continue; }
      if (attempted >= cap) { reachedOld = true; break; }
      attempted++;

      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "email.received", data: { email_id: id } }),
        });
        const rb = await resp.json().catch(() => ({}));
        const result = !resp.ok ? `err_${resp.status}` : rb.duplicate ? "duplicate" : rb.leadId ? "lead" : "skipped";
        await supabase.from("ignite_inbound_seen").insert({ email_id: id, result });
        if (result === "lead") (out.leads as number)++;
        else if (result === "duplicate") (out.duplicates as number)++;
        else if (result.startsWith("err")) (out.failed as number)++;
        items.push({ id, subject: it.subject, result });
      } catch (e) {
        (out.failed as number)++;
        items.push({ id, subject: it.subject, result: "exception", error: String(e) });
        await supabase.from("ignite_inbound_seen").insert({ email_id: id, result: "exception" }).catch(() => {});
      }
    }
    if (!body.has_more) break;
    after = (rows[rows.length - 1].id ?? rows[rows.length - 1].email_id) || null;
    if (!after) break;
  }

  out.items = items;
  return json({ ok: true, ...out });
});

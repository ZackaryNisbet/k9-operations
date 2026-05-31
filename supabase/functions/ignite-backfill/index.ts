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

  // ── Diagnostic: how far back does Resend actually retain received emails, and
  //    do the oldest WEB-FORM emails (employment apps) still carry attachments?
  //    Answers whether a résumé backfill is even possible.
  //    ?scan=1&pages=60&subject=web%20form&samples=8
  if (url.searchParams.get("scan") === "1") {
    const sampleSubj = (url.searchParams.get("subject") || "web form").toLowerCase();
    const samples = Math.min(20, Math.max(1, Number(url.searchParams.get("samples") || "8")));
    const maxPages = Math.min(80, Math.max(1, Number(url.searchParams.get("pages") || "60")));
    let count = 0, oldest = Infinity, newest = 0, reachedEnd = false;
    const byType: Record<string, number> = {};
    const ctypes: Record<string, number> = {};
    const realAtts: any[] = []; // real file attachments (not .eml forward-wrappers) = candidate résumés
    const matching: any[] = [];
    let cur: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const u = new URL("https://api.resend.com/emails/receiving");
      u.searchParams.set("limit", "100");
      if (cur) u.searchParams.set("after", cur);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${resendKey}` } });
      const text = await r.text();
      if (!r.ok) return json({ error: `Resend list failed (${r.status})`, body: text.slice(0, 600) }, 502);
      const body = JSON.parse(text);
      const rows = body.data ?? body.emails ?? [];
      if (!rows.length) { reachedEnd = true; break; }
      for (const it of rows) {
        const t = new Date(it.created_at ?? 0).getTime();
        if (Number.isNaN(t)) continue;
        count++; if (t < oldest) oldest = t; if (t > newest) newest = t;
        const subj = String(it.subject || "").toLowerCase();
        const key = subj.includes("phone call") ? "phone_call" : subj.includes("appointment") ? "appointment" : subj.includes("booking") ? "booking_form" : subj.includes("web form") ? "web_form" : "other";
        byType[key] = (byType[key] || 0) + 1;
        if (subj.includes(sampleSubj)) matching.push(it);
        // Aggregate attachment content-types straight from the list payload.
        const atts = Array.isArray(it.attachments) ? it.attachments : [];
        for (const a of atts) {
          const ct = a?.content_type || "?";
          ctypes[ct] = (ctypes[ct] || 0) + 1;
          if (ct !== "message/rfc822") {
            realAtts.push({ id: it.id ?? it.email_id, created_at: it.created_at, type: key, subject: it.subject, filename: a?.filename, content_type: ct, size: a?.size });
          }
        }
      }
      if (!body.has_more) { reachedEnd = true; break; }
      cur = (rows[rows.length - 1].id ?? rows[rows.length - 1].email_id) || null;
      if (!cur) { reachedEnd = true; break; }
    }
    matching.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const details: any[] = [];
    for (const it of matching.slice(0, samples)) {
      const id = it.id ?? it.email_id;
      try {
        const r = await fetch(`https://api.resend.com/emails/receiving/${id}`, { headers: { Authorization: `Bearer ${resendKey}` } });
        const full = r.ok ? await r.json() : null;
        const f = full?.data ?? full;
        const atts = f?.attachments ?? [];
        details.push({ id, created_at: it.created_at, subject: it.subject, attachment_count: Array.isArray(atts) ? atts.length : 0, attachment_names: Array.isArray(atts) ? atts.map((a: any) => a.filename) : [], att_sample: atts[0] ?? null });
      } catch (e) { details.push({ id, error: String(e) }); }
    }
    return json({ ok: true, scan: true, count, reachedEnd, oldest: oldest === Infinity ? null : new Date(oldest).toISOString(), newest: newest ? new Date(newest).toISOString() : null, byType, attachment_content_types: ctypes, real_attachment_count: realAtts.length, real_attachments: realAtts.slice(0, 30), matching_count: matching.length, oldest_matching_samples: details });
  }

  // ── Diagnostic: pull the FULL record (incl. raw MIME) for attachment-bearing
  //    and recent web-form emails, and hunt the raw MIME for nested file
  //    attachments (résumés inside a forwarded .eml won't show at top level).
  //    ?inspect=1&n=20&subject=web%20form
  if (url.searchParams.get("inspect") === "1") {
    const want = Math.min(40, Math.max(1, Number(url.searchParams.get("n") || "20")));
    const subjFilter = (url.searchParams.get("subject") || "web form").toLowerCase();
    const cands: any[] = [];
    let cur: string | null = null;
    for (let page = 0; page < 80 && cands.length < 800; page++) {
      const u = new URL("https://api.resend.com/emails/receiving");
      u.searchParams.set("limit", "100");
      if (cur) u.searchParams.set("after", cur);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${resendKey}` } });
      if (!r.ok) break;
      const body = await r.json();
      const rows = body.data ?? body.emails ?? [];
      if (!rows.length) break;
      for (const it of rows) {
        const subj = String(it.subject || "").toLowerCase();
        const hasAtt = Array.isArray(it.attachments) && it.attachments.length;
        if (subj.includes(subjFilter) || hasAtt) cands.push(it);
      }
      if (!body.has_more) break;
      cur = (rows[rows.length - 1].id ?? rows[rows.length - 1].email_id) || null;
      if (!cur) break;
    }
    cands.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const withAtt = cands.filter((c) => Array.isArray(c.attachments) && c.attachments.length);
    const seen = new Set<string>();
    const pick = [...withAtt, ...cands].filter((it) => { const id = it.id ?? it.email_id; if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, want);
    const results: any[] = [];
    for (const it of pick) {
      const id = it.id ?? it.email_id;
      try {
        const r = await fetch(`https://api.resend.com/emails/receiving/${id}`, { headers: { Authorization: `Bearer ${resendKey}` } });
        const full = r.ok ? await r.json() : null;
        const f = full?.data ?? full ?? {};
        const raw = typeof f.raw === "string" ? f.raw : "";
        const fnames = [...raw.matchAll(/name="?([^"\r\n;]+\.(?:pdf|docx?|rtf|txt|png|jpe?g))"?/gi)].map((m) => m[1]);
        results.push({ id, created_at: it.created_at, subject: it.subject, top_attachments: (f.attachments || []).map((a: any) => ({ filename: a.filename, content_type: a.content_type, size: a.size })), raw_len: raw.length, raw_has_pdf: /Content-Type:\s*application\/pdf/i.test(raw), raw_has_attachment_disp: /Content-Disposition:\s*attachment/i.test(raw), raw_filenames: [...new Set(fnames)].slice(0, 12) });
      } catch (e) { results.push({ id, error: String(e) }); }
    }
    return json({ ok: true, inspect: true, candidates: cands.length, with_attachments: withAtt.length, inspected: results.length, results });
  }

  // ── Diagnostic: download an email's attachments via the Attachments API and
  //    look INSIDE (a forwarded .eml may nest the original résumé). Validates the
  //    exact Attachments API shape the webhook capture relies on. ?peek=<email_id>
  if (url.searchParams.get("peek")) {
    const id = url.searchParams.get("peek")!;
    const la = await fetch(`https://api.resend.com/emails/receiving/${id}/attachments`, { headers: { Authorization: `Bearer ${resendKey}` } });
    const laText = await la.text();
    let attList: any = null; try { attList = JSON.parse(laText); } catch { /* */ }
    const arr = attList?.data ?? attList?.attachments ?? [];
    const out2: any[] = [];
    for (const a of Array.isArray(arr) ? arr : []) {
      const dl = a.download_url || a.url;
      let content = "", bytes = 0, how = "none";
      try {
        if (dl) {
          const fr = await fetch(dl, String(dl).includes("api.resend.com") ? { headers: { Authorization: `Bearer ${resendKey}` } } : {});
          if (fr.ok) { const buf = new Uint8Array(await fr.arrayBuffer()); bytes = buf.length; content = new TextDecoder().decode(buf.slice(0, 300000)); how = "download_url"; }
        } else if (typeof a.content === "string" && a.content) {
          const bin = atob(a.content); bytes = bin.length; content = bin.slice(0, 300000); how = "base64";
        }
      } catch (e) { how = `err:${String(e).slice(0, 80)}`; }
      const fnames = [...content.matchAll(/name="?([^"\r\n;]+\.(?:pdf|docx?|rtf|txt))"?/gi)].map((m) => m[1]);
      out2.push({ filename: a.filename, content_type: a.content_type, size: a.size, attachment_keys: Object.keys(a), downloaded_bytes: bytes, fetched_via: how, nested_has_pdf: /Content-Type:\s*application\/pdf/i.test(content), nested_has_attachment_disp: /Content-Disposition:\s*attachment/i.test(content), nested_filenames: [...new Set(fnames)].slice(0, 12) });
    }
    return json({ ok: true, peek: id, attachments_api_status: la.status, attachments_api_top_keys: attList ? Object.keys(attList) : null, raw_list_head: laText.slice(0, 400), attachments: out2 });
  }

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

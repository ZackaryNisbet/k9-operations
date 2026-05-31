// K9 Operations — Ignite pipeline health model (pure, framework-free)
//
// Programmatic, no-dummy-data validation of the two-phase data flow:
//   Phase 1  website booking form → forwarding → webhook   (delivery)
//   Phase 2  webhook → parser → routing → ignite_leads      (our bridge)
//
// Phase 2 is validated deterministically by a webhook DRY-RUN: send a canonical
// booking-form probe with the location's website slug and `dryRun:true`; the
// webhook parses + routes it and returns the result WITHOUT writing a lead. So a
// broken parser/route is caught the instant it breaks — no dummy data, ever.
//
// Phase 1 cannot be end-to-end tested without submitting a real form (which would
// pollute the live CRM), so it is inferred from real traffic: freshness (have
// submissions stopped arriving?) + parse-quality (are arriving submissions still
// well-formed?). Honest heuristics, not a synthetic guarantee.

export const HEALTH_TONES = {
  ok: "success",
  warn: "warning",
  down: "danger",
  unconfigured: "neutral",
};

export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}

/**
 * Are recent real submissions parsing cleanly? Looks at the most recent web-form
 * leads and checks they carry a name plus a contact method. Returns null when
 * there's no signal yet (no recent leads).
 */
export function parseQualityOk(recentLeads, sample = 10) {
  const rows = (recentLeads || []).slice(0, sample);
  if (!rows.length) return null;
  const wellFormed = rows.filter((r) => (r.first_name || r.last_name) && (r.email || r.phone)).length;
  return wellFormed / rows.length >= 0.5;
}

/**
 * Build a dry-run booking-form probe for a location's website slug. Always
 * carries dryRun:true, so posting it validates parse + routing without writing.
 */
export function buildBridgeProbeEmail(slug) {
  const safeSlug = String(slug || "").trim() || "cherry-hill";
  const html =
    `<p>A new lead has been captured on:<br>https://www.k9resorts.com/${safeSlug}/</p>` +
    `<table><tbody>` +
    `<tr><th>First Name: </th><td><div>Pipeline</div></td></tr>` +
    `<tr><th>Last Name: </th><td><div>Healthcheck</div></td></tr>` +
    `<tr><th>Email: </th><td><div>healthcheck@k9operations.com</div></td></tr>` +
    `<tr><th>Phone: </th><td><div>0000000000</div></td></tr>` +
    `<tr><th>Desired Service: </th><td><div>Validation</div></td></tr>` +
    `<tr><th>Form Name: </th><td><div>Booking</div></td></tr>` +
    `</tbody></table>`;
  const from = "K9 Resorts <no-reply@cloudbackend.net>";
  const subject = "New Booking Form Submission Received";
  return { from, subject, headers: { from, subject }, html, dryRun: true };
}

// Badge label per level for a stored ignite_health snapshot.
const SNAPSHOT_LABELS = { ok: "Live", warn: "No recent forms", down: "Pipeline issue", unconfigured: "Not connected" };

/** Is an ignite_health snapshot recent enough to trust over a client-side guess? */
export function isSnapshotFresh(row, maxAgeMs = 3 * 3600 * 1000, now = Date.now()) {
  if (!row || !row.checked_at) return false;
  const t = new Date(row.checked_at).getTime();
  return !Number.isNaN(t) && now - t <= maxAgeMs;
}

/** Turn a stored ignite_health row (from the hourly job) into a badge verdict. */
export function healthFromSnapshot(row) {
  if (!row || !row.level) return null;
  return {
    level: row.level,
    tone: HEALTH_TONES[row.level] || HEALTH_TONES.unconfigured,
    label: SNAPSHOT_LABELS[row.level] || "Unknown",
    detail: row.detail || "",
  };
}

/** Interpret a dry-run webhook response into a boolean "bridge OK". */
export function bridgeOkFromResponse({ ok, data } = {}) {
  return !!(ok && data && data.success && data.dryRun && data.locationId);
}

/**
 * Roll the signals into one health verdict.
 * @param {{configured?:boolean, bridgeOk?:boolean|null, lastLeadAt?:string,
 *          now?:Date|string, recentLeads?:Array, staleDays?:number}} input
 * @returns {{level:string, tone:string, label:string, detail:string}}
 */
export function computeIgniteHealth({ configured, bridgeOk, lastLeadAt, now = new Date(), recentLeads = [], staleDays = 7 } = {}) {
  if (!configured) {
    return { level: "unconfigured", tone: HEALTH_TONES.unconfigured, label: "Not connected", detail: "Run Ignite setup to start capturing booking forms." };
  }
  if (bridgeOk === false) {
    return { level: "down", tone: HEALTH_TONES.down, label: "Pipeline broken", detail: "Validation failed — the booking-form parser or routing isn't working." };
  }
  if (parseQualityOk(recentLeads) === false) {
    return { level: "down", tone: HEALTH_TONES.down, label: "Parsing failing", detail: "Submissions are arriving but not parsing — the form format may have changed." };
  }
  const days = lastLeadAt ? daysBetween(lastLeadAt, now) : null;
  if (lastLeadAt && days != null && days > staleDays) {
    return { level: "warn", tone: HEALTH_TONES.warn, label: "No recent submissions", detail: `No booking forms in ${days} days — check the Outlook forwarding rule.` };
  }
  if (!lastLeadAt) {
    return { level: "ok", tone: HEALTH_TONES.ok, label: "Connected", detail: "Awaiting the first booking form." };
  }
  return {
    level: "ok",
    tone: HEALTH_TONES.ok,
    label: "Live",
    detail: days === 0 ? "Submission received today." : `Last submission ${days} day${days === 1 ? "" : "s"} ago.`,
  };
}

// ── At-a-glance badge + detail helpers (read the per-run ignite_health snapshot) ──

/** Compact relative age: "12s ago" / "3m ago" / "2h ago" / "5d ago". */
export function formatAgo(from, now = Date.now()) {
  if (!from) return null;
  const ms = now - new Date(from).getTime();
  if (Number.isNaN(ms)) return null;
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Time remaining to a future instant: "in 12m" / "in 2h" / "due now". */
export function formatUntil(to, now = Date.now()) {
  if (!to) return null;
  const ms = new Date(to).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "due now";
  const m = Math.round(ms / 60000);
  return m < 60 ? `in ${m}m` : `in ${Math.round(m / 60)}h`;
}

/** Local wall-clock "4:15 PM". */
export function formatClock(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Badge model from the latest snapshot — what the at-a-glance pill renders. */
export function describeHealthBadge(snapshot, now = Date.now()) {
  if (!snapshot || !snapshot.checked_at) return null;
  const level = snapshot.level || "unconfigured";
  return {
    level,
    tone: HEALTH_TONES[level] || HEALTH_TONES.unconfigured,
    ok: level === "ok",
    label: SNAPSHOT_LABELS[level] || "Unknown",
    verifiedAgo: formatAgo(snapshot.checked_at, now),
    nextClock: formatClock(snapshot.next_run_at),
    nextUntil: formatUntil(snapshot.next_run_at, now),
    detail: snapshot.detail || "",
  };
}

/** Per-dependency check rows for the detail panel (excruciating detail). */
export function healthChecks(snapshot) {
  if (!snapshot) return [];
  return [
    { key: "bridge", label: "Parser & routing", ok: snapshot.bridge_ok, ms: snapshot.bridge_ms, note: "Dry-run through the live webhook — no data written" },
    { key: "resend", label: "Resend API", ok: snapshot.resend_ok, ms: snapshot.resend_ms, note: "Inbound relay reachable (catches key / billing / outage)" },
    { key: "db", label: "Database write path", ok: snapshot.db_ok, ms: snapshot.db_ms, note: "Postgres round-trip latency" },
    {
      key: "roundtrip",
      label: "Synthetic round-trip",
      ok: snapshot.roundtrip_ok,
      ms: snapshot.roundtrip_ms,
      note: snapshot.roundtrip_ok == null ? "Idle — set IGNITE_INBOUND_ADDRESS to enable the canary" : "Tagged email sent through the real pipeline, confirmed in ignite_leads",
    },
  ];
}

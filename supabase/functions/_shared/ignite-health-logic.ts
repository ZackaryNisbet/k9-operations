// Pure, dependency-free decision logic for the Ignite health check — shared by
// the edge function (Deno) and the Vitest unit tests (Node). No runtime imports,
// so it loads identically in both. Behaviour change here changes both.

export const STALE_DAYS = 7;

// Next quarter-hour boundary (the cron cadence), so the UI can show "next run at".
export function nextQuarterHour(now: Date): string {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + (15 - (d.getMinutes() % 15 || 15)) || 15);
  if (d.getTime() <= now.getTime()) d.setMinutes(d.getMinutes() + 15);
  return d.toISOString();
}

// Roll the per-check signals into one health verdict + human-readable detail.
export function computeLevel(s: {
  bridgeOk: boolean;
  resendOk: boolean | null;
  dbOk: boolean;
  roundtripOk: boolean | null;
  lastLeadAt: string | null;
  now: Date;
}): { level: string; detail: string } {
  if (s.dbOk === false) return { level: "down", detail: "Postgres is unreachable — the database write path is down." };
  if (!s.bridgeOk) return { level: "down", detail: "Parser/routing validation failed — the dry-run did not pass." };
  if (s.resendOk === false) return { level: "down", detail: "Resend account/API is unreachable — check billing, the API key, or resend-status.com." };
  if (s.roundtripOk === false) return { level: "down", detail: "Synthetic round-trip did not land — a real submission would be lost. Check the inbound route." };
  const days = s.lastLeadAt ? Math.floor((s.now.getTime() - new Date(s.lastLeadAt).getTime()) / 86400000) : null;
  // A green synthetic round-trip has verified the entire path end-to-end, so
  // quiet real submissions are a demand signal, not a broken pipe — stay healthy.
  if (s.roundtripOk === true) {
    return {
      level: "ok",
      detail: days != null && days > STALE_DAYS
        ? `Pipeline verified end-to-end; no booking forms in ${days} days (awaiting submissions).`
        : "Pipeline verified end-to-end — synthetic round-trip landed.",
    };
  }
  // Round-trip not confirming (idle / in-flight) → fall back to the freshness heuristic.
  if (days != null && days > STALE_DAYS) {
    return { level: "warn", detail: `No booking forms in ${days} days — check the Outlook forwarding rule.` };
  }
  return { level: "ok", detail: s.lastLeadAt ? "Pipeline validated; submissions flowing." : "Pipeline validated; awaiting the first submission." };
}

import { fetchLegacyServiceRoleKey, parseArgs, resolveProjectRef } from "./_supabaseOps.mjs";

const args = parseArgs(process.argv.slice(2));
const projectRef = resolveProjectRef(args, { requireExplicit: true });
const locationId = String(args["location-id"] || "").trim();
const dateFrom = String(args["date-from"] || "").slice(0, 10);
const dateTo = String(args["date-to"] || "").slice(0, 10);
const maxDays = Math.max(1, Math.min(Number(args["max-days"] || 45), 45));
const pauseMs = Math.max(0, Number(args["pause-ms"] || 1000));
const maxProviderCalls = Math.max(1, Number(args["max-provider-calls"] || 750));
const refresh = Boolean(args.refresh);

if (!locationId) throw new Error("Pass --location-id.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
  throw new Error("Pass --date-from and --date-to as YYYY-MM-DD.");
}
if (dateTo < dateFrom) throw new Error("--date-to must be on or after --date-from.");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const serviceRoleKey = fetchLegacyServiceRoleKey(projectRef);
const endpoint = `https://${projectRef}.supabase.co/functions/v1/weather-daily`;
let cursor = dateFrom;
let batch = 0;
let totalProcessed = 0;
let stoppedReason = null;

while (cursor && cursor <= dateTo) {
  const remainingBudget = maxProviderCalls - totalProcessed;
  if (remainingBudget <= 0) {
    stoppedReason = "provider_call_budget_reached";
    break;
  }

  batch += 1;
  const batchMaxDays = Math.min(maxDays, remainingBudget);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      mode: "backfill_daily",
      location_id: locationId,
      date_from: cursor,
      date_to: dateTo,
      max_days: batchMaxDays,
      refresh,
    }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.ok === false) {
    throw new Error(`Backfill failed at ${cursor} (${response.status}): ${payload.error || text}`);
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const processed = Number(payload.backfill?.processed || 0);
  const remaining = Number(payload.backfill?.remaining || 0);
  totalProcessed += processed;
  console.log(JSON.stringify({
    batch,
    cursor,
    maxProviderCalls,
    batchMaxDays,
    processed,
    totalProcessed,
    firstRow: rows[0]?.weather_date || null,
    lastRow: rows[rows.length - 1]?.weather_date || null,
    remaining,
    nextCursor: payload.backfill?.next_cursor || null,
    warnings: payload.warnings || [],
  }));

  if (!payload.backfill?.next_cursor || processed === 0) {
    stoppedReason = processed === 0 && remaining > 0 ? "no_rows_processed" : null;
    break;
  }
  cursor = payload.backfill.next_cursor;
  await sleep(pauseMs);
}

console.log(JSON.stringify({
  complete: stoppedReason === null,
  stoppedReason,
  totalProcessed,
  maxProviderCalls,
  through: cursor,
}));

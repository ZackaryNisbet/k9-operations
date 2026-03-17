// Cash Basis Revenue — Fetches actual money collected on a given date from Gingr API.
//
// Two data sources:
//   A) Invoice Payments: list_invoices → transaction → detailed_payments
//   B) Deposit Collections: reservations → deposit.last_payment
//
// Formula: Net = (invoice_payments_positive + deposit_collections) - abs(invoice_payments_negative)

import { supabase } from "../supabaseClient";

const TZ = "America/New_York";

/**
 * Convert a Unix timestamp (seconds) to a YYYY-MM-DD string in America/New_York timezone.
 */
function unixToDateET(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // en-CA gives YYYY-MM-DD
}

/**
 * Convert a Unix timestamp to a time string in America/New_York timezone.
 */
function unixToTimeET(ts) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Check if a date string (YYYY-MM-DD or with time) matches a target date in ET.
 */
function dateMatchesET(dateStr, targetDate) {
  if (!dateStr) return false;
  // If it's already a YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr === targetDate;
  // If it's a full datetime, convert
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.toLocaleDateString("en-CA", { timeZone: TZ }) === targetDate;
}

/**
 * Load Gingr API config from lite_settings.
 */
async function loadGingrConfig(locationId) {
  const { data: cfgRows } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", "gingr_config")
    .limit(1);

  const cfg = cfgRows?.[0]?.setting_value;
  if (!cfg?.api_key || !cfg?.subdomain) return null;
  return cfg;
}

/**
 * addDaysStr — add N days to a YYYY-MM-DD date string.
 */
function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

// ─── Source A: Invoice Payments ───────────────────────────────────────────────

/**
 * Fetch all completed invoices from a date range (paginated).
 * Returns array of invoice objects with { id, ... }.
 */
async function fetchInvoices(cfg, fromDate, toDate) {
  const allInvoices = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://${cfg.subdomain}.gingrapp.com/api/v1/list_invoices?${new URLSearchParams({
      key: cfg.api_key,
      from_date: fromDate,
      to_date: toDate,
      complete: "true",
      per_page: String(perPage),
      page: String(page),
    })}`;

    const resp = await fetch(url);
    if (!resp.ok) break;

    const json = await resp.json();
    const invoices = json.data || json;
    if (!Array.isArray(invoices) || invoices.length === 0) break;

    allInvoices.push(...invoices);
    if (invoices.length < perPage) break;
    page++;
    // Safety: cap at 100 pages
    if (page > 100) break;
  }

  return allInvoices;
}

/**
 * Fetch transaction details for a single invoice.
 * Returns the detailed_payments object (or null).
 */
async function fetchTransaction(cfg, invoiceId) {
  const resp = await fetch(
    `https://${cfg.subdomain}.gingrapp.com/api/v1/transaction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: new URLSearchParams({ key: cfg.api_key, id: String(invoiceId) }),
    }
  );
  if (!resp.ok) return null;
  const json = await resp.json();
  return json;
}

/**
 * Extract payment events from a transaction's detailed_payments that fall on targetDate.
 * Returns array of { amount, ownerName, paymentMethod, time, timeStr, isRefund, invoiceId }.
 */
function extractPaymentsForDate(txnData, targetDate, invoiceId) {
  const dp = txnData?.detailed_payments;
  if (!dp || typeof dp !== "object") return [];

  // Get the deposit metadata (not a payment entry itself)
  const depositMeta = dp.deposit && typeof dp.deposit === "object" && !Array.isArray(dp.deposit)
    ? dp.deposit
    : null;

  // Check if this is a forfeited deposit — if deposit.forfeited_at falls on target date
  let forfeitedTs = null;
  if (depositMeta && depositMeta.forfeited_at) {
    const forfeitDate = unixToDateET(Number(depositMeta.forfeited_at));
    if (forfeitDate === targetDate) {
      forfeitedTs = Number(depositMeta.forfeited_at);
    }
  }

  const ownerName = txnData?.owner_name ||
    [txnData?.owner?.first_name, txnData?.owner?.last_name].filter(Boolean).join(" ") ||
    "Unknown";

  const payments = [];

  for (const [key, entry] of Object.entries(dp)) {
    // Skip the "deposit" metadata key — it's not a payment entry
    if (key === "deposit") continue;

    // entry could be a single payment or nested
    const entries = Array.isArray(entry) ? entry : [entry];
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const ts = Number(e.transaction_time);
      if (!ts || isNaN(ts)) continue;

      const payDate = unixToDateET(ts);
      if (payDate !== targetDate) continue;

      const amount = Number(e.total_balance) || 0;

      // Skip zero payments
      if (e.zero_payment === "1" || e.zero_payment === 1 || amount === 0) continue;

      // Skip forfeited deposit payments
      if (forfeitedTs && Math.abs(ts - forfeitedTs) < 120) continue;

      payments.push({
        amount,
        ownerName,
        paymentMethod: e.payment_method_type || "Unknown",
        time: ts,
        timeStr: unixToTimeET(ts),
        isRefund: amount < 0,
        invoiceId,
        source: "invoice",
      });
    }
  }

  return payments;
}

// ─── Source B: Deposit Collections ────────────────────────────────────────────

/**
 * Fetch reservations from Gingr API for a date range (max 30 days per call).
 */
async function fetchReservations(cfg, startDate, endDate) {
  const resp = await fetch(
    `https://${cfg.subdomain}.gingrapp.com/api/v1/reservations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: new URLSearchParams({
        key: cfg.api_key,
        start_date: startDate,
        end_date: endDate,
      }),
    }
  );
  if (!resp.ok) return [];
  const json = await resp.json();
  const resData = json.data || json;
  return typeof resData === "object" && !Array.isArray(resData)
    ? Object.values(resData)
    : Array.isArray(resData) ? resData : [];
}

/**
 * Find deposit collections for a target date from reservations.
 * A deposit is "collected" on the date of deposit.last_payment.
 */
function extractDepositCollections(reservations, targetDate) {
  const deposits = [];
  const seen = new Set();

  for (const res of reservations) {
    const dep = res.deposit;
    if (!dep || typeof dep !== "object" || Array.isArray(dep)) continue;

    const paidAmount = Number(dep.paid_amount) || 0;
    if (paidAmount <= 0) continue;

    // Check if last_payment falls on target date
    const lastPayment = dep.last_payment;
    if (!lastPayment) continue;

    let matchesDate = false;
    if (typeof lastPayment === "number") {
      matchesDate = unixToDateET(lastPayment) === targetDate;
    } else if (typeof lastPayment === "string") {
      matchesDate = dateMatchesET(lastPayment, targetDate);
    }

    if (!matchesDate) continue;

    // Skip forfeited deposits
    if (dep.forfeited_at) continue;

    // Deduplicate by reservation_id
    const resId = res.reservation_id || res.id;
    if (seen.has(resId)) continue;
    seen.add(resId);

    const ownerName = [res.owner?.first_name, res.owner?.last_name].filter(Boolean).join(" ") || "Unknown";

    deposits.push({
      amount: paidAmount,
      ownerName,
      paymentMethod: "Deposit",
      time: typeof lastPayment === "number" ? lastPayment : new Date(lastPayment).getTime() / 1000,
      timeStr: typeof lastPayment === "number"
        ? unixToTimeET(lastPayment)
        : new Date(lastPayment).toLocaleTimeString("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }),
      isRefund: false,
      reservationId: resId,
      animalName: res.animal?.name || null,
      source: "deposit",
    });
  }

  return deposits;
}

// ─── Main: Fetch Cash Basis Revenue for a Date ───────────────────────────────

/**
 * fetchCashBasisForDate(locationId, targetDate)
 *
 * Returns: {
 *   payments: [ { amount, ownerName, paymentMethod, timeStr, isRefund, source } ],
 *   grossPayments: number,
 *   depositCollections: number,
 *   refunds: number,
 *   netRevenue: number,
 * }
 */
export async function fetchCashBasisForDate(locationId, targetDate) {
  const cfg = await loadGingrConfig(locationId);
  if (!cfg) return emptyResult();

  // Fetch invoices and reservations in parallel
  const invoiceFromDate = addDaysStr(targetDate, -180);
  const invoiceToDate = addDaysStr(targetDate, 1);

  // For reservations: search 30 days before and 60 days after target date
  const resStartBefore = addDaysStr(targetDate, -30);
  const resEndAfter = addDaysStr(targetDate, 60);

  // Fetch in parallel: invoices + 3 reservation windows (each max 30 days)
  const [invoices, resBefore, resMiddle, resAfter] = await Promise.all([
    fetchInvoices(cfg, invoiceFromDate, invoiceToDate),
    fetchReservations(cfg, resStartBefore, targetDate),
    fetchReservations(cfg, addDaysStr(targetDate, 1), addDaysStr(targetDate, 30)),
    fetchReservations(cfg, addDaysStr(targetDate, 31), resEndAfter),
  ]);

  // Process invoice payments: fetch transaction details for each invoice
  // Batch in chunks to avoid overwhelming the API
  const allPayments = [];
  const BATCH_SIZE = 15;

  for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
    const batch = invoices.slice(i, i + BATCH_SIZE);
    const txnResults = await Promise.all(
      batch.map(inv => {
        const invId = inv.id || inv.invoice_id;
        return fetchTransaction(cfg, invId).then(txn => ({ txn, invId }));
      })
    );

    for (const { txn, invId } of txnResults) {
      if (!txn) continue;
      const payments = extractPaymentsForDate(txn, targetDate, invId);
      allPayments.push(...payments);
    }
  }

  // Process deposit collections
  const allReservations = [...resBefore, ...resMiddle, ...resAfter];
  const depositPayments = extractDepositCollections(allReservations, targetDate);

  // Deduplicate: remove deposit collections that already appear as invoice payments
  // (some deposits may also show in invoice transactions)
  const invoiceOwnerAmounts = new Set(
    allPayments.filter(p => !p.isRefund).map(p => `${p.ownerName}|${p.amount.toFixed(2)}`)
  );
  const uniqueDeposits = depositPayments.filter(
    d => !invoiceOwnerAmounts.has(`${d.ownerName}|${d.amount.toFixed(2)}`)
  );

  const combined = [...allPayments, ...uniqueDeposits];

  // Sort by time
  combined.sort((a, b) => (a.time || 0) - (b.time || 0));

  // Calculate totals
  const grossPayments = combined
    .filter(p => p.amount > 0 && p.source === "invoice")
    .reduce((sum, p) => sum + p.amount, 0);
  const depositCollections = combined
    .filter(p => p.amount > 0 && p.source === "deposit")
    .reduce((sum, p) => sum + p.amount, 0);
  const refunds = Math.abs(
    combined
      .filter(p => p.amount < 0)
      .reduce((sum, p) => sum + p.amount, 0)
  );

  return {
    payments: combined,
    grossPayments,
    depositCollections,
    refunds,
    netRevenue: grossPayments + depositCollections - refunds,
  };
}

function emptyResult() {
  return { payments: [], grossPayments: 0, depositCollections: 0, refunds: 0, netRevenue: 0 };
}

// ─── Cached / Daily Summary ──────────────────────────────────────────────────

/**
 * fetchCashBasisCached(locationId, dateFrom, dateTo)
 *
 * For a date range, returns Map<dateStr, { netRevenue, grossPayments, depositCollections, refunds }>.
 * Uses dashboard_metrics_daily for historical data,
 * live-fetches today from Gingr API.
 */
export async function fetchCashBasisCached(locationId, dateFrom, dateTo) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const result = new Map();

  // If the range includes today, fetch live data for today
  if (dateTo >= today && dateFrom <= today) {
    const todayData = await fetchCashBasisForDate(locationId, today);
    result.set(today, todayData);
  }

  return result;
}

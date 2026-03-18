// Cash Basis Revenue — Reads pre-synced invoice and deposit data from Supabase.
//
// The gingr-sync edge function syncs invoices and deposits into Supabase tables
// and pre-computes daily totals in dashboard_metrics_daily. This module reads
// from those tables instead of making live Gingr API calls.
//
// Formula: Net = Collected Payments + Collected Deposits − Refunds

import { supabase } from "../supabaseClient";

const TZ = "America/New_York";

function emptyResult() {
  return { payments: [], grossPayments: 0, depositCollections: 0, refunds: 0, netRevenue: 0 };
}

/**
 * fetchCashBasisForDate(locationId, targetDate)
 *
 * Reads synced invoices and deposits from Supabase for a single date.
 * Returns the same shape as the old live-API version so the dashboard
 * works without changes.
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
  // Fetch Cash + CC payment entries for this date
  const { data: paymentEntries, error: payErr } = await supabase
    .from("gingr_invoice_payments")
    .select("id, invoice_id, payment_method_type, total_balance, transaction_time")
    .eq("location_id", locationId)
    .eq("transaction_date", targetDate)
    .in("payment_method_type", ["Cash", "Credit Card"])
    .eq("is_zero_payment", false)
    .eq("is_admin_comp", false)
    .order("transaction_time", { ascending: true });

  if (payErr) {
    console.error("Error fetching payment entries:", payErr.message);
    return emptyResult();
  }

  // Fetch deposits paid on this date
  const { data: deposits, error: depErr } = await supabase
    .from("gingr_deposits")
    .select("reservation_gingr_id, owner_name, animal_name, paid_amount, last_payment")
    .eq("location_id", locationId)
    .gte("last_payment", `${targetDate}T00:00:00`)
    .lt("last_payment", `${targetDate}T23:59:59`)
    .gt("paid_amount", 0)
    .order("last_payment", { ascending: true });

  if (depErr) {
    console.error("Error fetching deposits:", depErr.message);
    return emptyResult();
  }

  // Also fetch invoice details for owner names
  const invoiceIds = [...new Set((paymentEntries || []).map(p => p.invoice_id))];
  let invoiceMap = {};
  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabase
      .from("gingr_invoices")
      .select("id, first_name, last_name")
      .eq("location_id", locationId)
      .in("id", invoiceIds);
    (invoices || []).forEach(inv => {
      invoiceMap[inv.id] = `${inv.first_name || ""} ${inv.last_name || ""}`.trim() || "Unknown";
    });
  }

  const payments = [];

  // Map payment entries
  for (const entry of (paymentEntries || [])) {
    const balance = parseFloat(entry.total_balance) || 0;
    if (balance === 0) continue;

    const txTime = entry.transaction_time ? new Date(entry.transaction_time) : new Date();
    const timeStr = txTime.toLocaleTimeString("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    });

    payments.push({
      amount: balance, // positive for payment, negative for refund
      ownerName: invoiceMap[entry.invoice_id] || "Unknown",
      paymentMethod: balance < 0 ? "Refund" : entry.payment_method_type,
      time: txTime.getTime() / 1000,
      timeStr,
      isRefund: balance < 0,
      invoiceId: entry.invoice_id,
      source: "invoice",
    });
  }

  // Map deposits
  for (const dep of (deposits || [])) {
    const amount = parseFloat(dep.paid_amount) || 0;
    if (amount <= 0) continue;

    const lastPayment = new Date(dep.last_payment);
    const timeStr = lastPayment.toLocaleTimeString("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    });

    payments.push({
      amount,
      ownerName: dep.owner_name || "Unknown",
      paymentMethod: "Deposit",
      time: lastPayment.getTime() / 1000,
      timeStr,
      isRefund: false,
      reservationId: dep.reservation_gingr_id,
      animalName: dep.animal_name,
      source: "deposit",
    });
  }

  payments.sort((a, b) => (a.time || 0) - (b.time || 0));

  const grossPayments = payments
    .filter(p => !p.isRefund && p.source === "invoice")
    .reduce((sum, p) => sum + p.amount, 0);
  const depositCollections = payments
    .filter(p => p.source === "deposit")
    .reduce((sum, p) => sum + p.amount, 0);
  const refunds = payments
    .filter(p => p.isRefund)
    .reduce((sum, p) => sum + Math.abs(p.amount), 0);

  return {
    payments,
    grossPayments,
    depositCollections,
    refunds,
    netRevenue: grossPayments + depositCollections - refunds,
  };
}

/**
 * fetchCashBasisCached(locationId, dateFrom, dateTo)
 *
 * For a date range, returns Map<dateStr, { netRevenue, grossPayments, depositCollections, refunds }>.
 * Reads from dashboard_metrics_daily which is populated by the sync edge function.
 */
export async function fetchCashBasisCached(locationId, dateFrom, dateTo) {
  const result = new Map();

  const { data: rows, error } = await supabase
    .from("dashboard_metrics_daily")
    .select("metric_date, cash_collected_payments, cash_collected_deposits, cash_refunds, cash_net_revenue")
    .eq("location_id", locationId)
    .gte("metric_date", dateFrom)
    .lte("metric_date", dateTo)
    .order("metric_date", { ascending: true });

  if (error) {
    console.error("Error fetching cached cash basis:", error.message);
    return result;
  }

  for (const row of (rows || [])) {
    const dateStr = typeof row.metric_date === "string"
      ? row.metric_date.split("T")[0]
      : row.metric_date;

    result.set(dateStr, {
      grossPayments: parseFloat(row.cash_collected_payments) || 0,
      depositCollections: parseFloat(row.cash_collected_deposits) || 0,
      refunds: parseFloat(row.cash_refunds) || 0,
      netRevenue: parseFloat(row.cash_net_revenue) || 0,
    });
  }

  return result;
}

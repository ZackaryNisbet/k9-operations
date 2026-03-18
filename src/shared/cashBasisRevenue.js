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
  // Fetch invoices for this date
  const { data: invoices, error: invErr } = await supabase
    .from("gingr_invoices")
    .select("id, first_name, last_name, total, is_returned, created_at")
    .eq("location_id", locationId)
    .gte("created_at", `${targetDate}T00:00:00`)
    .lt("created_at", `${targetDate}T23:59:59`)
    .order("created_at", { ascending: true });

  if (invErr) {
    console.error("Error fetching invoices:", invErr.message);
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

  const payments = [];

  // Map invoices to payment entries
  for (const inv of (invoices || [])) {
    const amount = parseFloat(inv.total) || 0;
    if (amount === 0) continue;

    const ownerName = [inv.first_name, inv.last_name].filter(Boolean).join(" ") || "Unknown";
    const createdAt = new Date(inv.created_at);
    const timeStr = createdAt.toLocaleTimeString("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    });

    payments.push({
      amount: inv.is_returned ? -amount : amount,
      ownerName,
      paymentMethod: inv.is_returned ? "Refund" : "Invoice",
      time: createdAt.getTime() / 1000,
      timeStr,
      isRefund: !!inv.is_returned,
      invoiceId: inv.id,
      source: "invoice",
    });
  }

  // Map deposits to payment entries
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

  // Sort by time
  payments.sort((a, b) => (a.time || 0) - (b.time || 0));

  // Calculate totals
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

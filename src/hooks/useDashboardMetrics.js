// K9 Operations — Server-Side Dashboard Metrics Hook
// Reads from pre-computed dashboard_metrics_daily table.
// Implements stale-while-revalidate: shows cached data instantly, refreshes in background.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { getCachedMetrics, setCachedMetrics } from "../shared/dashboardCache";

/**
 * useDashboardMetrics(locationId, dateFrom, dateTo, prevFrom, prevTo, options)
 *
 * Returns:
 *   metrics     — aggregated current-period metrics
 *   prevMetrics — aggregated prior-period metrics (for trend badges)
 *   dailyRows   — raw daily rows for chart rendering
 *   prevDailyRows — raw daily rows for prior period charts
 *   loading     — true while fetching (false if showing cached data)
 *   lastUpdated — when the data was last computed
 *   lastFetchedAt — when data was last fetched from server
 *   refresh()   — manual refresh trigger
 *
 * options.refreshIntervalMs  — polling interval in ms (default: 15 min)
 * options.isWithinBusinessHours — function returning boolean; polling pauses outside hours
 */
const DEFAULT_REFRESH_MS = 15 * 60 * 1000; // 15 minutes

export function useDashboardMetrics(locationId, dateFrom, dateTo, prevFrom, prevTo, options = {}) {
  const { refreshIntervalMs = DEFAULT_REFRESH_MS, isWithinBusinessHours } = options;
  const [metrics, setMetrics] = useState(null);
  const [prevMetrics, setPrevMetrics] = useState(null);
  const [dailyRows, setDailyRows] = useState([]);
  const [prevDailyRows, setPrevDailyRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const fetchIdRef = useRef(0);
  const intervalRef = useRef(null);

  const fetchMetrics = useCallback(async (skipCache = false) => {
    if (!locationId || !dateFrom || !dateTo) return;

    const fetchId = ++fetchIdRef.current;

    // Stale-while-revalidate: check cache first
    if (!skipCache) {
      const cached = getCachedMetrics(locationId, dateFrom, dateTo);
      if (cached) {
        // Show cached data immediately — no loading spinner
        const { metrics: cm, prevMetrics: cpm, dailyRows: cdr, prevDailyRows: cpdr, lastUpdated: clu } = cached.data;
        setMetrics(cm);
        setPrevMetrics(cpm);
        setDailyRows(cdr);
        setPrevDailyRows(cpdr);
        setLastUpdated(clu);
        setLoading(false);

        // If cache is fresh, skip network fetch entirely
        if (cached.isFresh) return;
        // Otherwise, revalidate in background (don't set loading=true)
      } else {
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    try {
      // Fetch current period, prior period, and outstanding invoices in parallel
      const [currentRes, priorRes, invoiceRes] = await Promise.all([
        supabase
          .from("dashboard_metrics_daily")
          .select("*")
          .eq("location_id", locationId)
          .gte("metric_date", dateFrom)
          .lte("metric_date", dateTo)
          .order("metric_date", { ascending: true }),
        prevFrom && prevTo
          ? supabase
              .from("dashboard_metrics_daily")
              .select("*")
              .eq("location_id", locationId)
              .gte("metric_date", prevFrom)
              .lte("metric_date", prevTo)
              .order("metric_date", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        // Outstanding invoices: live query from gingr_owners (owners with balance > 0)
        supabase
          .from("gingr_owners")
          .select("current_balance")
          .eq("location_id", locationId)
          .gt("current_balance", 0),
      ]);

      // Abort if a newer fetch has been initiated
      if (fetchId !== fetchIdRef.current) return;

      if (currentRes.error) throw currentRes.error;

      const rows = currentRes.data || [];
      const prevRows = priorRes.data || [];

      // Compute outstanding invoice snapshot from gingr_owners
      const invoiceRows = invoiceRes.data || [];
      const outstandingInvoices = {
        count: invoiceRows.length,
        total: invoiceRows.reduce((sum, r) => sum + (Number(r.current_balance) || 0), 0),
      };

      const newMetrics = aggregateRows(rows, outstandingInvoices);
      const newPrevMetrics = aggregateRows(prevRows, outstandingInvoices);
      const newLastUpdated = rows.length > 0 ? rows[rows.length - 1].computed_at : null;

      setDailyRows(rows);
      setPrevDailyRows(prevRows);
      setMetrics(newMetrics);
      setPrevMetrics(newPrevMetrics);
      setLastUpdated(newLastUpdated);
      setLastFetchedAt(new Date());

      // Cache the results for this timeframe
      setCachedMetrics(locationId, dateFrom, dateTo, {
        metrics: newMetrics,
        prevMetrics: newPrevMetrics,
        dailyRows: rows,
        prevDailyRows: prevRows,
        lastUpdated: newLastUpdated,
      });
    } catch (err) {
      console.error("Dashboard metrics fetch error:", err);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [locationId, dateFrom, dateTo, prevFrom, prevTo]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-polling: re-fetch metrics at configured interval
  // Skips polling outside business hours when isWithinBusinessHours is provided
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = refreshIntervalMs || DEFAULT_REFRESH_MS;
    intervalRef.current = setInterval(() => {
      if (typeof isWithinBusinessHours === "function" && !isWithinBusinessHours()) return;
      fetchMetrics();
    }, ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMetrics, refreshIntervalMs, isWithinBusinessHours]);

  // Manual refresh: triggers gingr-sync, then re-fetches (skipping cache)
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Trigger sync which will recompute metrics
      await supabase.functions.invoke("gingr-sync", {
        body: { location_id: locationId, sync_type: "incremental" },
      });
      // Wait a beat for the RPC to finish, then re-fetch
      await new Promise(r => setTimeout(r, 1000));
      await fetchMetrics(true);
    } catch (err) {
      console.error("Dashboard refresh error:", err);
      setLoading(false);
    }
  }, [locationId, fetchMetrics]);

  return { metrics, prevMetrics, dailyRows, prevDailyRows, loading, lastUpdated, lastFetchedAt, refresh };
}

/**
 * Aggregate an array of daily metric rows into totals.
 * For snapshot fields (in_house, occupancy), uses the LAST row (most recent day).
 * For cumulative fields (revenue, transactions), SUMs across all rows.
 */
function aggregateRows(rows, outstandingInvoices = { count: 0, total: 0 }) {
  if (!rows || rows.length === 0) return emptyMetrics();

  const last = rows[rows.length - 1];
  const sum = (field) => rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
  const avg = (field) => {
    const vals = rows.map(r => Number(r[field]) || 0).filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const isMultiDay = rows.length > 1;

  return {
    // Snapshot for single day (Today), SUM for multi-day ranges (Past Week, etc.)
    dogsExpected: isMultiDay ? sum("dogs_expected") : Number(last.dogs_expected) || 0,
    dogsInHouse: isMultiDay ? sum("dogs_in_house") : Number(last.dogs_in_house) || 0,
    boardingInHouse: isMultiDay ? sum("boarding_in_house") : Number(last.boarding_in_house) || 0,
    daycareInHouse: isMultiDay ? sum("daycare_in_house") : Number(last.daycare_in_house) || 0,
    dogsGoingHome: isMultiDay ? sum("dogs_going_home") : Number(last.dogs_going_home) || 0,
    dogsCheckedOut: isMultiDay ? sum("dogs_checked_out") : Number(last.dogs_checked_out) || 0,
    dogsArriving: isMultiDay ? sum("dogs_arriving") : Number(last.dogs_arriving) || 0,
    occupancyPct: Number(last.occupancy_pct) || 0,
    totalRoomCount: Number(last.total_room_count) || 0,
    bookingsToday: isMultiDay ? sum("bookings_today") : Number(last.bookings_today) || 0,
    toursToday: isMultiDay ? sum("tours_today") : Number(last.tours_today) || 0,
    evalsToday: isMultiDay ? sum("evals_today") : Number(last.evals_today) || 0,

    // Accrual Revenue (SUM across range)
    accrualBoardingRevenue: sum("accrual_boarding_revenue"),
    accrualDaycareRevenue: sum("accrual_daycare_revenue"),
    accrualTotalRevenue: sum("accrual_total_revenue"),
    accrualRoomsOccupied: sum("accrual_rooms_occupied"),

    // Cash Revenue (SUM across range)
    cashTotalRevenue: sum("cash_total_revenue"),
    cashTransactionCount: sum("cash_transaction_count"),
    cashBoardingRevenue: sum("cash_boarding_revenue"),
    cashDaycareRevenue: sum("cash_daycare_revenue"),

    // Average Transaction Price = Total Cash Revenue / Total Transactions
    // Formula: SUM(cash_total_revenue) / SUM(cash_transaction_count)
    // cash_total_revenue = sum of all positive transaction.price values for the period
    // cash_transaction_count = count of ALL non-cancelled reservations (including $0 package deals)
    // VERIFIED: This is the standard "average transaction price" calculation.
    cashAvgTransaction: sum("cash_transaction_count") > 0
      ? sum("cash_total_revenue") / sum("cash_transaction_count")
      : 0,

    // Refunds (SUM across range)
    // refund_count = reservations where transaction.is_returned = true AND refund_amount > 0
    // refund_total = SUM of transaction.refund_amount for returned reservations
    refundCount: sum("refund_count"),
    refundTotal: sum("refund_total"),
    // Discounts (SUM across range) — rack-rate comparison
    // discounted_count = boarding reservations where actual price < 98% of rack rate
    // discount_total = SUM of (rack_rate - actual_price) for discounted reservations
    discountedCount: sum("discounted_count"),
    discountTotal: sum("discount_total"),

    // Outstanding Invoices (live snapshot from gingr_owners, not from pre-computed table)
    // Counts owners with current_balance > 0 — queried directly for real-time accuracy
    outstandingInvoiceCount: outstandingInvoices.count,
    outstandingInvoiceTotal: outstandingInvoices.total,

    // RevPAR (Revenue Per Available Room) = Total Boarding Revenue / Total Available Room-Nights
    // Formula: SUM(accrual_boarding_revenue) / (total_room_count × number_of_days_in_period)
    // Uses accrual boarding revenue (per-night rate spread across stay) divided by
    // available room inventory (rooms × days). This is the standard hotel industry RevPAR formula.
    // VERIFIED: Matches industry standard RevPAR = Total Room Revenue / Available Rooms.
    revPAR: (() => {
      const totalRooms = Number(last.total_room_count) || 28;
      return totalRooms > 0 && rows.length > 0
        ? sum("accrual_boarding_revenue") / (totalRooms * rows.length)
        : 0;
    })(),

    // Revenue composition
    boardingPct: sum("accrual_total_revenue") > 0
      ? (sum("accrual_boarding_revenue") / sum("accrual_total_revenue")) * 100
      : 0,
    daycarePct: sum("accrual_total_revenue") > 0
      ? (sum("accrual_daycare_revenue") / sum("accrual_total_revenue")) * 100
      : 0,

    // Occupancy rate (avg across range)
    occupancyRate: (() => {
      const totalRooms = Number(last.total_room_count) || 28;
      return totalRooms > 0 && rows.length > 0
        ? (sum("accrual_rooms_occupied") / (totalRooms * rows.length)) * 100
        : 0;
    })(),
  };
}

function emptyMetrics() {
  return {
    dogsExpected: 0, dogsInHouse: 0, boardingInHouse: 0, daycareInHouse: 0,
    dogsGoingHome: 0, dogsCheckedOut: 0, dogsArriving: 0,
    occupancyPct: 0, totalRoomCount: 0, bookingsToday: 0, toursToday: 0, evalsToday: 0,
    accrualBoardingRevenue: 0, accrualDaycareRevenue: 0, accrualTotalRevenue: 0, accrualRoomsOccupied: 0,
    cashTotalRevenue: 0, cashTransactionCount: 0, cashBoardingRevenue: 0, cashDaycareRevenue: 0,
    cashAvgTransaction: 0,
    refundCount: 0, refundTotal: 0, discountedCount: 0, discountTotal: 0,
    outstandingInvoiceCount: 0, outstandingInvoiceTotal: 0,
    revPAR: 0, boardingPct: 0, daycarePct: 0, occupancyRate: 0,
  };
}

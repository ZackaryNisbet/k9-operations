// K9 Operations — Server-Side Dashboard Metrics Hook
// Reads from pre-computed dashboard_metrics_daily table.
// No client-side 136K iteration. Timeframe changes = simple Supabase query.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";

/**
 * useDashboardMetrics(locationId, dateFrom, dateTo, prevFrom, prevTo)
 *
 * Returns:
 *   metrics     — aggregated current-period metrics
 *   prevMetrics — aggregated prior-period metrics (for trend badges)
 *   dailyRows   — raw daily rows for chart rendering
 *   prevDailyRows — raw daily rows for prior period charts
 *   loading     — true while fetching
 *   lastUpdated — when the data was last computed
 *   refresh()   — manual refresh trigger
 */
export function useDashboardMetrics(locationId, dateFrom, dateTo, prevFrom, prevTo) {
  const [metrics, setMetrics] = useState(null);
  const [prevMetrics, setPrevMetrics] = useState(null);
  const [dailyRows, setDailyRows] = useState([]);
  const [prevDailyRows, setPrevDailyRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);

  const fetchMetrics = useCallback(async () => {
    if (!locationId || !dateFrom || !dateTo) return;

    setLoading(true);

    try {
      // Fetch current period + prior period in parallel
      const [currentRes, priorRes] = await Promise.all([
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
      ]);

      if (currentRes.error) throw currentRes.error;

      const rows = currentRes.data || [];
      const prevRows = priorRes.data || [];

      setDailyRows(rows);
      setPrevDailyRows(prevRows);
      setMetrics(aggregateRows(rows));
      setPrevMetrics(aggregateRows(prevRows));
      setLastUpdated(rows.length > 0 ? rows[rows.length - 1].computed_at : null);
    } catch (err) {
      console.error("Dashboard metrics fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [locationId, dateFrom, dateTo, prevFrom, prevTo]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Manual refresh: triggers gingr-sync, then re-fetches
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Trigger sync which will recompute metrics
      await supabase.functions.invoke("gingr-sync", {
        body: { location_id: locationId, sync_type: "incremental" },
      });
      // Wait a beat for the RPC to finish, then re-fetch
      await new Promise(r => setTimeout(r, 1000));
      await fetchMetrics();
    } catch (err) {
      console.error("Dashboard refresh error:", err);
      setLoading(false);
    }
  }, [locationId, fetchMetrics]);

  return { metrics, prevMetrics, dailyRows, prevDailyRows, loading, lastUpdated, refresh };
}

/**
 * Aggregate an array of daily metric rows into totals.
 * For snapshot fields (in_house, occupancy), uses the LAST row (most recent day).
 * For cumulative fields (revenue, transactions), SUMs across all rows.
 */
function aggregateRows(rows) {
  if (!rows || rows.length === 0) return emptyMetrics();

  const last = rows[rows.length - 1];
  const sum = (field) => rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
  const avg = (field) => {
    const vals = rows.map(r => Number(r[field]) || 0).filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  return {
    // Snapshot (today or last day in range)
    dogsExpected: Number(last.dogs_expected) || 0,
    dogsInHouse: Number(last.dogs_in_house) || 0,
    boardingInHouse: Number(last.boarding_in_house) || 0,
    daycareInHouse: Number(last.daycare_in_house) || 0,
    dogsGoingHome: Number(last.dogs_going_home) || 0,
    dogsCheckedOut: Number(last.dogs_checked_out) || 0,
    dogsArriving: Number(last.dogs_arriving) || 0,
    occupancyPct: Number(last.occupancy_pct) || 0,
    totalRoomCount: Number(last.total_room_count) || 0,
    bookingsToday: Number(last.bookings_today) || 0,
    toursToday: Number(last.tours_today) || 0,
    evalsToday: Number(last.evals_today) || 0,

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

    // Average ticket
    cashAvgTransaction: sum("cash_transaction_count") > 0
      ? sum("cash_total_revenue") / sum("cash_transaction_count")
      : 0,

    // Refunds (SUM across range)
    refundCount: sum("refund_count"),
    refundTotal: sum("refund_total"),
    discountedCount: sum("discounted_count"),
    discountTotal: sum("discount_total"),

    // Derived: RevPAR
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
    revPAR: 0, boardingPct: 0, daycarePct: 0, occupancyRate: 0,
  };
}

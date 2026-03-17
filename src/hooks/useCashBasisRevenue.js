// Cash Basis Revenue Hook
// Provides cash basis revenue data for the dashboard charts and receipt modal.
//
// Architecture:
//   - Historical dates: served from dashboard_metrics_daily (pre-computed server-side)
//   - Today: live-fetched from Gingr API every 60s via background poll
//   - Receipt detail: on-demand fetch via fetchCashBasisForDate
//
// The hook overlays today's live-fetched value on top of the server metrics
// so the chart always shows accurate data for "today".

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchCashBasisForDate } from "../shared/cashBasisRevenue";

const POLL_INTERVAL = 60000; // 60 seconds

/**
 * useCashBasisLive(locationId)
 *
 * Polls Gingr API every 60s for today's cash basis revenue.
 * Returns:
 *   todayCashData — { netRevenue, grossPayments, depositCollections, refunds, payments }
 *   ready — true after first fetch
 */
export function useCashBasisLive(locationId) {
  const [todayCashData, setTodayCashData] = useState(null);
  const [ready, setReady] = useState(false);
  const cancelledRef = useRef(false);
  const fetchingRef = useRef(false);

  const fetchLive = useCallback(async () => {
    if (!locationId || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const data = await fetchCashBasisForDate(locationId, today);
      if (!cancelledRef.current) {
        setTodayCashData(data);
        setReady(true);
      }
    } catch (err) {
      console.warn("Cash basis live fetch error:", err);
    } finally {
      fetchingRef.current = false;
    }
  }, [locationId]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchLive();
    const interval = setInterval(fetchLive, POLL_INTERVAL);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [fetchLive]);

  return { todayCashData, ready, refresh: fetchLive };
}

/**
 * buildCashChartRows(dailyRows, todayCashData)
 *
 * Takes server-side dashboard_metrics_daily rows and overlays today's
 * live-fetched cash basis revenue on the last row (if it matches today's date).
 * Returns the same shape array with corrected values.
 */
export function buildCashChartRows(dailyRows, todayCashData) {
  if (!dailyRows || dailyRows.length === 0) return dailyRows || [];
  if (!todayCashData) return dailyRows;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  return dailyRows.map(row => {
    if (row.metric_date === today) {
      return {
        ...row,
        cash_total_revenue: todayCashData.netRevenue,
      };
    }
    return row;
  });
}

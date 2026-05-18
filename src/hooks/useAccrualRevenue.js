// K9 Operations — Accrual Revenue Hook
// Fetches raw reservations from Supabase for the selected date range
// and computes accrual revenue per day using the receipt methodology
// (sibling grouping + room rate fallback for boarding, base rates for daycare).
// This replaces reading accrual values from dashboard_metrics_daily.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { computeAccrualByDay, computeAccrualTotals } from "../shared/accrualEngine";
import { addDays } from "../shared/theme";
import { mergeGingrLive } from "../shared/gingrLive";

/**
 * useAccrualRevenue(locationId, dateFrom, dateTo, prevFrom, prevTo)
 *
 * Returns:
 *   accrualDailyRows  — [{ metric_date, accrual_boarding_revenue, accrual_daycare_revenue, accrual_total_revenue }]
 *   accrualTotals      — { boardingRevenue, daycareRevenue, totalRevenue }
 *   prevAccrualDailyRows — same shape for prior period
 *   prevAccrualTotals  — totals for prior period
 *   loading            — boolean
 */
export function useAccrualRevenue(locationId, dateFrom, dateTo, prevFrom, prevTo, gingrLiveRows) {
  const [accrualDailyRows, setAccrualDailyRows] = useState([]);
  const [accrualTotals, setAccrualTotals] = useState({ boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0 });
  const [prevAccrualDailyRows, setPrevAccrualDailyRows] = useState([]);
  const [prevAccrualTotals, setPrevAccrualTotals] = useState({ boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const fetchAccrual = useCallback(async () => {
    if (!locationId || !dateFrom || !dateTo) return;
    const fetchId = ++fetchIdRef.current;
    setLoading(true);

    try {
      // Determine the full date range needed (including prior period for overlap)
      const earliest = prevFrom && prevFrom < dateFrom ? prevFrom : dateFrom;
      const latest = dateTo;

      // Fetch all reservations that overlap the combined range
      // Boarding: start_date <= latest AND end_date >= earliest (overlap check)
      // Daycare/Day Boarding: start_date within range (end_date may be NULL or same-day)
      // Use OR to include records where end_date >= earliest OR end_date is null
      // Fetch from Supabase (synced data)
      const { data: supabaseRes, error } = await supabase
        .from("gingr_reservations")
        .select("gingr_id,animal_name,owner_first_name,owner_last_name,reservation_type_name,start_date,end_date,deposit,transaction,cancelled_date,services")
        .eq("location_id", locationId)
        .lte("start_date", latest + "T23:59:59")
        .or(`end_date.gte.${earliest}T00:00:00,end_date.is.null`)
        .is("cancelled_date", null);

      if (fetchId !== fetchIdRef.current) return; // stale
      if (error) { console.error("Accrual fetch error:", error); setLoading(false); return; }

      // Kept for compatibility with older callers. The browser no longer
      // fetches live Gingr rows, so this normally stays empty.
      const today = new Date().toISOString().split("T")[0];
      let rawRes = supabaseRes;
      if (latest >= today && gingrLiveRows && gingrLiveRows.length > 0) {
        rawRes = mergeGingrLive(supabaseRes, gingrLiveRows);
      }

      // Compute current period
      const currentDayMap = computeAccrualByDay(rawRes, dateFrom, dateTo);
      const currentTotals = computeAccrualTotals(currentDayMap);
      const currentRows = Object.entries(currentDayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          metric_date: date,
          accrual_boarding_revenue: d.boardingRevenue,
          accrual_daycare_revenue: d.daycareRevenue,
          accrual_total_revenue: d.totalRevenue,
        }));

      setAccrualDailyRows(currentRows);
      setAccrualTotals(currentTotals);

      // Compute prior period
      if (prevFrom && prevTo) {
        const prevDayMap = computeAccrualByDay(rawRes, prevFrom, prevTo);
        const prTotals = computeAccrualTotals(prevDayMap);
        const prevRows = Object.entries(prevDayMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, d]) => ({
            metric_date: date,
            accrual_boarding_revenue: d.boardingRevenue,
            accrual_daycare_revenue: d.daycareRevenue,
            accrual_total_revenue: d.totalRevenue,
          }));
        setPrevAccrualDailyRows(prevRows);
        setPrevAccrualTotals(prTotals);
      } else {
        setPrevAccrualDailyRows([]);
        setPrevAccrualTotals({ boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0 });
      }
    } catch (err) {
      console.error("Accrual revenue computation error:", err);
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [locationId, dateFrom, dateTo, prevFrom, prevTo, gingrLiveRows]);

  useEffect(() => {
    fetchAccrual();
  }, [fetchAccrual]);

  return {
    accrualDailyRows, accrualTotals,
    prevAccrualDailyRows, prevAccrualTotals,
    loading,
    refresh: fetchAccrual,
  };
}

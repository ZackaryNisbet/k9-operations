// K9 Operations — Dashboard v6
// Server-side pre-computed metrics. Zero client-side 136K iteration.
// Timeframe changes = Supabase query returning ~1-365 pre-computed rows.
// 9×11 Grid, viewport-locked, world-class data density.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo, startTransition } from "react";
import {
  C, todayStr, addDays, fmtDate, fmtDateShort, countNights, LITE_DEF_PRICING,
} from "../../shared/theme";
import { I } from "../../shared/icons";
import { Tip } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useDashboardMetrics } from "../../hooks/useDashboardMetrics";
import { useAccrualRevenue } from "../../hooks/useAccrualRevenue";
import { useGingrLiveCache } from "../../hooks/useGingrLiveCache";
import { useCashBasisLive, buildCashChartRows } from "../../hooks/useCashBasisRevenue";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import { useWeatherData } from "../../hooks/useWeatherData";
import { useWeatherDisplaySettings } from "../../hooks/useWeatherDisplaySettings";
import { fetchCashBasisForDate } from "../../shared/cashBasisRevenue";
import { supabase } from "../../supabaseClient";
import { mergeGingrLive } from "../../shared/gingrLive";
import { useLazyCompute, useSectionVisibility } from "../../hooks/useLazyCompute";
import { computeOpsProgress, computeServiceMetrics, computeLifecycleMetrics } from "../../shared/metricsHelpers";
import { getRoomCleaningBreakdown, getWeeklyMaintenanceStats } from "../../shared/opsHelpers";
import { getInventoryWorkflow } from "./inventoryStatus";
import TodayEnrichmentCard from "../enrichments/TodayEnrichmentCard";
import { DASH_CSS, RANGES } from "./dashboard/constants";
import { fmt$k, fmtDateLabel } from "./dashboard/helpers";
import { AnimatedNumber } from "./dashboard/components/AnimatedNumber";
import { LinkIcon } from "./dashboard/components/LinkIcon";
import { TrendBadge } from "./dashboard/components/TrendBadge";
import { DateRangePicker } from "./dashboard/components/DateRangePicker";
import { AnimatedPillSelector } from "./dashboard/components/AnimatedPillSelector";
import { DashGrid } from "./dashboard/components/DashGrid";
import { ChartFill } from "./dashboard/components/ChartFill";
import { CanceledCell, MetricCell, ChecklistCell, ServiceCell, QuickLinkCell, InventoryCell } from "./dashboard/components/cells";
import { PlatformHealthStatusButton, PlatformHealthModal } from "./dashboard/components/platformHealth";
import { DashboardWeatherStrip, DashboardWeatherStatusButton, DashboardWeatherModal } from "./dashboard/components/weather";
import { AccrualReceiptModal, CashBasisReceiptModal } from "./dashboard/components/receiptModals";

/* ═══════════════════════════════════════════════════════════════════════════
   Sparkline — thin inline chart
   ═══════════════════════════════════════════════════════════════════════════ */
function Sparkline({ data, width = 200, height = 32, color = C.pri }) {
  if (!data || data.length === 0) return null;
  const values = data.map(d => d.value || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const w = width, h = height;
  const stepX = (w - pad * 2) / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => `${pad + i * stepX},${h - pad - ((v - min) / range) * (h - pad * 2)}`);
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${pad + (values.length - 1) * stepX},${h} L${pad},${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${color.replace("#","")})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WRAPPER — shows loading while metrics fetch (instant from Supabase)
   ═══════════════════════════════════════════════════════════════════════════ */

export default function DashboardPage(props) {
  const { data, locationId, bohStats, bohLastFetch } = props;

  // Show loader only if we have no data context at all
  if (!data) {
    return (
      <div style={{
        height: "calc(100vh - 64px)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#FAFAF9",
      }}>
        <K9LoadingAnimation size={64} message="Loading dashboard..." subMessage="Connecting to server" />
      </div>
    );
  }

  return <DashboardContent {...props} locationId={locationId} refreshOptions={props.refreshOptions} bohStats={bohStats} bohLastFetch={bohLastFetch} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT — reads from pre-computed dashboard_metrics_daily.
   No 136K iteration. No useMemo compute chains. Pure view layer.
   ═══════════════════════════════════════════════════════════════════════════ */

function DashboardContent({
  data, save, nav, profile, addGlobalToast, locationId, refreshOptions,
  bohStats, bohLastFetch, analyticsMode,
  showSnapshot, showRevenue, showFunnel, showLTV,
  showRevenueComposition, showRevenueByCategory, showDiscountAnalysis,
  showTopClients, showOps, showFunnelMetrics, showHeroKPIs,
}) {
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [animEpoch, setAnimEpoch] = useState(0);
  const [showPriorPeriod, setShowPriorPeriod] = useState(true);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptTriggerRef = useRef(null);
  const [showCashReceipt, setShowCashReceipt] = useState(false);
  const [cashReceiptData, setCashReceiptData] = useState(null);
  const [cashReceiptLoading, setCashReceiptLoading] = useState(false);
  const cashReceiptTriggerRef = useRef(null);
  const [platformHealth, setPlatformHealth] = useState(null);
  const [showPlatformHealthModal, setShowPlatformHealthModal] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const today = todayStr();
  const dashboardLocationId = locationId || profile?.location_id || "cherry-hill";
  const { showDashboardWeather } = useWeatherDisplaySettings(dashboardLocationId);
  const {
    getWeatherForDate: getDashboardWeatherForDate,
    loading: dashboardWeatherLoading,
    error: dashboardWeatherError,
    limitations: dashboardWeatherLimitations,
    refresh: refreshDashboardWeather,
  } = useWeatherData(dashboardLocationId, today, today, {
    enabled: showDashboardWeather && Boolean(dashboardLocationId),
  });
  const dashboardWeather = getDashboardWeatherForDate(today);
  const { events: enrichmentEvents, loading: enrichmentLoading } = useEnrichmentEvents(locationId || profile?.location_id || "demo", today);

  /* ─── Stable nav callbacks ─── */
  const navTo = useMemo(() => {
    if (!nav) return {};
    const pages = ["checkout-tv", "ops-bathing", "settings", "lifecycle", "funnel",
      "ops-opening", "ops-fe", "ops-be", "ops-rooms", "ops-closing",
      "ops-pamper", "ops-pp", "ops-svc", "eod", "photos", "cash-tips",
      "checkout-notes", "enrichments", "inventory", "test-health", "reports",
      "enterprise-ops", "occupancy-report"];
    const map = {};
    pages.forEach(p => { map[p] = () => nav(p); });
    return map;
  }, [nav]);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    const healthLocationId = locationId || profile?.location_id || "cherry-hill";

    const loadPlatformHealth = async () => {
      try {
        const { data: health, error } = await supabase.functions.invoke("ops-platform-health", {
          body: { location_id: healthLocationId, date: today },
        });
        if (error) throw error;
        if (!cancelled) setPlatformHealth(health || null);
      } catch (error) {
        const statusCode = typeof error?.context?.status === "number" ? error.context.status : null;
        let responsePayload = null;
        if (error?.context && typeof error.context.clone === "function") {
          try {
            responsePayload = await error.context.clone().json();
          } catch {
            responsePayload = null;
          }
        }
        const responseAlert = Array.isArray(responsePayload?.alerts) ? responsePayload.alerts[0] : null;
        const detail = responseAlert?.message || responsePayload?.error || responsePayload?.message || error?.message || "Platform health unavailable.";
        if (!cancelled) {
          setPlatformHealth({
            overall_status: "warning",
            generated_at: new Date().toISOString(),
            function_name: "ops-platform-health",
            alerts: [{
              severity: "warning",
              kind: "edge_function",
              label: "Platform Health",
              function_name: "ops-platform-health",
              affects: ["Platform health details", "Data freshness visibility"],
              last_failure_status_code: statusCode,
              message: `ops-platform-health returned ${statusCode ? `HTTP ${statusCode}` : "a non-2xx status"}: ${detail}`,
              action: "The dashboard cannot verify report freshness until this function succeeds.",
            }],
          });
        }
      }
    };

    loadPlatformHealth();
    intervalId = window.setInterval(loadPlatformHealth, 60000);
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [locationId, profile?.location_id, today]);

  // ─── Inventory snapshot status (reads from inventory_snapshots + inventory_counts) ──
  const [invStatus, setInvStatus] = useState({ status: "not_started", itemsCounted: 0, totalItems: 0, overdue: false, daysOverdue: 0, phase: "counting", needsOrder: 0, ordered: 0, skipped: 0, countingDoneDate: null, orderingDoneDate: null, daysUntilNext: null });
  const [invTick, setInvTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locId = profile?.location_id;
        if (!locId) return;
        const d = new Date(today + "T12:00:00");
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
        const monday = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
        const [catalogRes, snapRes] = await Promise.all([
          supabase.from("inventory_catalog").select("id, par_level").eq("location_id", locId).eq("is_active", true),
          supabase.from("inventory_snapshots").select("id, status").eq("location_id", locId).eq("week_start", monday).maybeSingle(),
        ]);
        if (cancelled) return;
        const catalogItems = catalogRes.data || [];
        const totalItems = catalogItems.length;
        const now = new Date();
        const dow = now.getDay();
        const isPastMonday = dow !== 1;
        const daysSinceMonday = dow === 0 ? 6 : dow - 1;
        if (snapRes.data?.id) {
          const [countsRes, adhocRes] = await Promise.all([
            supabase.from("inventory_counts")
              .select("stock_count, in_transit, ordered, skipped, catalog_item_id, counted_at, ordered_at, skipped_at, created_at")
              .eq("snapshot_id", snapRes.data.id),
            supabase.from("inventory_adhoc_items")
              .select("stock_count, ordered, skipped, created_at")
              .eq("snapshot_id", snapRes.data.id),
          ]);
          if (cancelled) return;
          const workflow = getInventoryWorkflow({
            snapshotStatus: snapRes.data.status,
            catalogItems,
            countRows: countsRes.data || [],
            adhocItems: adhocRes.data || [],
          });

          // Compute days until next Monday (next inventory cycle)
          const todayDow = now.getDay();
          const daysUntilNext = todayDow === 1 ? 7 : ((8 - todayDow) % 7);

          if (!cancelled) {
            setInvStatus({
              status: workflow.status,
              itemsCounted: workflow.itemsCounted,
              totalItems: workflow.totalItems,
              overdue: isPastMonday && workflow.status !== "completed",
              daysOverdue: daysSinceMonday,
              phase: workflow.phase,
              needsOrder: workflow.itemsNeedingOrder,
              ordered: workflow.itemsOrdered,
              skipped: workflow.itemsSkipped,
              countingDoneDate: workflow.countingDoneDate,
              orderingDoneDate: workflow.orderingDoneDate,
              daysUntilNext,
            });
          }
        } else {
          const todayDow2 = now.getDay();
          const daysUntilNext2 = todayDow2 === 1 ? 7 : ((8 - todayDow2) % 7);
          if (!cancelled) setInvStatus({ status: "not_started", itemsCounted: 0, totalItems, overdue: isPastMonday && totalItems > 0, daysOverdue: daysSinceMonday, phase: "counting", needsOrder: 0, ordered: 0, skipped: 0, countingDoneDate: null, orderingDoneDate: null, daysUntilNext: daysUntilNext2 });
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [today, profile?.location_id, invTick]);

  // Realtime: re-fetch inventory when counts, ad-hoc items, or snapshot status changes
  useEffect(() => {
    const locId = profile?.location_id;
    if (!locId) return;
    const chan = supabase.channel("dash-inv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_counts" },
        () => { setInvTick(t => t + 1); }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_adhoc_items" },
        () => { setInvTick(t => t + 1); }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_snapshots" },
        () => { setInvTick(t => t + 1); }
      )
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [profile?.location_id]);

  /* ─── Lazy-compute refs for below-fold sections ───────────────────── */
  const { ref: financialRef } = useSectionVisibility();

  useEffect(() => { setAnimEpoch(e => e + 1); }, [range]);

  const calRef = useRef(null);
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const handleRangeChange = (key) => {
    // Decouple animation from data loading: update range in a transition
    // so the pill slider animates immediately while data loads in background
    startTransition(() => {
      setRange(key);
    });
    if (key === "custom") setShowCalendar(true);
    else setShowCalendar(false);
  };

  /* ─── Date range computation ──────────────────────────────────────── */
  const { dateFrom, dateTo, days, prevFrom, prevTo } = useMemo(() => {
    const now = new Date();
    const end = today;
    let start;
    switch (range) {
      case "today": start = today; break;
      case "wtd": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); start = d.toISOString().split("T")[0]; break; }
      case "past-week": start = addDays(today, -6); break;
      case "mtd": start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; break;
      case "past-30": start = addDays(today, -30); break;
      case "qtd": { const qm = Math.floor(now.getMonth() / 3) * 3; start = `${now.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`; break; }
      case "ytd": start = `${now.getFullYear()}-01-01`; break;
      case "lifetime": start = "2020-01-01"; break;
      case "custom": start = customFrom || today; break;
      default: start = addDays(today, -30);
    }
    const to = range === "custom" && customTo ? customTo : end;
    const d1 = new Date(start + "T00:00:00");
    const d2 = new Date(to + "T00:00:00");
    const dayCount = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    const pTo = addDays(start, -1);
    const pFrom = addDays(pTo, -(dayCount - 1));
    return { dateFrom: start, dateTo: to, days: dayCount, prevFrom: pFrom, prevTo: pTo };
  }, [range, today, customFrom, customTo]);

  /* ─── SERVER-SIDE METRICS (the magic — no client-side iteration) ─── */
  const { metrics, prevMetrics, dailyRows, prevDailyRows, loading: metricsLoading, lastUpdated, lastFetchedAt, refresh } = useDashboardMetrics(
    locationId, dateFrom, dateTo, prevFrom, prevTo, refreshOptions
  );

  const m = metrics || {};
  const pm = prevMetrics || {};
  const showSkeleton = !metrics && metricsLoading;

  /* ─── Gingr LIVE CACHE — background 60s poll, shared by accrual + receipt ─── */
  const { liveRows: gingrLiveRows } = useGingrLiveCache(locationId);

  /* ─── CASH BASIS LIVE — 60s poll for today's cash revenue from Gingr API ─── */
  const { todayCashData } = useCashBasisLive(locationId);

  /* ─── ACCRUAL REVENUE — computed client-side from raw reservations ─── */
  // Uses the same methodology as the receipt modal:
  //   Boarding: sibling grouping + room rate fallback
  //   Daycare: base rates ($45/$30) + enrichment costs
  // This replaces reading accrual values from dashboard_metrics_daily.
  const {
    accrualDailyRows, accrualTotals,
    prevAccrualDailyRows, prevAccrualTotals,
  } = useAccrualRevenue(locationId, dateFrom, dateTo, prevFrom, prevTo, gingrLiveRows);

  /* ─── Lifecycle metrics — still from client data (these need client state) ─── */
  // Lifecycle/funnel metrics require client lifecycle state which isn't in the daily table.
  // These are lightweight — only counting client records, not iterating 136K reservations.
  const emptyFunnel = { remainingLeads: 0, remainingAtRisk: 0, todayOutreaches: 0, todayConversions: 0, firstTimePayers: 0, todayNewLeads: 0, conversionRate: 0, avgLTV: 0, totalLTV: 0, spendingClientsCount: 0 };

  // Capture the first non-null reservations snapshot for lifecycle metrics.
  // This uses Phase 2a's quick-fetched window (~500 rows) and does NOT update
  // when Phase 2b's full 136K arrives, avoiding a 2+ second recompute freeze.
  // The quick window contains all recent reservations needed for firstTimePayers.
  const stableReservationsRef = useRef(null);
  if (data?.reservations && !stableReservationsRef.current) {
    stableReservationsRef.current = data.reservations;
  }
  const stableReservations = stableReservationsRef.current || [];

  const funnelMetrics = useMemo(() => {
    if (!data?.clients) return emptyFunnel;
    const dataForFunnel = { ...data, reservations: stableReservations };
    return computeLifecycleMetrics(dataForFunnel, dateFrom, dateTo, today);
  }, [data?.clients, data?.serverStats, stableReservations, data?.resortPolicies, dateFrom, dateTo, today]);

  const prevFunnelMetrics = useMemo(() => {
    if (!data?.clients) return emptyFunnel;
    const yesterday = addDays(today, -1);
    const dataForFunnel = { ...data, reservations: stableReservations };
    return computeLifecycleMetrics(dataForFunnel, prevFrom, prevTo, yesterday);
  }, [data?.clients, data?.serverStats, stableReservations, data?.resortPolicies, prevFrom, prevTo, today]);

  /* ─── Ops progress (lazy — deferred until checklist section is visible) ── */
  // Use stableReservations (Phase 2a window) for ops metrics too — avoids re-render
  // when Phase 2b’s 136K rows arrive. Service counts only need today’s reservations.
  const dataProxy = useMemo(() => ({
    reservations: stableReservations,
    clients: data?.clients,
    serverStats: data?.serverStats,
    resortPolicies: data?.resortPolicies,
    rooms: data?.rooms,
    dogs: data?.dogs,
    dailyOps: data?.dailyOps,
  }), [stableReservations, data?.clients, data?.serverStats, data?.resortPolicies, data?.rooms, data?.dogs, data?.dailyOps]);

  const { ref: opsVisRef, value: lazyOpsProgress, isVisible: opsVisible } = useLazyCompute(
    () => computeOpsProgress(dataProxy, today),
    [dataProxy, today]
  );
  const opsProgress = lazyOpsProgress || [];

  const getChecklistProgress = (id) => {
    const op = opsProgress.find(o => o.id === id);
    return op ? op.progress : 0;
  };
  const getChecklistCount = (id) => {
    const op = opsProgress.find(o => o.id === id);
    return op ? op.countLabel : "";
  };

  /* ─── Service data (today only — matches OperationsHub Services section) ─── */
  // Bath data is now fully server-side from lite_daily_ops (computed by ops-compute edge function)
  // No client-side polling needed — loads instantly with the rest of dailyOps
  const bathingFromOps = useMemo(() => {
    const ops = data?.dailyOps || [];
    const bathingEntry = ops.find(e => e.id === `ops_bathing_${today}`);
    const ci = bathingEntry?.computed_items;
    if (ci) {
      return { bathsTotal: ci.totalCount || ci.dogs?.length || 0, bathsDone: ci.completedCount || 0 };
    }
    return null;
  }, [data?.dailyOps, today]);

  const svcData = useMemo(() => {
    if (!stableReservations || stableReservations.length === 0) return { bathsTotal: 0, bathsDone: 0, ppTotal: 0, ppCompleted: 0, pamperTotal: 0, pamperDone: 0, iceCreamTotal: 0, iceCreamDone: 0 };
    const sm = computeServiceMetrics(dataProxy, today);
    return {
      bathsTotal: bathingFromOps?.bathsTotal ?? sm.bathsTotal,
      bathsDone: bathingFromOps?.bathsDone ?? 0,
      ppTotal: sm.ppTotal, ppCompleted: sm.ppCompleted,
      pamperTotal: sm.pamperTotal, pamperDone: sm.pamperDone,
      iceCreamTotal: sm.iceCreamTotal, iceCreamDone: sm.iceCreamDone,
    };
  }, [dataProxy, today, bathingFromOps]);

  /* ─── Room cleaning breakdown (set-ups, disinfects, refreshes) ─── */
  const roomBreakdown = useMemo(() => {
    if (!data?.dailyOps) return { totalSetups: 0, doneSetups: 0, totalDisinfects: 0, doneDisinfects: 0, totalRefreshes: 0, doneRefreshes: 0 };
    return getRoomCleaningBreakdown(dataProxy, today);
  }, [dataProxy, today]);

  /* ─── Weekly maintenance stats ─── */
  const wmStats = useMemo(() => {
    if (!data?.dailyOps) return { total: 0, checked: 0 };
    return getWeeklyMaintenanceStats(dataProxy, today);
  }, [dataProxy, today]);

  /* ─── Chart data from pre-computed daily rows ─── */
  const bucketMode = useMemo(() => {
    if (range === "ytd" || range === "lifetime" || days > 180) return "monthly";
    if (range === "qtd" || days > 60) return "weekly";
    return "daily";
  }, [range, days]);

  const bucketRows = useCallback((rows, valueField) => {
    if (!rows || rows.length === 0) return [];
    if (bucketMode === "daily") {
      return rows.map(r => ({
        date: r.metric_date,
        label: fmtDateLabel(r.metric_date),
        value: Number(r[valueField]) || 0,
        prevValue: 0,
      }));
    }
    if (bucketMode === "monthly") {
      const buckets = {};
      rows.forEach(r => {
        const key = r.metric_date.slice(0, 7);
        if (!buckets[key]) buckets[key] = { date: key, label: new Date(r.metric_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" }), value: 0, prevValue: 0 };
        buckets[key].value += Number(r[valueField]) || 0;
      });
      return Object.values(buckets);
    }
    // weekly
    const buckets = {};
    rows.forEach(r => {
      const dt = new Date(r.metric_date + "T00:00:00");
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - dt.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!buckets[key]) buckets[key] = { date: key, label: fmtDateLabel(key), value: 0, prevValue: 0 };
      buckets[key].value += Number(r[valueField]) || 0;
    });
    return Object.values(buckets);
  }, [bucketMode]);

  // Overlay today's live-fetched cash basis revenue on server metrics
  const correctedDailyRows = useMemo(() => buildCashChartRows(dailyRows, todayCashData), [dailyRows, todayCashData]);
  const cashChartDataBase = useMemo(() => bucketRows(correctedDailyRows, "cash_net_revenue"), [correctedDailyRows, bucketRows]);
  // Accrual chart: uses receipt-methodology engine (accrualDailyRows from useAccrualRevenue)
  const accrualChartDataBase = useMemo(() => bucketRows(accrualDailyRows, "accrual_total_revenue"), [accrualDailyRows, bucketRows]);

  /* ─── L1: Today view — fetch trailing week for chart context ─── */
  const trailingWeekFrom = useMemo(() => addDays(today, -6), [today]);
  const trailingWeekPriorTo = useMemo(() => addDays(today, -7), [today]);
  const trailingWeekPriorFrom = useMemo(() => addDays(today, -13), [today]);
  const { dailyRows: trailingWeekRows, prevDailyRows: trailingWeekPrevRows } = useDashboardMetrics(
    range === "today" ? locationId : null, // only fetch when "today" is selected
    trailingWeekFrom, today, trailingWeekPriorFrom, trailingWeekPriorTo, refreshOptions
  );
  // Also fetch trailing-week accrual from the receipt engine for today view
  const {
    accrualDailyRows: trailingWeekAccrualRows,
    prevAccrualDailyRows: trailingWeekPrevAccrualRows,
  } = useAccrualRevenue(
    range === "today" ? locationId : null,
    trailingWeekFrom, today, trailingWeekPriorFrom, trailingWeekPriorTo, gingrLiveRows
  );

  // L1: When range is "today", show past week as chart with today as highlighted final point
  const isToday = range === "today";

  // ─── Live Snapshot: 10-second polling for real-time snapshot counts ───
  // Respects business hours setting — pauses outside configured window
  const [liveSnap, setLiveSnap] = useState(null);
  const bizHoursCheck = refreshOptions?.isWithinBusinessHours;
  useEffect(() => {
    if (!isToday || !locationId) { setLiveSnap(null); return; }
    let cancelled = false;
    const poll = async () => {
      // Skip poll if outside business hours
      if (bizHoursCheck && !bizHoursCheck()) { setLiveSnap(null); return; }
      try {
        const { data } = await supabase.rpc("snapshot_live", { p_location_id: locationId });
        if (!cancelled && data) setLiveSnap(data);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isToday, locationId, bizHoursCheck]);
  const displayLiveSnap = useMemo(() => {
    if (!bohStats?.canonicalPresence) return liveSnap;
    return {
      ...(liveSnap || {}),
      expected: bohStats.pendingCount,
      in_house: bohStats.total,
      boarding: bohStats.boardingCount,
      daycare: bohStats.daycareCount,
      going_home: bohStats.goingHomeCount,
      occupancy_pct: bohStats.occupancyPct,
      canonical_presence: true,
    };
  }, [bohStats, liveSnap]);
  // Overlay today's live cash data on trailing week rows too
  const correctedTrailingWeekRows = useMemo(() => buildCashChartRows(trailingWeekRows, todayCashData), [trailingWeekRows, todayCashData]);
  const cashChartData = useMemo(() => {
    if (!isToday) return cashChartDataBase;
    if (!correctedTrailingWeekRows || correctedTrailingWeekRows.length === 0) return cashChartDataBase;
    return correctedTrailingWeekRows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.cash_net_revenue) || 0,
      prevValue: 0,
    }));
  }, [isToday, cashChartDataBase, correctedTrailingWeekRows]);

  const accrualChartData = useMemo(() => {
    if (!isToday) return accrualChartDataBase;
    if (!trailingWeekAccrualRows || trailingWeekAccrualRows.length === 0) return accrualChartDataBase;
    return trailingWeekAccrualRows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.accrual_total_revenue) || 0,
      prevValue: 0,
    }));
  }, [isToday, accrualChartDataBase, trailingWeekAccrualRows]);

  /* ─── L4: Prior period chart data ─── */
  const cashPriorChartData = useMemo(() => {
    // When isToday, use trailing week's prior period (days -13 to -7)
    const rows = isToday ? trailingWeekPrevRows : prevDailyRows;
    if (!rows || rows.length === 0) return [];
    return rows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.cash_net_revenue) || 0,
    }));
  }, [isToday, trailingWeekPrevRows, prevDailyRows]);

  // Accrual prior period from receipt engine
  const accrualPriorChartData = useMemo(() => {
    // When isToday, use trailing week's prior accrual (days -13 to -7)
    const rows = isToday ? trailingWeekPrevAccrualRows : prevAccrualDailyRows;
    if (!rows || rows.length === 0) return [];
    return rows.map(r => ({
      date: r.metric_date,
      label: fmtDateLabel(r.metric_date),
      value: Number(r.accrual_total_revenue) || 0,
    }));
  }, [isToday, trailingWeekPrevAccrualRows, prevAccrualDailyRows]);

  /* ─── Trend helper ─── */
  const pctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  /* ─── "Updated X ago" — ticks every 15s so it stays accurate ─── */
  const [tickNow, setTickNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const updatedAgo = useMemo(() => {
    // Prefer lastFetchedAt (when we last read from Supabase), fall back to lastUpdated (when edge fn last computed)
    const ts = lastFetchedAt || lastUpdated;
    if (!ts) return "";
    const diff = Math.round((tickNow - new Date(ts).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.round(diff / 60)}h ago`;
  }, [lastFetchedAt, lastUpdated, tickNow]);

  const bohLiveLabel = useMemo(() => {
    if (!bohLastFetch) return null;
    const diff = Math.round((tickNow - new Date(bohLastFetch).getTime()) / 1000);
    if (diff < 30) return "Live";
    if (diff < 120) return `${diff}s ago`;
    return null;
  }, [bohLastFetch, tickNow]);

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */
  const bookingsTrend = pctChange(m.cashTransactionCount, pm.cashTransactionCount);

  // Snapshot section label — adapts to selected date range
  const snapshotLabel = range === "today" ? "Today's Snapshot" :
    range === "wtd" ? "WTD Snapshot" :
    range === "past-week" ? "Past Week Snapshot" :
    range === "mtd" ? "MTD Snapshot" :
    range === "past-30" ? "Past 30 Days Snapshot" :
    range === "qtd" ? "QTD Snapshot" :
    range === "ytd" ? "YTD Snapshot" :
    range === "lifetime" ? "Lifetime Snapshot" :
    range === "custom" ? "Custom Range Snapshot" :
    "Today's Snapshot";

  // Cash basis: for "Today" show today's live value; for multi-day ranges sum the period
  const cashTotalDisplay = useMemo(() => {
    if (isToday) {
      return todayCashData ? todayCashData.netRevenue : 0;
    }
    return correctedDailyRows.reduce((s, r) => s + (Number(r.cash_net_revenue) || 0), 0);
  }, [isToday, todayCashData, correctedDailyRows]);

  // Revenue values from server metrics
  // Accrual revenue from the receipt-methodology engine (not from dashboard_metrics_daily)
  const revenue = accrualTotals.totalRevenue || 0;
  const prevRevenue = prevAccrualTotals.totalRevenue || 0;
  const revenueTrend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const boardingPct = revenue > 0 ? (accrualTotals.boardingRevenue / revenue) * 100 : 0;
  const daycarePct = revenue > 0 ? (accrualTotals.daycareRevenue / revenue) * 100 : 0;
  // RevPAR from accrual engine boarding revenue (matches receipt methodology)
  const totalRooms = m.totalRoomCount || 0;
  const accrualRevPAR = totalRooms > 0 && days > 0 ? accrualTotals.boardingRevenue / (totalRooms * days) : 0;
  const prevAccrualRevPAR = totalRooms > 0 && days > 0 ? prevAccrualTotals.boardingRevenue / (totalRooms * days) : 0;

  /* ─── Receipt data: fetched directly from Supabase on demand ─── */
  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const fetchReceiptData = useCallback(async () => {
    setReceiptLoading(true);
    try {
      // Fetch reservations that overlap the selected date range
      // Use OR for end_date to include daycare/day boarding where end_date may be NULL
      const { data: supabaseRes, error } = await supabase
        .from("gingr_reservations")
        .select("gingr_id,animal_name,owner_first_name,owner_last_name,reservation_type_name,start_date,end_date,deposit,transaction,cancelled_date,services")
        .eq("location_id", locationId)
        .lte("start_date", dateTo + "T23:59:59")
        .or(`end_date.gte.${dateFrom}T00:00:00,end_date.is.null`)
        .is("cancelled_date", null);

      if (error) { console.error("Receipt fetch error:", error); setReceiptLoading(false); return; }

      // Compatibility hook for older live rows. Browser Gingr reads are disabled;
      // same-day freshness comes from the server sync pipeline.
      const todayD = new Date().toISOString().split("T")[0];
      let rawRes = supabaseRes;
      if (dateTo >= todayD && gingrLiveRows && gingrLiveRows.length > 0) {
        rawRes = mergeGingrLive(supabaseRes, gingrLiveRows);
      }

      const boarding = [];
      let boardingTotal = 0;

      // Daycare aggregation (separate from day boarding)
      const dcRates = LITE_DEF_PRICING.daycareRates;
      let fullDayCount = 0;
      let halfDayCount = 0;
      let evalCount = 0;
      let dayBoardCount = 0;
      const dcEnrichMap = {};       // daycare enrichments: name → { count, totalCost }
      const dbEnrichMap = {};       // day boarding enrichments: name → { count, totalCost }
      let daycareBaseTotal = 0;
      let dayBoardBaseTotal = 0;

      (rawRes || []).forEach(r => {
        const typeName = (r.reservation_type_name || "").toLowerCase();
        const isBoarding = typeName.includes("boarding") && !typeName.includes("day boarding");
        const isDayBoarding = typeName.includes("day boarding");
        const isDaycare = !isDayBoarding && (typeName.includes("daycare") || typeName.includes("day care"));
        const dep = r.deposit && !Array.isArray(r.deposit) ? r.deposit : {};
        const txn = r.transaction && !Array.isArray(r.transaction) ? r.transaction : {};
        const total = Number(txn.price) || Number(dep.amount) || 0;

        const startD = r.start_date ? r.start_date.split("T")[0] : dateFrom;
        const endD = r.end_date ? r.end_date.split("T")[0] : startD;
        const ownerName = [r.owner_first_name, r.owner_last_name].filter(Boolean).join(" ");
        // Extract room type from reservation_type_name (e.g. "Boarding | Executive Room (All Inclusive)" → "Executive Room")
        const roomMatch = (r.reservation_type_name || "").match(/\|\s*([^(]+)/);
        const roomType = roomMatch ? roomMatch[1].trim() : "Room";

        if (isBoarding && startD && endD) {
          const nights = countNights(startD, endD);
          if (nights <= 0) return;
          // Count how many nights fall within selected date range
          let accrualNights = 0;
          let night = startD;
          while (night < endD) {
            if (night >= dateFrom && night <= dateTo) accrualNights++;
            night = addDays(night, 1);
          }
          if (accrualNights <= 0) return;
          const lastInit = r.owner_last_name ? r.owner_last_name.charAt(0).toUpperCase() + "." : "";
          // Temporarily push with raw total — perNight adjusted after sibling grouping
          boarding.push({
            id: r.gingr_id, dogName: r.animal_name || "Unknown", lastInit, ownerName,
            roomType, nights: accrualNights, totalNights: nights,
            totalCost: total, checkIn: startD, checkOut: endD,
            _resKey: `${ownerName}|${startD}|${endD}|${total}`,
          });
        } else if (isDayBoarding && startD >= dateFrom && startD <= dateTo) {
          dayBoardCount++;
          dayBoardBaseTotal += dcRates.fullDay;
          // Aggregate day boarding services / enrichments separately
          const svcs = Array.isArray(r.services) ? r.services : [];
          svcs.forEach(s => {
            const sName = (s.name || "Service").trim();
            const sCost = Number(s.cost) || 0;
            if (!dbEnrichMap[sName]) dbEnrichMap[sName] = { count: 0, totalCost: 0, unitCost: sCost };
            dbEnrichMap[sName].count++;
            dbEnrichMap[sName].totalCost += sCost;
          });
        } else if (isDaycare && startD >= dateFrom && startD <= dateTo) {
          // Classify daycare type & apply base rate
          let baseRate = dcRates.fullDay;
          if (typeName.includes("half")) {
            halfDayCount++;
            baseRate = dcRates.halfDay;
          } else if (typeName.includes("evaluation")) {
            evalCount++;
            baseRate = dcRates.fullDay; // evals charged at full-day rate
          } else {
            fullDayCount++;
          }
          daycareBaseTotal += baseRate;

          // Aggregate daycare services / enrichments separately
          const svcs = Array.isArray(r.services) ? r.services : [];
          svcs.forEach(s => {
            const sName = (s.name || "Service").trim();
            const sCost = Number(s.cost) || 0;
            if (!dcEnrichMap[sName]) dcEnrichMap[sName] = { count: 0, totalCost: 0, unitCost: sCost };
            dcEnrichMap[sName].count++;
            dcEnrichMap[sName].totalCost += sCost;
          });
        }
      });

      // Sibling grouping: match $0 dogs to their sibling's reservation cost
      // Group by owner + check-in + check-out to find siblings
      const siblingGroups = {};
      boarding.forEach(b => {
        const gKey = `${b.ownerName}|${b.checkIn}|${b.checkOut}`;
        if (!siblingGroups[gKey]) siblingGroups[gKey] = [];
        siblingGroups[gKey].push(b);
      });
      // For each group, find the reservation total and split across all dogs
      const br = LITE_DEF_PRICING.boardingRates;
      Object.values(siblingGroups).forEach(group => {
        let resTotalFromGroup = Math.max(...group.map(b => b.totalCost));
        const dogCount = group.length;
        // Fallback: if no transaction/deposit pricing, estimate from room rate
        if (resTotalFromGroup <= 0) {
          const sampleNights = group[0].totalNights;
          const roomRate = br[group[0].roomType] || 75; // default to Executive if unknown
          resTotalFromGroup = roomRate * sampleNights * dogCount;
        }
        group.forEach(b => {
          b.resTotalDisplay = resTotalFromGroup;
          b.dogsInRes = dogCount;
          b.perNight = resTotalFromGroup > 0 ? resTotalFromGroup / b.totalNights / dogCount : 0;
          b.accrualAmount = b.perNight * b.nights;
          boardingTotal += b.accrualAmount;
        });
      });

      // Build daycare enrichment list sorted by total cost descending
      const dcEnrichments = Object.entries(dcEnrichMap)
        .map(([name, v]) => ({ name, count: v.count, totalCost: v.totalCost, unitCost: v.unitCost }))
        .sort((a, b) => b.totalCost - a.totalCost);
      const dcEnrichTotal = dcEnrichments.reduce((s, e) => s + e.totalCost, 0);

      // Build day boarding enrichment list sorted by total cost descending
      const dbEnrichments = Object.entries(dbEnrichMap)
        .map(([name, v]) => ({ name, count: v.count, totalCost: v.totalCost, unitCost: v.unitCost }))
        .sort((a, b) => b.totalCost - a.totalCost);
      const dbEnrichTotal = dbEnrichments.reduce((s, e) => s + e.totalCost, 0);

      const daycareTotal = daycareBaseTotal + dcEnrichTotal;
      const dayBoardTotal = dayBoardBaseTotal + dbEnrichTotal;
      const totalDaycareDogs = fullDayCount + halfDayCount + evalCount;

      const daycareAgg = {
        fullDayCount, halfDayCount, evalCount,
        fullDayRate: dcRates.fullDay, halfDayRate: dcRates.halfDay,
        baseTotal: daycareBaseTotal, enrichments: dcEnrichments, enrichTotal: dcEnrichTotal,
        total: daycareTotal, dogCount: totalDaycareDogs,
      };

      const dayBoardAgg = {
        count: dayBoardCount, rate: dcRates.fullDay,
        baseTotal: dayBoardBaseTotal, enrichments: dbEnrichments, enrichTotal: dbEnrichTotal,
        total: dayBoardTotal,
      };

      const allDaycareTotal = daycareTotal + dayBoardTotal;

      // Boarding: priced first (desc), then $0 entries alphabetical
      boarding.sort((a, b) => b.accrualAmount - a.accrualAmount || a.dogName.localeCompare(b.dogName));
      setReceiptData({ boarding, daycareAgg, dayBoardAgg, boardingTotal, daycareTotal: allDaycareTotal, grandTotal: boardingTotal + allDaycareTotal });
    } catch (err) {
      console.error("Receipt fetch error:", err);
    } finally {
      setReceiptLoading(false);
    }
  }, [locationId, dateFrom, dateTo, gingrLiveRows]);

  // Fetch receipt data when modal opens
  useEffect(() => {
    if (showReceipt) fetchReceiptData();
  }, [showReceipt, fetchReceiptData]);

  // Cash receipt: fetch on-demand when cash modal opens
  const fetchCashReceiptData = useCallback(async () => {
    setCashReceiptLoading(true);
    try {
      // For "today" view, use the already-polled data if available
      if (isToday && todayCashData) {
        setCashReceiptData(todayCashData);
        setCashReceiptLoading(false);
        return;
      }
      // For single-day views, fetch from Gingr API
      if (dateFrom === dateTo) {
        const data = await fetchCashBasisForDate(locationId, dateFrom);
        setCashReceiptData(data);
      } else {
        // For multi-day ranges, fetch the last day (most recent) as receipt detail
        const data = await fetchCashBasisForDate(locationId, dateTo);
        setCashReceiptData(data);
      }
    } catch (err) {
      console.error("Cash receipt fetch error:", err);
    } finally {
      setCashReceiptLoading(false);
    }
  }, [locationId, dateFrom, dateTo, isToday, todayCashData]);

  useEffect(() => {
    if (showCashReceipt) fetchCashReceiptData();
  }, [showCashReceipt, fetchCashReceiptData]);

  const receiptDateLabel = dateFrom === dateTo
    ? fmtDateLabel(dateFrom)
    : `${fmtDateLabel(dateFrom)} \u2013 ${fmtDateLabel(dateTo)}`;

  return (
    <div style={{
      height: "100%", minHeight: 0, overflow: "hidden",
      display: "flex", flexDirection: "column",
      fontFamily: "inherit", padding: "0",
      background: "#FAFAF9",
    }}>
      <style>{DASH_CSS}</style>
      {showPlatformHealthModal && (
        <PlatformHealthModal
          platformHealth={platformHealth}
          onClose={() => setShowPlatformHealthModal(false)}
        />
      )}
      {showDashboardWeather && showWeatherModal && (
        <DashboardWeatherModal
          weather={dashboardWeather}
          loading={dashboardWeatherLoading}
          error={dashboardWeatherError}
          limitations={dashboardWeatherLimitations}
          onClose={() => setShowWeatherModal(false)}
          onRefresh={refreshDashboardWeather}
        />
      )}

      {/* ═══ HEADER BAR ═══ */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px 6px", flexShrink: 0,
      }}>
        {/* Left: Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/k9_mark.svg" alt="K9 Operations" style={{ height: 28, width: "auto", opacity: 0.85 }} />
          <h1 style={{ fontSize: 16, fontWeight: 800, color: C.pri, margin: 0, lineHeight: 1 }}>
            Dashboard
          </h1>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: metricsLoading ? C.warn : C.suc, animation: metricsLoading ? "dashPulse 1s infinite" : "dashPulse 2s infinite" }} />
          <span style={{ fontSize: 9, color: C.textMut, fontWeight: 500 }}>
            {dateFrom === dateTo ? fmtDateLabel(dateFrom) : `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)} · ${days}d`}
          </span>
          {updatedAgo && (
            <span style={{ fontSize: 8, color: C.textMut, fontWeight: 500, opacity: 0.7 }}>
              Synced {updatedAgo}
            </span>
          )}
          {bohLiveLabel && range === "today" && (
            <span style={{ fontSize: 8, fontWeight: 700, color: C.suc, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.suc, animation: "dashPulse 1.5s infinite" }} />
              {bohLiveLabel}
            </span>
          )}
          {platformHealth && (
            <PlatformHealthStatusButton
              platformHealth={platformHealth}
              onClick={() => setShowPlatformHealthModal(true)}
            />
          )}
          {showDashboardWeather ? (
            <DashboardWeatherStatusButton
              weather={dashboardWeather}
              loading={dashboardWeatherLoading}
              error={dashboardWeatherError}
              onClick={() => setShowWeatherModal(true)}
            />
          ) : null}
          <button
            onClick={refresh}
            disabled={metricsLoading}
            style={{
              padding: "2px 6px", borderRadius: 4,
              border: `1px solid rgba(20,83,45,0.12)`,
              background: "rgba(255,255,255,0.8)",
              color: C.textMut, fontSize: 8, fontWeight: 600,
              cursor: metricsLoading ? "default" : "pointer",
              fontFamily: "inherit", opacity: metricsLoading ? 0.5 : 1,
              transition: "all 0.12s",
            }}
            title="Refresh data from Gingr"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Right: Timeframe pills + prior period toggle (analytics mode only) */}
        {analyticsMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }} ref={calRef}>
            <AnimatedPillSelector ranges={RANGES} activeKey={range} onChange={handleRangeChange} />

            <button
              onClick={() => setShowPriorPeriod(!showPriorPeriod)}
              style={{
                padding: "3px 8px", borderRadius: 4,
                border: `1px solid ${showPriorPeriod ? C.acc : "rgba(20,83,45,0.1)"}`,
                background: showPriorPeriod ? C.accLt : "rgba(255,255,255,0.7)",
                color: showPriorPeriod ? C.accDk : C.textMut,
                fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.12s", whiteSpace: "nowrap",
              }}
            >
              vs Prior
            </button>

            {showCalendar && range === "custom" && (
              <DateRangePicker customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
            )}
          </div>
        )}
      </div>

      {showDashboardWeather ? (
        <DashboardWeatherStrip
          weather={dashboardWeather}
          loading={dashboardWeatherLoading}
          error={dashboardWeatherError}
          limitations={dashboardWeatherLimitations}
          targetDate={today}
          onOpen={() => setShowWeatherModal(true)}
        />
      ) : null}

      {/* ═══ MAIN CONTENT ═══ */}
      {analyticsMode ? (
      <DashGrid analyticsMode={analyticsMode}>
            {/* ═══════════════════════════════════════════════════════════════════
               ANALYTICS MODE — 9-col original dense layout
               ═══════════════════════════════════════════════════════════════════ */}
            {/* Snapshot label + sidebar headers */}
            <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">{snapshotLabel}</span>
            </div>
            <div ref={opsVisRef} style={{ gridColumn: "8", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
              <span className="dash-section-label">Checklists</span>
            </div>
            <div style={{ gridColumn: "9", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
              <span className="dash-section-label">Services</span>
            </div>

            {/* Row 1: Snapshot (7 metrics) + Opening checklist + Baths service */}
            <MetricCell label="Expected" value={displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected} hero onClick={navTo["checkout-tv"]} sub={null} trend={showPriorPeriod ? pctChange(displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected, pm.dogsExpected) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            <MetricCell label="In House" value={displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse} hero sub={displayLiveSnap ? `${displayLiveSnap.boarding}B · ${displayLiveSnap.daycare}D` : `${m.boardingInHouse}B · ${m.daycareInHouse}D`} onClick={navTo["checkout-tv"]} trend={showPriorPeriod ? pctChange(displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse, pm.dogsInHouse) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            {days > 1
              ? <CanceledCell key={animEpoch} value={Math.max(0, (m.dogsExpected || 0) - (m.dogsInHouse || 0))} onClick={navTo["ops-bathing"]} animKey={animEpoch} />
              : <MetricCell label="Going Home" value={displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome} hero onClick={navTo["ops-bathing"]} trend={showPriorPeriod ? pctChange(displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome, pm.dogsGoingHome) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            }
            <MetricCell label="Occupancy" value={`${days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0))}%`} hero onClick={navTo["occupancy-report"]} trend={showPriorPeriod ? pctChange(days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0)), days > 1 ? Math.round(pm.occupancyRate || 0) : (pm.occupancyPct || 0)) : null} skeleton={showSkeleton} live={!!displayLiveSnap} />
            <MetricCell label="New Bookings" value={displayLiveSnap?.new_bookings ?? m.bookingsToday} hero skeleton={showSkeleton} />
            <MetricCell label="Tours" value={displayLiveSnap?.tours ?? m.toursToday} hero onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(displayLiveSnap?.tours ?? m.toursToday, pm.toursToday) : null} skeleton={showSkeleton} />
            <MetricCell label="Evals" value={displayLiveSnap?.evals ?? m.evalsToday} hero onClick={navTo["lifecycle"]} skeleton={showSkeleton} />
            <ChecklistCell label="Opening" progress={getChecklistProgress("ops-opening")} count={getChecklistCount("ops-opening")} onClick={navTo["ops-opening"]} />
            <ServiceCell label="Baths" done={svcData.bathsDone} total={svcData.bathsTotal} onClick={navTo["ops-bathing"]} />

            {/* Customer Lifecycle label */}
            <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">Customer Lifecycle</span>
            </div>
            <div style={{ gridColumn: "8 / 10" }} />

            {/* Row 2: Lifecycle (7 metrics) + Front-End checklist + Pamper service */}
            <MetricCell label="Remaining Leads" value={funnelMetrics.remainingLeads} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.remainingLeads, prevFunnelMetrics.remainingLeads) : null} />
            <MetricCell label="Lapsed" value={funnelMetrics.remainingAtRisk} onClick={navTo["lifecycle"]} />
            <MetricCell label="Outreaches" value={funnelMetrics.todayOutreaches} onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayOutreaches, prevFunnelMetrics.todayOutreaches) : null} />
            <MetricCell label="Converted" value={funnelMetrics.todayConversions} color={funnelMetrics.todayConversions > 0 ? C.suc : undefined} onClick={navTo["lifecycle"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayConversions, prevFunnelMetrics.todayConversions) : null} />
            <MetricCell label="First-Time Spenders" value={funnelMetrics.firstTimePayers} onClick={navTo["lifecycle"]} />
            <MetricCell label="Conversion Rate" value={`${funnelMetrics.conversionRate.toFixed(1)}%`} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.conversionRate, prevFunnelMetrics.conversionRate) : null} />
            <MetricCell label="New Leads" value={funnelMetrics.todayNewLeads} onClick={navTo["funnel"]} trend={showPriorPeriod ? pctChange(funnelMetrics.todayNewLeads, prevFunnelMetrics.todayNewLeads) : null} />
            <ChecklistCell label="Front-End" progress={getChecklistProgress("ops-fe")} count={getChecklistCount("ops-fe")} onClick={navTo["ops-fe"]} />
            <ServiceCell label="Pamper" done={svcData.pamperDone} total={svcData.pamperTotal} onClick={navTo["ops-pamper"]} />

            {/* Daily Tasks label */}
            <div style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">Daily Tasks</span>
            </div>
            <div style={{ gridColumn: "8 / 10" }} />

            {/* Row 3: Daily Tasks (5 quick links + LTV + Clients) + Back-End + Ice Cream */}
            <QuickLinkCell label="EOD Report" icon={<I.FileText />} onClick={navTo["eod"]} />
            <QuickLinkCell label="Checkout TV" icon={<I.Monitor />} onClick={navTo["checkout-tv"]} />
            <QuickLinkCell label="Photos" icon={<I.Camera />} onClick={navTo["photos"]} />
            <QuickLinkCell label="Cash Tips" icon={<I.DollarSign />} onClick={navTo["cash-tips"]} />
            <QuickLinkCell label="Today's Notes" icon={<I.Clipboard />} onClick={navTo["checkout-notes"]} />
            <MetricCell label="LTV" value={`$${Math.round(funnelMetrics.avgLTV).toLocaleString("en-US")}`} onClick={navTo["lifecycle"]} />
            <MetricCell label="Total Clients" value={funnelMetrics.spendingClientsCount} onClick={navTo["lifecycle"]} />
            <ChecklistCell label="Back-End" progress={getChecklistProgress("ops-be")} count={getChecklistCount("ops-be")} onClick={navTo["ops-be"]} />
            <ServiceCell label="Ice Cream" done={svcData.iceCreamDone} total={svcData.iceCreamTotal} onClick={navTo["ops-svc"]} />

            {/* Financial Reporting label */}
            <div ref={financialRef} style={{ gridColumn: "1 / 8", display: "flex", alignItems: "flex-end", padding: "0 2px" }}>
              <span className="dash-section-label">Financial Reporting</span>
            </div>
            <div style={{ gridColumn: "8 / 10" }} />

            {/* Row 4: Financial (7 metrics) + Room Cleaning + Outstanding Invoices */}
            <MetricCell label="Transactions" value={m.cashTransactionCount} trend={showPriorPeriod ? bookingsTrend : null} skeleton={showSkeleton} />
            <MetricCell label="Average Transaction Price" value={`$${Math.round(m.cashAvgTransaction || 0).toLocaleString("en-US")}`} trend={showPriorPeriod ? pctChange(m.cashAvgTransaction, pm.cashAvgTransaction) : null} skeleton={showSkeleton} />
            <MetricCell label="Rev/PAR" value={`$${Math.round(accrualRevPAR || 0).toLocaleString("en-US")}`} trend={showPriorPeriod ? pctChange(accrualRevPAR, prevAccrualRevPAR) : null} skeleton={showSkeleton} />
            <MetricCell label="Refunds" value={m.refundCount} color={m.refundCount > 0 ? C.dan : undefined} trend={showPriorPeriod ? pctChange(m.refundCount, pm.refundCount) : null} skeleton={showSkeleton} />
            <MetricCell label="$ Refunded" value={`$${fmt$k(m.refundTotal)}`} color={m.refundTotal > 0 ? C.dan : undefined} skeleton={showSkeleton} />
            <MetricCell label="Discounted" value={m.discountedCount} color={m.discountedCount > 0 ? C.warn : undefined} skeleton={showSkeleton} />
            <MetricCell label="$ Discounted" value={`$${fmt$k(m.discountTotal)}`} color={m.discountTotal > 0 ? C.warn : undefined} skeleton={showSkeleton} />
            <ChecklistCell label="Room Cleaning & Setups" progress={getChecklistProgress("ops-rooms")} count={getChecklistCount("ops-rooms")} onClick={navTo["ops-rooms"]} />
            <MetricCell label="Outstanding Invoices" value={m.outstandingInvoiceCount || 0} sub={`$${fmt$k(m.outstandingInvoiceTotal || 0)}`} color={(m.outstandingInvoiceCount || 0) > 0 ? C.warn : undefined} skeleton={showSkeleton} />

            {/* Rows 5-7: Charts (cash cols 1-3, toggle col 4, accrual cols 5-7) + ops sidebar */}
            <div className="dash-chart-cell" style={{ gridColumn: "1 / 4", gridRow: "span 3" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cash Basis Revenue</span>
                  <Tip text="Cash basis = money collected on each day (payments + deposits - refunds). Today is live from Gingr API."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(cashTotalDisplay)}</span>
                  <span ref={cashReceiptTriggerRef} onClick={() => setShowCashReceipt(true)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: "rgba(20,83,45,0.08)", color: C.pri, transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)", flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.18)"; e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.08)"; e.currentTarget.style.transform = "scale(1)"; }} title="View cash basis breakdown"><I.FileText style={{ width: 11, height: 11 }} /></span>
                </span>
              </div>
              <ChartFill chartData={cashChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="cash-main" dateLabels={cashChartData.map(d => d.date)} useRawPoints lineType="linear" solidFill fillOpacity={0.35} showGuideLines todayHighlight={isToday} priorData={cashPriorChartData} showPriorLine={showPriorPeriod} priorLineColor="#D4A017" priorFillColor="#D4A017" priorFillOpacity={0.25} />
            </div>
            <div style={{ gridColumn: "4", gridRow: "span 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "6px 4px", background: "#FFFFFF", borderRadius: 8, border: "1px solid rgba(20,83,45,0.08)", boxShadow: "0 1px 3px rgba(20,83,45,0.06), 0 1px 2px rgba(20,83,45,0.04)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%" }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>Revenue Split</div>
                <div style={{ width: "80%", height: 5, borderRadius: 3, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${boardingPct}%`, height: "100%", background: C.pri }} />
                  <div style={{ width: `${daycarePct}%`, height: "100%", background: C.acc }} />
                </div>
                <div style={{ fontSize: 8, color: C.textMut, textAlign: "center", lineHeight: 1.4 }}>
                  <div><span style={{ color: C.pri, fontWeight: 700 }}>{boardingPct.toFixed(0)}%</span> Board</div>
                  <div><span style={{ color: C.acc, fontWeight: 700 }}>{daycarePct.toFixed(0)}%</span> Day</div>
                </div>
              </div>
              <div style={{ width: "60%", height: 1, background: "rgba(20,83,45,0.08)" }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>Accrual Total</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>${fmt$k(revenue)}</div>
              {showPriorPeriod && <TrendBadge value={revenueTrend} size="xs" />}
            </div>
            <div className="dash-chart-cell" style={{ gridColumn: "5 / 8", gridRow: "span 3" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Accrual Revenue</span>
                  <Tip text="Accrual revenue recognizes the full reservation cost divided evenly by the number of nights in the stay."><I.InfoCircle width="12" height="12" style={{ opacity: 0.4, cursor: "help" }} /></Tip>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>${fmt$k(revenue)}</span>
                  <span ref={receiptTriggerRef} onClick={() => setShowReceipt(true)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: "rgba(20,83,45,0.08)", color: C.pri, transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)", flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.18)"; e.currentTarget.style.transform = "scale(1.15)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,83,45,0.08)"; e.currentTarget.style.transform = "scale(1)"; }} title="View accrual breakdown"><I.FileText style={{ width: 11, height: 11 }} /></span>
                </span>
              </div>
              <ChartFill chartData={accrualChartData} color={C.pri} compareColor={C.acc} animEpoch={animEpoch} id="accrual-main" dateLabels={accrualChartData.map(d => d.date)} useRawPoints lineType="linear" solidFill fillOpacity={0.35} showGuideLines todayHighlight={isToday} priorData={accrualPriorChartData} showPriorLine={showPriorPeriod} priorLineColor="#D4A017" priorFillColor="#D4A017" priorFillOpacity={0.25} />
            </div>
            <ServiceCell label="Private Play" done={svcData.ppCompleted} total={svcData.ppTotal} onClick={navTo["ops-pp"]} />
            <InventoryCell done={invStatus.itemsCounted} total={invStatus.totalItems} overdue={invStatus.overdue} daysOverdue={invStatus.daysOverdue} phase={invStatus.phase} needsOrder={invStatus.needsOrder} ordered={invStatus.ordered} skipped={invStatus.skipped} countingDoneDate={invStatus.countingDoneDate} orderingDoneDate={invStatus.orderingDoneDate} daysUntilNext={invStatus.daysUntilNext} onClick={navTo["inventory"]} />
            <ChecklistCell label="Closing" progress={getChecklistProgress("ops-closing")} count={getChecklistCount("ops-closing")} onClick={navTo["ops-closing"]} />
            <MetricCell label="Test Health" value="172" sub="100% pass" onClick={navTo["test-health"]} color={C.suc} />
            <div className="dash-grid-cell empty-cell" />
            <div className="dash-grid-cell empty-cell" />
      </DashGrid>
      ) : (
      <div className="ops-dashboard">
        {/* ═══════════════════════════════════════════════════════════════════
           OPS-ONLY MODE — Section-based flex layout
           ═══════════════════════════════════════════════════════════════════ */}

        {/* ── Section 1: Hero Stats Banner ── */}
        <div>
          <div className="ops-section-header">{snapshotLabel}</div>
          <div className="ops-hero">
            <div className="ops-hero-card" onClick={navTo["checkout-tv"]}>
              <div className="ops-hero-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Dogs In House
                {displayLiveSnap && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.suc, animation: "dashPulse 1.5s infinite", flexShrink: 0 }} />}
              </div>
              <div className="ops-hero-value">{displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse}</div>
              <div className="ops-hero-sub">
                {displayLiveSnap ? `${displayLiveSnap.boarding}B · ${displayLiveSnap.daycare}D` : `${m.boardingInHouse || 0}B · ${m.daycareInHouse || 0}D`}
              </div>
              {showPriorPeriod && <TrendBadge value={pctChange(displayLiveSnap ? displayLiveSnap.in_house : m.dogsInHouse, pm.dogsInHouse)} size="xs" />}
            </div>
            <div className="ops-hero-card" onClick={navTo["checkout-tv"]}>
              <div className="ops-hero-label">Expected</div>
              <div className="ops-hero-value">{displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected}</div>
              {showPriorPeriod && <TrendBadge value={pctChange(displayLiveSnap ? displayLiveSnap.expected : m.dogsExpected, pm.dogsExpected)} size="xs" />}
            </div>
            <div className="ops-hero-card" onClick={navTo["ops-bathing"]}>
              <div className="ops-hero-label">{days > 1 ? "Canceled" : "Going Home"}</div>
              <div className="ops-hero-value">
                {days > 1
                  ? Math.max(0, (m.dogsExpected || 0) - (m.dogsInHouse || 0))
                  : (displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome)}
              </div>
              {showPriorPeriod && days <= 1 && <TrendBadge value={pctChange(displayLiveSnap ? displayLiveSnap.going_home : m.dogsGoingHome, pm.dogsGoingHome)} size="xs" />}
            </div>
            <div className="ops-hero-card" onClick={navTo["occupancy-report"]}>
              <div className="ops-hero-label">Occupancy</div>
              <div className="ops-hero-value">
                {days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0))}%
              </div>
              {showPriorPeriod && <TrendBadge value={pctChange(days > 1 ? Math.round(m.occupancyRate || 0) : (displayLiveSnap ? displayLiveSnap.occupancy_pct : (m.occupancyPct || 0)), days > 1 ? Math.round(pm.occupancyRate || 0) : (pm.occupancyPct || 0))} size="xs" />}
            </div>
            <div className="ops-hero-card">
              <div className="ops-hero-label">Tours & Evals</div>
              <div className="ops-hero-value">
                {(displayLiveSnap?.tours ?? (m.toursToday || 0)) + (displayLiveSnap?.evals ?? (m.evalsToday || 0))}
              </div>
              <div className="ops-hero-sub">
                {displayLiveSnap?.tours ?? (m.toursToday || 0)} tours · {displayLiveSnap?.evals ?? (m.evalsToday || 0)} evals
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="ops-section-header">Today's Enrichment</div>
          <TodayEnrichmentCard events={enrichmentEvents} nav={nav} loading={enrichmentLoading} compact />
        </div>

        {/* ── Section 2: Operations Progress (Three-Column) ── */}
        <div>
          <div className="ops-section-header">Daily Operations</div>
          <div className="ops-three-col">
            {/* Column 1: Resort Upkeep */}
            <div className="ops-card">
              <div className="ops-card-title">Resort Upkeep</div>
              {[
                { label: "Set-Ups", pct: roomBreakdown.totalSetups > 0 ? Math.round((roomBreakdown.doneSetups / roomBreakdown.totalSetups) * 100) : 0, count: `${roomBreakdown.doneSetups}/${roomBreakdown.totalSetups}`, click: navTo["ops-rooms"] },
                { label: "Disinfects", pct: roomBreakdown.totalDisinfects > 0 ? Math.round((roomBreakdown.doneDisinfects / roomBreakdown.totalDisinfects) * 100) : 0, count: `${roomBreakdown.doneDisinfects}/${roomBreakdown.totalDisinfects}`, click: navTo["ops-rooms"] },
                { label: "Refreshes", pct: roomBreakdown.totalRefreshes > 0 ? Math.round((roomBreakdown.doneRefreshes / roomBreakdown.totalRefreshes) * 100) : 0, count: `${roomBreakdown.doneRefreshes}/${roomBreakdown.totalRefreshes}`, click: navTo["ops-rooms"] },
                { label: "Weekly Maintenance", pct: wmStats.total > 0 ? Math.round((wmStats.checked / wmStats.total) * 100) : 0, count: `${wmStats.checked}/${wmStats.total}`, click: navTo["ops-weekly-maintenance"] },
              ].map((item) => (
                <div key={item.label} className="ops-progress-row" onClick={item.click}>
                  <span className="ops-progress-label">{item.label}</span>
                  <div className="ops-progress-track">
                    <div className="ops-progress-fill" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                  <span className="ops-progress-count">{item.count}</span>
                  <span className="ops-progress-pct">{item.pct}%</span>
                </div>
              ))}
            </div>

            {/* Column 2: Services */}
            <div className="ops-card">
              <div className="ops-card-title">Services</div>
              {[
                { label: "Baths", pct: svcData.bathsTotal > 0 ? Math.round((svcData.bathsDone / svcData.bathsTotal) * 100) : 0, count: `${svcData.bathsDone}/${svcData.bathsTotal}`, click: navTo["ops-bathing"] },
                { label: "Pamper", pct: svcData.pamperTotal > 0 ? Math.round((svcData.pamperDone / svcData.pamperTotal) * 100) : 0, count: `${svcData.pamperDone}/${svcData.pamperTotal}`, click: navTo["ops-pamper"] },
                { label: "Ice Cream", pct: svcData.iceCreamTotal > 0 ? Math.round((svcData.iceCreamDone / svcData.iceCreamTotal) * 100) : 0, count: `${svcData.iceCreamDone}/${svcData.iceCreamTotal}`, click: navTo["ops-svc"] },
                { label: "Private Play", pct: svcData.ppTotal > 0 ? Math.round((svcData.ppCompleted / svcData.ppTotal) * 100) : 0, count: `${svcData.ppCompleted}/${svcData.ppTotal}`, click: navTo["ops-pp"] },
              ].map((item) => (
                <div key={item.label} className="ops-progress-row" onClick={item.click}>
                  <span className="ops-progress-label">{item.label}</span>
                  <div className="ops-progress-track">
                    <div className="ops-progress-fill" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                  <span className="ops-progress-count">{item.count}</span>
                  <span className="ops-progress-pct">{item.pct}%</span>
                </div>
              ))}
            </div>

            {/* Column 3: Checklists */}
            <div className="ops-card">
              <div className="ops-card-title">Checklists</div>
              {[
                { label: "Opening", id: "ops-opening", click: navTo["ops-opening"] },
                { label: "Front-End", id: "ops-fe", click: navTo["ops-fe"] },
                { label: "Back-End", id: "ops-be", click: navTo["ops-be"] },
                { label: "Closing", id: "ops-closing", click: navTo["ops-closing"] },
              ].map((item) => {
                const pct = getChecklistProgress(item.id);
                const count = getChecklistCount(item.id);
                return (
                  <div key={item.id} className="ops-progress-row" onClick={item.click}>
                    <span className="ops-progress-label">{item.label}</span>
                    <div className="ops-progress-track">
                      <div className="ops-progress-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="ops-progress-count">{count}</span>
                    <span className="ops-progress-pct">{pct}%</span>
                  </div>
                );
              })}
              {/* Overall summary bar */}
              {(() => {
                const ids = ["ops-opening", "ops-fe", "ops-be", "ops-closing"];
                const total = ids.reduce((s, id) => s + getChecklistProgress(id), 0);
                const avg = Math.round(total / ids.length);
                return (
                  <div className="ops-overall-bar">
                    <span className="ops-progress-label" style={{ fontWeight: 700 }}>Overall</span>
                    <div className="ops-progress-track">
                      <div className="ops-progress-fill" style={{ width: `${avg}%` }} />
                    </div>
                    <span className="ops-progress-count" style={{ fontWeight: 800 }}>{avg}%</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── Section 3: Quick Actions ── */}
        <div>
          <div className="ops-section-header">Quick Actions</div>
          <div className="ops-quick-actions">
            {[
              { label: "EOD Report", icon: <I.FileText />, click: navTo["eod"] },
              { label: "Checkout TV", icon: <I.Monitor />, click: navTo["checkout-tv"] },
              { label: "Photos", icon: <I.Camera />, click: navTo["photos"] },
              { label: "Cash Tips", icon: <I.DollarSign />, click: navTo["cash-tips"] },
              { label: "Today's Notes", icon: <I.Clipboard />, click: navTo["checkout-notes"] },
              { label: "Enrichments", icon: <I.Sparkle />, click: navTo["enrichments"] },
              { label: "Operations Hub", icon: <I.ClipboardCheck />, click: navTo["ops-opening"] },
            ].map((item) => (
              <div key={item.label} className="ops-quick-action" onClick={item.click}>
                <div className="ops-quick-action-icon">{item.icon}</div>
                <div className="ops-quick-action-label">{item.label}</div>
              </div>
            ))}
            {/* Inventory — special card with status indicator */}
            {(() => {
              const isOrdering = invStatus.phase === "ordering";
              const isDone = invStatus.phase === "done";
              const isReady = invStatus.phase === "ready";
              const countingDone = invStatus.itemsCounted >= invStatus.totalItems && invStatus.totalItems > 0;
              const mainColor = isDone ? C.suc : isReady ? C.pri : invStatus.overdue ? "#EF4444" : C.acc;
              const fmtDate = (d) => { if (!d) return ""; const dt = new Date(d); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
              const addressedCount = (invStatus.ordered || 0) + (invStatus.skipped || 0);
              return (
                <div className="ops-quick-action" onClick={navTo["inventory"]} style={{ position: "relative", justifyContent: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
                  {invStatus.overdue && !isDone && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: "#FEE2E2", color: "#DC2626",
                    }}>{invStatus.daysOverdue}d overdue</span>
                  )}
                  <div className="ops-quick-action-icon" style={{ color: mainColor }}><I.Package /></div>
                  <div className="ops-quick-action-label">Inventory</div>
                  <div style={{ width: "80%", marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    {isDone ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.suc }}>
                          <span>✓ Done Counting</span>
                          <span>{fmtDate(invStatus.countingDoneDate)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.suc }}>
                          <span>✓ Done Ordering</span>
                          <span>{fmtDate(invStatus.orderingDoneDate)}</span>
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: C.textMut, marginTop: 2 }}>
                          Next due in {invStatus.daysUntilNext} day{invStatus.daysUntilNext !== 1 ? "s" : ""}
                        </div>
                      </>
                    ) : isReady ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700, color: C.pri }}>
                          <span>Ready to Submit</span>
                          <span>100%</span>
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: C.textMut }}>
                          Counted and ordered. Waiting for manual submit.
                        </div>
                      </>
                    ) : countingDone ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.suc }}>
                          <span>✓ Done Counting</span>
                          <span>{fmtDate(invStatus.countingDoneDate)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.textMut }}>
                          <span>Ordered</span>
                          <span>{addressedCount}/{invStatus.needsOrder}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600, color: C.textMut }}>
                        <span>Logged</span>
                        <span>{invStatus.itemsCounted}/{invStatus.totalItems}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* opsVisRef needed for lazy-compute of checklist data */}
        <div ref={opsVisRef} />
      </div>
      )}

      {/* Accrual Revenue Receipt Modal */}
      <AccrualReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        receiptData={receiptData}
        loading={receiptLoading}
        dateLabel={receiptDateLabel}
        originRef={receiptTriggerRef}
      />

      {/* Cash Basis Revenue Receipt Modal */}
      <CashBasisReceiptModal
        open={showCashReceipt}
        onClose={() => setShowCashReceipt(false)}
        cashData={cashReceiptData}
        loading={cashReceiptLoading}
        dateLabel={receiptDateLabel}
        originRef={cashReceiptTriggerRef}
      />
    </div>
  );
}

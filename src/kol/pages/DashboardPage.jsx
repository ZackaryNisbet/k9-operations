// K9 Operations — Consolidated Dashboard
// Merges Today's Progress, Revenue Intelligence, and Funnel into one view.
// OPS-001: Full consolidation of DailyOpsPage, ReportsPage, and FunnelPage.
// OPS-003: Timeframe selectors verified (WTD, Past Week, MTD, Past 30, QTD, YTD, Lifetime, Custom with date range picker)
// OPS-004: Top Category metric removed
// OPS-005: Accrual/Net Revenue consolidated into single "Revenue" metric
// OPS-006: Booking Source & Payment Method removed

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import {
  C, LITE_DEF_PRICING, CHART_PTS, OPS_TYPES, OPERATIONS_CATALOG,
  todayStr, addDays, countNights, countHours, fmtDate, fmtDateFull, fmtDateShort,
  formatTime12hr, DAY_NAMES_SHORT, ROOM_TYPES,
} from "../../shared/theme";
import { I } from "../../shared/icons";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { getRoomCleaningStats, getPPStats, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";

/* ═══════════════════════════════════════════════════════════════════════════
   CSS Animations — injected once via <style>
   ═══════════════════════════════════════════════════════════════════════════ */
const DASH_CSS = `
@keyframes dashSlideIn {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dashFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes dashCountUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dashBarGrow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes dashPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,52,98,0.12); }
  50%      { box-shadow: 0 0 0 8px rgba(0,52,98,0); }
}
@keyframes dashShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes calFadeIn {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes dashScaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes dashWidthGrow {
  from { max-width: 0; opacity: 0; }
  to   { max-width: 100%; opacity: 1; }
}
.dash-card {
  background: ${C.surface};
  border-radius: 15px;
  border: 1.5px solid ${C.border};
  padding: 22px;
  animation: dashSlideIn 0.45s cubic-bezier(0.22,1,0.36,1) both;
  transition: box-shadow 0.22s, transform 0.22s;
}
.dash-card:hover {
  box-shadow: 0 8px 28px rgba(0,52,98,0.10);
  transform: translateY(-2px);
}
.dash-hero-num {
  animation: dashCountUp 0.5s cubic-bezier(0.22,1,0.36,1) both;
}
.dash-bar-fill {
  transform-origin: left;
  animation: dashBarGrow 0.7s cubic-bezier(0.22,1,0.36,1) both;
}
.dash-funnel-bar {
  background: linear-gradient(90deg, ${C.pri}, ${C.priL});
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}
.dash-funnel-bar::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: dashShimmer 2.5s infinite;
}
.dash-snapshot-stat {
  padding: 14px 16px;
  border-radius: 12px;
  background: ${C.surface};
  border: 1.5px solid ${C.border};
  text-align: center;
  transition: all 0.2s;
  cursor: default;
}
.dash-snapshot-stat:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,52,98,0.08);
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Timeframe config
   ═══════════════════════════════════════════════════════════════════════════ */
const RANGES = [
  { key: "wtd",      label: "WTD" },
  { key: "past-week", label: "Past Week" },
  { key: "mtd",      label: "MTD" },
  { key: "past-30",  label: "Past 30" },
  { key: "qtd",      label: "QTD" },
  { key: "ytd",      label: "YTD" },
  { key: "lifetime", label: "Lifetime" },
  { key: "custom",   label: "Custom" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Animated number — uses requestAnimationFrame for smooth counting
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0, duration = 700 }) {
  const ref = useRef(null);
  const prevVal = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prevVal.current;
    const to = typeof value === "number" ? value : 0;
    prevVal.current = to;
    if (from === to) { el.textContent = prefix + format(to) + suffix; return; }
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      const cur = from + (to - from) * ease;
      el.textContent = prefix + format(cur) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    function format(n) {
      if (decimals === 0) return Math.round(n).toLocaleString("en-US");
      return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
  }, [value, prefix, suffix, decimals, duration]);

  const format = (n) => {
    if (decimals === 0) return Math.round(n).toLocaleString("en-US");
    return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return <span ref={ref}>{prefix}{format(typeof value === "number" ? value : 0)}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tiny helpers
   ═══════════════════════════════════════════════════════════════════════════ */
const fmt$ = (v) => `${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
const fmt$k = (v) => v >= 10000 ? `${(v / 1000).toFixed(1)}k` : v >= 1000 ? `${(v / 1000).toFixed(2)}k` : fmt$(v);
const fmtMoney = (n) => "$" + Math.round(n).toLocaleString();
const fmtDateLabel = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* ═══════════════════════════════════════════════════════════════════════════
   Trend badge
   ═══════════════════════════════════════════════════════════════════════════ */
function TrendBadge({ value, invert = false }) {
  if (value == null || !isFinite(value) || value === 0) return null;
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? C.suc : C.dan;
  const bg = positive ? C.sucLt : C.danLt;
  const arrow = value > 0 ? "↑" : "↓";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color, background: bg, padding: "2px 7px", borderRadius: 6 }}>
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage({ data, save, nav, profile, addGlobalToast }) {
  const [range, setRange] = useState("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [animEpoch, setAnimEpoch] = useState(0);
  const today = todayStr();

  // Re-trigger animations on range change
  useEffect(() => { setAnimEpoch(e => e + 1); }, [range]);

  /* ─── Date range computation ──────────────────────────────────────── */
  const { dateFrom, dateTo, days, prevFrom, prevTo } = useMemo(() => {
    const now = new Date();
    const end = today;
    let start;
    switch (range) {
      case "wtd": {
        const d = new Date(now); d.setDate(d.getDate() - d.getDay());
        start = d.toISOString().split("T")[0]; break;
      }
      case "past-week": start = addDays(today, -7); break;
      case "mtd": start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; break;
      case "past-30": start = addDays(today, -30); break;
      case "qtd": {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        start = `${now.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`; break;
      }
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

  /* ─── Today's Snapshot (from DailyOpsPage) ─────────────────────────── */
  const todaySnapshot = useMemo(() => {
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];

    // Dogs currently in house (checked-in, spanning today)
    const inHouse = reservations.filter(r =>
      r.status === "checked-in" && r.checkIn <= today && r.checkOut >= today
    );
    const boardingInHouse = inHouse.filter(r => r.type === "boarding").length;
    const daycareInHouse = inHouse.filter(r => r.type === "daycare" || r.type === "dayboarding").length;

    // Going home today (checked-in, checkout = today)
    const goingHome = reservations.filter(r =>
      r.status === "checked-in" && r.checkOut === today
    ).length;

    // Already checked out today
    const checkedOut = reservations.filter(r =>
      r.checkOut === today && r.status === "checked-out"
    ).length;

    // Arriving today (check-in = today, upcoming)
    const arriving = reservations.filter(r =>
      r.checkIn === today && (r.status === "upcoming" || r.status === "checked-in")
    ).length;

    // Baths due today (going-home dogs with bath service)
    const goingHomeRes = reservations.filter(r =>
      r.status === "checked-in" && r.checkOut === today
    );
    let bathsTotal = 0;
    let bathsDone = 0;
    goingHomeRes.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      const bathType = res.careOverrides?.bath_type || (dog && dog.fields?.bath_type);
      if (bathType) {
        bathsTotal++;
        const log = res.activityLog?.[`${today}|bathing`];
        if (log && log.administered) bathsDone++;
      }
    });

    // Room cleaning stats
    const cleaningStats = getRoomCleaningStats(data, today);

    // PP stats
    const ppStats = getPPStats(data, today);

    return {
      dogsInHouse: boardingInHouse + daycareInHouse,
      boardingInHouse,
      daycareInHouse,
      goingHome,
      checkedOut,
      arriving,
      bathsTotal,
      bathsDone,
      roomsToClean: cleaningStats.totalNeeded || 0,
      roomsCleaned: cleaningStats.totalDone || 0,
      ppTotal: ppStats.ppTotalDogs || 0,
      ppCompleted: ppStats.ppCompletedRequired || 0,
    };
  }, [data, today]);

  /* ─── Cash-basis revenue ──────────────────────────────────────────── */
  const cashBasisData = useMemo(() => {
    const allRes = (data.reservations || []).filter(r => r.status !== "cancelled" && r.pricing?.total > 0);
    const calcMetrics = (resInRange) => {
      const total = resInRange.reduce((sum, r) => sum + (r.pricing?.total || 0), 0);
      const byCategory = {};
      const byDate = {};
      resInRange.forEach(r => {
        const cat = r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : r.type === "evaluation" ? "Evaluation" : "Other";
        byCategory[cat] = (byCategory[cat] || 0) + (r.pricing?.total || 0);
        const dt = r.checkIn || today;
        byDate[dt] = (byDate[dt] || 0) + (r.pricing?.total || 0);
      });
      return {
        total, count: resInRange.length, byCategory, byDate,
        avgTransaction: resInRange.length > 0 ? total / resInRange.length : 0,
        payments: resInRange.map(r => ({
          id: r.id, amount: r.pricing?.total || 0, timestamp: r.checkIn + "T12:00:00",
          category: r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : "Other",
          reservationId: r.id,
        })),
      };
    };
    const currentRes = allRes.filter(r => r.checkIn >= dateFrom && r.checkIn <= dateTo);
    const previousRes = allRes.filter(r => r.checkIn >= prevFrom && r.checkIn <= prevTo);
    const current = calcMetrics(currentRes);
    const previous = calcMetrics(previousRes);
    return {
      current, previous,
      trend: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : 0,
      trendAvg: previous.count > 0 ? ((current.avgTransaction - previous.avgTransaction) / previous.avgTransaction) * 100 : 0,
    };
  }, [data.reservations, dateFrom, dateTo, prevFrom, prevTo, today]);

  /* ─── Accrual revenue ─────────────────────────────────────────────── */
  const accrualData = useMemo(() => {
    const reservations = data.reservations || [];
    const processDateRange = (from, to) => {
      const daysList = [];
      let cur = from;
      while (cur <= to) { daysList.push(cur); cur = addDays(cur, 1); }
      const dayData = {};
      daysList.forEach(d => {
        dayData[d] = { boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
      });
      reservations.forEach(res => {
        if (res.status === "cancelled") return;
        if (res.type === "boarding" && res.checkIn && res.checkOut) {
          const totalNights = countNights(res.checkIn, res.checkOut);
          if (totalNights <= 0) return;
          const perNightRate = (res.pricing?.total || 0) / totalNights;
          let night = res.checkIn;
          while (night < res.checkOut) {
            if (night >= from && night <= to && dayData[night]) {
              dayData[night].boardingRevenue += perNightRate;
              dayData[night].roomsOccupied += 1;
            }
            night = addDays(night, 1);
          }
        } else if (res.type === "daycare" && res.checkIn && res.checkIn >= from && res.checkIn <= to) {
          if (dayData[res.checkIn]) dayData[res.checkIn].daycareRevenue += (res.pricing?.total || 0);
        }
      });
      daysList.forEach(d => {
        dayData[d].totalRevenue = dayData[d].boardingRevenue + dayData[d].daycareRevenue;
        dayData[d].netRevenue = dayData[d].totalRevenue - dayData[d].discounts;
      });
      const totals = { boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
      daysList.forEach(d => { Object.keys(totals).forEach(k => { totals[k] += dayData[d][k]; }); });
      return { dayData, totals, days: daysList };
    };
    const current = processDateRange(dateFrom, dateTo);
    const previous = processDateRange(prevFrom, prevTo);
    const allRooms = data.rooms || {};
    const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);
    const revenueTrend = previous.totals.totalRevenue > 0 ? ((current.totals.totalRevenue - previous.totals.totalRevenue) / previous.totals.totalRevenue) * 100 : 0;
    const occupancyRate = totalRoomCount > 0 && current.days.length > 0 ? (current.totals.roomsOccupied / (totalRoomCount * current.days.length)) * 100 : 0;
    const revPAR = totalRoomCount > 0 && current.days.length > 0 ? current.totals.boardingRevenue / (totalRoomCount * current.days.length) : 0;
    return { current, previous, revenueTrend, occupancyRate, revPAR, totalRoomCount, days: current.days };
  }, [data.reservations, data.rooms, dateFrom, dateTo, prevFrom, prevTo]);

  /* ─── Revenue (OPS-005: consolidated accrual + net into single metric) */
  const revenue = accrualData.current.totals.totalRevenue;
  const prevRevenue = accrualData.previous.totals.totalRevenue;
  const revenueTrend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

  /* ─── Revenue Composition (from ReportsPage — Boarding vs Daycare split) */
  const revenueComposition = useMemo(() => {
    const totals = accrualData.current.totals;
    const total = totals.totalRevenue;
    const boardingPct = total > 0 ? (totals.boardingRevenue / total) * 100 : 0;
    const daycarePct = total > 0 ? (totals.daycareRevenue / total) * 100 : 0;
    return {
      boarding: totals.boardingRevenue,
      daycare: totals.daycareRevenue,
      total,
      boardingPct,
      daycarePct,
    };
  }, [accrualData.current.totals]);

  /* ─── Discount breakdown ──────────────────────────────────────────── */
  const discountBreakdown = useMemo(() => {
    const rackRates = LITE_DEF_PRICING.boardingRates;
    const reservations = (data.reservations || []).filter(r =>
      r.status !== "cancelled" && r.type === "boarding" &&
      r.checkIn >= dateFrom && r.checkIn <= dateTo
    );
    let discounted = 0, atRack = 0, totalRackRevenue = 0, totalActualRevenue = 0;
    reservations.forEach(res => {
      const nights = countNights(res.checkIn, res.checkOut);
      if (nights <= 0) return;
      const actual = res.pricing?.total || 0;
      const typeName = res._resTypeName || "";
      const rackRate = Object.entries(rackRates).find(([k]) => typeName.toLowerCase().includes(k.toLowerCase()))?.[1] || 0;
      const expectedRack = rackRate * nights;
      totalRackRevenue += expectedRack;
      totalActualRevenue += actual;
      if (expectedRack > 0 && actual < expectedRack * 0.98) { discounted++; } else { atRack++; }
    });
    const totalDiscounts = Math.max(0, totalRackRevenue - totalActualRevenue);
    return { discounted, atRack, totalRackRevenue, totalActualRevenue, totalDiscounts };
  }, [data.reservations, dateFrom, dateTo]);

  /* ─── Category data (revenue breakdown — OPS-004: Top Category removed) ── */
  const categoryData = useMemo(() => {
    const cats = cashBasisData.current.byCategory;
    const total = cashBasisData.current.total;
    const colors = [C.pri, C.acc, C.suc, C.info, C.warn, "#6366F1", C.dan, "#059669"];
    return Object.entries(cats)
      .map(([label, value], idx) => ({ label, value, percent: total > 0 ? (value / total) * 100 : 0, color: colors[idx % colors.length] }))
      .sort((a, b) => b.value - a.value);
  }, [cashBasisData.current]);

  /* ─── Chart data bucketing ────────────────────────────────────────── */
  const bucketMode = useMemo(() => {
    if (range === "ytd" || range === "lifetime" || days > 180) return "monthly";
    if (range === "qtd" || days > 60) return "weekly";
    return "daily";
  }, [range, days]);

  const bucketDays = useCallback((daysList, getValueForDay) => {
    if (bucketMode === "daily") {
      return daysList.map(d => ({ date: d, label: fmtDateLabel(d), value: getValueForDay(d), prevValue: 0 }));
    }
    if (bucketMode === "monthly") {
      const buckets = {};
      daysList.forEach(d => {
        const key = d.slice(0, 7);
        if (!buckets[key]) buckets[key] = { date: key, label: new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short" }), value: 0, prevValue: 0 };
        buckets[key].value += getValueForDay(d);
      });
      return Object.values(buckets);
    }
    // weekly
    const buckets = {};
    daysList.forEach(d => {
      const dt = new Date(d + "T00:00:00");
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - dt.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!buckets[key]) buckets[key] = { date: key, label: fmtDateLabel(key), value: 0, prevValue: 0 };
      buckets[key].value += getValueForDay(d);
    });
    return Object.values(buckets);
  }, [bucketMode]);

  const revenueChartData = useMemo(() => {
    const dayData = accrualData.current.dayData;
    return bucketDays(accrualData.days, d => dayData[d]?.totalRevenue || 0);
  }, [accrualData, bucketDays]);

  /* ─── Top clients ─────────────────────────────────────────────────── */
  const topClients = useMemo(() => {
    const payments = cashBasisData.current.payments || [];
    const clients = data.clients || [];
    const byClient = {};
    const clientVisits = {};
    payments.forEach(p => {
      const res = (data.reservations || []).find(r => r.id === p.reservationId);
      const client = res ? clients.find(c => c.id === res.clientId) : null;
      const name = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown";
      byClient[name] = (byClient[name] || 0) + (p.amount || 0);
      clientVisits[name] = (clientVisits[name] || 0) + 1;
    });
    const total = cashBasisData.current.total;
    return Object.entries(byClient)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, amt]) => ({
        name,
        spend: amt,
        share: total > 0 ? (amt / total) * 100 : 0,
        visits: clientVisits[name] || 0,
      }));
  }, [cashBasisData.current, data.reservations, data.clients]);

  /* ─── Funnel metrics (enhanced from FunnelPage) ────────────────────── */
  const funnelMetrics = useMemo(() => {
    const clients = data.clients || [];
    const ss = data.serverStats || {};
    const statsMap = {};
    clients.forEach(c => {
      const gid = String(c.gingrId);
      const srv = ss[gid];
      if (srv) {
        statsMap[c.id] = { totalSpent: Number(srv.total_spent) || 0, totalRes: Number(srv.total_res) || 0, hasRealBooking: srv.has_real_booking || false, hasSpent: (Number(srv.total_spent) || 0) > 0, lastResDate: srv.last_res_date || "" };
      } else {
        statsMap[c.id] = { totalSpent: 0, totalRes: c._numReservations || 0, hasRealBooking: (c._numReservations || 0) > 0, hasSpent: false, lastResDate: c._lastReservation ? c._lastReservation.split("T")[0] : "" };
      }
    });
    const inRange = (dateStr) => { if (!dateStr) return false; const d = dateStr.split("T")[0]; return d >= dateFrom && d <= dateTo; };
    const createdInRange = clients.filter(c => inRange(c.createdAt));

    // Leads: created in range, from FunnelPage logic — include all new created in range as potential leads
    const leadsInRange = createdInRange.filter(c => {
      const s = statsMap[c.id];
      if (s.lastResDate && s.lastResDate < dateFrom && s.hasRealBooking) return false;
      return true;
    });

    // Contacted: leads who have lifecycle log entries or converted
    const contactedLeads = leadsInRange.filter(c => {
      const convUpdates = c.lifecycle?.conversion?.updates || [];
      const retUpdates = c.lifecycle?.retention?.updates || [];
      const allUpdates = [...convUpdates, ...retUpdates];
      const hasLog = allUpdates.some(u => {
        const logDate = u.loggedAt ? u.loggedAt.split("T")[0] : "";
        return logDate >= dateFrom && logDate <= dateTo;
      });
      // Also check lifecycleUpdates array (used in DashboardPage's original code)
      const lcUpdates = c.lifecycleUpdates || [];
      const hasLcLog = lcUpdates.some(u => u.type === "outreach" || u.type === "follow_up" || u.type === "note");
      const s = statsMap[c.id];
      const becameCustomer = s.hasSpent || s.hasRealBooking;
      return hasLog || hasLcLog || becameCustomer;
    });

    // New customers: leads who have spent or have real bookings
    const newCustomers = leadsInRange.filter(c => {
      const s = statsMap[c.id];
      return s.hasSpent || s.hasRealBooking;
    });

    const newCustomerRevenue = newCustomers.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
    const spendingClients = clients.filter(c => statsMap[c.id]?.hasSpent || statsMap[c.id]?.hasRealBooking);
    const totalLTV = spendingClients.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
    const avgLTV = spendingClients.length > 0 ? totalLTV / spendingClients.length : 0;
    const conversionRate = leadsInRange.length > 0 ? (newCustomers.length / leadsInRange.length * 100) : 0;
    const forecastedUplift = newCustomers.length * avgLTV;

    // Pass-through rates (from FunnelPage)
    const leadToContact = leadsInRange.length > 0 ? (contactedLeads.length / leadsInRange.length * 100) : 0;
    const contactToCustomer = contactedLeads.length > 0 ? (newCustomers.length / contactedLeads.length * 100) : 0;

    return {
      leads: leadsInRange.length,
      contacted: contactedLeads.length,
      newCustomers: newCustomers.length,
      conversionRate,
      newCustomerRevenue,
      avgLTV,
      forecastedUplift,
      totalLTV,
      spendingClientsCount: spendingClients.length,
      leadToContact,
      contactToCustomer,
    };
  }, [data.clients, data.serverStats, dateFrom, dateTo]);

  // YTD leads for funnel bar proportional sizing
  const ytdLeads = useMemo(() => {
    const clients = data.clients || [];
    const yearStart = `${new Date().getFullYear()}-01-01`;
    return Math.max(1, clients.filter(c => c.createdAt && c.createdAt.split("T")[0] >= yearStart).length);
  }, [data.clients]);

  /* ─── Ops progress (today only) ───────────────────────────────────── */
  const opsProgress = useMemo(() => {
    const cats = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon);
    return cats.map(cat => {
      const progress = getOpsProgress(data, cat, today);
      const countLabel = getOpsCountLabel(data, cat, today);
      return { id: cat.id, label: cat.label, progress, countLabel };
    });
  }, [data, today]);

  const overallOpsProgress = useMemo(() => {
    if (opsProgress.length === 0) return 0;
    return Math.round(opsProgress.reduce((s, o) => s + o.progress, 0) / opsProgress.length);
  }, [opsProgress]);

  /* ─── Loading gate ────────────────────────────────────────────────── */
  if (!data || !data.reservations) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <K9LoadingAnimation message="Loading dashboard..." />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════════════════ */
  const gridBase = {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: 20,
  };

  return (
    <div style={{ padding: "0 4px 40px", maxWidth: 1400, margin: "0 auto" }}>
      <style>{DASH_CSS}</style>

      {/* ─── Header + Timeframe Selector ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 className="brand-headline" style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: C.textMut, margin: "4px 0 0" }}>{fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)} · {days} day{days !== 1 ? "s" : ""}</p>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${range === r.key ? C.pri : C.border}`,
                background: range === r.key ? C.pri : C.surface, color: range === r.key ? "#fff" : C.textSec,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range picker (OPS-003) */}
      {range === "custom" && (
        <DateRangePicker
          customFrom={customFrom}
          customTo={customTo}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
        />
      )}

      {/* ═══ TODAY'S SNAPSHOT — Live facility stats (from DailyOpsPage) ═══ */}
      <div className="dash-card" style={{ marginBottom: 20, animationDelay: "0.02s", padding: "18px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.suc, animation: "dashPulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Live Facility Snapshot</span>
          </div>
          <span style={{ fontSize: 11, color: C.textSec }}>{fmtDateLabel(today)}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          <SnapshotStat
            label="Dogs In House"
            value={todaySnapshot.dogsInHouse}
            sub={`${todaySnapshot.boardingInHouse} boarding · ${todaySnapshot.daycareInHouse} daycare`}
            color={C.pri}
            delay={0}
          />
          <SnapshotStat
            label="Arriving"
            value={todaySnapshot.arriving}
            sub="Check-ins today"
            color={C.info}
            delay={1}
          />
          <SnapshotStat
            label="Going Home"
            value={todaySnapshot.goingHome}
            sub="Pending checkout"
            color={C.acc}
            delay={2}
          />
          <SnapshotStat
            label="Checked Out"
            value={todaySnapshot.checkedOut}
            sub="Completed today"
            color={C.suc}
            delay={3}
          />
          <SnapshotStat
            label="Baths"
            value={`${todaySnapshot.bathsDone}/${todaySnapshot.bathsTotal}`}
            sub={todaySnapshot.bathsTotal > 0 ? `${Math.round(todaySnapshot.bathsTotal > 0 ? (todaySnapshot.bathsDone / todaySnapshot.bathsTotal) * 100 : 0)}% done` : "None due"}
            color="#7C3AED"
            delay={4}
          />
          <SnapshotStat
            label="Room Cleaning"
            value={`${todaySnapshot.roomsCleaned}/${todaySnapshot.roomsToClean}`}
            sub={todaySnapshot.roomsToClean > 0 ? `${Math.round((todaySnapshot.roomsCleaned / todaySnapshot.roomsToClean) * 100)}% done` : "All clear"}
            color={C.warn}
            delay={5}
          />
        </div>
      </div>

      {/* ═══ ROW 1 — Hero KPIs (4 cards, 3-col each) ═══════════════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        <HeroCard delay={0} label="Revenue" value={revenue} prefix="$" decimals={2} trend={revenueTrend} icon={<I.DollarSign />} />
        <HeroCard delay={1} label="Bookings" value={cashBasisData.current.count} trend={cashBasisData.previous.count > 0 ? ((cashBasisData.current.count - cashBasisData.previous.count) / cashBasisData.previous.count) * 100 : 0} icon={<I.Calendar />} />
        <HeroCard delay={2} label="Occupancy Rate" value={accrualData.occupancyRate} suffix="%" decimals={1} icon={<I.Layers />} />
        <HeroCard delay={3} label="Avg Transaction" value={cashBasisData.current.avgTransaction} prefix="$" decimals={2} trend={cashBasisData.trendAvg} icon={<I.CreditCard />} />
      </div>

      {/* ═══ ROW 2 — Revenue Chart (8col) + Funnel (4col) ═════════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        {/* Revenue trend chart */}
        <div className="dash-card" style={{ gridColumn: "span 8", animationDelay: "0.15s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue Trend</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginTop: 2 }}>
                <AnimatedNumber value={accrualData.current.totals.totalRevenue} prefix="$" decimals={2} />
              </div>
            </div>
            <TrendBadge value={accrualData.revenueTrend} />
          </div>
          <InteractiveLineChart
            chartData={revenueChartData}
            color={C.pri}
            height={200}
            id="dash-rev"
            animationEpoch={animEpoch}
          />
        </div>

        {/* Funnel visualization — enhanced with pass-through rates from FunnelPage */}
        <div className="dash-card" style={{ gridColumn: "span 4", animationDelay: "0.22s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Acquisition Funnel</div>
          {[
            { label: "Total Leads", count: funnelMetrics.leads, color: C.pri, pct: 100 },
            { label: "Contacted", count: funnelMetrics.contacted, color: C.acc, pct: funnelMetrics.leads > 0 ? (funnelMetrics.contacted / funnelMetrics.leads) * 100 : 0, passThrough: funnelMetrics.leadToContact },
            { label: "New Customers", count: funnelMetrics.newCustomers, color: C.suc, pct: funnelMetrics.leads > 0 ? (funnelMetrics.newCustomers / funnelMetrics.leads) * 100 : 0, passThrough: funnelMetrics.contactToCustomer },
          ].map((stage, i) => (
            <div key={stage.label}>
              {/* Pass-through indicator between stages */}
              {stage.passThrough != null && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 0", opacity: 0.7 }}>
                  <div style={{ height: 1, flex: 1, background: `linear-gradient(90deg, transparent, ${C.borderLight}, transparent)` }} />
                  <span style={{ padding: "1px 10px", fontSize: 9, fontWeight: 700, color: C.textMut, letterSpacing: "0.06em" }}>
                    {stage.passThrough.toFixed(0)}% pass-through
                  </span>
                  <div style={{ height: 1, flex: 1, background: `linear-gradient(90deg, transparent, ${C.borderLight}, transparent)` }} />
                </div>
              )}
              <div style={{ marginBottom: i < 2 ? 6 : 0, animation: `dashSlideIn 0.5s ${0.1 * i + 0.3}s cubic-bezier(0.22,1,0.36,1) both` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{stage.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{stage.count}</span>
                </div>
                <div style={{ height: 28, background: C.bg, borderRadius: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    width: `${Math.max(stage.pct, stage.count > 0 ? 8 : 0)}%`, height: "100%",
                    background: `linear-gradient(90deg, ${stage.color}, ${stage.color}dd)`,
                    borderRadius: 8, position: "relative", overflow: "hidden",
                    transition: "width 0.7s cubic-bezier(0.2,0.8,0.2,1)",
                  }}>
                    {/* Shimmer effect */}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)", backgroundSize: "200% 100%", animation: "dashShimmer 2.5s infinite" }} />
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, color: "#fff", zIndex: 1 }}>
                      {stage.pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {/* Conversion rate callout */}
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.pri }}>Conversion Rate</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.pri }}>{funnelMetrics.conversionRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* ═══ ROW 3 — Revenue Composition (4col) + Rev by Category (4col) + Funnel Metrics (4col) ═══ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        {/* Revenue Composition — from ReportsPage (Boarding vs Daycare accrual split) */}
        <div className="dash-card" style={{ gridColumn: "span 4", animationDelay: "0.26s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Revenue Composition</div>
          {/* Stacked bar visual */}
          <div style={{ height: 12, borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 16 }}>
            <div className="dash-bar-fill" style={{ width: `${revenueComposition.boardingPct}%`, height: "100%", background: C.pri, animationDelay: "0.3s" }} />
            <div className="dash-bar-fill" style={{ width: `${revenueComposition.daycarePct}%`, height: "100%", background: C.acc, animationDelay: "0.4s" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: C.pri }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Boarding</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>${fmt$k(revenueComposition.boarding)}</span>
                <span style={{ fontSize: 10, color: C.textMut, marginLeft: 4 }}>({revenueComposition.boardingPct.toFixed(1)}%)</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: C.acc }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Daycare</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>${fmt$k(revenueComposition.daycare)}</span>
                <span style={{ fontSize: 10, color: C.textMut, marginLeft: 4 }}>({revenueComposition.daycarePct.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
          {/* RevPAR + Rooms callout */}
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: C.accLt, textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.accDk, marginBottom: 2 }}>RevPAR</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.accDk }}>${accrualData.revPAR.toFixed(2)}</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: C.priLt, textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.pri, marginBottom: 2 }}>Total Rooms</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.pri }}>{accrualData.totalRoomCount}</div>
            </div>
          </div>
        </div>

        {/* Revenue breakdown by category */}
        <div className="dash-card" style={{ gridColumn: "span 4", animationDelay: "0.30s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Revenue by Category</div>
          {categoryData.length === 0 && <div style={{ fontSize: 13, color: C.textMut, padding: 20, textAlign: "center" }}>No data for this period</div>}
          {categoryData.map((cat, i) => (
            <div key={cat.label} style={{ marginBottom: 12, animation: `dashFadeIn 0.4s ${0.08 * i + 0.3}s both` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{cat.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>${fmt$k(cat.value)} <span style={{ fontSize: 10, color: C.textMut }}>({cat.percent.toFixed(1)}%)</span></span>
              </div>
              <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
                <div className="dash-bar-fill" style={{ width: `${cat.percent}%`, height: "100%", background: cat.color, borderRadius: 4, animationDelay: `${0.1 * i + 0.3}s` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Funnel key metrics */}
        <div className="dash-card" style={{ gridColumn: "span 4", animationDelay: "0.34s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Funnel Metrics</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <MetricTile label="Conversion Rate" value={`${funnelMetrics.conversionRate.toFixed(1)}%`} color={C.suc} icon="%" />
            <MetricTile label="New Customer Rev" value={`$${fmt$k(funnelMetrics.newCustomerRevenue)}`} color={C.pri} icon="$" />
            <MetricTile label="Avg Customer LTV" value={`$${fmt$k(funnelMetrics.avgLTV)}`} color={C.acc} icon="♦" />
            <MetricTile label="Forecasted Uplift" value={`$${fmt$k(funnelMetrics.forecastedUplift)}`} color={C.info} icon="↗" />
          </div>
        </div>
      </div>

      {/* ═══ ROW 4 — Ops Overview (full width) ════════════════════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        <div className="dash-card" style={{ gridColumn: "span 12", animationDelay: "0.38s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Today's Operations</div>
              <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>{fmtDateLabel(today)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 120, height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
                <div className="dash-bar-fill" style={{ width: `${overallOpsProgress}%`, height: "100%", background: overallOpsProgress === 100 ? C.suc : C.pri, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: overallOpsProgress === 100 ? C.suc : C.text }}>{overallOpsProgress}%</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {opsProgress.map((op, i) => (
              <button
                key={op.id}
                onClick={() => nav && nav(op.id.replace("ops-", "ops-"))}
                style={{
                  padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${op.progress === 100 ? C.suc + "40" : C.border}`,
                  background: op.progress === 100 ? C.sucLt : C.surface, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "all 0.15s", animation: `dashSlideIn 0.4s ${0.06 * i + 0.4}s cubic-bezier(0.22,1,0.36,1) both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,52,98,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>{op.label}</div>
                <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${op.progress}%`, height: "100%", background: op.progress === 100 ? C.suc : C.pri, borderRadius: 3, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontSize: 10, color: C.textMut, fontWeight: 500 }}>{op.countLabel || `${op.progress}%`}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ ROW 5 — LTV Methodology (6col) + Discount Analysis (6col) ═══ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        {/* LTV Methodology — from FunnelPage */}
        <div className="dash-card" style={{ gridColumn: "span 6", animationDelay: "0.42s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>LTV Methodology</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total Revenue Pool</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                <AnimatedNumber value={funnelMetrics.totalLTV} prefix="$" decimals={0} />
              </div>
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>All-time customer revenue</div>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Paying Customers</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                <AnimatedNumber value={funnelMetrics.spendingClientsCount} />
              </div>
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>With at least 1 transaction</div>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Avg LTV / Customer</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.acc }}>
                <AnimatedNumber value={funnelMetrics.avgLTV} prefix="$" decimals={0} />
              </div>
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>Revenue ÷ customers</div>
            </div>
          </div>
        </div>

        {/* Discount analysis */}
        <div className="dash-card" style={{ gridColumn: "span 6", animationDelay: "0.46s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Discount Analysis</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ padding: "14px", borderRadius: 10, background: C.bg }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, marginBottom: 4 }}>At Rack Rate</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.suc }}><AnimatedNumber value={discountBreakdown.atRack} /></div>
            </div>
            <div style={{ padding: "14px", borderRadius: 10, background: C.bg }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, marginBottom: 4 }}>Discounted</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.warn }}><AnimatedNumber value={discountBreakdown.discounted} /></div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, background: C.warnLt, border: `1px solid ${C.warn}20` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.warn }}>Total Discount Value</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.warn }}><AnimatedNumber value={discountBreakdown.totalDiscounts} prefix="$" decimals={2} /></span>
          </div>
          {discountBreakdown.totalRackRevenue > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: C.textSec }}>Discount Rate</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{((discountBreakdown.totalDiscounts / discountBreakdown.totalRackRevenue) * 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                <div className="dash-bar-fill" style={{ width: `${Math.min(100, (discountBreakdown.totalDiscounts / discountBreakdown.totalRackRevenue) * 100)}%`, height: "100%", background: C.warn, borderRadius: 3 }} />
              </div>
            </div>
          )}
          <div style={{ fontSize: 9, color: C.textMut, marginTop: 10, fontStyle: "italic" }}>* Estimates based on rack rates vs. actual pricing</div>
        </div>
      </div>

      {/* ═══ ROW 6 — Top Clients (full width) ═════════════════════════ */}
      <div style={gridBase}>
        <div className="dash-card" style={{ gridColumn: "span 12", animationDelay: "0.50s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Top Clients</div>
          {topClients.length === 0 && <div style={{ fontSize: 13, color: C.textMut, padding: 20, textAlign: "center" }}>No client data for this period</div>}
          {topClients.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {topClients.map((cl, i) => (
                <div
                  key={cl.name}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderRadius: 10, background: C.bg,
                    animation: `dashFadeIn 0.35s ${0.05 * i + 0.5}s both`,
                    transition: "all 0.15s", cursor: "default",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.priLt; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.bg; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", background: `${C.pri}15`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: C.pri, flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.name}</div>
                      <div style={{ fontSize: 10, color: C.textMut }}>{cl.visits} visit{cl.visits !== 1 ? "s" : ""} · {cl.share.toFixed(1)}% share</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, flexShrink: 0, marginLeft: 12 }}>${fmt$(cl.spend)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DateRangePicker — inline calendar for Custom timeframe (OPS-003)
   ═══════════════════════════════════════════════════════════════════════════ */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DateRangePicker({ customFrom, customTo, setCustomFrom, setCustomTo }) {
  const today = todayStr();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [hovered, setHovered] = useState(null);

  // Quick presets for the custom picker
  const presets = [
    { label: "Last 7 days", fn: () => { setCustomFrom(addDays(today, -6)); setCustomTo(today); } },
    { label: "Last 14 days", fn: () => { setCustomFrom(addDays(today, -13)); setCustomTo(today); } },
    { label: "Last 30 days", fn: () => { setCustomFrom(addDays(today, -29)); setCustomTo(today); } },
    { label: "Last 90 days", fn: () => { setCustomFrom(addDays(today, -89)); setCustomTo(today); } },
    { label: "This month", fn: () => {
      const now = new Date();
      setCustomFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
      setCustomTo(today);
    }},
    { label: "Last month", fn: () => {
      const now = new Date();
      const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      setCustomFrom(`${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, "0")}-01`);
      setCustomTo(`${pmEnd.getFullYear()}-${String(pmEnd.getMonth() + 1).padStart(2, "0")}-${String(pmEnd.getDate()).padStart(2, "0")}`);
    }},
  ];

  // Build calendar grid for current viewMonth
  const calDays = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    // Leading blanks
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push(iso);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handleDayClick = (iso) => {
    if (!customFrom || (customFrom && customTo)) {
      // Start new selection
      setCustomFrom(iso);
      setCustomTo("");
    } else {
      // Complete the selection
      if (iso < customFrom) {
        setCustomTo(customFrom);
        setCustomFrom(iso);
      } else {
        setCustomTo(iso);
      }
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const isInRange = (iso) => {
    if (!iso) return false;
    const rangeEnd = customTo || hovered;
    if (!customFrom || !rangeEnd) return false;
    const start = customFrom < rangeEnd ? customFrom : rangeEnd;
    const end = customFrom < rangeEnd ? rangeEnd : customFrom;
    return iso >= start && iso <= end;
  };

  const isStart = (iso) => iso && iso === customFrom;
  const isEnd = (iso) => iso && (customTo ? iso === customTo : iso === hovered && customFrom && !customTo);
  const isToday = (iso) => iso === today;
  const isFuture = (iso) => iso > today;

  return (
    <div style={{
      display: "flex", gap: 16, marginBottom: 20, padding: "18px 22px",
      background: C.surface, borderRadius: 15, border: `1.5px solid ${C.border}`,
      animation: "calFadeIn 0.3s cubic-bezier(0.22,1,0.36,1)",
      boxShadow: "0 2px 12px rgba(0,52,98,0.05)",
    }}>
      {/* Presets sidebar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 120, borderRight: `1px solid ${C.borderLight}`, paddingRight: 16 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Quick Select</div>
        {presets.map(p => (
          <button
            key={p.label}
            onClick={p.fn}
            style={{
              padding: "6px 10px", borderRadius: 7, border: "none",
              background: "transparent", color: C.textSec,
              fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              textAlign: "left", transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.priLt; e.currentTarget.style.color = C.pri; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSec; }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div style={{ flex: 1 }}>
        {/* Month/year header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={prevMonth} style={{
            width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.borderLight}`,
            background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, color: C.textSec, fontFamily: "inherit", transition: "all 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bg; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.surface; }}
          >‹</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{
            width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.borderLight}`,
            background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, color: C.textSec, fontFamily: "inherit", transition: "all 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bg; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.surface; }}
          >›</button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {DOW.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.textMut, letterSpacing: "0.05em", padding: "4px 0" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {calDays.map((iso, idx) => {
            if (!iso) return <div key={`blank-${idx}`} />;
            const dayNum = parseInt(iso.split("-")[2], 10);
            const inRange = isInRange(iso);
            const start = isStart(iso);
            const end = isEnd(iso);
            const fut = isFuture(iso);
            const td = isToday(iso);

            return (
              <button
                key={iso}
                onClick={() => !fut && handleDayClick(iso)}
                onMouseEnter={() => !fut && setHovered(iso)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  width: "100%", aspectRatio: "1", borderRadius: start || end ? 8 : inRange ? 0 : 8,
                  borderTopLeftRadius: start ? 8 : inRange ? 0 : 8,
                  borderBottomLeftRadius: start ? 8 : inRange ? 0 : 8,
                  borderTopRightRadius: end ? 8 : inRange ? 0 : 8,
                  borderBottomRightRadius: end ? 8 : inRange ? 0 : 8,
                  border: td ? `1.5px solid ${C.pri}` : "1.5px solid transparent",
                  background: (start || end) ? C.pri : inRange ? `${C.pri}15` : "transparent",
                  color: (start || end) ? "#fff" : fut ? `${C.textMut}60` : C.text,
                  fontSize: 11, fontWeight: (start || end || td) ? 700 : 500,
                  cursor: fut ? "default" : "pointer",
                  fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.1s",
                  opacity: fut ? 0.4 : 1,
                }}
              >
                {dayNum}
              </button>
            );
          })}
        </div>

        {/* Selection summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "8px 0" }}>
          <div style={{
            flex: 1, padding: "6px 10px", borderRadius: 7, border: `1.5px solid ${customFrom ? C.pri : C.border}`,
            background: customFrom ? `${C.pri}08` : C.bg, fontSize: 11, fontWeight: 600, color: customFrom ? C.text : C.textMut, textAlign: "center",
          }}>
            {customFrom ? fmtDateLabel(customFrom) : "Start date"}
          </div>
          <span style={{ fontSize: 10, color: C.textMut, fontWeight: 600 }}>→</span>
          <div style={{
            flex: 1, padding: "6px 10px", borderRadius: 7, border: `1.5px solid ${customTo ? C.pri : C.border}`,
            background: customTo ? `${C.pri}08` : C.bg, fontSize: 11, fontWeight: 600, color: customTo ? C.text : C.textMut, textAlign: "center",
          }}>
            {customTo ? fmtDateLabel(customTo) : "End date"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function HeroCard({ delay, label, value, prefix = "", suffix = "", decimals = 0, trend, icon }) {
  return (
    <div
      className="dash-card"
      style={{ gridColumn: "span 3", animationDelay: `${delay * 0.08}s`, position: "relative", overflow: "hidden" }}
    >
      {/* Background icon watermark */}
      <div style={{ position: "absolute", top: 12, right: 14, opacity: 0.06, color: C.pri, transform: "scale(2.2)" }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
      <div className="dash-hero-num" style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.1, marginBottom: 6 }}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      {trend != null && <TrendBadge value={trend} />}
    </div>
  );
}

function MetricTile({ label, value, color, icon }) {
  return (
    <div style={{
      padding: "14px", borderRadius: 12, border: `1.5px solid ${color}20`,
      background: `${color}08`, textAlign: "center",
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut }}>{label}</div>
    </div>
  );
}

function SnapshotStat({ label, value, sub, color, delay }) {
  return (
    <div className="dash-snapshot-stat" style={{ animation: `dashScaleIn 0.4s ${delay * 0.06 + 0.05}s cubic-bezier(0.22,1,0.36,1) both` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textMut, fontWeight: 500 }}>{sub}</div>
    </div>
  );
}

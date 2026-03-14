// K9 Operations — Consolidated Dashboard
// Merges Today's Progress, Revenue Intelligence, and Funnel into one view.

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
const fmtPercent = (v) => `${typeof v === "number" ? v.toFixed(1) : "0.0"}%`;
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
    return { current, previous, revenueTrend, occupancyRate, revPAR, days: current.days };
  }, [data.reservations, data.rooms, dateFrom, dateTo, prevFrom, prevTo]);

  /* ─── Net Revenue (consolidated: accrual - discounts) ─────────────── */
  const netRevenue = accrualData.current.totals.netRevenue;
  const prevNetRevenue = accrualData.previous.totals.netRevenue;
  const netRevTrend = prevNetRevenue > 0 ? ((netRevenue - prevNetRevenue) / prevNetRevenue) * 100 : 0;

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
    const grossRevenue = accrualData.current.totals.totalRevenue;
    return { discounted, atRack, totalRackRevenue, totalActualRevenue, grossRevenue, totalDiscounts };
  }, [accrualData.current, data.reservations, dateFrom, dateTo]);

  /* ─── Category data (revenue breakdown) ───────────────────────────── */
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

  /* ─── Funnel metrics ──────────────────────────────────────────────── */
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
    const leadsInRange = createdInRange.filter(c => {
      const s = statsMap[c.id];
      return !s.hasSpent && !s.hasRealBooking;
    });
    const contactedLeads = leadsInRange.filter(c => {
      const updates = c.lifecycleUpdates || [];
      return updates.some(u => u.type === "outreach" || u.type === "follow_up" || u.type === "note");
    });
    const newCustomers = createdInRange.filter(c => {
      const s = statsMap[c.id];
      return s.hasSpent || s.hasRealBooking;
    });
    const newCustomerRevenue = newCustomers.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
    const spendingClients = clients.filter(c => statsMap[c.id]?.hasSpent || statsMap[c.id]?.hasRealBooking);
    const totalLTV = spendingClients.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
    const avgLTV = spendingClients.length > 0 ? totalLTV / spendingClients.length : 0;
    const conversionRate = createdInRange.length > 0 ? (newCustomers.length / createdInRange.length * 100) : 0;
    const forecastedUplift = newCustomers.length * avgLTV;

    return {
      leads: leadsInRange.length + newCustomers.length,
      contacted: contactedLeads.length + newCustomers.length,
      newCustomers: newCustomers.length,
      conversionRate,
      newCustomerRevenue,
      avgLTV,
      forecastedUplift,
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

      {/* Custom date pickers */}
      {range === "custom" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", animation: "dashFadeIn 0.3s ease" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.textSec }}>
            From
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ marginLeft: 6, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", color: C.text }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.textSec }}>
            To
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ marginLeft: 6, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", color: C.text }} />
          </label>
        </div>
      )}

      {/* ═══ ROW 1 — Hero KPIs (4 cards, 3-col each) ═══════════════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        <HeroCard delay={0} label="Net Revenue" value={netRevenue} prefix="$" decimals={2} trend={netRevTrend} icon={<I.DollarSign />} />
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

        {/* Funnel visualization */}
        <div className="dash-card" style={{ gridColumn: "span 4", animationDelay: "0.22s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Acquisition Funnel</div>
          {[
            { label: "Leads", count: funnelMetrics.leads, pct: 100 },
            { label: "Contacted", count: funnelMetrics.contacted, pct: funnelMetrics.leads > 0 ? (funnelMetrics.contacted / funnelMetrics.leads) * 100 : 0 },
            { label: "Customers", count: funnelMetrics.newCustomers, pct: funnelMetrics.leads > 0 ? (funnelMetrics.newCustomers / funnelMetrics.leads) * 100 : 0 },
          ].map((stage, i) => (
            <div key={stage.label} style={{ marginBottom: i < 2 ? 14 : 0, animation: `dashSlideIn 0.5s ${0.1 * i + 0.3}s cubic-bezier(0.22,1,0.36,1) both` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{stage.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{stage.count}</span>
              </div>
              <div style={{ height: 28, background: C.bg, borderRadius: 8, overflow: "hidden" }}>
                <div className="dash-funnel-bar" style={{ width: `${Math.max(stage.pct, stage.count > 0 ? 8 : 0)}%`, height: "100%", animationDelay: `${0.15 * i + 0.3}s` }}>
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, color: "#fff", zIndex: 1 }}>
                    {stage.pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
          {/* Pass-through rate */}
          <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.pri }}>Conversion Rate</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.pri }}>{funnelMetrics.conversionRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* ═══ ROW 3 — Rev Breakdown (6col) + Funnel Metrics (6col) ═════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        {/* Revenue breakdown by category */}
        <div className="dash-card" style={{ gridColumn: "span 6", animationDelay: "0.28s" }}>
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
          {/* RevPAR callout */}
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: C.accLt, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.accDk }}>RevPAR</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.accDk }}>${accrualData.revPAR.toFixed(2)}</span>
          </div>
        </div>

        {/* Funnel key metrics */}
        <div className="dash-card" style={{ gridColumn: "span 6", animationDelay: "0.32s" }}>
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

      {/* ═══ ROW 5 — Discount Analysis (6col) + Top Clients (6col) ═══ */}
      <div style={gridBase}>
        {/* Discount analysis */}
        <div className="dash-card" style={{ gridColumn: "span 6", animationDelay: "0.44s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Discount Analysis</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ padding: "14px", borderRadius: 10, background: C.bg }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, marginBottom: 4 }}>At Rack Rate</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.suc }}>{discountBreakdown.atRack}</div>
            </div>
            <div style={{ padding: "14px", borderRadius: 10, background: C.bg }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, marginBottom: 4 }}>Discounted</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.warn }}>{discountBreakdown.discounted}</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, background: C.warnLt, border: `1px solid ${C.warn}20` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.warn }}>Total Discount Value</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.warn }}>${fmt$(discountBreakdown.totalDiscounts)}</span>
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

        {/* Top clients */}
        <div className="dash-card" style={{ gridColumn: "span 6", animationDelay: "0.48s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Top Clients</div>
          {topClients.length === 0 && <div style={{ fontSize: 13, color: C.textMut, padding: 20, textAlign: "center" }}>No client data for this period</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Header */}
            {topClients.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.6fr", padding: "0 4px 8px", borderBottom: `1.5px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut }}>CLIENT</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textAlign: "right" }}>SPEND</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textAlign: "right" }}>SHARE</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textAlign: "right" }}>VISITS</span>
              </div>
            )}
            {topClients.map((cl, i) => (
              <div
                key={cl.name}
                style={{
                  display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.6fr", padding: "8px 4px",
                  borderBottom: i < topClients.length - 1 ? `1px solid ${C.borderLight}` : "none",
                  animation: `dashFadeIn 0.35s ${0.05 * i + 0.5}s both`,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: "right" }}>${fmt$(cl.spend)}</span>
                <span style={{ fontSize: 11, color: C.textSec, textAlign: "right" }}>{cl.share.toFixed(1)}%</span>
                <span style={{ fontSize: 11, color: C.textSec, textAlign: "right" }}>{cl.visits}</span>
              </div>
            ))}
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

// K9 Operations — Command Center Dashboard (Complete Rewrite)
// Bloomberg-density, zero-scroll, 1080p-optimized dashboard.
// All data computation logic preserved from original consolidated dashboard.

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
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dashFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes dashCountUp {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dashBarGrow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes dashPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,52,98,0.12); }
  50%      { box-shadow: 0 0 0 6px rgba(0,52,98,0); }
}
@keyframes dashShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes dashScaleIn {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes calFadeIn {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
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
      const ease = 1 - Math.pow(1 - t, 3);
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
   Shared card style
   ═══════════════════════════════════════════════════════════════════════════ */
const cardStyle = (delay = 0) => ({
  background: C.surface,
  borderRadius: 12,
  border: `1px solid ${C.borderLight}`,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  animation: `dashSlideIn 0.3s ${delay}s cubic-bezier(0.22,1,0.36,1) both`,
  transition: "box-shadow 0.2s, transform 0.2s",
  position: "relative",
  overflow: "hidden",
});

const cardHoverHandlers = {
  onMouseEnter: (e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,52,98,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; },
  onMouseLeave: (e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = ""; },
};

/* ═══════════════════════════════════════════════════════════════════════════
   Expand button — universal module expand
   ═══════════════════════════════════════════════════════════════════════════ */
function ExpandBtn({ nav, target }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => nav && nav(target)}
      title="Expand"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 24, height: 24, borderRadius: 6, border: "none",
        background: hov ? C.priLt : "transparent",
        color: hov ? C.pri : C.textMut,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s", flexShrink: 0, padding: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Section header label
   ═══════════════════════════════════════════════════════════════════════════ */
const sectionLabel = { fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" };

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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, fontWeight: 700, color, background: bg, padding: "1px 6px", borderRadius: 4, lineHeight: 1.4 }}>
      {arrow}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Mini Sparkline — tiny inline SVG area chart
   ═══════════════════════════════════════════════════════════════════════════ */
function Sparkline({ data, width = 200, height = 50, color = C.pri }) {
  if (!data || data.length === 0) return null;
  const values = data.map(d => d.value || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const w = width;
  const h = height;
  const stepX = (w - pad * 2) / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${pad + (values.length - 1) * stepX},${h} L${pad},${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-grad-${color.replace("#","")})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DateRangePicker — inline calendar for Custom timeframe
   ═══════════════════════════════════════════════════════════════════════════ */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DateRangePicker({ customFrom, customTo, setCustomFrom, setCustomTo }) {
  const today = todayStr();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [hovered, setHovered] = useState(null);

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

  const calDays = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push(iso);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handleDayClick = (iso) => {
    if (!customFrom || (customFrom && customTo)) {
      setCustomFrom(iso);
      setCustomTo("");
    } else {
      if (iso < customFrom) { setCustomTo(customFrom); setCustomFrom(iso); }
      else { setCustomTo(iso); }
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
      display: "flex", gap: 14, marginBottom: 12, padding: "14px 16px",
      background: C.surface, borderRadius: 12, border: `1px solid ${C.borderLight}`,
      animation: "calFadeIn 0.3s cubic-bezier(0.22,1,0.36,1)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110, borderRight: `1px solid ${C.borderLight}`, paddingRight: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Quick Select</div>
        {presets.map(p => (
          <button
            key={p.label}
            onClick={p.fn}
            style={{
              padding: "4px 8px", borderRadius: 6, border: "none",
              background: "transparent", color: C.textSec,
              fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              textAlign: "left", transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.priLt; e.currentTarget.style.color = C.pri; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textSec; }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <button onClick={prevMonth} style={{
            width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.borderLight}`,
            background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: C.textSec, fontFamily: "inherit",
          }}>‹</button>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} style={{
            width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.borderLight}`,
            background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: C.textSec, fontFamily: "inherit",
          }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 3 }}>
          {DOW.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 8, fontWeight: 700, color: C.textMut, letterSpacing: "0.05em", padding: "2px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
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
                  width: "100%", aspectRatio: "1", borderRadius: start || end ? 6 : inRange ? 0 : 6,
                  borderTopLeftRadius: start ? 6 : inRange ? 0 : 6, borderBottomLeftRadius: start ? 6 : inRange ? 0 : 6,
                  borderTopRightRadius: end ? 6 : inRange ? 0 : 6, borderBottomRightRadius: end ? 6 : inRange ? 0 : 6,
                  border: td ? `1.5px solid ${C.pri}` : "1.5px solid transparent",
                  background: (start || end) ? C.pri : inRange ? `${C.pri}15` : "transparent",
                  color: (start || end) ? "#fff" : fut ? `${C.textMut}60` : C.text,
                  fontSize: 10, fontWeight: (start || end || td) ? 700 : 500,
                  cursor: fut ? "default" : "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.1s", opacity: fut ? 0.4 : 1,
                }}
              >
                {dayNum}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <div style={{
            flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${customFrom ? C.pri : C.border}`,
            background: customFrom ? `${C.pri}08` : C.bg, fontSize: 10, fontWeight: 600, color: customFrom ? C.text : C.textMut, textAlign: "center",
          }}>
            {customFrom ? fmtDateLabel(customFrom) : "Start"}
          </div>
          <span style={{ fontSize: 9, color: C.textMut }}>→</span>
          <div style={{
            flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${customTo ? C.pri : C.border}`,
            background: customTo ? `${C.pri}08` : C.bg, fontSize: 10, fontWeight: 600, color: customTo ? C.text : C.textMut, textAlign: "center",
          }}>
            {customTo ? fmtDateLabel(customTo) : "End"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage({
  data, save, nav, profile, addGlobalToast,
  showSnapshot, showRevenue, showFunnel, showLTV,
  showRevenueComposition, showRevenueByCategory, showDiscountAnalysis,
  showTopClients, showOps, showFunnelMetrics, showHeroKPIs,
}) {
  const [range, setRange] = useState("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [animEpoch, setAnimEpoch] = useState(0);
  const today = todayStr();

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

  /* ─── Today's Snapshot ────────────────────────────────────────────── */
  const todaySnapshot = useMemo(() => {
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    const inHouse = reservations.filter(r => r.status === "checked-in" && r.checkIn <= today && r.checkOut >= today);
    const boardingInHouse = inHouse.filter(r => r.type === "boarding").length;
    const daycareInHouse = inHouse.filter(r => r.type === "daycare" || r.type === "dayboarding").length;
    const goingHome = reservations.filter(r => r.status === "checked-in" && r.checkOut === today).length;
    const checkedOut = reservations.filter(r => r.checkOut === today && r.status === "checked-out").length;
    const arriving = reservations.filter(r => r.checkIn === today && (r.status === "upcoming" || r.status === "checked-in")).length;
    const goingHomeRes = reservations.filter(r => r.status === "checked-in" && r.checkOut === today);
    let bathsTotal = 0, bathsDone = 0;
    goingHomeRes.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      const bathType = res.careOverrides?.bath_type || (dog && dog.fields?.bath_type);
      if (bathType) {
        bathsTotal++;
        const log = res.activityLog?.[`${today}|bathing`];
        if (log && log.administered) bathsDone++;
      }
    });
    const cleaningStats = getRoomCleaningStats(data, today);
    const ppStats = getPPStats(data, today);
    return {
      dogsInHouse: boardingInHouse + daycareInHouse,
      boardingInHouse, daycareInHouse, goingHome, checkedOut, arriving,
      bathsTotal, bathsDone,
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

  /* ─── Revenue consolidated ─────────────────────────────────────────── */
  const revenue = accrualData.current.totals.totalRevenue;
  const prevRevenue = accrualData.previous.totals.totalRevenue;
  const revenueTrend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

  /* ─── Revenue Composition ──────────────────────────────────────────── */
  const revenueComposition = useMemo(() => {
    const totals = accrualData.current.totals;
    const total = totals.totalRevenue;
    const boardingPct = total > 0 ? (totals.boardingRevenue / total) * 100 : 0;
    const daycarePct = total > 0 ? (totals.daycareRevenue / total) * 100 : 0;
    return { boarding: totals.boardingRevenue, daycare: totals.daycareRevenue, total, boardingPct, daycarePct };
  }, [accrualData.current.totals]);

  /* ─── Discount breakdown ──────────────────────────────────────────── */
  const discountBreakdown = useMemo(() => {
    const rackRates = LITE_DEF_PRICING.boardingRates;
    const reservations = (data.reservations || []).filter(r =>
      r.status !== "cancelled" && r.type === "boarding" && r.checkIn >= dateFrom && r.checkIn <= dateTo
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

  /* ─── Category data ────────────────────────────────────────────────── */
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
        name, spend: amt,
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
      if (s.lastResDate && s.lastResDate < dateFrom && s.hasRealBooking) return false;
      return true;
    });
    const contactedLeads = leadsInRange.filter(c => {
      const convUpdates = c.lifecycle?.conversion?.updates || [];
      const retUpdates = c.lifecycle?.retention?.updates || [];
      const allUpdates = [...convUpdates, ...retUpdates];
      const hasLog = allUpdates.some(u => {
        const logDate = u.loggedAt ? u.loggedAt.split("T")[0] : "";
        return logDate >= dateFrom && logDate <= dateTo;
      });
      const lcUpdates = c.lifecycleUpdates || [];
      const hasLcLog = lcUpdates.some(u => u.type === "outreach" || u.type === "follow_up" || u.type === "note");
      const s = statsMap[c.id];
      const becameCustomer = s.hasSpent || s.hasRealBooking;
      return hasLog || hasLcLog || becameCustomer;
    });
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
    const leadToContact = leadsInRange.length > 0 ? (contactedLeads.length / leadsInRange.length * 100) : 0;
    const contactToCustomer = contactedLeads.length > 0 ? (newCustomers.length / contactedLeads.length * 100) : 0;
    return {
      leads: leadsInRange.length, contacted: contactedLeads.length, newCustomers: newCustomers.length,
      conversionRate, newCustomerRevenue, avgLTV, forecastedUplift, totalLTV,
      spendingClientsCount: spendingClients.length, leadToContact, contactToCustomer,
    };
  }, [data.clients, data.serverStats, dateFrom, dateTo]);

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

  /* ─── Refund tracker ──────────────────────────────────────────────── */
  const refundData = useMemo(() => {
    const reservations = (data.reservations || []).filter(r =>
      r.checkIn >= dateFrom && r.checkIn <= dateTo
    );
    let totalRefunds = 0, refundCount = 0;
    reservations.forEach(res => {
      const refund = res.pricing?.refund || res.pricing?.refundAmount || 0;
      if (refund > 0) {
        totalRefunds += refund;
        refundCount++;
      }
    });
    return {
      total: totalRefunds,
      count: refundCount,
      avg: refundCount > 0 ? totalRefunds / refundCount : 0,
    };
  }, [data.reservations, dateFrom, dateTo]);

  /* ─── Loading gate ────────────────────────────────────────────────── */
  if (!data || !data.reservations) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 64px)" }}>
        <K9LoadingAnimation message="Loading dashboard..." />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Render — Command Center Layout
     ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ height: "calc(100vh - 64px)", overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 8, fontFamily: "inherit" }}>
      <style>{DASH_CSS}</style>

      {/* ═══ HEADER BAR — Title + Timeframe pills in one compact row ═══ */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, minHeight: 36,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1 }}>Command Center</h1>
          <span style={{ fontSize: 10, color: C.textMut, fontWeight: 500 }}>{fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)} · {days}d</span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: "3px 8px", borderRadius: 6, border: `1px solid ${range === r.key ? C.pri : C.borderLight}`,
                background: range === r.key ? C.pri : "transparent", color: range === r.key ? "#fff" : C.textMut,
                fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.12s", lineHeight: 1.4,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date picker (only when custom range selected) */}
      {range === "custom" && (
        <DateRangePicker
          customFrom={customFrom} customTo={customTo}
          setCustomFrom={setCustomFrom} setCustomTo={setCustomTo}
        />
      )}

      {/* ═══ ROW 1: LIVE FACILITY SNAPSHOT — thin strip, full width ═══ */}
      {showSnapshot !== false && (
        <div style={{
          ...cardStyle(0.02), padding: "8px 14px", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 12,
        }} {...cardHoverHandlers}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.suc, animation: "dashPulse 2s infinite" }} />
            <span style={{ ...sectionLabel, fontSize: 9 }}>LIVE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
            <SnapshotPill label="In House" value={todaySnapshot.dogsInHouse} color={C.pri} sub={`${todaySnapshot.boardingInHouse}B · ${todaySnapshot.daycareInHouse}D`} />
            <SnapshotPill label="Arriving" value={todaySnapshot.arriving} color={C.info} />
            <SnapshotPill label="Going Home" value={todaySnapshot.goingHome} color={C.acc} />
            <SnapshotPill label="Checked Out" value={todaySnapshot.checkedOut} color={C.suc} />
            <SnapshotPill label="Baths" value={`${todaySnapshot.bathsDone}/${todaySnapshot.bathsTotal}`} color="#7C3AED" />
            <SnapshotPill label="Rooms" value={`${todaySnapshot.roomsCleaned}/${todaySnapshot.roomsToClean}`} color={C.warn} />
          </div>
        </div>
      )}

      {/* ═══ ROW 2: MAIN CONTENT — 12-col grid, 3 rows ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gridTemplateRows: "auto auto 1fr", gap: 8, minHeight: 0, overflow: "hidden" }}>

        {/* Today's Operations — cols 1-8, row 1 */}
        {showOps !== false && (
          <div style={{ ...cardStyle(0.04), padding: "10px 14px", gridColumn: "1 / 9", gridRow: "1" }} {...cardHoverHandlers}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={sectionLabel}>Today's Operations</span>
                <span style={{ fontSize: 10, color: C.textMut }}>{fmtDateLabel(today)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 80, height: 4, background: C.bg, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${overallOpsProgress}%`, height: "100%", background: overallOpsProgress === 100 ? C.suc : C.pri, borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: overallOpsProgress === 100 ? C.suc : C.text }}>{overallOpsProgress}%</span>
                </div>
                <ExpandBtn nav={nav} target="daily-ops" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {opsProgress.slice(0, 8).map((op, i) => (
                <div key={op.id} style={{
                  padding: "6px 10px", borderRadius: 8, background: op.progress === 100 ? C.sucLt : C.bg,
                  border: `1px solid ${op.progress === 100 ? C.suc + "30" : C.borderLight}`,
                  animation: `dashFadeIn 0.25s ${0.04 * i + 0.06}s both`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.label}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: op.progress === 100 ? C.suc : C.pri, flexShrink: 0, marginLeft: 4 }}>{op.progress}%</span>
                  </div>
                  <div style={{ height: 4, background: op.progress === 100 ? C.suc + "20" : C.borderLight, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${op.progress}%`, height: "100%", background: op.progress === 100 ? C.suc : C.pri, borderRadius: 2, transformOrigin: "left", animation: `dashBarGrow 0.5s ${0.04 * i + 0.1}s cubic-bezier(0.22,1,0.36,1) both` }} />
                  </div>
                  <div style={{ fontSize: 9, color: C.textMut, marginTop: 3, fontWeight: 500 }}>{op.countLabel || `${op.progress}%`}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue Trend — cols 9-12, row 1 */}
        {showRevenue !== false && (
          <div style={{ ...cardStyle(0.06), padding: "10px 14px", gridColumn: "9 / 13", gridRow: "1" }} {...cardHoverHandlers}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={sectionLabel}>Revenue Trend</span>
              <ExpandBtn nav={nav} target="reports" />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1 }}>
                <AnimatedNumber value={revenue} prefix="$" decimals={0} />
              </span>
              <TrendBadge value={revenueTrend} />
            </div>
            <div style={{ margin: "0 -4px" }}>
              <Sparkline data={revenueChartData} width={400} height={50} color={C.pri} />
            </div>
          </div>
        )}

        {/* Hero KPIs — cols 1-8, row 2 */}
        {showHeroKPIs !== false && (
          <div style={{ gridColumn: "1 / 9", gridRow: "2", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <HeroKPI delay={0.08} label="Revenue" value={revenue} prefix="$" decimals={0} trend={revenueTrend} color={C.pri} />
            <HeroKPI delay={0.10} label="Bookings" value={cashBasisData.current.count} trend={cashBasisData.previous.count > 0 ? ((cashBasisData.current.count - cashBasisData.previous.count) / cashBasisData.previous.count) * 100 : 0} color={C.info} />
            <HeroKPI delay={0.12} label="Occupancy" value={accrualData.occupancyRate} suffix="%" decimals={1} color={C.suc} />
            <HeroKPI delay={0.14} label="Avg Txn" value={cashBasisData.current.avgTransaction} prefix="$" decimals={0} trend={cashBasisData.trendAvg} color={C.acc} />
          </div>
        )}

        {/* Revenue Mix — cols 9-12, row 2 */}
        {showRevenueComposition !== false && (
          <div style={{ ...cardStyle(0.10), padding: "10px 14px", gridColumn: "9 / 13", gridRow: "2" }} {...cardHoverHandlers}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={sectionLabel}>Revenue Mix</span>
              <ExpandBtn nav={nav} target="reports" />
            </div>
            <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", marginBottom: 10 }}>
              <div style={{ width: `${revenueComposition.boardingPct}%`, height: "100%", background: C.pri, transformOrigin: "left", animation: "dashBarGrow 0.5s 0.12s cubic-bezier(0.22,1,0.36,1) both" }} />
              <div style={{ width: `${revenueComposition.daycarePct}%`, height: "100%", background: C.acc, transformOrigin: "left", animation: "dashBarGrow 0.5s 0.18s cubic-bezier(0.22,1,0.36,1) both" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: C.pri }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: C.text }}>Boarding</span>
                <span style={{ fontSize: 10, color: C.textMut }}>{revenueComposition.boardingPct.toFixed(0)}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: C.acc }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: C.text }}>Daycare</span>
                <span style={{ fontSize: 10, color: C.textMut }}>{revenueComposition.daycarePct.toFixed(0)}%</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
              <div style={{ padding: "5px 8px", borderRadius: 6, background: C.priLt, textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.pri }}>RevPAR</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>${accrualData.revPAR.toFixed(0)}</div>
              </div>
              <div style={{ padding: "5px 8px", borderRadius: 6, background: C.accLt, textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.accDk }}>Rooms</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.accDk }}>{accrualData.totalRoomCount}</div>
              </div>
            </div>
          </div>
        )}

        {/* Top Clients — cols 1-6, row 3 */}
        {showTopClients !== false && (
          <div style={{ ...cardStyle(0.14), padding: "10px 14px", gridColumn: "1 / 7", gridRow: "3", overflow: "hidden", display: "flex", flexDirection: "column" }} {...cardHoverHandlers}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexShrink: 0 }}>
              <span style={sectionLabel}>Top Clients</span>
              <ExpandBtn nav={nav} target="lifecycle" />
            </div>
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              {topClients.length === 0 ? (
                <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", textAlign: "center", paddingTop: 12 }}>No client data for this period</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", fontSize: 9, fontWeight: 700, color: C.textMut, padding: "0 0 4px 0", borderBottom: `1px solid ${C.borderLight}` }}>Client</th>
                      <th style={{ textAlign: "right", fontSize: 9, fontWeight: 700, color: C.textMut, padding: "0 0 4px 0", borderBottom: `1px solid ${C.borderLight}` }}>Spend</th>
                      <th style={{ textAlign: "right", fontSize: 9, fontWeight: 700, color: C.textMut, padding: "0 0 4px 0", borderBottom: `1px solid ${C.borderLight}` }}>Visits</th>
                      <th style={{ textAlign: "right", fontSize: 9, fontWeight: 700, color: C.textMut, padding: "0 0 4px 0", borderBottom: `1px solid ${C.borderLight}` }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topClients.map((c, i) => (
                      <tr key={i} style={{ animation: `dashFadeIn 0.2s ${0.03 * i + 0.16}s both` }}>
                        <td style={{ padding: "4px 0", fontSize: 11, fontWeight: 600, color: C.text, borderBottom: `1px solid ${C.borderLight}08` }}>{c.name}</td>
                        <td style={{ padding: "4px 0", fontSize: 11, fontWeight: 700, color: C.pri, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${fmt$k(c.spend)}</td>
                        <td style={{ padding: "4px 0", fontSize: 11, color: C.textSec, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.visits}</td>
                        <td style={{ padding: "4px 0", fontSize: 10, color: C.textMut, textAlign: "right" }}>{c.share.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Discount Analysis — cols 7-12, row 3 */}
        {showDiscountAnalysis !== false && (
          <div style={{ ...cardStyle(0.16), padding: "10px 14px", gridColumn: "7 / 13", gridRow: "3", overflow: "hidden", display: "flex", flexDirection: "column" }} {...cardHoverHandlers}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexShrink: 0 }}>
              <span style={sectionLabel}>Discount Analysis</span>
              <ExpandBtn nav={nav} target="reports" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1 }}>
              <div style={{ padding: "10px", borderRadius: 8, background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>At Rack Rate</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.suc }}>{discountBreakdown.atRack}</div>
                <div style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>reservations</div>
              </div>
              <div style={{ padding: "10px", borderRadius: 8, background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Discounted</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: discountBreakdown.discounted > 0 ? C.warn : C.text }}>{discountBreakdown.discounted}</div>
                <div style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>reservations</div>
              </div>
              <div style={{ padding: "10px", borderRadius: 8, background: C.priLt, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Rack Revenue</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.pri }}>${fmt$k(discountBreakdown.totalRackRevenue)}</div>
              </div>
              <div style={{ padding: "10px", borderRadius: 8, background: discountBreakdown.totalDiscounts > 0 ? C.danLt : C.bg, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: discountBreakdown.totalDiscounts > 0 ? C.dan : C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Discounts Given</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: discountBreakdown.totalDiscounts > 0 ? C.dan : C.text }}>${fmt$k(discountBreakdown.totalDiscounts)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ ROW 3: BOTTOM MODULES — 3 equal columns ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, flexShrink: 0 }}>

        {/* Acquisition Funnel */}
        {showFunnel !== false && (
          <div style={{ ...cardStyle(0.16), padding: "10px 14px" }} {...cardHoverHandlers}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={sectionLabel}>Acquisition Funnel</span>
              <ExpandBtn nav={nav} target="funnel" />
            </div>
            {[
              { label: "Leads", count: funnelMetrics.leads, color: C.pri, pct: 100 },
              { label: "Contacted", count: funnelMetrics.contacted, color: C.acc, pct: funnelMetrics.leads > 0 ? (funnelMetrics.contacted / funnelMetrics.leads) * 100 : 0, passRate: funnelMetrics.leadToContact },
              { label: "Customers", count: funnelMetrics.newCustomers, color: C.suc, pct: funnelMetrics.leads > 0 ? (funnelMetrics.newCustomers / funnelMetrics.leads) * 100 : 0, passRate: funnelMetrics.contactToCustomer },
            ].map((stage, i) => (
              <div key={stage.label} style={{ marginBottom: i < 2 ? 6 : 0 }}>
                {stage.passRate != null && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1px 0", marginBottom: 2 }}>
                    <div style={{ height: 1, flex: 1, background: C.borderLight }} />
                    <span style={{ padding: "0 6px", fontSize: 8, fontWeight: 700, color: C.textMut }}>{stage.passRate.toFixed(0)}%</span>
                    <div style={{ height: 1, flex: 1, background: C.borderLight }} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.text }}>{stage.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: stage.color }}>{stage.count}</span>
                </div>
                <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.max(stage.pct, stage.count > 0 ? 8 : 0)}%`, height: "100%",
                    background: `linear-gradient(90deg, ${stage.color}, ${stage.color}cc)`,
                    borderRadius: 3, transformOrigin: "left",
                    animation: `dashBarGrow 0.5s ${0.08 * i + 0.2}s cubic-bezier(0.22,1,0.36,1) both`,
                  }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: "5px 8px", borderRadius: 6, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: C.pri }}>Conversion</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{funnelMetrics.conversionRate.toFixed(1)}%</span>
            </div>
          </div>
        )}

        {/* Funnel Metrics — 4 mini tiles */}
        {showFunnelMetrics !== false && (
          <div style={{ ...cardStyle(0.20), padding: "10px 14px" }} {...cardHoverHandlers}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={sectionLabel}>Funnel Metrics</span>
              <ExpandBtn nav={nav} target="funnel" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <MiniMetric label="Conversion Rate" value={`${funnelMetrics.conversionRate.toFixed(1)}%`} color={C.suc} delay={0.22} />
              <MiniMetric label="New Cust. Rev" value={`$${fmt$k(funnelMetrics.newCustomerRevenue)}`} color={C.pri} delay={0.24} />
              <MiniMetric label="Avg LTV" value={`$${fmt$k(funnelMetrics.avgLTV)}`} color={C.acc} delay={0.26} />
              <MiniMetric label="Forecasted Uplift" value={`$${fmt$k(funnelMetrics.forecastedUplift)}`} color={C.info} delay={0.28} />
            </div>
          </div>
        )}

        {/* Refund Tracker */}
        <div style={{ ...cardStyle(0.24), padding: "10px 14px" }} {...cardHoverHandlers}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={sectionLabel}>Refund Tracker</span>
            <ExpandBtn nav={nav} target="refunds" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div style={{ padding: "8px", borderRadius: 8, background: refundData.total > 0 ? C.danLt : C.bg, textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, marginBottom: 3 }}>Total</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: refundData.total > 0 ? C.dan : C.text }}>${fmt$k(refundData.total)}</div>
            </div>
            <div style={{ padding: "8px", borderRadius: 8, background: C.bg, textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, marginBottom: 3 }}>Count</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{refundData.count}</div>
            </div>
            <div style={{ padding: "8px", borderRadius: 8, background: C.bg, textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, marginBottom: 3 }}>Avg</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>${fmt$k(refundData.avg)}</div>
            </div>
          </div>
          {refundData.count === 0 && (
            <div style={{ fontSize: 9, color: C.textMut, textAlign: "center", marginTop: 6, fontStyle: "italic" }}>No refunds this period</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function SnapshotPill({ label, value, color, sub }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, display: "flex", alignItems: "center", gap: 8,
        padding: "5px 10px", borderRadius: 8,
        background: hov ? `${color}08` : C.bg,
        border: `1px solid ${hov ? color + "30" : C.borderLight}`,
        transition: "all 0.15s", cursor: "default", minWidth: 0,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1, flexShrink: 0 }}>{value}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        {sub && <div style={{ fontSize: 8, color: C.textMut, lineHeight: 1.2, whiteSpace: "nowrap" }}>{sub}</div>}
      </div>
    </div>
  );
}

function HeroKPI({ delay, label, value, prefix = "", suffix = "", decimals = 0, trend, color }) {
  return (
    <div style={{ ...cardStyle(delay), padding: "12px 16px" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,52,98,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = ""; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ ...sectionLabel, fontSize: 10 }}>{label}</span>
        {trend != null && <TrendBadge value={trend} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1, animation: "dashCountUp 0.3s cubic-bezier(0.22,1,0.36,1) both" }}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div style={{ width: "100%", height: 4, borderRadius: 2, background: `${color}15`, marginTop: 10 }}>
        <div style={{ width: "60%", height: "100%", borderRadius: 2, background: color, opacity: 0.5, transformOrigin: "left", animation: `dashBarGrow 0.6s ${delay + 0.1}s cubic-bezier(0.22,1,0.36,1) both` }} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, color, delay }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 8,
      background: `${color}06`, border: `1px solid ${color}15`,
      textAlign: "center",
      animation: `dashScaleIn 0.3s ${delay}s cubic-bezier(0.22,1,0.36,1) both`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.2 }}>{label}</div>
    </div>
  );
}

// K9 Operations — Occupancy Report Page
// Detailed occupancy trends with timeframe selector and interactive chart.

import React, { useState, useEffect, useMemo, useCallback, useRef, startTransition } from "react";
import { C, todayStr, addDays } from "../../shared/theme";
import { I } from "../../shared/icons";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import { useDashboardMetrics } from "../../hooks/useDashboardMetrics";

/* ═══════════════════════════════════════════════════════════════════════════
   CSS — injected once
   ═══════════════════════════════════════════════════════════════════════════ */
const OCC_CSS = `
.occ-pill-track {
  position: relative;
  display: inline-flex;
  gap: 0;
  background: ${C.bg};
  border-radius: 6px;
  padding: 2px;
  border: 1px solid rgba(20,83,45,0.1);
}
.occ-pill-btn {
  position: relative;
  z-index: 1;
  padding: 3px 8px;
  border: none;
  background: transparent;
  color: ${C.textMut};
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  border-radius: 4px;
  transition: color 0.15s;
  white-space: nowrap;
}
.occ-pill-btn.active {
  color: #fff;
}
.occ-pill-slider {
  position: absolute;
  top: 2px;
  height: calc(100% - 4px);
  background: ${C.pri};
  border-radius: 4px;
  transition: left 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 0;
}
@keyframes occFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes calFadeInOcc {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
`;

let occCssInjected = false;
function injectOccCSS() {
  if (occCssInjected) return;
  occCssInjected = true;
  const style = document.createElement("style");
  style.textContent = OCC_CSS;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Timeframe config (no "Today" or "WTD" or "Lifetime")
   ═══════════════════════════════════════════════════════════════════════════ */
const RANGES = [
  { key: "past-week", label: "Past Week" },
  { key: "past-30",   label: "Past 30" },
  { key: "mtd",       label: "MTD" },
  { key: "qtd",       label: "QTD" },
  { key: "ytd",       label: "YTD" },
  { key: "custom",    label: "Custom" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */
const fmtDateLabel = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const fmtDateFull = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/* ═══════════════════════════════════════════════════════════════════════════
   AnimatedPillSelector — identical to DashboardPage pattern
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedPillSelector({ ranges, activeKey, onChange }) {
  const trackRef = useRef(null);
  const btnRefs = useRef({});
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const updateSlider = useCallback(() => {
    const btn = btnRefs.current[activeKey];
    const track = trackRef.current;
    if (btn && track) {
      const trackRect = track.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setSliderStyle({
        left: btnRect.left - trackRect.left,
        width: btnRect.width,
      });
      if (!ready) setReady(true);
    }
  }, [activeKey, ready]);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(updateSlider));
  }, [activeKey, updateSlider]);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(updateSlider));
  }, []);

  return (
    <div className="occ-pill-track" ref={trackRef}>
      <div className="occ-pill-slider" style={{ left: sliderStyle.left, width: sliderStyle.width, opacity: ready ? 1 : 0 }} />
      {ranges.map(r => (
        <button
          key={r.key}
          ref={el => btnRefs.current[r.key] = el}
          className={`occ-pill-btn${r.key === activeKey ? " active" : ""}`}
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DateRangePicker — inline calendar for custom range
   ═══════════════════════════════════════════════════════════════════════════ */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DateRangePicker({ customFrom, customTo, setCustomFrom, setCustomTo }) {
  const today = todayStr();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [hovered, setHovered] = useState(null);
  const labelStyle = { fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" };

  const presets = [
    { label: "Last 7 days", fn: () => { setCustomFrom(addDays(today, -6)); setCustomTo(today); } },
    { label: "Last 14 days", fn: () => { setCustomFrom(addDays(today, -13)); setCustomTo(today); } },
    { label: "Last 30 days", fn: () => { setCustomFrom(addDays(today, -29)); setCustomTo(today); } },
    { label: "Last 90 days", fn: () => { setCustomFrom(addDays(today, -89)); setCustomTo(today); } },
  ];

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const handleDayClick = (day) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!customFrom || (customFrom && customTo)) {
      setCustomFrom(dateStr);
      setCustomTo("");
    } else {
      if (dateStr < customFrom) { setCustomFrom(dateStr); }
      else { setCustomTo(dateStr); }
    }
  };

  const isInRange = (day) => {
    if (!day) return false;
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const end = customTo || hovered;
    if (!customFrom || !end) return false;
    return dateStr >= customFrom && dateStr <= end;
  };

  const isStart = (day) => {
    if (!day || !customFrom) return false;
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` === customFrom;
  };
  const isEnd = (day) => {
    if (!day || !customTo) return false;
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` === customTo;
  };
  const isFuture = (day) => {
    if (!day) return false;
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` > today;
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div style={{
      animation: "calFadeInOcc 0.2s ease-out",
      background: "white", borderRadius: 10, border: `1px solid ${C.border}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
      padding: 12, width: 260,
    }}>
      {/* Presets */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {presets.map(p => (
          <button key={p.label} onClick={p.fn} style={{
            padding: "3px 8px", fontSize: 9, fontWeight: 600, borderRadius: 4,
            border: `1px solid ${C.border}`, background: C.bg, color: C.textMut,
            cursor: "pointer", fontFamily: "inherit",
          }}>{p.label}</button>
        ))}
      </div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <button onClick={prevMonth} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: C.textMut, padding: "2px 6px" }}>‹</button>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: C.textMut, padding: "2px 6px" }}>›</button>
      </div>
      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, marginBottom: 2 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 8, fontWeight: 700, color: C.textMut, padding: "2px 0" }}>{d}</div>)}
      </div>
      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const inRange = isInRange(day);
          const start = isStart(day);
          const end = isEnd(day);
          const future = isFuture(day);
          return (
            <div key={i}
              onClick={() => !future && handleDayClick(day)}
              onMouseEnter={() => { if (customFrom && !customTo) { const ds = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; setHovered(ds); } }}
              onMouseLeave={() => setHovered(null)}
              style={{
                textAlign: "center", fontSize: 10, padding: "4px 0", cursor: future ? "default" : "pointer",
                fontWeight: start || end ? 700 : 500,
                color: future ? "#D1D5DB" : (start || end) ? "#fff" : inRange ? C.pri : C.text,
                background: (start || end) ? C.pri : inRange ? `${C.pri}15` : "transparent",
                borderRadius: start ? "4px 0 0 4px" : end ? "0 4px 4px 0" : 0,
              }}
            >{day}</div>
          );
        })}
      </div>
      {/* Selected range display */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>From</div>
          <div style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid ${customFrom ? C.pri : C.border}`, background: customFrom ? `${C.pri}08` : C.bg, fontSize: 10, fontWeight: 600, color: customFrom ? C.text : C.textMut, textAlign: "center" }}>
            {customFrom ? fmtDateLabel(customFrom) : "Start"}
          </div>
        </div>
        <span style={{ fontSize: 9, color: C.textMut }}>→</span>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>To</div>
          <div style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid ${customTo ? C.pri : C.border}`, background: customTo ? `${C.pri}08` : C.bg, fontSize: 10, fontWeight: 600, color: customTo ? C.text : C.textMut, textAlign: "center" }}>
            {customTo ? fmtDateLabel(customTo) : "End"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Custom Occupancy Chart — wraps InteractiveLineChart with %-based y-axis
   ═══════════════════════════════════════════════════════════════════════════ */
function OccupancyChart({ chartData, dateLabels, animEpoch, height = 300 }) {
  const containerRef = useRef(null);

  // Scale values: InteractiveLineChart shows $ on y-axis.
  // We render a custom y-axis overlay and hide the chart's built-in one.
  // The chart max will be driven by data — we pass data as-is (0-100 values).
  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Percentage Y-axis overlay */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 28, width: 50, zIndex: 2,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "20px 0 0 0", background: "white",
      }}>
        {[100, 75, 50, 25, 0].map(v => (
          <span key={v} style={{
            fontSize: 9, fontWeight: 500, color: "#8B95A5",
            fontFamily: "'Outfit', sans-serif", textAlign: "right",
            paddingRight: 6, lineHeight: 1,
          }}>{v}%</span>
        ))}
      </div>
      <InteractiveLineChart
        chartData={chartData}
        color={C.pri}
        height={height}
        id="occupancy-chart"
        animationEpoch={animEpoch}
        dateLabels={dateLabels}
        useRawPoints={true}
        lineType="linear"
        solidFill={true}
        fillColor={C.pri}
        fillOpacity={0.10}
        showDots={true}
        dotRadius={2}
      />
      {/* Custom hover tooltip overlay — percentage-aware */}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   StatCard — summary stat with optional subtext
   ═══════════════════════════════════════════════════════════════════════════ */
function StatCard({ label, value, sub, color = C.text }) {
  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)",
      padding: "14px 16px", flex: 1, minWidth: 120,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)",
      animation: "occFadeIn 0.3s ease-out",
    }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, fontWeight: 500, color: C.textMut, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OccupancyReportPage
   ═══════════════════════════════════════════════════════════════════════════ */
export default function OccupancyReportPage({ nav, locationId, refreshOptions }) {
  useEffect(() => { injectOccCSS(); }, []);

  const [range, setRange] = useState("past-30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [animEpoch, setAnimEpoch] = useState(0);
  const today = todayStr();
  const calRef = useRef(null);

  useEffect(() => { setAnimEpoch(e => e + 1); }, [range]);

  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const handleRangeChange = (key) => {
    startTransition(() => { setRange(key); });
    if (key === "custom") setShowCalendar(true);
    else setShowCalendar(false);
  };

  /* ─── Date range computation ──────────────────────────────────────── */
  const { dateFrom, dateTo, days } = useMemo(() => {
    const now = new Date();
    const end = today;
    let start;
    switch (range) {
      case "past-week": start = addDays(today, -6); break;
      case "mtd": start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; break;
      case "past-30": start = addDays(today, -30); break;
      case "qtd": { const qm = Math.floor(now.getMonth() / 3) * 3; start = `${now.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`; break; }
      case "ytd": start = `${now.getFullYear()}-01-01`; break;
      case "custom": start = customFrom || today; break;
      default: start = addDays(today, -30);
    }
    const to = range === "custom" && customTo ? customTo : end;
    const d1 = new Date(start + "T00:00:00");
    const d2 = new Date(to + "T00:00:00");
    const dayCount = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    return { dateFrom: start, dateTo: to, days: dayCount };
  }, [range, today, customFrom, customTo]);

  /* ─── Fetch daily metrics ────────────────────────────────────────── */
  const { dailyRows, loading } = useDashboardMetrics(
    locationId, dateFrom, dateTo, null, null, refreshOptions
  );

  /* ─── Chart data from daily rows ─── */
  const { chartData, dateLabelsArr, avgOcc, peakOcc, peakDate, lowOcc, lowDate } = useMemo(() => {
    if (!dailyRows || dailyRows.length === 0) return {
      chartData: [], dateLabelsArr: [],
      avgOcc: 0, peakOcc: 0, peakDate: "", lowOcc: 0, lowDate: "",
    };

    let sum = 0, peak = -1, low = 101, peakD = "", lowD = "";
    const cd = dailyRows.map(r => {
      const val = Math.min(100, Math.max(0, Number(r.occupancy_pct) || 0));
      sum += val;
      if (val > peak) { peak = val; peakD = r.metric_date; }
      if (val < low) { low = val; lowD = r.metric_date; }
      return {
        date: r.metric_date,
        label: fmtDateLabel(r.metric_date),
        value: val,
      };
    });

    return {
      chartData: cd,
      dateLabelsArr: dailyRows.map(r => r.metric_date),
      avgOcc: Math.round(sum / dailyRows.length),
      peakOcc: peak >= 0 ? peak : 0,
      peakDate: peakD,
      lowOcc: low <= 100 ? low : 0,
      lowDate: lowD,
    };
  }, [dailyRows]);

  return (
    <div style={{
      minHeight: "100vh", background: "#FAFAF9",
      fontFamily: "'Outfit', sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: "16px 20px 12px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: `1px solid ${C.border}`,
        background: "white",
      }}>
        <button onClick={() => nav && nav("dashboard")} style={{
          border: "none", background: "none", cursor: "pointer", padding: "4px 8px",
          display: "flex", alignItems: "center", gap: 4,
          color: C.textMut, fontSize: 12, fontWeight: 600, fontFamily: "inherit",
          borderRadius: 6, transition: "background 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Dashboard
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>Occupancy Report</h1>
        </div>
      </div>

      {/* ── Timeframe selector ── */}
      <div style={{
        padding: "10px 20px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        background: "white", borderBottom: `1px solid ${C.border}`,
      }}>
        <AnimatedPillSelector ranges={RANGES} activeKey={range} onChange={handleRangeChange} />
        <span style={{ fontSize: 10, color: C.textMut, fontWeight: 500 }}>
          {fmtDateLabel(dateFrom)} — {fmtDateLabel(dateTo)} · {days} day{days !== 1 ? "s" : ""}
        </span>
        {/* Custom calendar dropdown */}
        {range === "custom" && (
          <div ref={calRef} style={{ position: "relative" }}>
            <button onClick={() => setShowCalendar(s => !s)} style={{
              padding: "3px 8px", fontSize: 9, fontWeight: 600, borderRadius: 4,
              border: `1px solid ${C.border}`, background: C.bg, color: C.pri,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              {showCalendar ? "Close" : "Pick Dates"}
            </button>
            {showCalendar && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, marginTop: 4 }}>
                <DateRangePicker customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Summary stat cards */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatCard label="Average Occupancy" value={`${avgOcc}%`} />
          <StatCard label="Peak Occupancy" value={`${peakOcc}%`} sub={peakDate ? fmtDateFull(peakDate) : "—"} color={C.pri} />
          <StatCard label="Low Occupancy" value={`${lowOcc}%`} sub={lowDate ? fmtDateFull(lowDate) : "—"} />
        </div>

        {/* Chart */}
        <div style={{
          background: "white", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)",
          padding: "16px", flex: 1, minHeight: 300, display: "flex", flexDirection: "column",
          animation: "occFadeIn 0.3s ease-out",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 8 }}>Occupancy Trend</div>
          {loading && chartData.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8B95A5", fontSize: 12 }}>
              Loading occupancy data...
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8B95A5", fontSize: 12 }}>
              No data for this period
            </div>
          ) : (
            <OccupancyChart
              chartData={chartData}
              dateLabels={dateLabelsArr}
              animEpoch={animEpoch}
            />
          )}
        </div>
      </div>
    </div>
  );
}

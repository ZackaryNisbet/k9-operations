// K9 Operations Lite — Inventory Report Page
// Analytics and reporting for inventory data.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, addDays, fmtDate } from "../../shared/theme";
import { Btn, Card } from "../../shared/ui";
import { I } from "../../shared/icons";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const fmtCurrency = (v) => {
  if (v == null || isNaN(v)) return "$0.00";
  return "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtCurrencyShort = (v) => {
  if (v == null || isNaN(v)) return "$0";
  const n = Number(v);
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
};

const getStartOfWeek = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day;
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
};

function getDogDaysForWeek(reservations, weekStart) {
  if (!reservations || !reservations.length) return 0;
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  let totalDogDays = 0;
  const validRes = reservations.filter(r => r.status !== "cancelled");
  for (const res of validRes) {
    const checkIn = new Date(res.checkIn + "T00:00:00");
    const checkOut = new Date(res.checkOut + "T00:00:00");
    const overlapStart = Math.max(checkIn.getTime(), start.getTime());
    const overlapEnd = Math.min(checkOut.getTime(), end.getTime());
    if (overlapEnd >= overlapStart) {
      const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
      totalDogDays += days;
    }
  }
  return totalDogDays;
}

const getTimeframeDates = (tf, customFrom, customTo) => {
  const today = todayStr();
  const d = new Date(today + "T00:00:00");
  let start, end;
  end = today;

  if (tf === "WTD") {
    const day = d.getDay();
    const diff = d.getDate() - day;
    start = new Date(d.setDate(diff)).toISOString().split("T")[0];
    d.setDate(d.getDate() + day);
  } else if (tf === "MTD") {
    start = today.substring(0, 7) + "-01";
  } else if (tf === "QTD") {
    const m = d.getMonth();
    const qStartMonth = Math.floor(m / 3) * 3;
    start = `${d.getFullYear()}-${String(qStartMonth + 1).padStart(2, "0")}-01`;
  } else if (tf === "YTD") {
    start = `${d.getFullYear()}-01-01`;
  } else if (tf === "Custom") {
    start = customFrom || today;
    end = customTo || today;
  } else {
    start = addDays(today, -30);
  }

  return { start, end };
};

/* ─── SVG Line Chart ───────────────────────────────────────────────────────── */
function LineChart({ data, color = C.pri, height = 180, label = "Value", formatY = fmtCurrencyShort }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  if (!data || data.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13 }}>
        Not enough data for chart
      </div>
    );
  }

  const W = 560, H = height;
  const padL = 56, padR = 20, padT = 16, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = data.map((d) => d.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const toX = (i) => padL + (i / (data.length - 1)) * plotW;
  const toY = (v) => padT + plotH - ((v - minV) / range) * plotH;

  const pts = data.map((d, i) => [toX(i), toY(d.value)]);
  const pathD = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const areaD = `${pathD} L${pts[pts.length - 1][0]},${padT + plotH} L${pts[0][0]},${padT + plotH} Z`;

  const yTicks = 4;
  const yStep = range / yTicks;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height, display: "block", overflow: "visible" }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={`lg-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = padT + (i / yTicks) * plotH;
          const v = maxV - i * yStep;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={C.borderLight} strokeWidth="1" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill={C.textMut} fontFamily="Outfit, sans-serif">
                {formatY(v)}
              </text>
            </g>
          );
        })}

        {/* X axis labels */}
        {data.map((d, i) => {
          if (data.length <= 8 || i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) {
            return (
              <text
                key={i}
                x={toX(i)}
                y={H - 6}
                textAnchor="middle"
                fontSize="9"
                fill={C.textMut}
                fontFamily="Outfit, sans-serif"
              >
                {d.label || d.date || ""}
              </text>
            );
          }
          return null;
        })}

        {/* Area fill */}
        <path d={areaD} fill={`url(#lg-${label})`} />

        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Points + hover targets */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p[0]}
              cy={p[1]}
              r={8}
              fill="transparent"
              onMouseEnter={(e) => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, d: data[i] });
              }}
            />
            <circle cx={p[0]} cy={p[1]} r={3.5} fill={color} stroke={C.surface} strokeWidth="1.5" />
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltip.x + 12, 420),
            top: Math.max(tooltip.y - 40, 4),
            background: C.text,
            color: "#fff",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            fontFamily: "Outfit, sans-serif",
            fontWeight: 600,
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ opacity: 0.7, fontSize: 10, marginBottom: 2 }}>{tooltip.d.label || tooltip.d.date}</div>
          {formatY(tooltip.d.value)}
        </div>
      )}
    </div>
  );
}

/* ─── SVG Horizontal Bar Chart ─────────────────────────────────────────────── */
function HBarChart({ data, color = C.pri, height = 300, formatX = (v) => v.toFixed(1), unit = "" }) {
  const [hovIdx, setHovIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13 }}>
        No data available
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 0.01);
  const rowH = Math.max(28, Math.floor(height / data.length) - 4);
  const labelW = 160;
  const barMaxW = 260;
  const totalH = data.length * (rowH + 6) + 10;

  return (
    <div style={{ overflowY: "auto", maxHeight: height + 20 }}>
      {data.map((d, i) => {
        const barW = (d.value / maxVal) * barMaxW;
        const isHov = hovIdx === i;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 5,
              borderRadius: 6,
              padding: "3px 6px",
              background: isHov ? C.surfaceHover : "transparent",
              transition: "background 0.15s",
              cursor: "default",
            }}
            onMouseEnter={() => setHovIdx(i)}
            onMouseLeave={() => setHovIdx(null)}
          >
            <div
              style={{
                width: labelW,
                fontSize: 12,
                color: C.text,
                fontFamily: "Outfit, sans-serif",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
                paddingRight: 8,
              }}
              title={d.label}
            >
              {d.label}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  height: rowH - 8,
                  width: barW,
                  background: isHov ? (color === C.pri ? C.priL : color) : color,
                  borderRadius: 4,
                  transition: "width 0.5s cubic-bezier(0.22,1,0.36,1), background 0.15s",
                  minWidth: 2,
                }}
              />
              <span style={{ fontSize: 11, color: C.textSec, fontFamily: "Outfit, sans-serif", whiteSpace: "nowrap" }}>
                {formatX(d.value)}{unit}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── SVG Donut Chart ──────────────────────────────────────────────────────── */
function DonutChart({ data, height = 200 }) {
  const [hovIdx, setHovIdx] = useState(null);

  const COLORS = [C.pri, C.acc, C.suc, C.info, C.warn, C.priL, C.accDk, "#7B4EA6", "#2C9B8E", "#B84D7F"];

  if (!data || data.length === 0) {
    return (
      <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13 }}>
        No data available
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13 }}>No data</div>;

  const cx = 90, cy = 90, R = 70, r = 42;
  let startAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const frac = d.value / total;
    const angle = frac * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle), y2 = cy + R * Math.sin(endAngle);
    const ix1 = cx + r * Math.cos(startAngle), iy1 = cy + r * Math.sin(startAngle);
    const ix2 = cx + r * Math.cos(endAngle), iy2 = cy + r * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${ix2},${iy2} A${r},${r},0,${large},0,${ix1},${iy1} Z`;
    const midAngle = startAngle + angle / 2;
    const slice = { path, color: COLORS[i % COLORS.length], label: d.label, value: d.value, frac, midAngle };
    startAngle = endAngle;
    return slice;
  });

  const hov = hovIdx != null ? slices[hovIdx] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg viewBox="0 0 180 180" style={{ width: Math.min(height, 180), height: Math.min(height, 180), flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path
            key={i}
            d={s.path}
            fill={s.color}
            opacity={hovIdx == null || hovIdx === i ? 1 : 0.55}
            style={{ cursor: "pointer", transition: "opacity 0.15s" }}
            onMouseEnter={() => setHovIdx(i)}
            onMouseLeave={() => setHovIdx(null)}
          />
        ))}
        <circle cx={cx} cy={cy} r={r - 1} fill={C.surface} />
        {hov ? (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize="9" fill={C.textSec} fontFamily="Outfit, sans-serif">
              {hov.label.length > 14 ? hov.label.substring(0, 13) + "…" : hov.label}
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize="12" fontWeight="700" fill={C.text} fontFamily="Outfit, sans-serif">
              {(hov.frac * 100).toFixed(1)}%
            </text>
            <text x={cx} y={cy + 22} textAnchor="middle" fontSize="9" fill={C.textSec} fontFamily="Outfit, sans-serif">
              {fmtCurrencyShort(hov.value)}
            </text>
          </>
        ) : (
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fill={C.textSec} fontFamily="Outfit, sans-serif">
            Total
          </text>
        )}
      </svg>

      <div style={{ flex: 1, minWidth: 140 }}>
        {slices.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 5,
              cursor: "default",
              opacity: hovIdx == null || hovIdx === i ? 1 : 0.5,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={() => setHovIdx(i)}
            onMouseLeave={() => setHovIdx(null)}
          >
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: C.text, fontFamily: "Outfit, sans-serif", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.label}
            </span>
            <span style={{ fontSize: 11, color: C.textSec, fontFamily: "Outfit, sans-serif", whiteSpace: "nowrap" }}>
              {(s.frac * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Metric Card ──────────────────────────────────────────────────────────── */
function MetricCard({ label, value, sub, icon, color = C.pri, bgColor, animDelay = 0 }) {
  return (
    <div
      className="dash-card"
      style={{
        background: bgColor || C.surface,
        borderRadius: 15,
        border: `1.5px solid ${C.border}`,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        animationDelay: `${animDelay}ms`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: C.textSec, fontFamily: "Outfit, sans-serif", fontWeight: 500, letterSpacing: "0.03em", textTransform: "uppercase" }}>
          {label}
        </div>
        {icon && (
          <div style={{ color, opacity: 0.75 }}>{icon}</div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "Outfit, sans-serif", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: C.textSec, fontFamily: "Outfit, sans-serif" }}>{sub}</div>
      )}
    </div>
  );
}

/* ─── Section Header ───────────────────────────────────────────────────────── */
function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "Outfit, sans-serif" }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: C.textSec, fontFamily: "Outfit, sans-serif", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/* ─── Loading Skeleton ─────────────────────────────────────────────────────── */
function Skeleton({ h = 20, w = "100%", radius = 6 }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${C.borderLight} 25%, ${C.surfaceHover} 50%, ${C.borderLight} 75%)`,
        backgroundSize: "200% 100%",
        animation: "dashShimmer 1.4s infinite linear",
      }}
    />
  );
}

/* ─── Empty State ──────────────────────────────────────────────────────────── */
function EmptyState({ message = "No data available for this timeframe" }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: C.textMut, fontFamily: "Outfit, sans-serif" }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>
        <I.BarChart />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>No Data Yet</div>
      <div style={{ fontSize: 13 }}>{message}</div>
    </div>
  );
}

/* ─── CSS Injection ─────────────────────────────────────────────────────────── */
const REPORT_CSS = `
@keyframes dashSlideIn {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
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
  box-shadow: 0 8px 28px rgba(20,83,45,0.10);
  transform: translateY(-2px);
}
.inv-pill {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  font-family: 'Outfit', sans-serif;
}
.inv-pill-active {
  background: ${C.pri};
  color: #fff;
  border-color: ${C.pri};
}
.inv-pill-inactive {
  background: ${C.surface};
  color: ${C.textSec};
  border-color: ${C.border};
}
.inv-pill-inactive:hover {
  background: ${C.priLt};
  color: ${C.pri};
  border-color: ${C.priLt};
}
`;

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function InventoryReportPage({ data, save, nav, profile, addGlobalToast }) {
  const locationId = data?.settings?.location_id || profile?.location_id || null;

  // ── Timeframe state ──────────────────────────────────────────────────────
  const [tf, setTf] = useState("MTD");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ── Data state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [counts, setCounts] = useState([]);
  const [adhoc, setAdhoc] = useState([]);
  const [depletionRates, setDepletionRates] = useState([]);
  const [error, setError] = useState(null);

  // ── CSS injection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("inv-report-css")) return;
    const el = document.createElement("style");
    el.id = "inv-report-css";
    el.textContent = REPORT_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  // ── Derived timeframe dates ───────────────────────────────────────────────
  const { start: tfStart, end: tfEnd } = useMemo(
    () => getTimeframeDates(tf, customFrom, customTo),
    [tf, customFrom, customTo]
  );

  // ── Data fetching ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!locationId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // Load catalog
      const { data: catData, error: catErr } = await supabase
        .from("inventory_catalog")
        .select("*")
        .eq("location_id", locationId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (catErr) throw catErr;
      setCatalog(catData || []);

      // Load snapshots within timeframe
      const { data: snapData, error: snapErr } = await supabase
        .from("inventory_snapshots")
        .select("*")
        .eq("location_id", locationId)
        .gte("week_start", tfStart)
        .lte("week_start", tfEnd)
        .order("week_start", { ascending: true });
      if (snapErr) throw snapErr;
      setSnapshots(snapData || []);

      if (snapData && snapData.length > 0) {
        const snapIds = snapData.map((s) => s.id);

        // Load counts for those snapshots
        const { data: countData, error: countErr } = await supabase
          .from("inventory_counts")
          .select("*")
          .in("snapshot_id", snapIds);
        if (countErr) throw countErr;
        setCounts(countData || []);

        // Load adhoc items
        const { data: adhocData, error: adhocErr } = await supabase
          .from("inventory_adhoc_items")
          .select("*")
          .in("snapshot_id", snapIds);
        if (adhocErr) throw adhocErr;
        setAdhoc(adhocData || []);
      } else {
        setCounts([]);
        setAdhoc([]);
      }

      // Load depletion rates
      const { data: depRateData, error: depErr } = await supabase
        .from("inventory_depletion_rates")
        .select("*")
        .eq("location_id", locationId)
        .gte("week_start", tfStart)
        .lte("week_start", tfEnd)
        .order("week_start", { ascending: true });
      if (depErr) console.error("Depletion rates load error:", depErr);
      setDepletionRates(depRateData || []);
    } catch (err) {
      console.error("InventoryReportPage load error:", err);
      setError(err.message || "Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, [locationId, tfStart, tfEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Computed metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (!snapshots.length || !counts.length) return null;

    // Build catalog lookup
    const catMap = {};
    catalog.forEach((c) => { catMap[c.id] = c; });

    // Get most recent snapshot
    const latestSnap = snapshots[snapshots.length - 1];
    const latestCounts = counts.filter((c) => c.snapshot_id === latestSnap?.id);

    // Total inventory value (latest snapshot)
    let totalValue = 0;
    latestCounts.forEach((c) => {
      const cat = catMap[c.catalog_item_id];
      if (cat) totalValue += (c.stock_count || 0) * (cat.unit_price || 0);
    });
    // Add adhoc from latest snapshot
    const latestAdhoc = adhoc.filter((a) => a.snapshot_id === latestSnap?.id);
    latestAdhoc.forEach((a) => { totalValue += (a.stock_count || 0) * (a.unit_price || 0); });

    // Cost per dog-day (using reservations data)
    const reservations = data?.reservations || [];
    const latestDogDays = getDogDaysForWeek(reservations, latestSnap?.week_start);
    const costPerDogDay = latestDogDays > 0 ? totalValue / latestDogDays : null;

    // Items below par
    let belowParCount = 0;
    latestCounts.forEach((c) => {
      const cat = catMap[c.catalog_item_id];
      if (cat && cat.par_level != null && (c.stock_count || 0) < cat.par_level) belowParCount++;
    });

    // Total active catalog items
    const totalItems = catalog.length;

    return { totalValue, costPerDogDay, belowParCount, totalItems, latestSnap, latestDogDays };
  }, [snapshots, counts, adhoc, catalog, data]);

  // ── Inventory value over time ─────────────────────────────────────────────
  const valueOverTime = useMemo(() => {
    if (!snapshots.length) return [];
    const catMap = {};
    catalog.forEach((c) => { catMap[c.id] = c; });

    return snapshots.map((snap) => {
      const snapCounts = counts.filter((c) => c.snapshot_id === snap.id);
      const snapAdhoc = adhoc.filter((a) => a.snapshot_id === snap.id);
      let total = 0;
      snapCounts.forEach((c) => {
        const cat = catMap[c.catalog_item_id];
        if (cat) total += (c.stock_count || 0) * (cat.unit_price || 0);
      });
      snapAdhoc.forEach((a) => { total += (a.stock_count || 0) * (a.unit_price || 0); });
      const d = new Date(snap.week_start + "T00:00:00");
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      return { date: snap.week_start, label, value: total };
    });
  }, [snapshots, counts, adhoc, catalog]);

  // ── Cost per dog-day over time ──────────────────────────────────────────────
  const costPerDogDayOverTime = useMemo(() => {
    return valueOverTime
      .map((d) => {
        // Find depletion rate entries for this week to get dog_days
        const weekRates = depletionRates.filter(r => r.week_start === d.date);
        const dogDays = weekRates.length > 0 ? weekRates[0].dog_days : 0;
        return dogDays > 0 ? { ...d, value: d.value / dogDays } : null;
      })
      .filter(Boolean);
  }, [valueOverTime, depletionRates]);

  // ── Depletion rate (top 15) ────────────────────────────────────────────────
  const depletionData = useMemo(() => {
    if (snapshots.length < 2) return [];
    const catMap = {};
    catalog.forEach((c) => { catMap[c.id] = c; });

    // Build per-item totals across all adjacent week pairs
    const depMap = {};
    for (let i = 1; i < snapshots.length; i++) {
      const prevSnap = snapshots[i - 1];
      const currSnap = snapshots[i];
      const prevCounts = counts.filter((c) => c.snapshot_id === prevSnap.id);
      const currCounts = counts.filter((c) => c.snapshot_id === currSnap.id);

      const prevMap = {};
      prevCounts.forEach((c) => { prevMap[c.catalog_item_id] = c.stock_count || 0; });
      currCounts.forEach((c) => {
        const prev = prevMap[c.catalog_item_id] ?? 0;
        const depletion = prev - (c.stock_count || 0);
        if (depletion > 0) {
          depMap[c.catalog_item_id] = (depMap[c.catalog_item_id] || 0) + depletion;
        }
      });
    }

    return Object.entries(depMap)
      .map(([id, val]) => ({ label: catMap[id]?.item_name || "Unknown", value: val }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [snapshots, counts, catalog]);

  // ── Depletion per dog-day ───────────────────────────────────────────────────
  const depletionPerDogDay = useMemo(() => {
    if (snapshots.length < 2) return [];
    const catMap = {};
    catalog.forEach((c) => { catMap[c.id] = c; });

    const depMap = {};
    let totalDogDays = 0;
    for (let i = 1; i < snapshots.length; i++) {
      const currSnap = snapshots[i];
      const prevCounts = counts.filter((c) => c.snapshot_id === snapshots[i - 1].id);
      const currCounts = counts.filter((c) => c.snapshot_id === currSnap.id);
      // Get dog-days from depletion_rates if available
      const weekRates = depletionRates.filter(r => r.week_start === currSnap.week_start);
      const weekDogDays = weekRates.length > 0 ? (weekRates[0].dog_days || 0) : 0;
      totalDogDays += weekDogDays;

      const prevMap = {};
      prevCounts.forEach((c) => { prevMap[c.catalog_item_id] = c.stock_count || 0; });
      currCounts.forEach((c) => {
        const prev = prevMap[c.catalog_item_id] ?? 0;
        const depletion = prev - (c.stock_count || 0);
        if (depletion > 0) {
          depMap[c.catalog_item_id] = (depMap[c.catalog_item_id] || 0) + depletion;
        }
      });
    }

    if (totalDogDays === 0) return [];

    return Object.entries(depMap)
      .map(([id, val]) => ({ label: catMap[id]?.item_name || "Unknown", value: +(val / totalDogDays).toFixed(4) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [snapshots, counts, catalog, depletionRates]);

  // ── Low stock alerts ───────────────────────────────────────────────────────
  const lowStockAlerts = useMemo(() => {
    if (!snapshots.length) return [];
    const catMap = {};
    catalog.forEach((c) => { catMap[c.id] = c; });
    const latestSnap = snapshots[snapshots.length - 1];
    const latestCounts = counts.filter((c) => c.snapshot_id === latestSnap?.id);

    return latestCounts
      .filter((c) => {
        const cat = catMap[c.catalog_item_id];
        return cat && cat.par_level != null && (c.stock_count || 0) < cat.par_level;
      })
      .map((c) => {
        const cat = catMap[c.catalog_item_id];
        return {
          name: cat.item_name,
          stock: c.stock_count || 0,
          par: cat.par_level,
          deficit: cat.par_level - (c.stock_count || 0),
          category: cat.category || "",
        };
      })
      .sort((a, b) => b.deficit - a.deficit);
  }, [snapshots, counts, catalog]);

  // ── Most consumed items (total depletion over timeframe) ───────────────────
  const mostConsumed = useMemo(() => depletionData, [depletionData]);

  // ── Category breakdown (by value, latest snapshot) ────────────────────────
  const categoryBreakdown = useMemo(() => {
    if (!snapshots.length) return [];
    const catMap = {};
    catalog.forEach((c) => { catMap[c.id] = c; });
    const latestSnap = snapshots[snapshots.length - 1];
    const latestCounts = counts.filter((c) => c.snapshot_id === latestSnap?.id);

    const catValueMap = {};
    latestCounts.forEach((c) => {
      const cat = catMap[c.catalog_item_id];
      if (!cat) return;
      const val = (c.stock_count || 0) * (cat.unit_price || 0);
      const key = cat.category || "Uncategorized";
      catValueMap[key] = (catValueMap[key] || 0) + val;
    });

    return Object.entries(catValueMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [snapshots, counts, catalog]);

  // ── Depletion rate intelligence ─────────────────────────────────────────────
  const depletionIntelligence = useMemo(() => {
    if (!depletionRates.length) return [];
    const catMap = {};
    catalog.forEach(c => { catMap[c.id] = c; });

    // Group by catalog_item_id
    const byItem = {};
    depletionRates.forEach(r => {
      if (!byItem[r.catalog_item_id]) byItem[r.catalog_item_id] = [];
      byItem[r.catalog_item_id].push(r);
    });

    return Object.entries(byItem)
      .filter(([, rows]) => rows.length >= 2)
      .map(([itemId, rows]) => {
        const cat = catMap[itemId];
        if (!cat) return null;
        const sorted = [...rows].sort((a, b) => a.week_start.localeCompare(b.week_start));
        const avgDepletion = sorted.reduce((s, r) => s + (r.depletion || 0), 0) / sorted.length;
        const avgRatePerDogDay = sorted.filter(r => r.rate_per_dog_day != null).reduce((s, r) => s + Number(r.rate_per_dog_day), 0) / Math.max(sorted.filter(r => r.rate_per_dog_day != null).length, 1);
        const avgDogDays = sorted.reduce((s, r) => s + (r.dog_days || 0), 0) / sorted.length;

        // Trend: compare last 2 vs earlier
        const mid = Math.floor(sorted.length / 2);
        const recentAvg = sorted.slice(mid).reduce((s, r) => s + (r.depletion || 0), 0) / Math.max(sorted.length - mid, 1);
        const olderAvg = sorted.slice(0, mid).reduce((s, r) => s + (r.depletion || 0), 0) / Math.max(mid, 1);
        const trend = recentAvg > olderAvg * 1.05 ? "up" : recentAvg < olderAvg * 0.95 ? "down" : "stable";

        const weeks = sorted.length;
        const confidence = weeks >= 9 ? "High" : weeks >= 4 ? "Medium" : "Low";
        const recommendedPar = Math.ceil(avgRatePerDogDay * avgDogDays * 1.2);

        return {
          itemId,
          name: cat.item_name,
          category: cat.category,
          avgWeeklyUsage: +avgDepletion.toFixed(1),
          ratePerDogDay: +avgRatePerDogDay.toFixed(4),
          trend,
          confidence,
          weeks,
          recommendedPar: isFinite(recommendedPar) ? recommendedPar : null,
          currentPar: cat.par_level,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.avgWeeklyUsage - a.avgWeeklyUsage);
  }, [depletionRates, catalog]);

  // ── No data flag ──────────────────────────────────────────────────────────
  const hasNoData = !loading && snapshots.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Outfit, sans-serif" }}>

      {/* ── Page Header ── */}
      <div style={{
        background: C.surface,
        borderBottom: `1.5px solid ${C.border}`,
        padding: "20px 28px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "Outfit, sans-serif" }}>
            Inventory Analytics
          </div>
          <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>
            Track inventory value, depletion, and cost efficiency
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`,
              background: C.surface, color: C.textSec, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "Outfit, sans-serif",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onClick={loadData}
            title="Refresh data"
          >
            <I.RefreshCw />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Timeframe Pills ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 24, flexWrap: "wrap",
        }}>
          {["WTD", "MTD", "QTD", "YTD", "Custom"].map((t) => (
            <button
              key={t}
              className={`inv-pill ${tf === t ? "inv-pill-active" : "inv-pill-inactive"}`}
              onClick={() => setTf(t)}
            >
              {t}
            </button>
          ))}

          {tf === "Custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`,
                  fontSize: 13, fontFamily: "Outfit, sans-serif", color: C.text,
                  background: C.surface, outline: "none",
                }}
              />
              <span style={{ color: C.textMut, fontSize: 13 }}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`,
                  fontSize: 13, fontFamily: "Outfit, sans-serif", color: C.text,
                  background: C.surface, outline: "none",
                }}
              />
            </div>
          )}

          <div style={{ marginLeft: "auto", fontSize: 12, color: C.textMut }}>
            {tfStart} – {tfEnd}
          </div>
        </div>

        {/* ── Error State ── */}
        {error && (
          <div style={{
            background: C.danLt, border: `1.5px solid ${C.dan}`, borderRadius: 10,
            padding: "12px 16px", marginBottom: 20, color: C.dan,
            fontSize: 13, fontFamily: "Outfit, sans-serif",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <I.AlertTriangle />
            {error}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="dash-card" style={{ height: 100 }}>
                  <Skeleton h={14} w="60%" radius={4} />
                  <div style={{ marginTop: 12 }}><Skeleton h={28} w="80%" radius={6} /></div>
                  <div style={{ marginTop: 8 }}><Skeleton h={12} w="40%" radius={4} /></div>
                </div>
              ))}
            </div>
            <div className="dash-card" style={{ height: 220, marginBottom: 20 }}>
              <Skeleton h={18} w="30%" radius={6} />
              <div style={{ marginTop: 16 }}><Skeleton h={160} w="100%" radius={8} /></div>
            </div>
          </div>
        )}

        {/* ── No data (post-load) ── */}
        {!loading && hasNoData && (
          <div className="dash-card" style={{ textAlign: "center", padding: "64px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3, display: "flex", justifyContent: "center" }}>
              <I.ShoppingCart />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "Outfit, sans-serif", marginBottom: 8 }}>
              No Inventory Data Yet
            </div>
            <div style={{ fontSize: 13, color: C.textSec, maxWidth: 380, margin: "0 auto" }}>
              Complete your first inventory count to see analytics, trends, and cost insights here.
            </div>
          </div>
        )}

        {/* ── Dashboard Content ── */}
        {!loading && !hasNoData && (
          <>
            {/* ── Key Metric Cards ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 28,
            }}>
              <MetricCard
                label="Total Inventory Value"
                value={fmtCurrency(metrics?.totalValue ?? 0)}
                sub={`As of ${fmtDate(metrics?.latestSnap?.week_start) || "latest snapshot"}`}
                icon={<I.DollarSign />}
                color={C.pri}
                animDelay={0}
              />
              <MetricCard
                label="Cost Per Dog-Day"
                value={metrics?.costPerDogDay != null ? fmtCurrency(metrics.costPerDogDay) : "—"}
                sub={metrics?.latestDogDays ? `${metrics.latestDogDays} dog-days in latest week` : "No dog-day data available"}
                icon={<I.TrendingUp />}
                color={C.acc}
                animDelay={60}
              />
              <MetricCard
                label="Items Below Par"
                value={metrics?.belowParCount ?? 0}
                sub={metrics?.belowParCount > 0 ? "Require attention" : "All items at or above par"}
                icon={<I.AlertTriangle />}
                color={metrics?.belowParCount > 0 ? C.warn : C.suc}
                bgColor={metrics?.belowParCount > 0 ? C.warnLt : undefined}
                animDelay={120}
              />
              <MetricCard
                label="Total Items Tracked"
                value={metrics?.totalItems ?? catalog.length}
                sub="Active catalog items"
                icon={<I.Clipboard />}
                color={C.info}
                animDelay={180}
              />
            </div>

            {/* ── Chart Row 1: Value over time ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div className="dash-card" style={{ animationDelay: "200ms" }}>
                <SectionHeader
                  title="Inventory Value Over Time"
                  sub="Total stock value per weekly snapshot"
                />
                {valueOverTime.length >= 2 ? (
                  <LineChart data={valueOverTime} color={C.pri} height={180} label="inv-value" formatY={fmtCurrencyShort} />
                ) : (
                  <EmptyState message="Need at least 2 snapshots to show trend" />
                )}
              </div>

              <div className="dash-card" style={{ animationDelay: "240ms" }}>
                <SectionHeader
                  title="Cost Per Dog-Day Trend"
                  sub="Inventory cost divided by dog-days per week"
                />
                {costPerDogDayOverTime.length >= 2 ? (
                  <LineChart data={costPerDogDayOverTime} color={C.acc} height={180} label="cost-dog" formatY={fmtCurrencyShort} />
                ) : (
                  <EmptyState message="Need at least 2 snapshots with dog-day data to show trend" />
                )}
              </div>
            </div>

            {/* ── Chart Row 2: Depletion ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div className="dash-card" style={{ animationDelay: "280ms" }}>
                <SectionHeader
                  title="Depletion Rate"
                  sub="Top 15 items by units consumed (week-over-week)"
                />
                {depletionData.length > 0 ? (
                  <HBarChart
                    data={depletionData}
                    color={C.pri}
                    height={360}
                    formatX={(v) => v.toFixed(0)}
                    unit=" units"
                  />
                ) : (
                  <EmptyState message="Need 2+ snapshots to calculate depletion" />
                )}
              </div>

              <div className="dash-card" style={{ animationDelay: "320ms" }}>
                <SectionHeader
                  title="Depletion Per Dog-Day"
                  sub="Consumption normalized by dog-days"
                />
                {depletionPerDogDay.length > 0 ? (
                  <HBarChart
                    data={depletionPerDogDay}
                    color={C.acc}
                    height={360}
                    formatX={(v) => v.toFixed(4)}
                    unit="/dog-day"
                  />
                ) : (
                  <EmptyState message="Need 2+ snapshots with dog-day data" />
                )}
              </div>
            </div>

            {/* ── Depletion Rate Intelligence ── */}
            {depletionIntelligence.length > 0 && (
              <div className="dash-card" style={{ marginBottom: 20, animationDelay: "340ms" }}>
                <SectionHeader
                  title="Depletion Rate Intelligence"
                  sub={`Per-item depletion analysis with ${depletionIntelligence.length} items tracked`}
                />
                <div style={{ overflowX: "auto" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 110px 60px 80px 90px 90px",
                    gap: 8,
                    padding: "8px 12px",
                    background: C.bg,
                    borderRadius: 8,
                    marginBottom: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.textMut,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    minWidth: 700,
                  }}>
                    <div>Item</div>
                    <div style={{ textAlign: "right" }}>Avg/Week</div>
                    <div style={{ textAlign: "right" }}>Per Dog-Day</div>
                    <div style={{ textAlign: "center" }}>Trend</div>
                    <div style={{ textAlign: "center" }}>Confidence</div>
                    <div style={{ textAlign: "right" }}>Rec. Par</div>
                    <div style={{ textAlign: "right" }}>Current Par</div>
                  </div>

                  {depletionIntelligence.map((item, i) => {
                    const confColor = item.confidence === "High" ? C.suc : item.confidence === "Medium" ? C.warn : C.textMut;
                    const confBg = item.confidence === "High" ? C.sucLt : item.confidence === "Medium" ? C.warnLt : C.bg;
                    const trendIcon = item.trend === "up" ? "\u2191" : item.trend === "down" ? "\u2193" : "\u2192";
                    const trendColor = item.trend === "up" ? C.dan : item.trend === "down" ? C.suc : C.textMut;

                    return (
                      <div
                        key={item.itemId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px 110px 60px 80px 90px 90px",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 8,
                          marginBottom: 2,
                          background: i % 2 === 0 ? C.surface : C.bg,
                          alignItems: "center",
                          fontSize: 13,
                          color: C.text,
                          minWidth: 700,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          {item.category && <div style={{ fontSize: 11, color: C.textMut }}>{item.category}</div>}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 600 }}>{item.avgWeeklyUsage}</div>
                        <div style={{ textAlign: "right", fontWeight: 600, color: C.pri }}>{item.ratePerDogDay}</div>
                        <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: trendColor }}>{trendIcon}</div>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: 20,
                            background: confBg,
                            color: confColor,
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            {item.confidence}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 700, color: item.recommendedPar != null ? C.info : C.textMut }}>
                          {item.recommendedPar ?? "\u2014"}
                        </div>
                        <div style={{ textAlign: "right", color: C.textSec }}>
                          {item.currentPar ?? "\u2014"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Chart Row 3: Category breakdown + Most Consumed ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div className="dash-card" style={{ animationDelay: "360ms" }}>
                <SectionHeader
                  title="Value by Category"
                  sub="Current inventory value distribution"
                />
                {categoryBreakdown.length > 0 ? (
                  <DonutChart data={categoryBreakdown} height={200} />
                ) : (
                  <EmptyState message="No categorized inventory data" />
                )}
              </div>

              <div className="dash-card" style={{ animationDelay: "400ms" }}>
                <SectionHeader
                  title="Most Consumed Items"
                  sub={`Total depletion over selected period`}
                />
                {mostConsumed.length > 0 ? (
                  <HBarChart
                    data={mostConsumed}
                    color={C.info}
                    height={300}
                    formatX={(v) => v.toFixed(0)}
                    unit=" units"
                  />
                ) : (
                  <EmptyState message="Need 2+ snapshots to rank consumed items" />
                )}
              </div>
            </div>

            {/* ── Low Stock Alerts Table ── */}
            <div className="dash-card" style={{ marginBottom: 20, animationDelay: "440ms" }}>
              <SectionHeader
                title="Low Stock Alerts"
                sub="Items currently below par level (from latest snapshot)"
              />
              {lowStockAlerts.length === 0 ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "16px 20px", background: C.sucLt,
                  borderRadius: 10, border: `1.5px solid ${C.suc}`,
                  color: C.suc, fontSize: 14, fontWeight: 600,
                }}>
                  <I.CheckCircle />
                  All items are at or above par level
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  {/* Table header */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 100px 100px 120px",
                    gap: 8,
                    padding: "8px 12px",
                    background: C.bg,
                    borderRadius: 8,
                    marginBottom: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.textMut,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}>
                    <div>Item</div>
                    <div style={{ textAlign: "right" }}>Current</div>
                    <div style={{ textAlign: "right" }}>Par Level</div>
                    <div style={{ textAlign: "right" }}>Deficit</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                  </div>

                  {lowStockAlerts.map((item, i) => {
                    const isOut = item.stock === 0;
                    const statusColor = isOut ? C.dan : C.warn;
                    const statusBg = isOut ? C.danLt : C.warnLt;
                    const statusLabel = isOut ? "Out of Stock" : "Below Par";

                    return (
                      <div
                        key={i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px 100px 100px 120px",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 8,
                          marginBottom: 2,
                          background: i % 2 === 0 ? C.surface : C.bg,
                          alignItems: "center",
                          transition: "background 0.15s",
                          fontSize: 13,
                          color: C.text,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          {item.category && (
                            <div style={{ fontSize: 11, color: C.textMut, marginTop: 1 }}>{item.category}</div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 600, color: isOut ? C.dan : C.text }}>
                          {item.stock}
                        </div>
                        <div style={{ textAlign: "right", color: C.textSec }}>
                          {item.par}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 700, color: statusColor }}>
                          -{item.deficit}
                        </div>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: 20,
                            background: statusBg,
                            color: statusColor,
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Snapshot Summary Table ── */}
            <div className="dash-card" style={{ animationDelay: "480ms" }}>
              <SectionHeader
                title="Snapshot History"
                sub={`${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""} in selected timeframe`}
              />
              {snapshots.length === 0 ? (
                <EmptyState />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 100px 100px 80px",
                    gap: 8,
                    padding: "8px 12px",
                    background: C.bg,
                    borderRadius: 8,
                    marginBottom: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.textMut,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}>
                    <div>Week Start</div>
                    <div>Notes</div>
                    <div style={{ textAlign: "right" }}>Dog-Days</div>
                    <div style={{ textAlign: "right" }}>Value</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                  </div>

                  {snapshots.map((snap, i) => {
                    const snapVal = valueOverTime.find((v) => v.date === snap.week_start)?.value ?? 0;
                    const statusColor = snap.status === "complete" ? C.suc : snap.status === "in_progress" ? C.warn : C.textMut;
                    const statusBg = snap.status === "complete" ? C.sucLt : snap.status === "in_progress" ? C.warnLt : C.bg;

                    return (
                      <div
                        key={snap.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "120px 1fr 100px 100px 80px",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 8,
                          marginBottom: 2,
                          background: i % 2 === 0 ? C.surface : C.bg,
                          alignItems: "center",
                          fontSize: 13,
                          color: C.text,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontFamily: "Outfit, sans-serif" }}>
                          {fmtDate(snap.week_start)}
                        </div>
                        <div style={{ color: C.textSec, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {snap.notes || "—"}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 600 }}>
                          {(() => {
                            const weekRates = depletionRates.filter(r => r.week_start === snap.week_start);
                            return weekRates.length > 0 && weekRates[0].dog_days ? weekRates[0].dog_days : (snap.dog_count ?? "\u2014");
                          })()}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 700, color: C.pri }}>
                          {fmtCurrency(snapVal)}
                        </div>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: 20,
                            background: statusBg,
                            color: statusColor,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "capitalize",
                            whiteSpace: "nowrap",
                          }}>
                            {snap.status || "draft"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

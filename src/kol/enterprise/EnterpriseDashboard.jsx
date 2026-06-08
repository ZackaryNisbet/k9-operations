// K9 Operations — Enterprise Dashboard Aggregation
// ENT-001: Multi-location dashboard for franchise owners.
// Aggregates metrics across all resort locations with toggle controls.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { supabase } from "../../supabaseClient";
import {
  C, LITE_DEF_PRICING, CHART_PTS, OPS_TYPES, OPERATIONS_CATALOG,
  todayStr, addDays, countNights, countHours, fmtDate, fmtDateFull, fmtDateShort,
  formatTime12hr, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS,
} from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, Card, Modal } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import { ENT_CSS } from "./enterpriseDashboard/entStyles";
import { fmt$k, fmtDateLabel } from "./enterpriseDashboard/entFormat";
import { RANGES, LOC_COLORS } from "./enterpriseDashboard/entConfig";
import { generateLocationData } from "./enterpriseDashboard/demoData";
import { AnimatedNumber } from "./enterpriseDashboard/AnimatedNumber";
import { TrendBadge } from "./enterpriseDashboard/TrendBadge";
import { HeroCard, MetricTile, SnapshotStat, Th, Td, OccupancyPill, OpsCompletionPill } from "./enterpriseDashboard/subComponents";

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function EnterpriseDashboard({ data, save, nav, profile, addGlobalToast, userLocationIds }) {
  const [range, setRange] = useState("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [animEpoch, setAnimEpoch] = useState(0);
  const [selectedLocations, setSelectedLocations] = useState(new Set());
  const [drillLocation, setDrillLocation] = useState(null);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const today = todayStr();

  // Location data — filtered by user's accessible locations
  const allLocations = useMemo(() => {
    const all = generateLocationData();
    // null = full access (enterprise_admin/developer/owner)
    if (!userLocationIds) return all;
    return all.filter(l => userLocationIds.includes(l.id));
  }, [userLocationIds]);

  // Initialize all locations as selected
  useEffect(() => {
    if (selectedLocations.size === 0 && allLocations.length > 0) {
      setSelectedLocations(new Set(allLocations.map(l => l.id)));
    }
  }, [allLocations]);

  // Re-trigger animations on range change
  useEffect(() => { setAnimEpoch(e => e + 1); }, [range]);

  // Active locations based on toggle
  const activeLocations = useMemo(
    () => allLocations.filter(l => selectedLocations.has(l.id)),
    [allLocations, selectedLocations]
  );

  /* ─── Toggle location ────────────────────────────────────────────── */
  const toggleLocation = useCallback((locId) => {
    setSelectedLocations(prev => {
      const next = new Set(prev);
      if (next.has(locId)) {
        if (next.size > 1) next.delete(locId); // Keep at least one
      } else {
        next.add(locId);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedLocations.size === allLocations.length) {
      setSelectedLocations(new Set([allLocations[0].id]));
    } else {
      setSelectedLocations(new Set(allLocations.map(l => l.id)));
    }
  }, [allLocations, selectedLocations]);

  /* ─── Reporting data from Supabase ────────────────────────────────── */
  const [reportData, setReportData] = useState({ loading: true, revenue: null, occupancy: null, ops: null, staff: null });
  const [reportExpanded, setReportExpanded] = useState({ revenue: false, occupancy: false, ops: false, staff: false });

  /* ─── Date range computation ──────────────────────────────────────── */
  const { dateFrom, dateTo, days, prevFrom, prevTo } = useMemo(() => {
    const now = new Date();
    const end = today;
    let start;
    switch (range) {
      case "today": start = end; break;
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

  /* ─── Fetch reporting data from Supabase ────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    async function fetchReportData() {
      setReportData(prev => ({ ...prev, loading: true }));
      try {
        // Fetch all locations' IDs — use K9_LOCATIONS or fallback to known ids
        const locationIds = allLocations.map(l => l.id);

        // 1. Revenue — from dashboard_metrics_daily
        const revenuePromise = supabase
          .from("dashboard_metrics_daily")
          .select("location_id, metric_date, cash_total_revenue, cash_boarding_revenue, cash_daycare_revenue, cash_net_revenue, cash_transaction_count")
          .gte("metric_date", dateFrom)
          .lte("metric_date", dateTo)
          .order("metric_date", { ascending: true });

        // 2. Occupancy — active boarding reservations for today
        const occupancyPromise = supabase
          .from("gingr_reservations")
          .select("location_id, gingr_id, reservation_type_name, start_date, end_date")
          .lte("start_date", today + "T23:59:59")
          .gte("end_date", today + "T00:00:00")
          .in("reservation_type_name", ["Boarding", "boarding", "Luxury Suite", "Executive Room", "Standard Room"]);

        // 3. Room capacity — from lite_settings
        const roomCapPromise = supabase
          .from("lite_settings")
          .select("location_id, setting_value")
          .eq("setting_key", "room_counts");

        // 4. Operations — lite_daily_ops for the date range
        const opsPromise = supabase
          .from("lite_daily_ops")
          .select("location_id, date, type, computed_items, items, locked")
          .gte("date", dateFrom)
          .lte("date", dateTo);

        // 5. Staff — profiles
        const staffPromise = supabase
          .from("profiles")
          .select("id, full_name, role, location_id");

        const [revRes, occRes, roomRes, opsRes, staffRes] = await Promise.all([
          revenuePromise, occupancyPromise, roomCapPromise, opsPromise, staffPromise,
        ]);

        if (cancelled) return;

        // Process Revenue
        const revRows = revRes.data || [];
        const revByLoc = {};
        const revByDate = {};
        revRows.forEach(r => {
          const lid = r.location_id || "unknown";
          if (!revByLoc[lid]) revByLoc[lid] = { total: 0, boarding: 0, daycare: 0, net: 0, txCount: 0 };
          revByLoc[lid].total += r.cash_total_revenue || 0;
          revByLoc[lid].boarding += r.cash_boarding_revenue || 0;
          revByLoc[lid].daycare += r.cash_daycare_revenue || 0;
          revByLoc[lid].net += r.cash_net_revenue || 0;
          revByLoc[lid].txCount += r.cash_transaction_count || 0;
          const d = r.metric_date;
          if (!revByDate[d]) revByDate[d] = 0;
          revByDate[d] += r.cash_total_revenue || 0;
        });
        const totalRevenue = Object.values(revByLoc).reduce((s, l) => s + l.total, 0);
        const revenueTrend = Object.entries(revByDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, label: fmtDateLabel(date), value }));

        // Per-location revenue trend
        const revByLocDate = {};
        revRows.forEach(r => {
          const lid = r.location_id || "unknown";
          if (!revByLocDate[lid]) revByLocDate[lid] = {};
          const d = r.metric_date;
          revByLocDate[lid][d] = (revByLocDate[lid][d] || 0) + (r.cash_total_revenue || 0);
        });
        const perLocRevTrend = Object.entries(revByLocDate).map(([lid, dateMap]) => ({
          locationId: lid,
          data: Object.entries(dateMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, label: fmtDateLabel(date), value })),
        }));

        // Process Occupancy
        const occRows = occRes.data || [];
        const occByLoc = {};
        occRows.forEach(r => {
          const lid = r.location_id || "unknown";
          if (!occByLoc[lid]) occByLoc[lid] = 0;
          occByLoc[lid]++;
        });
        const roomRows = roomRes.data || [];
        const roomCapByLoc = {};
        roomRows.forEach(r => {
          const lid = r.location_id || "unknown";
          const val = r.setting_value;
          if (typeof val === "object" && val) {
            roomCapByLoc[lid] = Object.values(val).reduce((s, v) => s + (parseInt(v) || 0), 0);
          } else if (typeof val === "number") {
            roomCapByLoc[lid] = val;
          }
        });
        const totalBoarding = Object.values(occByLoc).reduce((s, v) => s + v, 0);
        const totalCapacity = Object.values(roomCapByLoc).reduce((s, v) => s + v, 0);

        // Process Ops
        const opsRows = opsRes.data || [];
        const opsByLoc = {};
        opsRows.forEach(r => {
          const lid = r.location_id || "unknown";
          if (!opsByLoc[lid]) opsByLoc[lid] = { total: 0, completed: 0, bathing: { total: 0, done: 0 }, cleaning: { total: 0, done: 0 }, play: { total: 0, done: 0 } };
          const items = r.computed_items || r.items || {};
          const type = (r.type || "").toLowerCase();
          Object.entries(items).forEach(([key, val]) => {
            const isDone = val === true || val === "done" || val === "completed" || (typeof val === "object" && val && val.done);
            opsByLoc[lid].total++;
            if (isDone) opsByLoc[lid].completed++;
            if (type.includes("bath") || key.toLowerCase().includes("bath")) {
              opsByLoc[lid].bathing.total++;
              if (isDone) opsByLoc[lid].bathing.done++;
            }
            if (type.includes("clean") || type.includes("room") || key.toLowerCase().includes("clean") || key.toLowerCase().includes("room")) {
              opsByLoc[lid].cleaning.total++;
              if (isDone) opsByLoc[lid].cleaning.done++;
            }
            if (type.includes("play") || key.toLowerCase().includes("play")) {
              opsByLoc[lid].play.total++;
              if (isDone) opsByLoc[lid].play.done++;
            }
          });
        });

        // Process Staff
        const staffRows = staffRes.data || [];
        const staffByLoc = {};
        staffRows.forEach(r => {
          const lid = r.location_id || "unknown";
          if (!staffByLoc[lid]) staffByLoc[lid] = [];
          staffByLoc[lid].push({ id: r.id, name: r.full_name, role: r.role });
        });

        setReportData({
          loading: false,
          revenue: { byLocation: revByLoc, totalRevenue, trend: revenueTrend, perLocTrend: perLocRevTrend },
          occupancy: { byLocation: occByLoc, roomCapacity: roomCapByLoc, totalBoarding, totalCapacity },
          ops: { byLocation: opsByLoc },
          staff: { byLocation: staffByLoc, total: staffRows.length },
        });
      } catch (err) {
        console.error("Enterprise report fetch error:", err);
        if (!cancelled) setReportData(prev => ({ ...prev, loading: false }));
      }
    }
    fetchReportData();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, today, allLocations]);

  /* ─── Aggregated metrics ─────────────────────────────────────────── */
  const agg = useMemo(() => {
    const locs = activeLocations;
    if (locs.length === 0) return null;
    const totalDogs = locs.reduce((s, l) => s + l.totalDogs, 0);
    const totalBoarding = locs.reduce((s, l) => s + l.boardingDogs, 0);
    const totalDaycare = locs.reduce((s, l) => s + l.daycareDogs, 0);
    const totalArriving = locs.reduce((s, l) => s + l.arriving, 0);
    const totalGoingHome = locs.reduce((s, l) => s + l.goingHome, 0);
    const totalRooms = locs.reduce((s, l) => s + l.totalRooms, 0);
    const totalOccupied = locs.reduce((s, l) => s + l.occupiedRooms, 0);
    const avgOccupancy = totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0;
    const totalRevenue = locs.reduce((s, l) => s + l.revenueTotal, 0);
    const totalPrevRevenue = locs.reduce((s, l) => s + l.revenuePrev, 0);
    const revTrend = totalPrevRevenue > 0 ? ((totalRevenue - totalPrevRevenue) / totalPrevRevenue) * 100 : 0;
    const totalBoardingRev = locs.reduce((s, l) => s + l.boardingRevenue, 0);
    const totalDaycareRev = locs.reduce((s, l) => s + l.daycareRevenue, 0);
    const totalBookings = locs.reduce((s, l) => s + l.bookings, 0);
    const totalPrevBookings = locs.reduce((s, l) => s + l.bookingsPrev, 0);
    const bookingsTrend = totalPrevBookings > 0 ? ((totalBookings - totalPrevBookings) / totalPrevBookings) * 100 : 0;
    const avgTransaction = totalBookings > 0 ? totalRevenue / totalBookings : 0;
    const totalLeads = locs.reduce((s, l) => s + l.newLeads, 0);
    const totalContacted = locs.reduce((s, l) => s + l.contacted, 0);
    const totalNewCustomers = locs.reduce((s, l) => s + l.newCustomers, 0);
    const convRate = totalLeads > 0 ? (totalNewCustomers / totalLeads) * 100 : 0;
    const avgLTV = locs.reduce((s, l) => s + l.avgLTV, 0) / locs.length;
    const totalStaff = locs.reduce((s, l) => s + l.staffCount, 0);
    const avgOpsCompletion = Math.round(locs.reduce((s, l) => s + l.opsCompletion, 0) / locs.length);
    const avgRevPAR = totalRooms > 0 ? totalBoardingRev / totalRooms / 30 : 0;
    return {
      totalDogs, totalBoarding, totalDaycare, totalArriving, totalGoingHome,
      totalRooms, totalOccupied, avgOccupancy,
      totalRevenue, totalPrevRevenue, revTrend,
      totalBoardingRev, totalDaycareRev,
      totalBookings, totalPrevBookings, bookingsTrend,
      avgTransaction,
      totalLeads, totalContacted, totalNewCustomers, convRate,
      avgLTV, totalStaff, avgOpsCompletion, avgRevPAR,
      locationCount: locs.length,
    };
  }, [activeLocations]);

  /* ─── Revenue chart data (aggregated across locations) ──────────── */
  const revenueChartData = useMemo(() => {
    if (activeLocations.length === 0) return [];
    const dateMap = {};
    activeLocations.forEach(loc => {
      (loc.revenueByDay || []).forEach(d => {
        dateMap[d.date] = (dateMap[d.date] || 0) + d.value;
      });
    });
    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, label: fmtDateLabel(date), value }));
  }, [activeLocations]);

  /* ─── Per-location revenue chart data (for comparison) ──────────── */
  const perLocationChartData = useMemo(() => {
    return activeLocations.map((loc, idx) => ({
      id: loc.id,
      name: loc.name,
      color: LOC_COLORS[idx % LOC_COLORS.length],
      data: (loc.revenueByDay || []).map(d => ({ date: d.date, label: fmtDateLabel(d.date), value: d.value })),
    }));
  }, [activeLocations]);

  /* ─── Alerts engine ─────────────────────────────────────────────── */
  const alerts = useMemo(() => {
    const result = [];
    activeLocations.forEach(loc => {
      if (loc.occupancyRate < 65) {
        result.push({ type: "warning", location: loc.name, metric: "Low Occupancy", value: `${loc.occupancyRate.toFixed(1)}%`, detail: "Below 65% threshold — consider promotional campaigns", severity: 2 });
      }
      if (loc.revenueTrend < -5) {
        result.push({ type: "danger", location: loc.name, metric: "Revenue Decline", value: `${loc.revenueTrend.toFixed(1)}%`, detail: "Declining revenue vs. prior period", severity: 3 });
      }
      if (loc.churnRate > 6) {
        result.push({ type: "danger", location: loc.name, metric: "High Churn", value: `${loc.churnRate.toFixed(1)}%`, detail: "Churn rate exceeds 6% — retention action needed", severity: 3 });
      }
      if (loc.opsCompletion < 80) {
        result.push({ type: "warning", location: loc.name, metric: "Ops Below Target", value: `${loc.opsCompletion}%`, detail: "Operations completion under 80%", severity: 1 });
      }
      if (loc.conversionRate < 35) {
        result.push({ type: "info", location: loc.name, metric: "Low Conversion", value: `${loc.conversionRate.toFixed(1)}%`, detail: "Below average conversion rate", severity: 1 });
      }
    });
    return result.sort((a, b) => b.severity - a.severity);
  }, [activeLocations]);

  /* ─── Grid base ──────────────────────────────────────────────────── */
  const gridBase = { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 20 };

  if (!agg) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <K9LoadingAnimation message="Loading enterprise dashboard..." />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px 40px", maxWidth: 1440, margin: "0 auto" }}>
      <style>{ENT_CSS}</style>

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 className="brand-headline" style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>Enterprise Dashboard</h1>
            <Badge color="blue">{agg.locationCount} Location{agg.locationCount !== 1 ? "s" : ""}</Badge>
          </div>
          <p style={{ fontSize: 12, color: C.textMut, margin: 0 }}>
            {fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)} · {days} day{days !== 1 ? "s" : ""} · Aggregated view
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${range === r.key ? C.pri : C.border}`,
                background: range === r.key ? C.pri : C.surface, color: range === r.key ? "#fff" : C.textSec,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date pickers */}
      {range === "custom" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", animation: "entFadeIn 0.3s ease" }}>
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

      {/* ─── Location Toggle Bar ─────────────────────────────────────── */}
      <div className="ent-card" style={{ marginBottom: 20, padding: "14px 20px", animationDelay: "0.01s" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Resort Selection</span>
          <button
            onClick={toggleAll}
            style={{ fontSize: 11, fontWeight: 600, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
          >
            {selectedLocations.size === allLocations.length ? "Deselect All" : "Select All"}
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {allLocations.map((loc, idx) => {
            const isActive = selectedLocations.has(loc.id);
            const color = LOC_COLORS[idx % LOC_COLORS.length];
            return (
              <button
                key={loc.id}
                className="ent-toggle-chip"
                onClick={() => toggleLocation(loc.id)}
                style={{
                  background: isActive ? `${color}15` : C.bg,
                  color: isActive ? color : C.textMut,
                  borderColor: isActive ? `${color}40` : C.border,
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? color : C.textMut, flexShrink: 0 }} />
                {loc.name}
                {isActive && <span style={{ fontSize: 10, opacity: 0.7 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ OVERVIEW CARDS — Aggregated hero KPIs ═════════════════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        <HeroCard delay={0} label="Total Dogs" value={agg.totalDogs} sub={`${agg.totalBoarding} boarding · ${agg.totalDaycare} daycare`} icon="🐕" color={C.pri} />
        <HeroCard delay={1} label="Net Revenue" value={agg.totalRevenue} prefix="$" decimals={0} trend={agg.revTrend} icon="$" color={C.suc} />
        <HeroCard delay={2} label="Avg Occupancy" value={agg.avgOccupancy} suffix="%" decimals={1} icon="◉" color={C.acc} />
        <HeroCard delay={3} label="Total Bookings" value={agg.totalBookings} trend={agg.bookingsTrend} icon="📋" color={C.info} />
      </div>

      {/* ═══ LIVE SNAPSHOT — Facility stats ════════════════════════════ */}
      <div className="ent-card" style={{ marginBottom: 20, animationDelay: "0.10s", padding: "18px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.suc, animation: "entPulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Live Enterprise Snapshot</span>
          </div>
          <span style={{ fontSize: 11, color: C.textSec }}>{fmtDateLabel(today)} · {agg.locationCount} locations</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          <SnapshotStat label="Dogs In House" value={agg.totalDogs} sub={`Across ${agg.locationCount} resorts`} color={C.pri} delay={0} />
          <SnapshotStat label="Arriving Today" value={agg.totalArriving} sub="Expected check-ins" color={C.info} delay={1} />
          <SnapshotStat label="Going Home" value={agg.totalGoingHome} sub="Pending checkout" color={C.acc} delay={2} />
          <SnapshotStat label="Total Rooms" value={`${agg.totalOccupied}/${agg.totalRooms}`} sub={`${agg.avgOccupancy.toFixed(1)}% occupied`} color={C.suc} delay={3} />
          <SnapshotStat label="Total Staff" value={agg.totalStaff} sub="Active across resorts" color="#7C3AED" delay={4} />
          <SnapshotStat label="Ops Completion" value={`${agg.avgOpsCompletion}%`} sub="Average today" color={agg.avgOpsCompletion >= 90 ? C.suc : C.warn} delay={5} />
        </div>
      </div>

      {/* ═══ ALERTS — Underperforming Locations ═══════════════════════ */}
      {alerts.length > 0 && (
        <div className="ent-card" style={{ marginBottom: 20, animationDelay: "0.14s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: alertsExpanded ? 14 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.warn} strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Alerts & Action Items</span>
              <Badge color={alerts.some(a => a.type === "danger") ? "red" : "default"}>{alerts.length}</Badge>
            </div>
            <button
              onClick={() => setAlertsExpanded(!alertsExpanded)}
              style={{ fontSize: 11, fontWeight: 600, color: C.textSec, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              {alertsExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
          {alertsExpanded && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {alerts.map((alert, i) => {
                const alertColor = alert.type === "danger" ? C.dan : alert.type === "warning" ? C.warn : C.info;
                const alertBg = alert.type === "danger" ? C.danLt : alert.type === "warning" ? C.warnLt : C.infoLt;
                return (
                  <div
                    key={i}
                    className="ent-alert-card"
                    style={{ background: alertBg, borderColor: `${alertColor}30`, animation: `entFadeIn 0.3s ${0.05 * i + 0.15}s both` }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: alertColor }}>{alert.metric}</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: alertColor }}>{alert.value}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 2 }}>{alert.location}</div>
                    <div style={{ fontSize: 11, color: C.textSec }}>{alert.detail}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ REVENUE TREND — Aggregated chart + Composition ═══════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        <div className="ent-card" style={{ gridColumn: "span 8", animationDelay: "0.18s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue Trend — All Locations</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginTop: 2 }}>
                <AnimatedNumber value={agg.totalRevenue} prefix="$" decimals={0} />
              </div>
            </div>
            <TrendBadge value={agg.revTrend} />
          </div>
          <InteractiveLineChart
            chartData={revenueChartData}
            color={C.pri}
            height={220}
            id="ent-rev-agg"
            animationEpoch={animEpoch}
          />
        </div>

        {/* Revenue composition */}
        <div className="ent-card" style={{ gridColumn: "span 4", animationDelay: "0.22s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Revenue Composition</div>
          {/* Stacked bar */}
          <div style={{ height: 12, borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 16 }}>
            <div className="ent-bar-fill" style={{ width: `${agg.totalRevenue > 0 ? (agg.totalBoardingRev / agg.totalRevenue) * 100 : 0}%`, height: "100%", background: C.pri, animationDelay: "0.3s" }} />
            <div className="ent-bar-fill" style={{ width: `${agg.totalRevenue > 0 ? (agg.totalDaycareRev / agg.totalRevenue) * 100 : 0}%`, height: "100%", background: C.acc, animationDelay: "0.4s" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: C.pri }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Boarding</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>${fmt$k(agg.totalBoardingRev)}</span>
                <span style={{ fontSize: 10, color: C.textMut, marginLeft: 4 }}>({(agg.totalRevenue > 0 ? (agg.totalBoardingRev / agg.totalRevenue) * 100 : 0).toFixed(1)}%)</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: C.acc }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Daycare</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>${fmt$k(agg.totalDaycareRev)}</span>
                <span style={{ fontSize: 10, color: C.textMut, marginLeft: 4 }}>({(agg.totalRevenue > 0 ? (agg.totalDaycareRev / agg.totalRevenue) * 100 : 0).toFixed(1)}%)</span>
              </div>
            </div>
          </div>
          {/* Enterprise KPIs */}
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: C.accLt, textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.accDk, marginBottom: 2 }}>Avg RevPAR</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.accDk }}>${agg.avgRevPAR.toFixed(2)}</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: C.priLt, textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.pri, marginBottom: 2 }}>Avg Transaction</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.pri }}>${agg.avgTransaction.toFixed(0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COMPARISON CHARTS — Per-location revenue ══════════════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        <div className="ent-card" style={{ gridColumn: "span 12", animationDelay: "0.26s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Revenue Comparison by Location</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(activeLocations.length, 3)}, 1fr)`, gap: 16 }}>
            {perLocationChartData.map((loc, idx) => (
              <div key={loc.id} style={{ animation: `entFadeIn 0.4s ${0.08 * idx + 0.3}s both` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: loc.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{loc.name}</span>
                </div>
                <InteractiveLineChart
                  chartData={loc.data}
                  color={loc.color}
                  height={120}
                  id={`ent-rev-${loc.id}`}
                  animationEpoch={animEpoch}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ PER-LOCATION BREAKDOWN TABLE ═════════════════════════════ */}
      <div className="ent-card" style={{ marginBottom: 20, animationDelay: "0.30s", padding: "22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Per-Location Breakdown</div>
            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>Click a row to drill down</div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <Th align="left">Location</Th>
                <Th>Dogs</Th>
                <Th>Revenue</Th>
                <Th>Trend</Th>
                <Th>Occupancy</Th>
                <Th>Bookings</Th>
                <Th>Leads</Th>
                <Th>Conversion Rate</Th>
                <Th>Churn</Th>
                <Th>Ops %</Th>
                <Th>Avg LTV</Th>
              </tr>
            </thead>
            <tbody>
              {activeLocations.map((loc, idx) => (
                <tr
                  key={loc.id}
                  className="ent-loc-row"
                  onClick={() => setDrillLocation(loc)}
                  style={{
                    borderBottom: `1px solid ${C.borderLight}`,
                    background: idx % 2 === 0 ? C.surface : "rgba(245,246,248,0.5)",
                    animation: `entFadeIn 0.35s ${0.04 * idx + 0.32}s both`,
                  }}
                >
                  <td style={{ padding: "14px 16px", fontWeight: 700, color: C.text }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: LOC_COLORS[idx % LOC_COLORS.length], flexShrink: 0 }} />
                      <div>
                        <div>{loc.name}</div>
                        <div style={{ fontSize: 10, fontWeight: 400, color: C.textMut }}>{loc.region}</div>
                      </div>
                    </div>
                  </td>
                  <Td>{loc.totalDogs}</Td>
                  <Td bold>${fmt$k(loc.revenueTotal)}</Td>
                  <Td><TrendBadge value={loc.revenueTrend} /></Td>
                  <Td>
                    <OccupancyPill value={loc.occupancyRate} />
                  </Td>
                  <Td>{loc.bookings}</Td>
                  <Td>{loc.newLeads}</Td>
                  <Td>
                    <span style={{ color: loc.conversionRate >= 40 ? C.suc : loc.conversionRate >= 30 ? C.text : C.warn, fontWeight: 600 }}>
                      {loc.conversionRate.toFixed(1)}%
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: loc.churnRate > 6 ? C.dan : loc.churnRate > 4 ? C.warn : C.suc, fontWeight: 600 }}>
                      {loc.churnRate.toFixed(1)}%
                    </span>
                  </Td>
                  <Td>
                    <OpsCompletionPill value={loc.opsCompletion} />
                  </Td>
                  <Td bold>${loc.avgLTV.toLocaleString()}</Td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ borderTop: `2px solid ${C.pri}`, background: C.priLt }}>
                <td style={{ padding: "14px 16px", fontWeight: 800, color: C.pri, fontSize: 13 }}>TOTAL / AVG</td>
                <Td bold color={C.pri}>{agg.totalDogs}</Td>
                <Td bold color={C.pri}>${fmt$k(agg.totalRevenue)}</Td>
                <Td><TrendBadge value={agg.revTrend} /></Td>
                <Td bold color={C.pri}>{agg.avgOccupancy.toFixed(1)}%</Td>
                <Td bold color={C.pri}>{agg.totalBookings}</Td>
                <Td bold color={C.pri}>{agg.totalLeads}</Td>
                <Td bold color={C.pri}>{agg.convRate.toFixed(1)}%</Td>
                <Td color={C.textMut}>—</Td>
                <Td bold color={C.pri}>{agg.avgOpsCompletion}%</Td>
                <Td bold color={C.pri}>${Math.round(agg.avgLTV).toLocaleString()}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ FUNNEL + OCCUPANCY COMPARISON ════════════════════════════ */}
      <div style={{ ...gridBase, marginBottom: 20 }}>
        {/* Acquisition Funnel */}
        <div className="ent-card" style={{ gridColumn: "span 4", animationDelay: "0.34s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Enterprise Funnel</div>
          {[
            { label: "Total Leads", count: agg.totalLeads, color: C.pri, pct: 100 },
            { label: "Contacted", count: agg.totalContacted, color: C.acc, pct: agg.totalLeads > 0 ? (agg.totalContacted / agg.totalLeads) * 100 : 0 },
            { label: "New Customers", count: agg.totalNewCustomers, color: C.suc, pct: agg.totalLeads > 0 ? (agg.totalNewCustomers / agg.totalLeads) * 100 : 0 },
          ].map((stage, i) => (
            <div key={stage.label} style={{ marginBottom: i < 2 ? 12 : 0, animation: `entSlideIn 0.5s ${0.1 * i + 0.35}s cubic-bezier(0.22,1,0.36,1) both` }}>
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
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)", backgroundSize: "200% 100%", animation: "entShimmer 2.5s infinite" }} />
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, color: "#fff", zIndex: 1 }}>
                    {stage.pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.pri }}>Conversion Rate</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.pri }}>{agg.convRate.toFixed(1)}%</span>
          </div>
        </div>

        {/* Occupancy comparison */}
        <div className="ent-card" style={{ gridColumn: "span 4", animationDelay: "0.38s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Occupancy by Location</div>
          {activeLocations
            .sort((a, b) => b.occupancyRate - a.occupancyRate)
            .map((loc, i) => {
              const color = loc.occupancyRate >= 80 ? C.suc : loc.occupancyRate >= 65 ? C.acc : C.dan;
              return (
                <div key={loc.id} style={{ marginBottom: 14, animation: `entFadeIn 0.4s ${0.08 * i + 0.4}s both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{loc.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{loc.occupancyRate.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
                    <div className="ent-bar-fill" style={{ width: `${loc.occupancyRate}%`, height: "100%", background: color, borderRadius: 4, animationDelay: `${0.1 * i + 0.4}s` }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{loc.occupiedRooms}/{loc.totalRooms} rooms</div>
                </div>
              );
            })}
        </div>

        {/* Enterprise Funnel Metrics */}
        <div className="ent-card" style={{ gridColumn: "span 4", animationDelay: "0.42s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Enterprise KPIs</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <MetricTile label="Avg LTV" value={`$${fmt$k(agg.avgLTV)}`} color={C.acc} icon="♦" />
            <MetricTile label="Avg Transaction" value={`$${agg.avgTransaction.toFixed(0)}`} color={C.pri} icon="$" />
            <MetricTile label="Total Staff" value={agg.totalStaff.toString()} color="#7C3AED" icon="👤" />
            <MetricTile label="Locations" value={agg.locationCount.toString()} color={C.info} icon="📍" />
          </div>
          <div style={{ marginTop: 16, padding: "12px", borderRadius: 10, background: C.sucLt, border: `1px solid ${C.suc}20` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.suc }}>Projected Monthly Revenue</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.suc }}>
                ${fmt$k(agg.totalRevenue * (30 / Math.max(days, 1)))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ REVENUE RANKING — Horizontal bar chart ═══════════════════ */}
      <div className="ent-card" style={{ marginBottom: 20, animationDelay: "0.46s" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Revenue Ranking</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[...activeLocations]
            .sort((a, b) => b.revenueTotal - a.revenueTotal)
            .map((loc, i) => {
              const maxRev = Math.max(...activeLocations.map(l => l.revenueTotal));
              const pct = maxRev > 0 ? (loc.revenueTotal / maxRev) * 100 : 0;
              const share = agg.totalRevenue > 0 ? (loc.revenueTotal / agg.totalRevenue) * 100 : 0;
              const color = LOC_COLORS[allLocations.findIndex(l => l.id === loc.id) % LOC_COLORS.length];
              return (
                <div key={loc.id} style={{ animation: `entFadeIn 0.35s ${0.06 * i + 0.48}s both` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{loc.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>${fmt$k(loc.revenueTotal)}</span>
                      <span style={{ fontSize: 10, color: C.textMut }}>({share.toFixed(1)}%)</span>
                      <TrendBadge value={loc.revenueTrend} />
                    </div>
                  </div>
                  <div style={{ height: 10, background: C.bg, borderRadius: 5, overflow: "hidden" }}>
                    <div className="ent-bar-fill" style={{
                      width: `${pct}%`, height: "100%",
                      background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                      borderRadius: 5, animationDelay: `${0.08 * i + 0.5}s`,
                    }} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* ═══ DRILL-DOWN MODAL ════════════════════════════════════════ */}
      {drillLocation && (
        <Modal title={`${drillLocation.name} — Detailed View`} onClose={() => setDrillLocation(null)} wide>
          <DrillDownView location={drillLocation} allLocations={allLocations} />
        </Modal>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          AGGREGATED REPORTING — Revenue, Occupancy, Ops, Staffing
          Below the alert engine, powered by Supabase data
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ height: 2, flex: 1, background: `linear-gradient(90deg, ${C.pri}30, transparent)` }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Cross-Location Reporting</span>
          <div style={{ height: 2, flex: 1, background: `linear-gradient(270deg, ${C.pri}30, transparent)` }} />
        </div>

        {reportData.loading ? (
          <div className="ent-card" style={{ textAlign: "center", padding: 40 }}>
            <K9LoadingAnimation message="Loading aggregated reports..." />
          </div>
        ) : (
          <>
            {/* ═══ REVENUE REPORTING ═══════════════════════════════════ */}
            <div style={{ ...gridBase, marginBottom: 20 }}>
              {/* Total Revenue Card */}
              <div className="ent-card" style={{ gridColumn: "span 4", animationDelay: "0.52s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Revenue</div>
                  <button
                    onClick={() => setReportExpanded(p => ({ ...p, revenue: !p.revenue }))}
                    style={{ fontSize: 10, fontWeight: 600, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
                  >
                    {reportExpanded.revenue ? "Collapse" : "Details"}
                  </button>
                </div>
                <div className="ent-hero-num" style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                  <AnimatedNumber value={reportData.revenue?.totalRevenue || 0} prefix="$" decimals={0} />
                </div>
                <div style={{ fontSize: 11, color: C.textMut }}>
                  {fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)} · {Object.keys(reportData.revenue?.byLocation || {}).length} location{Object.keys(reportData.revenue?.byLocation || {}).length !== 1 ? "s" : ""}
                </div>
                {reportExpanded.revenue && reportData.revenue?.byLocation && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.borderLight}`, animation: "entFadeIn 0.3s ease" }}>
                    {Object.entries(reportData.revenue.byLocation).map(([lid, rev], i) => {
                      const locName = allLocations.find(l => l.id === lid)?.name || lid;
                      return (
                        <div key={lid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                          <span style={{ fontSize: 12, color: C.textSec }}>{locName}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>${fmt$k(rev.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Revenue by Location — Horizontal Bar Chart */}
              <div className="ent-card" style={{ gridColumn: "span 8", animationDelay: "0.56s" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Revenue by Location</div>
                {(() => {
                  const locRevEntries = Object.entries(reportData.revenue?.byLocation || {})
                    .sort(([, a], [, b]) => b.total - a.total);
                  const maxRev = locRevEntries.length > 0 ? Math.max(...locRevEntries.map(([, r]) => r.total)) : 1;
                  return locRevEntries.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", padding: 20 }}>No revenue data for this period</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {locRevEntries.map(([lid, rev], i) => {
                        const locName = allLocations.find(l => l.id === lid)?.name || lid;
                        const pct = maxRev > 0 ? (rev.total / maxRev) * 100 : 0;
                        const share = (reportData.revenue?.totalRevenue || 1) > 0 ? (rev.total / reportData.revenue.totalRevenue) * 100 : 0;
                        const color = LOC_COLORS[allLocations.findIndex(l => l.id === lid) % LOC_COLORS.length] || C.pri;
                        return (
                          <div key={lid} style={{ animation: `entFadeIn 0.35s ${0.06 * i + 0.58}s both` }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{locName}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>${fmt$k(rev.total)}</span>
                                <span style={{ fontSize: 10, color: C.textMut }}>({share.toFixed(1)}%)</span>
                              </div>
                            </div>
                            <div style={{ height: 10, background: C.bg, borderRadius: 5, overflow: "hidden" }}>
                              <div className="ent-bar-fill" style={{
                                width: `${pct}%`, height: "100%",
                                background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                                borderRadius: 5, animationDelay: `${0.08 * i + 0.6}s`,
                              }} />
                            </div>
                            {reportExpanded.revenue && (
                              <div style={{ display: "flex", gap: 16, marginTop: 4, animation: "entFadeIn 0.2s ease" }}>
                                <span style={{ fontSize: 10, color: C.textMut }}>Boarding: ${fmt$k(rev.boarding)}</span>
                                <span style={{ fontSize: 10, color: C.textMut }}>Daycare: ${fmt$k(rev.daycare)}</span>
                                <span style={{ fontSize: 10, color: C.textMut }}>Transactions: {rev.txCount}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Revenue Trend Line Chart */}
            {(reportData.revenue?.trend || []).length > 1 && (
              <div className="ent-card" style={{ marginBottom: 20, animationDelay: "0.60s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue Trend — Reporting Period</div>
                    <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)}</div>
                  </div>
                </div>
                <InteractiveLineChart
                  chartData={reportData.revenue.trend}
                  color={C.suc}
                  height={200}
                  id="ent-report-rev-trend"
                  animationEpoch={animEpoch}
                />
                {/* Per-location trend overlay */}
                {reportExpanded.revenue && (reportData.revenue.perLocTrend || []).length > 0 && (
                  <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: `repeat(${Math.min(reportData.revenue.perLocTrend.length, 3)}, 1fr)`, gap: 14, animation: "entFadeIn 0.3s ease" }}>
                    {reportData.revenue.perLocTrend.map((loc, idx) => {
                      const locName = allLocations.find(l => l.id === loc.locationId)?.name || loc.locationId;
                      const color = LOC_COLORS[allLocations.findIndex(l => l.id === loc.locationId) % LOC_COLORS.length] || C.pri;
                      return (
                        <div key={loc.locationId}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{locName}</span>
                          </div>
                          <InteractiveLineChart
                            chartData={loc.data}
                            color={color}
                            height={100}
                            id={`ent-report-rev-${loc.locationId}`}
                            animationEpoch={animEpoch}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══ OCCUPANCY REPORTING ═════════════════════════════════ */}
            <div style={{ ...gridBase, marginBottom: 20 }}>
              <div className="ent-card" style={{ gridColumn: "span 4", animationDelay: "0.64s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Aggregate Occupancy</div>
                  <button
                    onClick={() => setReportExpanded(p => ({ ...p, occupancy: !p.occupancy }))}
                    style={{ fontSize: 10, fontWeight: 600, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
                  >
                    {reportExpanded.occupancy ? "Collapse" : "Details"}
                  </button>
                </div>
                {(() => {
                  const occ = reportData.occupancy || {};
                  const rate = occ.totalCapacity > 0 ? (occ.totalBoarding / occ.totalCapacity) * 100 : 0;
                  const rateColor = rate >= 80 ? C.suc : rate >= 65 ? C.acc : C.dan;
                  return (
                    <>
                      <div className="ent-hero-num" style={{ fontSize: 28, fontWeight: 700, color: rateColor, marginBottom: 4 }}>
                        <AnimatedNumber value={rate} suffix="%" decimals={1} />
                      </div>
                      <div style={{ fontSize: 11, color: C.textMut }}>{occ.totalBoarding || 0} dogs / {occ.totalCapacity || 0} rooms</div>
                      <div style={{ height: 10, background: C.bg, borderRadius: 5, overflow: "hidden", marginTop: 10 }}>
                        <div className="ent-bar-fill" style={{ width: `${Math.min(rate, 100)}%`, height: "100%", background: rateColor, borderRadius: 5, animationDelay: "0.66s" }} />
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Per-location occupancy bars */}
              <div className="ent-card" style={{ gridColumn: "span 8", animationDelay: "0.68s" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Occupancy by Location</div>
                {(() => {
                  const occ = reportData.occupancy || {};
                  const entries = Object.keys({ ...occ.byLocation, ...occ.roomCapacity })
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map(lid => {
                      const dogs = occ.byLocation?.[lid] || 0;
                      const cap = occ.roomCapacity?.[lid] || 0;
                      const rate = cap > 0 ? (dogs / cap) * 100 : 0;
                      return { lid, dogs, cap, rate };
                    })
                    .sort((a, b) => b.rate - a.rate);

                  return entries.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", padding: 20 }}>No occupancy data available</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {entries.map((e, i) => {
                        const locName = allLocations.find(l => l.id === e.lid)?.name || e.lid;
                        const color = e.rate >= 80 ? C.suc : e.rate >= 65 ? C.acc : C.dan;
                        return (
                          <div key={e.lid} style={{ animation: `entFadeIn 0.4s ${0.08 * i + 0.7}s both` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{locName}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color }}>{e.rate.toFixed(1)}%</span>
                            </div>
                            <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
                              <div className="ent-bar-fill" style={{ width: `${Math.min(e.rate, 100)}%`, height: "100%", background: color, borderRadius: 4, animationDelay: `${0.1 * i + 0.7}s` }} />
                            </div>
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{e.dogs}/{e.cap} rooms</div>
                            {reportExpanded.occupancy && (
                              <div style={{ display: "flex", gap: 12, marginTop: 2, animation: "entFadeIn 0.2s ease" }}>
                                <span style={{ fontSize: 10, color: C.textMut }}>Boarding dogs: {e.dogs}</span>
                                <span style={{ fontSize: 10, color: C.textMut }}>Total capacity: {e.cap}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ═══ SERVICE COMPLETION REPORTING ═════════════════════════ */}
            <div style={{ ...gridBase, marginBottom: 20 }}>
              <div className="ent-card" style={{ gridColumn: "span 6", animationDelay: "0.72s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Aggregate Service Completion</div>
                  <button
                    onClick={() => setReportExpanded(p => ({ ...p, ops: !p.ops }))}
                    style={{ fontSize: 10, fontWeight: 600, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
                  >
                    {reportExpanded.ops ? "Collapse" : "Details"}
                  </button>
                </div>
                {(() => {
                  const opsLocs = reportData.ops?.byLocation || {};
                  const aggOps = Object.values(opsLocs).reduce((acc, l) => ({
                    total: acc.total + l.total, completed: acc.completed + l.completed,
                    bathing: { total: acc.bathing.total + l.bathing.total, done: acc.bathing.done + l.bathing.done },
                    cleaning: { total: acc.cleaning.total + l.cleaning.total, done: acc.cleaning.done + l.cleaning.done },
                    play: { total: acc.play.total + l.play.total, done: acc.play.done + l.play.done },
                  }), { total: 0, completed: 0, bathing: { total: 0, done: 0 }, cleaning: { total: 0, done: 0 }, play: { total: 0, done: 0 } });
                  const overallRate = aggOps.total > 0 ? (aggOps.completed / aggOps.total) * 100 : 0;
                  const rateColor = overallRate >= 90 ? C.suc : overallRate >= 75 ? C.warn : C.dan;

                  const categories = [
                    { label: "Bathing", ...aggOps.bathing, icon: "🛁" },
                    { label: "Room Cleaning & Setups", ...aggOps.cleaning, icon: "🧹" },
                    { label: "Private Play", ...aggOps.play, icon: "🎾" },
                  ];

                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                        <div className="ent-hero-num" style={{ fontSize: 28, fontWeight: 700, color: rateColor }}>
                          <AnimatedNumber value={overallRate} suffix="%" decimals={1} />
                        </div>
                        <span style={{ fontSize: 11, color: C.textMut }}>overall completion</span>
                      </div>
                      <div style={{ height: 12, borderRadius: 6, overflow: "hidden", background: C.bg, marginBottom: 16 }}>
                        <div className="ent-bar-fill" style={{ width: `${overallRate}%`, height: "100%", background: rateColor, borderRadius: 6, animationDelay: "0.74s" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        {categories.map((cat, i) => {
                          const catRate = cat.total > 0 ? (cat.done / cat.total) * 100 : 0;
                          const catColor = catRate >= 90 ? C.suc : catRate >= 75 ? C.warn : C.dan;
                          return (
                            <div key={cat.label} style={{ padding: "12px", borderRadius: 10, background: `${catColor}08`, border: `1px solid ${catColor}20`, textAlign: "center" }}>
                              <div style={{ fontSize: 16, marginBottom: 4 }}>{cat.icon}</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: catColor }}>{catRate.toFixed(0)}%</div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut }}>{cat.label}</div>
                              <div style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{cat.done}/{cat.total}</div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Per-location service breakdown */}
              <div className="ent-card" style={{ gridColumn: "span 6", animationDelay: "0.76s" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Completion by Location</div>
                {(() => {
                  const opsLocs = reportData.ops?.byLocation || {};
                  const entries = Object.entries(opsLocs)
                    .map(([lid, data]) => {
                      const rate = data.total > 0 ? (data.completed / data.total) * 100 : 0;
                      return { lid, ...data, rate };
                    })
                    .sort((a, b) => b.rate - a.rate);
                  return entries.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", padding: 20 }}>No operations data for this period</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {entries.map((e, i) => {
                        const locName = allLocations.find(l => l.id === e.lid)?.name || e.lid;
                        const color = e.rate >= 90 ? C.suc : e.rate >= 75 ? C.warn : C.dan;
                        return (
                          <div key={e.lid} style={{ animation: `entFadeIn 0.35s ${0.06 * i + 0.78}s both` }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{locName}</span>
                              <OpsCompletionPill value={Math.round(e.rate)} />
                            </div>
                            <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                              <div className="ent-bar-fill" style={{ width: `${e.rate}%`, height: "100%", background: color, borderRadius: 3, animationDelay: `${0.08 * i + 0.78}s` }} />
                            </div>
                            {reportExpanded.ops && (
                              <div style={{ display: "flex", gap: 14, marginTop: 4, animation: "entFadeIn 0.2s ease" }}>
                                <span style={{ fontSize: 10, color: C.textMut }}>
                                  Bathing: {e.bathing.total > 0 ? `${Math.round(e.bathing.done / e.bathing.total * 100)}%` : "—"}
                                </span>
                                <span style={{ fontSize: 10, color: C.textMut }}>
                                  Cleaning: {e.cleaning.total > 0 ? `${Math.round(e.cleaning.done / e.cleaning.total * 100)}%` : "—"}
                                </span>
                                <span style={{ fontSize: 10, color: C.textMut }}>
                                  Play: {e.play.total > 0 ? `${Math.round(e.play.done / e.play.total * 100)}%` : "—"}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ═══ STAFFING OVERVIEW ═══════════════════════════════════ */}
            <div style={{ ...gridBase, marginBottom: 20 }}>
              <div className="ent-card" style={{ gridColumn: "span 4", animationDelay: "0.80s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Staffing Overview</div>
                  <button
                    onClick={() => setReportExpanded(p => ({ ...p, staff: !p.staff }))}
                    style={{ fontSize: 10, fontWeight: 600, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
                  >
                    {reportExpanded.staff ? "Collapse" : "Details"}
                  </button>
                </div>
                <div className="ent-hero-num" style={{ fontSize: 28, fontWeight: 700, color: "#7C3AED", marginBottom: 4 }}>
                  <AnimatedNumber value={reportData.staff?.total || 0} />
                </div>
                <div style={{ fontSize: 11, color: C.textMut }}>
                  Total staff across {Object.keys(reportData.staff?.byLocation || {}).length} location{Object.keys(reportData.staff?.byLocation || {}).length !== 1 ? "s" : ""}
                </div>
              </div>

              {/* Per-location staff */}
              <div className="ent-card" style={{ gridColumn: "span 8", animationDelay: "0.84s" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Staff by Location</div>
                {(() => {
                  const staffLocs = reportData.staff?.byLocation || {};
                  const entries = Object.entries(staffLocs)
                    .map(([lid, members]) => ({ lid, count: members.length, members }))
                    .sort((a, b) => b.count - a.count);
                  const maxCount = entries.length > 0 ? Math.max(...entries.map(e => e.count)) : 1;
                  return entries.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", padding: 20 }}>No staff data available</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {entries.map((e, i) => {
                        const locName = allLocations.find(l => l.id === e.lid)?.name || e.lid;
                        const pct = maxCount > 0 ? (e.count / maxCount) * 100 : 0;
                        const color = LOC_COLORS[allLocations.findIndex(l => l.id === e.lid) % LOC_COLORS.length] || "#7C3AED";
                        return (
                          <div key={e.lid} style={{ animation: `entFadeIn 0.35s ${0.06 * i + 0.86}s both` }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{locName}</span>
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{e.count} staff</span>
                            </div>
                            <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
                              <div className="ent-bar-fill" style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, animationDelay: `${0.08 * i + 0.86}s` }} />
                            </div>
                            {reportExpanded.staff && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, animation: "entFadeIn 0.2s ease" }}>
                                {e.members.map((m, mi) => (
                                  <span key={m.id || mi} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${color}10`, color: C.textSec, border: `1px solid ${color}20` }}>
                                    {m.name || "—"}{m.role ? ` · ${m.role}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Drill-Down View (displayed in Modal)
   ═══════════════════════════════════════════════════════════════════════════ */
function DrillDownView({ location: loc, allLocations }) {
  const idx = allLocations.findIndex(l => l.id === loc.id);
  const color = LOC_COLORS[idx % LOC_COLORS.length];
  const allAvg = {
    occupancyRate: allLocations.reduce((s, l) => s + l.occupancyRate, 0) / allLocations.length,
    revenueTotal: allLocations.reduce((s, l) => s + l.revenueTotal, 0) / allLocations.length,
    conversionRate: allLocations.reduce((s, l) => s + l.conversionRate, 0) / allLocations.length,
    opsCompletion: Math.round(allLocations.reduce((s, l) => s + l.opsCompletion, 0) / allLocations.length),
    churnRate: allLocations.reduce((s, l) => s + l.churnRate, 0) / allLocations.length,
  };

  const compareVal = (val, avg, suffix = "", higherIsBetter = true) => {
    const diff = val - avg;
    const isBetter = higherIsBetter ? diff > 0 : diff < 0;
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: isBetter ? C.suc : C.dan }}>
        {diff > 0 ? "+" : ""}{diff.toFixed(1)}{suffix} vs avg
      </span>
    );
  };

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color }}>📍</span>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{loc.name}</div>
          <div style={{ fontSize: 12, color: C.textSec }}>{loc.region} · {loc.staffCount} staff · {loc.totalRooms} rooms</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <DrillKPI label="Revenue" value={`$${fmt$k(loc.revenueTotal)}`} color={color} compare={compareVal(loc.revenueTotal, allAvg.revenueTotal, "", true)} />
        <DrillKPI label="Occupancy" value={`${loc.occupancyRate.toFixed(1)}%`} color={loc.occupancyRate >= 80 ? C.suc : C.acc} compare={compareVal(loc.occupancyRate, allAvg.occupancyRate, "%", true)} />
        <DrillKPI label="Conversion Rate" value={`${loc.conversionRate.toFixed(1)}%`} color={loc.conversionRate >= 40 ? C.suc : C.acc} compare={compareVal(loc.conversionRate, allAvg.conversionRate, "%", true)} />
        <DrillKPI label="Ops Completion" value={`${loc.opsCompletion}%`} color={loc.opsCompletion >= 90 ? C.suc : C.warn} compare={compareVal(loc.opsCompletion, allAvg.opsCompletion, "%", true)} />
      </div>

      {/* Detailed metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left — Revenue breakdown */}
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>Revenue Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DrillRow label="Boarding Revenue" value={`$${fmt$k(loc.boardingRevenue)}`} />
            <DrillRow label="Daycare Revenue" value={`$${fmt$k(loc.daycareRevenue)}`} />
            <DrillRow label="Avg Transaction" value={`$${loc.avgTransaction}`} />
            <DrillRow label="RevPAR" value={`$${loc.revPAR.toFixed(2)}`} />
            <DrillRow label="Avg LTV" value={`$${loc.avgLTV.toLocaleString()}`} />
            <DrillRow label="Revenue Trend" value={<TrendBadge value={loc.revenueTrend} />} />
          </div>
        </Card>

        {/* Right — Operational stats */}
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>Operations & Funnel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DrillRow label="Dogs In House" value={loc.totalDogs} />
            <DrillRow label="Boarding / Daycare" value={`${loc.boardingDogs} / ${loc.daycareDogs}`} />
            <DrillRow label="Total Bookings" value={loc.bookings} />
            <DrillRow label="New Leads" value={loc.newLeads} />
            <DrillRow label="Contacted" value={loc.contacted} />
            <DrillRow label="New Customers" value={loc.newCustomers} />
            <DrillRow label="Churn Rate" value={<span style={{ color: loc.churnRate > 6 ? C.dan : C.suc, fontWeight: 600 }}>{loc.churnRate.toFixed(1)}%</span>} compare={compareVal(loc.churnRate, allAvg.churnRate, "%", false)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function DrillKPI({ label, value, color, compare }) {
  return (
    <div style={{ padding: "16px", borderRadius: 12, background: `${color}08`, border: `1.5px solid ${color}20`, textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      {compare}
    </div>
  );
}

function DrillRow({ label, value, compare }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.borderLight}` }}>
      <span style={{ fontSize: 12, color: C.textSec }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</span>
        {compare}
      </div>
    </div>
  );
}

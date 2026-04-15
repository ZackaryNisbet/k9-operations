// K9 Operations — HomePage
// Role-aware landing page. Staff roles see a clean "My Shift" summary
// directing them into My Work; managers/admins see an oversight dashboard
// with exception-first cards and shortcuts to key areas.
// Aligned to the mobile product's role-based mental model.

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, OPERATIONS_CATALOG } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Badge } from "../../shared/ui";
import { getOpsProgress, getOpsCountLabel, getRoomCleaningStats, getPPStats } from "../../shared/opsHelpers";
import { computeOccupancyMetrics, computeServiceMetrics } from "../../shared/metricsHelpers";
import { DEFAULT_INVENTORY_SCHEDULE, getInventoryCycleStart, getInventoryOverdueInfo, normalizeInventorySchedule } from "./inventorySchedule";

// ─── Role classification helper ──────────────────────────────────────────────
const STAFF_ROLES = new Set(["pct", "csr"]);
const MANAGER_ROLES = new Set(["supervisor", "manager", "mod"]);
const ADMIN_ROLES = new Set(["location_admin", "multi_location_admin", "enterprise_admin", "owner", "developer"]);

function classifyRole(roleCode, profileRole) {
  if (STAFF_ROLES.has(roleCode)) return "staff";
  if (MANAGER_ROLES.has(roleCode)) return "manager";
  if (ADMIN_ROLES.has(profileRole) || ADMIN_ROLES.has(roleCode)) return "admin";
  return "admin"; // default admin for owner/developer mock profiles
}

// ─── Shared header strip ─────────────────────────────────────────────────────
function HomeHeader({ greeting, subtitle }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{
        fontSize: 28, fontWeight: 800, color: C.text, margin: 0,
        letterSpacing: "-0.03em", lineHeight: 1.2,
      }}>
        {greeting}
      </h1>
      {subtitle && (
        <p style={{ fontSize: 14, color: C.textMut, marginTop: 6, fontWeight: 500 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function startOfWeek(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addDaysToDate(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function countReservationDays(reservations = [], startDate, endDate, predicate = () => true) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return reservations.reduce((sum, reservation) => {
    if (reservation?.status === "cancelled" || !predicate(reservation)) return sum;
    const reservationStart = new Date(`${reservation.checkIn}T00:00:00`);
    const reservationEnd = new Date(`${reservation.checkOut}T00:00:00`);
    const overlapStart = Math.max(start.getTime(), reservationStart.getTime());
    const overlapEnd = Math.min(end.getTime(), reservationEnd.getTime());
    if (overlapEnd < overlapStart) return sum;
    return sum + Math.floor((overlapEnd - overlapStart) / (24 * 60 * 60 * 1000)) + 1;
  }, 0);
}

function countReservationCheckIns(reservations = [], startDate, endDate, predicate = () => true) {
  return reservations.filter((reservation) => {
    if (reservation?.status === "cancelled" || !predicate(reservation)) return false;
    return reservation.checkIn >= startDate && reservation.checkIn <= endDate;
  }).length;
}

function buildWeekVolumeSummary(reservations = [], weekStart) {
  const weekEnd = addDaysToDate(weekStart, 6);
  const boardingDogDays = countReservationDays(
    reservations,
    weekStart,
    weekEnd,
    (reservation) => reservation.type === "boarding"
  );
  const daycareDogDays = countReservationDays(
    reservations,
    weekStart,
    weekEnd,
    (reservation) => reservation.type === "daycare" || reservation.type === "dayboarding"
  );
  const evals = countReservationCheckIns(
    reservations,
    weekStart,
    weekEnd,
    (reservation) => reservation.type === "evaluation" || String(reservation._resTypeName || "").toLowerCase().includes("eval")
  );
  const tours = countReservationCheckIns(
    reservations,
    weekStart,
    weekEnd,
    (reservation) => reservation.type === "tour"
  );

  return {
    boardingDogDays,
    daycareDogDays,
    totalDogDays: boardingDogDays + daycareDogDays,
    avgBoardingPerNight: Math.round(boardingDogDays / 7),
    avgDaycarePerDay: Math.round(daycareDogDays / 7),
    evals,
    tours,
  };
}

function buildInventoryQuickAccessState(snapshot, overdueInfo) {
  const isCompleted = !!snapshot?.completed_at || snapshot?.status === "completed";
  if (isCompleted) {
    return {
      desc: "Current cycle complete",
      badge: { label: "Complete", bg: C.sucLt, color: C.suc },
    };
  }
  if (overdueInfo.isOverdue) {
    return {
      desc: "Inventory count overdue",
      badge: { label: `${overdueInfo.daysOverdue}d overdue`, bg: "#FEF2F2", color: "#DC2626" },
    };
  }
  if (overdueInfo.isDueToday) {
    return {
      desc: "Inventory count due today",
      badge: { label: "Due today", bg: C.warnLt, color: C.warn },
    };
  }
  return {
    desc: "Current cycle in progress",
    badge: { label: "On track", bg: C.priLt, color: C.pri },
  };
}

function getDueSoonLabel(value) {
  const normalized = String(value || "").replace(/_/g, " ").trim();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Not started";
}

function buildBriefingSentences({ data, today, laborSummary, incidentSummary, grassrootsSummary }) {
  const occupancy = computeOccupancyMetrics(data, today);
  const services = computeServiceMetrics(data, today);
  const ppStats = getPPStats(data, today);
  const recommendedPcts = Math.max(
    1,
    Math.ceil((occupancy.boardingInHouse || 0) / 15),
    Math.ceil((services.bathsTotal || 0) / 6)
  );
  const currentWeek = buildWeekVolumeSummary(data.reservations || [], startOfWeek(today));
  const nextWeek = buildWeekVolumeSummary(data.reservations || [], addDaysToDate(startOfWeek(today), 7));
  const trendDirection = nextWeek.totalDogDays === currentWeek.totalDogDays
    ? "flat"
    : nextWeek.totalDogDays > currentWeek.totalDogDays
      ? "busier"
      : "slower";

  return [
    `Opening crew is walking ${occupancy.boardingInHouse || 0} boarding dogs, covering ${ppStats.totalDogs || 0} private-play dogs, and handling ${services.bathsTotal || 0} baths today. ${recommendedPcts} dedicated PCT${recommendedPcts === 1 ? " is" : "s are"} recommended for opening demand.`,
    `Confirmed volume this week is ${currentWeek.totalDogDays} dog-days, comprising ${currentWeek.boardingDogDays} boarding and ${currentWeek.daycareDogDays} daycare, with ${currentWeek.evals} eval${currentWeek.evals === 1 ? "" : "s"} and ${currentWeek.tours} tour${currentWeek.tours === 1 ? "" : "s"}. Next week is currently tracking ${trendDirection} at ${nextWeek.totalDogDays} dog-days, with ${nextWeek.boardingDogDays} boarding and ${nextWeek.daycareDogDays} daycare already on the books.`,
    `${laborSummary.newHiresThisWeek} new hire${laborSummary.newHiresThisWeek === 1 ? "" : "s"} started this week, ${laborSummary.terminationsThisWeek} termination${laborSummary.terminationsThisWeek === 1 ? "" : "s"} hit the roster, ${laborSummary.attendanceMarks7d} attendance mark${laborSummary.attendanceMarks7d === 1 ? "" : "s"} were logged in the last 7 days, and ${incidentSummary.incidents7d} incident case${incidentSummary.incidents7d === 1 ? "" : "s"} were filed in the same window.`,
    grassrootsSummary.isConfigured
      ? `Grassroots tracking shows ${grassrootsSummary.eventsThisWeek} event${grassrootsSummary.eventsThisWeek === 1 ? "" : "s"} this week and ${grassrootsSummary.eventsNextWeek} event${grassrootsSummary.eventsNextWeek === 1 ? "" : "s"} next week.`
      : "Grassroots tracking is not configured for this resort yet.",
  ];
}

function BriefingCard({ sentences }) {
  if (!sentences.length) return null;

  return (
    <div
      style={{
        padding: "18px 22px",
        borderRadius: 16,
        marginBottom: 24,
        background: "linear-gradient(135deg, rgba(20,83,45,0.08), rgba(132,204,22,0.10))",
        border: `1.5px solid ${C.pri}18`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        5 a.m. Briefing
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {sentences.map((sentence, index) => (
          <div key={index} style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            {sentence}
          </div>
        ))}
      </div>
    </div>
  );
}

function countGrassrootsEventsFromTracker(trackerValue, startDate, endDate) {
  const rows = Array.isArray(trackerValue?.events) ? trackerValue.events : [];
  return rows.filter((row) => {
    const eventDate = row?.startDate || row?.eventDate || "";
    return eventDate && eventDate >= startDate && eventDate <= endDate;
  }).length;
}

// ─── Quick-link card (used across all role variants) ─────────────────────────
function QuickCard({ label, desc, icon, onClick, accent, badge }) {
  const IconComp = I[icon];
  return (
    <div
      onClick={onClick}
      style={{
        padding: "20px 22px", borderRadius: 14, cursor: "pointer",
        background: C.surface, border: `1.5px solid ${C.border}`,
        transition: "all 0.2s", display: "flex", flexDirection: "column", gap: 8,
        minHeight: 110,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = (accent || C.pri) + "50";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: (accent || C.pri) + "12",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {IconComp && <IconComp style={{ width: 18, height: 18, color: accent || C.pri }} />}
        </div>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
            background: badge.bg || C.warnLt, color: badge.color || C.warn,
          }}>
            {badge.label}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{desc}</div>}
      </div>
    </div>
  );
}

// ─── Metric card (for oversight summaries) ───────────────────────────────────
function MetricCard({ label, value, subtext, color }) {
  return (
    <div style={{
      padding: "16px 20px", borderRadius: 12,
      background: C.surface, border: `1.5px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {subtext && <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{subtext}</div>}
    </div>
  );
}

// ─── Operations progress summary ─────────────────────────────────────────────
function OpsProgressSummary({ data, viewDate, nav }) {
  const summaries = useMemo(() => {
    const results = [];
    const serviceMetrics = computeServiceMetrics(data, viewDate);
    if (serviceMetrics.bathsTotal > 0) {
      results.push({
        label: "Bathing",
        typeSub: "bathing",
        route: "ops-bathing",
        progress: 0,
        countLabel: `${serviceMetrics.bathsTotal} scheduled`,
      });
    }
    const categories = [
      ...OPERATIONS_CATALOG
        .filter((item) => item.frequency === "daily" && item.typeSub && item.id !== "eod")
        .map((item) => ({
          label: item.label.replace("Checklist", "").trim(),
          typeSub: item.typeSub,
          route: item.routeTo,
        })),
    ].filter((item, index, items) => items.findIndex((candidate) => candidate.typeSub === item.typeSub) === index);

    categories.forEach(cat => {
      const item = OPERATIONS_CATALOG.find(c => c.typeSub === cat.typeSub || c.routeTo === cat.route);
      if (!item) return;
      const progress = getOpsProgress(data, item, viewDate);
      const countLabel = getOpsCountLabel(data, item, viewDate);
      results.push({ ...cat, progress, countLabel });
    });
    // Room cleaning enrichment
    const rs = getRoomCleaningStats(data, viewDate);
    if (rs.totalNeeded > 0) {
      const idx = results.findIndex(r => r.typeSub === "room_cleaning");
      if (idx >= 0) {
        results[idx].progress = Math.round((rs.totalDone / rs.totalNeeded) * 100);
        results[idx].countLabel = `${rs.totalDone}/${rs.totalNeeded} rooms`;
      }
    }
    // PP enrichment
    const pp = getPPStats(data, viewDate);
    if (pp.requiredSessions > 0) {
      const idx = results.findIndex(r => r.typeSub === "pp");
      if (idx >= 0) {
        results[idx].progress = Math.round((pp.completedSessions / pp.requiredSessions) * 100);
        results[idx].countLabel = `${pp.completedSessions}/${pp.requiredSessions} sessions`;
      }
    }
    return results.filter((item) => item.route && item.label);
  }, [data, viewDate]);

  if (summaries.length === 0) return null;

  return (
    <div style={{
      padding: "18px 22px", borderRadius: 14,
      background: C.surface, border: `1.5px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Operations Progress</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {summaries.map(s => (
          <div
            key={s.typeSub}
            onClick={() => nav(s.route)}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: s.progress === 100 ? C.suc : C.textMut }}>
                  {s.countLabel || `${s.progress}%`}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                <div style={{
                  width: `${s.progress || 0}%`, height: "100%", borderRadius: 3,
                  background: s.progress === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Staff Home (PCT / CSR) ──────────────────────────────────────────────────
function StaffHome({ data, nav, profile, roleCode }) {
  const td = todayStr();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Team";
  const roleName = roleCode === "csr" ? "CSR" : "PCT";

  // Load today's task progress
  const [taskStats, setTaskStats] = useState({ total: 0, done: 0 });
  useEffect(() => {
    const locationId = profile?.location_id;
    if (!locationId) return;
    Promise.all([
      supabase.from("role_page_config").select("task_id").eq("location_id", locationId).eq("role", roleCode || "pct").eq("is_active", true),
      supabase.from("role_page_task_state").select("task_id, completed").eq("location_id", locationId).eq("role", roleCode || "pct").eq("task_date", td),
    ]).then(([configRes, stateRes]) => {
      const total = configRes.data?.length || 0;
      const done = (stateRes.data || []).filter(r => r.completed).length;
      setTaskStats({ total, done });
    });
  }, [profile?.location_id, roleCode, td]);

  const pct = taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <HomeHeader
        greeting={`${greeting}, ${name}`}
        subtitle={`${roleName} shift \u2014 ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
      />

      {/* Today's progress summary */}
      <div style={{
        padding: "20px 24px", borderRadius: 16, marginBottom: 24,
        background: `linear-gradient(135deg, ${C.pri}08, ${C.acc}12)`,
        border: `1.5px solid ${C.pri}20`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Today's Progress</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? C.suc : C.pri }}>
            {taskStats.done}/{taskStats.total} tasks
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: C.borderLight, overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 5,
            background: pct === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
            transition: "width 0.4s ease",
          }} />
        </div>
        <button
          onClick={() => nav("role-page")}
          style={{
            marginTop: 14, padding: "10px 24px", borderRadius: 10, border: "none",
            background: C.pri, color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = C.priL}
          onMouseLeave={e => e.currentTarget.style.background = C.pri}
        >
          {taskStats.done === 0 ? "Start My Shift" : pct === 100 ? "Review Completed Work" : "Continue My Work"} \u2192
        </button>
      </div>

      {/* Quick links */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
        <QuickCard label="My Work" desc="View and complete today's tasks" icon="Clipboard" onClick={() => nav("role-page")} accent={C.pri} />
        <QuickCard label="Bathing" desc="Bath schedule and progress" icon="Droplet" onClick={() => nav("ops-bathing")} accent="#3B82F6" />
        <QuickCard label="Room Cleaning" desc="Room status and assignments" icon="Home" onClick={() => nav("ops-rooms")} accent="#8B5CF6" />
      </div>

      {/* Ops progress */}
      <OpsProgressSummary data={data} viewDate={td} nav={nav} />
    </div>
  );
}


// ─── Manager Home (MOD / Supervisor) ─────────────────────────────────────────
function ManagerHome({ data, nav, profile, briefingSentences, inventorySummary }) {
  const td = todayStr();
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Manager";
  const occupancy = useMemo(() => computeOccupancyMetrics(data, td), [data, td]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      />

      <BriefingCard sentences={briefingSentences} />

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard label="In House" value={occupancy.dogsInHouse} subtext="current guests" color={C.pri} />
        <MetricCard label="Arrivals" value={occupancy.arriving} subtext="expected today" color="#3B82F6" />
        <MetricCard label="Departures" value={occupancy.goingHome} subtext="going home" color="#8B5CF6" />
        <MetricCard label="Occupancy" value={`${occupancy.occupancyPct}%`} subtext={`${occupancy.totalRoomCount || 0} rooms in inventory`} color={C.warn} />
      </div>

      {/* Primary action cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="My Work" desc="Your personal task list" icon="Clipboard" onClick={() => nav("role-page")} accent="#3B82F6" />
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Grassroots" desc="Events, drops, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
      </div>

      {/* Ops progress */}
      <OpsProgressSummary data={data} viewDate={td} nav={nav} />
    </div>
  );
}


// ─── Admin/Owner Home ────────────────────────────────────────────────────────
function AdminHome({ data, nav, profile, analyticsMode, briefingSentences, inventorySummary }) {
  const td = todayStr();
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Admin";
  const occupancy = useMemo(() => computeOccupancyMetrics(data, td), [data, td]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      />

      <BriefingCard sentences={briefingSentences} />

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard label="In House" value={occupancy.dogsInHouse} subtext="current guests" color={C.pri} />
        <MetricCard label="Arrivals" value={occupancy.arriving} subtext="expected today" color="#3B82F6" />
        <MetricCard label="Departures" value={occupancy.goingHome} subtext="going home" color="#8B5CF6" />
        <MetricCard label="Occupancy" value={`${occupancy.occupancyPct}%`} subtext={`${occupancy.totalRoomCount || 0} rooms in inventory`} color={C.warn} />
      </div>

      {/* Primary shortcuts */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: C.textMut, textTransform: "uppercase",
        letterSpacing: "0.04em", marginBottom: 14,
      }}>
        Quick Access
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Grassroots" desc="Events, drops, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
        <QuickCard label="Settings" desc="Configuration and integrations" icon="Settings" onClick={() => nav("settings")} accent="#6B7280" />
      </div>

      {/* Secondary shortcuts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Photos" desc="Customer photo gallery" icon="Image" onClick={() => nav("photos")} accent="#EC4899" />
        <QuickCard label="Cash Tips" desc="Tip tracking" icon="DollarSign" onClick={() => nav("cash-tips")} accent="#F59E0B" />
        {analyticsMode && (
          <QuickCard label="Customer Lifecycle" desc="Leads, active, lapsed clients" icon="Users" onClick={() => nav("lifecycle")} accent="#3B82F6" />
        )}
      </div>

      {/* Ops progress */}
      <OpsProgressSummary data={data} viewDate={td} nav={nav} />
    </div>
  );
}


// ─── Main export ─────────────────────────────────────────────────────────────
function HomePage({ data, save, nav, profile, addGlobalToast, bohStats, analyticsMode, userLocationRoles, currentLocation }) {
  // Determine role classification.
  // userLocationRoles are role *definitions* (not per-user assignments) in
  // the production schema, so derive the code from profile.role instead.
  const roleCode = profile?.role;
  const tier = classifyRole(roleCode, profile?.role);
  const today = todayStr();
  const [briefingStats, setBriefingStats] = useState({
    laborSummary: {
      newHiresThisWeek: 0,
      terminationsThisWeek: 0,
      attendanceMarks7d: 0,
    },
    incidentSummary: {
      incidents7d: 0,
    },
    grassrootsSummary: {
      isConfigured: false,
      eventsThisWeek: 0,
      eventsNextWeek: 0,
    },
  });
  const [inventorySummary, setInventorySummary] = useState({
    desc: "Current cycle in progress",
    badge: { label: "On track", bg: C.priLt, color: C.pri },
  });

  useEffect(() => {
    let cancelled = false;

    async function loadBriefingStats() {
      const locationId = profile?.location_id || currentLocation;
      if (!locationId) return;

      const thisWeekStart = startOfWeek(today);
      const thisWeekEnd = addDaysToDate(thisWeekStart, 6);
      const nextWeekStart = addDaysToDate(thisWeekStart, 7);
      const nextWeekEnd = addDaysToDate(nextWeekStart, 6);
      const sevenDaysAgo = addDaysToDate(today, -6);

      const [
        laborRes,
        attendanceRes,
        incidentsRes,
        grassrootsThisWeekRes,
        grassrootsNextWeekRes,
        grassrootsTrackerRes,
      ] = await Promise.all([
        supabase
          .from("labor_roster_snapshot")
          .select("start_date,end_date")
          .eq("location_id", locationId),
        supabase
          .from("labor_attendance_incidents")
          .select("id,incident_date")
          .eq("location_id", locationId)
          .gte("incident_date", sevenDaysAgo)
          .lte("incident_date", today),
        supabase
          .from("client_incident_cases")
          .select("id,incident_date")
          .eq("location_id", locationId)
          .gte("incident_date", sevenDaysAgo)
          .lte("incident_date", today),
        supabase
          .from("grassroots_events")
          .select("id,event_date")
          .eq("location_id", locationId)
          .gte("event_date", thisWeekStart)
          .lte("event_date", thisWeekEnd),
        supabase
          .from("grassroots_events")
          .select("id,event_date")
          .eq("location_id", locationId)
          .gte("event_date", nextWeekStart)
          .lte("event_date", nextWeekEnd),
        supabase
          .from("lite_settings")
          .select("setting_value")
          .eq("location_id", locationId)
          .eq("setting_key", "grassroots_tracker")
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const laborRows = laborRes.error ? [] : (laborRes.data || []);
      const laborSummary = {
        newHiresThisWeek: laborRows.filter((row) => row.start_date && row.start_date >= thisWeekStart && row.start_date <= thisWeekEnd).length,
        terminationsThisWeek: laborRows.filter((row) => row.end_date && row.end_date >= thisWeekStart && row.end_date <= thisWeekEnd).length,
        attendanceMarks7d: attendanceRes.error ? 0 : ((attendanceRes.data || []).length),
      };
      const incidentSummary = {
        incidents7d: incidentsRes.error ? 0 : ((incidentsRes.data || []).length),
      };
      const trackerValue = grassrootsTrackerRes?.data?.setting_value || {};
      const fallbackThisWeek = countGrassrootsEventsFromTracker(trackerValue, thisWeekStart, thisWeekEnd);
      const fallbackNextWeek = countGrassrootsEventsFromTracker(trackerValue, nextWeekStart, nextWeekEnd);
      const grassrootsSummary = {
        isConfigured: (!grassrootsThisWeekRes.error && !grassrootsNextWeekRes.error) || fallbackThisWeek > 0 || fallbackNextWeek > 0,
        eventsThisWeek: grassrootsThisWeekRes.error ? fallbackThisWeek : ((grassrootsThisWeekRes.data || []).length),
        eventsNextWeek: grassrootsNextWeekRes.error ? fallbackNextWeek : ((grassrootsNextWeekRes.data || []).length),
      };

      setBriefingStats({ laborSummary, incidentSummary, grassrootsSummary });
    }

    loadBriefingStats();
    return () => {
      cancelled = true;
    };
  }, [currentLocation, profile?.location_id, today]);

  useEffect(() => {
    let cancelled = false;

    async function loadInventorySummary() {
      const locationId = profile?.location_id || currentLocation;
      if (!locationId) return;

      const { data: scheduleRow } = await supabase
        .from("lite_settings")
        .select("setting_value")
        .eq("location_id", locationId)
        .eq("setting_key", "inventory_schedule")
        .maybeSingle();

      if (cancelled) return;

      const schedule = normalizeInventorySchedule(scheduleRow?.setting_value || DEFAULT_INVENTORY_SCHEDULE, today);
      const cycleStart = getInventoryCycleStart(today, schedule);
      const { data: snapshot } = await supabase
        .from("inventory_snapshots")
        .select("status,completed_at")
        .eq("location_id", locationId)
        .eq("week_start", cycleStart)
        .maybeSingle();

      if (cancelled) return;

      const overdueInfo = getInventoryOverdueInfo(today, schedule, !!snapshot?.completed_at || snapshot?.status === "completed");
      setInventorySummary(buildInventoryQuickAccessState(snapshot, overdueInfo));
    }

    loadInventorySummary();
    return () => {
      cancelled = true;
    };
  }, [currentLocation, profile?.location_id, today]);

  const briefingSentences = useMemo(() => buildBriefingSentences({
    data,
    today,
    laborSummary: briefingStats.laborSummary,
    incidentSummary: briefingStats.incidentSummary,
    grassrootsSummary: briefingStats.grassrootsSummary,
  }), [briefingStats, data, today]);

  if (tier === "staff") {
    return <StaffHome data={data} nav={nav} profile={profile} roleCode={roleCode} />;
  }
  if (tier === "manager") {
    return <ManagerHome data={data} nav={nav} profile={profile} briefingSentences={briefingSentences} inventorySummary={inventorySummary} />;
  }
  return <AdminHome data={data} nav={nav} profile={profile} analyticsMode={analyticsMode} briefingSentences={briefingSentences} inventorySummary={inventorySummary} />;
}

export default HomePage;

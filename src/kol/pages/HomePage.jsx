// K9 Operations — HomePage
// Role-aware landing page. Staff roles see a clean "My Shift" summary
// directing them into My Work; managers/admins see an oversight dashboard
// with exception-first cards and shortcuts to key areas.
// Aligned to the mobile product's role-based mental model.

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, OPERATIONS_CATALOG } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Badge, Btn } from "../../shared/ui";
import { hasLeanPermission } from "../../shared/permissions";
import { getOpsProgress, getOpsCountLabel, getRoomCleaningStats, getPPStats } from "../../shared/opsHelpers";

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
    const categories = [
      { label: "Bathing", typeSub: "bathing", route: "ops-bathing" },
      { label: "Room Cleaning", typeSub: "room_cleaning", route: "ops-rooms" },
      { label: "Private Play", typeSub: "pp", route: "ops-pp" },
    ];
    categories.forEach(cat => {
      const item = OPERATIONS_CATALOG.find(c => c.typeSub === cat.typeSub);
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
    return results;
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
function ManagerHome({ data, nav, profile, bohStats }) {
  const td = todayStr();
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Manager";

  const occupancy = useMemo(() => {
    const res = data.reservations || [];
    const checkedIn = res.filter(r => r.status === "checked-in").length;
    const arriving = res.filter(r => r.checkIn === td && r.status !== "checked-in" && r.status !== "cancelled").length;
    const departing = res.filter(r => r.checkOut === td && r.status === "checked-in").length;
    return { inHouse: checkedIn, arriving, departing };
  }, [data.reservations, td]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      />

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard label="In House" value={bohStats?.total ?? occupancy.inHouse} subtext="current guests" color={C.pri} />
        <MetricCard label="Arrivals" value={occupancy.arriving} subtext="expected today" color="#3B82F6" />
        <MetricCard label="Departures" value={occupancy.departing} subtext="going home" color="#8B5CF6" />
        {bohStats?.pendingCount > 0 && (
          <MetricCard label="Pending" value={bohStats.pendingCount} subtext="not yet checked in" color={C.warn} />
        )}
      </div>

      {/* Primary action cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Operations Overview" desc="Full ops status and checklists" icon="Dashboard" onClick={() => nav("ops-hub")} accent={C.pri} />
        <QuickCard label="My Work" desc="Your personal task list" icon="Clipboard" onClick={() => nav("role-page")} accent="#3B82F6" />
        <QuickCard label="Inventory" desc="Weekly count status" icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="End of Day" desc="EOD report and notes" icon="FileText" onClick={() => nav("eod")} accent="#6B7280" />
      </div>

      {/* Ops progress */}
      <OpsProgressSummary data={data} viewDate={td} nav={nav} />
    </div>
  );
}


// ─── Admin/Owner Home ────────────────────────────────────────────────────────
function AdminHome({ data, nav, profile, bohStats, analyticsMode }) {
  const td = todayStr();
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Admin";

  const occupancy = useMemo(() => {
    const res = data.reservations || [];
    const checkedIn = res.filter(r => r.status === "checked-in").length;
    const arriving = res.filter(r => r.checkIn === td && r.status !== "checked-in" && r.status !== "cancelled").length;
    const departing = res.filter(r => r.checkOut === td && r.status === "checked-in").length;
    return { inHouse: checkedIn, arriving, departing };
  }, [data.reservations, td]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      />

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard label="In House" value={bohStats?.total ?? occupancy.inHouse} subtext="current guests" color={C.pri} />
        <MetricCard label="Arrivals" value={occupancy.arriving} subtext="expected today" color="#3B82F6" />
        <MetricCard label="Departures" value={occupancy.departing} subtext="going home" color="#8B5CF6" />
        {bohStats?.pendingCount > 0 && (
          <MetricCard label="Pending" value={bohStats.pendingCount} subtext="awaiting check-in" color={C.warn} />
        )}
      </div>

      {/* Primary shortcuts */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: C.textMut, textTransform: "uppercase",
        letterSpacing: "0.04em", marginBottom: 14,
      }}>
        Quick Access
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Analytics Dashboard" desc="Revenue, KPIs, and metrics" icon="Dashboard" onClick={() => nav("dashboard")} accent={C.pri} />
        <QuickCard label="Operations Overview" desc="Ops status across all categories" icon="Dashboard" onClick={() => nav("ops-hub")} accent="#059669" />
        <QuickCard label="Inventory" desc="Weekly count progress" icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Settings" desc="Configuration and integrations" icon="Settings" onClick={() => nav("settings")} accent="#6B7280" />
      </div>

      {/* Secondary shortcuts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Photos" desc="Customer photo gallery" icon="Image" onClick={() => nav("photos")} accent="#EC4899" />
        <QuickCard label="End of Day" desc="EOD reports" icon="FileText" onClick={() => nav("eod")} accent="#6B7280" />
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
  // Determine role classification
  const currentRole = (userLocationRoles || []).find(r => r.location_id === currentLocation);
  const roleCode = currentRole?.role_code || currentRole?.role;
  const tier = classifyRole(roleCode, profile?.role);

  if (tier === "staff") {
    return <StaffHome data={data} nav={nav} profile={profile} roleCode={roleCode} />;
  }
  if (tier === "manager") {
    return <ManagerHome data={data} nav={nav} profile={profile} bohStats={bohStats} />;
  }
  return <AdminHome data={data} nav={nav} profile={profile} bohStats={bohStats} analyticsMode={analyticsMode} />;
}

export default HomePage;

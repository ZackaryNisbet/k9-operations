// K9 Operations — HomePage
// Role-aware landing page. Staff roles see a clean "My Shift" summary
// directing them into My Work; managers/admins see an oversight dashboard
// aligned to the shared mobile dashboard snapshot contract.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { DEFAULT_INVENTORY_SCHEDULE, getInventoryCycleStart, getInventoryOverdueInfo, normalizeInventorySchedule } from "./inventorySchedule";

const STAFF_ROLES = new Set(["pct", "csr"]);
const MANAGER_ROLES = new Set(["supervisor", "manager", "mod"]);
const ADMIN_ROLES = new Set(["location_admin", "multi_location_admin", "enterprise_admin", "owner", "developer"]);

const WORKFLOW_ROUTE_MAP = {
  bathing: { page: "ops-bathing" },
  pamper: { page: "ops-pamper" },
  enrichment: { page: "ops-svc" },
  ice_cream: { page: "ops-svc" },
  rooms: { page: "ops-rooms" },
  play: { page: "ops-pp" },
  "weekly-maintenance": { page: "ops-weekly-maintenance" },
  belongings: { page: "ops-belongings" },
  collars: { page: "ops-collars" },
  "lodging-transfer": { page: "ops-lodging-transfers" },
  "roll-call-opening": { page: "ops-roll-call-opening" },
  "roll-call-closing": { page: "ops-roll-call-closing" },
};

function classifyRole(roleCode, profileRole) {
  if (STAFF_ROLES.has(roleCode)) return "staff";
  if (MANAGER_ROLES.has(roleCode)) return "manager";
  if (ADMIN_ROLES.has(profileRole) || ADMIN_ROLES.has(roleCode)) return "admin";
  return "admin";
}

function HomeHeader({ greeting, subtitle }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: C.text,
          margin: 0,
          letterSpacing: "-0.03em",
          lineHeight: 1.2,
        }}
      >
        {greeting}
      </h1>
      {subtitle ? (
        <p style={{ fontSize: 14, color: C.textMut, marginTop: 6, fontWeight: 500 }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function QuickCard({ label, desc, icon, onClick, accent, badge }) {
  const IconComp = I[icon];
  return (
    <div
      onClick={onClick}
      style={{
        padding: "20px 22px",
        borderRadius: 14,
        cursor: "pointer",
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        transition: "all 0.2s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 110,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = `${accent || C.pri}50`;
        event.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.06)";
        event.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = C.border;
        event.currentTarget.style.boxShadow = "none";
        event.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${accent || C.pri}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {IconComp ? <IconComp style={{ width: 18, height: 18, color: accent || C.pri }} /> : null}
        </div>
        {badge ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 20,
              background: badge.bg || C.warnLt,
              color: badge.color || C.warn,
            }}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</div>
        {desc ? <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{desc}</div> : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtext, color, live }) {
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 12,
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        position: "relative",
      }}
    >
      {live ? (
        <span style={{ position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: "50%", background: C.suc }} />
      ) : null}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: C.textMut,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {subtext ? <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{subtext}</div> : null}
    </div>
  );
}

function getWorkflowNavTarget(workflowId, title) {
  const target = WORKFLOW_ROUTE_MAP[workflowId];
  if (!target) return null;
  if (workflowId === "enrichment" || workflowId === "ice_cream") {
    return { page: target.page, params: { svcName: title } };
  }
  return target;
}

function WorkflowProgressPanel({ rows, nav }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div
      style={{
        padding: "18px 22px",
        borderRadius: 14,
        background: C.surface,
        border: `1.5px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Workflow Progress</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => {
          const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
          const isComplete = row.total > 0 && row.completed >= row.total;
          const navTarget = getWorkflowNavTarget(row.id, row.title);
          return (
            <button
              key={row.id}
              type="button"
              disabled={!navTarget}
              onClick={() => {
                if (!navTarget) return;
                nav(navTarget.page, navTarget.params || {});
              }}
              style={{
                cursor: navTarget ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
                textAlign: "left",
                opacity: navTarget ? 1 : 0.7,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{row.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? C.suc : C.textMut }}>
                    {row.completed}/{row.total}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: isComplete ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
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

function useHomeDashboardSnapshot(locationId, userRole) {
  const [snapshot, setSnapshot] = useState({
    metrics: null,
    liveSnapshot: null,
    workflowProgress: [],
    loading: true,
  });

  const loadSnapshot = useCallback(async () => {
    if (!locationId) {
      setSnapshot({ metrics: null, liveSnapshot: null, workflowProgress: [], loading: false });
      return;
    }

    const { data, error } = await supabase.rpc("dashboard_mobile_snapshot", {
      p_location_id: locationId,
      p_view_date: todayStr(),
      p_user_role: userRole || "employee",
    });

    if (error) {
      console.error("dashboard_mobile_snapshot failed:", error);
      setSnapshot((current) => ({ ...current, loading: false }));
      return;
    }

    const payload = data || {};
    setSnapshot({
      metrics: payload.metrics && Object.keys(payload.metrics).length > 0 ? payload.metrics : null,
      liveSnapshot: payload.liveSnapshot || null,
      workflowProgress: Array.isArray(payload.workflowProgress) ? payload.workflowProgress : [],
      loading: false,
    });
  }, [locationId, userRole]);

  useEffect(() => {
    if (!locationId) return undefined;
    let cancelled = false;

    const triggerSync = async () => {
      if (cancelled) return;
      try {
        await supabase.functions.invoke("gingr-sync", {
          body: { location_id: locationId, sync_type: "tv-poll" },
        });
      } catch {
        // Non-fatal. Snapshot reads still work with the latest persisted data.
      }
    };

    triggerSync();
    const interval = setInterval(triggerSync, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [locationId]);

  useEffect(() => {
    loadSnapshot();
    const interval = setInterval(loadSnapshot, 10_000);
    return () => clearInterval(interval);
  }, [loadSnapshot]);

  return snapshot;
}

function StaffHome({ nav, profile, roleCode, locationId, workflowProgress }) {
  const td = todayStr();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Team";
  const roleName = roleCode === "csr" ? "CSR" : "PCT";
  const [taskStats, setTaskStats] = useState({ total: 0, done: 0 });

  const loadTaskStats = useCallback(() => {
    const taskLocationId = profile?.location_id || locationId;
    if (!taskLocationId) return;
    Promise.all([
      supabase.from("role_page_config").select("task_id").eq("location_id", taskLocationId).eq("role", roleCode || "pct").eq("is_active", true),
      supabase.from("role_page_task_state").select("task_id, completed").eq("location_id", taskLocationId).eq("role", roleCode || "pct").eq("task_date", td),
    ]).then(([configRes, stateRes]) => {
      const total = configRes.data?.length || 0;
      const done = (stateRes.data || []).filter((row) => row.completed).length;
      setTaskStats({ total, done });
    });
  }, [locationId, profile?.location_id, roleCode, td]);

  useEffect(() => {
    loadTaskStats();
  }, [loadTaskStats]);

  useEffect(() => {
    const taskLocationId = profile?.location_id || locationId;
    if (!taskLocationId) return undefined;

    const channel = supabase
      .channel(`home-task-stats-${taskLocationId}-${roleCode || "pct"}-${td}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_page_task_state", filter: `location_id=eq.${taskLocationId}` },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (row?.role === (roleCode || "pct") && row?.task_date === td) {
            loadTaskStats();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_page_config", filter: `location_id=eq.${taskLocationId}` },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (String(row?.role || "").toLowerCase() === String(roleCode || "pct").toLowerCase()) {
            loadTaskStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTaskStats, locationId, profile?.location_id, roleCode, td]);

  const pct = taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <HomeHeader
        greeting={`${greeting}, ${name}`}
        subtitle={`${roleName} shift — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
      />

      <div
        style={{
          padding: "20px 24px",
          borderRadius: 16,
          marginBottom: 24,
          background: `linear-gradient(135deg, ${C.pri}08, ${C.acc}12)`,
          border: `1.5px solid ${C.pri}20`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Today's Progress</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? C.suc : C.pri }}>
            {taskStats.done}/{taskStats.total} tasks
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: C.borderLight, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 5,
              background: pct === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <button
          onClick={() => nav("role-page")}
          style={{
            marginTop: 14,
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            background: C.pri,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = C.priL;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = C.pri;
          }}
        >
          {taskStats.done === 0 ? "Start My Shift" : pct === 100 ? "Review Completed Work" : "Continue My Work"} →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
        <QuickCard label="My Work" desc="View and complete today's tasks" icon="Clipboard" onClick={() => nav("role-page")} accent={C.pri} />
        <QuickCard label="Bathing" desc="Bath schedule and progress" icon="Droplet" onClick={() => nav("ops-bathing")} accent="#3B82F6" />
        <QuickCard label="Room Cleaning" desc="Room status and assignments" icon="Home" onClick={() => nav("ops-rooms")} accent="#8B5CF6" />
      </div>

      <WorkflowProgressPanel rows={workflowProgress} nav={nav} />
    </div>
  );
}

function ManagerHome({ nav, profile, inventorySummary, locationId, snapshot }) {
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Manager";
  const live = snapshot.liveSnapshot || {};
  const metrics = snapshot.metrics || {};

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard
          label="In House"
          value={live.in_house ?? metrics.dogs_in_house ?? "—"}
          subtext={`${live.boarding ?? metrics.boarding_in_house ?? 0}B · ${live.daycare ?? metrics.daycare_in_house ?? 0}D`}
          color={C.pri}
          live={!!snapshot.liveSnapshot}
        />
        <MetricCard label="Arrivals" value={live.expected ?? metrics.dogs_expected ?? "—"} subtext="expected today" color="#3B82F6" live={!!snapshot.liveSnapshot} />
        <MetricCard label="Departures" value={live.going_home ?? metrics.dogs_going_home ?? "—"} subtext="going home today" color="#8B5CF6" live={!!snapshot.liveSnapshot} />
        <MetricCard
          label="Occupancy"
          value={`${live.occupancy_pct ?? metrics.occupancy_pct ?? 0}%`}
          subtext={`${metrics.total_room_count || 0} rooms in inventory`}
          color={C.warn}
          live={!!snapshot.liveSnapshot}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="My Work" desc="Your personal task list" icon="Clipboard" onClick={() => nav("role-page")} accent="#3B82F6" />
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Today's Notes" desc="Owner and dog notes from Gingr" icon="Clipboard" onClick={() => nav("checkout-notes")} accent="#0EA5E9" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Grassroots" desc="Events, drops, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
      </div>

      <WorkflowProgressPanel rows={snapshot.workflowProgress} nav={nav} />
    </div>
  );
}

function AdminHome({ nav, profile, analyticsMode, inventorySummary, snapshot }) {
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Admin";
  const live = snapshot.liveSnapshot || {};
  const metrics = snapshot.metrics || {};

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard
          label="In House"
          value={live.in_house ?? metrics.dogs_in_house ?? "—"}
          subtext={`${live.boarding ?? metrics.boarding_in_house ?? 0}B · ${live.daycare ?? metrics.daycare_in_house ?? 0}D`}
          color={C.pri}
          live={!!snapshot.liveSnapshot}
        />
        <MetricCard label="Arrivals" value={live.expected ?? metrics.dogs_expected ?? "—"} subtext="expected today" color="#3B82F6" live={!!snapshot.liveSnapshot} />
        <MetricCard label="Departures" value={live.going_home ?? metrics.dogs_going_home ?? "—"} subtext="going home today" color="#8B5CF6" live={!!snapshot.liveSnapshot} />
        <MetricCard
          label="Occupancy"
          value={`${live.occupancy_pct ?? metrics.occupancy_pct ?? 0}%`}
          subtext={`${metrics.total_room_count || 0} rooms in inventory`}
          color={C.warn}
          live={!!snapshot.liveSnapshot}
        />
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: C.textMut,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 14,
        }}
      >
        Quick Access
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Today's Notes" desc="Owner and dog notes from Gingr" icon="Clipboard" onClick={() => nav("checkout-notes")} accent="#0EA5E9" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Grassroots" desc="Events, drops, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
        <QuickCard label="Settings" desc="Configuration and integrations" icon="Settings" onClick={() => nav("settings")} accent="#6B7280" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="Photos" desc="Customer photo gallery" icon="Image" onClick={() => nav("photos")} accent="#EC4899" />
        <QuickCard label="Cash Tips" desc="Tip tracking" icon="DollarSign" onClick={() => nav("cash-tips")} accent="#F59E0B" />
        {analyticsMode ? (
          <QuickCard label="Customer Lifecycle" desc="Leads, active, lapsed clients" icon="Users" onClick={() => nav("lifecycle")} accent="#3B82F6" />
        ) : null}
      </div>

      <WorkflowProgressPanel rows={snapshot.workflowProgress} nav={nav} />
    </div>
  );
}

function HomePage({ nav, profile, analyticsMode, currentLocation }) {
  const roleCode = profile?.role;
  const tier = classifyRole(roleCode, profile?.role);
  const today = todayStr();
  const locationId = profile?.location_id || currentLocation;
  const snapshot = useHomeDashboardSnapshot(locationId, roleCode);
  const [inventorySummary, setInventorySummary] = useState({
    desc: "Current cycle in progress",
    badge: { label: "On track", bg: C.priLt, color: C.pri },
  });

  useEffect(() => {
    let cancelled = false;

    async function loadInventorySummary() {
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
      const { data: snapshotRow } = await supabase
        .from("inventory_snapshots")
        .select("status,completed_at")
        .eq("location_id", locationId)
        .eq("week_start", cycleStart)
        .maybeSingle();

      if (cancelled) return;

      const overdueInfo = getInventoryOverdueInfo(today, schedule, !!snapshotRow?.completed_at || snapshotRow?.status === "completed");
      setInventorySummary(buildInventoryQuickAccessState(snapshotRow, overdueInfo));
    }

    loadInventorySummary();
    return () => {
      cancelled = true;
    };
  }, [locationId, today]);

  if (tier === "staff") {
    return (
      <StaffHome
        nav={nav}
        profile={profile}
        roleCode={roleCode}
        locationId={locationId}
        workflowProgress={snapshot.workflowProgress}
      />
    );
  }

  if (tier === "manager") {
    return (
      <ManagerHome
        nav={nav}
        profile={profile}
        inventorySummary={inventorySummary}
        locationId={locationId}
        snapshot={snapshot}
      />
    );
  }

  return (
    <AdminHome
      nav={nav}
      profile={profile}
      analyticsMode={analyticsMode}
      inventorySummary={inventorySummary}
      snapshot={snapshot}
    />
  );
}

export default HomePage;

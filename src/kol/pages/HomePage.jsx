// K9 Operations — HomePage
// Role-aware landing page. Staff roles see a clean "My Shift" summary
// directing them into My Work; managers/admins see an oversight dashboard
// aligned to the shared mobile dashboard snapshot contract.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr } from "../../shared/theme";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import { useEnrichmentWorkflow } from "../../hooks/useEnrichmentWorkflow";
import { useWeatherData } from "../../hooks/useWeatherData";
import { useWeatherDisplaySettings } from "../../hooks/useWeatherDisplaySettings";
import TodayEnrichmentCard from "../enrichments/TodayEnrichmentCard";
import { DEFAULT_INVENTORY_SCHEDULE, getInventoryCycleStart, getInventoryOverdueInfo, normalizeInventorySchedule } from "./inventorySchedule";
import { classifyRole } from "./home/roleClassification";
import { HomeHeader, QuickCard, MetricCard, WorkflowProgressPanel } from "./home/cards";
import { HomeWeatherButton, HomeWeatherCard, HomeWeatherModal } from "./home/weatherWidgets";
import { formatBoardingDaycareSubtext, formatRoomsOccupiedSubtext } from "./home/dashboardMetrics";
import { buildPlatformHealthFailure } from "./home/platformHealthUtils";
import { HomePlatformHealthButton, HomePlatformHealthModal } from "./home/platformHealthWidgets";
import { buildInventoryQuickAccessState } from "./home/inventoryQuickAccess";

function usePlatformHealth(locationId, date) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId) return undefined;
    let cancelled = false;
    let previousHealth = health;

    const loadHealth = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ops-platform-health", {
          body: { location_id: locationId, date },
        });
        if (error) throw error;
        if (!cancelled) {
          previousHealth = data || null;
          setHealth(data || null);
        }
      } catch (error) {
        const fallback = await buildPlatformHealthFailure(error, previousHealth);
        if (!cancelled) {
          previousHealth = fallback;
          setHealth(fallback);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadHealth();
    const interval = setInterval(loadHealth, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [locationId, date]);

  return { health, loading };
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
    loadSnapshot();
    const interval = setInterval(loadSnapshot, 10_000);
    return () => clearInterval(interval);
  }, [loadSnapshot]);

  return snapshot;
}

function StaffHome({
  nav,
  profile,
  roleCode,
  locationId,
  workflowProgress,
  healthButton,
  weatherCard,
  enrichmentEvents,
  enrichmentLoading,
  enrichmentWorkflow,
  enrichmentWorkflowLoading,
}) {
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
        rightSlot={healthButton}
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

      <div style={{ marginBottom: 24 }}>
        <TodayEnrichmentCard
          events={enrichmentEvents}
          nav={nav}
          loading={enrichmentLoading}
          enrichmentWorkflow={enrichmentWorkflow}
          workflowLoading={enrichmentWorkflowLoading}
          dashboardPreview
        />
      </div>

      {weatherCard}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
        <QuickCard label="My Work" desc="View and complete today's tasks" icon="Clipboard" onClick={() => nav("role-page")} accent={C.pri} />
        <QuickCard label="Enrichments" desc="Daily event, SOP, and calendar" icon="Sparkle" onClick={() => nav("enrichments")} accent="#F97316" />
        <QuickCard label="Bathing" desc="Bath schedule and progress" icon="Droplet" onClick={() => nav("ops-bathing")} accent="#3B82F6" />
        <QuickCard label="Room Cleaning" desc="Room status and assignments" icon="Home" onClick={() => nav("ops-rooms")} accent="#8B5CF6" />
      </div>

      <WorkflowProgressPanel rows={workflowProgress} nav={nav} />
    </div>
  );
}

function ManagerHome({
  nav,
  profile,
  inventorySummary,
  locationId,
  snapshot,
  healthButton,
  weatherCard,
  enrichmentEvents,
  enrichmentLoading,
  enrichmentWorkflow,
  enrichmentWorkflowLoading,
}) {
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Manager";
  const live = snapshot.liveSnapshot || {};
  const metrics = snapshot.metrics || {};
  const arrivalsSubtext = formatBoardingDaycareSubtext({
    boarding: live.expected_boarding ?? live.arrivals_boarding ?? metrics.expected_boarding ?? metrics.arrivals_boarding,
    daycare: live.expected_daycare ?? live.arrivals_daycare ?? metrics.expected_daycare ?? metrics.arrivals_daycare,
    total: live.expected ?? metrics.dogs_expected,
    fallbackLabel: "expected today",
  });
  const departuresSubtext = formatBoardingDaycareSubtext({
    boarding: live.going_home_boarding ?? live.departures_boarding ?? metrics.going_home_boarding ?? metrics.departures_boarding,
    daycare: live.going_home_daycare ?? live.departures_daycare ?? metrics.going_home_daycare ?? metrics.departures_daycare,
    total: live.going_home ?? metrics.dogs_going_home,
    fallbackLabel: "going home today",
  });
  const roomsSubtext = formatRoomsOccupiedSubtext({
    occupied: live.rooms_occupied ?? metrics.accrual_rooms_occupied,
    total: live.total_rooms ?? live.total_room_count ?? metrics.total_room_count,
    occupancyPct: live.occupancy_pct ?? metrics.occupancy_pct,
  });

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        rightSlot={healthButton}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard
          label="In House"
          value={live.in_house ?? metrics.dogs_in_house ?? "—"}
          subtext={`${live.boarding ?? metrics.boarding_in_house ?? 0}B · ${live.daycare ?? metrics.daycare_in_house ?? 0}D`}
          color={C.pri}
          live={!!snapshot.liveSnapshot}
        />
        <MetricCard label="Arrivals" value={live.expected ?? metrics.dogs_expected ?? "—"} subtext={arrivalsSubtext} color="#3B82F6" live={!!snapshot.liveSnapshot} />
        <MetricCard label="Departures" value={live.going_home ?? metrics.dogs_going_home ?? "—"} subtext={departuresSubtext} color="#8B5CF6" live={!!snapshot.liveSnapshot} />
        <MetricCard
          label="Occupancy"
          value={`${live.occupancy_pct ?? metrics.occupancy_pct ?? 0}%`}
          subtext={roomsSubtext}
          color={C.warn}
          live={!!snapshot.liveSnapshot}
        />
      </div>

      <div style={{ marginBottom: 28 }}>
        <TodayEnrichmentCard
          events={enrichmentEvents}
          nav={nav}
          loading={enrichmentLoading}
          enrichmentWorkflow={enrichmentWorkflow}
          workflowLoading={enrichmentWorkflowLoading}
          dashboardPreview
        />
      </div>

      {weatherCard}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickCard label="My Work" desc="Your personal task list" icon="Clipboard" onClick={() => nav("role-page")} accent="#3B82F6" />
        <QuickCard label="Enrichments" desc="Calendar, SOP, and product prep" icon="Sparkle" onClick={() => nav("enrichments")} accent="#F97316" />
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Today's Notes" desc="Owner and dog notes from Gingr" icon="Clipboard" onClick={() => nav("checkout-notes")} accent="#0EA5E9" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Marketing" desc="Events, visits, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
        <QuickCard label="Calendar" desc="Aggregated schedule across the resort" icon="Calendar" onClick={() => nav("calendar")} accent="#6366F1" />
        <QuickCard label="CRM" desc="Booking and employment inquiries" icon="MessageSquare" onClick={() => nav("crm")} accent="#0891B2" />
        <QuickCard label="Marketing Directory" desc="Organizations and contacts" icon="Users" onClick={() => nav("marketing-directory")} accent="#DB2777" />
      </div>

      <WorkflowProgressPanel rows={snapshot.workflowProgress} nav={nav} />
    </div>
  );
}

function AdminHome({
  nav,
  profile,
  analyticsMode,
  inventorySummary,
  snapshot,
  healthButton,
  weatherCard,
  enrichmentEvents,
  enrichmentLoading,
  enrichmentWorkflow,
  enrichmentWorkflowLoading,
}) {
  const name = (profile?.full_name || profile?.name || "").split(" ")[0] || "Admin";
  const live = snapshot.liveSnapshot || {};
  const metrics = snapshot.metrics || {};
  const arrivalsSubtext = formatBoardingDaycareSubtext({
    boarding: live.expected_boarding ?? live.arrivals_boarding ?? metrics.expected_boarding ?? metrics.arrivals_boarding,
    daycare: live.expected_daycare ?? live.arrivals_daycare ?? metrics.expected_daycare ?? metrics.arrivals_daycare,
    total: live.expected ?? metrics.dogs_expected,
    fallbackLabel: "expected today",
  });
  const departuresSubtext = formatBoardingDaycareSubtext({
    boarding: live.going_home_boarding ?? live.departures_boarding ?? metrics.going_home_boarding ?? metrics.departures_boarding,
    daycare: live.going_home_daycare ?? live.departures_daycare ?? metrics.going_home_daycare ?? metrics.departures_daycare,
    total: live.going_home ?? metrics.dogs_going_home,
    fallbackLabel: "going home today",
  });
  const roomsSubtext = formatRoomsOccupiedSubtext({
    occupied: live.rooms_occupied ?? metrics.accrual_rooms_occupied,
    total: live.total_rooms ?? live.total_room_count ?? metrics.total_room_count,
    occupancyPct: live.occupancy_pct ?? metrics.occupancy_pct,
  });

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <HomeHeader
        greeting={`Welcome back, ${name}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        rightSlot={healthButton}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard
          label="In House"
          value={live.in_house ?? metrics.dogs_in_house ?? "—"}
          subtext={`${live.boarding ?? metrics.boarding_in_house ?? 0}B · ${live.daycare ?? metrics.daycare_in_house ?? 0}D`}
          color={C.pri}
          live={!!snapshot.liveSnapshot}
        />
        <MetricCard label="Arrivals" value={live.expected ?? metrics.dogs_expected ?? "—"} subtext={arrivalsSubtext} color="#3B82F6" live={!!snapshot.liveSnapshot} />
        <MetricCard label="Departures" value={live.going_home ?? metrics.dogs_going_home ?? "—"} subtext={departuresSubtext} color="#8B5CF6" live={!!snapshot.liveSnapshot} />
        <MetricCard
          label="Occupancy"
          value={`${live.occupancy_pct ?? metrics.occupancy_pct ?? 0}%`}
          subtext={roomsSubtext}
          color={C.warn}
          live={!!snapshot.liveSnapshot}
        />
      </div>

      <div style={{ marginBottom: 28 }}>
        <TodayEnrichmentCard
          events={enrichmentEvents}
          nav={nav}
          loading={enrichmentLoading}
          enrichmentWorkflow={enrichmentWorkflow}
          workflowLoading={enrichmentWorkflowLoading}
          dashboardPreview
        />
      </div>

      {weatherCard}

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
        <QuickCard label="Enrichments" desc="Calendar, SOP, and product prep" icon="Sparkle" onClick={() => nav("enrichments")} accent="#F97316" />
        <QuickCard label="Inventory" desc={inventorySummary.desc} badge={inventorySummary.badge} icon="Package" onClick={() => nav("inventory")} accent="#8B5CF6" />
        <QuickCard label="Today's Notes" desc="Owner and dog notes from Gingr" icon="Clipboard" onClick={() => nav("checkout-notes")} accent="#0EA5E9" />
        <QuickCard label="Checkout TV" desc="Lobby departures and pickups" icon="Monitor" onClick={() => nav("checkout-tv")} accent="#EC4899" />
        <QuickCard label="Scheduling" desc="Demand matrix and labor plan" icon="Calendar" onClick={() => nav("scheduling")} accent="#059669" />
        <QuickCard label="Labor" desc="Roster, training, and compliance" icon="GraduationCap" onClick={() => nav("training")} accent="#2563EB" />
        <QuickCard label="Incidents" desc="Incident cases and forms" icon="AlertTriangle" onClick={() => nav("client-management")} accent="#DC2626" />
        <QuickCard label="Resources" desc="SOPs, trackers, and shared docs" icon="Book" onClick={() => nav("resources")} accent="#7C3AED" />
        <QuickCard label="Marketing" desc="Events, visits, and local outreach" icon="TrendingUp" onClick={() => nav("grassroots")} accent="#EA580C" />
        <QuickCard label="Calendar" desc="Aggregated schedule across the resort" icon="Calendar" onClick={() => nav("calendar")} accent="#6366F1" />
        <QuickCard label="CRM" desc="Booking and employment inquiries" icon="MessageSquare" onClick={() => nav("crm")} accent="#0891B2" />
        <QuickCard label="Marketing Directory" desc="Organizations and contacts" icon="Users" onClick={() => nav("marketing-directory")} accent="#DB2777" />
        <QuickCard label="Resort Upkeep" desc="Cleaning and facility checklists" icon="ClipboardCheck" onClick={() => nav("resort-upkeep")} accent="#0D9488" />
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
  const { events: enrichmentEvents, loading: enrichmentLoading } = useEnrichmentEvents(locationId, today);
  const enrichmentWorkflowState = useEnrichmentWorkflow(locationId, today, {
    actorName: profile?.full_name || profile?.name || "Staff",
    autoCompute: Boolean(locationId),
  });
  const { health: platformHealth, loading: platformHealthLoading } = usePlatformHealth(locationId, today);
  const [showPlatformHealth, setShowPlatformHealth] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const { showDashboardWeather } = useWeatherDisplaySettings(locationId || "cherry-hill");
  const {
    getWeatherForDate,
    loading: weatherLoading,
    error: weatherError,
    limitations: weatherLimitations,
    refresh: refreshWeather,
  } = useWeatherData(locationId || "cherry-hill", today, today, {
    enabled: showDashboardWeather && Boolean(locationId || "cherry-hill"),
  });
  const weather = getWeatherForDate(today);
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

  const healthButton = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {showDashboardWeather ? (
        <HomeWeatherButton
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
          onClick={() => setShowWeather(true)}
        />
      ) : null}
      <HomePlatformHealthButton
        health={platformHealth}
        loading={platformHealthLoading}
        onClick={() => setShowPlatformHealth(true)}
      />
    </div>
  );
  const weatherCard = showDashboardWeather ? (
    <HomeWeatherCard
      weather={weather}
      loading={weatherLoading}
      error={weatherError}
      limitations={weatherLimitations}
      targetDate={today}
      onOpen={() => setShowWeather(true)}
    />
  ) : null;

  let content;
  if (tier === "staff") {
    content = (
      <StaffHome
        nav={nav}
        profile={profile}
        roleCode={roleCode}
        locationId={locationId}
        workflowProgress={snapshot.workflowProgress}
        healthButton={healthButton}
        weatherCard={weatherCard}
        enrichmentEvents={enrichmentEvents}
        enrichmentLoading={enrichmentLoading}
        enrichmentWorkflow={enrichmentWorkflowState.workflow}
        enrichmentWorkflowLoading={enrichmentWorkflowState.loading || enrichmentWorkflowState.refreshing}
      />
    );
  } else if (tier === "manager") {
    content = (
      <ManagerHome
        nav={nav}
        profile={profile}
        inventorySummary={inventorySummary}
        locationId={locationId}
        snapshot={snapshot}
        healthButton={healthButton}
        weatherCard={weatherCard}
        enrichmentEvents={enrichmentEvents}
        enrichmentLoading={enrichmentLoading}
        enrichmentWorkflow={enrichmentWorkflowState.workflow}
        enrichmentWorkflowLoading={enrichmentWorkflowState.loading || enrichmentWorkflowState.refreshing}
      />
    );
  } else {
    content = (
      <AdminHome
        nav={nav}
        profile={profile}
        analyticsMode={analyticsMode}
        inventorySummary={inventorySummary}
        snapshot={snapshot}
        healthButton={healthButton}
        weatherCard={weatherCard}
        enrichmentEvents={enrichmentEvents}
        enrichmentLoading={enrichmentLoading}
        enrichmentWorkflow={enrichmentWorkflowState.workflow}
        enrichmentWorkflowLoading={enrichmentWorkflowState.loading || enrichmentWorkflowState.refreshing}
      />
    );
  }

  return (
    <>
      {showPlatformHealth ? (
        <HomePlatformHealthModal
          health={platformHealth}
          loading={platformHealthLoading}
          onClose={() => setShowPlatformHealth(false)}
        />
      ) : null}
      {showDashboardWeather && showWeather ? (
        <HomeWeatherModal
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
          limitations={weatherLimitations}
          targetDate={today}
          onClose={() => setShowWeather(false)}
          onRefresh={refreshWeather}
        />
      ) : null}
      {content}
    </>
  );
}

export default HomePage;

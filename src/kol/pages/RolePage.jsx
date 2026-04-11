// K9 Operations — RolePage
// Main role page with four fixed sections: Opening, Midday, Closing, As Needed
// Includes date cycling, task completion, and live workflow summary cards.
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, todayStr, addDays, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, WORKFLOW_SECTION_MAP } from "../../shared/theme";
import { Card, Badge, Btn, Modal } from "../../shared/ui";
import { I, Icons } from "../../shared/icons";
import { getOpsCardStatus, getOpsProgress, getOpsCountLabel, getRoomCleaningStats, getPPStats, resSvcIncludes } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";

// ─── Fixed Section Definitions ──────────────────────────────────────────────
const FIXED_SECTIONS = [
  { id: "opening", label: "Opening", icon: "Sunrise", color: "#F59E0B", bg: "#FFFBEB", borderColor: "#FCD34D" },
  { id: "midday", label: "Midday", icon: "Sun", color: "#3B82F6", bg: "#EFF6FF", borderColor: "#93C5FD" },
  { id: "closing", label: "Closing", icon: "Sunset", color: "#8B5CF6", bg: "#F5F3FF", borderColor: "#C4B5FD" },
  { id: "as_needed", label: "As Needed", icon: "RefreshCw", color: "#6B7280", bg: "#F9FAFB", borderColor: "#D1D5DB" },
];

// Workflows that remain as separate pages with summary cards
const WORKFLOW_CARDS = [
  { id: "bathing", label: "Bathing", icon: "Droplet", routeTo: "ops-bathing", typeSub: "bathing" },
  { id: "room_cleaning", label: "Room Cleaning", icon: "Home", routeTo: "ops-rooms", typeSub: "room_cleaning" },
  { id: "pp", label: "Private Play", icon: "PlayCircle", routeTo: "ops-pp", typeSub: "pp" },
  { id: "pamper", label: "Pamper Package", icon: "Star", routeTo: "ops-pamper", typeSub: "pamper" },
  { id: "lodging_transfer", label: "Lodging Transfers", icon: "ArrowRightCircle", routeTo: "ops-lodging-transfers", typeSub: "lodging_transfer" },
  { id: "collars", label: "Next Day Collars", icon: "Tag", routeTo: "ops-collars", typeSub: "collars" },
  { id: "belongings", label: "Belongings", icon: "Package", routeTo: "ops-belongings", typeSub: "belongings" },
];

// Checkbox component (matches DailyOpsPage K9Check)
const K9Check = ({ checked, disabled, onChange, color = C.pri, size = 18 }) => (
  <div onClick={disabled ? undefined : () => onChange(!checked)}
    style={{
      width: size, height: size, borderRadius: 5, cursor: disabled ? "default" : "pointer",
      border: `2px solid ${checked ? color : C.border}`,
      background: checked ? color : "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s ease", opacity: disabled ? 0.5 : 1,
      boxShadow: checked ? `0 0 0 2px ${color}25` : "none",
      flexShrink: 0,
    }}>
    {checked && <svg width={size - 6} height={size - 6} viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </div>
);

function RolePage({ data, save, nav, profile, addGlobalToast, role: roleProp }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const locationId = profile?.location_id || "cherry-hill";
  const role = roleProp || profile?.role || "pct";

  // ─── Date Navigation ────────────────────────────────────────────────────
  const isToday = viewDate === td;
  const isPast = viewDate < td;
  const shiftDate = (d) => {
    const dt = new Date(viewDate + "T12:00:00");
    dt.setDate(dt.getDate() + d);
    setViewDate(dt.toISOString().slice(0, 10));
  };
  const dateLbl = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  // Calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date(viewDate + "T12:00:00").getMonth());
  const [calYear, setCalYear] = useState(() => new Date(viewDate + "T12:00:00").getFullYear());
  const calRef = useRef(null);

  useEffect(() => {
    const d = new Date(viewDate + "T12:00:00");
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  }, [showCalendar]);

  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => {
      if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const startDay = first.getDay();
    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    return cells;
  }, [calMonth, calYear]);

  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => {
    const m = String(calMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    setViewDate(`${calYear}-${m}-${d}`);
    setShowCalendar(false);
  };

  // ─── Load role page config (tasks per section) ──────────────────────────
  const [configTasks, setConfigTasks] = useState([]);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    supabase
      .from("role_page_config")
      .select("*")
      .eq("location_id", locationId)
      .eq("role", role)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (!error && rows) setConfigTasks(rows);
        setConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, [locationId, role]);

  // Filter tasks by day of week
  const dayIdx = new Date(viewDate + "T12:00:00").getDay();
  const activeTasks = useMemo(() =>
    configTasks.filter(t => t.day_of_week == null || t.day_of_week === dayIdx),
    [configTasks, dayIdx]
  );

  // Group active tasks by section
  const tasksBySection = useMemo(() => {
    const grouped = {};
    FIXED_SECTIONS.forEach(s => { grouped[s.id] = []; });
    activeTasks.forEach(t => {
      if (grouped[t.section]) grouped[t.section].push(t);
    });
    return grouped;
  }, [activeTasks]);

  // ─── Task completion state ──────────────────────────────────────────────
  const [taskStates, setTaskStates] = useState({});
  const [statesLoading, setStatesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setStatesLoading(true);
    supabase
      .from("role_page_task_state")
      .select("*")
      .eq("location_id", locationId)
      .eq("role", role)
      .eq("task_date", viewDate)
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        const map = {};
        (rows || []).forEach(r => { map[r.task_id] = r; });
        setTaskStates(map);
        setStatesLoading(false);
      });
    return () => { cancelled = true; };
  }, [locationId, role, viewDate]);

  // Toggle task completion
  const toggleTask = useCallback(async (taskId) => {
    const current = taskStates[taskId];
    const nowCompleted = !current?.completed;
    const userName = profile?.full_name || profile?.name || "";

    const row = {
      location_id: locationId,
      role,
      task_date: viewDate,
      task_id: taskId,
      completed: nowCompleted,
      completed_by: nowCompleted ? userName : null,
      completed_at: nowCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    // Optimistic update
    setTaskStates(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], ...row },
    }));

    const { error } = await supabase.from("role_page_task_state")
      .upsert(row, { onConflict: "location_id,role,task_date,task_id" });

    if (error) {
      console.log("[RolePage] Task toggle error:", error.message);
      // Revert on error
      setTaskStates(prev => ({
        ...prev,
        [taskId]: current || { completed: false },
      }));
    }
  }, [taskStates, locationId, role, viewDate, profile]);

  // ─── Workflow summaries for live cards ──────────────────────────────────
  const workflowSummaries = useMemo(() => {
    const summaries = {};
    const allOps = data.dailyOps || [];
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];

    WORKFLOW_CARDS.forEach(wf => {
      const catalogItem = OPERATIONS_CATALOG.find(c => c.typeSub === wf.typeSub);
      if (!catalogItem) {
        summaries[wf.id] = { status: "not_started", progress: 0, countLabel: "" };
        return;
      }

      const status = getOpsCardStatus(data, catalogItem, viewDate);
      const progress = getOpsProgress(data, catalogItem, viewDate);
      const countLabel = getOpsCountLabel(data, catalogItem, viewDate);
      summaries[wf.id] = { status, progress, countLabel };
    });

    // Bathing-specific enrichment
    const inHouseRes = reservations.filter(r => r.status === "checked-in");
    let bathCount = 0, bathDone = 0;
    inHouseRes.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      if (!dog) return;
      const bath = res.careOverrides?.bath_type || dog.fields?.bath_type || "";
      if (bath && res.checkOut === viewDate) {
        bathCount++;
        const logKey = `${viewDate}|bathing`;
        if (res.activityLog?.[logKey]?.administered) bathDone++;
      }
    });
    if (bathCount > 0) {
      summaries.bathing = {
        ...summaries.bathing,
        countLabel: `${bathDone}/${bathCount} baths`,
        progress: Math.round((bathDone / bathCount) * 100),
      };
    }

    // Room cleaning enrichment
    const roomStats = getRoomCleaningStats(data, viewDate);
    if (roomStats.totalNeeded > 0) {
      summaries.room_cleaning = {
        ...summaries.room_cleaning,
        countLabel: `${roomStats.totalDone}/${roomStats.totalNeeded} rooms`,
        progress: Math.round((roomStats.totalDone / roomStats.totalNeeded) * 100),
      };
    }

    // Private play enrichment
    const ppStats = getPPStats(data, viewDate);
    if (ppStats.requiredSessions > 0) {
      summaries.pp = {
        ...summaries.pp,
        countLabel: `${ppStats.completedSessions}/${ppStats.requiredSessions} sessions`,
        progress: Math.round((ppStats.completedSessions / ppStats.requiredSessions) * 100),
      };
    }

    return summaries;
  }, [data, viewDate]);

  // ─── Group workflow cards into sections per role ─────────────────────────
  const workflowsBySection = useMemo(() => {
    const roleMap = WORKFLOW_SECTION_MAP[role] || WORKFLOW_SECTION_MAP.pct || {};
    const grouped = {};
    FIXED_SECTIONS.forEach(s => { grouped[s.id] = []; });
    WORKFLOW_CARDS.forEach(wf => {
      const sectionId = roleMap[wf.id] || "as_needed";
      if (grouped[sectionId]) grouped[sectionId].push(wf);
    });
    return grouped;
  }, [role]);

  // ─── Section progress stats ─────────────────────────────────────────────
  const sectionStats = useMemo(() => {
    const stats = {};
    FIXED_SECTIONS.forEach(section => {
      const sectionTasks = tasksBySection[section.id] || [];
      const total = sectionTasks.length;
      const done = sectionTasks.filter(t => taskStates[t.task_id]?.completed).length;
      stats[section.id] = { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
    return stats;
  }, [tasksBySection, taskStates]);

  const totalTasks = activeTasks.length;
  const totalDone = activeTasks.filter(t => taskStates[t.task_id]?.completed).length;
  const totalPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  // ─── Collapsed sections state ───────────────────────────────────────────
  const [collapsedSections, setCollapsedSections] = useState({});
  const toggleCollapse = (sectionId) => {
    setCollapsedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  // Status config for workflow cards
  const statusConfig = {
    not_started: { label: "Not Started", bg: C.surfaceHover, color: C.textMut, barColor: C.borderLight },
    in_progress: { label: "In Progress", bg: C.warnLt, color: C.warn, barColor: "#F59E0B" },
    completed: { label: "Completed", bg: C.sucLt, color: C.suc, barColor: "#10B981" },
  };

  const nbtn = { border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 };

  if (data.loading || configLoading) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <K9LoadingAnimation size={56} message="Loading role page..." subMessage="Fetching configuration" />
    </div>
  );

  return (
    <div style={{ padding: "0 8px" }}>
      {/* ─── Header with date navigation ──────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>
            My Tasks
          </h2>
          {totalTasks > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 20,
              background: totalPct === 100 ? C.sucLt : `${C.pri}10`,
              border: `1.5px solid ${totalPct === 100 ? C.suc + "40" : C.pri + "30"}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: totalPct === 100 ? C.suc : C.pri }}>
                {totalDone}/{totalTasks}
              </span>
              <span style={{ fontSize: 11, color: totalPct === 100 ? C.suc : C.textMut }}>
                {totalPct === 100 ? "Complete" : `${totalPct}%`}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <button onClick={() => shiftDate(-1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>‹</button>
          <button onClick={() => setShowCalendar(v => !v)} style={{ ...nbtn, background: "transparent", color: C.text, minWidth: 220, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{dateLbl}</button>
          <button onClick={() => shiftDate(1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>›</button>
          {!isToday && <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: C.pri, color: "#fff" }}>Today</button>}
          {showCalendar && (
            <div ref={calRef} style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 100, width: 280 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <button onClick={calPrev} style={{ ...nbtn, background: C.surfaceHover }}>‹</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
                <button onClick={calNext} style={{ ...nbtn, background: C.surfaceHover }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.textMut, padding: 4 }}>{d}</div>)}
                {calDays.map((d, i) => d ? (
                  <button key={i} onClick={() => calSelect(d)} style={{
                    border: "none", borderRadius: 6, padding: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    background: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? C.pri : "transparent",
                    color: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? "#fff" : C.text,
                  }}>{d}</button>
                ) : <div key={i} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Overall progress bar ────────────────────────────────────────── */}
      {totalTasks > 0 && (
        <div style={{ marginBottom: 24, padding: "14px 20px", borderRadius: 14, background: C.surface, border: `1.5px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Daily Progress</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: totalPct === 100 ? C.suc : C.pri }}>{totalPct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: C.borderLight, overflow: "hidden" }}>
            <div style={{
              width: `${totalPct}%`, height: "100%", borderRadius: 4,
              background: totalPct === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
              transition: "width 0.3s ease",
            }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {FIXED_SECTIONS.map(section => {
              const s = sectionStats[section.id];
              if (s.total === 0) return null;
              return (
                <div key={section.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: section.color }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec }}>
                    {section.label}: {s.done}/{s.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Empty state hint (no checklist tasks configured) ──────────── */}
      {totalTasks === 0 && !configLoading && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: C.surfaceHover, border: `1px solid ${C.border}`, marginBottom: 16,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 12, color: C.textMut }}>
            No checklist tasks configured yet for this role.
          </span>
          <button onClick={() => nav("settings")}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "none",
              background: C.pri, color: "#fff", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            Configure
          </button>
        </div>
      )}

      {/* ─── Fixed Sections with Tasks & Workflow Cards ──────────────────── */}
      {FIXED_SECTIONS.map(section => {
        const sectionTasks = tasksBySection[section.id] || [];
        const sectionWorkflows = workflowsBySection[section.id] || [];
        const stats = sectionStats[section.id];
        const isCollapsed = collapsedSections[section.id];
        const hasContent = sectionTasks.length > 0 || sectionWorkflows.length > 0;

        return (
          <div key={section.id} style={{ marginBottom: 20 }}>
            {/* Section header — subtle, no emoji/icon per spec */}
            <div
              onClick={() => toggleCollapse(section.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                borderRadius: isCollapsed ? 12 : "12px 12px 0 0",
                background: C.surfaceHover,
                border: `1px solid ${C.border}`,
                borderBottom: isCollapsed ? `1px solid ${C.border}` : "none",
                cursor: "pointer", userSelect: "none",
                transition: "all 0.15s",
              }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.textSec, flex: 1 }}>{section.label}</span>
              {sectionTasks.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: stats.pct === 100 ? C.suc : C.textMut }}>
                  {stats.done}/{stats.total}
                </span>
              )}
              {sectionTasks.length > 0 && (
                <div style={{ width: 48, height: 4, borderRadius: 2, background: C.borderLight, overflow: "hidden" }}>
                  <div style={{ width: `${stats.pct}%`, height: "100%", borderRadius: 2, background: stats.pct === 100 ? C.suc : section.color, transition: "width 0.3s" }} />
                </div>
              )}
              {sectionWorkflows.length > 0 && sectionTasks.length === 0 && (
                <span style={{ fontSize: 11, color: C.textMut, fontWeight: 500 }}>
                  {sectionWorkflows.length} workflow{sectionWorkflows.length !== 1 ? "s" : ""}
                </span>
              )}
              <span style={{ fontSize: 12, color: C.textMut, fontWeight: 600, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>▼</span>
            </div>

            {/* Section body */}
            {!isCollapsed && (
              <div style={{
                border: `1px solid ${C.border}`,
                borderTop: "none", borderRadius: "0 0 12px 12px",
                background: C.surface, overflow: "hidden",
              }}>
                {/* Checklist tasks */}
                {sectionTasks.map((task, idx) => {
                  const state = taskStates[task.task_id];
                  const isCompleted = state?.completed;
                  const completedBy = state?.completed_by;
                  const completedAt = state?.completed_at;

                  return (
                    <div key={task.task_id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                      borderBottom: `1px solid ${C.borderLight}`,
                      background: isCompleted ? `${C.suc}06` : "transparent",
                      transition: "background 0.15s",
                    }}>
                      <K9Check
                        checked={!!isCompleted}
                        disabled={isPast && !isToday}
                        onChange={() => toggleTask(task.task_id)}
                        color={section.color}
                        size={20}
                      />
                      {task.task_time && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: C.textMut,
                          background: C.surfaceHover, padding: "2px 6px", borderRadius: 4,
                          minWidth: 40, textAlign: "center",
                        }}>
                          {task.task_time}
                        </span>
                      )}
                      <span style={{
                        flex: 1, fontSize: 13, color: isCompleted ? C.textMut : C.text,
                        textDecoration: isCompleted ? "line-through" : "none",
                        fontWeight: 500,
                      }}>
                        {task.task_label}
                      </span>
                      {isCompleted && completedBy && (
                        <span style={{ fontSize: 10, color: C.suc, fontWeight: 600 }}>
                          {completedBy}
                          {completedAt && (() => {
                            const d = new Date(completedAt);
                            const h = d.getHours();
                            const m = String(d.getMinutes()).padStart(2, "0");
                            const ampm = h >= 12 ? "PM" : "AM";
                            const hr = h > 12 ? h - 12 : h || 12;
                            return ` · ${hr}:${m} ${ampm}`;
                          })()}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Workflow cards embedded in this section */}
                {sectionWorkflows.length > 0 && (
                  <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                    {sectionWorkflows.map(wf => {
                      const summary = workflowSummaries[wf.id] || { status: "not_started", progress: 0, countLabel: "" };
                      const sc = statusConfig[summary.status] || statusConfig.not_started;
                      return (
                        <div key={wf.id}
                          onClick={() => nav(wf.routeTo)}
                          style={{
                            padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                            background: C.bg, border: `1.5px solid ${C.border}`,
                            transition: "all 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = section.color + "60";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = C.border;
                            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.03)";
                          }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{wf.label}</span>
                            <span style={{
                              fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                              background: sc.bg, color: sc.color, textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}>
                              {sc.label}
                            </span>
                          </div>
                          {summary.countLabel && (
                            <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600, marginBottom: 4 }}>
                              {summary.countLabel}
                            </div>
                          )}
                          <div style={{ height: 4, borderRadius: 2, background: C.borderLight, overflow: "hidden" }}>
                            <div style={{
                              width: `${summary.progress || 0}%`, height: "100%", borderRadius: 2,
                              background: sc.barColor, transition: "width 0.3s",
                            }} />
                          </div>
                          <div style={{ marginTop: 4, fontSize: 10, color: section.color, fontWeight: 600 }}>
                            View Details →
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Empty section indicator */}
                {!hasContent && (
                  <div style={{ padding: "14px 16px", fontSize: 12, color: C.textMut, fontStyle: "italic" }}>
                    No tasks or workflows assigned
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default RolePage;

// K9 Operations — Weekly Maintenance Checklist Page
// Two views: Daily (default) and Weekly grid
// Supports computed_items from server + CRUD via lite_checklist_templates

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, addDays, DAY_NAMES_SHORT, gid } from "../../shared/theme";
import { Card, Badge, Btn, Modal } from "../../shared/ui";
import { I } from "../../shared/icons";

// ─── Default Weekly Maintenance Task Schedule (fallback) ────────────────
const WM_TASKS_DEFAULT = [
  { id:"wm1", label:"Disinfect Bathrooms + Refill Toilet Paper in Wall Mounts", supplies:"Mop bucket w/ rescue, bucket w/ rescue, sponge, squeegee mirror w/ windex", scheduledDays:[1,4] },
  { id:"wm2", label:"Wipe Down Executive Room Cubbies", supplies:"Rescue wipes", scheduledDays:[1,4] },
  { id:"wm3", label:"Sweep Sidewalk & Remove Trash from Parking Lot", supplies:"Black/Yellow rubber broom, trash bag", scheduledDays:[1,2,3,4,5,6,0] },
  { id:"wm4", label:"Clean Ceiling + Wall Vents Throughout Building", supplies:"Extendable duster, rescue wipes, paper towels", scheduledDays:[3] },
  { id:"wm5", label:"Clean / Reorganize Shed", supplies:"Rescue mop bucket, sponges, windex, trash bags", scheduledDays:[6] },
  { id:"wm6", label:"Clean Contact Points (Light Switches, Door Handles, etc.)", supplies:"Rescue wipes", scheduledDays:[1,3,5] },
  { id:"wm7", label:"Wipe Top Bars of Executive Rooms", supplies:"Rescue wipes", scheduledDays:[2,5] },
  { id:"wm8", label:"Clean Compartment and Luxury Lockers", supplies:"Rescue wipes", scheduledDays:[4] },
  { id:"wm9", label:"Dust / Clean Elevated Pillars in Luxury Hallway", supplies:"Warm + wet paper towel / rags (do not use Rescue — could eat away at paint)", scheduledDays:[4] },
  { id:"wm10", label:"Clean Doors & Door Frames", supplies:"Stainless steel wipes", scheduledDays:[1,4] },
  { id:"wm11", label:"Clean Window on Entry Doors", supplies:"Sprayway Glass Cleaner", scheduledDays:[1,3,5] },
  { id:"wm12", label:"Deep Clean + Disinfect Bathing Room + Reorganize Shelves", supplies:"Mop bucket w/ rescue, bucket w/ rescue, sponge, squeegee doors w/ windex", scheduledDays:[6] },
  { id:"wm13", label:"Sweep Behind Compartments", supplies:"Black/Yellow rubber broom", scheduledDays:[4] },
  { id:"wm14", label:"Disinfect + Reorganize Kitchen/Break Area", supplies:"Mop bucket w/ rescue, rescue wipes, squeegee door glass w/ windex", scheduledDays:[3,6] },
  { id:"wm15", label:"Soak Leads and Aprons in Rescue, Apply Foot Spray to Boots", supplies:"Rescue bucket, foot spray (found in utility room)", scheduledDays:[1] },
  { id:"wm16", label:"Polish Metal Throughout Building", supplies:"Rescue wipes", scheduledDays:[1,4] },
  { id:"wm17", label:"Dust Top of Compartments", supplies:"Paper towel, then rescue wipes", scheduledDays:[2,3,5] },
  { id:"wm18", label:"Turf Vacuum Play Yards", supplies:"Rake, then turf vacuum", scheduledDays:[6] },
  { id:"wm19", label:"Clean Front Door and Front Facade", supplies:"Rescue wipes", scheduledDays:[1,2,3,4,5,6,0] },
  { id:"wm20", label:"Foam Walkway in the Morning", supplies:"Hose + Rescue foamer; be careful of plants", scheduledDays:[2,6] },
  { id:"wm21", label:"Drying Cage Filters Inspected and Cleaned", supplies:"N/A - notify GM if filters need to be replaced", scheduledDays:[3] },
  { id:"wm22", label:"Clean Whiteboards in Tour Hallway with Cleaning Solution", supplies:"Expo cleaning solution + paper towels", scheduledDays:[1] },
  { id:"wm23", label:"Wall-Mounted Dog Air Dryer Inspected and Cleaned", supplies:"N/A - notify GM if filters need to be replaced", scheduledDays:[1] },
  { id:"wm24", label:"Scrub Play Equipment", supplies:"Sponge, bucket of rescue", scheduledDays:[1,2,3,4,5,6,0] },
];

const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun display order
const TEMPLATE_ID = "3ea0e6a0-03d5-4e03-a87e-0f036f8ffb39";
const LOCATION_ID_DEFAULT = "8ea382b0-63f7-44ac-b6f8-83243c03d946";

function getWeekMonday(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getWeekDates(dateStr) {
  const mon = getWeekMonday(dateStr);
  return WEEK_DAYS_ORDER.map((_, i) => addDays(mon, i));
}

// ─── Manage Tasks Modal ─────────────────────────────────────────────────
function ManageTasksModal({ onClose, locationId }) {
  const [templateTasks, setTemplateTasks] = useState(null); // null = loading
  const [templateId, setTemplateId] = useState(null);
  const [editTask, setEditTask] = useState(null); // task being edited or new task
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Load template
  useEffect(() => {
    supabase.from("lite_checklist_templates").select("*")
      .eq("location_id", locationId)
      .eq("template_type", "weekly_maintenance")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTemplateTasks(data.items || []);
          setTemplateId(data.id);
        } else {
          setTemplateTasks([]);
        }
      });
  }, [locationId]);

  const activeTasks = useMemo(() => (templateTasks || []).filter(t => t.active !== false), [templateTasks]);
  const inactiveTasks = useMemo(() => (templateTasks || []).filter(t => t.active === false), [templateTasks]);

  const saveTemplate = useCallback(async (updatedItems) => {
    setSaving(true);
    try {
      if (templateId) {
        await supabase.from("lite_checklist_templates")
          .update({ items: updatedItems, updated_at: new Date().toISOString() })
          .eq("id", templateId);
      } else {
        const { data } = await supabase.from("lite_checklist_templates")
          .insert({ id: TEMPLATE_ID, location_id: locationId, template_type: "weekly_maintenance", items: updatedItems, updated_at: new Date().toISOString() })
          .select().single();
        if (data) setTemplateId(data.id);
      }
      setTemplateTasks(updatedItems);
    } finally {
      setSaving(false);
    }
  }, [templateId, locationId]);

  const handleSaveTask = useCallback(async () => {
    if (!editTask || !editTask.label.trim()) return;
    const items = [...(templateTasks || [])];
    const idx = items.findIndex(t => t.id === editTask.id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], label: editTask.label, supplies: editTask.supplies, scheduledDays: editTask.scheduledDays };
    } else {
      items.push({ id: `wm_${Date.now()}`, label: editTask.label, supplies: editTask.supplies, scheduledDays: editTask.scheduledDays, active: true });
    }
    await saveTemplate(items);
    setEditTask(null);
  }, [editTask, templateTasks, saveTemplate]);

  const handleDelete = useCallback(async (taskId) => {
    const items = (templateTasks || []).map(t => t.id === taskId ? { ...t, active: false } : t);
    await saveTemplate(items);
  }, [templateTasks, saveTemplate]);

  const handleReactivate = useCallback(async (taskId) => {
    const items = (templateTasks || []).map(t => t.id === taskId ? { ...t, active: true } : t);
    await saveTemplate(items);
  }, [templateTasks, saveTemplate]);

  const toggleDay = (dayIdx) => {
    if (!editTask) return;
    const days = editTask.scheduledDays.includes(dayIdx)
      ? editTask.scheduledDays.filter(d => d !== dayIdx)
      : [...editTask.scheduledDays, dayIdx];
    setEditTask({ ...editTask, scheduledDays: days });
  };

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayValues = [1, 2, 3, 4, 5, 6, 0];

  if (templateTasks === null) {
    return <Modal title="Manage Tasks" onClose={onClose}><div style={{ padding: 20, textAlign: "center", color: C.textMut }}>Loading...</div></Modal>;
  }

  return (
    <Modal title="Manage Weekly Maintenance Tasks" onClose={onClose} wide>
      <div style={{ padding: "0 0 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.warn, fontWeight: 500 }}>Changes will appear within 1 minute</div>
          <button
            onClick={() => setEditTask({ id: null, label: "", supplies: "", scheduledDays: [] })}
            style={{ border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12, background: C.pri, color: "#fff" }}
          >+ Add Task</button>
        </div>

        {/* Edit/Add form */}
        {editTask && (
          <Card style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.text }}>{editTask.id ? "Edit Task" : "New Task"}</div>
            <input
              value={editTask.label} onChange={e => setEditTask({ ...editTask, label: e.target.value })}
              placeholder="Task label" style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, marginBottom: 8, fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <input
              value={editTask.supplies} onChange={e => setEditTask({ ...editTask, supplies: e.target.value })}
              placeholder="Supplies needed" style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, marginBottom: 8, fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Scheduled Days</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {dayLabels.map((lbl, i) => {
                const active = editTask.scheduledDays.includes(dayValues[i]);
                return (
                  <button key={lbl} onClick={() => toggleDay(dayValues[i])} style={{
                    border: `1px solid ${active ? C.pri : C.border}`, borderRadius: 6, padding: "4px 10px",
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 11,
                    background: active ? C.pri : C.surface, color: active ? "#fff" : C.textMut,
                  }}>{lbl}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSaveTask} disabled={saving || !editTask.label.trim()} style={{
                border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontFamily: "inherit",
                fontWeight: 600, fontSize: 12, background: C.pri, color: "#fff", opacity: saving ? 0.6 : 1,
              }}>{saving ? "Saving..." : "Save"}</button>
              <button onClick={() => setEditTask(null)} style={{
                border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 16px", cursor: "pointer",
                fontFamily: "inherit", fontWeight: 600, fontSize: 12, background: C.surface, color: C.textMut,
              }}>Cancel</button>
            </div>
          </Card>
        )}

        {/* Active tasks */}
        {activeTasks.map(task => (
          <div key={task.id} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.borderLight}`, gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.text }}>{task.label}</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{task.supplies || ""} {task.scheduledDays?.length > 0 && `\u00B7 ${task.scheduledDays.map(d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")}`}</div>
            </div>
            <button onClick={() => setEditTask({ ...task })} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: C.info, fontWeight: 600 }}>Edit</button>
            <button onClick={() => handleDelete(task.id)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: C.dan, fontWeight: 600 }}>Delete</button>
          </div>
        ))}

        {activeTasks.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: C.textMut, fontSize: 13 }}>No active tasks. Add one above.</div>
        )}

        {/* Inactive tasks toggle */}
        {inactiveTasks.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setShowInactive(!showInactive)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: C.textMut, fontWeight: 600 }}>
              {showInactive ? "Hide" : "Show"} {inactiveTasks.length} inactive task{inactiveTasks.length !== 1 ? "s" : ""}
            </button>
            {showInactive && inactiveTasks.map(task => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", padding: "6px 0", gap: 8, opacity: 0.5 }}>
                <div style={{ flex: 1, fontSize: 13, color: C.textMut, textDecoration: "line-through" }}>{task.label}</div>
                <button onClick={() => handleReactivate(task.id)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: C.suc, fontWeight: 600 }}>Reactivate</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────
function WeeklyMaintenancePage({ data, save, nav, profile, addGlobalToast }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const [viewMode, setViewMode] = useState("daily"); // "daily" or "weekly"
  const [weekOpsData, setWeekOpsData] = useState({}); // { "2026-03-17": { items: {...}, computed_items: null }, ... }
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const isToday = viewDate === td;
  const dayIdx = new Date(viewDate + "T12:00:00").getDay();
  const weekDates = useMemo(() => getWeekDates(viewDate), [viewDate]);
  const locationId = profile?.location_id || data?.locationId || LOCATION_ID_DEFAULT;

  // Load week ops data from Supabase for all 7 days of this week
  useEffect(() => {
    if (!locationId) return;
    const ids = weekDates.map(d => `ops_weekly_maintenance_${d}`);
    supabase.from("lite_daily_ops").select("*").in("id", ids).eq("location_id", locationId).then(({ data: rows }) => {
      const map = {};
      (rows || []).forEach(r => {
        const date = r.date || r.id.replace("ops_weekly_maintenance_", "");
        map[date] = { items: r.items || {}, computed_items: r.computed_items || null, locked: r.locked, history: r.history || [] };
      });
      setWeekOpsData(map);
    });
  }, [weekDates, locationId]);

  // Get items for a specific date
  const getItems = useCallback((date) => {
    const entryId = `ops_weekly_maintenance_${date}`;
    const liveEntry = (data.dailyOps || []).find(e => e.id === entryId);
    if (liveEntry) return liveEntry.items || {};
    return weekOpsData[date]?.items || {};
  }, [data.dailyOps, weekOpsData]);

  // Get computed_items for a specific date (server-generated task list)
  const getComputedItems = useCallback((date) => {
    const entryId = `ops_weekly_maintenance_${date}`;
    const liveEntry = (data.dailyOps || []).find(e => e.id === entryId);
    if (liveEntry?.computed_items) return liveEntry.computed_items;
    return weekOpsData[date]?.computed_items || null;
  }, [data.dailyOps, weekOpsData]);

  // Resolve WM_TASKS: use computed_items if available, fallback to hardcoded defaults
  const WM_TASKS = useMemo(() => {
    const ci = getComputedItems(viewDate);
    if (ci && ci.tasks && ci.tasks.length > 0) {
      return ci.tasks.filter(t => t.active !== false);
    }
    return WM_TASKS_DEFAULT;
  }, [viewDate, getComputedItems]);

  // Server-generated weekGrid: { "2026-03-18": ["wm3", "wm6", ...], ... }
  const weekGrid = useMemo(() => {
    const ci = getComputedItems(viewDate);
    return ci?.weekGrid || null;
  }, [viewDate, getComputedItems]);

  // All unique tasks for weekly view (union of all days in weekGrid, or fallback to WM_TASKS_DEFAULT)
  const allWeekTasks = useMemo(() => {
    if (!weekGrid) return WM_TASKS_DEFAULT;
    const allIds = new Set();
    Object.values(weekGrid).forEach(ids => ids.forEach(id => allIds.add(id)));
    // Build task objects from WM_TASKS_DEFAULT or computed tasks
    const taskMap = new Map();
    WM_TASKS_DEFAULT.forEach(t => taskMap.set(t.id, t));
    const ci = getComputedItems(viewDate);
    if (ci?.tasks) ci.tasks.forEach(t => taskMap.set(t.id, t));
    return [...allIds].map(id => taskMap.get(id)).filter(Boolean);
  }, [weekGrid, getComputedItems, viewDate]);

  // ─── Carryover Logic ────────────────────────────────────────────────────
  // For daily view: find tasks scheduled on earlier days this week that weren't completed
  const carryoverTasks = useMemo(() => {
    if (viewMode !== "daily") return [];
    const result = [];
    const todayDateIdx = weekDates.indexOf(viewDate);
    if (todayDateIdx <= 0) return result;

    // Use computed_items carryover if available
    const ci = getComputedItems(viewDate);
    if (ci && ci.tasks) {
      const carryovers = ci.tasks.filter(t => t.isCarryover);
      const todayScheduled = new Set(ci.tasks.filter(t => !t.isCarryover).map(t => t.id));
      carryovers.forEach(task => {
        // Dedup: skip if task is already scheduled for today
        if (todayScheduled.has(task.id)) return;
        const todayItems = getItems(viewDate);
        if (todayItems[task.id]?.checked) return;
        if (result.some(r => r.task.id === task.id)) return;
        result.push({ task, fromDate: null, fromDay: task.fromDay || "earlier this week" });
      });
      return result;
    }

    // Fallback: client-side carryover computation
    for (let i = 0; i < todayDateIdx; i++) {
      const pastDate = weekDates[i];
      const pastDayIdx = new Date(pastDate + "T12:00:00").getDay();
      const pastItems = getItems(pastDate);

      WM_TASKS.forEach(task => {
        if (!task.scheduledDays || !task.scheduledDays.includes(pastDayIdx)) return;
        if (pastItems[task.id]?.checked) return;
        const todayItems = getItems(viewDate);
        if (todayItems[task.id]?.checked) return;
        if (result.some(r => r.task.id === task.id)) return;
        result.push({ task, fromDate: pastDate, fromDay: DAY_NAMES_FULL[pastDayIdx] });
      });
    }
    return result;
  }, [viewMode, viewDate, weekDates, getItems, getComputedItems, WM_TASKS]);

  // Tasks scheduled for today
  const todayTasks = useMemo(() => {
    // If using computed_items, filter for non-carryover tasks
    const ci = getComputedItems(viewDate);
    if (ci && ci.tasks) {
      return ci.tasks.filter(t => !t.isCarryover && t.active !== false);
    }
    return WM_TASKS.filter(t => t.scheduledDays && t.scheduledDays.includes(dayIdx));
  }, [dayIdx, WM_TASKS, viewDate, getComputedItems]);

  // Combined task list for daily view: today's tasks + carryover (deduped)
  const dailyTaskList = useMemo(() => {
    const todayIds = new Set(todayTasks.map(t => t.id));
    const carried = carryoverTasks.filter(c => !todayIds.has(c.task.id));
    return [
      ...todayTasks.map(t => ({ task: t, isCarryover: false })),
      ...carried.map(c => ({ task: c.task, isCarryover: true, fromDay: c.fromDay })),
    ];
  }, [todayTasks, carryoverTasks]);

  // Current date items
  const todayItems = useMemo(() => getItems(viewDate), [getItems, viewDate]);

  // Progress
  const checkedCount = dailyTaskList.filter(({ task }) => todayItems[task.id]?.checked).length;
  const totalCount = dailyTaskList.length;
  const pctDone = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // ─── Save handler ────────────────────────────────────────────────────
  const saveEntry = useCallback(async (date, items) => {
    const entryId = `ops_weekly_maintenance_${date}`;
    const allOps = [...(data.dailyOps || [])];
    const idx = allOps.findIndex(e => e.id === entryId);
    const existing = idx >= 0 ? allOps[idx] : null;
    const prevHistory = existing?.history || weekOpsData[date]?.history || [];
    const newHistory = [...prevHistory, { ts: new Date().toISOString(), action: existing ? "saved" : "created" }];
    const entry = {
      id: entryId,
      type: "weekly_maintenance",
      typeSub: "weekly_maintenance",
      date,
      locked: false,
      items,
      history: newHistory,
    };
    if (idx >= 0) allOps[idx] = entry;
    else allOps.push(entry);
    await save({ ...data, dailyOps: allOps });
    setWeekOpsData(prev => ({ ...prev, [date]: { ...prev[date], items, history: newHistory, locked: false } }));
  }, [data, save, weekOpsData]);

  // Toggle a checkbox
  const toggleItem = useCallback(async (taskId, date) => {
    const dateToUse = date || viewDate;
    const currentItems = { ...getItems(dateToUse) };
    const cur = currentItems[taskId] || {};
    const userName = profile?.full_name || profile?.name || "";
    if (cur.checked) {
      currentItems[taskId] = { ...cur, checked: false, initials: "", completedAt: null };
    } else {
      currentItems[taskId] = { ...cur, checked: true, initials: userName, completedAt: new Date().toISOString() };
    }
    setSaving(true);
    try {
      await saveEntry(dateToUse, currentItems);
    } finally {
      setSaving(false);
    }
  }, [viewDate, getItems, saveEntry, profile]);

  // Date navigation
  const shiftDate = (days) => {
    const d = new Date(viewDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    setViewDate(d.toISOString().split("T")[0]);
  };
  const dateLbl = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // ─── Styles ─────────────────────────────────────────────────────────
  const hdrStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 };
  const nbtn = { border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 };
  const pillContainer = { display: "flex", background: C.surfaceHover, borderRadius: 8, padding: 2, gap: 2 };
  const pillBtn = (active) => ({
    ...nbtn,
    background: active ? C.pri : "transparent",
    color: active ? "#fff" : C.textMut,
    padding: "6px 16px",
    borderRadius: 6,
    transition: "all 0.15s",
  });

  // ─── Daily View ─────────────────────────────────────────────────────
  const renderDailyView = () => (
    <div>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pctDone}%`, height: "100%", background: pctDone === 100 ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: pctDone === 100 ? C.suc : C.text }}>{checkedCount}/{totalCount}</span>
      </div>

      {/* Task list */}
      <Card>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{ display: "flex", padding: "8px 14px", borderBottom: `2px solid ${C.border}`, background: C.surfaceHover }}>
            <div style={{ width: 36 }} />
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: C.textMut }}>TASK</div>
            <div style={{ width: 140, fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>COMPLETED BY</div>
          </div>

          {dailyTaskList.length === 0 && (
            <div style={{ padding: "24px 14px", textAlign: "center", color: C.textMut, fontSize: 13 }}>
              No tasks scheduled for this day.
            </div>
          )}

          {dailyTaskList.map(({ task, isCarryover, fromDay }, i) => {
            const it = todayItems[task.id] || {};
            return (
              <div key={task.id} style={{
                display: "flex", alignItems: "flex-start", padding: "10px 14px",
                borderBottom: i < dailyTaskList.length - 1 ? `1px solid ${C.border}` : "none",
                background: isCarryover ? "rgba(217,119,6,0.04)" : it.checked ? "rgba(34,139,34,0.03)" : "transparent",
              }}>
                <div style={{ width: 36, paddingTop: 2 }}>
                  <input type="checkbox" checked={!!it.checked} onChange={() => toggleItem(task.id)}
                    style={{ width: 18, height: 18, cursor: "pointer", accentColor: C.pri }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, color: it.checked ? C.textMut : C.text,
                    textDecoration: it.checked ? "line-through" : "none", lineHeight: 1.4,
                  }}>
                    {task.label}
                    {isCarryover && (
                      <span style={{
                        display: "inline-block", marginLeft: 8, padding: "1px 8px", borderRadius: 4,
                        background: C.warnLt, color: C.warn, fontSize: 11, fontWeight: 600,
                      }}>
                        Missed from {fromDay}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{task.supplies}</div>
                </div>
                <div style={{ width: 140, textAlign: "center", fontSize: 12, fontWeight: 500, color: it.initials ? C.textSec : C.textMut, paddingTop: 2 }}>
                  {it.initials || "\u2014"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );

  // ─── Weekly View ────────────────────────────────────────────────────
  const renderWeeklyView = () => {
    const weekDateLabels = weekDates.map(d => {
      const dt = new Date(d + "T12:00:00");
      return { date: d, dayIdx: dt.getDay(), label: DAY_NAMES_SHORT[dt.getDay()], dayNum: dt.getDate() };
    });

    return (
      <Card style={{ overflow: "auto" }}>
        <div style={{ minWidth: 900 }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 2fr) repeat(7, 1fr) minmax(150px, 1.5fr)", borderBottom: `2px solid ${C.border}`, background: C.surfaceHover }}>
            <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.textMut }}>TASK</div>
            {weekDateLabels.map(({ label, dayNum, date }) => (
              <div key={date} style={{
                padding: "8px 4px", fontSize: 11, fontWeight: 700, color: date === td ? C.pri : C.textMut,
                textAlign: "center",
              }}>
                {label}<br /><span style={{ fontSize: 10, fontWeight: 500 }}>{dayNum}</span>
              </div>
            ))}
            <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.textMut }}>SUPPLIES</div>
          </div>

          {/* Task rows */}
          {allWeekTasks.map((task, rowIdx) => (
            <div key={task.id} style={{
              display: "grid", gridTemplateColumns: "minmax(240px, 2fr) repeat(7, 1fr) minmax(150px, 1.5fr)",
              borderBottom: rowIdx < allWeekTasks.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ padding: "8px 12px", fontSize: 12, color: C.text, lineHeight: 1.4, display: "flex", alignItems: "center" }}>
                {task.label}
              </div>
              {weekDateLabels.map(({ date, dayIdx: dIdx }) => {
                const isScheduled = weekGrid
                  ? (weekGrid[date] || []).includes(task.id)
                  : (task.scheduledDays ? task.scheduledDays.includes(dIdx) : false);
                const items = getItems(date);
                const it = items[task.id] || {};
                return (
                  <div key={date} style={{
                    padding: "6px 4px", textAlign: "center", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    background: isScheduled ? "transparent" : C.surfaceHover,
                    borderLeft: `1px solid ${C.borderLight}`,
                  }}>
                    {isScheduled ? (
                      <>
                        <input type="checkbox" checked={!!it.checked} onChange={() => toggleItem(task.id, date)}
                          style={{ width: 18, height: 18, cursor: "pointer", accentColor: it.checked ? C.suc : C.pri }} />
                        {it.checked && it.initials && (
                          <div style={{ fontSize: 9, color: C.suc, fontWeight: 600, marginTop: 2 }}>
                            {it.initials}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: C.borderLight }}>—</span>
                    )}
                  </div>
                );
              })}
              <div style={{ padding: "8px 12px", fontSize: 11, color: C.textMut, lineHeight: 1.3, display: "flex", alignItems: "center" }}>
                {task.supplies}
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  // Weekly progress summary
  const weeklyProgressRow = useMemo(() => {
    return weekDates.map(d => {
      const dIdx = new Date(d + "T12:00:00").getDay();
      // Use weekGrid for scheduled task count (most reliable)
      let total = 0;
      if (weekGrid && weekGrid[d]) {
        total = weekGrid[d].length;
      } else {
        // Fallback: use default tasks with scheduledDays
        total = WM_TASKS_DEFAULT.filter(t => t.scheduledDays && t.scheduledDays.includes(dIdx)).length;
      }
      const items = getItems(d);
      const scheduledIds = weekGrid ? (weekGrid[d] || []) : WM_TASKS_DEFAULT.filter(t => t.scheduledDays && t.scheduledDays.includes(dIdx)).map(t => t.id);
      const checked = scheduledIds.filter(id => items[id]?.checked).length;
      return { date: d, total, checked };
    });
  }, [weekDates, getItems, weekGrid]);

  return (
    <div style={{ padding: "0 0 40px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={hdrStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => nav("ops-hub")} style={{ ...nbtn, background: C.surfaceHover, color: C.textMut, display: "flex", alignItems: "center", gap: 4 }}>
            <I.Back /> Back
          </button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Weekly Maintenance</h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Manage Tasks button */}
          <button onClick={() => setShowManage(true)} style={{ ...nbtn, background: C.surfaceHover, color: C.textSec, display: "flex", alignItems: "center", gap: 4 }}>
            Manage Tasks
          </button>
          {/* View toggle */}
          <div style={pillContainer}>
            <button style={pillBtn(viewMode === "daily")} onClick={() => setViewMode("daily")}>Daily</button>
            <button style={pillBtn(viewMode === "weekly")} onClick={() => setViewMode("weekly")}>Weekly</button>
          </div>
        </div>
      </div>

      {/* Date navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={() => shiftDate(-1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>&larr;</button>
        <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: isToday ? C.pri : C.surfaceHover, color: isToday ? "#fff" : C.text }}>Today</button>
        <button onClick={() => shiftDate(1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>&rarr;</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, marginLeft: 8 }}>{dateLbl}</span>
        {saving && <span style={{ fontSize: 11, color: C.textMut, marginLeft: 8 }}>Saving...</span>}
      </div>

      {/* Weekly progress summary (shown in weekly view) */}
      {viewMode === "weekly" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 16 }}>
          {weeklyProgressRow.map(({ date, total, checked }) => {
            const dIdx = new Date(date + "T12:00:00").getDay();
            const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
            return (
              <div key={date} style={{
                background: C.surface, border: `1px solid ${date === td ? C.pri : C.border}`, borderRadius: 8,
                padding: "8px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: date === td ? C.pri : C.textMut }}>{DAY_NAMES_FULL[dIdx]}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: pct === 100 ? C.suc : C.text, marginTop: 2 }}>{checked}/{total}</div>
                <div style={{ height: 4, background: C.surfaceHover, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? C.suc : C.pri, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      {viewMode === "daily" ? renderDailyView() : renderWeeklyView()}

      {/* Manage Tasks Modal */}
      {showManage && <ManageTasksModal onClose={() => setShowManage(false)} locationId={locationId} />}
    </div>
  );
}

export default WeeklyMaintenancePage;

// K9 Operations — Operations Stats Helpers

import { C, OPERATIONS_CATALOG, OPS_TYPES, ROOM_TYPES, todayStr } from "./theme";

// Weekly maintenance schedule — scheduledDays uses JS getDay() (0=Sun, 1=Mon, ..., 6=Sat)
const WEEKLY_MAINTENANCE_TASKS = [
  { id:"wm1", scheduledDays:[1,4] }, { id:"wm2", scheduledDays:[1,4] },
  { id:"wm3", scheduledDays:[1,2,3,4,5,6,0] }, { id:"wm4", scheduledDays:[3] },
  { id:"wm5", scheduledDays:[6] }, { id:"wm6", scheduledDays:[1,3,5] },
  { id:"wm7", scheduledDays:[2,5] }, { id:"wm8", scheduledDays:[4] },
  { id:"wm9", scheduledDays:[4] }, { id:"wm10", scheduledDays:[1,4] },
  { id:"wm11", scheduledDays:[1,3,5] }, { id:"wm12", scheduledDays:[6] },
  { id:"wm13", scheduledDays:[4] }, { id:"wm14", scheduledDays:[3,6] },
  { id:"wm15", scheduledDays:[1] }, { id:"wm16", scheduledDays:[1,4] },
  { id:"wm17", scheduledDays:[2,3,5] }, { id:"wm18", scheduledDays:[6] },
  { id:"wm19", scheduledDays:[1,2,3,4,5,6,0] }, { id:"wm20", scheduledDays:[2,6] },
  { id:"wm21", scheduledDays:[3] }, { id:"wm22", scheduledDays:[1] },
  { id:"wm23", scheduledDays:[1] }, { id:"wm24", scheduledDays:[1,2,3,4,5,6,0] },
];

function getWeeklyMaintenanceStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_weekly_maintenance_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  const checked = Object.values(ei).filter(i => i && i.checked).length;

  // Use computed_items if available (server-generated task list)
  const ci = entry?.computed_items;
  if (ci && ci.tasks && ci.tasks.length > 0) {
    return { total: ci.tasks.length, checked };
  }

  // Fallback: client-side schedule
  const dayIdx = new Date(td + "T12:00:00").getDay();
  const scheduled = WEEKLY_MAINTENANCE_TASKS.filter(t => t.scheduledDays.includes(dayIdx));
  return { total: scheduled.length, checked };
}

function classifyReservationType(typeName) {
  if (!typeName) return "other";
  const t = typeName.toLowerCase();
  if (t.includes("evaluation") || t.includes("eval")) return "evaluation";
  if (t.includes("tour")) return "tour";
  if (t.includes("day boarding") || t === "day boarding") return "dayboarding";
  if (t.includes("daycare") || t.includes("day care")) return "daycare";
  if (t.includes("boarding")) return "boarding";
  if (t.includes("groom") || t.includes("bath")) return "grooming";
  return "other";
}

function classifyReservationStatus(r) {
  if (r.cancelled_date) return "cancelled";
  if (r.check_in_date && r.check_out_date) return "checked-out";
  if (r.check_in_date && !r.check_out_date) return "checked-in";
  const now = new Date();
  const start = r.start_date ? new Date(r.start_date) : null;
  if (start && start > now) return "upcoming";
  return "checked-out";
}

function extractRoomFromType(typeName) {
  if (!typeName) return null;
  for (const rt of ROOM_TYPES) {
    if (typeName.toLowerCase().includes(rt.toLowerCase())) return rt;
  }
  return null;
}

const ROOM_CLEANING_TASK_TYPES = ["room_refresh", "full_disinfect", "setup", "sanitize"];

function normalizeRoomCleaningTaskType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "room_refresh" || normalized === "refresh") return "room_refresh";
  if (normalized === "full_disinfect" || normalized === "disinfect") return "full_disinfect";
  if (normalized === "setup" || normalized === "set_up") return "setup";
  if (normalized === "sanitize" || normalized === "sanitise") return "sanitize";
  return null;
}

function createRoomCleaningBuckets() {
  return ROOM_CLEANING_TASK_TYPES.reduce((acc, type) => {
    acc[type] = { total: 0, completed: 0 };
    return acc;
  }, {});
}

function toRoomCleaningNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getRoomCleaningTaskState(task, items) {
  return items[task?.task_id] || items[task?.room_key] || items[task?.room] || {};
}

function isRoomCleaningTaskCompleted(task, state) {
  if (state && typeof state === "object") {
    if (state.completed || state.checked || state.done) return true;
    if (task?.task_type === "room_refresh" && state.refresh) return true;
    if (task?.task_type === "full_disinfect" && state.disinfect) return true;
    if (task?.task_type === "setup" && state.setupDone) return true;
    if (task?.task_type === "sanitize" && (state.asNeededDone || state.sanitizeDone)) return true;
  }
  return !!task?.completed;
}

function buildRoomCleaningBuckets(computedItems, items) {
  const buckets = createRoomCleaningBuckets();
  const summary = computedItems?.task_summary || computedItems?.summary;
  const summarySource = summary?.by_type || summary?.byType || summary?.buckets || summary?.task_types;

  if (summarySource && typeof summarySource === "object") {
    ROOM_CLEANING_TASK_TYPES.forEach((type) => {
      const bucket = summarySource[type];
      if (!bucket || typeof bucket !== "object") return;
      buckets[type] = {
        total: toRoomCleaningNumber(bucket.total ?? bucket.total_tasks ?? bucket.totalTasks ?? bucket.count) || 0,
        completed: toRoomCleaningNumber(bucket.completed ?? bucket.completed_tasks ?? bucket.completedTasks ?? bucket.done) || 0,
      };
    });
    return buckets;
  }

  const taskInstances = Array.isArray(computedItems?.task_instances) ? computedItems.task_instances : [];
  if (taskInstances.length > 0) {
    taskInstances.forEach((task) => {
      const type = normalizeRoomCleaningTaskType(task?.task_type || task?.type);
      if (!type) return;
      buckets[type].total += 1;
      if (isRoomCleaningTaskCompleted(task, getRoomCleaningTaskState(task, items))) {
        buckets[type].completed += 1;
      }
    });
    return buckets;
  }

  return null;
}

// ─── Room Cleaning Stats ────────────────────────────────────────────────────
function getRoomCleaningStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_room_cleaning_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};

  const ci = entry?.computed_items;
  const taskBuckets = buildRoomCleaningBuckets(ci, ei);
  if (taskBuckets) {
    const totalSetups = taskBuckets.setup.total;
    const doneSetups = taskBuckets.setup.completed;
    const asNeededCount = taskBuckets.sanitize.total;
    const asNeededDone = taskBuckets.sanitize.completed;
    const totalNeeded = taskBuckets.room_refresh.total + taskBuckets.full_disinfect.total + asNeededCount;
    const totalDone = taskBuckets.room_refresh.completed + taskBuckets.full_disinfect.completed + asNeededDone;
    return { totalNeeded, totalDone, total: totalNeeded, cleaned: totalDone, totalSetups, doneSetups, asNeededCount, asNeededDone };
  }

  // Use legacy computed_items if available (server-generated room list)
  const sanitizeKey = (name) => (name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  if (ci && ci.rooms && ci.rooms.length > 0) {
    // Group by room key — one cleaning task per room
    const roomMap = {};
    ci.rooms.forEach(rm => {
      const key = sanitizeKey(rm.room);
      const ex = roomMap[key];
      if (ex) {
        if (rm.needsRefresh) ex.needsRefresh = true;
        if (rm.needsDisinfect) ex.needsDisinfect = true;
        if (rm.needsSetup) ex.needsSetup = true;
      } else {
        roomMap[key] = { needsRefresh: !!rm.needsRefresh, needsDisinfect: !!rm.needsDisinfect, needsSetup: !!rm.needsSetup, room: rm.room };
      }
    });
    let totalNeeded = 0, totalDone = 0;
    let totalSetups = 0, doneSetups = 0;
    Object.entries(roomMap).forEach(([key, flags]) => {
      const state = ei[key] || ei[flags.room] || {};
      if (flags.needsRefresh) { totalNeeded++; if (state.refresh) totalDone++; }
      if (flags.needsDisinfect) { totalNeeded++; if (state.disinfect) totalDone++; }
      if (flags.needsSetup) { totalSetups++; if (state.setupDone) doneSetups++; }
    });
    // Count "as needed" items from user data (any room can be flagged)
    let asNeededCount = 0, asNeededDone = 0;
    Object.values(ei).forEach(state => {
      if (state && state.asNeeded) { asNeededCount++; if (state.asNeededDone) asNeededDone++; }
    });
    totalNeeded += asNeededCount;
    totalDone += asNeededDone;
    return { totalNeeded, totalDone, total: totalNeeded, cleaned: totalDone, totalSetups, doneSetups, asNeededCount, asNeededDone };
  }

  // Fallback: client-side computation from reservations
  const allRooms = data.rooms || {};
  const reservations = data.reservations || [];
  const boardingToday = reservations.filter(r => r.type === "boarding" && r.checkIn <= td && r.checkOut >= td && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = reservations.filter(r => r.type === "boarding" && r.checkOut === td && r.status === "checked-out");
  let totalNeeded = 0, totalDone = 0;
  Object.keys(allRooms).forEach(rt => {
    (allRooms[rt] || []).forEach(rm => {
      const activeRes = boardingToday.find(r => r.room === rm);
      const coRes = boardingCheckedOut.find(r => r.room === rm);
      const notFirst = activeRes && activeRes.checkIn < td;
      const notLast = activeRes && activeRes.checkOut > td;
      const needsRefresh = !!(activeRes && notFirst && notLast);
      const needsDisinfect = !!coRes;
      if (needsRefresh) { totalNeeded++; if (ei[rm] && ei[rm].refresh) totalDone++; }
      if (needsDisinfect) { totalNeeded++; if (ei[rm] && ei[rm].disinfect) totalDone++; }
    });
  });
  return { totalNeeded, totalDone, total: totalNeeded, cleaned: totalDone };
}


// Helper: check if reservation has a specific service (used outside DailyOpsPage)
function resSvcIncludes(res, partial) {
  const svcs = res._services;
  if (!svcs) return false;
  const arr = Array.isArray(svcs) ? svcs : [];
  return arr.some(s => {
    const name = typeof s === "string" ? s : (s && s.name ? s.name : "");
    return name.toLowerCase().includes(partial.toLowerCase());
  });
}

function getPPStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_pp_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};

  // Use computed_items if available (server-generated dog list)
  const ci = entry?.computed_items;
  if (ci && ci.dogs && ci.dogs.length > 0) {
    const totalDogs = ci.dogs.length;
    const requiredSessions = totalDogs * 3;
    let completedSessions = 0;
    let totalLogged = 0;
    Object.values(ei).forEach(d => {
      if (d && d.sessions) {
        d.sessions.forEach((s, si) => {
          if (s.time || s.urinate || s.defecate) {
            totalLogged++;
            if (si < 3) completedSessions++;
          }
        });
      }
    });
    return { totalDogs, requiredSessions, completedSessions, totalLogged };
  }

  // Fallback: client-side computation from reservations
  const reservations = data.reservations || [];
  const ppRes = reservations.filter(r =>
    (r.type === "boarding" || r.type === "daycare" || r.type === "dayboarding") &&
    r.status === "checked-in" &&
    r.checkIn <= td && r.checkOut >= td &&
    (resSvcIncludes(r, "Private Play") || r.type === "dayboarding")
  );
  const totalDogs = ppRes.length;
  const requiredSessions = totalDogs * 3; // 3 required let-outs per dog
  let completedSessions = 0;
  let totalLogged = 0;
  Object.values(ei).forEach(d => {
    if (d && d.sessions) {
      d.sessions.forEach((s, si) => {
        if (s.time || s.urinate || s.defecate) {
          totalLogged++;
          if (si < 3) completedSessions++; // only first 3 count toward required
        }
      });
    }
  });
  return { totalDogs, requiredSessions, completedSessions, totalLogged };
}

function getOpsCardStatus(data, item, date) {
  if (item.comingSoon) return "coming_soon";
  if (item.dataKey === "eodEntries") return "none"; // EOD is not measured
  const td = date || todayStr();
  const entryId = `ops_${item.typeSub}_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  if (!entry) return "not_started";
  if (entry.locked) return "completed";
  const ei = entry.items;
  if (!ei) return "not_started";

  // Use computed_items for template checklists if available
  const ci = entry.computed_items;
  if (ci && Array.isArray(ci) && ci.length > 0) {
    const total = ci.length;
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : ei.filter(i => i.checked).length;
    if (total > 0 && checked >= total) return "completed";
    return checked > 0 ? "in_progress" : "not_started";
  }

  // Template checklists: check if ALL items are done
  const meta = OPS_TYPES[item.typeSub];
  if (meta && meta.key) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    // Use items count as total when it exceeds template (mobile has more items)
    const itemCount = !Array.isArray(ei) ? Object.keys(ei).length : ei.length;
    const total = Math.max(todayItems.length, itemCount);
    if (total > 0 && checked >= total) return "completed";
    return checked > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    const allTotal = stats.totalNeeded + (stats.totalSetups || 0);
    const allDone = stats.totalDone + (stats.doneSetups || 0);
    if (allTotal === 0) return "not_started";
    if (allDone >= allTotal) return "completed";
    return allDone > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    if (ppStats.requiredSessions === 0) return "not_started";
    if (ppStats.completedSessions >= ppStats.requiredSessions) return "completed";
    return ppStats.completedSessions > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "weekly_maintenance") {
    const wmStats = getWeeklyMaintenanceStats(data, td);
    if (wmStats.total === 0) return "not_started";
    if (wmStats.checked >= wmStats.total) return "completed";
    return wmStats.checked > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "collars") {
    const cStats = getCollarsStats(data, td);
    if (cStats.total === 0) return "not_started";
    if (cStats.completed >= cStats.total) return "completed";
    return cStats.completed > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "lodging_transfer") {
    const ltStats = getLodgingTransferStats(data, td);
    if (ltStats.total === 0) return "not_started";
    if (ltStats.completed >= ltStats.total) return "completed";
    return ltStats.completed > 0 ? "in_progress" : "not_started";
  }
  if (Array.isArray(ei)) {
    return ei.some(i => i.checked) ? "in_progress" : "not_started";
  }
  return Object.keys(ei).length > 0 ? "in_progress" : "not_started";
}


function getOpsProgress(data, item, date) {
  if (item.comingSoon) return 0;
  if (item.dataKey === "eodEntries") return 0;
  const td = date || todayStr();
  const entryId = `ops_${item.typeSub}_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  if (!entry) return 0;
  if (entry.locked) return 100;

  // Use computed_items for template checklists if available
  const ci = entry.computed_items;
  if (ci && Array.isArray(ci) && ci.length > 0) {
    const total = ci.length;
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : ei.filter(i => i.checked).length;
    return Math.round((checked / total) * 100);
  }

  const meta = OPS_TYPES[item.typeSub];
  const isTemplate = meta && !!meta.key;
  if (isTemplate) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    const itemCount = !Array.isArray(ei) ? Object.keys(ei).length : ei.length;
    const total = Math.max(todayItems.length, itemCount);
    if (total === 0) return 0;
    return Math.round((checked / total) * 100);
  }
  const ei = entry.items;
  if (!ei) return 0;
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    const allTotal = stats.totalNeeded + (stats.totalSetups || 0);
    const allDone = stats.totalDone + (stats.doneSetups || 0);
    return allTotal > 0 ? Math.round((allDone / allTotal) * 100) : 0;
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    return ppStats.requiredSessions > 0 ? Math.round((ppStats.completedSessions / ppStats.requiredSessions) * 100) : 0;
  }
  if (item.typeSub === "weekly_maintenance") {
    const wmStats = getWeeklyMaintenanceStats(data, td);
    return wmStats.total > 0 ? Math.round((wmStats.checked / wmStats.total) * 100) : 0;
  }
  if (item.typeSub === "collars") {
    const cStats = getCollarsStats(data, td);
    return cStats.total > 0 ? Math.round((cStats.completed / cStats.total) * 100) : 0;
  }
  if (item.typeSub === "lodging_transfer") {
    const ltStats = getLodgingTransferStats(data, td);
    return ltStats.total > 0 ? Math.round((ltStats.completed / ltStats.total) * 100) : 0;
  }
  if (Array.isArray(ei)) {
    const total = ei.length;
    return total === 0 ? 0 : Math.round((ei.filter(i => i.checked).length / total) * 100);
  }
  const keys = Object.keys(ei);
  return keys.length > 0 ? 50 : 0;
}


function getOpsCountLabel(data, item, date) {
  if (item.comingSoon) return "";
  if (item.dataKey === "eodEntries") return "";
  const td = date || todayStr();
  const entryId = `ops_${item.typeSub}_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);

  // Use computed_items for template checklists if available
  const ci = entry?.computed_items;
  if (ci && Array.isArray(ci) && ci.length > 0) {
    const total = ci.length;
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : ei.filter(i => i.checked).length;
    return `${checked}/${total} tasks`;
  }

  const meta = OPS_TYPES[item.typeSub];
  const isTemplate = meta && !!meta.key;
  if (isTemplate) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    if (!entry) return `0/${todayItems.length} tasks`;
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    const itemCount = !Array.isArray(ei) ? Object.keys(ei).length : ei.length;
    const total = Math.max(todayItems.length, itemCount);
    return `${checked}/${total} tasks`;
  }
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    const parts = [];
    const schedCleans = stats.totalNeeded - (stats.asNeededCount || 0);
    const schedDone = stats.totalDone - (stats.asNeededDone || 0);
    if (schedCleans > 0) parts.push(`${schedDone}/${schedCleans} cleans`);
    if (stats.totalSetups > 0) parts.push(`${stats.doneSetups}/${stats.totalSetups} setups`);
    if (stats.asNeededCount > 0) parts.push(`${stats.asNeededDone}/${stats.asNeededCount} as needed`);
    return parts.length > 0 ? parts.join(" · ") : "No rooms";
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    if (ppStats.requiredSessions === 0) return "No PP dogs";
    return `${ppStats.completedSessions}/${ppStats.requiredSessions} required · ${ppStats.totalLogged} total`;
  }
  if (item.typeSub === "weekly_maintenance") {
    const wmStats = getWeeklyMaintenanceStats(data, td);
    return `${wmStats.checked}/${wmStats.total} tasks`;
  }
  if (item.typeSub === "collars") {
    const cStats = getCollarsStats(data, td);
    if (cStats.total === 0) return "No collars";
    return `${cStats.completed}/${cStats.total} collars`;
  }
  if (item.typeSub === "lodging_transfer") {
    const ltStats = getLodgingTransferStats(data, td);
    if (ltStats.total === 0) return "No transfers";
    return `${ltStats.completed}/${ltStats.total} transfers`;
  }
  return "";
}

// ─── Room Cleaning Breakdown (for Dashboard 3-column layout) ──────────────
// Returns individual counts for set-ups, disinfects, and refreshes
function getRoomCleaningBreakdown(data, date) {
  const td = date || todayStr();
  const entryId = `ops_room_cleaning_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  const ci = entry?.computed_items;
  const taskBuckets = buildRoomCleaningBuckets(ci, ei);
  if (taskBuckets) {
    return {
      totalSetups: taskBuckets.setup.total,
      doneSetups: taskBuckets.setup.completed,
      totalDisinfects: taskBuckets.full_disinfect.total,
      doneDisinfects: taskBuckets.full_disinfect.completed,
      totalRefreshes: taskBuckets.room_refresh.total,
      doneRefreshes: taskBuckets.room_refresh.completed,
    };
  }
  const sanitizeKey = (name) => (name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

  if (ci && ci.rooms && ci.rooms.length > 0) {
    const roomMap = {};
    ci.rooms.forEach(rm => {
      const key = sanitizeKey(rm.room);
      const ex = roomMap[key];
      if (ex) {
        if (rm.needsRefresh) ex.needsRefresh = true;
        if (rm.needsDisinfect) ex.needsDisinfect = true;
        if (rm.needsSetup) ex.needsSetup = true;
      } else {
        roomMap[key] = { needsRefresh: !!rm.needsRefresh, needsDisinfect: !!rm.needsDisinfect, needsSetup: !!rm.needsSetup, room: rm.room };
      }
    });
    let totalSetups = 0, doneSetups = 0;
    let totalDisinfects = 0, doneDisinfects = 0;
    let totalRefreshes = 0, doneRefreshes = 0;
    Object.entries(roomMap).forEach(([key, flags]) => {
      const state = ei[key] || ei[flags.room] || {};
      if (flags.needsSetup) { totalSetups++; if (state.setupDone) doneSetups++; }
      if (flags.needsDisinfect) { totalDisinfects++; if (state.disinfect) doneDisinfects++; }
      if (flags.needsRefresh) { totalRefreshes++; if (state.refresh) doneRefreshes++; }
    });
    return {
      totalSetups, doneSetups,
      totalDisinfects, doneDisinfects,
      totalRefreshes, doneRefreshes,
    };
  }

  // Fallback: no computed_items available
  return { totalSetups: 0, doneSetups: 0, totalDisinfects: 0, doneDisinfects: 0, totalRefreshes: 0, doneRefreshes: 0 };
}

// ─── Collars Stats ──────────────────────────────────────────────────────────
function getCollarsStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_collars_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ci = entry?.computed_items;
  if (!ci || !ci.dogs) return { total: 0, completed: 0 };
  const total = ci.dogs.length;
  const completions = ci.completions || {};
  const completed = Object.values(completions).filter(c => c && c.status === "complete").length;
  return { total, completed, summary: ci.summary || {} };
}

function getLodgingTransferStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_lodging_transfer_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ci = entry?.computed_items;
  if (!ci || !ci.transfers) return { total: 0, completed: 0 };
  const total = ci.transfers.length;
  const completions = ci.completions || {};
  const completed = Object.values(completions).filter(c => c && c.status === "complete").length;
  return { total, completed, summary: ci.summary || {} };
}

// ─── Shared UI Components (from POS App) ───────────────────────────────────

// Tip component

export { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, getRoomCleaningBreakdown, getWeeklyMaintenanceStats, resSvcIncludes, getPPStats, getCollarsStats, getLodgingTransferStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel };

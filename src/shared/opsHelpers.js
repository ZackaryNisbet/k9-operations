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
  const dayIdx = new Date(td + "T12:00:00").getDay();
  const scheduled = WEEKLY_MAINTENANCE_TASKS.filter(t => t.scheduledDays.includes(dayIdx));
  const entryId = `ops_weekly_maintenance_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  const checked = Object.values(ei).filter(i => i && i.checked).length;
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
  // "Boarding | Luxury Suite (All Inclusive)" → "Luxury Suite"
  // "Boarding | Executive Room (All Inclusive)" → "Executive Room"
  // "Boarding | Double Compartment (All Inclusive)" → "Double Compartment"
  // "Boarding | Single Compartment (All Inclusive)" → "Single Compartment"
  for (const rt of ROOM_TYPES) {
    if (typeName.toLowerCase().includes(rt.toLowerCase())) return rt;
  }
  return null;
}

// ─── useGingrData Hook (Supabase + Gingr Sync) ────────────────────────────
function getRoomCleaningStats(data, date) {
  const td = date || todayStr();
  const allRooms = data.rooms || {};
  const reservations = data.reservations || [];
  const boardingToday = reservations.filter(r => r.type === "boarding" && r.checkIn <= td && r.checkOut >= td && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = reservations.filter(r => r.type === "boarding" && r.checkOut === td && r.status === "checked-out");
  let totalNeeded = 0, totalDone = 0;
  const entryId = `ops_room_cleaning_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
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
  // Count PP dogs: dogs with "Private Play" add-on OR day boarding dogs
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
  // Template checklists: check if ALL items are done
  const meta = OPS_TYPES[item.typeSub];
  if (meta && meta.key) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const total = todayItems.length;
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    if (total > 0 && checked >= total) return "completed";
    return checked > 0 ? "in_progress" : "not_started";
  }
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    if (stats.totalNeeded === 0) return "not_started";
    if (stats.totalDone >= stats.totalNeeded) return "completed";
    return stats.totalDone > 0 ? "in_progress" : "not_started";
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
  const meta = OPS_TYPES[item.typeSub];
  const isTemplate = meta && !!meta.key;
  if (isTemplate) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const total = todayItems.length;
    if (total === 0) return 0;
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    return Math.round((checked / total) * 100);
  }
  const ei = entry.items;
  if (!ei) return 0;
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    return stats.totalNeeded > 0 ? Math.round((stats.totalDone / stats.totalNeeded) * 100) : 0;
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    return ppStats.requiredSessions > 0 ? Math.round((ppStats.completedSessions / ppStats.requiredSessions) * 100) : 0;
  }
  if (item.typeSub === "weekly_maintenance") {
    const wmStats = getWeeklyMaintenanceStats(data, td);
    return wmStats.total > 0 ? Math.round((wmStats.checked / wmStats.total) * 100) : 0;
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
  const meta = OPS_TYPES[item.typeSub];
  const isTemplate = meta && !!meta.key;
  if (isTemplate) {
    const template = data[meta.key] || meta.def;
    const dayIdx = new Date(td + "T12:00:00").getDay();
    const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const total = todayItems.length;
    if (!entry) return `0/${total} tasks`;
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    return `${checked}/${total} tasks`;
  }
  if (item.typeSub === "room_cleaning") {
    const stats = getRoomCleaningStats(data, td);
    if (stats.totalNeeded === 0) return "No rooms to clean";
    return `${stats.totalDone}/${stats.totalNeeded} rooms`;
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
  return "";
}

// ─── Shared UI Components (from POS App) ───────────────────────────────────

// Tip component

export { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel };

import { ROOM_TYPES } from "../constants/forms";
import { OPS_TYPES } from "../constants/operations";
import { todayStr } from "./format";

function getRoomCleaningStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_room_cleaning_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  const sanitizeKey = (name) => (name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

  // Use computed_items if available (server-generated room list)
  const ci = entry?.computed_items;
  if (ci && ci.rooms && ci.rooms.length > 0) {
    let totalNeeded = 0, totalDone = 0;
    let totalSetups = 0, doneSetups = 0;
    ci.rooms.forEach(rm => {
      const key = sanitizeKey(rm.room);
      const state = ei[key] || ei[rm.room] || {};
      if (rm.needsRefresh) { totalNeeded++; if (state.refresh) totalDone++; }
      if (rm.needsDisinfect) { totalNeeded++; if (state.disinfect) totalDone++; }
      if (rm.needsSetup) { totalSetups++; if (state.setupDone) doneSetups++; }
    });
    return { totalNeeded, totalDone, total: totalNeeded, cleaned: totalDone, totalSetups, doneSetups };
  }

  // Fallback: client-side computation from reservations
  const allRooms = data.rooms || {};
  const reservations = data.reservations || [];
  const boardingToday = reservations.filter(r => r.type === "boarding" && r.checkIn <= td && r.checkOut >= td && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = reservations.filter(r => r.type === "boarding" && r.checkOut === td && r.status === "checked-out");
  let totalNeeded = 0, totalDone = 0;
  ROOM_TYPES.forEach(rt => {
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
  return { totalNeeded, totalDone, total: totalNeeded, cleaned: totalDone, totalSetups: 0, doneSetups: 0 };
}

// PP progress helper: 3 required sessions per dog
function getPPStats(data, date) {
  const td = date || todayStr();
  const entryId = `ops_pp_${td}`;
  const entry = (data.dailyOps || []).find(e => e.id === entryId);
  const ei = entry ? entry.items || {} : {};
  // Count PP dogs for this date
  const reservations = data.reservations || [];
  const dogs = data.dogs || [];
  const ppDogIds = new Set();
  reservations.forEach(r => { if (r.type === "evaluation" && r.evalResult === "passed_private") ppDogIds.add(r.dogId); });
  dogs.forEach(d => { if ((d.tags || []).includes("tag_pp")) ppDogIds.add(d.id); });
  const ppRes = reservations.filter(r => (r.type === "boarding" || r.type === "daycare") && r.status === "checked-in" && r.checkIn <= td && r.checkOut >= td && ppDogIds.has(r.dogId));
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
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
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
    const ei = entry.items || {};
    const checked = !Array.isArray(ei) ? Object.values(ei).filter(i => i && i.checked).length : Array.isArray(ei) ? ei.filter(i => i.checked).length : 0;
    const itemCount = !Array.isArray(ei) ? Object.keys(ei).length : ei.length;
    const total = Math.max(todayItems.length, itemCount);
    if (total === 0) return 0;
    return Math.round((checked / total) * 100);
  }
  const ei = entry.items;
  if (!ei) return 0;
  if (item.typeSub === "pictures") {
    const vals = Object.values(ei);
    const done = vals.filter(v => v === true).length;
    return vals.length > 0 ? Math.round((done / vals.length) * 100) : 0;
  }
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
    if (stats.totalNeeded > 0) parts.push(`${stats.totalDone}/${stats.totalNeeded} cleans`);
    if (stats.totalSetups > 0) parts.push(`${stats.doneSetups}/${stats.totalSetups} setups`);
    return parts.length > 0 ? parts.join(" · ") : "No rooms";
  }
  if (item.typeSub === "pictures") {
    if (!entry || !entry.items) return "0 photos";
    const ei = entry.items;
    const done = Object.values(ei).filter(v => v === true).length;
    const total = Object.keys(ei).length;
    return `${done}/${total} photos`;
  }
  if (item.typeSub === "pp") {
    const ppStats = getPPStats(data, td);
    if (ppStats.requiredSessions === 0) return "No PP dogs";
    return `${ppStats.completedSessions}/${ppStats.requiredSessions} required · ${ppStats.totalLogged} total`;
  }
  return "";
}

export { getRoomCleaningStats, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel };

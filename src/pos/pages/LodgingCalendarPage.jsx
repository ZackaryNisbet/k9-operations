import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardingPreviewModal } from "../components/BoardingPreviewModal";
import { Btn, Card } from "../components/ui";
import { C } from "../constants/colors";
import { DEF_PRICING } from "../constants/pricing";
import { I } from "../icons";
import { ROOM_TYPES } from "../constants/forms";
import { addDays, dayNum, fmtDate, fmtTime, getMonday, getWeekDays, gid, shortDay, todayStr } from "../lib/format";
import { buildAuditEntry } from "../components/widgets";
import { countNights } from "../lib/pricing";

function LodgingCalendarPage({ data, save, nav, onNew, profile }) {
  const td = todayStr();
  const [weekStart, setWeekStart] = useState(() => getMonday(td));
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEnd = weekDays[6];

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(getMonday(td));
  const isCurrentWeek = weekStart === getMonday(td);

  // Calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(weekStart+"T12:00:00"); return d.getMonth(); });
  const [calYear, setCalYear] = useState(() => { const d = new Date(weekStart+"T12:00:00"); return d.getFullYear(); });
  useEffect(() => { const d = new Date(weekStart+"T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calMonth, calYear]);
  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => {
    const m = String(calMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const picked = `${calYear}-${m}-${d}`;
    setWeekStart(getMonday(picked));
    setShowCalendar(false);
  };
  const calRef = useRef(null);
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const dn = (did, cid) => { const d = data.dogs.find(x => x.id === did); const dogName = d ? d.fields.name : "?"; const c = cid ? data.clients.find(x => x.id === cid) : (d ? data.clients.find(x => x.id === d.clientId) : null); const ln = c?.fields?.last_name; return ln ? `${dogName} ${ln}` : dogName; };
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = (rt) => setCollapsed(prev => ({ ...prev, [rt]: !prev[rt] }));

  // All rooms grouped by type (must be before drag/optimize which reference it)
  const allRooms = data.rooms || {};

  // Dynamically compute which reservations have unpaid deposits (accounts for refunds)
  const unpaidDepositIds = useMemo(() => {
    const ids = new Set();
    (data.reservations || []).forEach(r => {
      if (r.status !== "upcoming" && r.status !== "checked-in") return;
      if (r.type !== "boarding" && r.type !== "dayboarding") return;
      const pmts = (data.payments || []).filter(p => p.reservationId === r.id && p.status === "completed" && p.type !== "refund");
      const refs = (data.payments || []).filter(p => p.reservationId === r.id && (p.type === "refund" || p.status === "refunded"));
      const collected = pmts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) - refs.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const pricing = data.pricing || DEF_PRICING;
      const nights = Math.max(1, countNights(r.checkIn, r.checkOut));
      const rate = (pricing.boardingRates || {})[r.roomType] || 0;
      const est = rate * nights;
      const depositReq = Math.round(est * 0.5 * 100) / 100;
      if (collected < depositReq) ids.add(r.id);
    });
    return ids;
  }, [data.reservations, data.payments, data.pricing]);

  // Night-level selection mode
  const [nightSelectMode, setNightSelectMode] = useState(false);
  const [selectedNights, setSelectedNights] = useState({}); // { [resId]: Set of date strings }
  const [nightDragTarget, setNightDragTarget] = useState(null); // { resId, room } during night-drag

  const toggleNightSelect = (resId, date) => {
    setSelectedNights(prev => {
      const next = { ...prev };
      const set = new Set(next[resId] || []);
      if (set.has(date)) set.delete(date);
      else set.add(date);
      next[resId] = set;
      if (set.size === 0) delete next[resId];
      return next;
    });
  };

  const moveSelectedNights = async (resId, targetRoom) => {
    const nights = selectedNights[resId];
    if (!nights || nights.size === 0) return;
    const res = data.reservations.find(r => r.id === resId);
    if (!res) return;
    const sortedNights = [...nights].sort();
    const newRoomType = roomTypeOf(targetRoom) || res.roomType;
    // Build segments: group consecutive nights
    const segments = [];
    let segStart = sortedNights[0];
    let segEnd = addDays(sortedNights[0], 1);
    for (let i = 1; i < sortedNights.length; i++) {
      if (sortedNights[i] === segEnd) { segEnd = addDays(segEnd, 1); }
      else { segments.push({ startDate: segStart, endDate: segEnd }); segStart = sortedNights[i]; segEnd = addDays(sortedNights[i], 1); }
    }
    segments.push({ startDate: segStart, endDate: segEnd });
    // Build remaining segments (nights NOT selected stay in original room)
    const allNights = [];
    let d = res.checkIn;
    while (d < res.checkOut) { allNights.push(d); d = addDays(d, 1); }
    const remainingNights = allNights.filter(n => !nights.has(n));
    const remainingSegs = [];
    if (remainingNights.length > 0) {
      let rs = remainingNights[0]; let re = addDays(rs, 1);
      for (let i = 1; i < remainingNights.length; i++) {
        if (remainingNights[i] === re) { re = addDays(re, 1); }
        else { remainingSegs.push({ startDate: rs, endDate: re, roomType: res.roomType, room: res.room }); rs = remainingNights[i]; re = addDays(remainingNights[i], 1); }
      }
      remainingSegs.push({ startDate: rs, endDate: re, roomType: res.roomType, room: res.room });
    }
    // Add moved segments
    const movedSegs = segments.map(s => ({ startDate: s.startDate, endDate: s.endDate, roomType: newRoomType, room: targetRoom }));
    const allSegs = [...remainingSegs, ...movedSegs].sort((a, b) => a.startDate.localeCompare(b.startDate));
    // Check for conflicts on moved nights
    for (const ms of movedSegs) {
      if (hasConflict(resId, targetRoom, ms.startDate, ms.endDate)) {
        addToast({ dogName: dn(res.dogId), action: "conflict", oldVal: "", newVal: `Cannot move to ${targetRoom} — overlap exists` });
        return;
      }
    }
    // Save with roomSegments
    await save({ ...data, reservations: data.reservations.map(r => r.id === resId ? { ...r, roomSegments: allSegs } : r) });
    addToast({ dogName: dn(res.dogId), action: "nights transferred", oldVal: `${nights.size} night${nights.size > 1 ? "s" : ""} from ${res.room}`, newVal: targetRoom, undoRes: res });
    setSelectedNights({});
    setNightDragTarget(null);
  };

  // Interaction state: custom mouse system for drag/resize
  const [interaction, setInteraction] = useState(null);
  const interRef = useRef(null);
  const justDraggedRef = useRef(false);
  const [boardingPreviewId, setBoardingPreviewId] = useState(null);
  const [textNotify, setTextNotify] = useState(null);

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // Edge detection: returns "left" | "right" | null
  const getEdge = (e, el) => {
    const r = el.getBoundingClientRect();
    if (e.clientX - r.left < 8) return "left";
    if (r.right - e.clientX < 8) return "right";
    return null;
  };

  // Column pixel width from the day-grid container
  const getColWidth = () => {
    const el = document.querySelector("[data-day-grid]");
    return el ? el.getBoundingClientRect().width / 7 : 100;
  };

  // Conflict check
  const hasConflict = (resId, room, ci, co) =>
    data.reservations.some(r =>
      r.id !== resId && r.room === room && r.type === "boarding" &&
      r.status !== "checked-out" && r.checkIn < co && r.checkOut > ci
    );

  // Toast helpers
  const addToast = (t) => {
    const id = ++toastIdRef.current;
    const toast = { id, ...t };
    setToasts(prev => [...prev, toast]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 10000);
  };
  const dismissToast = (id) => setToasts(prev => prev.filter(x => x.id !== id));
  const handleUndo = async (toast) => {
    if (toast.undoRes.id === "__optimize__") {
      const auditEntry = buildAuditEntry("__optimize__", "Undo Optimize", [{ field: "Action", oldVal: "Optimized", newVal: "Reverted" }], profile);
      await save({ ...data, auditLog: [...(data.auditLog || []), auditEntry], reservations: toast.undoRes._prevReservations });
    } else {
      const currentRes = data.reservations.find(r => r.id === toast.undoRes.id);
      const undoAction = toast.action?.includes("checked in") ? "Undo Check-In" : toast.action?.includes("checked out") ? "Undo Check-Out" : toast.action?.includes("transferred") ? "Undo Transfer" : "Undo Action";
      const diffs = [];
      if (currentRes && currentRes.status !== toast.undoRes.status) {
        diffs.push({ field: "Status", oldVal: currentRes.status === "checked-in" ? "Checked In" : currentRes.status === "checked-out" ? "Checked Out" : currentRes.status, newVal: toast.undoRes.status === "upcoming" ? "Upcoming" : toast.undoRes.status === "checked-in" ? "Checked In" : toast.undoRes.status });
      }
      if (currentRes && currentRes.room !== toast.undoRes.room) {
        diffs.push({ field: "Room", oldVal: currentRes.room || "—", newVal: toast.undoRes.room || "—" });
      }
      const auditEntry = buildAuditEntry(toast.undoRes.id, undoAction, diffs.length > 0 ? diffs : [{ field: "Action", oldVal: toast.action || "Change", newVal: "Reverted" }], profile);
      await save({ ...data, auditLog: [...(data.auditLog || []), auditEntry], reservations: data.reservations.map(r => r.id === toast.undoRes.id ? toast.undoRes : r) });
    }
    dismissToast(toast.id);
  };

  const showTextNotifyToast = (client, dog, diffs) => {
    const clientName = `${client?.fields?.first_name || ""} ${client?.fields?.last_name || ""}`.trim() || "Client";
    const dogName = dog?.fields?.name || "your dog";
    const phone = client?.fields?.phone || "";
    const changeLines = diffs.map(d => `${d.field}: ${d.oldVal} → ${d.newVal}`).join("\n");
    const msg = `Hi ${clientName.split(" ")[0]}, this is K9 Operations! We've updated ${dogName}'s reservation:\n${changeLines}\nPlease let us know if you have any questions!`;
    setTextNotify({ clientName, clientPhone: phone, dogName, diffs, message: msg, showPreview: false, sending: false });
  };
  const sendTextNotify = async () => {
    if (!textNotify) return;
    setTextNotify(prev => ({ ...prev, sending: true }));
    const newMsg = { id: gid(), type: "outbound", channel: "sms", to: textNotify.clientPhone, toName: textNotify.clientName, body: textNotify.message, sentAt: new Date().toISOString(), sentBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff", status: "sent" };
    await save({ ...data, messages: [...(data.messages || []), newMsg] });
    setTextNotify(null);
  };

  // Find roomType for a given room string
  const roomTypeOf = (room) => ROOM_TYPES.find(rt => (allRooms[rt] || []).includes(room)) || null;

  // Start an interaction (mousedown on a block)
  const startInteraction = (e, res, type) => {
    e.preventDefault();
    e.stopPropagation();
    const colW = getColWidth();
    const state = { type, resId: res.id, origRes: { ...res }, startX: e.clientX, startY: e.clientY, colW, origCI: res.checkIn, origCO: res.checkOut, origRoom: res.room, dayDelta: 0, targetRoom: res.room, moved: false };
    interRef.current = state;
    setInteraction(state);

    const onMove = (me) => {
      const s = interRef.current;
      if (!s) return;
      const dx = me.clientX - s.startX;
      const dy = me.clientY - s.startY;
      if (!s.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // deadzone
      s.moved = true;
      s.dayDelta = Math.round(dx / s.colW);
      // Detect target room via elementFromPoint
      if (s.type === "move") {
        const el = document.elementFromPoint(me.clientX, me.clientY);
        const rowEl = el && el.closest ? el.closest("[data-room-row]") : null;
        if (rowEl) {
          const tRoom = rowEl.dataset.roomRow;
          if (tRoom) s.targetRoom = tRoom;
        }
      }
      interRef.current = { ...s };
      setInteraction({ ...s });
    };

    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const s = interRef.current;
      interRef.current = null;
      setInteraction(null);
      if (!s || !s.moved) return;
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);

      // Compute final dates
      let ci, co;
      if (s.type === "move") { ci = addDays(s.origCI, s.dayDelta); co = addDays(s.origCO, s.dayDelta); }
      else if (s.type === "resize-left") { ci = addDays(s.origCI, s.dayDelta); co = s.origCO; }
      else { ci = s.origCI; co = addDays(s.origCO, s.dayDelta); }

      // Validate
      if (ci >= co) return;
      const tRoom = s.type === "move" ? s.targetRoom : s.origRoom;
      if (ci === s.origCI && co === s.origCO && tRoom === s.origRoom) return;
      if (hasConflict(s.resId, tRoom, ci, co)) return;

      // Save — update roomType if moving across room types
      const newRoomType = roomTypeOf(tRoom) || s.origRes.roomType;
      await save({ ...data, reservations: data.reservations.map(r => r.id === s.resId ? { ...r, checkIn: ci, checkOut: co, room: tRoom, roomType: newRoomType } : r) });

      // Toast
      const dogName = dn(s.origRes.dogId);
      let action, oldVal, newVal;
      if (s.type === "move" && tRoom !== s.origRoom && s.dayDelta === 0) {
        action = "moved"; oldVal = s.origRoom; newVal = tRoom;
      } else if (s.type === "move" && tRoom !== s.origRoom) {
        action = "moved & shifted"; oldVal = `${s.origRoom}, ${fmtDate(s.origCI)} – ${fmtDate(s.origCO)}`; newVal = `${tRoom}, ${fmtDate(ci)} – ${fmtDate(co)}`;
      } else if (s.type === "resize-left") {
        action = "check-in changed"; oldVal = fmtDate(s.origCI); newVal = fmtDate(ci);
      } else if (s.type === "resize-right") {
        action = "check-out changed"; oldVal = fmtDate(s.origCO); newVal = fmtDate(co);
      } else {
        action = "shifted"; oldVal = `${fmtDate(s.origCI)} – ${fmtDate(s.origCO)}`; newVal = `${fmtDate(ci)} – ${fmtDate(co)}`;
      }
      addToast({ dogName, action, oldVal, newVal, undoRes: s.origRes });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Optimize state & logic
  const [showOptimizeConfirm, setShowOptimizeConfirm] = useState(false);
  const [showOptGuide, setShowOptGuide] = useState(false);

  const computeOptimized = useCallback(() => {
    const newRoomMap = {}; // resId -> newRoom
    for (const rt of ROOM_TYPES) {
      const rooms = allRooms[rt] || [];
      if (rooms.length === 0) continue;
      // Include all active reservations for packing, but only move upcoming ones
      const resOfType = data.reservations.filter(r => r.type === "boarding" && r.roomType === rt && r.status !== "checked-out" && r.status !== "cancelled");
      const sorted = [...resOfType].sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut));
      const latestCO = {};
      rooms.forEach(rm => { latestCO[rm] = "1900-01-01"; });
      // First, lock checked-in reservations to their current rooms
      for (const res of sorted) {
        if (res.status === "checked-in") {
          latestCO[res.room] = res.checkOut > latestCO[res.room] ? res.checkOut : latestCO[res.room];
        }
      }
      // Then pack only upcoming reservations around the locked ones
      for (const res of sorted) {
        if (res.status === "checked-in") continue; // skip — already locked in place
        let bestRoom = null, bestCO = null;
        for (const rm of rooms) {
          if (latestCO[rm] <= res.checkIn) {
            if (bestCO === null || latestCO[rm] > bestCO) { bestRoom = rm; bestCO = latestCO[rm]; }
          }
        }
        if (!bestRoom) { bestRoom = rooms.reduce((b, rm) => latestCO[rm] < latestCO[b] ? rm : b); }
        latestCO[bestRoom] = res.checkOut;
        if (bestRoom !== res.room) newRoomMap[res.id] = bestRoom;
      }
    }
    return newRoomMap;
  }, [allRooms, data.reservations]);

  const optimizeMoveCount = useMemo(() => Object.keys(computeOptimized()).length, [computeOptimized]);

  const runOptimize = async () => {
    const moves = computeOptimized();
    const count = Object.keys(moves).length;
    if (count === 0) { setShowOptimizeConfirm(false); return; }
    const prevReservations = [...data.reservations];
    await save({ ...data, reservations: data.reservations.map(r => moves[r.id] ? { ...r, room: moves[r.id] } : r) });
    setShowOptimizeConfirm(false);
    addToast({ dogName: `${count} reservation${count > 1 ? "s" : ""}`, action: "optimized", oldVal: "fragmented", newVal: "packed tight", undoRes: { id: "__optimize__", _prevReservations: prevReservations } });
  };

  const activeTypes = useMemo(() => ROOM_TYPES.filter(rt => (allRooms[rt] || []).length > 0), [allRooms]);
  const allCollapsed = activeTypes.length > 0 && activeTypes.every(rt => collapsed[rt]);
  const toggleAll = () => {
    const next = {};
    activeTypes.forEach(rt => { next[rt] = !allCollapsed; });
    setCollapsed(next);
  };
  const roomRows = useMemo(() => {
    const rows = [];
    ROOM_TYPES.forEach(rt => {
      const list = allRooms[rt] || [];
      if (list.length > 0) {
        rows.push({ type: "header", roomType: rt, count: list.length });
        list.forEach(r => rows.push({ type: "room", roomType: rt, room: r }));
      }
    });
    return rows;
  }, [allRooms]);

  // Boarding + dayboarding reservations that overlap this week
  const weekRes = useMemo(() =>
    data.reservations.filter(r =>
      (r.type === "boarding" || r.type === "dayboarding") && r.room && r.status !== "checked-out" && r.status !== "cancelled" &&
      r.checkIn <= weekEnd && r.checkOut >= weekStart
    ), [data.reservations, weekStart, weekEnd]);

  // Map: room -> [reservations]
  const resByRoom = useMemo(() => {
    const m = {};
    weekRes.forEach(r => { if (!m[r.room]) m[r.room] = []; m[r.room].push(r); });
    return m;
  }, [weekRes]);

  // Per room-type, per day: how many rooms are booked
  const dailyOccByType = useMemo(() => {
    const m = {};
    ROOM_TYPES.forEach(rt => {
      const rooms = allRooms[rt] || [];
      m[rt] = weekDays.map(d =>
        rooms.filter(room => (resByRoom[room] || []).some(r => r.checkIn <= d && r.checkOut > d)).length
      );
    });
    return m;
  }, [allRooms, weekDays, resByRoom]);

  // Overall day+night occupancy (boarding + dayboarding): rooms booked / total rooms
  const totalRoomCount = useMemo(() => activeTypes.reduce((s, rt) => s + (allRooms[rt] || []).length, 0), [activeTypes, allRooms]);
  const dailyOccOverall = useMemo(() =>
    weekDays.map((_, di) => activeTypes.reduce((s, rt) => s + (dailyOccByType[rt] || [])[di], 0)),
    [weekDays, activeTypes, dailyOccByType]
  );

  // Overnight-only occupancy (boarding only, excludes dayboarding)
  const overnightResByRoom = useMemo(() => {
    const m = {};
    weekRes.filter(r => r.type === "boarding").forEach(r => { if (!m[r.room]) m[r.room] = []; m[r.room].push(r); });
    return m;
  }, [weekRes]);
  const dailyOccOvernight = useMemo(() =>
    weekDays.map(d => activeTypes.reduce((s, rt) =>
      s + (allRooms[rt] || []).filter(room => (overnightResByRoom[room] || []).some(r => r.checkIn <= d && r.checkOut > d)).length, 0)),
    [weekDays, activeTypes, allRooms, overnightResByRoom]
  );

  // Week label
  const weekLabel = (() => {
    const ms = new Date(weekStart + "T12:00:00");
    const me = new Date(weekEnd + "T12:00:00");
    const sameMonth = ms.getMonth() === me.getMonth();
    if (sameMonth) return `${ms.toLocaleDateString("en-US",{month:"long"})} ${ms.getDate()} – ${me.getDate()}, ${ms.getFullYear()}`;
    return `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}, ${me.getFullYear()}`;
  })();

  const COL_W = "1fr";
  const LABEL_W = 120;
  const ROW_H = 48;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Lodging Calendar</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { setNightSelectMode(v => !v); if (nightSelectMode) { setSelectedNights({}); setNightDragTarget(null); } }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${nightSelectMode ? C.acc : C.border}`, background: nightSelectMode ? `${C.acc}15` : "transparent", color: nightSelectMode ? C.acc : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Night Select
          </button>
          <Btn onClick={onNew} icon={<I.Plus />}>New {(data.hotkeySettings||{}).showHints===true&&<kbd style={{fontSize:10,fontWeight:600,color:C.textMut,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",marginLeft:4,fontFamily:"'Outfit',monospace",lineHeight:1.4}}>N</kbd>}</Btn>
        </div>
      </div>
      {/* Night selection instructions */}
      {nightSelectMode && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: `${C.acc}08`, border: `1.5px solid ${C.acc}30`, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: C.textSec }}>
            <span style={{ fontWeight: 700, color: C.acc }}>Night Select Mode:</span> Hover over nights in a reservation to see the checkbox, click it to select, then drag those selected nights to a different room.
          </div>
          {Object.keys(selectedNights).length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.suc }}>{Object.values(selectedNights).reduce((s, set) => s + set.size, 0)} night(s) selected</span>
              <Btn size="sm" variant="ghost" onClick={() => setSelectedNights({})}>Clear</Btn>
            </div>
          )}
        </div>
      )}
      {/* Transfer selected nights panel */}
      {nightSelectMode && Object.keys(selectedNights).length > 0 && (() => {
        const resId = Object.keys(selectedNights)[0];
        const res = data.reservations.find(r => r.id === resId);
        if (!res) return null;
        const nightCount = selectedNights[resId]?.size || 0;
        const sortedDates = [...(selectedNights[resId] || [])].sort();
        const dateLabel = sortedDates.length <= 3 ? sortedDates.map(d => fmtDate(d)).join(", ") : `${fmtDate(sortedDates[0])} – ${fmtDate(sortedDates[sortedDates.length - 1])}`;
        // Build date ranges for conflict check
        const nightRanges = [];
        if (sortedDates.length > 0) {
          let rs = sortedDates[0]; let re = addDays(sortedDates[0], 1);
          for (let i = 1; i < sortedDates.length; i++) {
            if (sortedDates[i] === re) { re = addDays(re, 1); }
            else { nightRanges.push({ start: rs, end: re }); rs = sortedDates[i]; re = addDays(sortedDates[i], 1); }
          }
          nightRanges.push({ start: rs, end: re });
        }
        // Filter rooms: exclude current room and rooms with conflicts
        const availRoomsList = [];
        ROOM_TYPES.forEach(rt => (allRooms[rt] || []).forEach(room => {
          if (room === res.room) return;
          const hasConfl = nightRanges.some(nr => hasConflict(resId, room, nr.start, nr.end));
          if (!hasConfl) availRoomsList.push({ room, type: rt });
        }));
        return (
          <div style={{ padding: "14px 18px", borderRadius: 12, background: C.sucLt, border: `1.5px solid ${C.suc}40`, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.suc }}>Transfer {nightCount} night{nightCount > 1 ? "s" : ""}</div>
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{dn(res.dogId, res.clientId)} · Currently in {res.room} · {dateLabel}</div>
              </div>
              <button onClick={() => setSelectedNights({})} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, fontSize: 16, padding: "2px 6px", fontFamily: "inherit" }}>×</button>
            </div>
            {availRoomsList.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Available rooms (no conflicts):</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {availRoomsList.map(({ room, type: rt }) => (
                    <button key={room} onClick={() => moveSelectedNights(resId, room)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.suc; e.currentTarget.style.background = C.sucLt; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}>
                      {room} <span style={{ fontSize: 9, color: C.textMut, marginLeft: 4 }}>{rt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.dan, fontWeight: 600 }}>No available rooms for these dates — all rooms have conflicts.</div>
            )}
          </div>
        );
      })()}

      {/* Week navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 16, position: "relative" }}>
        <button onClick={prevWeek} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontFamily: "inherit", padding: 0 }} title="Previous week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, textAlign: "center", padding: "4px 2px", whiteSpace: "nowrap" }}>{weekLabel}</span>
        <button onClick={nextWeek} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontFamily: "inherit", padding: 0 }} title="Next week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button onClick={() => setShowCalendar(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${showCalendar ? C.pri : C.border}`, background: showCalendar ? C.priLt : C.surface, cursor: "pointer", color: showCalendar ? C.pri : C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0, transition: "all 0.15s" }} title="Open calendar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        {!isCurrentWeek && (
          <button onClick={goToday} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Today</button>
        )}

        {/* Calendar Popup */}
        {showCalendar && (
          <div ref={calRef} style={{ position: "absolute", top: "100%", left: 28, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={calPrev} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
              <button onClick={calNext} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
              {calDays.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const m = String(calMonth + 1).padStart(2, "0");
                const d = String(day).padStart(2, "0");
                const dateStr = `${calYear}-${m}-${d}`;
                const isInWeek = dateStr >= weekStart && dateStr <= weekEnd;
                const isTodayCell = dateStr === td;
                const hasRes = data.reservations.some(r => r.type === "boarding" && r.status !== "checked-out" && r.checkIn <= dateStr && r.checkOut >= dateStr);
                return (
                  <button key={i} onClick={() => calSelect(day)}
                    style={{
                      width: 34, height: 34, borderRadius: 10, border: isInWeek ? `2px solid ${C.pri}` : isTodayCell ? `2px solid ${C.acc}` : "2px solid transparent",
                      background: isInWeek ? C.priLt : "transparent",
                      color: isInWeek ? C.pri : isTodayCell ? C.acc : C.text,
                      fontSize: 13, fontWeight: isInWeek || isTodayCell ? 700 : 500,
                      cursor: "pointer", fontFamily: "inherit", padding: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto",
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={e => { if (!isInWeek) e.currentTarget.style.background = C.surfaceHover; }}
                    onMouseLeave={e => { if (!isInWeek) e.currentTarget.style.background = "transparent"; }}
                  >
                    {day}
                    {hasRes && !isInWeek && <div style={{ width: 4, height: 4, borderRadius: 2, background: C.pri, marginTop: 1 }} />}
                  </button>
                );
              })}
            </div>
            {!isCurrentWeek && (
              <div style={{ textAlign: "center", marginTop: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}>
                <button onClick={() => { goToday(); setShowCalendar(false); }} style={{ fontSize: 12, fontWeight: 700, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Go to This Week</button>
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowOptimizeConfirm(true)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.acc}`, background: `${C.acc}18`, color: C.acc, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-4.9 3.6 1.9-5.8L4 8.8h6.1z"/></svg>
          Optimize
        </button>
        <button onClick={() => setShowOptGuide(v => !v)} style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${showOptGuide ? C.pri : C.border}`, background: showOptGuide ? C.priLt : "transparent", color: showOptGuide ? C.pri : C.textMut, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1 }} title="How drag & drop and optimization work">?</button>
        {activeTypes.length > 0 && (
          <button onClick={toggleAll} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points={allCollapsed ? "6 9 12 15 18 9" : "18 15 12 9 6 15"}/></svg>
            {allCollapsed ? "Expand All" : "Collapse All"}
          </button>
        )}
      </div>

      {/* Drag & Optimize guide */}
      {showOptGuide && (
        <div style={{ marginBottom: 12, padding: "16px 18px", borderRadius: 10, border: `1.5px solid ${C.priLt}`, background: `linear-gradient(135deg, ${C.priLt}40, ${C.surface})`, fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.pri, marginBottom: 8 }}>How Drag & Drop and Optimize Work</div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>Drag to Move & Shift Dates</div>
          <div style={{ paddingLeft: 12, marginBottom: 10 }}>
            <div>Grab the <span style={{ fontWeight: 700, color: C.text }}>body</span> of a reservation block and drag it <span style={{ fontWeight: 700, color: C.text }}>left or right</span> to shift the check-in and check-out dates. Drag it <span style={{ fontWeight: 700, color: C.text }}>up or down</span> to move it to a different room within the same room type.</div>
            <div style={{ marginTop: 4 }}>A <span style={{ fontWeight: 700, color: C.pri }}>dashed blue ghost</span> shows the projected position. If the target has a conflict, the move is silently rejected.</div>
            <div style={{ marginTop: 4 }}>Click a reservation normally (without dragging) to view the client's details.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>Edge Resize</div>
          <div style={{ paddingLeft: 12, marginBottom: 10 }}>
            <div>Hover over the <span style={{ fontWeight: 700, color: C.text }}>left or right edge</span> of a block — the cursor changes to a resize arrow. Drag the edge to <span style={{ fontWeight: 700, color: C.text }}>extend or shorten</span> the reservation. Left edge changes check-in, right edge changes check-out.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>Optimize Button</div>
          <div style={{ paddingLeft: 12, marginBottom: 10 }}>
            <div>The <span style={{ fontWeight: 700, color: C.acc }}>Optimize</span> button automatically rearranges reservations to <span style={{ fontWeight: 700, color: C.text }}>minimize room fragmentation</span> and free up as many rooms as possible for new bookings.</div>
            <div style={{ marginTop: 4 }}>It uses a <span style={{ fontWeight: 700, color: C.text }}>best-fit packing algorithm</span> per room type: reservations are sorted by check-in date and each one is assigned to the room whose last checkout is closest to (but not after) the check-in — packing them tightly together.</div>
            <div style={{ marginTop: 4 }}>Dogs <span style={{ fontWeight: 700, color: C.text }}>never move between room types</span> — a Luxury Suite dog stays in a Luxury Suite. Before applying changes, a confirmation dialog shows exactly how many reservations will be moved.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>When to use each</div>
          <div style={{ paddingLeft: 12, marginBottom: 4 }}>
            <div><span style={{ fontWeight: 700, color: C.pri }}>Drag & Drop</span> — Use when you need to move a specific dog for operational reasons (cleaning schedule, behavioral separation, client preference).</div>
            <div style={{ marginTop: 4 }}><span style={{ fontWeight: 700, color: C.acc }}>Optimize</span> — Use when you want to maximize availability across the board, especially before a busy weekend or holiday. Run it periodically to keep things tidy.</div>
          </div>
          <div style={{ fontSize: 11, color: C.textMut, fontStyle: "italic", marginTop: 6 }}>All changes are saved instantly. You can always manually drag reservations after optimizing to fine-tune the layout.</div>
        </div>
      )}

      {/* Calendar grid */}
      <Card style={{ padding: 0, overflow: "auto" }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `2px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10, background: C.bg }}>
          <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", borderRight: `1px solid ${C.border}` }}>Room</div>
          {weekDays.map(d => {
            const isToday = d === td;
            return (
              <div key={d} style={{ padding: "8px 0", textAlign: "center", borderRight: `1px solid ${C.borderLight}`, background: isToday ? C.priLt : "transparent" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? C.pri : C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{shortDay(d)}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? C.pri : C.text, lineHeight: 1.2 }}>{dayNum(d)}</div>
              </div>
            );
          })}
        </div>

        {/* Overall occupancy row — Overnight only (boarding, excludes dayboarding) */}
        {totalRoomCount > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `2px solid ${C.border}`, background: C.surface, minHeight: 36 }}>
            <div style={{ padding: "0 8px", display: "flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: C.text, borderRight: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.2 }}>Overnight</div>
            {dailyOccOvernight.map((booked, di) => {
              const pct = totalRoomCount > 0 ? Math.round((booked / totalRoomCount) * 100) : 0;
              return (
                <div key={di} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: `1px solid ${C.borderLight}`, background: weekDays[di] === td ? `${C.priLt}40` : "transparent" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{pct}%</span>
                  <span style={{ fontSize: 9, fontWeight: 500, color: C.textMut }}>{booked}/{totalRoomCount}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Room rows */}
        {roomRows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 14 }}>No rooms configured. Go to Settings → Rooms to add rooms.</div>
        ) : (
          roomRows.map((row, ri) => {
            if (row.type === "header") {
              const isCol = !!collapsed[row.roomType];
              const occ = dailyOccByType[row.roomType] || [];
              return (
                <React.Fragment key={`h-${row.roomType}`}>
                  {/* Clickable section header */}
                  <div onClick={() => toggleCollapse(row.roomType)} style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px 1fr`, borderBottom: `1px solid ${C.border}`, background: C.priLt, cursor: "pointer", userSelect: "none" }}>
                    <div style={{ gridColumn: "1 / -1", padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" style={{ transition: "transform 0.15s", transform: isCol ? "rotate(-90deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em" }}>{row.roomType}</span>
                      <span style={{ fontWeight: 500, color: C.textSec, fontSize: 12 }}>({row.count})</span>
                    </div>
                  </div>
                  {/* Collapsed summary row: per-day occupancy */}
                  {isCol && (
                    <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `1px solid ${C.border}`, minHeight: 36, background: C.surface }}>
                      <div style={{ padding: "0 12px", display: "flex", alignItems: "center", fontSize: 11, fontWeight: 600, color: C.textMut, borderRight: `1px solid ${C.border}` }}>Booked</div>
                      {occ.map((count, di) => {
                        const total = row.count;
                        return (
                          <div key={di} style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRight: `1px solid ${C.borderLight}`, background: weekDays[di] === td ? `${C.priLt}40` : "transparent" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{count}<span style={{ fontWeight: 500, color: C.textMut }}>/{total}</span></span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </React.Fragment>
              );
            }
            // Skip room rows if this type is collapsed
            if (collapsed[row.roomType]) return null;
            const roomReservations = resByRoom[row.room] || [];
            const isDropTarget = interaction && interaction.type === "move" && interaction.targetRoom === row.room && interaction.moved;
            // Find checkout happening today for this room
            const todayCheckout = roomReservations.find(r => r.checkOut === td && r.status !== "cancelled");
            return (
              <div key={`r-${row.room}`} data-room-row={row.room}
                style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `1px solid ${C.borderLight}`, minHeight: ROW_H, background: isDropTarget ? `${C.priLt}60` : "transparent", transition: "background 0.15s" }}>
                {/* Room label with checkout time */}
                <div style={{ padding: "0 12px", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.text, borderRight: `1px solid ${C.border}`, background: C.surface }}>
                  <span>{row.room}</span>
                  {todayCheckout && <span style={{ fontSize: 9, fontWeight: 600, color: C.acc, background: C.acc + "15", padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap" }} title={`${dn(todayCheckout.dogId)} checking out ${fmtTime(todayCheckout.checkOutTime)}`}>out {fmtTime(todayCheckout.checkOutTime)}</span>}
                </div>
                {/* 7 day cells with reservation overlays */}
                <div data-day-grid style={{ gridColumn: "2 / -1", position: "relative", display: "grid", gridTemplateColumns: `repeat(7, ${COL_W})`, minHeight: ROW_H }}>
                  {/* Background cells */}
                  {weekDays.map(d => (
                    <div key={d} style={{ borderRight: `1px solid ${C.borderLight}`, background: d === td ? `${C.priLt}40` : "transparent", minHeight: ROW_H }} />
                  ))}
                  {/* Reservation blocks */}
                  {roomReservations.map(res => {
                    const inter = interaction && interaction.resId === res.id && interaction.moved ? interaction : null;
                    const ciDate = res.checkIn < weekStart ? weekStart : res.checkIn;
                    const coDate = res.checkOut > weekEnd ? weekEnd : res.checkOut;
                    const startIdx = weekDays.indexOf(ciDate);
                    const endIdx = weekDays.indexOf(coDate);
                    if (startIdx < 0 || endIdx < 0) return null;
                    // Half-day positioning — dayboarding (same-day) gets wider bar so name is readable
                    const isSameDay = res.checkIn === res.checkOut;
                    const startOff = isSameDay ? 0.08 : (res.checkIn >= weekStart ? 0.5 : 0);
                    const endOff = isSameDay ? 0.92 : (res.checkOut <= weekEnd ? 0.5 : 1);
                    const leftPct = ((startIdx + startOff) / 7) * 100;
                    const widthPct = ((endIdx + endOff - startIdx - startOff) / 7) * 100;
                    const span = endIdx - startIdx + 1;
                    const showGreenEdge = res.checkIn >= weekStart;
                    const showRedEdge = res.checkOut <= weekEnd;
                    const isCheckedIn = res.status === "checked-in";
                    const isUpcoming = res.status === "upcoming";
                    const bg = isCheckedIn ? C.pri : isUpcoming ? C.priLt : C.bg;
                    const fg = isCheckedIn ? "#fff" : isUpcoming ? C.pri : C.textMut;

                    // Ghost preview: compute projected position during drag/resize
                    let ghostEl = null;
                    if (inter) {
                      let gCI, gCO;
                      if (inter.type === "move") { gCI = addDays(inter.origCI, inter.dayDelta); gCO = addDays(inter.origCO, inter.dayDelta); }
                      else if (inter.type === "resize-left") { gCI = addDays(inter.origCI, inter.dayDelta); gCO = inter.origCO; }
                      else { gCI = inter.origCI; gCO = addDays(inter.origCO, inter.dayDelta); }
                      if (gCI < gCO) {
                        const gCiV = gCI < weekStart ? weekStart : gCI;
                        const gCoV = gCO > weekEnd ? weekEnd : gCO;
                        const gSi = weekDays.indexOf(gCiV);
                        const gEi = weekDays.indexOf(gCoV);
                        if (gSi >= 0 && gEi >= 0) {
                          const gSOff = gCI >= weekStart ? 0.5 : 0;
                          const gEOff = gCO <= weekEnd ? 0.5 : 1;
                          const gLeft = ((gSi + gSOff) / 7) * 100;
                          const gWidth = ((gEi + gEOff - gSi - gSOff) / 7) * 100;
                          ghostEl = (
                            <div key={`ghost-${res.id}`} style={{
                              position: "absolute", top: 4, bottom: 4,
                              left: `calc(${gLeft}% + 2px)`, width: `calc(${gWidth}% - 4px)`,
                              background: `${C.pri}30`, borderRadius: 6, border: `2px dashed ${C.pri}`,
                              pointerEvents: "none", zIndex: 5,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: C.pri, opacity: 0.8 }}>{dn(res.dogId, res.clientId)}</span>
                            </div>
                          );
                        }
                      }
                    }

                    return (
                      <React.Fragment key={res.id}>
                        {/* Ghost preview (if dragging/resizing this block) */}
                        {inter && inter.type === "move" && inter.targetRoom !== row.room ? null : ghostEl}
                        {/* Actual block */}
                        <div
                          onMouseDown={(e) => {
                            if (nightSelectMode) {
                              // In night select mode, allow dragging if nights are selected
                              const hasSelected = selectedNights[res.id] && selectedNights[res.id].size > 0;
                              if (hasSelected && e.button === 0 && e.target.closest("[data-day-grid]")) {
                                // Drag selected nights to different room
                                e.preventDefault();
                                e.stopPropagation();
                                const colW = getColWidth();
                                const state = { type: "night-drag", resId: res.id, startX: e.clientX, startY: e.clientY, colW, origRoom: res.room, targetRoom: res.room, moved: false };
                                interRef.current = state;
                                setInteraction(state);
                                const onMove = (me) => {
                                  const s = interRef.current;
                                  if (!s) return;
                                  const dx = me.clientX - s.startX;
                                  const dy = me.clientY - s.startY;
                                  if (!s.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                                  s.moved = true;
                                  if (s.type === "night-drag") {
                                    const el = document.elementFromPoint(me.clientX, me.clientY);
                                    const rowEl = el && el.closest ? el.closest("[data-room-row]") : null;
                                    if (rowEl) {
                                      const tRoom = rowEl.dataset.roomRow;
                                      if (tRoom) s.targetRoom = tRoom;
                                    }
                                  }
                                  interRef.current = { ...s };
                                  setInteraction({ ...s });
                                };
                                const onUp = async () => {
                                  window.removeEventListener("mousemove", onMove);
                                  window.removeEventListener("mouseup", onUp);
                                  const s = interRef.current;
                                  interRef.current = null;
                                  setInteraction(null);
                                  if (!s || !s.moved) return;
                                  if (s.targetRoom === s.origRoom) return;
                                  await moveSelectedNights(res.id, s.targetRoom);
                                };
                                window.addEventListener("mousemove", onMove);
                                window.addEventListener("mouseup", onUp);
                              }
                              return;
                            }
                            if (e.button !== 0) return;
                            const edge = getEdge(e, e.currentTarget);
                            startInteraction(e, res, edge === "left" ? "resize-left" : edge === "right" ? "resize-right" : "move");
                          }}
                          onMouseMove={(e) => { if (nightSelectMode || interaction) return; const edge = getEdge(e, e.currentTarget); e.currentTarget.style.cursor = edge ? "col-resize" : "grab"; }}
                          onClick={() => { if (nightSelectMode) return; if (!justDraggedRef.current) setBoardingPreviewId(res.id); }}
                          title={nightSelectMode ? (selectedNights[res.id] && selectedNights[res.id].size > 0 ? "Drag selected nights to a different room" : "Click nights to select them for transfer") : `${dn(res.dogId, res.clientId)} · ${fmtDate(res.checkIn)} → ${fmtDate(res.checkOut)} · ${res.status} · Drag to shift dates or move rooms · Drag edges to resize`}
                          style={{
                            position: "absolute", top: 6, bottom: 6,
                            left: `calc(${leftPct}% + 3px)`, width: `calc(${widthPct}% - 6px)`,
                            background: bg, borderRadius: 6, cursor: nightSelectMode ? (selectedNights[res.id] && selectedNights[res.id].size > 0 ? "grab" : "pointer") : (inter ? "grabbing" : "grab"),
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                            overflow: "hidden", whiteSpace: "nowrap",
                            borderLeft: showGreenEdge ? `4px solid ${C.suc}` : "none",
                            borderRight: showRedEdge ? `4px solid ${C.dan}` : "none",
                            borderTop: `1px solid ${isCheckedIn ? "rgba(255,255,255,0.15)" : C.border}`,
                            borderBottom: `1px solid ${isCheckedIn ? "rgba(0,0,0,0.1)" : C.border}`,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                            transition: inter ? "none" : "opacity 0.15s",
                            zIndex: inter ? 10 : 2,
                            opacity: inter ? 0.35 : (interaction && interaction.resId !== res.id) ? 0.5 : 1,
                          }}
                          onMouseEnter={e => { if (!interaction && !nightSelectMode) e.currentTarget.style.opacity = "0.85"; }}
                          onMouseLeave={e => { if (!interaction && !nightSelectMode) e.currentTarget.style.opacity = "1"; }}
                        >
                          {/* Night dividers (always shown) + selection overlays (night select mode only) */}
                          {countNights(res.checkIn, res.checkOut) > 1 && (() => {
                            const resNights = [];
                            let nd = res.checkIn < weekStart ? weekStart : res.checkIn;
                            const resEnd = res.checkOut > addDays(weekEnd, 1) ? addDays(weekEnd, 1) : res.checkOut;
                            while (nd < resEnd) { resNights.push(nd); nd = addDays(nd, 1); }
                            const totalW = (endIdx + endOff - startIdx - startOff);
                            const selSet = selectedNights[res.id] || new Set();
                            return resNights.map((nightDate, ni) => {
                              const nightIdx = weekDays.indexOf(nightDate);
                              if (nightIdx < 0) return null;
                              const nightStartOff = nightDate === res.checkIn ? startOff : 0;
                              const nightEndDate = addDays(nightDate, 1);
                              const nightEndOff = nightEndDate >= res.checkOut ? endOff : (nightEndDate > weekEnd ? 1 : 0);
                              const nightEndIdx = weekDays.indexOf(nightEndDate < weekStart ? weekStart : (nightEndDate > weekEnd ? weekEnd : nightEndDate));
                              const nLeft = ((nightIdx + nightStartOff - startIdx - startOff) / totalW) * 100;
                              const effEnd = nightEndIdx >= 0 ? nightEndIdx : 7;
                              const nWidth = ((effEnd + nightEndOff - nightIdx - nightStartOff) / totalW) * 100;
                              const isSel = selSet.has(nightDate);
                              return (
                                <div key={nightDate}
                                  onClick={nightSelectMode ? (e) => { e.stopPropagation(); toggleNightSelect(res.id, nightDate); } : undefined}
                                  style={{ position: "absolute", top: 0, bottom: 0, left: `${nLeft}%`, width: `${nWidth}%`, borderRight: ni < resNights.length - 1 ? `1px dashed ${nightSelectMode ? "rgba(128,128,128,0.35)" : "rgba(128,128,128,0.15)"}` : "none", background: isSel ? `${C.suc}40` : "transparent", cursor: nightSelectMode ? "pointer" : "inherit", display: "flex", alignItems: "center", justifyContent: "center", zIndex: nightSelectMode ? 3 : 1, transition: "background 0.1s, border 0.1s", pointerEvents: nightSelectMode ? "auto" : "none" }}
                                  onMouseEnter={nightSelectMode ? (e => { if (!isSel) e.currentTarget.style.background = `${C.acc}20`; }) : undefined}
                                  onMouseLeave={nightSelectMode ? (e => { if (!isSel) e.currentTarget.style.background = "transparent"; }) : undefined}>
                                  {nightSelectMode && (
                                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSel ? C.suc : "rgba(132,204,22,0.5)"}`, background: isSel ? C.suc : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                                      {isSel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                    </div>
                                  )}
                                </div>
                              );
                            });
                          })()}
                          {!nightSelectMode && (res.noDeposit || unpaidDepositIds.has(res.id)) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isCheckedIn ? "#fca5a5" : C.dan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} title="No deposit collected"><line x1="12" y1="1" x2="12" y2="17"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/><line x1="4" y1="1" x2="20" y2="23" stroke={isCheckedIn ? "#fca5a5" : C.dan} strokeWidth="2"/></svg>}
                          <span style={{ fontSize: 11, fontWeight: 700, color: fg, overflow: "hidden", textOverflow: "ellipsis", padding: "0 4px", pointerEvents: "none", zIndex: 1 }}>
                            {dn(res.dogId, res.clientId)}
                          </span>
                          {!nightSelectMode && showGreenEdge && span > 1 && <span style={{ fontSize: 9, color: isCheckedIn ? "rgba(255,255,255,0.6)" : C.textMut, flexShrink: 0 }}>in {fmtTime(res.checkInTime)}{res.actualCheckInTime ? ` (${new Date(res.actualCheckInTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})})` : ""}</span>}
                          {!nightSelectMode && showRedEdge && span > 2 && <span style={{ fontSize: 9, color: isCheckedIn ? "rgba(255,255,255,0.6)" : C.textMut, flexShrink: 0 }}>out {fmtTime(res.checkOutTime)}{res.actualCheckOutTime ? ` (${new Date(res.actualCheckOutTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})})` : ""}</span>}
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {/* Ghost block for move-to-different-room: render in target room */}
                  {interaction && interaction.moved && interaction.type === "move" && interaction.targetRoom === row.room && interaction.targetRoom !== interaction.origRoom && (() => {
                    const s = interaction;
                    const gCI = addDays(s.origCI, s.dayDelta);
                    const gCO = addDays(s.origCO, s.dayDelta);
                    if (gCI >= gCO) return null;
                    const gCiV = gCI < weekStart ? weekStart : gCI;
                    const gCoV = gCO > weekEnd ? weekEnd : gCO;
                    const gSi = weekDays.indexOf(gCiV);
                    const gEi = weekDays.indexOf(gCoV);
                    if (gSi < 0 || gEi < 0) return null;
                    const gSOff = gCI >= weekStart ? 0.5 : 0;
                    const gEOff = gCO <= weekEnd ? 0.5 : 1;
                    const gLeft = ((gSi + gSOff) / 7) * 100;
                    const gWidth = ((gEi + gEOff - gSi - gSOff) / 7) * 100;
                    return (
                      <div style={{
                        position: "absolute", top: 4, bottom: 4,
                        left: `calc(${gLeft}% + 2px)`, width: `calc(${gWidth}% - 4px)`,
                        background: `${C.pri}30`, borderRadius: 6, border: `2px dashed ${C.pri}`,
                        pointerEvents: "none", zIndex: 5,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.pri, opacity: 0.8 }}>{dn(s.origRes.dogId, s.origRes.clientId)}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* Optimize confirmation modal */}
      {showOptimizeConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowOptimizeConfirm(false)}>
          <Card style={{ maxWidth: 420, width: "90%", padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.acc}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-4.9 3.6 1.9-5.8L4 8.8h6.1z"/></svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Optimize Room Assignments</h3>
            </div>
            <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, margin: "0 0 8px" }}>
              Rearranges reservations within each room type to minimize fragmentation and maximize available rooms. Dogs never move between room types.
            </p>
            <div style={{ padding: "12px 16px", borderRadius: 10, background: optimizeMoveCount > 0 ? `${C.pri}10` : `${C.suc}10`, border: `1px solid ${optimizeMoveCount > 0 ? `${C.pri}30` : `${C.suc}30`}`, marginBottom: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: optimizeMoveCount > 0 ? C.pri : C.suc }}>
                {optimizeMoveCount > 0 ? `${optimizeMoveCount} reservation${optimizeMoveCount > 1 ? "s" : ""} will be moved` : "Already optimized! No moves needed."}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowOptimizeConfirm(false)} style={{ padding: "8px 20px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              {optimizeMoveCount > 0 && (
                <button onClick={async () => { await runOptimize(); setShowOptimizeConfirm(false); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.acc, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Optimize</button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              pointerEvents: "auto",
              background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)",
              border: `1.5px solid ${C.border}`, borderRadius: 12,
              padding: "12px 16px", maxWidth: 380, minWidth: 260,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              display: "flex", alignItems: "center", gap: 12, fontSize: 13,
              animation: "k9toast 0.3s ease-out",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>
                  {t.dogName}<span style={{ fontWeight: 500, color: C.textSec }}>&rsquo;s reservation {t.action}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textMut }}>
                  <span style={{ textDecoration: "line-through", color: C.dan }}>{t.oldVal}</span>
                  <span style={{ margin: "0 5px", color: C.textMut }}>&rarr;</span>
                  <span style={{ fontWeight: 600, color: C.suc }}>{t.newVal}</span>
                </div>
              </div>
              <button onClick={() => handleUndo(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Undo</button>
              <button onClick={() => dismissToast(t.id)} style={{ width: 22, height: 22, borderRadius: 11, border: "none", background: "transparent", cursor: "pointer", color: C.textMut, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit" }}>&times;</button>
            </div>
          ))}
        </div>
      )}

      {boardingPreviewId && (() => {
        const bRes = data.reservations.find(r => r.id === boardingPreviewId);
        const bDog = bRes ? data.dogs.find(d => d.id === bRes.dogId) : null;
        const bClient = bRes ? data.clients.find(c => c.id === bRes.clientId) : null;
        if (!bRes || !bDog || !bClient) return null;
        return <BoardingPreviewModal
          reservation={bRes} dog={bDog} client={bClient}
          isCheckInMode={bRes.status === "upcoming"}
          isCheckOutMode={bRes.status === "checked-in"}
          onClose={() => setBoardingPreviewId(null)}
          onSave={async (updatedRes, doCheckIn, doCheckOut) => {
            const merged = { ...bRes, ...updatedRes };
            if (doCheckIn) { merged.status = "checked-in"; merged.actualCheckInTime = new Date().toISOString(); merged.checkedInBy = profile ? (profile.full_name || profile.email || "Staff") : "Staff"; }
            if (doCheckOut) { merged.status = "checked-out"; merged.actualCheckOutTime = new Date().toISOString(); merged.checkedOutBy = profile ? (profile.full_name || profile.email || "Staff") : "Staff"; }
            if (updatedRes.discountType && updatedRes.discountValue) {
              merged.discountType = updatedRes.discountType;
              merged.discountValue = updatedRes.discountValue;
            }
            // Build audit log entries
            const auditLogs = [];
            const diffs = [];
            const fmtNow = new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
            if (doCheckIn) auditLogs.push(buildAuditEntry(bRes.id, "Checked In", [{field:"Status",oldVal:"Upcoming",newVal:"Checked In"},{field:"Actual Check-In",oldVal:"—",newVal:fmtNow},{field:"Checked In By",oldVal:"—",newVal:profile?(profile.full_name||profile.email||"Staff"):"Staff"}], profile));
            if (doCheckOut) auditLogs.push(buildAuditEntry(bRes.id, "Checked Out", [{field:"Status",oldVal:"Checked In",newVal:"Checked Out"},{field:"Actual Check-Out",oldVal:"—",newVal:fmtNow},{field:"Checked Out By",oldVal:"—",newVal:profile?(profile.full_name||profile.email||"Staff"):"Staff"}], profile));
            if (!doCheckIn && !doCheckOut) {
              // Detect what changed
              if (updatedRes.parentDestination !== bRes.parentDestination) diffs.push({field:"Parent Destination",oldVal:bRes.parentDestination||"(empty)",newVal:updatedRes.parentDestination||"(empty)"});
              if (updatedRes.belongings !== bRes.belongings) diffs.push({field:"Belongings",oldVal:bRes.belongings||"(empty)",newVal:updatedRes.belongings||"(empty)"});
              if (updatedRes.checkIn !== bRes.checkIn) diffs.push({field:"Check-In Date",oldVal:bRes.checkIn,newVal:updatedRes.checkIn});
              if (updatedRes.checkOut !== bRes.checkOut) diffs.push({field:"Check-Out Date",oldVal:bRes.checkOut,newVal:updatedRes.checkOut});
              if (updatedRes.checkInTime !== bRes.checkInTime) diffs.push({field:"Check-In Time",oldVal:bRes.checkInTime,newVal:updatedRes.checkInTime});
              if (updatedRes.checkOutTime !== bRes.checkOutTime) diffs.push({field:"Check-Out Time",oldVal:bRes.checkOutTime,newVal:updatedRes.checkOutTime});
              if (updatedRes.notes !== bRes.notes) diffs.push({field:"Notes",oldVal:bRes.notes||"(empty)",newVal:updatedRes.notes||"(empty)"});
              if (updatedRes.discountType !== bRes.discountType || updatedRes.discountValue !== bRes.discountValue) diffs.push({field:"Discount",oldVal:bRes.discountType&&bRes.discountValue?`${bRes.discountType} ${bRes.discountValue}`:"None",newVal:updatedRes.discountType&&updatedRes.discountValue?`${updatedRes.discountType} ${updatedRes.discountValue}`:"None"});
              // Care override changes
              const oldCare = bRes.careOverrides || {}; const newCare = updatedRes.careOverrides || {};
              if ((newCare.bath_type||"") !== (oldCare.bath_type||"")) diffs.push({field:"Bath Type",oldVal:oldCare.bath_type||"(none)",newVal:newCare.bath_type||"(none)"});
              if ((newCare.feeding||"") !== (oldCare.feeding||"")) diffs.push({field:"Feeding Instructions",oldVal:oldCare.feeding||"(none)",newVal:newCare.feeding||"(none)"});
              if ((newCare.medications||"") !== (oldCare.medications||"")) diffs.push({field:"Medications",oldVal:oldCare.medications||"(none)",newVal:newCare.medications||"(none)"});
              if (JSON.stringify(newCare.feedingSchedules||[]) !== JSON.stringify(oldCare.feedingSchedules||[]) && (newCare.feeding||"") === (oldCare.feeding||"")) diffs.push({field:"Feeding Schedules",oldVal:"(modified)",newVal:"(updated)"});
              if (JSON.stringify(newCare.medicationSchedules||[]) !== JSON.stringify(oldCare.medicationSchedules||[]) && (newCare.medications||"") === (oldCare.medications||"")) diffs.push({field:"Medication Schedules",oldVal:"(modified)",newVal:"(updated)"});
              if ((newCare.postBathReturn||"") !== (oldCare.postBathReturn||"")) diffs.push({field:"Post-Bath Return",oldVal:oldCare.postBathReturn||"(none)",newVal:newCare.postBathReturn||"(none)"});
              // Emergency contact override changes
              const oldEc = bRes.emergencyContactOverride || {}; const newEc = updatedRes.emergencyContactOverride || {};
              if ((newEc.name||"") !== (oldEc.name||"")) diffs.push({field:"Emergency Contact",oldVal:oldEc.name||"(profile default)",newVal:newEc.name||"(profile default)"});
              if ((newEc.phone||"") !== (oldEc.phone||"")) diffs.push({field:"Emergency Phone",oldVal:oldEc.phone||"(profile default)",newVal:newEc.phone||"(profile default)"});
              // Fed/Meds today
              if ((updatedRes.fedToday||"") !== (bRes.fedToday||"")) diffs.push({field:"Fed Today",oldVal:bRes.fedToday||"(empty)",newVal:updatedRes.fedToday||"(empty)"});
              if ((updatedRes.medsToday||"") !== (bRes.medsToday||"")) diffs.push({field:"Meds Today",oldVal:bRes.medsToday||"(empty)",newVal:updatedRes.medsToday||"(empty)"});
              if (diffs.length > 0) auditLogs.push(buildAuditEntry(bRes.id, "Updated Reservation", diffs, profile));
            }
            // Also log check-in/out detail changes
            if (doCheckIn) {
              const ciDiffs = [];
              if (updatedRes.parentDestination && updatedRes.parentDestination !== bRes.parentDestination) ciDiffs.push({field:"Parent Destination",oldVal:bRes.parentDestination||"(empty)",newVal:updatedRes.parentDestination});
              if (updatedRes.belongings && updatedRes.belongings !== bRes.belongings) ciDiffs.push({field:"Belongings",oldVal:bRes.belongings||"(empty)",newVal:updatedRes.belongings});
              // Date/time adjustments at check-in (e.g. early check-in date adjustment)
              if (updatedRes.checkIn !== bRes.checkIn) ciDiffs.push({field:"Check-In Date",oldVal:bRes.checkIn,newVal:updatedRes.checkIn});
              if (updatedRes.checkOut !== bRes.checkOut) ciDiffs.push({field:"Check-Out Date",oldVal:bRes.checkOut,newVal:updatedRes.checkOut});
              if (updatedRes.checkInTime !== bRes.checkInTime) ciDiffs.push({field:"Check-In Time",oldVal:bRes.checkInTime,newVal:updatedRes.checkInTime});
              if (updatedRes.checkOutTime !== bRes.checkOutTime) ciDiffs.push({field:"Check-Out Time",oldVal:bRes.checkOutTime,newVal:updatedRes.checkOutTime});
              if (updatedRes.notes !== bRes.notes) ciDiffs.push({field:"Notes",oldVal:bRes.notes||"(empty)",newVal:updatedRes.notes||"(empty)"});
              // Care details provided at check-in
              const ciOldCare = bRes.careOverrides || {}; const ciNewCare = updatedRes.careOverrides || {};
              if ((ciNewCare.bath_type||"") !== (ciOldCare.bath_type||"")) ciDiffs.push({field:"Bath Type",oldVal:ciOldCare.bath_type||"(none)",newVal:ciNewCare.bath_type||"(none)"});
              if ((ciNewCare.feeding||"") !== (ciOldCare.feeding||"")) ciDiffs.push({field:"Feeding Instructions",oldVal:ciOldCare.feeding||"(none)",newVal:ciNewCare.feeding||"(none)"});
              if ((ciNewCare.medications||"") !== (ciOldCare.medications||"")) ciDiffs.push({field:"Medications",oldVal:ciOldCare.medications||"(none)",newVal:ciNewCare.medications||"(none)"});
              if ((ciNewCare.postBathReturn||"") !== (ciOldCare.postBathReturn||"")) ciDiffs.push({field:"Post-Bath Return",oldVal:ciOldCare.postBathReturn||"(none)",newVal:ciNewCare.postBathReturn||"(none)"});
              const ciOldEc = bRes.emergencyContactOverride || {}; const ciNewEc = updatedRes.emergencyContactOverride || {};
              if ((ciNewEc.name||"") !== (ciOldEc.name||"")) ciDiffs.push({field:"Emergency Contact",oldVal:ciOldEc.name||"(profile default)",newVal:ciNewEc.name});
              if ((ciNewEc.phone||"") !== (ciOldEc.phone||"")) ciDiffs.push({field:"Emergency Phone",oldVal:ciOldEc.phone||"(profile default)",newVal:ciNewEc.phone});
              if ((updatedRes.fedToday||"") !== (bRes.fedToday||"")) ciDiffs.push({field:"Fed Today",oldVal:bRes.fedToday||"(empty)",newVal:updatedRes.fedToday});
              if ((updatedRes.medsToday||"") !== (bRes.medsToday||"")) ciDiffs.push({field:"Meds Today",oldVal:bRes.medsToday||"(empty)",newVal:updatedRes.medsToday});
              if (ciDiffs.length > 0) auditLogs.push(buildAuditEntry(bRes.id, "Filled Check-In Details", ciDiffs, profile));
            }
            if (doCheckOut) {
              const coDiffs = [];
              if (updatedRes.checkIn !== bRes.checkIn) coDiffs.push({field:"Check-In Date",oldVal:bRes.checkIn,newVal:updatedRes.checkIn});
              if (updatedRes.checkOut !== bRes.checkOut) coDiffs.push({field:"Check-Out Date",oldVal:bRes.checkOut,newVal:updatedRes.checkOut});
              if (updatedRes.checkInTime !== bRes.checkInTime) coDiffs.push({field:"Check-In Time",oldVal:bRes.checkInTime,newVal:updatedRes.checkInTime});
              if (updatedRes.checkOutTime !== bRes.checkOutTime) coDiffs.push({field:"Check-Out Time",oldVal:bRes.checkOutTime,newVal:updatedRes.checkOutTime});
              if (coDiffs.length > 0) auditLogs.push(buildAuditEntry(bRes.id, "Adjusted Dates at Check-Out", coDiffs, profile));
            }
            // Deduct coupons from package sales if applied
            let updatedPackageSales = [...(data.packageSales || [])];
            if (updatedRes.appliedCoupons && updatedRes.appliedCoupons.length > 0) {
              updatedRes.appliedCoupons.forEach(ac => {
                updatedPackageSales = updatedPackageSales.map(s => s.id === ac.saleId ? { ...s, used: (s.used || 0) + ac.unitsUsed, unitsRemaining: Math.max(0, (s.unitsRemaining || s.quantity || 0) - ac.unitsUsed) } : s);
              });
            }
            const newAuditLog = [...(data.auditLog || []), ...auditLogs];
            await save({ ...data, auditLog: newAuditLog, packageSales: updatedPackageSales, reservations: data.reservations.map(r => r.id === bRes.id ? merged : r) });
            if (!doCheckIn && !doCheckOut && diffs.length > 0 && bClient) {
              showTextNotifyToast(bClient, bDog, diffs);
            }
            setBoardingPreviewId(null);
          }}
          data={data} save={save} profile={profile} nav={nav}
        />;
      })()}

      {/* Text notification toast */}
      {textNotify && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 99999, pointerEvents: "auto", background: "rgba(255,255,255,0.98)", backdropFilter: "blur(8px)", border: `2px solid ${C.pri}`, borderRadius: 14, padding: "14px 18px", maxWidth: 420, minWidth: 300, boxShadow: "0 6px 24px rgba(0,0,0,0.18)", animation: "k9toast 0.3s ease-out" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Text {textNotify.clientName} about changes?</span>
          </div>
          <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8 }}>
            {textNotify.diffs.map((d, i) => <div key={i}><span style={{ fontWeight: 600 }}>{d.field}:</span> <span style={{ textDecoration: "line-through", color: C.dan }}>{d.oldVal}</span> → <span style={{ color: C.suc, fontWeight: 600 }}>{d.newVal}</span></div>)}
          </div>
          {!textNotify.showPreview ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setTextNotify(prev => ({ ...prev, showPreview: true }))} style={{ flex: 1, padding: "7px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Preview</button>
              <button onClick={() => setTextNotify(null)} style={{ padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>No</button>
            </div>
          ) : (
            <div>
              <textarea value={textNotify.message} onChange={e => setTextNotify(prev => ({ ...prev, message: e.target.value }))} rows={5} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", color: C.text, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={sendTextNotify} disabled={textNotify.sending} style={{ flex: 1, padding: "7px 14px", borderRadius: 8, border: "none", background: C.suc, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{textNotify.sending ? "Sending..." : "Send Text"}</button>
                <button onClick={() => setTextNotify(null)} style={{ padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
              {!textNotify.clientPhone && <div style={{ fontSize: 10, color: C.acc, marginTop: 4 }}>No phone number on file — message will be saved to Messages only.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { LodgingCalendarPage };

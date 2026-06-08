import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { AgreementIcons } from "../components/AgreementIcons";
import { Badge, Btn, Card, Hl, MiniDatePicker, Modal, Tip } from "../components/ui";
import { BoardingPreviewModal } from "../components/BoardingPreviewModal";
import { C } from "../constants/colors";
import { DEF_AGREEMENTS, ROOM_TYPES } from "../constants/forms";
import { DEF_PRICING } from "../constants/pricing";
import { DogPicHover } from "../components/DogPicHover";
import { DogTagChips } from "../components/DogTagChips";
import { I } from "../icons";
import { SellPackageModal } from "../components/SellPackageModal";
import { VACCINES } from "../constants/vaccines";
import { VaxIcon, buildAuditEntry } from "../components/widgets";
import { agrSigned } from "../lib/agreements";
import { calcAge, fixedLabel, getDogAgeCompliance, getDogDaycareSize, getSpayNeuterCompliance } from "../lib/dogHelpers";
import { calcReservationPricing, getAddOnPrices } from "../lib/pricing";
import { fmtDate, fmtInstr, fmtPhone, fmtTime, gid, todayStr } from "../lib/format";
import { getVaxStatus } from "../lib/vaccines";
import { hasCompletedEval } from "../lib/evaluation";

function DashboardPage({ data, save, nav, onNew, profile }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  // Time Travel: sync dashboard to simulated date when it changes
  const prevTdRef = useRef(td);
  useEffect(() => { if (td !== prevTdRef.current) { setViewDate(td); prevTdRef.current = td; } }, [td]);
  const [activeTab, setActiveTab] = useState("expected");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSummaryDetail, setShowSummaryDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [addOnsView, setAddOnsView] = useState(false);
  const [typeFilters, setTypeFilters] = useState(new Set());
  const toggleTypeFilter = (type) => { setAddOnsView(false); setTypeFilters(prev => {
    const next = new Set(prev);
    if (next.has(type)) next.delete(type); else next.add(type);
    return next;
  }); };
  const typeFilterActive = typeFilters.size > 0;
  const typeMatch = (r) => !typeFilterActive || typeFilters.has(r.type);

  // Activities tab state
  const [actSearch, setActSearch] = useState("");
  const [actTypeFilter, setActTypeFilter] = useState(new Set());
  const toggleActType = (t) => setActTypeFilter(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const [actTimeFilter, setActTimeFilter] = useState(""); // "", "am", "noon", "pm"
  const [bulkTime, setBulkTime] = useState("all");
  const [bulkType, setBulkType] = useState("all");
  const [bulkAnimating, setBulkAnimating] = useState(false);
  const [bulkAnimatedIds, setBulkAnimatedIds] = useState(new Set());
  const [showSellPkg, setShowSellPkg] = useState(false);

  const shiftDate = (days) => {
    const d = new Date(viewDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    setViewDate(d.toISOString().split("T")[0]);
  };
  const isToday = viewDate === td;
  const viewDateObj = new Date(viewDate + "T12:00:00");
  const viewDateLabel = viewDateObj.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});

  const cn = (cid) => { const c=data.clients.find(x=>x.id===cid); return c?`${c.fields.first_name||""} ${c.fields.last_name||""}`.trim():"Unknown"; };
  const dn = (did) => { const d=data.dogs.find(x=>x.id===did); return d?d.fields.name||"Unknown":"Unknown"; };
  const db = (did) => { const d=data.dogs.find(x=>x.id===did); return d?d.fields.breed||"":""; };
  const getDog = (did) => data.dogs.find(x=>x.id===did);

  // Reservations for viewed date (any status, touching that date)
  const vd = viewDate;
  const todayAll = data.reservations.filter(r => r.status !== "cancelled" && (r.checkIn === vd || r.checkOut === vd || (r.checkIn <= vd && r.checkOut >= vd)));

  const expected = data.reservations.filter(r=>r.checkIn===vd&&r.status==="upcoming");
  const inHouse = data.reservations.filter(r=>r.status==="checked-in"&&r.checkIn<=vd&&r.checkOut>=vd);
  const goingHome = data.reservations.filter(r=>r.status==="checked-in"&&r.checkOut===vd);
  const checkedOut = data.reservations.filter(r=>r.status==="checked-out"&&r.checkOut===vd);

  // ═══ Add-Ons Summary (for in-house dogs) ═══
  const addOnsSummary = useMemo(() => {
    const counts = {};
    const details = {};
    for (const res of inHouse) {
      const dog = data.dogs.find(d => d.id === res.dogId);
      const client = data.clients.find(c => c.id === res.clientId);
      const dogName = dog?.fields?.name || "Unknown";
      const clientName = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown";
      for (const addon of (res.addOns || [])) {
        counts[addon] = (counts[addon] || 0) + 1;
        if (!details[addon]) details[addon] = [];
        details[addon].push({ resId: res.id, dogName, clientName, clientId: res.clientId, dogId: res.dogId });
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, dogs: details[name] }))
      .sort((a, b) => b.count - a.count);
  }, [inHouse, data.dogs, data.clients]);

  // ═══ Auto-cancel expired reservations (check-in date passed without check-in) ═══
  useEffect(() => {
    const today = todayStr();
    const expired = data.reservations.filter(r => r.status === "upcoming" && r.checkIn < today);
    if (expired.length === 0) return;
    const auditEntries = expired.map(r => buildAuditEntry(r.id, "Auto-Cancelled", [{field:"Status",oldVal:"Upcoming",newVal:"Cancelled"},{field:"Reason",oldVal:"—",newVal:"Check-in date lapsed without check-in"}], null));
    save({
      ...data,
      auditLog: [...(data.auditLog || []), ...auditEntries],
      reservations: data.reservations.map(r => {
        if (r.status === "upcoming" && r.checkIn < today) {
          return { ...r, status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: "System (Auto)", cancelReason: "Check-in date lapsed" };
        }
        return r;
      })
    });
  }, []);

  // ═══ Activities Hub — aggregate all feeding/meds/baths for in-house dogs today ═══
  const actStaffName = profile ? (profile.full_name || profile.email || "Staff") : "Staff";
  const parseTimeSort = (t) => {
    const tl = (t || "").toLowerCase().trim();
    if (tl === "am" || tl === "morning") return 6;
    if (tl === "noon" || tl === "midday" || tl === "lunch") return 12;
    if (tl === "pm" || tl === "afternoon") return 15;
    if (tl === "evening" || tl === "dinner") return 18;
    if (tl === "end of day") return 20;
    if (tl === "any" || tl === "as needed") return 12;
    const m = tl.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (m) { let h = parseInt(m[1]); const min = parseInt(m[2] || "0"); const ap = (m[3] || "").toLowerCase(); if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0; return h + min / 60; }
    return 12;
  };
  const fmtTimeLabel = (t) => {
    const tl = (t || "").trim();
    if (!tl) return "—";
    const m = tl.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { let h = parseInt(m[1]); const min = m[2]; const ap = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12; return `${h}:${min} ${ap}`; }
    return tl;
  };
  const fmtTimeTwoLine = (t) => {
    const tl = (t || "").trim();
    if (!tl) return { label: "—", sub: "" };
    // Handle format like "AM (6:00 am)" or "Noon (12:00 pm)" or "PM (6:00 pm)"
    const paren = tl.match(/^([A-Za-z]+)\s*\(([^)]+)\)/);
    if (paren) return { label: paren[1].toUpperCase(), sub: paren[2].trim() };
    // Handle raw HH:MM (24h)
    const m = tl.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { let h = parseInt(m[1]); const min = m[2]; const ap = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12; return { label: ap, sub: `${h}:${min} ${ap.toLowerCase()}` }; }
    // Fallback: treat entire string as label (e.g., "End of Day", "Any")
    return { label: tl, sub: "" };
  };

  const allActivities = useMemo(() => {
    const today = todayStr();
    const ihRes = data.reservations.filter(r => r.status === "checked-in" && r.checkIn <= vd && r.checkOut >= vd);
    const rows = [];
    ihRes.forEach(res => {
      const dog = data.dogs.find(d => d.id === res.dogId);
      const client = data.clients.find(c => c.id === res.clientId);
      if (!dog) return;
      const feedSch = (res.careOverrides?.feedingSchedules?.length ? res.careOverrides.feedingSchedules : null) || dog.fields.feedingSchedules || [];
      const medSch = (res.careOverrides?.medicationSchedules?.length ? res.careOverrides.medicationSchedules : null) || dog.fields.medicationSchedules || [];
      const bath = res.careOverrides?.bath_type || dog.fields.bath_type || "";
      const log = res.activityLog || {};

      const base = { reservationId: res.id, dogId: res.dogId, clientId: res.clientId, dog, client, room: res.room || "", checkOut: res.checkOut || "", checkOutTime: res.checkOutTime || "" };

      feedSch.forEach(s => {
        (s.times || []).forEach(time => {
          const colKey = `feeding_${time.replace(/\s+/g, "_")}`;
          rows.push({ ...base, id: `${res.id}_${colKey}`, type: "feeding", colKey, time, label: `Feeding – ${time}`, qty: [s.amount, s.unit].filter(Boolean).join(" "), foodType: s.foodType || "", detail: [s.amount, s.unit, s.foodType].filter(Boolean).join(" "), instruction: fmtInstr(s.instruction), notes: s.notes || "", logEntry: log[`${today}|${colKey}`] || {} });
        });
      });

      medSch.forEach(s => {
        // Support both new `times` array and legacy `time` string
        const medTimes = (s.times && s.times.length > 0) ? s.times : (s.time ? [s.time] : ["Any"]);
        medTimes.forEach(time => {
          const colKey = `med_${(s.name || "").replace(/\s+/g, "_")}_${time.replace(/\s+/g, "_")}`;
          rows.push({ ...base, id: `${res.id}_${colKey}`, type: "medication", colKey, time, label: s.name || "Medication", qty: [s.amount, s.unit].filter(Boolean).join(" "), foodType: "", detail: [s.amount, s.unit].filter(Boolean).join(" "), instruction: fmtInstr(s.instruction) || s.notes || "", notes: s.notes || "", logEntry: log[`${today}|${colKey}`] || {} });
        });
      });

      if (bath && res.checkOut === today) {
        const colKey = "bathing";
        const postBathRet = res.careOverrides?.postBathReturn || "";
        rows.push({ ...base, id: `${res.id}_${colKey}`, type: "bathing", colKey, time: "End of Day", label: "Bath", detail: bath, instruction: postBathRet ? `After bath: ${postBathRet}` : "", notes: "", postBathReturn: postBathRet, logEntry: log[`${today}|${colKey}`] || {} });
      }
    });
    rows.sort((a, b) => parseTimeSort(a.time) - parseTimeSort(b.time));
    return rows;
  }, [data.reservations, data.dogs, data.clients, vd]);

  const filteredActivities = useMemo(() => {
    let rows = allActivities;
    if (actTypeFilter.size > 0) rows = rows.filter(r => actTypeFilter.has(r.type));
    if (actTimeFilter) {
      rows = rows.filter(r => {
        const s = parseTimeSort(r.time);
        if (actTimeFilter === "am") return s < 11;
        if (actTimeFilter === "noon") return s >= 11 && s < 14;
        if (actTimeFilter === "pm") return s >= 14;
        return true;
      });
    }
    if (actSearch.trim()) {
      const q = actSearch.toLowerCase();
      rows = rows.filter(r => {
        const dName = (r.dog?.fields.name || "").toLowerCase();
        const cName = `${r.client?.fields.first_name || ""} ${r.client?.fields.last_name || ""}`.toLowerCase();
        return dName.includes(q) || cName.includes(q) || (r.room || "").toLowerCase().includes(q);
      });
    }
    return rows;
  }, [allActivities, actTypeFilter, actTimeFilter, actSearch]);

  // Bulk action helpers (lifted to Dashboard level for access from filter bar)
  const pendingActivities = filteredActivities.filter(r => !r.logEntry?.administered);
  const executeBulkMark = async () => {
    if (pendingActivities.length === 0 || bulkAnimating) return;
    setBulkAnimating(true);
    setBulkAnimatedIds(new Set());
    const today = todayStr();
    const actStaffName = profile?.full_name || "Staff";
    // Stagger saves row-by-row so checkboxes check off in sync with the highlight
    const snapshot = [...pendingActivities];
    let runningReservations = [...data.reservations];
    const bulkAuditEntries = [];
    for (let i = 0; i < snapshot.length; i++) {
      const row = snapshot[i];
      const logKey = `${today}|${row.colKey}`;
      const logData = { administered: true, by: actStaffName, at: new Date().toISOString() };
      if (row.type === "feeding") logData.consumption = "100%";
      bulkAuditEntries.push(buildAuditEntry(row.reservationId, "Updated Activity", [{field:`Activity: ${row.colKey.replace(/_/g," ")}`, oldVal:"—", newVal:"Done"}], profile));
      // Update the accumulator with this single row
      runningReservations = runningReservations.map(r => r.id === row.reservationId ? { ...r, activityLog: { ...(r.activityLog || {}), [logKey]: { ...(r.activityLog || {})[logKey], ...logData } } } : r);
      // Save triggers re-render → this row's checkbox checks off
      save({ ...data, auditLog: [...(data.auditLog || []), ...bulkAuditEntries], reservations: runningReservations });
      setBulkAnimatedIds(prev => new Set([...prev, row.id]));
      if (i < snapshot.length - 1) await new Promise(r => setTimeout(r, 120));
    }
    setTimeout(() => { setBulkAnimating(false); setBulkAnimatedIds(new Set()); }, 800);
  };
  const bulkResetAll = () => {
    const today = todayStr();
    let updatedReservations = [...data.reservations];
    filteredActivities.forEach(row => {
      if (!row.logEntry?.administered) return;
      const logKey = `${today}|${row.colKey}`;
      updatedReservations = updatedReservations.map(r => r.id === row.reservationId ? { ...r, activityLog: { ...(r.activityLog || {}), [logKey]: { administered: false, by: "", at: "" } } } : r);
    });
    save({ ...data, reservations: updatedReservations });
  };

  const updateActivityLog = (reservationId, colKey, updates) => {
    const logKey = `${todayStr()}|${colKey}`;
    const oldEntry = (data.reservations.find(r => r.id === reservationId)?.activityLog || {})[logKey] || {};
    const diffs = [];
    if (updates.administered !== undefined && updates.administered !== oldEntry.administered) diffs.push({field:`Activity: ${colKey.replace(/_/g," ")}`, oldVal: oldEntry.administered ? "Done" : "—", newVal: updates.administered ? "Done" : "—"});
    if (updates.consumption !== undefined && updates.consumption !== (oldEntry.consumption || "")) diffs.push({field:`Consumption: ${colKey.replace(/_/g," ")}`, oldVal: oldEntry.consumption || "—", newVal: updates.consumption || "—"});
    const auditEntries = diffs.length > 0 ? [buildAuditEntry(reservationId, "Updated Activity", diffs, profile)] : [];
    save({ ...data, auditLog: [...(data.auditLog || []), ...auditEntries], reservations: data.reservations.map(r => r.id === reservationId ? { ...r, activityLog: { ...(r.activityLog || {}), [logKey]: { ...(r.activityLog || {})[logKey], ...updates } } } : r) });
  };

  // Facility capacity calculations
  const fs = data.facilitySettings || { largeDogDaycareSF: 0, smallDogDaycareSF: 0 };
  const lgDaycareCap = Math.floor((fs.largeDogDaycareSF || 0) / 18);
  const smDaycareCap = Math.floor((fs.smallDogDaycareSF || 0) / 12);
  const allRooms = data.rooms || {};
  const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);

  // Count dogs in large daycare (checked-in daycare, dayboarding, evals, or group-play boarding dogs classified as large)
  const lgDaycareCount = inHouse.filter(r => {
    if (r.type === "daycare" && r.daycareSize === "large") return true;
    if (r.type === "dayboarding" || r.type === "evaluation") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "large"; }
    if (r.type === "boarding") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "large" && !(dog.tags || []).includes("tag_pp"); }
    return false;
  }).length;
  // Count dogs in small daycare
  const smDaycareCount = inHouse.filter(r => {
    if (r.type === "daycare" && r.daycareSize === "small") return true;
    if (r.type === "dayboarding" || r.type === "evaluation") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "small"; }
    if (r.type === "boarding") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "small" && !(dog.tags || []).includes("tag_pp"); }
    return false;
  }).length;
  // Count boarding rooms occupied tonight (exclude dogs checking out today — their room frees up tonight)
  const boardingInHouse = inHouse.filter(r => r.type === "boarding" || r.type === "dayboarding");
  const boardingOcc = boardingInHouse.filter(r => r.checkOut !== vd).length;

  const [boardingPreviewId, setBoardingPreviewId] = useState(null);

  // Quick Check-in
  const [showQuickDC, setShowQuickDC] = useState(false);
  const [dcSearch, setDcSearch] = useState("");
  const [dcCompExpand, setDcCompExpand] = useState(null);
  const dcSearchRef = useRef(null);
  useEffect(() => { if (showQuickDC && dcSearchRef.current) dcSearchRef.current.focus(); }, [showQuickDC]);

  const quickDCCheckIn = async (clientId, dogId, resType) => {
    const dog = data.dogs.find(d => d.id === dogId);
    const daycareSize = dog ? getDogDaycareSize(dog) : "large";
    const nowTime = new Date().toTimeString().slice(0, 5);
    const nowISO = new Date().toISOString();
    const newRes = {
      id: gid(), clientId, dogId, type: resType, daycareSize,
      ...(resType === "dayboarding" ? { roomType: "Executive Room" } : {}),
      checkIn: vd, checkOut: vd,
      checkInTime: nowTime,
      checkOutTime: "", status: "checked-in", notes: "",
      actualCheckInTime: nowISO,
      checkedInBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff",
      bookingSource: "walk-in",
      createdAt: nowISO,
      careOverrides: {},
      pricing: calcReservationPricing({
        type: resType, checkIn: vd, checkOut: vd,
        checkInTime: nowTime,
        checkOutTime: "", daycareSize,
        dogs: dog ? [dog] : [], dogProfiles: data.dogs,
        pricing: data.pricing, isSecondDogSameRoom: false,
      }),
    };
    const auditEntry = buildAuditEntry(newRes.id, "Checked In", [{field:"Status",oldVal:"Walk-in",newVal:"Checked In"},{field:"Actual Check-In",oldVal:"—",newVal:new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}], profile);
    await save({ ...data, auditLog: [...(data.auditLog||[]), auditEntry], reservations: [...data.reservations, newRes] });
    setShowQuickDC(false);
    setDcSearch("");
    addDashToast({ dogName: dog?.fields?.name || "?", action: `${resType} checked in`, oldVal: "Walk-in", newVal: "Checked In", undoRes: newRes });
  };

  // Toast notifications
  const [dashToasts, setDashToasts] = useState([]);
  const dashToastId = useRef(0);
  const addDashToast = (t) => {
    const id = ++dashToastId.current;
    const toast = { id, ...t };
    setDashToasts(prev => [...prev, toast]);
    setTimeout(() => setDashToasts(prev => prev.filter(x => x.id !== id)), 10000);
  };
  const dismissDashToast = (id) => setDashToasts(prev => prev.filter(x => x.id !== id));
  const undoDashToast = async (toast) => {
    const currentRes = data.reservations.find(r => r.id === toast.undoRes.id);
    const undoAction = toast.action?.includes("checked in") ? "Undo Check-In" : toast.action?.includes("checked out") ? "Undo Check-Out" : "Undo Action";
    const diffs = [];
    if (currentRes && currentRes.status !== toast.undoRes.status) {
      diffs.push({ field: "Status", oldVal: currentRes.status === "checked-in" ? "Checked In" : currentRes.status === "checked-out" ? "Checked Out" : currentRes.status, newVal: toast.undoRes.status === "upcoming" ? "Upcoming" : toast.undoRes.status === "checked-in" ? "Checked In" : toast.undoRes.status });
    }
    const auditEntry = buildAuditEntry(toast.undoRes.id, undoAction, diffs.length > 0 ? diffs : [{ field: "Action", oldVal: toast.action || "Change", newVal: "Reverted" }], profile);
    await save({ ...data, auditLog: [...(data.auditLog || []), auditEntry], reservations: data.reservations.map(r => r.id === toast.undoRes.id ? toast.undoRes : r) });
    dismissDashToast(toast.id);
  };

  // Text notification toast for reservation changes
  const [textNotify, setTextNotify] = useState(null); // { clientName, clientPhone, dogName, diffs, message, showPreview, sending }
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

  // Direct check-in for non-boarding (evals, tours, daycare) with CRM auto-creation
  const directCheckIn = async (rid) => {
    const res = data.reservations.find(r => r.id === rid);
    // Agreement gate: block check-in if required agreements unsigned
    if (res) {
      const ciClient = data.clients.find(c => c.id === res.clientId);
      if (ciClient) {
        const ciAgrs = (data.agreements || DEF_AGREEMENTS).filter(a => a.required !== false);
        const allSigned = ciAgrs.every(a => agrSigned(ciClient, a.id));
        if (!allSigned) {
          const unsigned = ciAgrs.filter(a => !agrSigned(ciClient, a.id)).map(a => a.name);
          addDashToast({ dogName: (data.dogs.find(d => d.id === res.dogId)?.fields?.name) || "?", action: "cannot check in", oldVal: "Unsigned: " + unsigned.join(", "), newVal: "Open reservation to sign" });
          nav("client-detail", { clientId: ciClient.id, openReservation: rid });
          return;
        }
      }
    }
    const newData = { ...data, reservations: data.reservations.map(r => r.id === rid ? { ...r, status: "checked-in", actualCheckInTime: new Date().toISOString(), checkedInBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff" } : r) };
    // Audit log for direct check-in
    newData.auditLog = [...(newData.auditLog || []), buildAuditEntry(rid, "Checked In", [{field:"Status",oldVal:"Upcoming",newVal:"Checked In"}], profile)];
    await save(newData);
    if (res) {
      const dog = data.dogs.find(d => d.id === res.dogId);
      addDashToast({ dogName: dog ? dog.fields.name : "?", action: "checked in", oldVal: "Upcoming", newVal: "Checked In", undoRes: { ...res } });
    }
  };

  const handleCheckIn = (rid) => {
    const res = data.reservations.find(r => r.id === rid);
    if (res && (res.type === "boarding" || res.type === "dayboarding")) {
      setBoardingPreviewId(rid);
      return;
    }
    directCheckIn(rid);
  };
  const handleCheckOut = async (rid) => {
    const res = data.reservations.find(r=>r.id===rid);
    // Boarding/dayboarding/daycare: open preview modal for checkout (payment gate)
    if (res && (res.type === "boarding" || res.type === "dayboarding" || res.type === "daycare")) {
      setBoardingPreviewId(rid);
      return;
    }
    if (res && res.type === "evaluation") {
      const existingEval = (data.evaluations || []).find(e => e.reservationId === rid && e.locked);
      if (!existingEval) {
        nav("evaluation-form", { reservationId: rid });
        return;
      }
      // Eval already done — proceed with checkout, set evalResult from evaluation
      const evalResultVal = existingEval.result === "green" ? "passed_group" : "pending";
      const origRes = res ? { ...res } : null;
      const evalCoAudit = buildAuditEntry(rid, "Checked Out", [{field:"Status",oldVal:"Checked In",newVal:"Checked Out"},{field:"Eval Result",oldVal:"Pending",newVal:evalResultVal==="passed_group"?"Passed Group":"Pending"}], profile);
      await save({...data, auditLog:[...(data.auditLog||[]),evalCoAudit], reservations:data.reservations.map(r=>r.id===rid?{...r,status:"checked-out",evalResult:evalResultVal,actualCheckOutTime:new Date().toISOString(),checkedOutBy:profile?(profile.full_name||profile.email||"Staff"):"Staff"}:r)});
      if (origRes) {
        const dog = data.dogs.find(d => d.id === origRes.dogId);
        addDashToast({ dogName: dog ? dog.fields.name : "?", action: "checked out", oldVal: "Checked In", newVal: "Checked Out", undoRes: origRes });
      }
      return;
    }
    const origRes = res ? { ...res } : null;
    const coAudit = buildAuditEntry(rid, "Checked Out", [{field:"Status",oldVal:"Checked In",newVal:"Checked Out"}], profile);
    const coSaveData = {...data, auditLog:[...(data.auditLog||[]),coAudit], reservations:data.reservations.map(r=>r.id===rid?{...r,status:"checked-out",actualCheckOutTime:new Date().toISOString(),checkedOutBy:profile?(profile.full_name||profile.email||"Staff"):"Staff"}:r)};
    // ── Auto-feed to Conversion from Tour checkout ──
    if (res && res.type === "tour" && res.clientId) {
      const tourClient = data.clients.find(c => c.id === res.clientId);
      if (tourClient) {
        const cRes = data.reservations.filter(r => r.clientId === res.clientId);
        const totalSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
        const hasUpcoming = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.id !== rid);
        if (totalSpent === 0 && !hasUpcoming) {
          const addD = (base, n) => { const d = new Date((base || todayStr()) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
          coSaveData.clients = data.clients.map(c => {
            if (c.id !== res.clientId) return c;
            const lc = c.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
            return {
              ...c,
              lifecycle: { ...lc, conversion: { ...lc.conversion, followUpDate: addD(todayStr(), 1), source: "tour", sourceDate: todayStr(), sourceReservationId: rid } },
              lifecycleEvents: [...(c.lifecycleEvents || []), { event: "auto_fed_from_tour", date: todayStr(), details: "Auto-fed to Conversion from Tour", reservationId: rid }],
            };
          });
        }
      }
    }
    await save(coSaveData);
    if (origRes) {
      const dog = data.dogs.find(d => d.id === origRes.dogId);
      addDashToast({ dogName: dog ? dog.fields.name : "?", action: "checked out", oldVal: "Checked In", newVal: "Checked Out", undoRes: origRes });
    }
  };
  // Old evalModalRes removed — now uses EvaluationFormPage

  const typeLabel=(t)=>t==="boarding"?"Boarding":t==="dayboarding"?"Day Board":t==="daycare"?"Daycare":t==="evaluation"?"Evaluation":"Tour";
  const typeColor=(t)=>t==="boarding"?"primary":t==="dayboarding"?"primary":t==="daycare"?"success":t==="evaluation"?"warning":"accent";

  // ═══ Summary Stats ═══
  const todayByType = (type, extra) => todayAll.filter(r => r.type === type && (!extra || extra(r)));
  const countByStatus = (arr, st) => arr.filter(r => r.status === st).length;

  // Tours
  const tours = todayByType("tour");
  const toursScheduled = tours.length;
  const toursCompleted = countByStatus(tours, "checked-out");

  // Evaluations
  const evals = todayByType("evaluation");
  const evalsScheduled = evals.length;
  const evalsRemaining = evals.filter(r => r.status === "upcoming").length;
  const evalsPassedGroup = evals.filter(r => r.evalResult === "passed_group").length;
  const evalsPassedPrivate = evals.filter(r => r.evalResult === "passed_private").length;

  // Daycare - Large
  const dcLarge = todayByType("daycare", r => r.daycareSize === "large");
  const dcLargeScheduled = dcLarge.length;
  const dcLargeIn = countByStatus(dcLarge, "checked-in");
  const dcLargeOut = countByStatus(dcLarge, "checked-out");

  // Daycare - Small
  const dcSmall = todayByType("daycare", r => r.daycareSize === "small");
  const dcSmallScheduled = dcSmall.length;
  const dcSmallIn = countByStatus(dcSmall, "checked-in");
  const dcSmallOut = countByStatus(dcSmall, "checked-out");

  // Boarding by room type (includes dayboarding)
  const boardingToday = todayAll.filter(r => r.type === "boarding" || r.type === "dayboarding");
  const boardingByRoom = ROOM_TYPES.map(rt => {
    const rooms = boardingToday.filter(r => r.roomType === rt);
    return { name: rt, scheduled: rooms.length, checkedIn: countByStatus(rooms, "checked-in"), checkedOut: countByStatus(rooms, "checked-out") };
  });

  // Search filter: match reservation against query by client name, dog name, phone, email
  const searchMatch = useCallback((res, q) => {
    if (!q) return true;
    const lower = q.toLowerCase();
    const client = data.clients.find(x => x.id === res.clientId);
    const dog = data.dogs.find(x => x.id === res.dogId);
    const cName = client ? `${client.fields.first_name || ""} ${client.fields.last_name || ""}`.toLowerCase() : "";
    const cPhone = (client?.fields.phone || "").replace(/\D/g, "");
    const cEmail = (client?.fields.email || "").toLowerCase();
    const dName = (dog?.fields.name || "").toLowerCase();
    const qDigits = lower.replace(/\D/g, "");
    return cName.includes(lower) || dName.includes(lower) || cEmail.includes(lower) || (qDigits.length >= 3 && cPhone.includes(qDigits));
  }, [data.clients, data.dogs]);

  const sq = searchQuery.trim();
  const fExpected = useMemo(() => expected.filter(r => searchMatch(r, sq) && typeMatch(r)), [expected, sq, searchMatch, typeFilterActive, typeFilters]);
  const fInHouse = useMemo(() => inHouse.filter(r => searchMatch(r, sq) && typeMatch(r)), [inHouse, sq, searchMatch, typeFilterActive, typeFilters]);
  const fGoingHome = useMemo(() => goingHome.filter(r => searchMatch(r, sq) && typeMatch(r)), [goingHome, sq, searchMatch, typeFilterActive, typeFilters]);
  const fCheckedOut = useMemo(() => checkedOut.filter(r => searchMatch(r, sq) && typeMatch(r)), [checkedOut, sq, searchMatch, typeFilterActive, typeFilters]);


  const isFiltering = !!sq || typeFilterActive;

  // Auto-switch to first tab with results when filtering
  useEffect(() => {
    if (!isFiltering || activeTab === "activities") return;
    const current = activeTab === "expected" ? fExpected : activeTab === "inhouse" ? fInHouse : activeTab === "goinghome" ? fGoingHome : fCheckedOut;
    if (current.length > 0) return;
    if (fExpected.length > 0) setActiveTab("expected");
    else if (fInHouse.length > 0) setActiveTab("inhouse");
    else if (fGoingHome.length > 0) setActiveTab("goinghome");
    else if (fCheckedOut.length > 0) setActiveTab("checkedout");
  }, [isFiltering, fExpected.length, fInHouse.length, fGoingHome.length, fCheckedOut.length]);

  const tabs = [
    { id: "expected", label: "Expected", count: isFiltering ? fExpected.length : expected.length, total: expected.length, color: C.info },
    { id: "inhouse", label: "In-House", count: isFiltering ? fInHouse.length : inHouse.length, total: inHouse.length, color: C.suc },
    { id: "goinghome", label: "Going Home", count: isFiltering ? fGoingHome.length : goingHome.length, total: goingHome.length, color: C.acc },
    { id: "checkedout", label: "Checked Out", count: isFiltering ? fCheckedOut.length : checkedOut.length, total: checkedOut.length, color: C.textSec },
    { id: "activities", label: "Activities", count: filteredActivities.filter(r => !r.logEntry?.administered).length, total: allActivities.length, color: C.acc },
  ];

  const rawItems = activeTab === "activities" ? [] : activeTab === "expected" ? fExpected : activeTab === "inhouse" ? fInHouse : activeTab === "goinghome" ? fGoingHome : fCheckedOut;

  const handleSort = (col) => {
    if (sortCol === col) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortCol(col); setSortDir("asc"); }
  };

  const activeItems = useMemo(() => {
    const items = [...rawItems];
    if (!sortCol) return items;
    return items.sort((a, b) => {
      let va, vb;
      if (sortCol === "inTime") { va = a.checkInTime || ""; vb = b.checkInTime || ""; }
      else if (sortCol === "outTime") { va = a.checkOutTime || ""; vb = b.checkOutTime || ""; }
      else if (sortCol === "dog") { va = dn(a.dogId).toLowerCase(); vb = dn(b.dogId).toLowerCase(); }
      else if (sortCol === "client") { va = cn(a.clientId).toLowerCase(); vb = cn(b.clientId).toLowerCase(); }
      else if (sortCol === "service") { va = a.type || ""; vb = b.type || ""; }
      else if (sortCol === "lodging") { va = a.type === "boarding" ? `${a.roomType || ""} ${a.room || ""}` : ""; vb = b.type === "boarding" ? `${b.roomType || ""} ${b.room || ""}` : ""; }
      else if (sortCol === "inDate") { va = a.checkIn || ""; vb = b.checkIn || ""; }
      else if (sortCol === "outDate") { va = a.checkOut || ""; vb = b.checkOut || ""; }
      else { va = ""; vb = ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rawItems, sortCol, sortDir]);

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <I.SortNone />;
    return sortDir === "asc" ? <I.SortAsc /> : <I.SortDesc />;
  };

  const colHeaderStyle = (col) => ({
    display: "flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none",
    color: sortCol === col ? C.pri : C.textMut,
    fontWeight: sortCol === col ? 800 : 700,
  });

  // Calendar helpers
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(viewDate+"T12:00:00"); return d.getMonth(); });
  const [calYear, setCalYear] = useState(() => { const d = new Date(viewDate+"T12:00:00"); return d.getFullYear(); });
  useEffect(() => { const d = new Date(viewDate+"T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const startDay = first.getDay(); // 0=Sun
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
    setViewDate(`${calYear}-${m}-${d}`);
    setShowCalendar(false);
  };
  const calRef = useRef(null);
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  // Summary grid data
  // Daycare totals (large + small + evals)
  const dcTotalScheduled = dcLargeScheduled + dcSmallScheduled + evalsScheduled;
  const dcTotalIn = dcLargeIn + dcSmallIn + evals.filter(r => r.status === "checked-in").length;
  const dcTotalOut = dcLargeOut + dcSmallOut + evals.filter(r => r.status === "checked-out").length;

  // Boarding totals
  const boardTotalScheduled = boardingByRoom.reduce((s, r) => s + r.scheduled, 0);
  const boardTotalIn = boardingByRoom.reduce((s, r) => s + r.checkedIn, 0);
  const boardTotalOut = boardingByRoom.reduce((s, r) => s + r.checkedOut, 0);

  // Grand total
  const grandScheduled = dcTotalScheduled + boardTotalScheduled + toursScheduled;
  const grandIn = dcTotalIn + boardTotalIn + tours.filter(r => r.status === "checked-in").length;
  const grandOut = dcTotalOut + boardTotalOut + toursCompleted;

  const summaryRows = [
    { label: "Tours", cols: [
      { label: "Scheduled", value: toursScheduled },
      { label: "Completed", value: toursCompleted, color: C.suc },
    ]},
    { section: "daycare" },
    { label: "Evaluations", cols: [
      { label: "Scheduled", value: evalsScheduled },
      { label: "Remaining", value: evalsRemaining, color: C.warn },
      { label: "Passed Group", value: evalsPassedGroup, color: C.suc },
      { label: "Passed Private", value: evalsPassedPrivate, color: C.info },
    ]},
    { label: "Large Daycare", cols: [
      { label: "Scheduled", value: dcLargeScheduled },
      { label: "Checked In", value: dcLargeIn, color: C.suc },
      { label: "Checked Out", value: dcLargeOut, color: C.textSec },
    ]},
    { label: "Small Daycare", cols: [
      { label: "Scheduled", value: dcSmallScheduled },
      { label: "Checked In", value: dcSmallIn, color: C.suc },
      { label: "Checked Out", value: dcSmallOut, color: C.textSec },
    ]},
    { label: "Total Daycare", isTotal: true, cols: [
      { label: "Scheduled", value: dcTotalScheduled },
      { label: "Checked In", value: dcTotalIn, color: C.suc },
      { label: "Checked Out", value: dcTotalOut, color: C.textSec },
    ]},
    { section: "boarding" },
    ...boardingByRoom.map(rm => ({
      label: rm.name, cols: [
        { label: "Booked", value: rm.scheduled },
        { label: "Checked In", value: rm.checkedIn, color: C.suc },
        { label: "Checked Out", value: rm.checkedOut, color: C.textSec },
      ]
    })),
    { label: "Total Boarding", isTotal: true, cols: [
      { label: "Booked", value: boardTotalScheduled },
      { label: "Checked In", value: boardTotalIn, color: C.suc },
      { label: "Checked Out", value: boardTotalOut, color: C.textSec },
    ]},
    { label: "Grand Total", isGrand: true, cols: [
      { label: "Scheduled", value: grandScheduled },
      { label: "Checked In", value: grandIn, color: C.suc },
      { label: "Checked Out", value: grandOut, color: C.textSec },
    ]},
  ];

  const grid = "minmax(90px,1.1fr) minmax(120px,1.6fr) minmax(58px,0.55fr) minmax(80px,1fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(50px,0.8fr) minmax(44px,0.45fr)";
  const [addOnPopup, setAddOnPopup] = useState(null); // { resId, anchorRect }
  const addOnPopupRef = useRef(null);
  useEffect(() => {
    if (!addOnPopup) return;
    const handler = (e) => { if (addOnPopupRef.current && !addOnPopupRef.current.contains(e.target)) setAddOnPopup(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addOnPopup]);
  const availableAddOns = (data.addOnRules || []).length > 0
    ? (data.addOnRules || []).map(r => r.name)
    : Object.keys({ ...DEF_PRICING.addOns, ...((data.pricing || {}).addOns || {}) });
  const toggleResAddOn = async (resId, addon) => {
    const res = data.reservations.find(r => r.id === resId);
    if (!res) return;
    const curr = res.addOns || [];
    const next = curr.includes(addon) ? curr.filter(a => a !== addon) : [...curr, addon];
    await save({ ...data, reservations: data.reservations.map(r => r.id === resId ? { ...r, addOns: next } : r) });
  };
  const summaryGrid = "160px repeat(4, 1fr)";

  // Group active items by clientId for merged rows
  const groupedItems = useMemo(() => {
    const groups = [];
    const map = {};
    for (const res of activeItems) {
      if (!map[res.clientId]) {
        map[res.clientId] = { clientId: res.clientId, reservations: [] };
        groups.push(map[res.clientId]);
      }
      map[res.clientId].reservations.push(res);
    }
    return groups;
  }, [activeItems]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Dashboard</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, position: "relative" }}>
            <button onClick={() => shiftDate(-1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0 }} title="Previous day">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text, textAlign: "center", padding: "4px 2px", whiteSpace: "nowrap" }}>
              {viewDateLabel}
            </span>
            <button onClick={() => shiftDate(1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0 }} title="Next day">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button onClick={() => setShowCalendar(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${showCalendar ? C.pri : C.border}`, background: showCalendar ? C.priLt : C.surface, cursor: "pointer", color: showCalendar ? C.pri : C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0, transition: "all 0.15s" }} title="Open calendar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            {!isToday && (
              <button onClick={() => setViewDate(td)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Today</button>
            )}

            {/* Calendar Popup */}
            {showCalendar && (
              <div ref={calRef} style={{ position: "absolute", top: "100%", left: 28, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
                {/* Month nav */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <button onClick={calPrev} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
                  <button onClick={calNext} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                {/* Day-of-week headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
                  {calDays.map((day, i) => {
                    if (day === null) return <div key={`e${i}`} />;
                    const m = String(calMonth + 1).padStart(2, "0");
                    const d = String(day).padStart(2, "0");
                    const dateStr = `${calYear}-${m}-${d}`;
                    const isSelected = dateStr === viewDate;
                    const isTodayCell = dateStr === td;
                    // count total dogs on-site for this date
                    const resCount = data.reservations.filter(r => r.status !== "cancelled" && r.checkIn <= dateStr && r.checkOut >= dateStr).length;
                    return (
                      <button key={i} onClick={() => calSelect(day)}
                        style={{
                          width: 34, height: 38, borderRadius: 10, border: isSelected ? `2px solid ${C.pri}` : isTodayCell ? `2px solid ${C.acc}` : "2px solid transparent",
                          background: isSelected ? C.pri : "transparent",
                          color: isSelected ? "#fff" : isTodayCell ? C.acc : C.text,
                          fontSize: 13, fontWeight: isSelected || isTodayCell ? 700 : 500,
                          cursor: "pointer", fontFamily: "inherit", padding: 0,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto",
                          transition: "all 0.1s", gap: 0, lineHeight: 1,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surfaceHover; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                      >
                        {day}
                        {resCount > 0 && <span style={{ fontSize: 8, fontWeight: 600, color: isSelected ? "rgba(255,255,255,0.7)" : C.textMut, lineHeight: 1, marginTop: 1 }}>{resCount}</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Today shortcut in calendar */}
                {!isToday && (
                  <div style={{ textAlign: "center", marginTop: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}>
                    <button onClick={() => { setViewDate(td); setShowCalendar(false); }} style={{ fontSize: 12, fontWeight: 700, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Go to Today</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span data-shortcut-quickdc="1" onClick={()=>setShowQuickDC(true)} style={{display:"inline-flex"}}><Btn variant="success" onClick={()=>setShowQuickDC(true)} icon={<I.Plus/>}>Quick Check-In{(data.hotkeySettings||{}).showHints===true&&<kbd style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:4,padding:"1px 5px",marginLeft:4,fontFamily:"'Outfit',monospace",lineHeight:1.4}}>Q</kbd>}</Btn></span>
          <Btn onClick={() => setShowSellPkg(true)} icon={<I.ShoppingCart/>} style={{background:C.acc,color:"#fff",border:"none"}}>Sell Package</Btn>
          <Btn onClick={onNew} icon={<I.Plus/>}>New {(data.hotkeySettings||{}).showHints===true&&<kbd style={{fontSize:10,fontWeight:600,color:C.textMut,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",marginLeft:4,fontFamily:"'Outfit',monospace",lineHeight:1.4}}>N</kbd>}</Btn>
        </div>
      </div>

      {/* ═══ Daily Summary + Occupancy (combined) ═══ */}
      {(() => {
        const totalDaycareCount = lgDaycareCount + smDaycareCount;
        const totalDaycareCap = lgDaycareCap + smDaycareCap;
        const overallCount = totalDaycareCount + boardingOcc;
        const overallCap = totalDaycareCap + totalRoomCount;
        const overallPct = overallCap > 0 ? Math.round((overallCount / overallCap) * 100) : 0;
        const boardingPct = totalRoomCount > 0 ? Math.round((boardingOcc / totalRoomCount) * 100) : 0;
        const daycarePct = totalDaycareCap > 0 ? Math.round((totalDaycareCount / totalDaycareCap) * 100) : 0;
        const pctColor = (p) => p > 85 ? C.dan : p > 60 ? C.acc : C.suc;
        return (
      <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
        {/* Grand Total Row - always visible, clickable to expand */}
        <button onClick={() => setShowSummaryDetail(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", padding: "12px 20px", background: C.priLt, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", gap: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"}
          onMouseLeave={e => e.currentTarget.style.background = C.priLt}
        >
          <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>{isToday ? "Today's Total" : viewDateObj.toLocaleDateString("en-US",{month:"short",day:"numeric"}) + " Total"}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.pri }}>{grandScheduled} Scheduled</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{grandScheduled}</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.pri, textTransform: "uppercase", opacity: 0.6 }}>Sched</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.suc, fontVariantNumeric: "tabular-nums" }}>{grandIn}</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.suc, textTransform: "uppercase", opacity: 0.7 }}>In</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{grandOut}</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, textTransform: "uppercase" }}>Out</div>
            </div>
            <div style={{ width: 1, height: 28, background: `${C.pri}25`, margin: "0 4px" }} />
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: pctColor(boardingPct), fontVariantNumeric: "tabular-nums" }}>{boardingPct}%</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.pri, textTransform: "uppercase", opacity: 0.6 }}>Board</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: pctColor(overallPct), fontVariantNumeric: "tabular-nums" }}>{overallPct}%</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.pri, textTransform: "uppercase", opacity: 0.6 }}>Facility</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: "transform 0.2s", transform: showSummaryDetail ? "rotate(180deg)" : "rotate(0deg)" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </button>

        {/* Expandable Detail */}
        {showSummaryDetail && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {/* Summary breakdown table */}
            <div style={{ padding: "0 20px 12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: summaryGrid, gap: 0, marginTop: 8 }}>
                {summaryRows.filter(r => !r.isGrand).map((row, ri, arr) => {
                  if (row.section) {
                    return (
                      <React.Fragment key={`sec-${ri}`}>
                        <div style={{ gridColumn: "1 / -1", height: 0, borderBottom: `2px solid ${C.border}`, margin: "4px 0" }} />
                      </React.Fragment>
                    );
                  }
                  const padded = [...row.cols];
                  while (padded.length < 4) padded.push(null);
                  const nextRow = arr[ri + 1];
                  const isLast = ri === arr.length - 1;
                  const isBeforeSection = nextRow && nextRow.section;
                  const bb = isLast || isBeforeSection ? "none" : row.isTotal ? "none" : `1px solid ${C.borderLight}`;
                  const bg = row.isTotal ? C.bg : "transparent";
                  const labelWeight = row.isTotal ? 700 : 600;
                  const numSize = row.isTotal ? 15 : 14;
                  const bt = row.isTotal ? `2px solid ${C.border}` : "none";
                  return (
                    <React.Fragment key={ri}>
                      <div style={{ padding: "7px 0", borderBottom: bb, borderTop: bt, fontSize: 12, fontWeight: labelWeight, color: C.text, display: "flex", alignItems: "center", background: bg, paddingLeft: row.isTotal ? 6 : 0, borderRadius: row.isTotal ? "6px 0 0 6px" : 0 }}>{row.label}</div>
                      {padded.map((c, ci) => (
                        <div key={ci} style={{ padding: "7px 4px", borderBottom: bb, borderTop: bt, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: bg, borderRadius: row.isTotal && ci === padded.length - 1 ? "0 6px 6px 0" : 0 }}>
                          {c ? (<>
                            <span style={{ fontSize: numSize, fontWeight: 800, color: c.color || C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{c.value}</span>
                            <span style={{ fontSize: 8, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 1 }}>{c.label}</span>
                          </>) : null}
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Occupancy breakdown */}
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Occupancy</div>
                {/* 3-column breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  {[
                    { label: "Large Daycare", count: lgDaycareCount, cap: lgDaycareCap, color: C.pri, ltColor: C.priLt },
                    { label: "Small Daycare", count: smDaycareCount, cap: smDaycareCap, color: C.acc, ltColor: "#FFF7ED" },
                    { label: "Boarding", count: boardingOcc, cap: totalRoomCount, color: C.suc, ltColor: C.sucLt },
                  ].map(s => {
                    const p = s.cap > 0 ? Math.round((s.count / s.cap) * 100) : 0;
                    const bc = p > 85 ? C.dan : p > 60 ? C.acc : s.color;
                    return (
                      <div key={s.label} style={{ padding: "10px 12px", borderRadius: 10, background: s.ltColor, border: `1px solid ${s.color}20` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{s.count}<span style={{ fontWeight: 500, color: C.textSec }}>/{s.cap}</span></span>
                        </div>
                        <div style={{ width: "100%", height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(p, 100)}%`, height: "100%", borderRadius: 3, background: bc, transition: "width 0.5s ease" }} />
                        </div>
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 3, textAlign: "right" }}>{p}%</div>
                      </div>
                    );
                  })}
                </div>
                {/* Summary row: Total Daycare + Overall Facility */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Daycare</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{totalDaycareCount}<span style={{ fontWeight: 500, color: C.textSec }}>/{totalDaycareCap}</span> <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(daycarePct), marginLeft: 2 }}>{daycarePct}%</span></span>
                    </div>
                    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(daycarePct, 100)}%`, height: "100%", borderRadius: 2, background: pctColor(daycarePct), transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: C.priLt, border: `1px solid ${C.pri}20` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em" }}>Overall Facility</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{overallCount}<span style={{ fontWeight: 500, color: C.textSec }}>/{overallCap}</span> <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(overallPct), marginLeft: 2 }}>{overallPct}%</span></span>
                    </div>
                    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(overallPct, 100)}%`, height: "100%", borderRadius: 2, background: pctColor(overallPct), transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
        );
      })()}

      {/* ═══ Tabbed Dashboard Table ═══ */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Search bar */}
        {(() => {
          const isAct = activeTab === "activities";
          const curQ = isAct ? actSearch : searchQuery;
          const setCurQ = isAct ? setActSearch : setSearchQuery;
          const hasQ = curQ.trim().length > 0;
          return (
            <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1.5px solid ${C.borderLight}`, background: C.bg, transition: "border-color 0.15s" }}
              onFocus={e => e.currentTarget.style.borderBottomColor = C.pri}
              onBlur={e => e.currentTarget.style.borderBottomColor = C.borderLight}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={hasQ ? C.pri : C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input data-shortcut-search className="no-focus-ring" value={curQ} onChange={e => setCurQ(e.target.value)} placeholder={isAct ? "Search by dog name, client name, or room…" : "Search by client name, dog name, phone, or email…"} style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: C.text, padding: "12px 10px", width: "100%", fontFamily: "inherit" }} />
              {!hasQ && !isAct && (data.hotkeySettings||{}).showHints===true && <kbd style={{fontSize:11,fontWeight:600,color:C.textMut,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:5,padding:"2px 7px",fontFamily:"'Outfit',monospace",flexShrink:0,lineHeight:1.4}}>/</kbd>}
              {hasQ && <button onClick={() => setCurQ("")} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex", fontFamily: "inherit" }} title="Clear search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
              {/* Filter pills — swap for Activities tab */}
              <div style={{ display: "flex", gap: 4, marginLeft: 8, flexShrink: 0 }}>
                {isAct ? (
                  <>
                    {[
                      { type: "feeding", label: "Feeding", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>, color: C.pri },
                      { type: "medication", label: "Meds", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 9h6"/></svg>, color: C.acc },
                      { type: "bathing", label: "Baths", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h0a2 2 0 012 2v1"/></svg>, color: C.info },
                    ].map(f => {
                      const on = actTypeFilter.has(f.type);
                      return (
                        <button key={f.type} onClick={() => toggleActType(f.type)}
                          style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${on ? f.color : C.border}`, background: on ? f.color : "transparent", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em", display: "flex", alignItems: "center", gap: 4 }}>
                          {f.icon}{f.label}
                        </button>
                      );
                    })}
                    {actTypeFilter.size > 0 && <button onClick={() => setActTypeFilter(new Set())} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: "0 2px", display: "flex", alignItems: "center", fontFamily: "inherit" }} title="Clear type filters"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                    {/* Time-of-day filter divider + pills */}
                    <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px", flexShrink: 0 }}/>
                    {[
                      { id: "am", label: "AM", desc: "Before 11 AM" },
                      { id: "noon", label: "Noon", desc: "11 AM – 2 PM" },
                      { id: "pm", label: "PM", desc: "After 2 PM" },
                    ].map(f => {
                      const on = actTimeFilter === f.id;
                      return (
                        <button key={f.id} onClick={() => setActTimeFilter(on ? "" : f.id)} title={f.desc}
                          style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${on ? C.text : C.border}`, background: on ? C.text : "transparent", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                          {f.label}
                        </button>
                      );
                    })}
                    {/* Bulk Action divider + controls */}
                    <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px", flexShrink: 0 }}/>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                      <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>BULK</span>
                    </div>
                    <button onClick={executeBulkMark} disabled={pendingActivities.length === 0 || bulkAnimating} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: pendingActivities.length > 0 ? (bulkAnimating ? C.suc : C.pri) : C.border, color: pendingActivities.length > 0 ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: pendingActivities.length > 0 && !bulkAnimating ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s" }}
                      title={`Mark ${pendingActivities.length} pending items as complete`}>
                      {bulkAnimating ? "Marking..." : `Mark ${pendingActivities.length}`}
                    </button>
                    <button onClick={bulkResetAll} style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                      title="Reset all completed items">
                      Reset
                    </button>
                  </>
                ) : (
                  <>
                    {[
                      { type: "evaluation", label: "Evals", color: C.acc },
                      { type: "tour", label: "Tours", color: C.info },
                      { type: "boarding", label: "Board", color: C.pri },
                      { type: "dayboarding", label: "Day Board", color: C.pri },
                      { type: "daycare", label: "Daycare", color: C.suc },
                    ].map(f => {
                      const on = typeFilters.has(f.type);
                      return (
                        <button key={f.type} onClick={() => toggleTypeFilter(f.type)}
                          style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${on ? f.color : C.border}`, background: on ? f.color : "transparent", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                          {f.label}
                        </button>
                      );
                    })}
                    <span style={{ width: 1, height: 18, background: C.border, margin: "0 2px" }} />
                    <button onClick={() => { setAddOnsView(v => !v); if (!addOnsView) { setTypeFilters(new Set()); } }}
                      style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${addOnsView ? C.warn : C.border}`, background: addOnsView ? C.warn : "transparent", color: addOnsView ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                      Add-Ons
                    </button>
                    {(typeFilterActive || addOnsView) && <button onClick={() => { setTypeFilters(new Set()); setAddOnsView(false); }} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: "0 2px", display: "flex", alignItems: "center", fontFamily: "inherit" }} title="Clear filters"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                  </>
                )}
              </div>
            </div>
          );
        })()}
        {/* ═══ ADD-ONS SUMMARY VIEW ═══ */}
        {addOnsView ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Active Add-Ons</h3>
              <span style={{ fontSize: 12, color: C.textMut, fontWeight: 500 }}>across {inHouse.length} in-house {inHouse.length === 1 ? "dog" : "dogs"}</span>
            </div>
            {addOnsSummary.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: C.textMut, fontSize: 14 }}>No add-ons currently active for in-house dogs</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {addOnsSummary.map(item => {
                  const addonPrices = getAddOnPrices(data.pricing, data.addOnRules);
                  const price = addonPrices[item.name] ?? 0;
                  const totalRev = price * item.count;
                  return (
                    <div key={item.name} style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, background: C.surface, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40, height: 40, borderRadius: 10, background: C.warn + "18", color: C.warn, fontSize: 18, fontWeight: 800 }}>{item.count}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>${price.toFixed(2)} each · ${totalRev.toFixed(2)} total revenue</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "50%" }}>
                          {item.dogs.map((d, i) => (
                            <span key={i} onClick={() => nav("client-detail", { clientId: d.clientId })}
                              style={{ fontSize: 11, background: C.priO, color: C.pri, padding: "3px 8px", borderRadius: 8, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}
                              onMouseEnter={e => { e.target.style.background = C.pri; e.target.style.color = "#fff"; }}
                              onMouseLeave={e => { e.target.style.background = C.priO; e.target.style.color = C.pri; }}>
                              {d.dogName} ({d.clientName.split(" ").pop()})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: C.surfaceAlt, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>Total active add-ons</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.pri }}>{addOnsSummary.reduce((s, i) => s + i.count, 0)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Tab Bar */}
        <div style={{ display: "flex", borderBottom: `2px solid ${C.borderLight}`, background: C.bg }}>
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSortCol(null); }}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 16px", border: "none", borderBottom: `3px solid ${active ? tab.color : "transparent"}`, background: active ? C.surface : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", marginBottom: -2 }}>
                <span style={{ fontSize: 14, fontWeight: active ? 700 : 600, color: active ? C.text : C.textSec }}>{tab.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, padding: "0 8px", borderRadius: 12, fontSize: 13, fontWeight: 800, background: active ? tab.color : C.surfaceHover, color: active ? "#fff" : C.textSec, transition: "all 0.15s" }}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* ═══ ACTIVITIES TAB ═══ */}
        {activeTab === "activities" ? (
          <div>
            {/* Print Bath Schedule Button */}
            {(() => {
              const bathRows = allActivities.filter(r => r.type === "bathing");
              if (bathRows.length === 0) return null;
              const printBathSchedule = () => {
                const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
                const sorted = [...bathRows].sort((a, b) => {
                  const tA = a.checkOutTime || "23:59"; const tB = b.checkOutTime || "23:59";
                  return tA.localeCompare(tB);
                });
                const rows = sorted.map(r => {
                  const dName = r.dog?.fields.name || "Unknown";
                  const cLast = r.client?.fields.last_name || "";
                  const breed = r.dog?.fields.breed || "";
                  const weight = r.dog?.fields.weight ? `${r.dog.fields.weight} lbs` : "";
                  const co = r.checkOutTime ? fmtTimeLabel(r.checkOutTime) : "TBD";
                  const administered = r.logEntry?.administered;
                  const postBath = r.postBathReturn || "";
                  return `<tr style="${administered ? "background:#e8f5e9;" : ""}">
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:700;">${dName}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${cLast}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${breed}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${weight}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${r.room || "—"}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:700;">${r.detail || "Standard"}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:600;color:${postBath === "Return to Group" ? "#2e7d32" : postBath === "Return to Room" ? "#e65100" : "#666"};">${postBath || "—"}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:700;">${co}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;text-align:center;">${administered ? "✓" : "☐"}</td>
                  </tr>`;
                }).join("");
                const html = `<!DOCTYPE html><html><head><title>Bath Schedule - ${today}</title>
                  <style>
                    @page { size: landscape; margin: 0.5in; }
                    body { font-family: Arial, sans-serif; color: #222; padding: 0; margin: 0; }
                    h1 { font-size: 22px; margin: 0 0 4px; color: #14532D; }
                    h2 { font-size: 14px; font-weight: 400; color: #666; margin: 0 0 16px; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th { background: #14532D; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
                    .summary { margin-top: 20px; font-size: 12px; color: #666; display: flex; gap: 24px; }
                    .summary span { font-weight: 700; color: #222; }
                  </style></head><body>
                  <h1>K9 Operations — Bath Schedule</h1>
                  <h2>${today} · ${bathRows.length} bath${bathRows.length !== 1 ? "s" : ""} scheduled</h2>
                  <table>
                    <thead><tr><th>Dog</th><th>Owner</th><th>Breed</th><th>Weight</th><th>Room</th><th>Bath Type</th><th>After Bath</th><th>Departs</th><th style="text-align:center">Done</th></tr></thead>
                    <tbody>${rows}</tbody>
                  </table>
                  <div class="summary">
                    <div>Total: <span>${bathRows.length}</span></div>
                    <div>Completed: <span>${bathRows.filter(r => r.logEntry?.administered).length}</span></div>
                    <div>Remaining: <span>${bathRows.filter(r => !r.logEntry?.administered).length}</span></div>
                  </div>
                  <script>window.onload=()=>{window.print();}<\/script>
                </body></html>`;
                const w = window.open("", "_blank");
                w.document.write(html);
                w.document.close();
              };
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
                  <div style={{ fontSize: 12, color: C.textSec }}>
                    <span style={{ fontWeight: 700, color: C.text }}>{bathRows.length}</span> bath{bathRows.length !== 1 ? "s" : ""} scheduled today · <span style={{ fontWeight: 700, color: C.suc }}>{bathRows.filter(r => r.logEntry?.administered).length}</span> done
                  </div>
                  <button onClick={printBathSchedule} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print Bath Schedule
                  </button>
                </div>
              );
            })()}
            {/* Activities Table Header */}
            {(() => {
              const showDeparts = actTypeFilter.has("bathing") || (actTypeFilter.size === 0 && filteredActivities.some(r => r.type === "bathing"));
              const bathOnly = actTypeFilter.size === 1 && actTypeFilter.has("bathing");
              const actGrid = bathOnly
                ? "80px minmax(120px,1.4fr) minmax(90px,1.2fr) 70px 80px minmax(90px,1fr) 80px 72px"
                : showDeparts
                  ? "80px minmax(120px,1.4fr) minmax(90px,1.2fr) 70px 80px minmax(90px,1fr) minmax(120px,1.3fr) 72px"
                  : "80px minmax(130px,1.5fr) minmax(110px,1.3fr) 70px 80px minmax(100px,1fr) minmax(155px,1.4fr)";
              const CONSUMPTION_OPTS = ["0%","25%","50%","75%","100%"];
              const typeBadge = (t) => {
                const cfg = t === "feeding" ? { bg: C.pri, label: "Feeding" } : t === "medication" ? { bg: C.acc, label: "Meds" } : { bg: C.info, label: "Bath" };
                return <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,fontWeight:700,color:"#fff",background:cfg.bg,padding:"2px 8px",borderRadius:6,whiteSpace:"nowrap"}}>{cfg.label}</span>;
              };
              const pendingCount = pendingActivities.length;

              const timePills = [["all","All"],["am","AM"],["noon","Noon"],["pm","PM"]];
              const typePills = [["all","All"],["feeding","Feeding"],["medication","Meds"],["bathing","Bath"]];

              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: actGrid, padding: "10px 12px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
                    <div>Time</div>
                    <div>Dog / Client</div>
                    <div>Task Details</div>
                    <div>Qty</div>
                    <div>Administered</div>
                    <div>By</div>
                    <div>{bathOnly ? "Bath Type" : "% Eaten"}</div>
                    {showDeparts && <div>Departs</div>}
                  </div>
                  <div style={{ minHeight: 200 }}>
                    {filteredActivities.length === 0 ? (
                      <div style={{ padding: "48px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>{allActivities.length === 0 ? "☕" : "🔍"}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.textSec }}>
                          {allActivities.length === 0 ? "No activities scheduled for in-house guests today" : "No activities match your search or filters"}
                        </div>
                        {allActivities.length === 0 && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>Activities will appear here when checked-in dogs have feeding, medication, or bath schedules.</div>}
                      </div>
                    ) : (
                      filteredActivities.map((row, ri) => {
                        const entry = row.logEntry;
                        const administered = !!entry.administered;
                        const justAnimated = bulkAnimatedIds.has(row.id);
                        const cLast = row.client?.fields.last_name || "";
                        const dName = row.dog?.fields.name || "Unknown";
                        return (
                          <div key={row.id} style={{ display: "grid", gridTemplateColumns: actGrid, padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "center", background: administered ? C.suc + "08" : "transparent", transition: "background 0.3s", cursor: "pointer", ...(justAnimated ? { background: C.suc + "22", boxShadow: `inset 4px 0 0 ${C.suc}`, transition: "background 0.6s ease-out, box-shadow 0.6s ease-out" } : {}) }}
                            onClick={() => setBoardingPreviewId(row.reservationId)}
                            onMouseEnter={e => { if (!administered) e.currentTarget.style.background = C.surfaceHover; }}
                            onMouseLeave={e => { e.currentTarget.style.background = administered ? C.suc + "08" : "transparent"; }}>
                            {/* Time */}
                            <div style={{ fontVariantNumeric: "tabular-nums" }}>
                              {(() => { const t = fmtTimeTwoLine(row.time); return (<><div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{t.label}</div>{t.sub && <div style={{ fontSize: 10, color: C.textMut, lineHeight: 1.2 }}>{t.sub}</div>}</>); })()}
                            </div>
                            {/* Dog + Client */}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <button onClick={e => { e.stopPropagation(); nav("dog-detail", { clientId: row.clientId, dogId: row.dogId }); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: C.pri, textDecoration: "underline", textDecorationColor: C.pri + "40" }}>{dName}</span>
                                </button>
                                <span style={{ fontSize: 12, color: C.textSec }}>{cLast}</span>
                              </div>
                              {row.room && <div style={{ fontSize: 11, color: C.textMut }}>Room {row.room}</div>}
                            </div>
                            {/* Task Details */}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                                {typeBadge(row.type)}
                                {row.foodType && <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{row.foodType}</span>}
                                {row.type === "bathing" && row.detail && <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{row.detail}</span>}
                              </div>
                              {row.instruction && <div style={{ fontSize: 11, color: C.textSec, fontStyle: "italic", marginTop: 2 }}>{row.instruction}</div>}
                              {row.notes && <div style={{ fontSize: 10, color: C.textMut, marginTop: 1 }}>{row.notes}</div>}
                            </div>
                            {/* QTY */}
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                              {row.qty || "—"}
                            </div>
                            {/* Administered Checkbox */}
                            <div onClick={e => e.stopPropagation()}>
                              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                                <input type="checkbox" checked={administered} style={{ accentColor: C.suc, width: 16, height: 16, cursor: "pointer" }}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      updateActivityLog(row.reservationId, row.colKey, { administered: true, by: actStaffName, at: new Date().toISOString() });
                                    } else {
                                      updateActivityLog(row.reservationId, row.colKey, { administered: false, by: "", at: "" });
                                    }
                                  }} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: administered ? C.suc : C.textMut }}>
                                  {administered ? "Done" : "Mark"}
                                </span>
                              </label>
                            </div>
                            {/* Administered By */}
                            <div onClick={e => e.stopPropagation()}>
                              {administered && entry.by ? (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{entry.by}</div>
                                  {entry.at && <div style={{ fontSize: 10, color: C.textMut }}>{new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</div>}
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: C.textMut }}>—</span>
                              )}
                            </div>
                            {/* % Eaten / Bath Type */}
                            <div onClick={e => e.stopPropagation()}>
                              {row.type === "feeding" ? (
                                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                                  {CONSUMPTION_OPTS.map(opt => {
                                    const sel = entry.consumption === opt;
                                    return (
                                      <button key={opt} onClick={() => updateActivityLog(row.reservationId, row.colKey, { consumption: sel ? "" : opt })}
                                        style={{ padding: "3px 7px", borderRadius: 6, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : "transparent", color: sel ? C.pri : C.textSec, fontSize: 10, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", minWidth: 30, transition: "all 0.12s" }}>
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : row.type === "bathing" && bathOnly ? (
                                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{row.detail}</span>
                              ) : (
                                <span style={{ fontSize: 11, color: C.textMut }}>—</span>
                              )}
                            </div>
                            {/* Departs (shown when baths visible) */}
                            {showDeparts && (
                              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                                {row.checkOutTime ? fmtTimeLabel(row.checkOutTime) : "—"}
                                {row.checkOut && <div style={{ fontSize: 10, color: C.textMut }}>{fmtDate(row.checkOut)}</div>}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
        <>
        {/* Table Header */}
        <div style={{ display: "grid", gridTemplateColumns: grid, padding: "10px 12px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
          <div style={colHeaderStyle("client")} onClick={() => handleSort("client")}>Client <SortIcon col="client" /></div>
          <div style={colHeaderStyle("dog")} onClick={() => handleSort("dog")}>Dog <SortIcon col="dog" /></div>
          <div style={colHeaderStyle("service")} onClick={() => handleSort("service")}>Service <SortIcon col="service" /></div>
          <div style={colHeaderStyle("lodging")} onClick={() => handleSort("lodging")}>Lodging <SortIcon col="lodging" /></div>
          <div style={colHeaderStyle("inDate")} onClick={() => handleSort("inDate")}>In Date <SortIcon col="inDate" /></div>
          <div style={colHeaderStyle("inTime")} onClick={() => handleSort("inTime")}>In Time <SortIcon col="inTime" /></div>
          <div style={colHeaderStyle("outDate")} onClick={() => handleSort("outDate")}>Out Date <SortIcon col="outDate" /></div>
          <div style={colHeaderStyle("outTime")} onClick={() => handleSort("outTime")}>Out Time <SortIcon col="outTime" /></div>
          <div>Add-Ons</div>
          <div style={{ textAlign: "right" }}>Action</div>
        </div>

        {/* Rows */}
        <div style={{ minHeight: 200 }}>
          {groupedItems.length === 0 ? (
            <div style={{ padding: "48px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.textSec }}>
                {activeTab === "expected" ? "No arrivals expected today" : activeTab === "inhouse" ? "No dogs currently in-house" : activeTab === "goinghome" ? "No departures today" : "No check-outs yet today"}
              </div>
            </div>
          ) : (
            groupedItems.map(group => {
              const client = data.clients.find(x => x.id === group.clientId);
              const resCount = group.reservations.length;
              return (
                <div key={group.clientId} data-row style={{ display: "grid", gridTemplateColumns: grid, padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "start", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {/* Col 1: Client (spans all dog rows) */}
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: resCount > 1 ? resCount * 52 : "auto" }}>
                    <div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); nav("client-detail", { clientId: group.clientId }); }}
                        onMouseEnter={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="underline"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = "transparent"; }}
                        onMouseLeave={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="none"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = C.surfaceHover; }}>
                        <Hl><span data-hl style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{cn(group.clientId)}</span></Hl>
                        {client && <AgreementIcons client={client} agreements={data.agreements} />}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{fmtPhone(client?.fields.phone)}</div>
                    </div>
                  </div>

                  {/* Col 2-6: Dogs (each dog is a sub-row) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: resCount > 1 ? 8 : 0, gridColumn: "2 / -1" }}>
                    {group.reservations.map(res => {
                      const dog = getDog(res.dogId);
                      const showCheckIn = activeTab === "expected";
                      const showCheckOut = activeTab === "inhouse" || activeTab === "goinghome";
                      const age = dog ? calcAge(dog.fields.dob) : null;
                      const weight = dog?.fields.weight;
                      const snLabel = dog ? fixedLabel(dog) : "";
                      const dogDetails = [age, weight ? `${weight}lbs` : null, snLabel].filter(Boolean).join(" · ");
                      return (
                        <div key={res.id} onClick={() => setBoardingPreviewId(res.id)} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1.6fr) minmax(58px,0.55fr) minmax(80px,1fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(50px,0.8fr) minmax(44px,0.45fr)", alignItems: "center", minHeight: 40, cursor: "pointer" }}>
                          {/* Dog info */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); if (dog) nav("dog-detail", { clientId: res.clientId, dogId: res.dogId }); }}
                              onMouseEnter={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="underline"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = "transparent"; }}
                              onMouseLeave={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="none"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = C.surfaceHover; }}>
                              <Hl><span data-hl style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{dn(res.dogId)}</span></Hl>
                              {dog && <DogPicHover dog={dog} size={20} />}
                              {dog && <VaxIcon dog={dog} requiredVaccines={data.requiredVaccines} policies={data.resortPolicies} />}
                              {dog && <DogTagChips dog={dog} dogTags={data.dogTags} size="sm" />}
                              {dog && (() => { const allEvals = (data.evaluations||[]).filter(e=>e.dogId===res.dogId&&e.locked).sort((a,b)=>(b.date||"").localeCompare(a.date||"")); if (!allEvals.length) return null; const le = allEvals[0]; const tipLines = allEvals.map((ev,i) => `Eval ${i+1}: ${ev.result==="green"?"Approved":"Not Approved"} \u2014 ${ev.totalScore||0}/${ev.maxScore||0} pts (${fmtDate(ev.date)})`).join("\n"); return (
                                <Tip text={tipLines}>
                                  <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:le.result==="green"?C.suc:C.dan,color:"#fff",fontSize:9,fontWeight:800,flexShrink:0}}>{le.result==="green"?"\u2713":"\u2717"}</span>
                                </Tip>); })()}
                              {/* EOD Mention count icon */}
                              {(() => { const eodCount = (data.eodEntries || []).reduce((cnt, e) => { if (!e.date || e.date < res.checkIn || (res.checkOut && e.date > res.checkOut)) return cnt; return cnt + (e.mentions || []).filter(m => m.entityType === "dog" && m.entityId === res.dogId).length; }, 0); if (!eodCount) return null; return (
                                <Tip text={`${eodCount} EOD note${eodCount !== 1 ? "s" : ""} during stay`}>
                                  <span style={{display:"inline-flex",alignItems:"center",gap:2,padding:"1px 6px",borderRadius:8,background:C.acc+"20",color:C.acc,fontSize:10,fontWeight:800,flexShrink:0}}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    ×{eodCount}
                                  </span>
                                </Tip>); })()}
                            </div>
                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 1 }}>{dog?.fields?.breed ? `${dog.fields.breed} · ` : ""}{dogDetails}</div>
                            {res.notes && <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 2 }}>{res.notes}</div>}
                          </div>
                          {/* Service */}
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{typeLabel(res.type)}</span>
                          </div>
                          {/* Lodging */}
                          <div style={{ minWidth: 0, overflow: "hidden" }}>
                            {(res.type === "boarding" || res.type === "dayboarding") && res.roomType && <><div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{res.roomType}</div>{res.room && <div style={{ fontSize: 11, color: C.textSec }}>{res.room}</div>}{res.checkIn && res.checkOut && (() => { const nights = Math.round((new Date(res.checkOut+"T12:00:00") - new Date(res.checkIn+"T12:00:00")) / 86400000); return nights > 0 ? <div style={{ fontSize: 11, color: C.textMut }}>{nights} night{nights !== 1 ? "s" : ""}</div> : null; })()}</>}
                          </div>
                          {/* In Date */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckInTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(new Date(res.actualCheckInTime).toISOString().split("T")[0])}</span>
                              {new Date(res.actualCheckInTime).toISOString().split("T")[0] !== res.checkIn && <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtDate(res.checkIn)}</div>}
                            </> : <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(res.checkIn)}</span>}
                          </div>
                          {/* In Time */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckInTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{new Date(res.actualCheckInTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                              <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtTime(res.checkInTime)}</div>
                            </> : <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtTime(res.checkInTime)}</span>}
                          </div>
                          {/* Out Date */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckOutTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(new Date(res.actualCheckOutTime).toISOString().split("T")[0])}</span>
                              {new Date(res.actualCheckOutTime).toISOString().split("T")[0] !== res.checkOut && <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtDate(res.checkOut)}</div>}
                            </> : <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(res.checkOut)}</span>}
                          </div>
                          {/* Out Time */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckOutTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{new Date(res.actualCheckOutTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                              <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtTime(res.checkOutTime)}</div>
                            </> : <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtTime(res.checkOutTime)}</span>
                            </>}
                          </div>
                          {/* Add-Ons */}
                          <div style={{ position: "relative" }}>
                            {res.type !== "tour" ? (() => {
                              const resAddOns = res.addOns || [];
                              return (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", minHeight: 24 }}
                                  onMouseEnter={e => { const b = e.currentTarget.querySelector("[data-addon-plus]"); if (b) { b.style.opacity = "1"; b.style.pointerEvents = "auto"; } }}
                                  onMouseLeave={e => { const b = e.currentTarget.querySelector("[data-addon-plus]"); if (b) { b.style.opacity = resAddOns.length > 0 ? "0.6" : "0"; b.style.pointerEvents = resAddOns.length > 0 ? "auto" : "none"; } }}>
                                  {resAddOns.map(a => (
                                    <span key={a} style={{ fontSize: 9, background: C.priO, color: C.pri, padding: "1px 6px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{a}</span>
                                  ))}
                                  <span data-addon-plus
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setAddOnPopup(prev => prev?.resId === res.id ? null : { resId: res.id, x: rect.left, y: rect.bottom + 4 });
                                    }}
                                    onMouseEnter={e => { const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = "transparent"; }}
                                    onMouseLeave={e => { const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = C.surfaceHover; }}
                                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", border: `1.5px dashed ${C.border}`, color: C.textMut, fontSize: 14, cursor: "pointer", opacity: resAddOns.length > 0 ? 0.6 : 0, pointerEvents: resAddOns.length > 0 ? "auto" : "none", transition: "opacity 0.15s" }}
                                  >+</span>
                                </div>
                              );
                            })() : null}
                          </div>
                          {/* Action */}
                          <div style={{ textAlign: "right" }} onClick={e => e.stopPropagation()}>
                            {showCheckIn && <Btn size="sm" variant="success" onClick={() => handleCheckIn(res.id)} icon={<I.LogIn/>}>In</Btn>}
                            {showCheckOut && (() => {
                              const dogHasEvalTag = dog && (dog.tags || []).includes("tag_eval");
                              const isEvalRes = res.type === "evaluation";
                              const evalDone = hasCompletedEval(data, res);
                              const needsEvalBtn = (isEvalRes && !evalDone) || (dogHasEvalTag && !evalDone) || ((res.type === "boarding" || res.type === "dayboarding") && res.needsEval && !evalDone);
                              return needsEvalBtn ? <Btn size="sm" variant="warning" onClick={() => nav("evaluation-form", { reservationId: res.id })} icon={<I.Clipboard/>}>Eval</Btn> : null;
                            })()}
                            {showCheckOut && (
                              <Btn size="sm" variant="accent" onClick={() => handleCheckOut(res.id)} icon={<I.LogOut/>}>Out</Btn>
                            )}
                            {activeTab === "checkedout" && <Badge color="default" size="sm">Done</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        </>
        )}
        </>
        )}
      </Card>

      {/* Add-On Quick-Add Popup */}
      {addOnPopup && (() => {
        const res = data.reservations.find(r => r.id === addOnPopup.resId);
        if (!res) return null;
        const resAddOns = res.addOns || [];
        const addonRulesMap = Object.fromEntries((data.addOnRules || []).map(r => [r.name, r.price]));
        const addonPrices = (data.addOnRules || []).length > 0 ? addonRulesMap : { ...DEF_PRICING.addOns, ...((data.pricing || {}).addOns || {}) };
        return ReactDOM.createPortal(
          <div ref={addOnPopupRef} style={{ position: "fixed", left: Math.min(addOnPopup.x, window.innerWidth - 260), top: Math.min(addOnPopup.y, window.innerHeight - 400), zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", padding: "8px 0", minWidth: 240, maxHeight: 400, overflowY: "auto", fontFamily: "'Outfit', -apple-system, sans-serif" }}>
            <div style={{ padding: "6px 14px 8px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.borderLight}` }}>Add-Ons</div>
            {availableAddOns.map(addon => {
              const active = resAddOns.includes(addon);
              const price = addonPrices[addon] ?? 0;
              return (
                <div key={addon} onClick={() => toggleResAddOn(addOnPopup.resId, addon)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", cursor: "pointer", transition: "background 0.1s", fontSize: 13, borderBottom: `1px solid ${C.borderLight}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${active ? C.pri : C.border}`, background: active ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{active ? "\u2713" : ""}</span>
                  <span style={{ flex: 1, fontWeight: 500, color: C.text }}>{addon}</span>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>${price}</span>
                </div>
              );
            })}
            {availableAddOns.length === 0 && <div style={{ padding: "12px 14px", fontSize: 12, color: C.textMut }}>No add-ons configured. Add them in Settings → Pricing.</div>}
          </div>,
          document.body
        );
      })()}

      {/* Quick Check-in Modal */}
      {showQuickDC && (
        <Modal title="Quick Check-In" wide onClose={()=>{setShowQuickDC(false);setDcSearch("");setDcCompExpand(null);}}>
          <div style={{marginBottom:12}}>
            <input ref={dcSearchRef} className="no-focus-ring" value={dcSearch} onChange={e=>setDcSearch(e.target.value)} placeholder="Search client or dog name..." style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:14,fontWeight:500,fontFamily:"inherit",outline:"none",background:C.bg}} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
          <div style={{maxHeight:350,overflowY:"auto"}}>
            {(() => {
              const q = dcSearch.trim().toLowerCase();
              if (!q) return <div style={{padding:20,textAlign:"center",color:C.textMut,fontSize:13}}>Type a client or dog name to search</div>;
              const results = [];
              data.clients.forEach(cl => {
                const cName = `${cl.fields?.first_name||""} ${cl.fields?.last_name||""}`.trim();
                const dogs = data.dogs.filter(d => d.fields?.owner_id === cl.id || data.reservations.some(r => r.clientId === cl.id && r.dogId === d.id));
                const uniqueDogs = [...new Map(dogs.map(d => [d.id, d])).values()];
                const cMatch = cName.toLowerCase().includes(q);
                uniqueDogs.forEach(dog => {
                  const dName = (dog.fields?.name || "").toLowerCase();
                  if (cMatch || dName.includes(q)) {
                    const alreadyIn = data.reservations.some(r => r.dogId === dog.id && (r.type === "daycare" || r.type === "dayboarding") && r.checkIn === vd && r.status === "checked-in");
                    results.push({ clientId: cl.id, clientName: cName, dogId: dog.id, dogName: dog.fields?.name, breed: dog.fields?.breed, size: getDogDaycareSize(dog), alreadyIn });
                  }
                });
              });
              if (results.length === 0) return <div style={{padding:20,textAlign:"center",color:C.textMut,fontSize:13}}>No dogs found matching "{dcSearch}"</div>;
              return results.slice(0, 10).map((r, i) => {
                const dog = data.dogs.find(d=>d.id===r.dogId);
                const client = data.clients.find(c=>c.id===r.clientId);
                const vaxStatus = getVaxStatus(dog, data.requiredVaccines, data.resortPolicies);
                const ecOk = !!(client?.fields?.emergency_contact?.trim() && client?.fields?.emergency_phone?.trim());
                const agreements = data.agreements || DEF_AGREEMENTS;
                const reqAgrs = agreements.filter(a=>a.required!==false);
                const agrOk = reqAgrs.every(a=>agrSigned(client,a.id));
                const ageStatus = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
                const snStatus = getSpayNeuterCompliance(dog);
                const allGreen = vaxStatus.ok && ecOk && agrOk && ageStatus.ok && snStatus.ok;
                const checks = [
                  { ok: vaxStatus.ok, label: "Vaccines", expandKey: "vax",
                    detail: vaxStatus.ok ? "Up to date" : `${[...(vaxStatus.expired||[]),...(vaxStatus.missing||[])].length} issue(s)`,
                    children: <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {vaxStatus.ok ? <div style={{color:C.suc,fontSize:11}}>All vaccines current</div> : <>
                        {(vaxStatus.expired||[]).map(vId=>{const vax=VACCINES.find(v=>v.id===vId);return <div key={vId} style={{color:C.dan,fontSize:11}}>• {vax?vax.name:vId.replace(/_/g," ")} — Expired</div>;})}
                        {(vaxStatus.missing||[]).map(vId=>{const vax=VACCINES.find(v=>v.id===vId);return <div key={vId} style={{color:C.dan,fontSize:11}}>• {vax?vax.name:vId.replace(/_/g," ")} — Missing</div>;})}
                      </>}
                      {(data.requiredVaccines||[]).map(vId=>{
                        const curDate=dog.fields[vId]||"";const vax=VACCINES.find(v=>v.id===vId);const vaxName=vax?vax.name:vId.replace(/_/g," ");
                        return <div key={vId+"e"} style={{marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,color:C.textSec,minWidth:90,fontWeight:600}}>{vaxName}</span>
                          <MiniDatePicker value={curDate} onChange={async(v)=>{await save({...data,dogs:data.dogs.map(d=>d.id===dog.id?{...d,fields:{...d.fields,[vId]:v}}:d)});}}/>
                          {curDate&&<span style={{fontSize:9,color:vaxStatus.expired?.includes(vId)?C.dan:C.suc,fontWeight:600}}>{vaxStatus.expired?.includes(vId)?"Expired":"Valid"}</span>}
                        </div>;
                      })}
                    </div>
                  },
                  { ok: ecOk, label: "Emergency Contact", expandKey: "ec",
                    detail: ecOk ? client.fields.emergency_contact : "Missing",
                    children: <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:10,color:C.textSec,fontWeight:600,minWidth:50}}>Name</span>
                        <input value={client?.fields?.emergency_contact||""} placeholder="Contact name..." style={{flex:1,fontSize:11,padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",outline:"none"}}
                          onChange={async(e)=>{await save({...data,clients:data.clients.map(c=>c.id===client.id?{...c,fields:{...c.fields,emergency_contact:e.target.value}}:c)});}}/>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:10,color:C.textSec,fontWeight:600,minWidth:50}}>Phone</span>
                        <input value={client?.fields?.emergency_phone||""} placeholder="Contact phone..." style={{flex:1,fontSize:11,padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",outline:"none"}}
                          onChange={async(e)=>{await save({...data,clients:data.clients.map(c=>c.id===client.id?{...c,fields:{...c.fields,emergency_phone:e.target.value}}:c)});}}/>
                      </div>
                    </div>
                  },
                  { ok: agrOk, label: "Agreements", expandKey: "agr",
                    detail: agrOk ? "All signed" : `${reqAgrs.filter(a=>!agrSigned(client,a.id)).length} unsigned`,
                    children: <div style={{display:"flex",flexDirection:"column",gap:4}}>
                      {reqAgrs.map(agr=>{
                        const signed=agrSigned(client,agr.id);const signedData=(client.agreements||{})[agr.id];
                        return <div key={agr.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.borderLight}`}}>
                          <div>
                            <span style={{fontSize:11,color:C.text,fontWeight:600}}>{agr.name}</span>
                            {signed&&signedData?.date&&<span style={{fontSize:9,color:C.suc,marginLeft:6}}>Signed {fmtDate(signedData.date)}</span>}
                          </div>
                          {!signed ? <Btn size="sm" onClick={async()=>{
                            const agrs={...(client.agreements||{}),[agr.id]:{signed:true,date:todayStr()}};
                            await save({...data,clients:data.clients.map(c=>c.id===client.id?{...c,agreements:agrs}:c)});
                          }}>Sign Now</Btn> : <span style={{fontSize:10,color:C.suc,fontWeight:700}}>✓ Signed</span>}
                        </div>;
                      })}
                    </div>
                  },
                  { ok: ageStatus.ok, warn: ageStatus.grandfathered, label: "Dog Age", expandKey: "age",
                    detail: ageStatus.ok ? (ageStatus.age ? `${ageStatus.age}yr${ageStatus.grandfathered?" (Grandfathered)":""}` : "OK") : (ageStatus.reason || "Failed"),
                    children: <div style={{display:"flex",flexDirection:"column",gap:4}}>
                      {ageStatus.age ? <span style={{color:ageStatus.ok?C.suc:C.dan,fontSize:11}}>
                        {ageStatus.age} years old{ageStatus.grandfathered&&` (Grandfathered — ${ageStatus.visitCount||0} visits)`}{!ageStatus.ok&&!ageStatus.grandfathered&&` — ${ageStatus.reason}`}
                      </span> : <span style={{color:C.textMut,fontSize:11}}>Age not set</span>}
                      <div style={{fontSize:9,color:C.textMut,marginTop:2}}>Max age: {(data.resortPolicies||{}).maxDogAge||13} years. Grandfathered after {(data.resortPolicies||{}).grandfatherVisitThreshold||10} visits.</div>
                    </div>
                  },
                  { ok: snStatus.ok, label: "Spay/Neuter", expandKey: "sn",
                    detail: snStatus.ok?(snStatus.status==="Neutered"||snStatus.status==="Spayed"?snStatus.status:(snStatus.privatePlay?"Intact (PP)":snStatus.status||"N/A")):`Intact — ${snStatus.reason||"Must be Private Play"}`,
                    children: <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <span style={{color:snStatus.ok?C.suc:C.dan,fontSize:11}}>
                        {snStatus.status==="Neutered"||snStatus.status==="Spayed"?snStatus.status:`Intact${snStatus.ageMonths!=null?` (${snStatus.ageMonths} months old)`:""}`}
                        {snStatus.privatePlay&&" — Private Play assigned"}
                        {!snStatus.ok&&` — ${snStatus.reason}`}
                      </span>
                      <div style={{fontSize:9,color:C.textMut}}>Intact dogs 10+ months old must be assigned to Private Play.</div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                        <span style={{fontSize:10,color:C.textSec,fontWeight:600,minWidth:50}}>Status</span>
                        <select value={dog.fields?.spayed_neutered||""} style={{flex:1,fontSize:11,padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",outline:"none",cursor:"pointer"}}
                          onChange={async(e)=>{await save({...data,dogs:data.dogs.map(d=>d.id===dog.id?{...d,fields:{...d.fields,spayed_neutered:e.target.value}}:d)});}}>
                          <option value="">Unknown</option>
                          <option value="Neutered">Neutered</option>
                          <option value="Spayed">Spayed</option>
                          <option value="Intact">Intact</option>
                        </select>
                      </div>
                      {!snStatus.ok && (
                        <button onClick={async()=>{
                          const curTags = dog.tags || [];
                          if (!curTags.includes("tag_pp")) {
                            const newTags = [...curTags.filter(t => t !== "tag_eval" && t !== "tag_lp" && t !== "tag_sp"), "tag_pp"];
                            await save({...data, dogs: data.dogs.map(d => d.id === dog.id ? {...d, tags: newTags} : d)});
                          }
                        }} style={{padding:"6px 12px",borderRadius:6,border:`1.5px solid ${C.pri}`,background:`${C.pri}08`,color:C.pri,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",width:"fit-content"}}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.pri;e.currentTarget.style.color="#fff";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=`${C.pri}08`;e.currentTarget.style.color=C.pri;}}>
                          Assign Private Play
                        </button>
                      )}
                    </div>
                  },
                ];
                return (
                <div key={i} style={{padding:"12px 14px",borderRadius:12,border:`1px solid ${r.alreadyIn?C.suc+"40":C.border}`,marginBottom:8,background:r.alreadyIn?C.sucLt:C.surface}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:r.alreadyIn?0:8}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span onClick={(e)=>{e.stopPropagation();setShowQuickDC(false);setDcSearch("");nav("dog-detail",{clientId:r.clientId,dogId:r.dogId});}} style={{fontWeight:700,fontSize:14,color:C.pri,cursor:"pointer",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{r.dogName}</span>
                        <span style={{fontWeight:400,color:C.textSec,fontSize:12}}>({r.breed})</span>
                        {dog && <DogPicHover dog={dog} size={20}/>}
                        {dog && <VaxIcon dog={dog} requiredVaccines={data.requiredVaccines} policies={data.resortPolicies}/>}
                        {dog && <DogTagChips dog={dog} dogTags={data.dogTags} size="sm"/>}
                        {dog && (()=>{ const allEvals=(data.evaluations||[]).filter(e=>e.dogId===r.dogId&&e.locked).sort((a,b)=>(b.date||"").localeCompare(a.date||"")); if(!allEvals.length)return null; const le=allEvals[0]; const tipLines=allEvals.map((ev,ei)=>`Eval ${ei+1}: ${ev.result==="green"?"Approved":"Not Approved"} \u2014 ${ev.totalScore||0}/${ev.maxScore||0} pts (${fmtDate(ev.date)})`).join("\n"); return <Tip text={tipLines}><span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:le.result==="green"?C.suc:C.dan,color:"#fff",fontSize:9,fontWeight:800,flexShrink:0}}>{le.result==="green"?"\u2713":"\u2717"}</span></Tip>; })()}
                      </div>
                      <div style={{fontSize:12,color:C.textSec,display:"flex",alignItems:"center",gap:2,flexWrap:"wrap"}}>
                        <span onClick={(e)=>{e.stopPropagation();setShowQuickDC(false);setDcSearch("");nav("client-detail",{clientId:r.clientId});}} style={{color:C.pri,cursor:"pointer",fontWeight:600,textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{r.clientName}</span>
                        <span style={{color:C.textMut}}>{"\u2022"}</span>
                        <span>{r.size === "small" ? "Small" : "Large"} daycare</span>
                      </div>
                    </div>
                    {r.alreadyIn && <Badge color="success" size="sm">Already In</Badge>}
                  </div>
                  {!r.alreadyIn && (() => {
                    // Compliance rules: check which validations apply per appointment type
                    const cRules = data.complianceRules || {};
                    const isCheckRequired = (checkId, apptType) => {
                      const rule = cRules[checkId];
                      if (!rule || rule.appliesTo === "all") return true;
                      if (rule.appliesTo === "none") return false;
                      if (rule.appliesTo === "custom") return (rule.apptTypes || []).includes(apptType);
                      return true;
                    };
                    // Spay/neuter is visual-only — does NOT block check-in per K9 Operations policy
                    const dcGreen = [
                      {id:"vaccines",ok:vaxStatus.ok},{id:"emergency_contact",ok:ecOk},{id:"agreements",ok:agrOk},{id:"dog_age",ok:ageStatus.ok}
                    ].every(c => !isCheckRequired(c.id, "group_daycare") || c.ok);
                    const dbGreen = [
                      {id:"vaccines",ok:vaxStatus.ok},{id:"emergency_contact",ok:ecOk},{id:"agreements",ok:agrOk},{id:"dog_age",ok:ageStatus.ok}
                    ].every(c => !isCheckRequired(c.id, "dayboarding") || c.ok);
                    return <>
                    <div style={{display:"flex",gap:8,marginBottom:8}}>
                      <button onClick={()=>{if(dcGreen)quickDCCheckIn(r.clientId, r.dogId, "daycare");}} disabled={!dcGreen}
                        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${dcGreen?C.suc+"30":C.border}`,background:dcGreen?`${C.suc}08`:C.bg,color:dcGreen?C.suc:C.textMut,fontSize:13,fontWeight:700,cursor:dcGreen?"pointer":"not-allowed",fontFamily:"inherit",transition:"all 0.15s",opacity:dcGreen?1:0.5}}
                        onMouseEnter={e=>{if(dcGreen){e.currentTarget.style.background=C.suc;e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor=C.suc;}}}
                        onMouseLeave={e=>{if(dcGreen){e.currentTarget.style.background=`${C.suc}08`;e.currentTarget.style.color=C.suc;e.currentTarget.style.borderColor=`${C.suc}30`;}}}>
                        <I.LogIn style={{width:14,height:14}}/> Daycare
                      </button>
                      <button onClick={()=>{if(dbGreen)quickDCCheckIn(r.clientId, r.dogId, "dayboarding");}} disabled={!dbGreen}
                        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${dbGreen?C.pri+"30":C.border}`,background:dbGreen?`${C.pri}08`:C.bg,color:dbGreen?C.pri:C.textMut,fontSize:13,fontWeight:700,cursor:dbGreen?"pointer":"not-allowed",fontFamily:"inherit",transition:"all 0.15s",opacity:dbGreen?1:0.5}}
                        onMouseEnter={e=>{if(dbGreen){e.currentTarget.style.background=C.pri;e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor=C.pri;}}}
                        onMouseLeave={e=>{if(dbGreen){e.currentTarget.style.background=`${C.pri}08`;e.currentTarget.style.color=C.pri;e.currentTarget.style.borderColor=`${C.pri}30`;}}}>
                        <I.LogIn style={{width:14,height:14}}/> Day Boarding
                      </button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                      {checks.map((ck,ci)=>{
                        const expKey=`${r.dogId}|${ck.expandKey}`;
                        const isExp=dcCompExpand===expKey;
                        return (
                        <div key={ci} style={{gridColumn:isExp?"1 / -1":"auto"}}>
                          <button onClick={()=>setDcCompExpand(prev=>prev===expKey?null:expKey)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1.5px solid ${ck.ok?C.suc+"50":ck.warn?C.acc+"50":C.dan+"50"}`,background:ck.ok?`${C.suc}0C`:ck.warn?`${C.acc}0C`:`${C.dan}0C`,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.12s"}}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <span style={{fontSize:12,fontWeight:800,color:ck.ok?C.suc:ck.warn?C.acc:C.dan}}>{ck.ok?"✓":ck.warn?"⚠":"✗"}</span>
                              <span style={{fontSize:11,fontWeight:700,color:ck.ok?C.suc:ck.warn?C.acc:C.dan}}>{ck.label}</span>
                              <span style={{fontSize:8,color:C.textMut,marginLeft:"auto"}}>{isExp?"▲":"▼"}</span>
                            </div>
                            <div style={{fontSize:9,color:C.textSec,marginTop:1,paddingLeft:17}}>{ck.detail}</div>
                          </button>
                          {isExp && ck.children && <div style={{marginTop:4,padding:"8px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,fontSize:11}}>{ck.children}</div>}
                        </div>
                        );
                      })}
                    </div>
                  </>;
                  })()}
                </div>
                );
              });
            })()}
          </div>
        </Modal>
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
            const origCopy = { ...bRes };
            const merged = { ...bRes, ...updatedRes };
            if (doCheckIn) { merged.status = "checked-in"; merged.actualCheckInTime = new Date().toISOString(); merged.checkedInBy = profile ? (profile.full_name || profile.email || "Staff") : "Staff"; }
            if (doCheckOut) { merged.status = "checked-out"; merged.actualCheckOutTime = new Date().toISOString(); merged.checkedOutBy = profile ? (profile.full_name || profile.email || "Staff") : "Staff"; }
            // Store adjusted pricing with discount on reservation
            if (updatedRes.discountType && updatedRes.discountValue) {
              merged.discountType = updatedRes.discountType;
              merged.discountValue = updatedRes.discountValue;
            }
            // Deduct coupons from package sales if applied
            let updatedPackageSales = [...(data.packageSales || [])];
            if (updatedRes.appliedCoupons && updatedRes.appliedCoupons.length > 0) {
              updatedRes.appliedCoupons.forEach(ac => {
                updatedPackageSales = updatedPackageSales.map(s => s.id === ac.saleId ? { ...s, used: (s.used || 0) + ac.unitsUsed, unitsRemaining: Math.max(0, (s.unitsRemaining || s.quantity || 0) - ac.unitsUsed) } : s);
              });
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
            // Also log date/time changes made during checkout
            if (doCheckOut) {
              const coDiffs = [];
              if (updatedRes.checkIn !== bRes.checkIn) coDiffs.push({field:"Check-In Date",oldVal:bRes.checkIn,newVal:updatedRes.checkIn});
              if (updatedRes.checkOut !== bRes.checkOut) coDiffs.push({field:"Check-Out Date",oldVal:bRes.checkOut,newVal:updatedRes.checkOut});
              if (updatedRes.checkInTime !== bRes.checkInTime) coDiffs.push({field:"Check-In Time",oldVal:bRes.checkInTime,newVal:updatedRes.checkInTime});
              if (updatedRes.checkOutTime !== bRes.checkOutTime) coDiffs.push({field:"Check-Out Time",oldVal:bRes.checkOutTime,newVal:updatedRes.checkOutTime});
              if (coDiffs.length > 0) auditLogs.push(buildAuditEntry(bRes.id, "Adjusted Dates at Check-Out", coDiffs, profile));
            }
            const newAuditLog = [...(data.auditLog || []), ...auditLogs];
            await save({ ...data, auditLog: newAuditLog, packageSales: updatedPackageSales, reservations: data.reservations.map(r => r.id === bRes.id ? merged : r) });
            addDashToast({ dogName: bDog.fields.name, action: doCheckIn ? "checked in" : doCheckOut ? "checked out" : "updated", oldVal: doCheckIn ? "Upcoming" : doCheckOut ? "Checked In" : "Previous", newVal: doCheckIn ? "Checked In" : doCheckOut ? "Checked Out" : "Saved", undoRes: origCopy });
            // Offer to text client about reservation changes (not for check-in/out)
            if (!doCheckIn && !doCheckOut && diffs.length > 0 && bClient) {
              showTextNotifyToast(bClient, bDog, diffs);
            }
            setBoardingPreviewId(null);
          }}
          data={data} save={save} profile={profile} nav={nav}
        />;
      })()}

      {/* Dashboard Toast notifications */}
      {dashToasts.length > 0 && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
          {dashToasts.map(t => (
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
                  {t.dogName}<span style={{ fontWeight: 500, color: C.textSec }}> {t.action}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textMut }}>
                  <span style={{ textDecoration: "line-through", color: C.dan }}>{t.oldVal}</span>
                  <span style={{ margin: "0 5px", color: C.textMut }}>&rarr;</span>
                  <span style={{ fontWeight: 600, color: C.suc }}>{t.newVal}</span>
                </div>
              </div>
              <button onClick={() => undoDashToast(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Undo</button>
              <button onClick={() => dismissDashToast(t.id)} style={{ width: 22, height: 22, borderRadius: 11, border: "none", background: "transparent", cursor: "pointer", color: C.textMut, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit" }}>&times;</button>
            </div>
          ))}
          {/* Text notification toast */}
          {textNotify && (
            <div style={{ pointerEvents: "auto", background: "rgba(255,255,255,0.98)", backdropFilter: "blur(8px)", border: `2px solid ${C.pri}`, borderRadius: 14, padding: "14px 18px", maxWidth: 420, minWidth: 300, boxShadow: "0 6px 24px rgba(0,0,0,0.18)", animation: "k9toast 0.3s ease-out" }}>
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
      )}
      {showSellPkg && <SellPackageModal data={data} save={save} onClose={() => setShowSellPkg(false)} nav={nav} profile={profile} />}
    </div>
  );
}

export { DashboardPage };

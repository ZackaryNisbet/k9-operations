// K9 Operations — DailyOpsPage
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

function DailyOpsPage({ data, save, sub, nav, profile, addGlobalToast, params }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const dayIdx = new Date(viewDate + "T12:00:00").getDay();
  const meta = OPS_TYPES[sub] || OPS_TYPES.opening;
  const isTemplate = !!meta.key;

  // Date nav helpers
  const shiftDate = (d) => { const dt = new Date(viewDate + "T12:00:00"); dt.setDate(dt.getDate() + d); setViewDate(dt.toISOString().slice(0,10)); };
  const isToday = viewDate === td;
  const isPast = viewDate < td;
  const dateLbl = (() => { const d = new Date(viewDate + "T12:00:00"); return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); })();

  // Get or create entry
  const allOps = data.dailyOps || [];
  const entryId = `ops_${sub}_${viewDate}`;
  const existing = allOps.find(e => e.id === entryId);
  const isLocked = existing ? existing.locked : isPast;

  // ─── Custom template support ───
  const [customTemplate, setCustomTemplate] = useState(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Load custom template from Supabase on mount
  useEffect(() => {
    if (!isTemplate) return;
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_checklist_templates").select("*").eq("location_id", locationId).eq("template_type", sub).then(({ data: rows }) => {
      if (rows && rows.length > 0 && Array.isArray(rows[0].items) && rows[0].items.length > 0) {
        setCustomTemplate(rows[0].items);
      }
    });
  }, [sub]);

  // Template-based items for today (use custom if available)
  const baseTemplate = isTemplate ? (customTemplate || data[meta.key] || meta.def) : [];
  const template = baseTemplate;
  const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);

  // Template editor functions
  const openTemplateEditor = () => {
    setEditTemplate(template.map(t => ({ ...t })));
    setTemplateDirty(false);
    setShowTemplateEditor(true);
  };

  const moveTemplateSec = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editTemplate.length) return;
    const items = [...editTemplate];
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const updateTemplateSec = (idx, field, value) => {
    const items = [...editTemplate];
    items[idx] = { ...items[idx], [field]: value };
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const removeTemplateSec = (idx) => {
    setEditTemplate(editTemplate.filter((_, i) => i !== idx));
    setTemplateDirty(true);
  };

  const addTemplateSec = () => {
    const newId = `${sub}_custom_${Date.now()}`;
    setEditTemplate([...editTemplate, { id: newId, label: "New Task", time: meta.showTime ? "08:00" : undefined }]);
    setTemplateDirty(true);
  };

  const saveTemplateToDb = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_checklist_templates").upsert({
      location_id: locationId,
      template_type: sub,
      items: editTemplate,
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,template_type" });
    if (!error) {
      setCustomTemplate(editTemplate.map(t => ({ ...t })));
      setTemplateDirty(false);
      setShowTemplateEditor(false);
      if (addGlobalToast) addGlobalToast("Checklist template saved", "success");
    }
    setTemplateSaving(false);
  };

  const resetTemplateToDefault = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    await supabase.from("lite_checklist_templates").delete().eq("location_id", locationId).eq("template_type", sub);
    setCustomTemplate(null);
    setTemplateDirty(false);
    setShowTemplateEditor(false);
    setTemplateSaving(false);
    if (addGlobalToast) addGlobalToast("Checklist template reset to defaults", "success");
  };

  // Local state for editable items
  const [items, setItems] = useState({});
  const [completedBy, setCompletedBy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (existing) {
      setItems(existing.items || {});
      setCompletedBy(existing.completedBy || "");
    } else if (isTemplate) {
      const init = {};
      todayItems.forEach(t => { init[t.id] = { checked: false, initials: "" }; });
      setItems(init);
      setCompletedBy("");
    } else {
      setItems(existing ? existing.items || {} : {});
      setCompletedBy("");
    }
    setDirty(false);
  }, [viewDate, sub, data.dailyOps]);

  const toggleItem = (key, field, val) => {
    if (isLocked) return;
    const userName = profile?.full_name || "";
    // Auto-fill name when checking a checkbox
    if (field === "checked" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, initials: userName } }));
    } else if (field === "refresh" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, refreshBy: userName } }));
    } else if (field === "disinfect" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, disinfectBy: userName } }));
    } else if (field === "setupDone" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, setupDoneBy: userName } }));
    } else if (field === "asNeeded" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, asNeededBy: userName } }));
    } else if (field === "asNeededDone" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, asNeededDoneBy: userName } }));
    } else if (field === "setupBowl") {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val } }));
    } else {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val } }));
    }
    setDirty(true);
  };

  const saveEntry = async () => {
    const entries = [...allOps];
    const idx = entries.findIndex(e => e.id === entryId);
    const isFirstSave = idx < 0;
    const prevHistory = isFirstSave ? [] : (entries[idx].history || []);
    const newHistory = [...prevHistory, { ts: new Date().toISOString(), action: isFirstSave ? "created" : "saved" }];
    const entry = { id: entryId, type: sub, date: viewDate, locked: false, items, history: newHistory };
    if (idx >= 0) entries[idx] = entry; else entries.push(entry);
    await save({ ...data, dailyOps: entries });
    setDirty(false);
  };

  const toggleLock = async () => {
    if (isPast && isLocked) return; // Cannot unlock prior days
    const entries = [...allOps];
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx >= 0) {
      const newLocked = !entries[idx].locked;
      entries[idx] = { ...entries[idx], locked: newLocked, history: [...(entries[idx].history || []), { ts: new Date().toISOString(), action: newLocked ? "locked" : "unlocked" }] };
    } else {
      entries.push({ id: entryId, type: sub, date: viewDate, locked: true, items, history: [{ ts: new Date().toISOString(), action: "locked" }] });
    }
    await save({ ...data, dailyOps: entries });
  };

  // Progress for template checklists
  const checkedCount = isTemplate ? todayItems.filter(t => items[t.id]?.checked).length : 0;
  const totalCount = isTemplate ? todayItems.length : 0;
  const pctDone = totalCount ? Math.round((checkedCount / totalCount) * 100) : 0;

  // ─── Dynamic data queries ───
  const allRooms = data.rooms || {};
  const boardingToday = (data.reservations || []).filter(r => r.type === "boarding" && r.checkIn <= viewDate && r.checkOut >= viewDate && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = (data.reservations || []).filter(r => r.type === "boarding" && r.checkOut === viewDate && r.status === "checked-out");

  // PP checklist: checked-in dogs with Private Play add-on OR day boarding dogs
  const ppReservations = (data.reservations || []).filter(r =>
    (r.type === "boarding" || r.type === "daycare" || r.type === "dayboarding") &&
    r.status === "checked-in" &&
    r.checkIn <= viewDate && r.checkOut >= viewDate &&
    (resSvcIncludes(r, "Private Play") || r.type === "dayboarding")
  ).map(r => ({
    ...r,
    _ppSource: r.type === "dayboarding"
      ? (resSvcIncludes(r, "Private Play") ? "Day Boarding + Add-On" : "Day Boarding")
      : "Private Play Add-On"
  })).sort((a, b) => {
    const aNum = a.room ? (a.room.match(/(\d+[A-Za-z]*)$/) || [])[1] || "" : "";
    const bNum = b.room ? (b.room.match(/(\d+[A-Za-z]*)$/) || [])[1] || "" : "";
    return aNum.localeCompare(bNum, undefined, { numeric: true });
  });

  const getDog = (did) => data.dogs.find(d => d.id === did);
  const getClient = (cid) => data.clients.find(c => c.id === cid);
  const dogName = (did) => { const d = getDog(did); return d ? d.fields.name : "?"; };
  const ownerName = (cid) => { const c = getClient(cid); return c ? `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim() : "?"; };

  // ─── Render helpers ───
  const hdrStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 };
  const dateNavStyle = { display: "flex", alignItems: "center", gap: 8 };
  const nbtn = { border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 };

  const renderDateNav = () => (
    <div style={hdrStyle}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>{meta.title}</h2>
        {isTemplate && meta.showTime && todayItems.some(t => t.dayOfWeek != null) && <div style={{ fontSize: 11, color: C.acc, marginTop: 2 }}>+ {DAY_NAMES_SHORT[dayIdx]} tasks</div>}
      </div>
      <div style={dateNavStyle}>
        <button onClick={() => shiftDate(-1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, minWidth: 200, textAlign: "center" }}>{dateLbl}</span>
        <button onClick={() => shiftDate(1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>›</button>
        {!isToday && <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: C.pri, color: "#fff" }}>Today</button>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {dirty && !isLocked && <Btn onClick={saveEntry}>Save</Btn>}
        {isTemplate && <Btn variant="secondary" size="sm" onClick={openTemplateEditor}>Customize</Btn>}
        {existing && (isPast && isLocked ? <Btn variant="secondary" size="sm" disabled style={{opacity:0.5,cursor:"not-allowed"}}>🔒 Locked</Btn> : <Btn variant={isLocked ? "secondary" : "accent"} onClick={toggleLock} size="sm">{isLocked ? "🔒 Locked" : "🔓 Lock"}</Btn>)}
        {existing && <button onClick={() => setShowHistory(v => !v)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{showHistory ? "Hide History" : "History"}</button>}
        {isLocked && <Badge color="default">Read Only</Badge>}
      </div>
    </div>
  );

  // ─── Template-based Checklist ───
  const renderTemplateChecklist = () => (
    <div>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1, height: 6, background: C.borderLight, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pctDone}%`, height: "100%", background: pctDone === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.priL})`, borderRadius: 3, transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: pctDone === 100 ? C.suc : C.text, minWidth: 42, textAlign: "right" }}>{checkedCount}/{totalCount}</span>
      </div>
      {/* Items */}
      <Card>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", padding: "8px 14px", borderBottom: `2px solid ${C.border}`, background: C.surfaceHover }}>
            <div style={{ width: 36 }} />
            {meta.showTime && <div style={{ width: 70, fontSize: 11, fontWeight: 700, color: C.textMut }}>TIME</div>}
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: C.textMut }}>TASK</div>
            <div style={{ width: 140, fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>COMPLETED BY</div>
          </div>
          {todayItems.map((t, i) => {
            const it = items[t.id] || {};
            const isWeekly = t.dayOfWeek != null;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: i < todayItems.length - 1 ? `1px solid ${C.border}` : "none", background: isWeekly ? "rgba(132,204,22,0.04)" : it.checked ? "rgba(34,139,34,0.03)" : "transparent", opacity: isLocked ? 0.7 : 1 }}>
                <div style={{ width: 36 }}>
                  <input type="checkbox" checked={!!it.checked} disabled={isLocked} onChange={e => toggleItem(t.id, "checked", e.target.checked)} style={{ width: 18, height: 18, cursor: isLocked ? "default" : "pointer", accentColor: C.pri }} />
                </div>
                {meta.showTime && <div style={{ width: 70, fontSize: 12, fontWeight: 600, color: t.time ? C.pri : C.textMut, fontVariantNumeric: "tabular-nums" }}>{t.time ? formatTime12hr(t.time) : (isWeekly ? DAY_NAMES_SHORT[t.dayOfWeek] : "")}</div>}
                <div style={{ flex: 1, fontSize: 13, color: it.checked ? C.textMut : C.text, textDecoration: it.checked ? "line-through" : "none", lineHeight: 1.4 }}>
                  {t.label}
                  {isWeekly && <Badge color="accent" size="sm" style={{ marginLeft: 6 }}>{DAY_NAMES_SHORT[t.dayOfWeek]}</Badge>}
                </div>
                <div style={{ width: 140, textAlign: "center", fontSize: 12, fontWeight: 500, color: it.initials ? C.textSec : C.textMut }}>
                  {it.initials || "—"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );

  // ─── Room Cleaning ───
  const fmtTimeShort = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  };
  const renderRoomCleaning = () => {
    const roomItems = items;

    // ─── Previous-day missed cleaning detection ───
    const prevDateObj = new Date(viewDate + "T12:00:00");
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().slice(0, 10);
    const prevEntryId = `ops_room_cleaning_${prevDate}`;
    const prevEntry = allOps.find(e => e.id === prevEntryId);
    const prevItems = prevEntry ? (prevEntry.items || {}) : {};

    // Previous-day missed disinfect from computed_items
    const prevComputedRooms = prevEntry?.computed_items?.rooms || [];
    const missedMap = {};
    if (prevComputedRooms.length > 0) {
      prevComputedRooms.forEach(cr => {
        if (cr.needsDisinfect && !(prevItems[cr.room]?.disinfect)) {
          missedMap[cr.room] = { missedDisinfect: true };
        }
      });
    } else {
      // Fallback: client-side missed detection
      const prevBoardingCheckedOut = (data.reservations || []).filter(r => r.type === "boarding" && r.checkOut === prevDate && r.status === "checked-out");
      const prevBoardingToday = (data.reservations || []).filter(r => r.type === "boarding" && r.checkIn <= prevDate && r.checkOut >= prevDate && (r.status === "checked-in" || r.status === "upcoming" || r.status === "checked-out"));
      Object.keys(allRooms).forEach(rt => {
        (allRooms[rt] || []).forEach(rm => {
          const prevRi = prevItems[rm] || {};
          const prevCoRes = prevBoardingCheckedOut.find(r => r.room === rm);
          const prevActiveRes = prevBoardingToday.find(r => r.room === rm);
          const prevIsLastDay = prevActiveRes && prevActiveRes.checkOut === prevDate;
          const prevNeededDisinfect = !!prevCoRes || !!(prevActiveRes && prevIsLastDay);
          if (prevNeededDisinfect && !prevRi.disinfect) {
            missedMap[rm] = { missedDisinfect: true };
          }
        });
      });
    }

    // ─── Server-computed room data (primary source) ───
    const rcEntry = allOps.find(e => e.id === `ops_room_cleaning_${viewDate}`);
    const computedRooms = rcEntry?.computed_items?.rooms || [];
    const hasComputedData = computedRooms.length > 0;

    // ─── Compute stats from server data or client-side fallback ───
    let totalOccupied = 0, totalRefresh = 0, totalDisinfect = 0, doneRefresh = 0, doneDisinfect = 0;
    let totalSetups = 0, doneSetups = 0;

    if (hasComputedData) {
      // Use server-computed data
      totalOccupied = rcEntry?.computed_items?.summary?.totalOccupied || computedRooms.length;
      computedRooms.forEach(cr => {
        const ri = roomItems[cr.room] || {};
        if (cr.needsRefresh) { totalRefresh++; if (ri.refresh) doneRefresh++; }
        if (cr.needsDisinfect) { totalDisinfect++; if (ri.disinfect) doneDisinfect++; }
        if (cr.needsSetup) { totalSetups++; if (ri.setupDone) doneSetups++; }
      });
    } else {
      // Fallback: client-side computation
      Object.keys(allRooms).forEach(rt => {
        (allRooms[rt] || []).forEach(rm => {
          const ri = roomItems[rm] || {};
          const activeRes = boardingToday.find(r => r.room === rm);
          const coRes = boardingCheckedOut.find(r => r.room === rm);
          if (activeRes || coRes) totalOccupied++;
          const notFirst = activeRes && activeRes.checkIn < viewDate;
          const notLast = activeRes && activeRes.checkOut > viewDate;
          if (activeRes && notFirst && notLast) { totalRefresh++; if (ri.refresh) doneRefresh++; }
          if (coRes) { totalDisinfect++; if (ri.disinfect) doneDisinfect++; }
        });
      });
    }
    const totalNeeded = totalRefresh + totalDisinfect;
    const totalDone = doneRefresh + doneDisinfect;

    // ─── Group computed rooms by roomType for display ───
    const groupedRooms = {};
    if (hasComputedData) {
      computedRooms.forEach(cr => {
        const key = cr.roomType || cr.areaName || "Other";
        if (!groupedRooms[key]) groupedRooms[key] = [];
        groupedRooms[key].push(cr);
      });
    }

    // Count "as needed" items
    const asNeededCount = Object.values(roomItems).filter(ri => ri.asNeeded).length;
    const asNeededDoneCount = Object.values(roomItems).filter(ri => ri.asNeeded && ri.asNeededDone).length;

    const bowlSizeOptions = ["Small", "Medium", "Large"];
    const gridCols = "minmax(140px, 1.2fr) 1fr 1fr minmax(120px, 1fr) minmax(100px, auto)";

    // ─── Render a single room row (shared by both computed and fallback paths) ───
    const renderRoomRow = (rm, ri, crData, i, totalRows) => {
      const needsRefresh = crData ? crData.needsRefresh : false;
      const needsDisinfect = crData ? crData.needsDisinfect : false;
      const hasSetup = crData ? crData.needsSetup : false;
      const isOccupied = !!crData;
      const aDog = crData ? crData.dogName : null;
      const aOwner = crData ? crData.ownerLastName : null;
      const selectedBowl = ri.setupBowl || (crData?.suggestedBowlSize) || "";

      return (
        <div key={rm} style={{ display: "grid", gridTemplateColumns: gridCols, padding: "8px 12px", borderBottom: i < totalRows - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rm}</span>
            {isOccupied ? <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.pri, marginTop: 1 }}>{aDog}</div>
              {aOwner && <div style={{ fontSize: 10, color: C.textMut }}>{aOwner}</div>}
              {crData && crData.checkIn === viewDate && crData.checkOut !== viewDate && <div style={{ fontSize: 9, color: C.acc, fontWeight: 600, marginTop: 1 }}>Check-in day</div>}
              {crData && crData.checkOut === viewDate && crData.cleaningType !== "disinfect" && <div style={{ fontSize: 9, color: "#F59E0B", fontWeight: 600, marginTop: 1 }}>Checkout day</div>}
              {crData && crData.cleaningType === "disinfect" && <div style={{ fontSize: 9, color: C.dan, fontWeight: 600, marginTop: 1 }}>Checked out</div>}
              {needsRefresh && crData && <div style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>Day {crData.dayNumber} of {crData.totalNights}</div>}
              {missedMap[rm]?.missedDisinfect && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 2 }}>⚠ Full disinfect missed</div>}
            </div> : <div>
              {missedMap[rm]?.missedDisinfect ? <div>
                <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 1 }}>Vacant</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 2 }}>⚠ Full disinfect missed</div>
              </div> : <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 1 }}>Vacant</div>}
            </div>}
          </div>
          <div style={{ textAlign: "center" }}>
            {needsRefresh ? <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <input type="checkbox" checked={!!ri.refresh} disabled={isLocked} onChange={e => toggleItem(rm, "refresh", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.suc }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: ri.refresh ? C.suc : C.pri }}>{ri.refresh ? "Done" : "Required"}</span>
              </div>
              {ri.refresh && ri.refreshBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.refreshBy}</div>}
            </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            {needsDisinfect ? <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <input type="checkbox" checked={!!ri.disinfect} disabled={isLocked} onChange={e => toggleItem(rm, "disinfect", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.dan }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: ri.disinfect ? C.suc : C.dan }}>{ri.disinfect ? "Done" : "Required"}</span>
              </div>
              {ri.disinfect && ri.disinfectBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.disinfectBy}</div>}
            </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            {hasSetup ? <div>
              <div style={{ display: "inline-block", padding: "2px 6px", borderRadius: 4, background: "#14532D", color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "Outfit, sans-serif", marginBottom: 4 }}>{crData.setupReason}</div>
              <div style={{ fontSize: 10, color: C.textSec, marginBottom: 4 }}>
                {crData.dogWeight != null ? `${crData.dogWeight} lbs` : "No weight"} — {crData.suggestedBowlSize}
              </div>
              <select
                value={selectedBowl}
                disabled={isLocked}
                onChange={e => toggleItem(rm, "setupBowl", e.target.value)}
                style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: "Outfit, sans-serif", marginBottom: 4, width: "100%" }}
              >
                <option value="">Bowl size…</option>
                {bowlSizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <input type="checkbox" checked={!!ri.setupDone} disabled={isLocked} onChange={e => toggleItem(rm, "setupDone", e.target.checked)} style={{ width: 16, height: 16, accentColor: "#84CC16" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: ri.setupDone ? "#84CC16" : C.textMut }}>{ri.setupDone ? "Complete" : "Mark done"}</span>
              </div>
              {ri.setupDone && ri.setupDoneBy && <div style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{ri.setupDoneBy}</div>}
            </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <input type="checkbox" checked={!!ri.asNeeded} disabled={isLocked} onChange={e => toggleItem(rm, "asNeeded", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.acc }} />
                {ri.asNeeded && <input type="checkbox" checked={!!ri.asNeededDone} disabled={isLocked} onChange={e => toggleItem(rm, "asNeededDone", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.suc }} title="Mark done" />}
              </div>
              {ri.asNeeded && ri.asNeededBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.asNeededBy}</div>}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div>
        {/* Missed cleaning alert banner */}
        {Object.keys(missedMap).length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "rgba(220, 38, 38, 0.08)", border: "1.5px solid rgba(220, 38, 38, 0.25)", borderRadius: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>Missed Cleaning from {new Date(prevDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
            <div style={{ fontSize: 11, color: "#DC2626", opacity: 0.8 }}>
              {Object.values(missedMap).filter(m => m.missedDisinfect).length > 0 && `${Object.values(missedMap).filter(m => m.missedDisinfect).length} full disinfect${Object.values(missedMap).filter(m => m.missedDisinfect).length > 1 ? "s" : ""} missed`}
            </div>
          </div>
        </div>}
        {/* Summary bar */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{totalOccupied}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Rooms Occupied</span>
          </div>
          {totalRefresh > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{doneRefresh}/{totalRefresh}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Refreshes Done</span>
          </div>}
          {totalDisinfect > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.dan }}>{doneDisinfect}/{totalDisinfect}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Disinfects Done</span>
          </div>}
          {totalSetups > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#14532D" }}>{doneSetups}/{totalSetups}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Setups Done</span>
          </div>}
          {asNeededCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.acc }}>{asNeededDoneCount}/{asNeededCount}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>As Needed Done</span>
          </div>}
        </div>
        {totalNeeded > 0 && <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: totalNeeded ? `${(totalDone / totalNeeded) * 100}%` : "0%", height: "100%", background: totalDone === totalNeeded ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: totalDone === totalNeeded ? C.suc : C.text }}>{totalDone}/{totalNeeded}</span>
          </div>
        </div>}
        {/* ─── Server-computed room data (primary path) ─── */}
        {hasComputedData ? Object.keys(groupedRooms).map(rt => {
          const rooms = groupedRooms[rt];
          return (
            <div key={rt} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{rt} <Badge color="default" size="sm">{rooms.length} rooms</Badge></h3>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: `2px solid ${C.border}`, padding: "8px 12px", background: C.surfaceHover }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>ROOM</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>ROOM REFRESH</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>FULL DISINFECT</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#14532D", textAlign: "center" }}>SETUPS</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, textAlign: "center" }}>AS NEEDED</div>
                </div>
                {rooms.map((cr, i) => {
                  const ri = roomItems[cr.room] || {};
                  return renderRoomRow(cr.room, ri, cr, i, rooms.length);
                })}
              </Card>
            </div>
          );
        }) : /* ─── Fallback: client-side room data ─── */
        Object.keys(allRooms).map(rt => {
          const rooms = allRooms[rt] || [];
          if (!rooms.length) return null;
          const occupiedCount = rooms.filter(rm => boardingToday.find(r => r.room === rm) || boardingCheckedOut.find(r => r.room === rm)).length;
          return (
            <div key={rt} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{rt} <Badge color="default" size="sm">{occupiedCount}/{rooms.length} occupied</Badge></h3>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: `2px solid ${C.border}`, padding: "8px 12px", background: C.surfaceHover }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>ROOM</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>ROOM REFRESH</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>FULL DISINFECT</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#14532D", textAlign: "center" }}>SETUPS</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, textAlign: "center" }}>AS NEEDED</div>
                </div>
                {rooms.map((rm, i) => {
                  const ri = roomItems[rm] || {};
                  return renderRoomRow(rm, ri, null, i, rooms.length);
                })}
              </Card>
            </div>
          );
        })}
        {!hasComputedData && !Object.values(allRooms).some(r => r.length > 0) && <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No rooms configured. Add rooms in Settings → Rooms.</div></Card>}
        {hasComputedData && computedRooms.length === 0 && <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No occupied rooms today.</div></Card>}
      </div>
    );
  };



  // ─── Private Play ───
  const [ppEditTimePopover, setPpEditTimePopover] = useState(null); // { dogId, si }
  const ppNowTime = () => { const n = new Date(); return n.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };

  const ppToggleUD = (dogId, si, field, val, ses) => {
    if (isLocked) return;
    const ppName = profile?.full_name || "";
    const nSes = [...ses];
    const cur = nSes[si];
    const autoTime = ppNowTime();
    // When checking U or D: auto-fill time if empty, record originalTime, set completedBy
    if (val === true) {
      const timeToSet = cur.time || autoTime;
      nSes[si] = { ...cur, [field]: val, time: timeToSet, originalTime: cur.originalTime || timeToSet, completedBy: ppName, timeEdited: false };
    } else {
      // Unchecking: keep time if other checkbox is still checked, else clear
      const otherField = field === "urinate" ? "defecate" : "urinate";
      if (!cur[otherField]) {
        nSes[si] = { ...cur, [field]: val, time: "", originalTime: "", completedBy: "", timeEdited: false };
      } else {
        nSes[si] = { ...cur, [field]: val };
      }
    }
    setItems(prev => ({ ...prev, [dogId]: { sessions: nSes } }));
    setDirty(true);
  };

  const ppEditTime = (dogId, si, newTime, ses) => {
    if (isLocked) return;
    const nSes = [...ses];
    const cur = nSes[si];
    nSes[si] = { ...cur, time: newTime, timeEdited: newTime !== (cur.originalTime || "") };
    setItems(prev => ({ ...prev, [dogId]: { sessions: nSes } }));
    setDirty(true);
  };

  const renderPP = () => {
    const dogs = ppReservations;
    const ppItems = items;
    const sesLabels = ["Session 1", "Session 2", "Session 3", "Session 4", "Session 5"];
    const isRequired = (si) => si < 3;
    // Progress: 3 required sessions per dog
    const totalRequired = dogs.length * 3;
    let completedRequired = 0;
    dogs.forEach(r => {
      const dogData = ppItems[r.dogId] || {};
      const ses = dogData.sessions || [];
      ses.forEach((s, si) => { if (si < 3 && (s.time || s.urinate || s.defecate)) completedRequired++; });
    });
    const ppPct = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;
    return (
      <div>
        {/* Progress bar */}
        {dogs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${ppPct}%`, height: "100%", background: ppPct === 100 ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: ppPct === 100 ? C.suc : C.text }}>{completedRequired}/{totalRequired} required</span>
          </div>
        )}
        {dogs.length === 0 ? <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No private play dogs checked in today.</div></Card> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.surface, borderRadius: 12, overflow: "hidden" }}>
              <thead>
                <tr style={{ background: C.surfaceHover }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>DOG</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>ROOM</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>SOURCE</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>OWNER</th>
                  {sesLabels.map((s, si) => (
                    <th key={si} colSpan={3} style={{ padding: "10px 6px", textAlign: "center", fontWeight: isRequired(si) ? 800 : 500, color: isRequired(si) ? C.pri : C.textMut, fontSize: 11, borderBottom: `2px solid ${isRequired(si) ? C.pri : C.border}`, borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt : C.surfaceHover }}>
                      {s}{isRequired(si) ? <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, marginLeft: 4, textTransform: "uppercase" }}>REQ</span> : <span style={{ fontSize: 9, fontWeight: 500, color: C.textMut, marginLeft: 4, fontStyle: "italic" }}>extra</span>}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: C.surfaceHover }}>
                  <th /><th /><th /><th />
                  {sesLabels.map((_, si) => (
                    <React.Fragment key={si}>
                      <th style={{ padding: "4px 4px", fontSize: 10, color: C.textMut, fontWeight: 600, textAlign: "center", borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt : "transparent" }}>Time</th>
                      <th style={{ padding: "4px 4px", fontSize: 10, color: C.textMut, fontWeight: 600, textAlign: "center", background: isRequired(si) ? C.priLt : "transparent" }}>U</th>
                      <th style={{ padding: "4px 4px", fontSize: 10, color: C.textMut, fontWeight: 600, textAlign: "center", background: isRequired(si) ? C.priLt : "transparent" }}>D</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dogs.map((r, ri) => {
                  const d = getDog(r.dogId);
                  const dogData = ppItems[r.dogId] || { sessions: Array.from({ length: 5 }, () => ({ time: "", urinate: false, defecate: false })) };
                  const ses = dogData.sessions || Array.from({ length: 5 }, () => ({ time: "", urinate: false, defecate: false }));
                  return (
                    <tr key={r.id} style={{ borderBottom: ri < dogs.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: C.text }}>{d ? d.fields.name : "?"}</td>
                      <td style={{ padding: "8px 12px", color: C.pri, fontWeight: 700, fontSize: 11 }}>{resolveRoomDisplay(r.room).display}</td>
                      <td style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, color: r._ppSource === "Day Boarding" ? C.acc : r._ppSource === "Day Boarding + Add-On" ? C.warn : C.pri }}>
                        <span style={{ padding: "2px 7px", borderRadius: 6, background: r._ppSource === "Day Boarding" ? C.acc + "18" : r._ppSource === "Day Boarding + Add-On" ? C.warn + "18" : C.priLt, whiteSpace: "nowrap" }}>{r._ppSource}</span>
                      </td>
                      <td style={{ padding: "8px 12px", color: C.textSec, fontSize: 11 }}>{ownerName(r.clientId)}</td>
                      {ses.map((s, si) => {
                        const isEditingTime = ppEditTimePopover && ppEditTimePopover.dogId === r.dogId && ppEditTimePopover.si === si;
                        return (
                        <React.Fragment key={si}>
                          <td style={{ padding: "4px 2px", borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt + "80" : "transparent", verticalAlign: "top" }}>
                            {isEditingTime ? (
                              <input type="text" autoFocus defaultValue={s.time} onBlur={e => { ppEditTime(r.dogId, si, e.target.value, ses); setPpEditTimePopover(null); }} onKeyDown={e => { if (e.key === "Enter") { ppEditTime(r.dogId, si, e.target.value, ses); setPpEditTimePopover(null); } }} style={{ width: 56, textAlign: "center", border: `1.5px solid ${C.pri}`, borderRadius: 4, padding: "3px 0", fontSize: 11, fontFamily: "inherit", background: "#fff", outline: "none" }} />
                            ) : (
                              <div onClick={() => { if (!isLocked && s.time) setPpEditTimePopover({ dogId: r.dogId, si }); }} style={{ cursor: s.time && !isLocked ? "pointer" : "default", textAlign: "center" }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: s.time ? C.text : C.textMut, padding: "3px 0" }}>{s.time || "—"}</div>
                              </div>
                            )}
                            {s.timeEdited && <div style={{ fontSize: 8, color: C.warn, textAlign: "center", fontWeight: 700, cursor: "pointer" }} title={`Originally: ${s.originalTime}`}>edited</div>}
                            {s.completedBy && s.time && !s.timeEdited && <div style={{ fontSize: 9, color: C.textMut, textAlign: "center", marginTop: 1 }}>{s.completedBy}</div>}
                            {s.completedBy && s.time && s.timeEdited && <div style={{ fontSize: 9, color: C.textMut, textAlign: "center" }}>{s.completedBy}</div>}
                          </td>
                          <td style={{ padding: "4px 2px", textAlign: "center", background: isRequired(si) ? C.priLt + "80" : "transparent" }}>
                            <input type="checkbox" checked={!!s.urinate} disabled={isLocked} onChange={e => ppToggleUD(r.dogId, si, "urinate", e.target.checked, ses)} style={{ width: 16, height: 16, accentColor: C.pri }} />
                          </td>
                          <td style={{ padding: "4px 2px", textAlign: "center", background: isRequired(si) ? C.priLt + "80" : "transparent" }}>
                            <input type="checkbox" checked={!!s.defecate} disabled={isLocked} onChange={e => ppToggleUD(r.dogId, si, "defecate", e.target.checked, ses)} style={{ width: 16, height: 16, accentColor: C.acc }} />
                          </td>
                        </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };




  // ─── Room Display Helper: resolve room_assignment to a clean display label ──
  // Handles room names like "DC1", "SC5", "Luxury Suite 101", "Double Compartment DC1", etc.
  // Returns { display: "DC1", roomType: "Double Compartment" } or { display: "101", roomType: "Luxury Suite" }
  const resolveRoomDisplay = (room) => {
    if (!room) return { display: "—", roomType: null };
    const r = room.trim();
    // If room is a short code like "DC1", "SC5", keep it as-is
    if (/^[A-Z]{1,3}\d+[A-Za-z]?$/.test(r)) return { display: r, roomType: r.startsWith("DC") ? "Double Compartment" : r.startsWith("SC") ? "Single Compartment" : null };
    // If room is a full name like "Double Compartment DC1" or "Luxury Suite 101", extract the identifier
    const match = r.match(/(?:Luxury Suite|Executive Room|Double Compartment|Single Compartment)\s+(.+)/i);
    if (match) {
      const id = match[1].trim();
      const roomType = r.toLowerCase().includes("luxury") ? "Luxury Suite"
        : r.toLowerCase().includes("executive") ? "Executive Room"
        : r.toLowerCase().includes("double") ? "Double Compartment"
        : r.toLowerCase().includes("single") ? "Single Compartment" : null;
      return { display: id, roomType };
    }
    // If room is a number-like value (e.g. "101", "5A"), return as-is
    if (/^\d+[A-Za-z]?$/.test(r)) return { display: r, roomType: null };
    // Fallback: return the whole room name
    return { display: r, roomType: null };
  };

  // ─── Service Helper: extract service names from _services (handles both formats) ──
  const getSvcNames = (svcs) => {
    if (!svcs) return [];
    const arr = Array.isArray(svcs) ? svcs : [];
    return arr.map(s => typeof s === "string" ? s : (s && s.name ? s.name : "")).filter(Boolean);
  };
  const hasSvc = (svcs, name) => getSvcNames(svcs).some(n => n.toLowerCase() === name.toLowerCase());
  const hasSvcIncludes = (svcs, partial) => getSvcNames(svcs).some(n => n.toLowerCase().includes(partial.toLowerCase()));

  // ─── Bathing Report (auto-pulled from Gingr) ───────────────────────────────
  const [bathTypeMap, setBathTypeMap] = useState({});
  const [bathTypeLoading, setBathTypeLoading] = useState(false);
  const [bathCompleted, setBathCompleted] = useState({});

  // Load bath completions from Supabase
  useEffect(() => {
    if (sub !== "bathing" || !profile?.location_id) return;
    const entryId = `ops_bathing_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", entryId)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setBathCompleted(rows[0].setting_value);
        } else {
          setBathCompleted({});
        }
      });
  }, [sub, viewDate, profile?.location_id]);

  // Auto-fetch bath types from Gingr existing_reservation_estimate
  useEffect(() => {
    if (sub !== "bathing") return;
    const reservations = data.reservations || [];
    // Only show dogs whose reservation END DATE equals the view date
    const endingToday = reservations.filter(r =>
      (r.status === "checked-in" || r.status === "upcoming") &&
      r.checkOut === viewDate
    );
    const bathRes = endingToday.filter(r => hasSvc(r._services, "Bath"));
    if (bathRes.length === 0) return;

    const needsFetch = bathRes.filter(r => !bathTypeMap[r.id]);
    if (needsFetch.length === 0) return;

    setBathTypeLoading(true);
    const locationId = profile?.location_id;
    if (!locationId) { setBathTypeLoading(false); return; }

    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "gingr_config")
      .limit(1)
      .then(async ({ data: cfgRows }) => {
        if (!cfgRows || cfgRows.length === 0) { setBathTypeLoading(false); return; }
        const cfg = cfgRows[0].setting_value;
        const subdomain = cfg.subdomain;
        const apiKey = cfg.api_key;
        if (!subdomain || !apiKey) { setBathTypeLoading(false); return; }

        const BATH_ADDON_MAP = {
          38: "Premium", 39: "Hypoallergenic - NO SPRAY",
          79: "Hypoallergenic - WITH SPRAY", 40: "Medicated",
          75: "Whitening", 76: "Shampoo From Home",
        };

        const newMap = { ...bathTypeMap };
        for (let i = 0; i < needsFetch.length; i += 5) {
          const batch = needsFetch.slice(i, i + 5);
          await Promise.all(batch.map(async (res) => {
            try {
              const gingrId = String(res.gingrId || "").replace(/^g/, "");
              if (!gingrId) { newMap[res.id] = "Premium"; return; }
              const resp = await fetch(
                `https://${subdomain}.gingrapp.com/api/v1/existing_reservation_estimate?key=${apiKey}&id=${gingrId}`
              );
              const json = await resp.json();
              if (json.error) { newMap[res.id] = "Premium"; return; }
              const resSvcs = json.data?.reservations?.[0]?.reservation_services || [];
              let foundBathType = null;
              for (const svc of resSvcs) {
                const sid = parseInt(svc.s_id);
                if (BATH_ADDON_MAP[sid]) { foundBathType = BATH_ADDON_MAP[sid]; break; }
              }
              newMap[res.id] = foundBathType || "Premium";
            } catch (err) {
              console.error("Failed to fetch bath type for", res.id, err);
              newMap[res.id] = "Premium";
            }
          }));
        }
        setBathTypeMap(newMap);
        setBathTypeLoading(false);
      });
  }, [sub, viewDate, data.reservations, profile?.location_id]);

  const saveBathCompleted = async (newCompleted) => {
    setBathCompleted(newCompleted);
    if (!profile?.location_id) return;
    const entryId = `ops_bathing_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
  };

  const renderBathing = () => {
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    // Show ALL dogs with bath service SCHEDULED for the view date (matches mobile "Scheduled At" view).
    // This includes dogs who have already departed — they appear dimmed with a "Departed" label.
    // Previously filtered by checkOut date + checked-in status, which dropped dogs after checkout.
    const withBathToday = reservations.filter(res => {
      if (res.status === "cancelled") return false;
      if (!hasSvc(res._services, "Bath")) return false;
      // Check if any bath service has scheduled_at on the view date
      const svcs = Array.isArray(res._services) ? res._services : [];
      return svcs.some(s => {
        const name = typeof s === "string" ? s : (s?.name || "");
        if (!name.toLowerCase().includes("bath")) return false;
        const schedAt = s?.scheduled_at || "";
        return schedAt.includes(viewDate);
      });
    });
    const bathRows = [];
    withBathToday.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      const dogName = dog?.fields?.name || res._animalName || "Unknown";
      const roomInfo = resolveRoomDisplay(res.room);
      let roomNum = roomInfo.display;
      let roomType = roomInfo.roomType;
      // Fallback: if no room assigned, derive room type from reservation type name
      if (roomNum === "—" && res._resTypeName) {
        const rtn = res._resTypeName.toLowerCase();
        if (rtn.includes("luxury")) { roomNum = "LS"; roomType = "Luxury Suite"; }
        else if (rtn.includes("executive")) { roomNum = "ER"; roomType = "Executive Room"; }
        else if (rtn.includes("double")) { roomNum = "DC"; roomType = "Double Compartment"; }
        else if (rtn.includes("single")) { roomNum = "SC"; roomType = "Single Compartment"; }
      }
      const bathType = bathTypeMap[res.id] || (bathTypeLoading ? "Loading…" : "Premium");
      const rawCoTime = res.scheduledCheckOutTime || res.checkOutTime || "";
      const coTime = rawCoTime ? formatTime12hr(rawCoTime) : "—";
      const completedInfo = bathCompleted[res.id];
      const isDone = !!completedInfo;
      const isDeparted = res.status === "checked-out";
      // Get the bath scheduled time
      const svcs = Array.isArray(res._services) ? res._services : [];
      const bathSvc = svcs.find(s => typeof s === "object" && s?.name?.toLowerCase().includes("bath") && (s.scheduled_at || "").includes(viewDate));
      const schedAt = bathSvc?.scheduled_at || "";
      const schedTime = schedAt ? formatTime12hr(schedAt.split("T")[1]?.slice(0, 5) || "") : "—";
      bathRows.push({ resId: res.id, dogName, roomNum, bathType, coTime, isDone, completedInfo, resType: res.type, isDeparted, schedTime, roomType });
    });
    bathRows.sort((a, b) => (a.roomNum || "").localeCompare(b.roomNum || "", undefined, { numeric: true }));

    const totalBaths = bathRows.length;
    const doneBaths = bathRows.filter(r => r.isDone).length;

    const toggleBath = (resId) => {
      const newCompleted = { ...bathCompleted };
      if (newCompleted[resId]) { delete newCompleted[resId]; }
      else { newCompleted[resId] = { by: profile?.name || profile?.email || "Staff", at: new Date().toISOString() }; }
      saveBathCompleted(newCompleted);
    };

    // Show pulsing dog logo loading state while fetching bath types
    if (bathTypeLoading && totalBaths === 0) {
      return (
        <div>
          <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>Bathing Report</span>
          </Card>
          <Card style={{ padding: "48px 20px", textAlign: "center" }}>
            <K9LoadingAnimation size={64} message="Loading bathing report…" subMessage="Fetching bath types from Gingr" />
          </Card>
        </div>
      );
    }

    const getBathBadgeStyle = (type) => {
      const styles = {
        "Loading…": { background: "#F3F4F6", color: "#9CA3AF" },
        "Premium": { background: "#DBEAFE", color: "#1D4ED8" },
        "Medicated": { background: "#FEE2E2", color: "#DC2626" },
        "Whitening": { background: "#F3E8FF", color: "#7C3AED" },
        "Shampoo From Home": { background: "#ECFDF5", color: "#059669" },
      };
      if (type.includes("Hypoallergenic")) return { background: "#FEF3C7", color: "#D97706" };
      return styles[type] || { background: "#F3F4F6", color: "#6B7280" };
    };

    const thStyle = { textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em", fontFamily: "inherit" };
    const thCenterStyle = { ...thStyle, textAlign: "center" };

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>Bathing Report</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec, fontFamily: "inherit" }}>{doneBaths}/{totalBaths} complete</span>
            </div>
            {bathTypeLoading && <span style={{ fontSize: 12, color: C.pri, fontWeight: 600, fontFamily: "inherit" }}>Fetching bath types…</span>}
          </div>
          {totalBaths > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((doneBaths / totalBaths) * 100)}%`, height: "100%", borderRadius: 3, background: doneBaths === totalBaths ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        {totalBaths === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut, fontFamily: "inherit" }}>No baths scheduled for {isToday ? "today" : fmtDate(viewDate)}</div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "inherit" }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                    <th style={thStyle}>DOG</th>
                    <th style={thCenterStyle}>ROOM</th>
                    <th style={thStyle}>BATH TYPE</th>
                    <th style={thCenterStyle}>SCHEDULED</th>
                    <th style={thCenterStyle}>CHECKOUT</th>
                    <th style={thCenterStyle}>DONE</th>
                  </tr>
                </thead>
                <tbody>
                  {bathRows.map((row, i) => {
                    const badgeStyle = getBathBadgeStyle(row.bathType);
                    return (
                      <tr key={row.resId} style={{
                        borderBottom: i < bathRows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                        background: row.isDone ? "#F0FDF4" : row.isDeparted ? "#FAFAFA" : "transparent",
                        opacity: row.isDeparted && !row.isDone ? 0.55 : 1,
                        transition: "background 0.2s",
                      }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {row.dogName}
                            {row.isDeparted && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#FEE2E2", color: "#DC2626" }}>Departed</span>}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.pri, fontFamily: "inherit" }}>
                          {row.roomNum}
                          {row.roomType === "Double Compartment" && <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, marginTop: 1 }}>Double</div>}
                        </td>
                        <td style={{ padding: "12px 14px", color: C.text }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                            ...badgeStyle,
                          }}>
                            {row.bathType}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: C.pri, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>{row.schedTime}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: C.textSec, fontSize: 12, fontFamily: "inherit" }}>{row.coTime}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <button onClick={() => toggleBath(row.resId)} style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: row.isDone ? "2px solid #10B981" : `2px solid ${C.border}`,
                            background: row.isDone ? "#10B981" : "transparent",
                            cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: row.isDone ? "#fff" : "transparent",
                            fontSize: 14, fontWeight: 700, transition: "all 0.15s", fontFamily: "inherit",
                          }}>
                            {row.isDone ? "✓" : ""}
                          </button>
                          {row.isDone && row.completedInfo && (
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2, fontFamily: "inherit" }}>
                              {row.completedInfo.by} · {new Date(row.completedInfo.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  };

  // ─── Pamper Package Plus Report ─────────────────────────────────────────────
  const [pamperCompleted, setPamperCompleted] = useState({});

  useEffect(() => {
    if (sub !== "pamper" || !profile?.location_id) return;
    const entryId = `ops_pamper_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", entryId)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setPamperCompleted(rows[0].setting_value);
        } else {
          setPamperCompleted({});
        }
      });
  }, [sub, viewDate, profile?.location_id]);

  const savePamperCompleted = async (newCompleted) => {
    setPamperCompleted(newCompleted);
    if (!profile?.location_id) return;
    const entryId = `ops_pamper_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
  };

  const renderPamper = () => {
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    const inHouse = reservations.filter(r =>
      r.type === "boarding" && (r.status === "checked-in" || r.status === "upcoming") &&
      r.checkIn <= viewDate && r.checkOut >= viewDate
    );

    const pamperRows = [];
    const seenDogs = new Set();
    inHouse.forEach(res => {
      if (seenDogs.has(res.dogId)) return;
      const isLuxurySuite = res._resTypeId == 5 || (res._resTypeName || "").toLowerCase().includes("luxury suite");
      const hasPPAddon = hasSvcIncludes(res._services, "pamper");

      if (!isLuxurySuite && !hasPPAddon) return;
      seenDogs.add(res.dogId);

      const dog = dogs.find(d => d.id === res.dogId);
      const dogName = dog?.fields?.name || res._animalName || "Unknown";
      const roomInfo = resolveRoomDisplay(res.room);
      let roomNum = roomInfo.display;
      let roomType = roomInfo.roomType;
      // Fallback: if no room assigned, derive room type from reservation type name
      if (roomNum === "—" && res._resTypeName) {
        const rtn = res._resTypeName.toLowerCase();
        if (rtn.includes("luxury")) { roomNum = "LS"; roomType = "Luxury Suite"; }
        else if (rtn.includes("executive")) { roomNum = "ER"; roomType = "Executive Room"; }
        else if (rtn.includes("double")) { roomNum = "DC"; roomType = "Double Compartment"; }
        else if (rtn.includes("single")) { roomNum = "SC"; roomType = "Single Compartment"; }
      }
      const ownerName = res._ownerName || "Unknown";
      const source = isLuxurySuite ? (hasPPAddon ? "Luxury Suite + Add-On" : "Luxury Suite") : "Add-On";
      const completedInfo = pamperCompleted[res.id];
      const isDone = !!completedInfo;
      pamperRows.push({ resId: res.id, dogName, roomNum, ownerName, source, isDone, completedInfo, roomType });
    });
    pamperRows.sort((a, b) => (a.roomNum || "").localeCompare(b.roomNum || "", undefined, { numeric: true }));

    // Group by room for display
    const roomGroups = {};
    pamperRows.forEach(row => {
      if (!roomGroups[row.roomNum]) roomGroups[row.roomNum] = [];
      roomGroups[row.roomNum].push(row);
    });

    const totalPamper = pamperRows.length;
    const donePamper = pamperRows.filter(r => r.isDone).length;

    const togglePamper = (resId) => {
      const newCompleted = { ...pamperCompleted };
      if (newCompleted[resId]) { delete newCompleted[resId]; }
      else { newCompleted[resId] = { by: profile?.name || profile?.email || "Staff", at: new Date().toISOString() }; }
      savePamperCompleted(newCompleted);
    };

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Pamper Package Plus</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{donePamper}/{totalPamper} complete</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>Luxury Suite dogs (automatic) + Pamper Package add-on dogs</div>
          {totalPamper > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${totalPamper > 0 ? Math.round((donePamper / totalPamper) * 100) : 0}%`, height: "100%", borderRadius: 3, background: donePamper === totalPamper ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        {totalPamper === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut }}>No Pamper Package dogs for today</div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>DOG</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>ROOM</th>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>OWNER</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>SOURCE</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>COMPLETED</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(roomGroups).map(([roomNum, groupRows], gi) => (
                    groupRows.map((row, ri) => (
                      <tr key={row.resId} style={{
                        borderBottom: (gi < Object.keys(roomGroups).length - 1 || ri < groupRows.length - 1) ? `1px solid ${C.borderLight}` : "none",
                        background: row.isDone ? "#F0FDF4" : "transparent",
                        transition: "background 0.2s",
                      }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text }}>{row.dogName}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.pri }}>
                          {ri === 0 ? row.roomNum : ""}
                          {ri === 0 && row.roomType === "Double Compartment" && <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, marginTop: 1 }}>Double</div>}
                        </td>
                        <td style={{ padding: "12px 14px", color: C.textSec }}>{row.ownerName}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: row.source.includes("Luxury") ? "#EDE9FE" : "#DBEAFE",
                            color: row.source.includes("Luxury") ? "#7C3AED" : "#1D4ED8",
                          }}>
                            {row.source}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <button onClick={() => togglePamper(row.resId)} style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: row.isDone ? "2px solid #10B981" : `2px solid ${C.border}`,
                            background: row.isDone ? "#10B981" : "transparent",
                            cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: row.isDone ? "#fff" : "transparent",
                            fontSize: 14, fontWeight: 700, transition: "all 0.15s",
                          }}>
                            {row.isDone ? "✓" : ""}
                          </button>
                          {row.isDone && row.completedInfo && (
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                              {row.completedInfo.by} · {new Date(row.completedInfo.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  };

  // ─── Generic Service Report ─────────────────────────────────────────────────
  const [genericSvcCompleted, setGenericSvcCompleted] = useState({});
  const svcName = typeof params === "object" ? params.svcName : null;

  useEffect(() => {
    if (!sub?.startsWith?.("svc") || !svcName || !profile?.location_id) return;
    const entryId = `ops_svc_${svcName.replace(/[^a-zA-Z0-9]/g, "_")}_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", entryId)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setGenericSvcCompleted(rows[0].setting_value);
        } else {
          setGenericSvcCompleted({});
        }
      });
  }, [sub, svcName, viewDate, profile?.location_id]);

  const saveGenericSvcCompleted = async (newCompleted) => {
    setGenericSvcCompleted(newCompleted);
    if (!profile?.location_id || !svcName) return;
    const entryId = `ops_svc_${svcName.replace(/[^a-zA-Z0-9]/g, "_")}_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
  };

  const renderGenericService = () => {
    if (!svcName) return <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown service</div></Card>;

    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    const inHouse = reservations.filter(r =>
      (r.status === "checked-in" || r.status === "upcoming") &&
      r.checkIn <= viewDate && r.checkOut >= viewDate
    );
    const svcRows = [];
    inHouse.forEach(res => {
      const names = getSvcNames(res._services);
      const matchCount = names.filter(n => n === svcName).length;
      if (matchCount === 0) return;

      const dog = dogs.find(d => d.id === res.dogId);
      const dogName = dog?.fields?.name || res._animalName || "Unknown";
      const roomInfo = resolveRoomDisplay(res.room);
      let roomNum = roomInfo.display;
      let roomType = roomInfo.roomType;
      // Fallback: if no room assigned, derive room type from reservation type name
      if (roomNum === "—" && res._resTypeName) {
        const rtn = res._resTypeName.toLowerCase();
        if (rtn.includes("luxury")) { roomNum = "LS"; roomType = "Luxury Suite"; }
        else if (rtn.includes("executive")) { roomNum = "ER"; roomType = "Executive Room"; }
        else if (rtn.includes("double")) { roomNum = "DC"; roomType = "Double Compartment"; }
        else if (rtn.includes("single")) { roomNum = "SC"; roomType = "Single Compartment"; }
      }
      const ownerName = res._ownerName || "Unknown";
      const completedInfo = genericSvcCompleted[res.id];
      const isDone = !!completedInfo;
      svcRows.push({ resId: res.id, dogName, roomNum, ownerName, isDone, completedInfo, matchCount, resType: res.type, roomType, checkIn: res.checkIn, checkOut: res.checkOut });
    });
    svcRows.sort((a, b) => (a.roomNum || "").localeCompare(b.roomNum || "", undefined, { numeric: true }));

    const total = svcRows.length;
    const done = svcRows.filter(r => r.isDone).length;

    const toggleSvc = (resId) => {
      const newCompleted = { ...genericSvcCompleted };
      if (newCompleted[resId]) { delete newCompleted[resId]; }
      else { newCompleted[resId] = { by: profile?.name || profile?.email || "Staff", at: new Date().toISOString() }; }
      saveGenericSvcCompleted(newCompleted);
    };

    // Determine service-specific column visibility
    const svcLower = svcName.toLowerCase();
    const isEnrichment = svcLower.includes("enrichment");
    const isIceCream = svcLower.includes("ice cream") || svcLower.includes("gourmet");
    const showQty = !isEnrichment; // Enrichment doesn't need quantity
    const showDates = isIceCream; // Ice cream needs check-in/check-out dates

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{svcName}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{done}/{total} complete</span>
          </div>
          {total > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%`, height: "100%", borderRadius: 3, background: done === total ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        {total === 0 ? (
          <Card style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>&#128054;</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>No dogs scheduled</div>
            <div style={{ fontSize: 13, color: C.textMut }}>No dogs with {svcName} today</div>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>DOG</th>
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>ROOM</th>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>OWNER</th>
                    {showDates && <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>CHECK-IN</th>}
                    {showDates && <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>CHECK-OUT</th>}
                    {showQty && <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>QTY</th>}
                    <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: C.textMut, fontSize: 11, letterSpacing: "0.04em" }}>COMPLETED</th>
                  </tr>
                </thead>
                <tbody>
                  {svcRows.map((row, i) => (
                    <tr key={row.resId} style={{
                      borderBottom: i < svcRows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                      background: row.isDone ? "#F0FDF4" : "transparent",
                      transition: "background 0.2s",
                    }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text }}>
                        {row.dogName}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.pri }}>
                        {row.roomNum}
                        {row.roomType === "Double Compartment" && <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, marginTop: 1 }}>Double</div>}
                      </td>
                      <td style={{ padding: "12px 14px", color: C.textSec }}>{row.ownerName}</td>
                      {showDates && <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 12, color: C.textSec }}>{row.checkIn ? fmtDateShort(row.checkIn) : "—"}</td>}
                      {showDates && <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 12, color: C.textSec }}>{row.checkOut ? fmtDateShort(row.checkOut) : "—"}</td>}
                      {showQty && <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.text }}>{row.matchCount > 1 ? `×${row.matchCount}` : "—"}</td>}
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <button onClick={() => toggleSvc(row.resId)} style={{
                          width: 28, height: 28, borderRadius: 8,
                          border: row.isDone ? "2px solid #10B981" : `2px solid ${C.border}`,
                          background: row.isDone ? "#10B981" : "transparent",
                          cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: row.isDone ? "#fff" : "transparent",
                          fontSize: 14, fontWeight: 700, transition: "all 0.15s",
                        }}>
                          {row.isDone ? "✓" : ""}
                        </button>
                        {row.isDone && row.completedInfo && (
                          <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                            {row.completedInfo.by} · {new Date(row.completedInfo.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={() => nav("ops-hub")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>← Operations</button>
      {renderDateNav()}
      {showHistory && existing && (
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Edit History</div>
          {(existing.history || []).length === 0
            ? <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No history recorded yet</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(existing.history || []).map((h, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.textSec }}>
                    <span style={{ fontWeight: 600, color: C.textMut }}>{new Date(h.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(h.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    {" — "}{h.action.charAt(0).toUpperCase() + h.action.slice(1)}
                  </div>
                ))}
              </div>}
        </Card>
      )}
      {isTemplate ? renderTemplateChecklist()
        : sub === "room_cleaning" ? renderRoomCleaning()
        : sub === "pp" ? renderPP()
        : sub === "bathing" ? renderBathing()
        : sub === "pamper" ? renderPamper()
        : sub === "svc" ? renderGenericService()
        : <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown checklist type</div></Card>}
      {dirty && !isLocked && <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", marginTop: 20 }}>
        <Btn onClick={saveEntry} style={{ padding: "10px 40px", fontSize: 14 }}>Save Changes</Btn>
      </div>}

      {/* Template Editor Modal */}
      {showTemplateEditor && editTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto", padding: "24px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Customize {meta.title}</h2>
              <button onClick={() => setShowTemplateEditor(false)} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0, fontSize: 16 }}>{"✕"}</button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec }}>Add, remove, reorder tasks. Changes affect all future checklists for this location.</p>
            {customTemplate && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#DBEAFE", marginBottom: 12, fontSize: 12, color: "#1D4ED8", fontWeight: 600 }}>CUSTOMIZED — this checklist has been modified from the default template.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {editTemplate.map((task, idx) => (
                <div key={task.id || idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.bg, border: `1.5px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, color: C.textMut, fontWeight: 700, minWidth: 24 }}>{idx + 1}</span>
                  <input value={task.label} onChange={e => updateTemplateSec(idx, "label", e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit" }} />
                  {meta.showTime && <input value={task.time || ""} onChange={e => updateTemplateSec(idx, "time", e.target.value)} placeholder="HH:MM" style={{ width: 70, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit", textAlign: "center" }} />}
                  <button onClick={() => moveTemplateSec(idx, -1)} disabled={idx === 0} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === 0 ? C.textMut : C.text, fontSize: 12, cursor: idx === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === 0 ? 0.4 : 1 }}>{"↑"}</button>
                  <button onClick={() => moveTemplateSec(idx, 1)} disabled={idx === editTemplate.length - 1} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === editTemplate.length - 1 ? C.textMut : C.text, fontSize: 12, cursor: idx === editTemplate.length - 1 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === editTemplate.length - 1 ? 0.4 : 1 }}>{"↓"}</button>
                  <button onClick={() => removeTemplateSec(idx)} style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{"✕"}</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="secondary" size="sm" onClick={addTemplateSec}>+ Add Task</Btn>
              <div style={{ flex: 1 }} />
              <button onClick={resetTemplateToDefault} disabled={templateSaving} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reset to Default</button>
              <Btn onClick={saveTemplateToDb} disabled={!templateDirty || templateSaving}>{templateSaving ? "Saving…" : "Save Template"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Client Detail Page ────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// DOG DETAIL PAGE
// ════════════════════════════════════════════════════════════════════════════

export default DailyOpsPage;

// K9 Operations — DailyOpsPage
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getCollarsStats, getLodgingTransferStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

const K9Check = ({ checked, disabled, onChange, color = C.pri, size = 18 }) => (
  <div onClick={disabled ? undefined : () => onChange({ target: { checked: !checked } })}
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

function DailyOpsPage({ data, save, sub, nav, profile, addGlobalToast, params }) {
  const td = todayStr();
  // Belongings + Collars default to tomorrow (prep for next day)
  const [viewDate, setViewDate] = useState(() => (sub === "belongings" || sub === "collars") ? addDays(td, 1) : td);

  const [rcFilter, setRcFilter] = useState("all"); // all | incomplete | setup | refresh | disinfect | asNeeded
  const [recentlyCompleted, setRecentlyCompleted] = useState(new Set()); // room keys with grace period
  const roomCleaningOnDemandAttemptRef = useRef(new Set());
  const dayIdx = new Date(viewDate + "T12:00:00").getDay();
  const meta = OPS_TYPES[sub] || OPS_TYPES.opening;
  const isTemplate = !!meta.key;

  // Date nav helpers
  // Room cleaning cannot go past today — BOH API only provides room data for currently in-house dogs
  const shiftDate = (d) => {
    const dt = new Date(viewDate + "T12:00:00");
    dt.setDate(dt.getDate() + d);
    const newDate = dt.toISOString().slice(0,10);
    if (sub === "room_cleaning" && newDate > td) return;
    setViewDate(newDate);
  };
  const isToday = viewDate === td;
  const isPast = viewDate < td;
  const canGoForward = sub !== "room_cleaning" || viewDate < td;
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

  // Carry-over setting
  const [carryOverEnabled, setCarryOverEnabled] = useState(false);
  useEffect(() => {
    if (sub !== "room_cleaning") return;
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "room_cleaning_missed_carry_over").maybeSingle().then(({ data: row }) => {
      setCarryOverEnabled(!!row?.setting_value?.enabled);
    });
  }, [sub, profile?.location_id]);

  // Near-instant checkout detection via realtime subscription on gingr_reservations
  const [realtimeCheckedOutNames, setRealtimeCheckedOutNames] = useState(new Set());
  useEffect(() => {
    if (sub !== "room_cleaning") return;
    const locationId = profile?.location_id || "cherry-hill";
    const channel = supabase.channel("checkout-realtime").on("postgres_changes", { event: "UPDATE", schema: "public", table: "gingr_reservations", filter: `location_id=eq.${locationId}` }, (payload) => {
      const newRec = payload.new;
      if (newRec?.check_out_date && !payload.old?.check_out_date && newRec.animal_name) {
        setRealtimeCheckedOutNames(prev => { const next = new Set(prev); next.add(newRec.animal_name); return next; });
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sub, profile?.location_id]);

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

  useEffect(() => {
    if (sub !== "room_cleaning" || !profile?.location_id) return;
    const roomEntryId = `ops_room_cleaning_${viewDate}`;
    const roomEntry = allOps.find(e => e.id === roomEntryId);
    const hasTasks = Array.isArray(roomEntry?.computed_items?.task_instances)
      ? roomEntry.computed_items.task_instances.length > 0
      : (Array.isArray(roomEntry?.computed_items?.rooms) && roomEntry.computed_items.rooms.length > 0);
    if (hasTasks) return;

    const attemptKey = `${profile.location_id}:${viewDate}`;
    if (roomCleaningOnDemandAttemptRef.current.has(attemptKey)) return;
    roomCleaningOnDemandAttemptRef.current.add(attemptKey);

    let cancelled = false;
    supabase.functions.invoke("ops-compute-ondemand", {
      body: { location_id: profile.location_id, date: viewDate, kind: "room_cleaning" },
    }).then(({ data: response, error }) => {
      if (cancelled) return;
      if (error || !response?.room_cleaning) {
        if (error) console.error("[room_cleaning] on-demand compute failed:", error);
        return;
      }

      const entries = [...(data.dailyOps || [])];
      const idx = entries.findIndex(e => e.id === roomEntryId);
      const existingEntry = idx >= 0 ? entries[idx] : {};
      const entry = {
        ...existingEntry,
        id: roomEntryId,
        location_id: profile.location_id,
        type: "room_cleaning",
        type_sub: "room_cleaning",
        date: viewDate,
        locked: false,
        items: existingEntry.items || {},
        computed_items: response.room_cleaning,
      };
      if (idx >= 0) entries[idx] = entry; else entries.push(entry);
      save({ ...data, dailyOps: entries });
    });

    return () => { cancelled = true; };
  }, [sub, viewDate, profile?.location_id, data, allOps, save]);

  const toggleItem = (key, field, val) => {
    if (isLocked) return;
    const userName = profile?.full_name || "";
    const initials = userName.split(" ").map(w => w[0]).join("").toUpperCase() || "??";
    const now = new Date().toISOString();
    // Auto-fill name + timestamp when checking a checkbox (write both web and mobile field names for cross-app compat)
    let newItems;
    if (field === "checked" && val === true) {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val, initials: userName } };
    } else if (field === "refresh" && val === true) {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val, refreshBy: userName, refreshInitials: initials, refreshAt: now } };
    } else if (field === "disinfect" && val === true) {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val, disinfectBy: userName, disinfectInitials: initials, disinfectAt: now } };
    } else if (field === "setupDone" && val === true) {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val, setupDoneBy: userName, setupInitials: initials, setupAt: now } };
    } else if (field === "completed" && val === true) {
      newItems = { ...items, [key]: { ...(items[key] || {}), completed: true, completedAt: now, completedBy: initials, initials } };
    } else if (field === "completed" && val === false) {
      newItems = { ...items, [key]: { ...(items[key] || {}), completed: false, completedAt: "", completedBy: "", initials: "" } };
    } else if (field === "asNeeded" && val === true) {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val, asNeededBy: userName, asNeededAt: now, asNeededNote: "" } };
    } else if (field === "asNeeded" && val === false) {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val, asNeededBy: "", asNeededAt: "", asNeededNote: "", asNeededDone: false, asNeededDoneBy: "", asNeededDoneAt: "" } };
    } else if (field === "asNeededDone" && val === true) {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val, asNeededDoneBy: userName, asNeededDoneAt: now } };
    } else {
      newItems = { ...items, [key]: { ...(items[key] || {}), [field]: val } };
    }

    // Toast with undo for completion actions
    const isCompletion = val === true && ["checked", "refresh", "disinfect", "setupDone", "asNeededDone", "completed"].includes(field);
    if (isCompletion && addGlobalToast) {
      const prevItemState = items[key] ? { ...items[key] } : {};
      const labels = { checked: "Task", refresh: "Refresh", disinfect: "Disinfect", setupDone: "Setup", asNeededDone: "As Needed", completed: "Task" };
      addGlobalToast({
        message: `${labels[field] || "Task"} marked done`,
        type: "success",
        actionLabel: "Undo",
        onAction: () => {
          const undoneItems = { ...items, [key]: prevItemState };
          setItems(undoneItems);
          if (sub === "room_cleaning") {
            const entries = [...(data.dailyOps || [])];
            const idx = entries.findIndex(e => e.id === entryId);
            const existing = idx >= 0 ? entries[idx] : {};
            const entry = { ...existing, id: entryId, type: sub, date: viewDate, locked: false, items: undoneItems, history: [...(existing.history || []), { ts: new Date().toISOString(), action: "undo" }] };
            if (idx >= 0) entries[idx] = entry; else entries.push(entry);
            save({ ...data, dailyOps: entries });
          } else {
            setDirty(true);
          }
        },
      });
      // Grace period: keep row visible in "incomplete" filter for 3s
      if (rcFilter === "incomplete") {
        setRecentlyCompleted(prev => new Set(prev).add(key));
        setTimeout(() => setRecentlyCompleted(prev => { const next = new Set(prev); next.delete(key); return next; }), 3000);
      }
    }

    setItems(newItems);

    // Auto-save for room cleaning (no Save button needed)
    if (sub === "room_cleaning") {
      const entries = [...allOps];
      const idx = entries.findIndex(e => e.id === entryId);
      const existing = idx >= 0 ? entries[idx] : {};
      const entry = { ...existing, id: entryId, type: sub, date: viewDate, locked: false, items: newItems, history: [...(existing.history || []), { ts: now, action: "saved" }] };
      if (idx >= 0) entries[idx] = entry; else entries.push(entry);
      save({ ...data, dailyOps: entries });
    } else {
      setDirty(true);
    }
  };

  const setNoteForItem = (key, note) => {
    if (isLocked) return;
    const newItems = { ...items, [key]: { ...(items[key] || {}), asNeededNote: note } };
    setItems(newItems);
    if (sub === "room_cleaning") {
      const entries = [...allOps];
      const idx = entries.findIndex(e => e.id === entryId);
      const existingNote = idx >= 0 ? entries[idx] : {};
      const entry = { ...existingNote, id: entryId, type: sub, date: viewDate, locked: false, items: newItems, history: [...(existingNote.history || []), { ts: new Date().toISOString(), action: "saved" }] };
      if (idx >= 0) entries[idx] = entry; else entries.push(entry);
      save({ ...data, dailyOps: entries });
    } else {
      setDirty(true);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
    catch { return ""; }
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
  const boardingToday = (data.reservations || []).filter(r => r.type === "boarding" && r.checkIn <= viewDate && r.checkOut >= viewDate && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = (data.reservations || []).filter(r => r.type === "boarding" && r.checkOut === viewDate && r.status === "checked-out");

  // PP checklist: dogs with canonical Private Play assignment OR PP add-on OR day boarding
  const ppLocationId = profile?.location_id || "cherry-hill";
  const [ppIconDogIds, setPpIconDogIds] = React.useState(new Set());
  React.useEffect(() => {
    if (!ppLocationId) return;
    let cancelled = false;
    supabase
      .from("v_dog_playgroup_assignments_current")
      .select("animal_gingr_id")
      .eq("location_id", ppLocationId)
      .eq("has_private_play", true)
      .then(({ data: rows }) => {
        if (!cancelled && rows) {
          setPpIconDogIds(new Set(rows.map(r => String(r.animal_gingr_id))));
        }
      });
    return () => { cancelled = true; };
  }, [ppLocationId, viewDate]);

  const ppReservations = (data.reservations || []).filter(r => {
    if (r.status === "cancelled") return false;
    if (r.checkIn > viewDate || r.checkOut < viewDate) return false;
    // Day boarding always included
    if (r.type === "dayboarding") return true;
    // Check Gingr icon (authoritative)
    const animalId = String(r.animalGingrId || r.dogId || "").replace(/^g/, "");
    if (ppIconDogIds.has(animalId)) return true;
    // Also check PP service add-on as supplementary signal
    if (resSvcIncludes(r, "Private Play")) return true;
    return false;
  }).map(r => {
    const animalId = String(r.animalGingrId || r.dogId || "").replace(/^g/, "");
    const hasIcon = ppIconDogIds.has(animalId);
    const hasSvc = resSvcIncludes(r, "Private Play");
    return {
      ...r,
      _ppSource: r.type === "dayboarding"
        ? (hasIcon ? "Day Boarding + Icon" : hasSvc ? "Day Boarding + Add-On" : "Day Boarding")
        : hasIcon
          ? (hasSvc ? "Gingr Icon + Add-On" : "Gingr Icon")
          : "Private Play Add-On"
    };
  }).sort((a, b) => {
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
        <button onClick={() => shiftDate(1)} disabled={!canGoForward} style={{ ...nbtn, background: C.surfaceHover, color: canGoForward ? C.text : C.textMut, opacity: canGoForward ? 1 : 0.4, cursor: canGoForward ? "pointer" : "not-allowed" }}>›</button>
        {!isToday && <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: C.pri, color: "#fff" }}>Today</button>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {dirty && !isLocked && sub !== "room_cleaning" && <Btn onClick={saveEntry}>Save</Btn>}
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
                  <K9Check checked={!!it.checked} disabled={isLocked} onChange={e => toggleItem(t.id, "checked", e.target.checked)} />
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
  const sanitizeRoomKey = (name) => (name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  const roomTaskTypes = ["room_refresh", "full_disinfect", "setup", "sanitize"];
  const getRoomTaskLabel = (taskType) => {
    switch (taskType) {
      case "room_refresh": return "Room Refresh";
      case "full_disinfect": return "Full Disinfect";
      case "setup": return "Set Up";
      case "sanitize": return "Sanitize";
      default: return titleCase(String(taskType || "Task").replace(/_/g, " "));
    }
  };
  const getRoomTaskAccent = (taskType) => {
    switch (taskType) {
      case "room_refresh": return "#D97706";
      case "full_disinfect": return C.dan;
      case "setup": return "#14532D";
      case "sanitize": return C.acc;
      default: return C.pri;
    }
  };
  const isRoomTaskCompletedFromLegacyState = (task, state) => {
    if (!state || typeof state !== "object") return false;
    if (state.completed || state.checked || state.done) return true;
    if (task?.task_type === "room_refresh" && state.refresh) return true;
    if (task?.task_type === "full_disinfect" && state.disinfect) return true;
    if (task?.task_type === "setup" && state.setupDone) return true;
    if (task?.task_type === "sanitize" && (state.asNeededDone || state.sanitizeDone)) return true;
    return false;
  };
  const renderRoomCleaning = () => {
    const roomItems = items;

    // ─── Previous-day missed cleaning detection (only when carry-over enabled) ───
    const missedMap = {};
    const prevDateObj = new Date(viewDate + "T12:00:00");
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().slice(0, 10);
    const prevEntryId = `ops_room_cleaning_${prevDate}`;
    const prevEntry = carryOverEnabled ? allOps.find(e => e.id === prevEntryId) : null;
    const prevItems = prevEntry ? (prevEntry.items || {}) : {};

    const prevComputedRooms = prevEntry?.computed_items?.rooms || [];
    if (carryOverEnabled && prevComputedRooms.length > 0) {
      prevComputedRooms.forEach(cr => {
        const prevKey = sanitizeRoomKey(cr.room);
        if (cr.needsDisinfect && !(prevItems[prevKey]?.disinfect) && !(prevItems[cr.room]?.disinfect)) {
          missedMap[prevKey] = { ...(missedMap[prevKey] || {}), missedDisinfect: true };
          missedMap[cr.room] = { ...(missedMap[cr.room] || {}), missedDisinfect: true };
        }
      });
    }
    // Also detect missed as-needed tasks from previous day
    Object.entries(prevItems).forEach(([key, ri]) => {
      if (ri.asNeeded && !ri.asNeededDone) {
        const sk = sanitizeRoomKey(key);
        missedMap[sk] = { ...(missedMap[sk] || {}), missedAsNeeded: true, asNeededNote: ri.asNeededNote };
        if (sk !== key) missedMap[key] = { ...(missedMap[key] || {}), missedAsNeeded: true, asNeededNote: ri.asNeededNote };
      }
    });

    // ─── Server-computed room data (primary source) ───
    const rcEntry = allOps.find(e => e.id === `ops_room_cleaning_${viewDate}`);
    const canonicalTasks = Array.isArray(rcEntry?.computed_items?.task_instances) ? rcEntry.computed_items.task_instances : [];
    const hasCanonicalTasks = canonicalTasks.length > 0;
    const computedRooms = rcEntry?.computed_items?.rooms || [];
    const hasComputedData = computedRooms.length > 0;

    // ─── Merge computed rooms by room key (one entry per room, multiple dogs merged) ───
    const mergedRoomMap = {};
    if (hasComputedData) {
      computedRooms.forEach(cr => {
        const rk = sanitizeRoomKey(cr.room);
        if (mergedRoomMap[rk]) {
          const m = mergedRoomMap[rk];
          if (cr.dogName && !m.dogNames.includes(cr.dogName)) m.dogNames.push(cr.dogName);
          // Merge per-dog detail arrays
          for (const dog of (cr.dogs || [])) {
            if (dog.name && !m.dogs.some(d => d.name === dog.name)) m.dogs.push(dog);
          }
          if (cr.needsRefresh) m.needsRefresh = true;
          if (cr.needsDisinfect) m.needsDisinfect = true;
          if (cr.needsSetup) { m.needsSetup = true; m.setupReason = cr.setupReason; }
          if (cr.suggestedBowlSize) m.suggestedBowlSize = cr.suggestedBowlSize;
          if (cr.dogWeight) m.dogWeight = cr.dogWeight;
        } else {
          mergedRoomMap[rk] = { ...cr, dogNames: cr.dogName ? [cr.dogName] : [], dogs: [...(cr.dogs || [])] };
        }
      });
    }
    const mergedRooms = Object.values(mergedRoomMap);

    // ─── Compute stats from server data or client-side fallback ───
    let totalOccupied = 0, totalRefresh = 0, totalDisinfect = 0, doneRefresh = 0, doneDisinfect = 0;
    let totalSetups = 0, doneSetups = 0, totalRooms = 0;

    const isLinkedRoom = (r) => !r.room?.includes("(unlinked)");

    if (hasComputedData) {
      totalOccupied = mergedRooms.filter(r => r.cleaningType !== "none").length;
      totalRooms = mergedRooms.filter(isLinkedRoom).length;
      mergedRooms.forEach(cr => {
        const key = sanitizeRoomKey(cr.room);
        const ri = roomItems[key] || roomItems[cr.room] || {};
        if (cr.needsRefresh) { totalRefresh++; if (ri.refresh) doneRefresh++; }
        if (cr.needsDisinfect) { totalDisinfect++; if (ri.disinfect) doneDisinfect++; }
        if (cr.needsSetup) { totalSetups++; if (ri.setupDone) doneSetups++; }
      });
    }
    const totalClean = totalRefresh + totalDisinfect;
    const doneClean = doneRefresh + doneDisinfect;

    // ─── Group merged rooms by roomType for display ───
    const groupedRooms = {};
    if (hasComputedData) {
      mergedRooms.forEach(cr => {
        const key = cr.roomType || cr.areaName || "Other";
        if (!groupedRooms[key]) groupedRooms[key] = [];
        groupedRooms[key].push(cr);
      });
    }

    // Count "as needed" items
    const asNeededCount = Object.values(roomItems).filter(ri => ri.asNeeded).length;
    const asNeededDoneCount = Object.values(roomItems).filter(ri => ri.asNeeded && ri.asNeededDone).length;

    const bowlSizeOptions = ["Small", "Medium", "Large"];
    const bowlTypeOptions = ["Regular", "Raised Feeder", "Non-Flip"];
    const gridCols = "minmax(140px, 1.2fr) 1fr 1fr minmax(120px, 1fr) minmax(100px, auto)";

    const getCanonicalTaskState = (task) => {
      const taskState = roomItems[task.task_id];
      if (taskState && typeof taskState === "object") return taskState;
      const legacyState = roomItems[task.room_key] || roomItems[task.room] || {};
      return {
        ...legacyState,
        completed: isRoomTaskCompletedFromLegacyState(task, legacyState),
        completedAt: legacyState.completedAt || legacyState.refreshAt || legacyState.disinfectAt || legacyState.setupAt || legacyState.asNeededDoneAt,
        completedBy: legacyState.completedBy || legacyState.refreshBy || legacyState.disinfectBy || legacyState.setupDoneBy || legacyState.asNeededDoneBy,
        initials: legacyState.initials || legacyState.refreshInitials || legacyState.disinfectInitials || legacyState.setupInitials,
      };
    };

    const canonicalSummary = hasCanonicalTasks ? canonicalTasks.reduce((acc, task) => {
      const type = roomTaskTypes.includes(task.task_type) ? task.task_type : "sanitize";
      const state = getCanonicalTaskState(task);
      acc.byType[type].total += 1;
      acc.total += 1;
      if (state.completed) {
        acc.byType[type].completed += 1;
        acc.completed += 1;
      }
      return acc;
    }, {
      completed: 0,
      total: 0,
      byType: roomTaskTypes.reduce((acc, type) => ({ ...acc, [type]: { completed: 0, total: 0 } }), {}),
    }) : null;

    const filteredCanonicalTasks = hasCanonicalTasks ? canonicalTasks.filter((task) => {
      const state = getCanonicalTaskState(task);
      if (rcFilter === "incomplete") return !state.completed || recentlyCompleted.has(task.task_id);
      if (rcFilter === "setup") return task.task_type === "setup";
      if (rcFilter === "refresh") return task.task_type === "room_refresh";
      if (rcFilter === "disinfect") return task.task_type === "full_disinfect";
      if (rcFilter === "asNeeded") return task.task_type === "sanitize";
      return true;
    }) : [];

    const groupedCanonicalTasks = filteredCanonicalTasks.reduce((acc, task) => {
      const key = task.room_type || task.area_name || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});

    const isCanonicalTaskBlocked = (task) => {
      if (!task?.blocked_by_task_id) return false;
      return !roomItems[task.blocked_by_task_id]?.completed;
    };

    const renderCanonicalTaskRow = (task, i, totalRows) => {
      const state = getCanonicalTaskState(task);
      const blocked = isCanonicalTaskBlocked(task);
      const accent = getRoomTaskAccent(task.task_type);
      const completedAt = state.completedAt ? formatTime(state.completedAt) : "";
      const disabled = isLocked || blocked;

      return (
        <div key={task.task_id} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(150px, 1.2fr) minmax(180px, 1.4fr) minmax(120px, auto)", gap: 12, padding: "10px 12px", borderBottom: i < totalRows - 1 ? `1px solid ${C.border}` : "none", alignItems: "center", opacity: blocked ? 0.55 : 1 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: accent }}>{getRoomTaskLabel(task.task_type)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>{task.room || "Unassigned room"}</div>
            {blocked && <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", marginTop: 2 }}>Blocked until disinfect is complete</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.textMut }}>Room Type</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{task.room_type || task.area_name || "Other"}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{task.animal_name || "No dog assigned"}</div>
            {task.owner_last_name && <div style={{ fontSize: 11, color: C.textMut }}>{task.owner_last_name}</div>}
          </div>
          <div>
            {task.task_type === "setup" ? (
              <div>
                <div style={{ fontSize: 10, color: C.textMut, marginBottom: 4 }}>
                  {task.dog_weight != null ? `${task.dog_weight} lbs` : "No weight"} · {task.suggested_bowl_size || "Unknown bowl"}
                </div>
                <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                  {bowlSizeOptions.map((size) => (
                    <button key={size} disabled={disabled} onClick={() => toggleItem(task.task_id, "bowlSize", size)}
                      style={{ flex: 1, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${state.bowlSize === size ? "#14532D" : C.border}`, background: state.bowlSize === size ? "#14532D" : "#fff", color: state.bowlSize === size ? "#fff" : C.text, fontSize: 10, fontWeight: state.bowlSize === size ? 700 : 500, cursor: disabled ? "default" : "pointer", fontFamily: "Outfit, sans-serif", opacity: disabled ? 0.6 : 1 }}
                    >{size}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {bowlTypeOptions.map((type) => (
                    <button key={type} disabled={disabled} onClick={() => toggleItem(task.task_id, "bowlType", type)}
                      style={{ flex: 1, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${(state.bowlType || "Regular") === type ? "#14532D" : C.border}`, background: (state.bowlType || "Regular") === type ? "#14532D" : "#fff", color: (state.bowlType || "Regular") === type ? "#fff" : C.text, fontSize: 9, fontWeight: (state.bowlType || "Regular") === type ? 700 : 500, cursor: disabled ? "default" : "pointer", fontFamily: "Outfit, sans-serif", opacity: disabled ? 0.6 : 1 }}
                    >{type}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.35 }}>{task.rationale || task.classification_bucket || "Canonical room-cleaning task"}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <K9Check checked={!!state.completed} disabled={disabled} onChange={e => toggleItem(task.task_id, "completed", e.target.checked)} color={accent} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: state.completed ? C.suc : (blocked ? C.textMut : accent) }}>{state.completed ? "Done" : "Required"}</div>
              {state.completed && <div style={{ fontSize: 10, color: C.textMut }}>{state.initials || state.completedBy || ""}{completedAt ? ` · ${completedAt}` : ""}</div>}
            </div>
          </div>
        </div>
      );
    };

    if (hasCanonicalTasks) {
      const asNeededTotal = canonicalSummary.byType.sanitize.total;
      const asNeededCompleted = canonicalSummary.byType.sanitize.completed;
      return (
        <div>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{canonicalSummary.completed}/{canonicalSummary.total}</span>
              <span style={{ fontSize: 12, color: C.textSec }}>Total Tasks</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#D97706" }}>{canonicalSummary.byType.room_refresh.completed}/{canonicalSummary.byType.room_refresh.total}</span>
              <span style={{ fontSize: 12, color: C.textSec }}>Refreshes Done</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.dan }}>{canonicalSummary.byType.full_disinfect.completed}/{canonicalSummary.byType.full_disinfect.total}</span>
              <span style={{ fontSize: 12, color: C.textSec }}>Disinfects Done</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#14532D" }}>{canonicalSummary.byType.setup.completed}/{canonicalSummary.byType.setup.total}</span>
              <span style={{ fontSize: 12, color: C.textSec }}>Setups Done</span>
            </div>
            {asNeededTotal > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.acc }}>{asNeededCompleted}/{asNeededTotal}</span>
              <span style={{ fontSize: 12, color: C.textSec }}>Sanitize Done</span>
            </div>}
          </div>
          {canonicalSummary.total > 0 && <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(canonicalSummary.completed / canonicalSummary.total) * 100}%`, height: "100%", background: canonicalSummary.completed === canonicalSummary.total ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: canonicalSummary.completed === canonicalSummary.total ? C.suc : C.text }}>{canonicalSummary.completed}/{canonicalSummary.total}</span>
            </div>
          </div>}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "All" },
              { key: "incomplete", label: "Incomplete", count: canonicalSummary.total - canonicalSummary.completed },
              { key: "setup", label: "Setups", count: canonicalSummary.byType.setup.total },
              { key: "refresh", label: "Refreshes", count: canonicalSummary.byType.room_refresh.total },
              { key: "disinfect", label: "Disinfects", count: canonicalSummary.byType.full_disinfect.total },
              { key: "asNeeded", label: "Sanitize", count: canonicalSummary.byType.sanitize.total },
            ].map(f => (
              <button key={f.key} onClick={() => setRcFilter(f.key)} style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: rcFilter === f.key ? 700 : 500,
                fontFamily: "Outfit, sans-serif", cursor: "pointer", transition: "all 0.15s ease",
                border: `1.5px solid ${rcFilter === f.key ? "#14532D" : C.border}`,
                background: rcFilter === f.key ? "#14532D" : "#fff",
                color: rcFilter === f.key ? "#fff" : C.text,
              }}>
                {f.label}{f.count != null ? ` (${f.count})` : ""}
              </button>
            ))}
          </div>
          {Object.keys(groupedCanonicalTasks).length > 0 ? Object.entries(groupedCanonicalTasks).map(([group, groupTasks]) => (
            <div key={group} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{group} <Badge color="default" size="sm">{groupTasks.length} tasks</Badge></h3>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(150px, 1.2fr) minmax(180px, 1.4fr) minmax(120px, auto)", gap: 12, borderBottom: `2px solid ${C.border}`, padding: "8px 12px", background: C.surfaceHover }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>TASK / ROOM</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>ROOM TYPE</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>DOG / OWNER</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>DETAILS</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>COMPLETED</div>
                </div>
                {groupTasks.map((task, index) => renderCanonicalTaskRow(task, index, groupTasks.length))}
              </Card>
            </div>
          )) : (
            <Card style={{ padding: 32, textAlign: "center" }}>
              <div style={{ color: C.textSec, fontSize: 14 }}>No tasks match the current filter.</div>
            </Card>
          )}
        </div>
      );
    }

    // ─── Render a single room row (shared by both computed and fallback paths) ───
    const renderRoomRow = (rm, ri, crData, i, totalRows, displayName) => {
      const needsRefresh = crData ? crData.needsRefresh : false;
      const needsDisinfect = crData ? crData.needsDisinfect : false;
      const hasSetup = crData ? crData.needsSetup : false;
      const isOccupied = !!crData && crData.cleaningType !== "none";
      const aDog = crData ? (crData.dogNames ? crData.dogNames.join(', ') : crData.dogName) : null;
      const aOwner = crData ? crData.ownerLastName : null;

      // Per-dog details for sibling support
      const dogs = crData?.dogs || [];
      const setupDogs = dogs.filter(d => d.needsSetup);
      const hasSiblingSetup = setupDogs.length > 1;

      // For single-dog rooms, use legacy keys for backward compat
      const getSetupBowl = (dogIdx) => {
        if (!hasSiblingSetup) return ri.setupBowl || (crData?.suggestedBowlSize) || "";
        return ri[`setupBowl_${dogIdx}`] || (setupDogs[dogIdx]?.suggestedBowlSize) || "";
      };
      const getSetupBowlType = (dogIdx) => {
        if (!hasSiblingSetup) return ri.setupBowlType || "Regular";
        return ri[`setupBowlType_${dogIdx}`] || "Regular";
      };
      const setBowlForDog = (dogIdx, field, val) => {
        if (!hasSiblingSetup) { toggleItem(rm, field, val); return; }
        toggleItem(rm, `${field}_${dogIdx}`, val);
      };

      return (
        <div key={rm} style={{ display: "grid", gridTemplateColumns: gridCols, padding: "8px 12px", borderBottom: i < totalRows - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{displayName || rm}</span>
            {isOccupied ? <div>
              {dogs.length > 1 ? dogs.map((d, di) => (
                <div key={di} style={{ marginTop: di === 0 ? 1 : 3 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.pri }}>{d.name}</div>
                  {d.ownerLastName && <div style={{ fontSize: 10, color: C.textMut }}>{d.ownerLastName}</div>}
                </div>
              )) : <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.pri, marginTop: 1 }}>{aDog}</div>
                {aOwner && <div style={{ fontSize: 10, color: C.textMut }}>{aOwner}</div>}
              </div>}
              {crData && crData.checkIn === viewDate && crData.checkOut !== viewDate && <div style={{ fontSize: 9, color: C.acc, fontWeight: 600, marginTop: 1 }}>Check-in day</div>}
              {crData && crData.checkOut === viewDate && crData.cleaningType !== "disinfect" && <div style={{ fontSize: 9, color: "#F59E0B", fontWeight: 600, marginTop: 1 }}>Checkout day</div>}
              {crData && crData.cleaningType === "disinfect" && (() => {
                const checkedOut = crData.isCheckedOut || (crData.dogNames || []).some(n => realtimeCheckedOutNames.has(n));
                return <div style={{ fontSize: 9, color: checkedOut ? C.dan : "#F59E0B", fontWeight: 600, marginTop: 1 }}>{checkedOut ? "Checked out" : "Checking out"}</div>;
              })()}
              {needsRefresh && crData && <div style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>Day {crData.dayNumber} of {crData.totalNights}</div>}
              {missedMap[rm]?.missedDisinfect && <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FEF3C7", padding: "1px 6px", borderRadius: 4, marginTop: 2, display: "inline-block" }}>⚠ Disinfect missed</div>}
              {missedMap[rm]?.missedAsNeeded && <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FEF3C7", padding: "1px 6px", borderRadius: 4, marginTop: 2, display: "inline-block" }}>⚠ As-needed missed{missedMap[rm]?.asNeededNote ? `: ${missedMap[rm].asNeededNote}` : ""}</div>}
            </div> : <div>
              {hasSetup && aDog ? <div>
                {dogs.length > 1 ? dogs.map((d, di) => (
                  <div key={di} style={{ marginTop: di === 0 ? 1 : 3 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.pri }}>{d.name}</div>
                    {d.ownerLastName && <div style={{ fontSize: 10, color: C.textMut }}>{d.ownerLastName}</div>}
                  </div>
                )) : <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.pri, marginTop: 1 }}>{aDog}</div>
                  {aOwner && <div style={{ fontSize: 10, color: C.textMut }}>{aOwner}</div>}
                </div>}
              </div> : (missedMap[rm]?.missedDisinfect || missedMap[rm]?.missedAsNeeded) ? <div>
                <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 1 }}>Vacant</div>
                {missedMap[rm]?.missedDisinfect && <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FEF3C7", padding: "1px 6px", borderRadius: 4, marginTop: 2, display: "inline-block" }}>⚠ Disinfect missed</div>}
                {missedMap[rm]?.missedAsNeeded && <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FEF3C7", padding: "1px 6px", borderRadius: 4, marginTop: 2, display: "inline-block" }}>⚠ As-needed missed</div>}
              </div> : <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 1 }}>Vacant</div>}
            </div>}
          </div>
          <div style={{ textAlign: "center" }}>
            {needsRefresh ? <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <K9Check checked={!!ri.refresh} disabled={isLocked} onChange={e => toggleItem(rm, "refresh", e.target.checked)} color="#F59E0B" />
                <span style={{ fontSize: 11, fontWeight: 700, color: ri.refresh ? C.suc : C.pri }}>{ri.refresh ? "Done" : "Required"}</span>
              </div>
              {ri.refresh && (ri.refreshBy || ri.refreshInitials) && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.refreshInitials || ri.refreshBy}{ri.refreshAt ? ` · ${formatTime(ri.refreshAt)}` : ""}</div>}
            </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            {needsDisinfect ? <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <K9Check checked={!!ri.disinfect} disabled={isLocked} onChange={e => toggleItem(rm, "disinfect", e.target.checked)} color={C.dan} />
                <span style={{ fontSize: 11, fontWeight: 700, color: ri.disinfect ? C.suc : C.dan }}>{ri.disinfect ? "Done" : "Required"}</span>
              </div>
              {ri.disinfect && (ri.disinfectBy || ri.disinfectInitials) && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.disinfectInitials || ri.disinfectBy}{ri.disinfectAt ? ` · ${formatTime(ri.disinfectAt)}` : ""}</div>}
            </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            {hasSetup ? <div>
              {/* Per-dog setup controls for siblings, single controls for solo dogs */}
              {hasSiblingSetup ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center", marginBottom: 4 }}>
                    <div style={{ display: "inline-block", padding: "2px 6px", borderRadius: 4, background: "#14532D", color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "Outfit, sans-serif" }}>{crData.setupReason}</div>
                    <span style={{ fontSize: 10, color: C.textSec }}>{setupDogs.length} bowls</span>
                  </div>
                  {setupDogs.map((dog, di) => {
                    const selBowl = getSetupBowl(di);
                    const selType = getSetupBowlType(di);
                    return (
                      <div key={di} style={{ borderTop: di > 0 ? `1px dashed ${C.border}` : "none", paddingTop: di > 0 ? 4 : 0, marginTop: di > 0 ? 4 : 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.pri, marginBottom: 2 }}>{dog.name}</div>
                        <div style={{ fontSize: 9, color: C.textSec, marginBottom: 3 }}>
                          {dog.weight != null ? `${dog.weight} lbs` : "No weight"} — {dog.suggestedBowlSize || "Unknown"}
                        </div>
                        <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                          {bowlSizeOptions.map(s => (
                            <button key={s} disabled={isLocked} onClick={() => setBowlForDog(di, "setupBowl", s)}
                              style={{ flex: 1, padding: "2px 4px", borderRadius: 5, border: `1.5px solid ${selBowl === s ? "#14532D" : C.border}`, background: selBowl === s ? "#14532D" : "#fff", color: selBowl === s ? "#fff" : C.text, fontSize: 9, fontWeight: selBowl === s ? 700 : 500, cursor: isLocked ? "default" : "pointer", fontFamily: "Outfit, sans-serif", transition: "all 0.15s ease", opacity: isLocked ? 0.5 : 1 }}
                            >{s}</button>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                          {bowlTypeOptions.map(t => (
                            <button key={t} disabled={isLocked} onClick={() => setBowlForDog(di, "setupBowlType", t)}
                              style={{ flex: 1, padding: "2px 4px", borderRadius: 5, border: `1.5px solid ${selType === t ? "#14532D" : C.border}`, background: selType === t ? "#14532D" : "#fff", color: selType === t ? "#fff" : C.text, fontSize: 8, fontWeight: selType === t ? 700 : 500, cursor: isLocked ? "default" : "pointer", fontFamily: "Outfit, sans-serif", transition: "all 0.15s ease", opacity: isLocked ? 0.5 : 1 }}
                            >{t}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4 }}>
                    <K9Check checked={!!ri.setupDone} disabled={isLocked} onChange={e => toggleItem(rm, "setupDone", e.target.checked)} color="#14532D" size={16} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: ri.setupDone ? "#84CC16" : C.textMut }}>{ri.setupDone ? "Complete" : "Mark done"}</span>
                  </div>
                  {ri.setupDone && (ri.setupDoneBy || ri.setupInitials) && <div style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{ri.setupInitials || ri.setupDoneBy}{ri.setupAt ? ` · ${formatTime(ri.setupAt)}` : ""}</div>}
                </div>
              ) : (
                <div>
                  <div style={{ display: "inline-block", padding: "2px 6px", borderRadius: 4, background: "#14532D", color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "Outfit, sans-serif", marginBottom: 4 }}>{crData.setupReason}</div>
                  <div style={{ fontSize: 10, color: C.textSec, marginBottom: 4 }}>
                    {crData.dogWeight != null ? `${crData.dogWeight} lbs` : "No weight"} — {crData.suggestedBowlSize}
                  </div>
                  <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                    {bowlSizeOptions.map(s => {
                      const selBowl = getSetupBowl(0);
                      return (
                        <button key={s} disabled={isLocked} onClick={() => toggleItem(rm, "setupBowl", s)}
                          style={{ flex: 1, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${selBowl === s ? "#14532D" : C.border}`, background: selBowl === s ? "#14532D" : "#fff", color: selBowl === s ? "#fff" : C.text, fontSize: 10, fontWeight: selBowl === s ? 700 : 500, cursor: isLocked ? "default" : "pointer", fontFamily: "Outfit, sans-serif", transition: "all 0.15s ease", opacity: isLocked ? 0.5 : 1 }}
                        >{s}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                    {bowlTypeOptions.map(t => {
                      const selType = getSetupBowlType(0);
                      return (
                        <button key={t} disabled={isLocked} onClick={() => toggleItem(rm, "setupBowlType", t)}
                          style={{ flex: 1, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${selType === t ? "#14532D" : C.border}`, background: selType === t ? "#14532D" : "#fff", color: selType === t ? "#fff" : C.text, fontSize: 9, fontWeight: selType === t ? 700 : 500, cursor: isLocked ? "default" : "pointer", fontFamily: "Outfit, sans-serif", transition: "all 0.15s ease", opacity: isLocked ? 0.5 : 1 }}
                        >{t}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <K9Check checked={!!ri.setupDone} disabled={isLocked} onChange={e => toggleItem(rm, "setupDone", e.target.checked)} color="#14532D" size={16} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: ri.setupDone ? "#84CC16" : C.textMut }}>{ri.setupDone ? "Complete" : "Mark done"}</span>
                  </div>
                  {ri.setupDone && (ri.setupDoneBy || ri.setupInitials) && <div style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{ri.setupInitials || ri.setupDoneBy}{ri.setupAt ? ` · ${formatTime(ri.setupAt)}` : ""}</div>}
                </div>
              )}
            </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <K9Check checked={!!ri.asNeeded} disabled={isLocked} onChange={e => toggleItem(rm, "asNeeded", e.target.checked)} color={C.acc} size={16} />
                {ri.asNeeded && <K9Check checked={!!ri.asNeededDone} disabled={isLocked} onChange={e => toggleItem(rm, "asNeededDone", e.target.checked)} color={C.pri} size={16} />}
              </div>
              {ri.asNeeded && (ri.asNeededBy) && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.asNeededBy}{ri.asNeededAt ? ` · ${formatTime(ri.asNeededAt)}` : ""}</div>}
              {ri.asNeeded && <input type="text" value={ri.asNeededNote || ""} disabled={isLocked} onChange={e => setNoteForItem(rm, e.target.value.slice(0, 200))} placeholder="Note..." style={{ width: "100%", fontSize: 10, padding: "2px 4px", marginTop: 3, border: `1px solid ${C.border}`, borderRadius: 4, background: C.surface, color: C.text }} />}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div>
        {/* Missed cleaning alert banner — amber styling */}
        {Object.keys(missedMap).length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#FEF3C7", border: "1.5px solid #F59E0B", borderRadius: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>Missed Cleaning from {new Date(prevDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
            <div style={{ fontSize: 11, color: "#92400E", opacity: 0.8 }}>
              {(() => {
                const parts = [];
                const missedDisinfects = new Set(Object.entries(missedMap).filter(([, m]) => m.missedDisinfect).map(([k]) => sanitizeRoomKey(k))).size;
                const missedAsNeeded = new Set(Object.entries(missedMap).filter(([, m]) => m.missedAsNeeded).map(([k]) => sanitizeRoomKey(k))).size;
                if (missedDisinfects > 0) parts.push(`${missedDisinfects} disinfect${missedDisinfects > 1 ? "s" : ""}`);
                if (missedAsNeeded > 0) parts.push(`${missedAsNeeded} as-needed task${missedAsNeeded > 1 ? "s" : ""}`);
                return parts.join(", ") + " missed";
              })()}
            </div>
          </div>
        </div>}
        {/* Summary bar */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.surfaceHover, borderRadius: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{doneClean + doneSetups + asNeededDoneCount}/{totalClean + totalSetups + asNeededCount}</span>
            <span style={{ fontSize: 12, color: C.textSec }}>Total Tasks</span>
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
        {(() => { const allTotal = totalClean + totalSetups + asNeededCount; const allDone = doneClean + doneSetups + asNeededDoneCount; return allTotal > 0 && <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${(allDone / allTotal) * 100}%`, height: "100%", background: allDone === allTotal ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: allDone === allTotal ? C.suc : C.text }}>{allDone}/{allTotal}</span>
          </div>
        </div>; })()}
        {/* ─── Filter pills ─── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "All" },
            { key: "incomplete", label: "Incomplete", count: (totalClean - doneClean) + (totalSetups - doneSetups) + (asNeededCount - asNeededDoneCount) },
            { key: "setup", label: "Setups", count: totalSetups },
            { key: "refresh", label: "Refreshes", count: totalRefresh },
            { key: "disinfect", label: "Disinfects", count: totalDisinfect },
            { key: "asNeeded", label: "As Needed", count: asNeededCount },
          ].map(f => (
            <button key={f.key} onClick={() => setRcFilter(f.key)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: rcFilter === f.key ? 700 : 500,
              fontFamily: "Outfit, sans-serif", cursor: "pointer", transition: "all 0.15s ease",
              border: `1.5px solid ${rcFilter === f.key ? "#14532D" : C.border}`,
              background: rcFilter === f.key ? "#14532D" : "#fff",
              color: rcFilter === f.key ? "#fff" : C.text,
            }}>
              {f.label}{f.count != null ? ` (${f.count})` : ""}
            </button>
          ))}
        </div>
        {/* ─── Server-computed room data (primary path) ─── */}
        {hasComputedData ? Object.keys(groupedRooms).map(rt => {
          const allRoomsInGroup = groupedRooms[rt];
          const rooms = allRoomsInGroup.filter(cr => {
            const key = sanitizeRoomKey(cr.room);
            const ri = roomItems[key] || roomItems[cr.room] || {};
            if (rcFilter === "incomplete") {
              const hasUndone = (cr.needsRefresh && !ri.refresh) || (cr.needsDisinfect && !ri.disinfect) || (cr.needsSetup && !ri.setupDone) || (ri.asNeeded && !ri.asNeededDone);
              return hasUndone || recentlyCompleted.has(key);
            }
            if (rcFilter === "setup") return cr.needsSetup;
            if (rcFilter === "refresh") return cr.needsRefresh;
            if (rcFilter === "disinfect") return cr.needsDisinfect;
            if (rcFilter === "asNeeded") return ri.asNeeded;
            return true;
          });
          if (rooms.length === 0) return null;
          return (
            <div key={rt} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{rt} <Badge color="default" size="sm">{rooms.filter(r => r.cleaningType !== "none").length}/{rooms.length} occupied</Badge></h3>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: `2px solid ${C.border}`, padding: "8px 12px", background: C.surfaceHover }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>ROOM</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>ROOM REFRESH</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>FULL DISINFECT</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#14532D", textAlign: "center" }}>SETUPS</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, textAlign: "center" }}>AS NEEDED</div>
                </div>
                {rooms.map((cr, i) => {
                  const key = sanitizeRoomKey(cr.room);
                  const ri = roomItems[key] || roomItems[cr.room] || {};
                  return renderRoomRow(key, ri, cr, i, rooms.length, cr.room);
                })}
              </Card>
            </div>
          );
        }) : /* ─── No computed data yet — syncing state ─── */
        <Card style={{ padding: 32, textAlign: "center" }}>
          <div style={{ color: C.textSec, fontSize: 14 }}>
            <K9LoadingAnimation size={32} style={{ marginBottom: 8 }} />
            <div>Room data is syncing from Gingr. This updates automatically every 15 minutes.</div>
          </div>
        </Card>}
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
                            <K9Check checked={!!s.urinate} disabled={isLocked} onChange={e => ppToggleUD(r.dogId, si, "urinate", e.target.checked, ses)} size={16} />
                          </td>
                          <td style={{ padding: "4px 2px", textAlign: "center", background: isRequired(si) ? C.priLt + "80" : "transparent" }}>
                            <K9Check checked={!!s.defecate} disabled={isLocked} onChange={e => ppToggleUD(r.dogId, si, "defecate", e.target.checked, ses)} color={C.acc} size={16} />
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

  // ─── Bathing Report (server-computed via ops-compute) ────────────────────────
  const [bathCompleted, setBathCompleted] = useState({});
  const [bathFilter, setBathFilter] = useState("all");
  const [expandedCheckoutHistory, setExpandedCheckoutHistory] = useState(null);
  const [onDemandLoading, setOnDemandLoading] = useState(false);

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

  // On-demand fallback: if no bathing entry exists for viewDate, fetch it
  useEffect(() => {
    if (sub !== "bathing" || !profile?.location_id) return;
    const bathingEntry = allOps.find(e => e.id === `ops_bathing_${viewDate}`);
    if (bathingEntry) return; // Data already exists, no need to fetch
    let cancelled = false;
    setOnDemandLoading(true);
    supabase.functions.invoke('ops-compute-ondemand', {
      body: { location_id: profile.location_id, date: viewDate }
    }).then(({ data, error }) => {
      if (cancelled) return;
      setOnDemandLoading(false);
      // The edge function upserts into lite_daily_ops, so the realtime subscription
      // will pick it up automatically. No manual state update needed.
    }).catch(() => {
      if (!cancelled) setOnDemandLoading(false);
    });
    return () => { cancelled = true; };
  }, [sub, viewDate, profile?.location_id, allOps.length]);

  const saveBathCompleted = async (newCompleted) => {
    setBathCompleted(newCompleted);
    if (!profile?.location_id) return;
    const entryId = `ops_bathing_${viewDate}`;
    // Write to lite_settings (persists completions for ops-compute to pick up)
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
    // Also update lite_daily_ops computed_items directly so the dashboard
    // reflects the change instantly via realtime subscription (no polling needed)
    const bathingEntry = allOps.find(e => e.id === entryId);
    if (bathingEntry?.computed_items) {
      const dogs = (bathingEntry.computed_items.dogs || []).map(d => {
        const resId = `g${d.gingrReservationId}`;
        const info = newCompleted[resId] || null;
        return { ...d, isDone: !!info || !!d.isDone, completedBy: info?.by || d.completedBy || "", completedAt: info?.at || d.completedAt || "" };
      });
      const completedCount = dogs.filter(d => d.isDone).length;
      await supabase.from("lite_daily_ops").update({
        computed_items: { ...bathingEntry.computed_items, dogs, completions: newCompleted, completedCount, totalCount: dogs.length },
        computed_at: new Date().toISOString(),
      }).eq("id", entryId).eq("location_id", profile.location_id);
    }
  };

  const renderBathing = () => {
    // Read server-computed bathing data from ops-compute (single source of truth)
    const bathingEntry = allOps.find(e => e.id === `ops_bathing_${viewDate}`);
    const computedDogs = bathingEntry?.computed_items?.dogs || [];
    const summary = bathingEntry?.computed_items?.summary || {};

    const bathRows = computedDogs.map(d => {
      const resId = `g${d.gingrReservationId}`;
      const completedInfo = bathCompleted[resId] || null;
      return {
        resId,
        dogName: d.animalName || "Unknown",
        ownerName: d.ownerName || "",
        roomNum: d.roomLabel || "—",
        roomType: d.suiteType || "",
        bathType: d.bathType || "Standard",
        bathIcons: d.bathIcons || [],
        bathModifiers: d.bathModifiers || [],
        bathNotes: d.bathNotes || "",
        reservationNotes: d.reservationNotes || "",
        serviceNotes: d.serviceNotes || "",
        sizeCategory: d.sizeCategory || null,
        hasPrivatePlay: !!d.hasPrivatePlay,
        weight: d.weight || null,
        schedTime: d.scheduledTime || "—",
        schedAtRaw: d.scheduledAt || "",
        coTime: d.departureTime || "—",
        isDone: !!completedInfo || d.isDone,
        completedInfo,
        isCheckedOut: !!d.isCheckedOut,
        status: d.status || "scheduled",
        reservationCategory: d.reservationCategory || "other",
        roomName: d.roomName || "",
        roommates: d.roommates || [],
        siblingGroup: d.siblingGroup || "",
        avgCheckoutTime: d.avgCheckoutTime || null,
        checkoutHistory: d.checkoutHistory || [],
        reservationDates: d.reservationDates || {},
        statusContext: d.statusContext || null,
      };
    });

    // Apply filter
    const filteredRows = bathRows.filter(row => {
      if (bathFilter === "all") return true;
      if (bathFilter === "suggested") return row.status === "suggested";
      if (bathFilter === "manual") return row.status === "manual";
      return row.status === "scheduled" && row.reservationCategory === bathFilter;
    });

    const totalBaths = bathRows.length;
    const doneBaths = bathRows.filter(r => r.isDone).length;

    // Category counts for filter pills
    const catCounts = summary.byCategory || {};
    const filterPills = [
      { key: "all", label: "All", count: totalBaths },
      { key: "boarding", label: "Boarding", count: catCounts.boarding || 0 },
      { key: "daycare", label: "Daycare", count: catCounts.daycare || 0 },
      { key: "day_boarding", label: "Day Boarding", count: catCounts.day_boarding || 0 },
      { key: "evaluation", label: "Evaluation", count: catCounts.evaluation || 0 },
      { key: "manual", label: "Manual", count: catCounts.manual || 0 },
      { key: "suggested", label: "Suggested", count: catCounts.suggested || 0 },
    ].filter(p => p.key === "all" || p.count > 0);

    const toggleBath = (resId) => {
      const newCompleted = { ...bathCompleted };
      if (newCompleted[resId]) { delete newCompleted[resId]; }
      else { newCompleted[resId] = { by: profile?.name || profile?.email || "Staff", at: new Date().toISOString() }; }
      saveBathCompleted(newCompleted);
    };

    // Show loading state while computed data hasn't arrived yet
    if (totalBaths === 0 && !bathingEntry) {
      return (
        <div>
          <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>Bathing Report</span>
          </Card>
          <Card style={{ padding: "48px 20px", textAlign: "center" }}>
            <K9LoadingAnimation size={64}
              message={onDemandLoading ? "Loading data from Gingr..." : "Loading bathing report…"}
              subMessage={onDemandLoading ? "Computing on-demand for " + viewDate : "Waiting for server data"} />
          </Card>
        </div>
      );
    }

    const getBathBadgeStyle = (type) => {
      const styles = {
        "Loading…": { background: "#F3F4F6", color: "#9CA3AF" },
        "Premium": { background: "#DBEAFE", color: "#1D4ED8" },
        "Standard": { background: "#DBEAFE", color: "#1D4ED8" },
        "Medicated": { background: "#FEE2E2", color: "#DC2626" },
        "Whitening": { background: "#F3E8FF", color: "#7C3AED" },
        "Shampoo From Home": { background: "#ECFDF5", color: "#059669" },
        "Fresh N Clean": { background: "#ECFDF5", color: "#059669" },
        "Water Rinse": { background: "#E0F2FE", color: "#0369A1" },
        "Manual": { background: "#E0F2FE", color: "#0369A1" },
        "Suggested": { background: "#FFF7ED", color: "#C2410C" },
      };
      if (type.includes("Hypo")) return { background: "#FEF3C7", color: "#D97706" };
      return styles[type] || { background: "#F3F4F6", color: "#6B7280" };
    };

    // Format avg checkout time for display
    const fmtAvgTime = (timeStr) => {
      if (!timeStr) return null;
      try {
        const [h, m] = timeStr.split(":").map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        const ampm = h >= 12 ? "p" : "a";
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
      } catch { return null; }
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
            {!bathingEntry && <span style={{ fontSize: 12, color: C.pri, fontWeight: 600, fontFamily: "inherit" }}>Loading bath data…</span>}
          </div>
          {totalBaths > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((doneBaths / totalBaths) * 100)}%`, height: "100%", borderRadius: 3, background: doneBaths === totalBaths ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
          {/* Filter pills */}
          {filterPills.length > 2 && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {filterPills.map(f => (
                <button key={f.key} onClick={() => setBathFilter(f.key)} style={{
                  padding: "5px 14px", borderRadius: 20, whiteSpace: "nowrap",
                  border: `1.5px solid ${bathFilter === f.key ? "#14532D" : C.border}`,
                  background: bathFilter === f.key ? "#14532D" : "#fff",
                  color: bathFilter === f.key ? "#fff" : C.text,
                  fontWeight: bathFilter === f.key ? 700 : 500,
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}>
                  {f.label}{f.count != null ? ` (${f.count})` : ""}
                </button>
              ))}
            </div>
          )}
        </Card>
        {filteredRows.length === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut, fontFamily: "inherit" }}>
              {totalBaths === 0
                ? `No baths scheduled for ${isToday ? "today" : fmtDate(viewDate)}`
                : `No ${bathFilter === "suggested" ? "suggested" : bathFilter === "manual" ? "manual" : bathFilter} baths`}
            </div>
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
                    <th style={thStyle}>NOTES</th>
                    <th style={thCenterStyle}>SCHEDULED</th>
                    <th style={thCenterStyle}>CHECKOUT</th>
                    <th style={thCenterStyle}>DONE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => {
                    const badgeStyle = getBathBadgeStyle(row.bathType);
                    const prevRow = i > 0 ? filteredRows[i - 1] : null;
                    const isNewGroup = row.siblingGroup && (!prevRow || prevRow.siblingGroup !== row.siblingGroup);
                    const isInGroup = !!row.siblingGroup;
                    const avgTime = fmtAvgTime(row.avgCheckoutTime);

                    return (
                      <tr key={row.resId} style={{
                        borderBottom: i < filteredRows.length - 1 ? `1px solid ${C.borderLight}` : "none",
                        borderTop: isNewGroup ? `2px solid #A7F3D0` : "none",
                        background: row.isDone ? "#F0FDF4" : row.status === "manual" ? "#EFF6FF" : row.status === "suggested" ? "#FFF7ED" : isInGroup ? "#F0FDF4" + "33" : "transparent",
                        transition: "background 0.2s",
                      }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {row.dogName}
                            {row.status === "manual" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#E0F2FE", color: "#0369A1" }}>Manual</span>}
                            {row.status === "suggested" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#FFF7ED", color: "#C2410C" }}>Suggested</span>}
                            {row.hasPrivatePlay && <span title="Private Play" style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#EDE9FE", color: "#7C3AED" }}>PP</span>}
                            {row.sizeCategory === "large" && <span title={row.weight ? `${row.weight} lbs` : "Large dog"} style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#FEF3C7", color: "#D97706" }}>LG</span>}
                            {row.sizeCategory === "small" && <span title={row.weight ? `${row.weight} lbs` : "Small dog"} style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#DBEAFE", color: "#2563EB" }}>SM</span>}
                          </div>
                          {row.roommates.length > 0 && (
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>
                              {row.roommates.map((rm, ri) => <span key={ri}>{ri > 0 ? ", " : ""}{rm}</span>)}
                            </div>
                          )}
                          {row.status === "suggested" && row.reservationDates?.start && (
                            <div style={{ fontSize: 10, color: "#C2410C", marginTop: 2 }}>
                              Boarding {row.reservationDates.start.slice(5)} – {row.reservationDates.end.slice(5)}, no bath scheduled
                            </div>
                          )}
                          {row.status === "manual" && row.statusContext?.message && (
                            <div style={{ fontSize: 10, color: "#0369A1", marginTop: 2 }}>
                              {row.statusContext.message}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.pri, fontFamily: "inherit" }}>
                          {row.roomNum}
                          {row.roomType === "Double Compartment" && <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, marginTop: 1 }}>Double</div>}
                          {isInGroup && <div style={{ fontSize: 9, fontWeight: 600, color: "#059669", marginTop: 1 }}>{row.roommates.some(r => r.includes("sibling")) ? "Siblings" : "Roommates"}</div>}
                        </td>
                        <td style={{ padding: "12px 14px", color: C.text }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                            {row.bathIcons && row.bathIcons.length > 0 ? (
                              row.bathIcons.map((icon, ii) => {
                                const iconBadge = getBathBadgeStyle(icon);
                                return <span key={ii} style={{
                                  display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                                  ...iconBadge,
                                }}>{icon}</span>;
                              })
                            ) : (
                              <span style={{
                                display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                                ...badgeStyle,
                              }}>{row.bathType}</span>
                            )}
                          </div>
                          {row.bathModifiers && row.bathModifiers.length > 0 && <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {row.bathModifiers.map(m => <span key={m} style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#FEE2E2", color: "#DC2626" }}>{m}</span>)}
                          </div>}
                          {row.bathNotes && <div style={{ fontSize: 10, fontStyle: "italic", color: "#D97706", marginTop: 2 }}>{row.bathNotes}</div>}
                        </td>
                        <td style={{ padding: "12px 14px", color: C.textSec, fontSize: 12, fontFamily: "inherit", maxWidth: 240 }}>
                          {(row.serviceNotes || row.reservationNotes) ? (
                            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.3 }}>
                              {row.serviceNotes && <div style={{ color: C.text, fontWeight: 600, marginBottom: row.reservationNotes ? 4 : 0 }}>{row.serviceNotes}</div>}
                              {row.reservationNotes && <div style={{ color: C.textMut, fontSize: 11 }}>{row.reservationNotes}</div>}
                            </div>
                          ) : <span style={{ color: C.textMut }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: C.pri, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>{row.schedTime}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", fontFamily: "inherit" }}>
                          <div style={{ color: C.textSec, fontSize: 12 }}>{row.coTime}</div>
                          {avgTime && (
                            <div
                              onClick={() => row.checkoutHistory?.length > 0 && setExpandedCheckoutHistory(expandedCheckoutHistory === row.resId ? null : row.resId)}
                              style={{ fontSize: 10, color: row.checkoutHistory?.length > 0 ? C.pri : C.textMut, marginTop: 2, cursor: row.checkoutHistory?.length > 0 ? "pointer" : "default", textDecoration: row.checkoutHistory?.length > 0 ? "underline" : "none" }}
                              title="Click to see checkout history"
                            >Avg: {avgTime}</div>
                          )}
                          {expandedCheckoutHistory === row.resId && row.checkoutHistory?.length > 0 && (
                            <div style={{ marginTop: 6, padding: "8px 10px", background: "#F9FAFB", borderRadius: 8, border: `1px solid ${C.borderLight}`, textAlign: "left", fontSize: 11 }}>
                              <div style={{ fontWeight: 700, color: C.text, marginBottom: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Checkout History</div>
                              {row.checkoutHistory.slice(0, 10).map((h, hi) => (
                                <div key={hi} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", color: C.textSec, borderBottom: hi < Math.min(row.checkoutHistory.length, 10) - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                                  <span>{h.date}</span>
                                  <span style={{ fontWeight: 600, color: C.text }}>{h.time}</span>
                                  {h.reservationType && <span style={{ fontSize: 9, color: C.textMut }}>{h.reservationType}</span>}
                                </div>
                              ))}
                              {row.checkoutHistory.length > 10 && <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>+{row.checkoutHistory.length - 10} more</div>}
                            </div>
                          )}
                        </td>
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

  // ─── Belongings Report (server-computed via ops-compute) ─────────────────────
  const [belongingsCompleted, setBelongingsCompleted] = useState({});
  const [expandedBelonging, setExpandedBelonging] = useState(null);
  const [missingItemsText, setMissingItemsText] = useState({});

  // Load belongings completions from Supabase
  useEffect(() => {
    if (sub !== "belongings" || !profile?.location_id) return;
    const key = `ops_belongings_completions_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", key)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setBelongingsCompleted(rows[0].setting_value);
          // Initialize missing items text from saved data
          const mText = {};
          Object.entries(rows[0].setting_value).forEach(([k, v]) => {
            if (v && v.missingItems) mText[k] = v.missingItems;
          });
          setMissingItemsText(mText);
        } else {
          setBelongingsCompleted({});
          setMissingItemsText({});
        }
      });
  }, [sub, viewDate, profile?.location_id]);

  const saveBelongingsCompleted = async (newCompleted) => {
    setBelongingsCompleted(newCompleted);
    if (!profile?.location_id) return;
    const key = `ops_belongings_completions_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: key,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
    // Also update lite_daily_ops computed_items for instant dashboard refresh
    const entryId = `ops_belongings_${viewDate}`;
    const belongingsEntry = allOps.find(e => e.id === entryId);
    if (belongingsEntry?.computed_items) {
      const completedCount = Object.values(newCompleted).filter(c => c && c.status === "complete").length;
      await supabase.from("lite_daily_ops").update({
        computed_items: { ...belongingsEntry.computed_items, completions: newCompleted, completedCount, totalCount: (belongingsEntry.computed_items.dogs || []).length },
        computed_at: new Date().toISOString(),
      }).eq("id", entryId).eq("location_id", profile.location_id);
    }
  };

  const renderBelongings = () => {
    const belongingsEntry = allOps.find(e => e.id === `ops_belongings_${viewDate}`);
    const computedDogs = belongingsEntry?.computed_items?.dogs || [];

    const totalDogs = computedDogs.length;
    const doneDogs = Object.values(belongingsCompleted).filter(c => c && c.status === "complete").length;

    // Show loading state
    if (totalDogs === 0 && !belongingsEntry) {
      return (
        <div>
          <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>Belongings</span>
          </Card>
          <Card style={{ padding: "48px 20px", textAlign: "center" }}>
            <K9LoadingAnimation size={64}
              message="Loading belongings data..."
              subMessage={"Waiting for server data"} />
          </Card>
        </div>
      );
    }

    const setBelongingStatus = (resId, status, missingItems) => {
      const newCompleted = { ...belongingsCompleted };
      if (status === "not_started") {
        delete newCompleted[resId];
      } else {
        newCompleted[resId] = {
          status,
          missingItems: missingItems || "",
          by: profile?.name || profile?.full_name || profile?.email || "Staff",
          at: new Date().toISOString(),
        };
      }
      saveBelongingsCompleted(newCompleted);
    };

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>Belongings</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec, fontFamily: "inherit" }}>{doneDogs}/{totalDogs} complete</span>
            </div>
          </div>
          {totalDogs > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((doneDogs / totalDogs) * 100)}%`, height: "100%", borderRadius: 3, background: doneDogs === totalDogs ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        {totalDogs === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut, fontFamily: "inherit" }}>No departing dogs for {isToday ? "today" : fmtDate(viewDate)}</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {computedDogs.map((dog, i) => {
              const resId = `g${dog.reservationGingrId}`;
              const completion = belongingsCompleted[resId] || null;
              const status = completion?.status || "not_started";
              const isExpanded = expandedBelonging === resId;
              const statusColors = {
                complete: { bg: "#F0FDF4", border: "#10B981", badge: "#ECFDF5", badgeText: "#059669", label: "Complete" },
                missing: { bg: "#FEF2F2", border: "#F59E0B", badge: "#FEF3C7", badgeText: "#D97706", label: "Item Missing" },
                not_started: { bg: C.surface, border: C.border, badge: C.surfaceHover, badgeText: C.textMut, label: "Not Started" },
              };
              const sc = statusColors[status] || statusColors.not_started;
              const belongingsText = dog.belongings || "";
              const truncatedBelongings = belongingsText.length > 80 ? belongingsText.slice(0, 80) + "..." : belongingsText;

              return (
                <Card key={resId} style={{ padding: 0, overflow: "hidden", border: `1.5px solid ${sc.border}`, background: sc.bg, transition: "all 0.2s" }}>
                  {/* Collapsed row */}
                  <div
                    onClick={() => setExpandedBelonging(isExpanded ? null : resId)}
                    style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
                  >
                    {/* Dog photo placeholder */}
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: C.borderLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
                      {"🐕"}
                    </div>
                    {/* Dog name + owner + room */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>{dog.animalName}</span>
                        <span style={{ fontSize: 12, color: C.textSec, fontFamily: "inherit" }}>{(dog.ownerName || "").split(" ").pop()}</span>
                        {dog.roomLabel && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: C.priLt, color: C.pri }}>Rm {dog.roomLabel}</span>}
                        {dog.sizeCategory && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: dog.sizeCategory === "LG" ? "#FEF3C7" : "#DBEAFE", color: dog.sizeCategory === "LG" ? "#D97706" : "#2563EB" }}>{dog.sizeCategory}</span>}
                      </div>
                      {!isExpanded && belongingsText && (
                        <div style={{ fontSize: 12, color: C.textMut, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "inherit" }}>{truncatedBelongings}</div>
                      )}
                    </div>
                    {/* Status badge */}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: sc.badge, color: sc.badgeText, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>{sc.label}</span>
                    {/* Expand arrow */}
                    <span style={{ fontSize: 14, color: C.textMut, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>{"›"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "16px 18px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Dog</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{dog.animalName}</div>
                          <div style={{ fontSize: 12, color: C.textSec }}>{dog.breed}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Owner</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{dog.ownerName}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Room</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>{dog.roomLabel || "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Weight</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{dog.weight ? `${dog.weight} lbs` : "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Check-In</div>
                          <div style={{ fontSize: 13, color: C.text }}>{dog.checkInDate ? fmtDateShort(dog.checkInDate) : "—"} {dog.checkInTime || ""}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Departure</div>
                          <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{dog.checkOutDate ? fmtDateShort(dog.checkOutDate) : "—"} {dog.checkOutTime || ""}</div>
                        </div>
                      </div>

                      {/* Belongings — highlighted box */}
                      <div style={{ padding: "12px 16px", borderRadius: 10, background: "#FFFBEB", border: "1.5px solid #FDE68A", marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Belongings</div>
                        <div style={{ fontSize: 13, color: "#78350F", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {belongingsText || <span style={{ fontStyle: "italic", color: "#D97706" }}>No belongings recorded at check-in</span>}
                        </div>
                      </div>

                      {/* Health notes */}
                      {dog.healthNotes && (
                        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#EFF6FF", border: "1px solid #BFDBFE", marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1E40AF", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Health Notes</div>
                          <div style={{ fontSize: 12, color: "#1E3A5F", lineHeight: 1.4 }}>{dog.healthNotes}</div>
                        </div>
                      )}

                      {/* Checked in by */}
                      {dog.checkedInBy && (
                        <div style={{ fontSize: 12, color: C.textMut, marginBottom: 14 }}>
                          <span style={{ fontWeight: 600 }}>Checked in by:</span> {dog.checkedInBy}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setBelongingStatus(resId, status === "complete" ? "not_started" : "complete")}
                          style={{
                            padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
                            fontSize: 13, fontWeight: 700, transition: "all 0.15s",
                            background: status === "complete" ? "#10B981" : "#ECFDF5",
                            color: status === "complete" ? "#fff" : "#059669",
                          }}
                        >
                          {status === "complete" ? "✓ Complete" : "Mark Complete"}
                        </button>
                        <button
                          onClick={() => {
                            if (status === "missing") {
                              setBelongingStatus(resId, "not_started");
                            } else {
                              setBelongingStatus(resId, "missing", missingItemsText[resId] || "");
                            }
                          }}
                          style={{
                            padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
                            fontSize: 13, fontWeight: 700, transition: "all 0.15s",
                            background: status === "missing" ? "#F59E0B" : "#FEF3C7",
                            color: status === "missing" ? "#fff" : "#D97706",
                          }}
                        >
                          {status === "missing" ? "⚠ Item Missing" : "Item Missing"}
                        </button>
                      </div>

                      {/* Missing items input */}
                      {status === "missing" && (
                        <div style={{ marginTop: 10 }}>
                          <textarea
                            placeholder="Describe what's missing..."
                            value={missingItemsText[resId] || ""}
                            onChange={e => {
                              const val = e.target.value;
                              setMissingItemsText(prev => ({ ...prev, [resId]: val }));
                            }}
                            onBlur={() => {
                              setBelongingStatus(resId, "missing", missingItemsText[resId] || "");
                            }}
                            style={{
                              width: "100%", minHeight: 60, padding: "10px 12px", borderRadius: 8,
                              border: `1.5px solid #FDE68A`, background: "#FFFBEB", fontSize: 13,
                              fontFamily: "inherit", resize: "vertical", color: C.text,
                            }}
                          />
                        </div>
                      )}

                      {/* Completion info */}
                      {completion && (
                        <div style={{ marginTop: 10, fontSize: 11, color: C.textMut }}>
                          {completion.by} · {new Date(completion.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── Collars Report (server-computed via ops-compute) ────────────────────────
  const [collarsCompleted, setCollarsCompleted] = useState({});
  const [collarsExpanded, setCollarsExpanded] = useState({}); // { colorSection: boolean }
  const [expandedCollar, setExpandedCollar] = useState(null);

  // Load collars completions from Supabase
  useEffect(() => {
    if (sub !== "collars" || !profile?.location_id) return;
    const key = `ops_collars_completions_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", key)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setCollarsCompleted(rows[0].setting_value);
        } else {
          setCollarsCompleted({});
        }
      });
  }, [sub, viewDate, profile?.location_id]);

  const saveCollarsCompleted = async (newCompleted) => {
    setCollarsCompleted(newCompleted);
    if (!profile?.location_id) return;
    const key = `ops_collars_completions_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: key,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
    // Also update lite_daily_ops computed_items for dashboard refresh
    const eid = `ops_collars_${viewDate}`;
    const collarsEntry = allOps.find(e => e.id === eid);
    if (collarsEntry?.computed_items) {
      const completedCount = Object.values(newCompleted).filter(c => c && c.status === "complete").length;
      await supabase.from("lite_daily_ops").update({
        computed_items: { ...collarsEntry.computed_items, completions: newCompleted, completedCount, totalCount: (collarsEntry.computed_items.dogs || []).length },
        computed_at: new Date().toISOString(),
      }).eq("id", eid).eq("location_id", profile.location_id);
    }
  };

  const renderCollars = () => {
    const collarsEntry = allOps.find(e => e.id === `ops_collars_${viewDate}`);
    const computedDogs = collarsEntry?.computed_items?.dogs || [];
    const summary = collarsEntry?.computed_items?.summary || {};
    const totalDogs = computedDogs.length;
    const doneDogs = Object.values(collarsCompleted).filter(c => c && c.status === "complete").length;

    if (totalDogs === 0 && !collarsEntry) {
      return (
        <div>
          <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>Next Day Collars</span>
          </Card>
          <Card style={{ padding: "48px 20px", textAlign: "center" }}>
            <K9LoadingAnimation size={64} message="Loading collars data..." subMessage="Waiting for server data" />
          </Card>
        </div>
      );
    }

    const COLLAR_COLORS = [
      { key: "pink", label: "Pink — Daycare", bg: "#FCE4EC", text: "#C2185B", border: "#F48FB1" },
      { key: "red", label: "Red — Private Play", bg: "#FFEBEE", text: "#C62828", border: "#EF9A9A" },
      { key: "green", label: "Green — Large Boarding", bg: "#E8F5E9", text: "#2E7D32", border: "#A5D6A7" },
      { key: "blue", label: "Blue — Small Boarding", bg: "#E3F2FD", text: "#1565C0", border: "#90CAF9" },
      { key: "yellow", label: "Yellow — Evaluation", bg: "#FFFDE7", text: "#F9A825", border: "#FFF176" },
      { key: "unclassified", label: "Unclassified — Fix Gingr Icon", bg: "#F3F4F6", text: "#4B5563", border: "#D1D5DB" },
      { key: "halfAndHalf", label: "Half & Half", bg: "#F3E5F5", text: "#7B1FA2", border: "#CE93D8" },
    ];

    const setCollarStatus = (resId, status) => {
      const nc = { ...collarsCompleted };
      if (status === "not_started") { delete nc[resId]; }
      else { nc[resId] = { status, by: profile?.name || profile?.full_name || profile?.email || "Staff", at: new Date().toISOString() }; }
      saveCollarsCompleted(nc);
    };

    const checkAllInSection = (dogs) => {
      const nc = { ...collarsCompleted };
      const allDone = dogs.every(d => (nc[`g${d.reservationGingrId}`]?.status === "complete"));
      dogs.forEach(d => {
        const k = `g${d.reservationGingrId}`;
        if (allDone) { delete nc[k]; }
        else { nc[k] = { status: "complete", by: profile?.name || profile?.full_name || profile?.email || "Staff", at: new Date().toISOString() }; }
      });
      saveCollarsCompleted(nc);
    };

    const checkAll = () => {
      const nc = { ...collarsCompleted };
      const allDone = computedDogs.every(d => (nc[`g${d.reservationGingrId}`]?.status === "complete"));
      computedDogs.forEach(d => {
        const k = `g${d.reservationGingrId}`;
        if (allDone) { delete nc[k]; }
        else { nc[k] = { status: "complete", by: profile?.name || profile?.full_name || profile?.email || "Staff", at: new Date().toISOString() }; }
      });
      saveCollarsCompleted(nc);
    };

    const isBoarding = (dog) => dog.collarColor === "green" || dog.collarColor === "blue" || dog.collarColor === "red" || dog.collarColor === "unclassified";

    return (
      <div>
        {/* Summary Header */}
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>{totalDogs} Collars</span>
              {COLLAR_COLORS.map(cc => {
                const count = cc.key === "halfAndHalf" ? (summary.halfAndHalf || 0) : (summary[cc.key] || 0);
                if (count === 0) return null;
                return (
                  <span key={cc.key} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: cc.bg, color: cc.text, border: `1px solid ${cc.border}` }}>
                    {cc.key === "halfAndHalf" ? "Half & Half" : cc.key.charAt(0).toUpperCase() + cc.key.slice(1)} {count}
                  </span>
                );
              })}
            </div>
            <button onClick={checkAll} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: doneDogs === totalDogs && totalDogs > 0 ? "#10B981" : C.surface, color: doneDogs === totalDogs && totalDogs > 0 ? "#fff" : C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {doneDogs === totalDogs && totalDogs > 0 ? "✓ All Done" : "Check All"}
            </button>
          </div>
          {totalDogs > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((doneDogs / totalDogs) * 100)}%`, height: "100%", borderRadius: 3, background: doneDogs === totalDogs ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: C.textSec }}>{doneDogs}/{totalDogs} complete</div>
        </Card>

        {totalDogs === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut, fontFamily: "inherit" }}>No dogs for {fmtDate(viewDate)}</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {COLLAR_COLORS.map(cc => {
              const sectionDogs = cc.key === "halfAndHalf"
                ? computedDogs.filter(d => d.isHalfAndHalf)
                : computedDogs.filter(d => d.collarColor === cc.key);
              if (sectionDogs.length === 0) return null;
              const sectionDone = sectionDogs.filter(d => collarsCompleted[`g${d.reservationGingrId}`]?.status === "complete").length;
              const isOpen = collarsExpanded[cc.key] !== false; // default open

              return (
                <Card key={cc.key} style={{ padding: 0, overflow: "hidden", border: `1.5px solid ${cc.border}` }}>
                  {/* Section header */}
                  <div
                    onClick={() => setCollarsExpanded(prev => ({ ...prev, [cc.key]: !isOpen }))}
                    style={{ padding: "12px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: cc.bg }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: cc.text }}>{cc.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: cc.text, opacity: 0.7 }}>({sectionDogs.length})</span>
                      <span style={{ fontSize: 11, color: cc.text, opacity: 0.6 }}>{sectionDone}/{sectionDogs.length}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={e => { e.stopPropagation(); checkAllInSection(sectionDogs); }}
                        style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${cc.border}`, background: sectionDone === sectionDogs.length ? cc.text : "rgba(255,255,255,0.8)", color: sectionDone === sectionDogs.length ? "#fff" : cc.text, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {sectionDone === sectionDogs.length ? "✓ Done" : "Check All"}
                      </button>
                      <span style={{ fontSize: 14, color: cc.text, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>{"›"}</span>
                    </div>
                  </div>

                  {/* Dog rows */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${cc.border}` }}>
                      {sectionDogs.map(dog => {
                        const resId = `g${dog.reservationGingrId}`;
                        const isDone = collarsCompleted[resId]?.status === "complete";
                        const isExp = expandedCollar === resId;
                        const showDetails = isBoarding(dog) || dog.isHalfAndHalf;

                        return (
                          <div key={resId} style={{ borderBottom: `1px solid ${cc.border}30` }}>
                            <div
                              style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 12, cursor: showDetails ? "pointer" : "default" }}
                              onClick={() => showDetails && setExpandedCollar(isExp ? null : resId)}
                            >
                              <K9Check checked={isDone} color={cc.text} onChange={() => setCollarStatus(resId, isDone ? "not_started" : "complete")} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: isDone ? C.textMut : C.text, textDecoration: isDone ? "line-through" : "none" }}>{dog.animalName}</span>
                                  <span style={{ fontSize: 12, color: C.textSec }}>{(dog.ownerName || "").split(" ").pop()}</span>
                                  {dog.isHalfAndHalf && cc.key !== "halfAndHalf" && (
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#F3E5F5", color: "#7B1FA2" }}>H&H</span>
                                  )}
                                </div>
                              </div>
                              {isDone && collarsCompleted[resId] && (
                                <span style={{ fontSize: 10, color: C.textMut }}>{collarsCompleted[resId].by}</span>
                              )}
                              {showDetails && (
                                <span style={{ fontSize: 12, color: C.textMut, transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>{"›"}</span>
                              )}
                            </div>

                            {/* Expanded boarding details */}
                            {isExp && showDetails && (
                              <div style={{ padding: "10px 18px 14px 50px", borderTop: `1px solid ${cc.border}20`, background: "rgba(255,255,255,0.5)" }}>
                                {dog.unresolvedReason && (
                                  <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 10, background: "#F9FAFB", border: `1px solid ${C.borderLight}` }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Playgroup Status</div>
                                    <div style={{ fontSize: 12, color: C.text }}>
                                      {dog.unresolvedReason === "conflicting_size_icons"
                                        ? "Conflicting large and small playgroup icons in Gingr."
                                        : dog.unresolvedReason === "evaluation_only"
                                          ? "Only an evaluation icon is present. A size or private-play icon is still required for staffing."
                                          : "A verified playgroup icon is missing in Gingr."}
                                    </div>
                                  </div>
                                )}
                                {Array.isArray(dog.sourceIconTitles) && dog.sourceIconTitles.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Gingr Play Icons</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {dog.sourceIconTitles.map((title) => (
                                        <span key={title} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: C.surfaceAlt || "#F3F4F6", color: C.text }}>
                                          {title}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {Array.isArray(dog.sourceIconComments) && dog.sourceIconComments.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Icon Notes</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      {dog.sourceIconComments.map((comment) => (
                                        <div key={comment} style={{ fontSize: 12, color: C.textSec, fontStyle: "italic" }}>"{comment}"</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                  {dog.roomLabel && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Room</div>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: C.pri }}>{dog.roomLabel}</div>
                                    </div>
                                  )}
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Check-In</div>
                                    <div style={{ fontSize: 12, color: C.text }}>{dog.startDate ? fmtDateShort(dog.startDate) : "—"} {dog.startTime || ""}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Check-Out</div>
                                    <div style={{ fontSize: 12, color: C.text }}>{dog.endDate ? fmtDateShort(dog.endDate) : "—"} {dog.endTime || ""}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Breed</div>
                                    <div style={{ fontSize: 12, color: C.text }}>{dog.breed || "—"}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Weight</div>
                                    <div style={{ fontSize: 12, color: C.text }}>{dog.weight ? `${dog.weight} lbs` : "—"}</div>
                                  </div>
                                  {dog.sizeCategory && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Size</div>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: dog.sizeCategory === "LG" ? "#D97706" : "#2563EB" }}>{dog.sizeCategory}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── Lodging Transfers Report ───────────────────────────────────────────────
  const [transfersCompleted, setTransfersCompleted] = useState({});
  const [expandedTransfer, setExpandedTransfer] = useState(null);

  useEffect(() => {
    if (sub !== "lodging_transfer" || !profile?.location_id) return;
    const key = `ops_lodging_transfer_completions_${viewDate}`;
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", key)
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setTransfersCompleted(rows[0].setting_value);
        } else {
          setTransfersCompleted({});
        }
      });
  }, [sub, viewDate, profile?.location_id]);

  const saveTransfersCompleted = async (newCompleted) => {
    setTransfersCompleted(newCompleted);
    if (!profile?.location_id) return;
    const key = `ops_lodging_transfer_completions_${viewDate}`;
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: key,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
    const eid = `ops_lodging_transfer_${viewDate}`;
    const ltEntry = allOps.find(e => e.id === eid);
    if (ltEntry?.computed_items) {
      const completedCount = Object.values(newCompleted).filter(c => c && c.status === "complete").length;
      await supabase.from("lite_daily_ops").update({
        computed_items: { ...ltEntry.computed_items, completions: newCompleted, completedCount, totalCount: (ltEntry.computed_items.transfers || []).length },
        computed_at: new Date().toISOString(),
      }).eq("id", eid).eq("location_id", profile.location_id);
    }
  };

  const renderLodgingTransfers = () => {
    const ltEntry = allOps.find(e => e.id === `ops_lodging_transfer_${viewDate}`);
    const transfers = ltEntry?.computed_items?.transfers || [];
    const totalTransfers = transfers.length;
    const doneTransfers = Object.values(transfersCompleted).filter(c => c && c.status === "complete").length;

    if (totalTransfers === 0 && !ltEntry) {
      return (
        <div>
          <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>Lodging Transfers</span>
          </Card>
          <Card style={{ padding: "48px 20px", textAlign: "center" }}>
            <K9LoadingAnimation size={64} message="Loading transfer data..." subMessage="Waiting for server data" />
          </Card>
        </div>
      );
    }

    const setTransferStatus = (transferKey, status) => {
      const nc = { ...transfersCompleted };
      if (status === "not_started") { delete nc[transferKey]; }
      else { nc[transferKey] = { status, by: profile?.name || profile?.full_name || profile?.email || "Staff", at: new Date().toISOString() }; }
      saveTransfersCompleted(nc);
    };

    const setActionItemStatus = (transferKey, actionIdx, checked) => {
      const nc = { ...transfersCompleted };
      if (!nc[transferKey]) nc[transferKey] = { status: "in_progress", by: profile?.name || profile?.full_name || profile?.email || "Staff", at: new Date().toISOString(), actions: {} };
      if (!nc[transferKey].actions) nc[transferKey].actions = {};
      nc[transferKey].actions[actionIdx] = checked;
      // Check if ALL action items are done
      const transfer = transfers.find(t => `t_${t.reservationGingrId}` === transferKey);
      if (transfer) {
        const allDone = transfer.actionItems.every((_, i) => nc[transferKey].actions[i]);
        if (allDone) {
          nc[transferKey].status = "complete";
        } else {
          nc[transferKey].status = "in_progress";
        }
      }
      saveTransfersCompleted(nc);
    };

    return (
      <div>
        {/* Summary Header */}
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "inherit" }}>
                {totalTransfers} Transfer{totalTransfers !== 1 ? "s" : ""}
              </span>
              {transfers.some(t => t.roomTypeChanged) && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                  {transfers.filter(t => t.roomTypeChanged).length} room type change{transfers.filter(t => t.roomTypeChanged).length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          {totalTransfers > 0 && (
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((doneTransfers / totalTransfers) * 100)}%`, height: "100%", borderRadius: 3, background: doneTransfers === totalTransfers ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: C.textSec }}>{doneTransfers}/{totalTransfers} fully handled</div>
        </Card>

        {totalTransfers === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: C.textMut, fontFamily: "inherit" }}>No lodging transfers detected for {fmtDate(viewDate)}</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {transfers.map(transfer => {
              const tKey = `t_${transfer.reservationGingrId}`;
              const completion = transfersCompleted[tKey] || {};
              const isDone = completion.status === "complete";
              const isExp = expandedTransfer === tKey;
              const actions = completion.actions || {};

              const sc = isDone
                ? { border: "#10B981", bg: "#F0FDF4", badge: "#10B981", badgeText: "#fff", label: "Done" }
                : Object.keys(actions).length > 0
                ? { border: "#F59E0B", bg: "#FFFBEB", badge: "#F59E0B", badgeText: "#fff", label: "In Progress" }
                : { border: C.border, bg: C.surface, badge: C.borderLight, badgeText: C.textMut, label: "Pending" };

              return (
                <Card key={tKey} style={{ padding: 0, overflow: "hidden", border: `1.5px solid ${sc.border}`, background: sc.bg, transition: "all 0.2s" }}>
                  {/* Collapsed row */}
                  <div
                    onClick={() => setExpandedTransfer(isExp ? null : tKey)}
                    style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: transfer.roomTypeChanged ? "#FEF3C7" : C.borderLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
                      {transfer.roomTypeChanged ? "!" : "\u2192"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{transfer.animalName}</span>
                        <span style={{ fontSize: 12, color: C.textSec }}>{(transfer.ownerName || "").split(" ").pop()}</span>
                        {transfer.roomTypeChanged && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>TYPE CHANGE</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontWeight: 600, color: "#DC2626" }}>{transfer.previousRoom}</span>
                        <span style={{ color: C.textMut }}>{"\u2192"}</span>
                        <span style={{ fontWeight: 600, color: "#059669" }}>{transfer.currentRoom}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: sc.badge, color: sc.badgeText, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>{sc.label}</span>
                    <span style={{ fontSize: 14, color: C.textMut, transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>{"\u203A"}</span>
                  </div>

                  {/* Expanded detail section */}
                  {isExp && (
                    <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "16px 18px" }}>
                      {/* Details grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Dog</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{transfer.animalName}</div>
                          <div style={{ fontSize: 12, color: C.textSec }}>{transfer.breed || "\u2014"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Owner</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{transfer.ownerName || "\u2014"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Weight</div>
                          <div style={{ fontSize: 13, color: C.text }}>{transfer.weight ? `${transfer.weight} lbs` : "\u2014"} {transfer.sizeCategory ? `(${transfer.sizeCategory})` : ""}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Reservation</div>
                          <div style={{ fontSize: 13, color: C.text }}>{transfer.reservationType || "\u2014"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Transfer Date</div>
                          <div style={{ fontSize: 13, color: C.text }}>{transfer.transferDate ? fmtDate(transfer.transferDate) : "\u2014"}</div>
                        </div>
                      </div>

                      {/* Room change highlight */}
                      <div style={{ padding: "12px 16px", borderRadius: 10, background: transfer.roomTypeChanged ? "#FEF3C7" : "#EFF6FF", border: `1.5px solid ${transfer.roomTypeChanged ? "#FDE68A" : "#BFDBFE"}`, marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: transfer.roomTypeChanged ? "#92400E" : "#1E40AF", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Room Transfer</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, textAlign: "center", padding: "8px 12px", borderRadius: 8, background: "#FEE2E2", border: "1px solid #FECACA" }}>
                            <div style={{ fontSize: 11, color: "#991B1B", fontWeight: 600 }}>FROM</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#DC2626" }}>{transfer.previousRoom}</div>
                            {transfer.previousRoomType && <div style={{ fontSize: 10, color: "#991B1B", marginTop: 2 }}>{transfer.previousRoomType}</div>}
                          </div>
                          <span style={{ fontSize: 20, color: C.textMut, flexShrink: 0 }}>{"\u2192"}</span>
                          <div style={{ flex: 1, textAlign: "center", padding: "8px 12px", borderRadius: 8, background: "#D1FAE5", border: "1px solid #A7F3D0" }}>
                            <div style={{ fontSize: 11, color: "#065F46", fontWeight: 600 }}>TO</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{transfer.currentRoom}</div>
                            {transfer.currentRoomType && <div style={{ fontSize: 10, color: "#065F46", marginTop: 2 }}>{transfer.currentRoomType}</div>}
                          </div>
                        </div>
                      </div>

                      {/* Action items checklist */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Action Items</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(transfer.actionItems || []).map((item, idx) => {
                          const isChecked = !!actions[idx];
                          return (
                            <div key={idx}
                              onClick={() => setActionItemStatus(tKey, idx, !isChecked)}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: isChecked ? "#F0FDF4" : C.bg, border: `1px solid ${isChecked ? "#A7F3D0" : C.border}`, cursor: "pointer", transition: "all 0.15s" }}
                            >
                              <K9Check checked={isChecked} color="#10B981" onChange={() => setActionItemStatus(tKey, idx, !isChecked)} />
                              <span style={{ fontSize: 13, color: isChecked ? C.textMut : C.text, textDecoration: isChecked ? "line-through" : "none", flex: 1 }}>{item}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Quick complete button */}
                      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setTransferStatus(tKey, isDone ? "not_started" : "complete")}
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid #10B981`, background: isDone ? "#10B981" : "transparent", color: isDone ? "#fff" : "#10B981", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
                        >
                          {isDone ? "Marked Complete" : "Mark All Complete"}
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
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
  const getGenericServiceSettingKey = useCallback((name, date) => {
    const lower = String(name || "").toLowerCase();
    const keyName = lower.includes("ice cream") || lower.includes("gourmet")
      ? "Ice_Cream"
      : String(name || "").replace(/[^a-zA-Z0-9]/g, "_");
    return `ops_svc_${keyName}_${date}`;
  }, []);

  useEffect(() => {
    if (!sub?.startsWith?.("svc") || !svcName || !profile?.location_id) return;
    const entryId = getGenericServiceSettingKey(svcName, viewDate);
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
  }, [sub, svcName, viewDate, profile?.location_id, getGenericServiceSettingKey]);

  const saveGenericSvcCompleted = async (newCompleted) => {
    setGenericSvcCompleted(newCompleted);
    if (!profile?.location_id || !svcName) return;
    const entryId = getGenericServiceSettingKey(svcName, viewDate);
    await supabase.from("lite_settings").upsert({
      location_id: profile.location_id,
      setting_key: entryId,
      setting_value: newCompleted,
    }, { onConflict: "location_id,setting_key" });
  };

  const renderGenericService = () => {
    if (!svcName) return <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown service</div></Card>;

    const svcRows = [];

    // Use server-computed data from ops-compute when available (preserves historical data
    // including daycare dogs that may have checked out)
    const svcEntry = allOps.find(e => e.id === `ops_svc_${viewDate}`);
    const isEnrichmentService = svcName.toLowerCase() === "enrichment";
    const computedDogs = isEnrichmentService ? (svcEntry?.computed_items?.dogs || []) : [];

    if (computedDogs.length > 0) {
      // Server-computed path: use the snapshot (includes daycare + boarding + suggested)
      computedDogs.forEach(d => {
        const resId = d.animalId || d.animalName || "";
        const completedInfo = genericSvcCompleted[resId];
        const isDone = !!completedInfo;
        svcRows.push({
          resId,
          dogName: d.animalName || "Unknown",
          roomNum: d.roomLabel || "—",
          ownerName: d.ownerName || "Unknown",
          isDone,
          completedInfo,
          matchCount: (d.services || []).length || 1,
          resType: "",
          roomType: "",
          isSuggested: !!d.isSuggested,
          reason: d.reason || "",
        });
      });
    } else {
      // Client-side fallback: use live reservation data
      const reservations = data.reservations || [];
      const dogs = data.dogs || [];
      const inHouse = reservations.filter(r =>
        (r.status === "checked-in" || r.status === "upcoming") &&
        r.checkIn <= viewDate && r.checkOut >= viewDate
      );
      inHouse.forEach(res => {
        const names = getSvcNames(res._services);
        // For enrichment, use case-insensitive includes to match variants like "Enrichment Activity"
        const isEnrichmentSvc = isEnrichmentService;
        const matchCount = isEnrichmentSvc
          ? names.filter(n => n.toLowerCase().includes("enrichment")).length
          : names.filter(n => n === svcName).length;
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
    }
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

    const suggestedCount = svcRows.filter(r => r.isSuggested).length;
    const scheduledCount = total - suggestedCount;

    return (
      <div>
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{svcName}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{done}/{total} complete</span>
            {suggestedCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "#FEF3C7", color: "#D97706" }}>
                +{suggestedCount} suggested
              </span>
            )}
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
                      background: row.isDone ? "#F0FDF4" : row.isSuggested ? "#FFFBEB" : "transparent",
                      transition: "background 0.2s",
                    }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: C.text }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {row.dogName}
                          {row.isSuggested && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "#FEF3C7", color: "#D97706" }}>Suggested</span>}
                        </div>
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
        : sub === "belongings" ? renderBelongings()
        : sub === "collars" ? renderCollars()
        : sub === "lodging_transfer" ? renderLodgingTransfers()
        : sub === "pamper" ? renderPamper()
        : sub === "svc" ? renderGenericService()
        : <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown checklist type</div></Card>}
      {dirty && !isLocked && sub !== "room_cleaning" && <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", marginTop: 20 }}>
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

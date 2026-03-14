// K9 Operations — LiteEODPage
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

function LiteEODPage({ data, save, nav, profile, addGlobalToast }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const isToday = viewDate === td;
  const shiftDate = (days) => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() + days); setViewDate(d.toISOString().split("T")[0]); };
  const viewDateLabel = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // Calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date(viewDate + "T12:00:00").getMonth());
  const [calYear, setCalYear] = useState(() => new Date(viewDate + "T12:00:00").getFullYear());
  useEffect(() => { const d = new Date(viewDate + "T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => { const first = new Date(calYear, calMonth, 1); const startDay = first.getDay(); const dim = new Date(calYear, calMonth + 1, 0).getDate(); const cells = []; for (let i = 0; i < startDay; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d); return cells; }, [calMonth, calYear]);
  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => { const m = String(calMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); setViewDate(`${calYear}-${m}-${d}`); setShowCalendar(false); };
  const calRef = useRef(null);
  useEffect(() => { if (!showCalendar) return; const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }; document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }, [showCalendar]);

  // EOD template (customizable in settings in the future, default for now)
  const template = data.eodTemplate || DEF_LITE_EOD_TEMPLATE;

  // Load persisted custom template from Supabase
  const [customTemplate, setCustomTemplate] = useState(null);
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "eod_template").then(({ data: rows }) => {
      if (rows && rows.length > 0 && Array.isArray(rows[0].setting_value)) setCustomTemplate(rows[0].setting_value);
    });
  }, []);
  const activeTemplate = customTemplate || template;

  // Get or create EOD entry for this date
  const existing = (data.eodEntries || []).find(e => e.date === viewDate);
  const entry = existing || {
    type: "eod", id: "eod_" + viewDate, date: viewDate, locked: false,
    sections: activeTemplate.map(t => ({ id: t.id, content: t.defaultContent || "" })),
    mentions: [], history: [{ ts: new Date().toISOString(), action: "created" }],
  };
  const isPastDay = viewDate < td;
  const isLocked = isPastDay || (existing ? existing.locked : false);

  // Previous day entry (for copy feature)
  const prevDateStr = useMemo(() => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; }, [viewDate]);
  const prevDayEntry = (data.eodEntries || []).find(e => e.date === prevDateStr);

  // Section content management
  const [editSections, setEditSections] = useState({});
  const [focusedSecId, setFocusedSecId] = useState(null);
  const lastSavedSecRef = useRef({});
  const userEditedRef = useRef(false);
  useEffect(() => {
    const obj = {};
    entry.sections.forEach(s => { obj[s.id] = s.content || ""; });
    setEditSections(obj);
    lastSavedSecRef.current = { ...obj };
    userEditedRef.current = false;
  }, [viewDate]);

  // Merge remote changes into sections the user is NOT focused on
  const existingSectionsKey = existing ? JSON.stringify((existing.sections || []).map(s => s.id + ":" + (s.content || "").length)) : "";
  useEffect(() => {
    if (!existing || !existing.sections) return;
    setEditSections(prev => {
      const next = { ...prev };
      let changed = false;
      existing.sections.forEach(s => {
        if (s.id !== focusedSecId && s.content !== lastSavedSecRef.current[s.id]) {
          next[s.id] = s.content;
          lastSavedSecRef.current[s.id] = s.content;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [existingSectionsKey]);

  const updateSection = (secId, content) => { userEditedRef.current = true; setEditSections(prev => ({ ...prev, [secId]: content })); };

  // Editing checklist items inline
  const [editingCheckItem, setEditingCheckItem] = useState(null);

  // Staff name for attribution
  const staffName = profile?.full_name || profile?.email || "Staff";

  // Audit helper
  const mkAudit = (auditAction, details, prev, next) => ({
    ts: new Date().toISOString(), type: "audit", id: gid(),
    userId: profile?.id || "unknown", userName: staffName,
    auditAction, details, previousValue: prev || null, newValue: next || null,
  });

  // Auto-save (debounced 800ms)
  const eodAutoSaveRef = useRef(null);
  const saveEOD = useCallback(() => {
    const prevSections = entry.sections || [];
    const newHistory = [...(entry.history || [])];
    const sections = activeTemplate.map(t => {
      const content = editSections[t.id] || "";
      const prev = prevSections.find(s => s.id === t.id);
      const prevContent = prev?.content || "";
      const editedBy = content !== prevContent ? { name: staffName, at: new Date().toISOString() } : (prev?.editedBy || null);
      if (content !== prevContent && prevContent.trim() !== "" && content.trim() !== "") {
        newHistory.push(mkAudit("EDIT_SECTION", `Edited "${t.title || t.id}" section`, prevContent.length > 200 ? prevContent.slice(0, 200) + "..." : prevContent, content.length > 200 ? content.slice(0, 200) + "..." : content));
      } else if (content.trim() && !prevContent.trim()) {
        newHistory.push(mkAudit("ADD_CONTENT", `Added content to "${t.title || t.id}" section`, null, content.length > 200 ? content.slice(0, 200) + "..." : content));
      }
      return { id: t.id, content, ...(editedBy ? { editedBy } : {}) };
    });
    newHistory.push({ ts: new Date().toISOString(), action: "saved" });
    const newEntry = { ...entry, sections, mentions: entry.mentions || [], history: newHistory };
    const entries = [...(data.eodEntries || [])];
    const idx = entries.findIndex(e => e.date === viewDate);
    if (idx >= 0) entries[idx] = newEntry; else entries.push(newEntry);
    const savedObj = {};
    sections.forEach(s => { savedObj[s.id] = s.content; });
    lastSavedSecRef.current = savedObj;
    save({ ...data, eodEntries: entries });
  }, [editSections, entry, viewDate, data, activeTemplate, staffName, profile]);

  useEffect(() => {
    if (isLocked || !userEditedRef.current) return;
    if (eodAutoSaveRef.current) clearTimeout(eodAutoSaveRef.current);
    eodAutoSaveRef.current = setTimeout(() => { saveEOD(); }, 800);
    return () => { if (eodAutoSaveRef.current) clearTimeout(eodAutoSaveRef.current); };
  }, [editSections]);

  // Lock/unlock
  const toggleLock = async () => {
    if (isPastDay && isLocked) return;
    const entries = [...(data.eodEntries || [])];
    const idx = entries.findIndex(e => e.date === viewDate);
    if (idx >= 0) {
      const wasLocked = entries[idx].locked;
      entries[idx] = { ...entries[idx], locked: !wasLocked, history: [...(entries[idx].history || []), mkAudit(wasLocked ? "UNLOCK_DAY" : "LOCK_DAY", wasLocked ? `Unlocked EOD for ${viewDate}` : `Locked EOD for ${viewDate}`, wasLocked ? "Locked" : "Unlocked", wasLocked ? "Unlocked" : "Locked")] };
      await save({ ...data, eodEntries: entries });
    } else {
      const sections = activeTemplate.map(t => ({ id: t.id, content: editSections[t.id] || "" }));
      entries.push({ ...entry, sections, locked: true, history: [...(entry.history || []), mkAudit("LOCK_DAY", `Locked EOD for ${viewDate}`, null, "Locked")] });
      await save({ ...data, eodEntries: entries });
    }
  };

  // History panel
  const [showHistory, setShowHistory] = useState(false);
  // Guide
  const [showEODGuide, setShowEODGuide] = useState(false);
  // Audit log panel
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const eodAuditEntries = useMemo(() => (entry.history || []).filter(h => h.type === "audit").sort((a, b) => (b.ts || "").localeCompare(a.ts || "")), [entry.history]);

  // EOD Template Editor State
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  const openTemplateEditor = () => {
    setEditTemplate(activeTemplate.map(t => ({ ...t })));
    setTemplateDirty(false);
    setShowTemplateEditor(true);
  };

  const moveTemplateSection = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editTemplate.length) return;
    const items = [...editTemplate];
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const updateTemplateSection = (idx, field, value) => {
    const items = [...editTemplate];
    items[idx] = { ...items[idx], [field]: value };
    setEditTemplate(items);
    setTemplateDirty(true);
  };

  const removeTemplateSection = (idx) => {
    setEditTemplate(editTemplate.filter((_, i) => i !== idx));
    setTemplateDirty(true);
  };

  const addTemplateSection = () => {
    const newId = `custom_${Date.now()}`;
    setEditTemplate([...editTemplate, { id: newId, title: "New Section", emoji: "📝", type: "text", defaultContent: "" }]);
    setTemplateDirty(true);
  };

  const saveTemplate = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "eod_template",
      setting_value: editTemplate,
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,setting_key" });
    if (!error) {
      setCustomTemplate(editTemplate);
      setTemplateDirty(false);
      setShowTemplateEditor(false);
      if (addGlobalToast) addGlobalToast("EOD template saved", "success");
    }
    setTemplateSaving(false);
  };

  const resetTemplate = async () => {
    setTemplateSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    await supabase.from("lite_settings").delete().eq("location_id", locationId).eq("setting_key", "eod_template");
    setCustomTemplate(null);
    setTemplateDirty(false);
    setShowTemplateEditor(false);
    setTemplateSaving(false);
    if (addGlobalToast) addGlobalToast("EOD template reset to defaults", "success");
  };

  // Calendar dots for days with saved EOD
  const eodDates = useMemo(() => new Set((data.eodEntries || []).map(e => e.date)), [data.eodEntries]);


  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={() => nav("ops-hub")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>{"← Operations"}</button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>End of Day Report</h1>
          <button onClick={() => setShowEODGuide(v => !v)} style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${showEODGuide ? C.pri : C.border}`, background: showEODGuide ? C.priLt : "transparent", color: showEODGuide ? C.pri : C.textMut, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1, transition: "all 0.15s" }} title="How EOD Reports work">?</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" size="sm" onClick={openTemplateEditor}>Customize Template</Btn>
          {isPastDay && isLocked ? <Btn variant="secondary" size="sm" disabled style={{opacity:0.5,cursor:"not-allowed"}}>{"🔒 Locked"}</Btn> : <Btn variant="secondary" onClick={toggleLock} size="sm">{isLocked ? "🔒 Locked" : "🔓 Lock Day"}</Btn>}
        </div>
      </div>

      {/* New Hire Guide */}
      {showEODGuide && (
        <div style={{ marginBottom: 16, padding: "20px 22px", borderRadius: 12, border: `1.5px solid ${C.priLt}`, background: `linear-gradient(135deg, ${C.priLt}40, ${C.surface})`, fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.pri, marginBottom: 10 }}>How EOD Reports Work</div>
          <div style={{ marginBottom: 10 }}>
            The End of Day (EOD) Report is a <span style={{ fontWeight: 700, color: C.text }}>daily log</span> completed at the end of each shift. It's how the team communicates what happened during the day — from sales and alerts to individual dog notes and building issues.
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Daily workflow:</div>
          <div style={{ paddingLeft: 14, marginBottom: 10 }}>
            <div><span style={{ fontWeight: 700 }}>1. A new EOD auto-creates each day</span> — pre-filled with all the template sections. Just fill in the blanks as the day goes on.</div>
            <div><span style={{ fontWeight: 700 }}>2. Add notes to each section</span> — Sales totals, meds administered, daycare notes, incidents, leads, tours, etc. Fill in what applies, leave the rest blank.</div>
            <div><span style={{ fontWeight: 700 }}>3. Auto-saves as you type</span> — Your notes are saved automatically. Multiple people can add to it throughout the day.</div>
            <div><span style={{ fontWeight: 700 }}>4. Lock at end of day</span> — When the EOD is complete, lock it so it can't be accidentally edited. Locked days can be unlocked by a manager if needed.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Other features:</div>
          <div style={{ paddingLeft: 14, marginBottom: 8 }}>
            <div><span style={{ fontWeight: 700 }}>History</span> — Click "History" to see when the EOD was saved and locked/unlocked, with timestamps.</div>
            <div><span style={{ fontWeight: 700 }}>Calendar</span> — Use the calendar icon to jump to any past EOD. Gold dots indicate days that have saved reports.</div>
            <div><span style={{ fontWeight: 700 }}>Template</span> — Click "Customize Template" to add, remove, reorder, and edit section names and default content.</div>
          </div>
          <div style={{ fontSize: 11, color: C.textMut, fontStyle: "italic", borderTop: `1px solid ${C.borderLight || C.border}`, paddingTop: 8, marginTop: 4 }}>Tip: Get in the habit of adding notes throughout the day instead of trying to remember everything at close. Future you (and the morning shift) will thank you.</div>
        </div>
      )}

      {/* Date Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 20, position: "relative" }}>
        <button onClick={() => shiftDate(-1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0 }} title="Previous day">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, padding: "4px 2px", whiteSpace: "nowrap" }}>{viewDateLabel}</span>
        <button onClick={() => shiftDate(1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontFamily: "inherit", padding: 0 }} title="Next day">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button onClick={() => setShowCalendar(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${showCalendar ? C.pri : C.border}`, background: showCalendar ? C.priLt : C.surface, cursor: "pointer", color: showCalendar ? C.pri : C.textSec, fontFamily: "inherit", padding: 0, transition: "all 0.15s" }} title="Open calendar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        {!isToday && <button onClick={() => setViewDate(td)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Today</button>}
        {existing && <button onClick={() => setShowHistory(v => !v)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{showHistory ? "Hide History" : "History"}</button>}
        {isLocked && <Badge color="warning" size="sm">Read-only</Badge>}

        {/* Calendar Popup */}
        {showCalendar && (
          <div ref={calRef} style={{ position: "absolute", top: "100%", left: 28, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={calPrev} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
              <button onClick={calNext} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
              {calDays.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const m = String(calMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0");
                const dateStr = `${calYear}-${m}-${d}`; const isSelected = dateStr === viewDate; const isTodayCell = dateStr === td;
                const hasEOD = eodDates.has(dateStr);
                return (
                  <button key={i} onClick={() => calSelect(day)} style={{ width: 34, height: 34, borderRadius: 10, border: isSelected ? `2px solid ${C.pri}` : isTodayCell ? `2px solid ${C.acc}` : "2px solid transparent", background: isSelected ? C.pri : "transparent", color: isSelected ? "#fff" : isTodayCell ? C.acc : C.text, fontSize: 13, fontWeight: isSelected || isTodayCell ? 700 : 500, cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto", transition: "all 0.1s" }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surfaceHover; }} onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
                    {day}
                    {hasEOD && !isSelected && <div style={{ width: 4, height: 4, borderRadius: 2, background: C.acc, marginTop: 1 }} />}
                  </button>
                );
              })}
            </div>
            {!isToday && <div style={{ textAlign: "center", marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}><button onClick={() => { setViewDate(td); setShowCalendar(false); }} style={{ fontSize: 12, fontWeight: 700, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Go to Today</button></div>}
          </div>
        )}
      </div>

      {/* Edit History */}
      {showHistory && existing && (
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Edit History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(existing.history || []).filter(h => !h.type || h.type !== "audit").map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: C.textSec }}>
                <span style={{ fontWeight: 600, color: C.textMut }}>{new Date(h.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(h.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                {" — "}{h.action.charAt(0).toUpperCase() + h.action.slice(1)}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && editTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto", padding: "24px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Customize EOD Template</h2>
              <button onClick={() => setShowTemplateEditor(false)} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0, fontSize: 16 }}>{"✕"}</button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec }}>Add, remove, reorder sections. Changes affect all future EOD reports for this location.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {editTemplate.map((sec, idx) => (
                <div key={sec.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.bg, border: `1.5px solid ${C.border}` }}>
                  <input value={sec.emoji} onChange={e => updateTemplateSection(idx, "emoji", e.target.value)} style={{ width: 36, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px", fontSize: 16, background: C.surface, fontFamily: "inherit" }} />
                  <input value={sec.title} onChange={e => updateTemplateSection(idx, "title", e.target.value)} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, background: C.surface, color: C.text, fontFamily: "inherit" }} />
                  <select value={sec.type} onChange={e => updateTemplateSection(idx, "type", e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, background: C.surface, color: C.text, fontFamily: "inherit" }}>
                    <option value="text">Text</option>
                    <option value="checklist">Checklist</option>
                  </select>
                  <button onClick={() => moveTemplateSection(idx, -1)} disabled={idx === 0} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === 0 ? C.textMut : C.text, fontSize: 12, cursor: idx === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => moveTemplateSection(idx, 1)} disabled={idx === editTemplate.length - 1} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: idx === editTemplate.length - 1 ? C.textMut : C.text, fontSize: 12, cursor: idx === editTemplate.length - 1 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === editTemplate.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button onClick={() => removeTemplateSection(idx)} style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="secondary" size="sm" onClick={addTemplateSection}>+ Add Section</Btn>
              <div style={{ flex: 1 }} />
              <button onClick={resetTemplate} disabled={templateSaving} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reset to Default</button>
              <Btn onClick={saveTemplate} disabled={!templateDirty || templateSaving}>{templateSaving ? "Saving\u2026" : "Save Template"}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {activeTemplate.map(sec => {
          const content = editSections[sec.id] ?? "";
          const isChecklist = (sec.type || "text") === "checklist";

          // Checklist helpers
          const parseChecklistItems = (text) => {
            if (!text) return [];
            return text.split("\n").filter(l => l.trim()).map(line => {
              const checked = line.startsWith("[x] ");
              const label = line.replace(/^\[[ x]\] /, "");
              return { checked, label };
            });
          };
          const toggleCheckItem = (idx) => {
            const items = parseChecklistItems(content);
            items[idx] = { ...items[idx], checked: !items[idx].checked };
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const removeCheckItem = (idx) => {
            const items = parseChecklistItems(content);
            items.splice(idx, 1);
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const editCheckItemLabel = (idx, newLabel) => {
            const items = parseChecklistItems(content);
            items[idx] = { ...items[idx], label: newLabel };
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const addCheckItem = (label) => {
            if (!label.trim()) return;
            const items = parseChecklistItems(content);
            items.push({ checked: false, label: label.trim() });
            updateSection(sec.id, items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n"));
          };
          const checklistItems = isChecklist ? parseChecklistItems(content) : [];
          const checkedCount = checklistItems.filter(it => it.checked).length;

          return (
            <Card key={sec.id} style={{ padding: 0, overflow: "visible" }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`, borderRadius: "14px 14px 0 0" }}>
                <span style={{ fontSize: 16 }}>{sec.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>{sec.title}</span>
                {isChecklist && checklistItems.length > 0 && <Badge color={checkedCount === checklistItems.length ? "success" : "default"} size="sm">{checkedCount}/{checklistItems.length}</Badge>}
                {/* Copy from previous day */}
                {!isLocked && (() => {
                  const prevSec = (prevDayEntry?.sections || []).find(s => s.id === sec.id);
                  const prevContent = prevSec?.content || "";
                  const hasPrev = prevContent.trim().length > 0;
                  return (
                    <button disabled={!hasPrev}
                      onClick={(e) => { e.stopPropagation(); if (!hasPrev) return; if (!content.trim() || window.confirm(`Replace current content in "${sec.title}" with content from ${new Date(prevDateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}?`)) { updateSection(sec.id, prevContent); } }}
                      title={hasPrev ? `Copy from ${new Date(prevDateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : "No content from previous day"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: hasPrev ? "pointer" : "not-allowed", fontSize: 10, fontWeight: 600, color: C.textSec, fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", opacity: hasPrev ? 1 : 0.4 }}
                      onMouseEnter={e => { if (hasPrev) { e.currentTarget.style.background = C.priLt; e.currentTarget.style.color = C.pri; e.currentTarget.style.borderColor = C.pri; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.textSec; e.currentTarget.style.borderColor = C.border; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy prev day
                    </button>
                  );
                })()}
              </div>

              {/* Section body */}
              <div style={{ padding: "12px 16px", position: "relative" }}>
                {isChecklist ? (
                  /* Checklist mode */
                  <div>
                    {checklistItems.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {checklistItems.map((item, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", borderRadius: 8, transition: "background 0.1s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                            <button onClick={() => !isLocked && toggleCheckItem(idx)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.checked ? C.suc : C.border}`, background: item.checked ? C.suc : "transparent", cursor: isLocked ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, transition: "all 0.15s" }}>
                              {item.checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </button>
                            {!isLocked && editingCheckItem && editingCheckItem.secId === sec.id && editingCheckItem.idx === idx ? (
                              <input autoFocus value={item.label} onChange={e => editCheckItemLabel(idx, e.target.value)}
                                onBlur={() => setEditingCheckItem(null)}
                                onKeyDown={e => { if (e.key === "Enter") setEditingCheckItem(null); }}
                                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", color: item.checked ? C.textMut : C.text, textDecoration: item.checked ? "line-through" : "none", background: "transparent", padding: 0 }} />
                            ) : (
                              <span onClick={() => { if (!isLocked) setEditingCheckItem({ secId: sec.id, idx }); }} style={{ flex: 1, fontSize: 13, color: item.checked ? C.textMut : C.text, textDecoration: item.checked ? "line-through" : "none", cursor: isLocked ? "default" : "text", whiteSpace: "pre-wrap" }}>{item.label}</span>
                            )}
                            {!isLocked && (
                              <button onClick={() => removeCheckItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: "2px 4px", fontSize: 14, lineHeight: 1, opacity: 0.5, transition: "opacity 0.1s" }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = C.dan; }} onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = C.textMut; }}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {!isLocked && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: checklistItems.length > 0 ? 6 : 0, padding: "4px 4px" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.5 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <input placeholder="Add item..." onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) { addCheckItem(e.target.value); e.target.value = ""; } }}
                          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", color: C.text, background: "transparent", padding: 0 }} />
                      </div>
                    )}
                    {isLocked && checklistItems.length === 0 && <span style={{ fontSize: 13, color: C.textMut, fontStyle: "italic" }}>No items</span>}
                  </div>
                ) : isLocked ? (
                  /* Text mode: locked */
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, minHeight: 24, whiteSpace: "pre-wrap" }}>
                    {content || <span style={{ color: C.textMut, fontStyle: "italic" }}>Empty</span>}
                  </div>
                ) : (
                  /* Text mode: editable */
                  <textarea value={content} onChange={(e) => updateSection(sec.id, e.target.value)}
                    onFocus={() => setFocusedSecId(sec.id)} onBlur={() => setFocusedSecId(f => f === sec.id ? null : f)}
                    placeholder={sec.defaultContent || "Type here..."}
                    style={{ width: "100%", minHeight: 40, padding: 0, border: "none", outline: "none", fontSize: 13, color: C.text, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", background: "transparent", boxSizing: "border-box" }} />
                )}
                {/* Edited-by attribution */}
                {(() => { const secData = (entry.sections || []).find(s => s.id === sec.id); return secData?.editedBy ? (
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 6, fontStyle: "italic" }}>Last edited by {secData.editedBy.name}{secData.editedBy.at ? ` · ${new Date(secData.editedBy.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</div>
                ) : null; })()}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, padding: "16px 0", borderTop: `1px solid ${C.border}` }}>
        <Btn variant="secondary" size="sm" onClick={() => setShowAuditLog(v => !v)}>
          {showAuditLog ? "Hide Audit Log" : "Audit Log"} {eodAuditEntries.length > 0 && `(${eodAuditEntries.length})`}
        </Btn>
        {!isLocked && <Btn variant="secondary" onClick={toggleLock}>Lock Day</Btn>}
      </div>

      {/* Audit Log Panel */}
      {showAuditLog && (
        <Card style={{ marginTop: 8, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Audit Log</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{viewDateLabel} — {eodAuditEntries.length} audit {eodAuditEntries.length === 1 ? "entry" : "entries"}</div>
            </div>
          </div>
          {eodAuditEntries.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>
              No audit entries yet for this day. All edits and lock/unlock actions will be recorded here.
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {eodAuditEntries.map((ae, idx) => {
                const actionColors = {
                  EDIT_SECTION: { bg: "#DBEAFE", color: "#2563EB", label: "Edited" },
                  ADD_CONTENT: { bg: "#D1FAE5", color: "#059669", label: "Added" },
                  COPY_PREV_DAY: { bg: "#E0F2FE", color: "#0369A1", label: "Copied" },
                  LOCK_DAY: { bg: "#FEF3C7", color: "#D97706", label: "Locked" },
                  UNLOCK_DAY: { bg: "#FEE2E2", color: "#DC2626", label: "Unlocked" },
                };
                const ac = actionColors[ae.auditAction] || { bg: C.bg, color: C.textSec, label: ae.auditAction || "Action" };
                const formatTs = (ts) => { if (!ts) return "—"; const d = new Date(ts); return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }); };
                const expanded = expandedAuditId === (ae.id || idx);
                return (
                  <div key={ae.id || idx} style={{ borderBottom: idx < eodAuditEntries.length - 1 ? `1px solid ${C.border}` : "none", padding: "12px 20px", cursor: ae.previousValue || ae.newValue ? "pointer" : "default", transition: "background 0.1s" }}
                    onClick={() => { if (ae.previousValue || ae.newValue) setExpandedAuditId(expanded ? null : (ae.id || idx)); }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FAFBFC"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 90, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{formatTs(ae.ts)}</div>
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ae.userName}</div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: ac.bg, color: ac.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>{ac.label}</span>
                      </div>
                      <div style={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{ae.details}</div>
                      {(ae.previousValue || ae.newValue) && <div style={{ flexShrink: 0, fontSize: 10, color: C.textMut, transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</div>}
                    </div>
                    {expanded && (ae.previousValue || ae.newValue) && (
                      <div style={{ marginTop: 10, marginLeft: 102, display: "flex", gap: 16, fontSize: 11 }}>
                        {ae.previousValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#FEE2E2", border: "1px solid #FECACA" }}>
                            <div style={{ fontWeight: 700, color: "#DC2626", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>Previous</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 11, color: "#7F1D1D" }}>{typeof ae.previousValue === "string" ? ae.previousValue : JSON.stringify(ae.previousValue, null, 2)}</pre>
                          </div>
                        )}
                        {ae.newValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#D1FAE5", border: "1px solid #A7F3D0" }}>
                            <div style={{ fontWeight: 700, color: "#059669", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>New</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 11, color: "#064E3B" }}>{typeof ae.newValue === "string" ? ae.newValue : JSON.stringify(ae.newValue, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── DAILY OPERATIONS PAGE (from POS App) ───────────────────────────────────

export default LiteEODPage;

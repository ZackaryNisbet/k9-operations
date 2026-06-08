import { Badge, Btn, Card } from "../components/ui";
import { C } from "../constants/colors";
import { DEF_EOD_TEMPLATE } from "../constants/operations";
import { EODSearchOverlay } from "../components/EODSearchOverlay";
import { I } from "../icons";
import { fmtPhone, gid, todayStr } from "../lib/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uuid } from "../lib/ids";

function EODPage({ data, save, nav, profile }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const isToday = viewDate === td;
  const shiftDate = (days) => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() + days); setViewDate(d.toISOString().split("T")[0]); };

  // Search overlay
  const [showEODSearch, setShowEODSearch] = useState(false);

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

  const viewDateLabel = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // Get or create EOD entry for this date
  const template = data.eodTemplate || DEF_EOD_TEMPLATE;
  const existing = (data.eodEntries || []).find(e => e.date === viewDate);
  const entry = existing || {
    type: "eod", id: "eod_" + viewDate, date: viewDate, locked: false,
    sections: template.map(t => ({ id: t.id, content: t.defaultContent })),
    mentions: [], history: [{ ts: new Date().toISOString(), action: "created" }],
  };
  const isPastDay = viewDate < td;

  // Previous day's entry (for copy-from-previous feature)
  const prevDateStr = useMemo(() => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; }, [viewDate]);
  const prevDayEntry = (data.eodEntries || []).find(e => e.date === prevDateStr);
  const isLocked = isPastDay || (existing ? existing.locked : false);

  // Local mentions state — updated synchronously so hyperlinks render instantly
  // (entry.mentions from data is async and may lag behind after save)
  const [localMentions, setLocalMentions] = useState(null);
  useEffect(() => { setLocalMentions(null); }, [existing]);
  const activeMentions = localMentions ?? (entry.mentions || []);

  // Section content management
  const [editSections, setEditSections] = useState({});
  const [focusedSecId, setFocusedSecId] = useState(null); // which section textarea is focused
  const lastSavedSecRef = useRef({}); // track what we last saved, to detect remote vs local
  const userEditedRef = useRef(false); // track if user has actually typed anything
  useEffect(() => {
    const obj = {};
    entry.sections.forEach(s => { obj[s.id] = s.content; });
    setEditSections(obj);
    lastSavedSecRef.current = { ...obj };
    userEditedRef.current = false;
  }, [viewDate]);
  // Merge remote changes into sections the user is NOT currently focused on
  const existingSectionsKey = existing ? JSON.stringify((existing.sections || []).map(s => s.id + ":" + (s.content || "").length)) : "";
  useEffect(() => {
    if (!existing || !existing.sections) return;
    setEditSections(prev => {
      const next = { ...prev };
      let changed = false;
      existing.sections.forEach(s => {
        // If this section differs from what we last saved AND user isn't focused on it, take remote version
        if (s.id !== focusedSecId && s.content !== lastSavedSecRef.current[s.id]) {
          next[s.id] = s.content;
          lastSavedSecRef.current[s.id] = s.content; // update ref so we don't re-trigger
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [existingSectionsKey]);

  const updateSection = (secId, content) => { userEditedRef.current = true; setEditSections(prev => ({ ...prev, [secId]: content })); };

  // Track which text section is being actively edited (click-to-edit)
  const [editingCheckItem, setEditingCheckItem] = useState(null); // { secId, idx }

  // Audit log panel — audit entries live inside entry.history with type:"audit"
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const eodAuditEntries = useMemo(() => (entry.history || []).filter(h => h.type === "audit").sort((a, b) => (b.ts || "").localeCompare(a.ts || "")), [entry.history]);
  const mkAudit = (auditAction, details, prev, next) => ({
    ts: new Date().toISOString(), type: "audit",
    id: uuid(),
    userId: profile?.id || "unknown", userName: profile?.full_name || profile?.email || "Staff",
    auditAction, details, previousValue: prev || null, newValue: next || null,
  });

  // @ Mention system
  const [mentionState, setMentionState] = useState(null); // { sectionId, query, cursorPos, inputEl }
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionRef = useRef(null);

  const allEntities = useMemo(() => {
    const arr = [];
    data.dogs.forEach(d => { const c = data.clients.find(cl => cl.id === d.clientId); const ownerLast = c ? c.fields.last_name : ""; arr.push({ type: "dog", id: d.id, name: `${d.fields.name} ${ownerLast}`.trim(), sub: c ? `${c.fields.first_name} ${c.fields.last_name}'s dog` : "Dog", clientId: d.clientId }); });
    data.clients.forEach(c => { arr.push({ type: "client", id: c.id, name: `${c.fields.first_name} ${c.fields.last_name}`, sub: fmtPhone(c.fields.phone) }); });
    return arr;
  }, [data.dogs, data.clients]);

  const handleTextChange = (secId, e) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    const el = e.target;
    updateSection(secId, val);
    // Detect @ trigger
    const before = val.slice(0, pos);
    const atMatch = before.match(/@([A-Za-z0-9_ ]*)$/);
    if (atMatch) {
      const query = atMatch[1].trim().toLowerCase();
      const results = query.length === 0 ? allEntities.slice(0, 8) : allEntities.filter(ent => ent.name.toLowerCase().includes(query)).slice(0, 8);
      setMentionState({ sectionId: secId, query, cursorPos: pos, atStart: pos - atMatch[0].length, inputEl: el });
      setMentionResults(results);
      setMentionIdx(0);
    } else {
      setMentionState(null);
    }
  };

  const selectMention = (entity) => {
    if (!mentionState) return;
    const tag = `@${entity.name}`;
    // Track the updated content for this section so we can save it (editSections is stale in this closure)
    let updatedSectionContent = null;
    const secIdForMention = mentionState.sectionId;
    if (mentionState.checklistIdx != null && mentionState.checklistIdx >= 0) {
      // Checklist item mention - insert into that item's label
      const secId = mentionState.sectionId;
      const content = editSections[secId] || "";
      const items = content.split("\n").filter(l => l.trim()).map(line => {
        const checked = line.startsWith("[x] ");
        const label = line.replace(/^\[[ x]\] /, "");
        return { checked, label };
      });
      const item = items[mentionState.checklistIdx];
      if (item) {
        const before = item.label.slice(0, mentionState.atStart);
        const after = item.label.slice(mentionState.cursorPos);
        item.label = before + tag + " " + after;
        const newContent = items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n");
        updatedSectionContent = newContent;
        updateSection(secId, newContent);
        setTimeout(() => { if (mentionState.inputEl) { mentionState.inputEl.focus(); const newPos = before.length + tag.length + 1; mentionState.inputEl.setSelectionRange(newPos, newPos); } }, 10);
      }
    } else if (mentionState.isAddInput && mentionState.inputEl) {
      // "Add item" input mention - insert @Name into the uncontrolled input
      const inp = mentionState.inputEl;
      const before = inp.value.slice(0, mentionState.atStart);
      const after = inp.value.slice(mentionState.cursorPos);
      inp.value = before + tag + " " + after;
      setTimeout(() => { inp.focus(); const newPos = before.length + tag.length + 1; inp.setSelectionRange(newPos, newPos); }, 10);
    } else {
      // Textarea mention
      const sec = editSections[mentionState.sectionId] || "";
      const before = sec.slice(0, mentionState.atStart);
      const after = sec.slice(mentionState.cursorPos);
      const newContent = before + tag + " " + after;
      updatedSectionContent = newContent;
      updateSection(mentionState.sectionId, newContent);
      setTimeout(() => { if (mentionState.inputEl) { mentionState.inputEl.focus(); const newPos = before.length + tag.length + 1; mentionState.inputEl.setSelectionRange(newPos, newPos); } }, 10);
    }
    // Record mention and auto-save so it shows on profiles immediately
    const mention = { id: gid(), entityType: entity.type, entityId: entity.id, entityName: entity.name, sectionId: mentionState.sectionId, createdAt: new Date().toISOString(), ...(entity.clientId ? { clientId: entity.clientId } : {}) };
    const updatedMentions = [...activeMentions, mention];
    // Update local mentions state SYNCHRONOUSLY so hyperlinks render instantly on re-render
    setLocalMentions(updatedMentions);
    // Stay in edit mode so user can keep typing after the mention
    const wasChecklist = mentionState.checklistIdx != null && mentionState.checklistIdx >= 0;
    setMentionState(null);
    if (wasChecklist) setEditingCheckItem(null);
    // Auto-save the EOD entry with the new mention
    // IMPORTANT: Build sections using the UPDATED content (editSections is stale in this closure)
    const prevSections = entry.sections || [];
    const freshSections = template.map(t => {
      const content = (t.id === secIdForMention && updatedSectionContent != null) ? updatedSectionContent : (editSections[t.id] || "");
      const prev = prevSections.find(s => s.id === t.id);
      const editedBy = content !== (prev?.content || "") ? { name: staffName, at: new Date().toISOString() } : (prev?.editedBy || null);
      return { id: t.id, content, ...(editedBy ? { editedBy } : {}) };
    });
    // Track what we saved
    const savedObj = {};
    freshSections.forEach(s => { savedObj[s.id] = s.content; });
    lastSavedSecRef.current = savedObj;
    // Audit: log mention into history
    const tplSec = template.find(tp => tp.id === secIdForMention);
    const mentionHistory = [...(entry.history || []), mkAudit("ADD_MENTION", `Mentioned @${entity.name} (${entity.type}) in "${tplSec?.label || secIdForMention}"`, null, { entityName: entity.name, entityType: entity.type, section: tplSec?.label || secIdForMention })];
    const newEntry = { ...entry, sections: freshSections, mentions: updatedMentions, history: mentionHistory };
    const entries = [...(data.eodEntries || [])];
    const eIdx = entries.findIndex(e => e.date === viewDate);
    if (eIdx >= 0) entries[eIdx] = newEntry; else entries.push(newEntry);
    save({ ...data, eodEntries: entries });
  };

  const handleKeyDown = (secId, e) => {
    if (!mentionState || mentionState.sectionId !== secId) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionResults.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); }
    else if ((e.key === "Tab" || e.key === "Enter") && mentionResults.length > 0) { e.preventDefault(); selectMention(mentionResults[mentionIdx]); }
    else if (e.key === "Escape") { setMentionState(null); }
  };

  // Close mention dropdown on outside click
  useEffect(() => {
    if (!mentionState) return;
    const handler = (e) => { if (mentionRef.current && !mentionRef.current.contains(e.target)) setMentionState(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mentionState]);

  // Auto-save EOD (debounced) — saves on every keystroke after a short delay
  const eodAutoSaveRef = useRef(null);
  const staffName = profile?.full_name || profile?.email || "Staff";
  const saveEOD = useCallback(() => {
    const prevSections = entry.sections || [];
    const newHistory = [...(entry.history || [])];
    const sections = template.map(t => {
      const content = editSections[t.id] || "";
      const prev = prevSections.find(s => s.id === t.id);
      const prevContent = prev?.content || "";
      const editedBy = content !== prevContent ? { name: staffName, at: new Date().toISOString() } : (prev?.editedBy || null);
      // Audit: log section edits into history
      if (content !== prevContent && prevContent.trim() !== "" && content.trim() !== "") {
        const tpl = template.find(tp => tp.id === t.id);
        newHistory.push(mkAudit("EDIT_SECTION", `Edited "${tpl?.label || t.id}" section`, prevContent.length > 200 ? prevContent.slice(0, 200) + "..." : prevContent, content.length > 200 ? content.slice(0, 200) + "..." : content));
      } else if (content.trim() && !prevContent.trim()) {
        const tpl = template.find(tp => tp.id === t.id);
        newHistory.push(mkAudit("ADD_CONTENT", `Added content to "${tpl?.label || t.id}" section`, null, content.length > 200 ? content.slice(0, 200) + "..." : content));
      }
      return { id: t.id, content, ...(editedBy ? { editedBy } : {}) };
    });
    newHistory.push({ ts: new Date().toISOString(), action: "saved" });
    const newEntry = { ...entry, sections, mentions: activeMentions, history: newHistory };
    const entries = [...(data.eodEntries || [])];
    const idx = entries.findIndex(e => e.date === viewDate);
    if (idx >= 0) entries[idx] = newEntry; else entries.push(newEntry);
    const savedObj = {};
    sections.forEach(s => { savedObj[s.id] = s.content; });
    lastSavedSecRef.current = savedObj;
    save({ ...data, eodEntries: entries });
  }, [editSections, activeMentions, entry, viewDate, data, template, staffName, profile]);
  // Debounced auto-save: triggers 800ms after last user edit (skips programmatic changes)
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
      const lockHistory = [...(entries[idx].history || []), mkAudit(wasLocked ? "UNLOCK_DAY" : "LOCK_DAY", wasLocked ? `Unlocked EOD for ${viewDate}` : `Locked EOD for ${viewDate}`, wasLocked ? "Locked" : "Unlocked", wasLocked ? "Unlocked" : "Locked")];
      entries[idx] = { ...entries[idx], locked: !wasLocked, history: lockHistory };
      await save({ ...data, eodEntries: entries });
    } else {
      const sections = template.map(t => ({ id: t.id, content: editSections[t.id] || "" }));
      entries.push({ ...entry, sections, locked: true, history: [...(entry.history || []), mkAudit("LOCK_DAY", `Locked EOD for ${viewDate}`, null, "Locked")] });
      await save({ ...data, eodEntries: entries });
    }
  };

  // Seed sample EOD data (2 months)
  const [seeding, setSeeding] = useState(false);
  const seedEODData = async () => {
    if (seeding) return;
    if (!window.confirm("Generate 60 days of sample EOD entries? This will overwrite any existing EOD data for those dates.")) return;
    setSeeding(true);
    try {
      const _rng = { s: 42 };
      const srand = () => { _rng.s = (_rng.s * 16807 + 0) % 2147483647; return (_rng.s - 1) / 2147483646; };
      const ri = (a, b) => Math.floor(srand() * (b - a + 1)) + a;
      const rp = (arr) => arr[Math.floor(srand() * arr.length)];
      const addD = (base, n) => { const d = new Date(base + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
      const FN=["Sarah","James","Emily","Michael","Jessica","David","Jennifer","Robert","Ashley","Christopher","Amanda","Matthew","Stephanie","Andrew","Nicole","Joshua","Samantha","Daniel","Lauren","William"];
      const LN=["Mitchell","Chen","Rodriguez","Thompson","Williams","Johnson","Brown","Davis","Miller","Wilson","Anderson","Taylor","Thomas","Moore","Jackson"];
      const dogs = data.dogs || [];
      const clients = data.clients || [];
      const reservations = data.reservations || [];
      const entries = [];

      for (let off = -60; off <= -1; off++) {
        const dt = addD(td, off);
        // Find dogs in-house on this date
        const dayDogs = [];
        reservations.forEach(r => {
          if (r.checkIn <= dt && r.checkOut >= dt) {
            const dg = dogs.find(d => d.id === r.dogId);
            if (dg && !dayDogs.find(dd => dd.id === dg.id)) dayDogs.push(dg);
          }
        });
        const pickDog = () => { const d = dayDogs.length > 0 ? rp(dayDogs) : dogs.length > 0 ? rp(dogs) : null; if (!d) return { d: { id: "x", fields: { name: "Buddy", weight: "50" } }, c: { id: "x", fields: { first_name: "Sample", last_name: "Client" } } }; const c = clients.find(cl => cl.id === d.clientId) || { id: "x", fields: { first_name: "Owner", last_name: "" } }; return { d, c }; };

        const genSec = (sid) => {
          switch(sid) {
            case "sales": return "Today's Goal: $" + ri(800, 2500) + "\nWTD: $" + ri(3000, 15000) + "\nMTD: $" + ri(8000, 45000) + "\nYTD: $" + ri(30000, 200000);
            case "csr_checklist": return ["Turn on Luxury TV's","Turn on music","Create Private Play log","Vacuum and Cherry front lobby before 7:00 am","Unlock latches on front door","Check incoming Tours","Do body checks on dogs leaving today and fill out form"].map(x => "[" + (srand() > 0.2 ? "x" : " ") + "] " + x).join("\n");
            case "alerts": return rp(["- Goal for Each CSR to book at least 1 Eval/Tour","- Reminder: Valentine's Day packages available\n- Push puppy love photo package","- New pricing effective next week\n- All staff meeting Thursday","- Weekend fully booked for boarding\n- Waitlist available"]);
            case "team_notes": { const { d, c } = pickDog(); return "@" + d.fields.name + " " + (c.fields.last_name||"") + " had a great day in playgroup\n" + rp(["Great teamwork today everyone!","Remember to check water bowls every hour","Updated cleaning schedule posted","Reminder: staff photos needed for website"]); }
            case "leads": { const lines = []; for (let i = 0; i < ri(1, 3); i++) lines.push("- " + rp(FN) + " " + rp(LN) + " - " + rp(["called about boarding","interested in daycare","website inquiry","referral from client"])); return lines.join("\n"); }
            case "tours": { const n = ri(0, 3); if (!n) return "No tours today"; const lines = []; for (let i = 0; i < n; i++) lines.push("- " + rp(FN) + " " + rp(LN) + " - " + rp(["booked boarding","scheduled evaluation","interested in daycare packages","signed up!"])); return lines.join("\n"); }
            case "meds": { const md = dayDogs.filter(d => d.fields?.medicationSchedules?.length > 0); if (!md.length) return "Boarding:\nAM:\n- None\nPM:\n- None"; const lines = ["Boarding:", "AM:"]; md.forEach(d => { const c = clients.find(cl => cl.id === d.clientId); (d.fields.medicationSchedules||[]).forEach(m => lines.push("- @" + d.fields.name + " " + (c ? c.fields.last_name : "") + " - " + (m.amount||"1") + " " + (m.unit||"tablet") + " " + (m.name||"medication"))); }); lines.push("PM:", "- None"); return lines.join("\n"); }
            case "birthdays": { const mo = parseInt(dt.split("-")[1]), dy = parseInt(dt.split("-")[2]); const bd = dogs.filter(d => { if (!d.fields?.dob) return false; const m = parseInt(d.fields.dob.split("-")[1]), dd = parseInt(d.fields.dob.split("-")[2]); return m === mo && Math.abs(dd - dy) <= 2; }); if (!bd.length) return "No birthdays today"; return bd.slice(0, 3).map(d => { const c = clients.find(cl => cl.id === d.clientId); return "- @" + d.fields.name + " " + (c ? c.fields.last_name : "") + " turns " + (2026 - parseInt(d.fields.dob.split("-")[0])) + "!"; }).join("\n"); }
            case "ice_cream": { if (srand() > 0.5) return "None today"; const lines = []; for (let i = 0; i < ri(1, 3); i++) { const { d, c } = pickDog(); lines.push("- @" + d.fields.name + " " + (c.fields.last_name||"")); } return lines.join("\n"); }
            case "extra_play": { if (srand() > 0.6) return "None today"; const lines = []; for (let i = 0; i < ri(1, 3); i++) { const { d, c } = pickDog(); lines.push("- @" + d.fields.name + " " + (c.fields.last_name||"") + " - " + rp(["30 min private play","1 hour play session","Extra yard time"])); } return lines.join("\n"); }
            case "baths": { const n = ri(0, 4); if (!n) return ""; const lines = []; for (let i = 0; i < n; i++) { const { d, c } = pickDog(); lines.push("[" + (srand() > 0.3 ? "x" : " ") + "] @" + d.fields.name + " " + (c.fields.last_name||"") + " - " + rp(["Standard","Hypo","Medicated","Whitening"]) + " bath"); } return lines.join("\n"); }
            case "day_boarders": { if (srand() > 0.5) return "None today"; const lines = []; for (let i = 0; i < ri(1, 3); i++) { const { d, c } = pickDog(); lines.push("- @" + d.fields.name + " " + (c.fields.last_name||"") + " - " + rp(["Day board, pickup by 6pm","Day board + bath","Private play only"])); } return lines.join("\n"); }
            case "evaluations": { if (srand() > 0.6) return "Name, L/S daycare, Room # - Pass/fail\n- None today"; const lines = ["Name, L/S daycare, Room # - Pass/fail"]; for (let i = 0; i < ri(1, 2); i++) { const { d, c } = pickDog(); const sm = parseInt(d.fields.weight || "50") < 35; lines.push("- @" + d.fields.name + " " + (c.fields.last_name||"") + ", " + (sm ? "S" : "L") + " daycare - " + rp(["Passed, parents contacted","Private play recommended","Pending evaluation"])); } return lines.join("\n"); }
            case "small_daycare_notes":
            case "large_daycare_notes": { if (srand() > 0.5) return "(Dogs name, last initial, date/time and details of incident)\n- Nothing to report"; const lines = ["(Dogs name, last initial, date/time and details of incident)"]; for (let i = 0; i < ri(1, 3); i++) { const { d, c } = pickDog(); lines.push("- @" + d.fields.name + " " + (c.fields.last_name||"") + " " + ri(8, 16) + ":" + rp(["00","15","30","45"]) + " - " + rp(["played well in group","needed a break from play","was a bit mouthy, redirected","had loose stool","napped most of the afternoon","was very energetic today","did great with new dogs"])); } return lines.join("\n"); }
            case "boarding_notes": { if (srand() > 0.4) return "All boarders doing well"; const lines = []; for (let i = 0; i < ri(1, 3); i++) { const { d, c } = pickDog(); lines.push("- @" + d.fields.name + " " + (c.fields.last_name||"") + " - " + rp(["eating well, happy in room","seemed anxious at first, settled in","loved playtime","refused dinner, will monitor","checkout tomorrow, bath scheduled","sleeping soundly"])); } return lines.join("\n"); }
            case "social_media": return "[" + (srand() > 0.3 ? "x" : " ") + "] Instagram Stories\n[" + (srand() > 0.4 ? "x" : " ") + "] Instagram Post";
            case "picture_requests": { if (srand() > 0.5) return ""; const lines = []; for (let i = 0; i < ri(1, 3); i++) { const { d, c } = pickDog(); lines.push("[" + (srand() > 0.4 ? "x" : " ") + "] @" + d.fields.name + " " + (c.fields.last_name||"") + " - " + rp(["owner requested photo","send to owner","daily update photo"])); } return lines.join("\n"); }
            case "building_supplies": return rp(["All good","- Need more paper towels\n- Bleach running low","- Light out in hallway B","Everything stocked"]);
            case "other": return rp(["","Quiet day overall","Busy morning, slower afternoon","Full house! Great energy today",""]);
            default: return "";
          }
        };

        const SECS = ["sales","csr_checklist","alerts","team_notes","leads","tours","meds","birthdays","ice_cream","extra_play","baths","day_boarders","evaluations","small_daycare_notes","large_daycare_notes","boarding_notes","social_media","picture_requests","building_supplies","other"];
        const sections = SECS.map(sid => ({ id: sid, content: genSec(sid) }));

        // Extract @mentions
        const knownNames = dogs.map(dg => { const cl = clients.find(c => c.id === dg.clientId); return { name: (dg.fields.name + " " + (cl ? cl.fields.last_name : "")).trim(), dog: dg, client: cl }; });
        const mentions = [];
        let mIdx = 1;
        sections.forEach(sec => {
          knownNames.forEach(({ name, dog: dg }) => {
            if (sec.content.includes("@" + name)) {
              mentions.push({ id: "em" + dt.replace(/-/g, "") + "_" + (mIdx++), entityType: "dog", entityId: dg.id, entityName: name, sectionId: sec.id, createdAt: dt + "T" + String(ri(7, 18)).padStart(2, "0") + ":" + String(ri(0, 59)).padStart(2, "0") + ":00" });
            }
          });
        });

        const locked = off < -1;
        const history = [{ ts: dt + "T07:00:00", action: "Created from template" }];
        if (locked) history.push({ ts: dt + "T18:30:00", action: "Locked by Manager" });
        if (srand() > 0.6) history.push({ ts: dt + "T" + String(ri(10, 16)).padStart(2, "0") + ":" + String(ri(0, 59)).padStart(2, "0") + ":00", action: "Edited by Staff" });

        entries.push({ type: "eod", date: dt, locked, sections, mentions, history });
      }
      // Merge: keep any existing entries that aren't in the 60-day range, replace the rest
      const existingOutside = (data.eodEntries || []).filter(e => !entries.find(ne => ne.date === e.date));
      const merged = [...existingOutside, ...entries].sort((a, b) => a.date.localeCompare(b.date));
      // Persist the data to the data state via save() function
      await save({ ...data, eodEntries: merged });
      setSeeding(false);
      alert("Done! 60 days of sample EOD data generated. Data has been saved and will persist on refresh.");
    } catch (err) {
      console.error("EOD seed error:", err);
      setSeeding(false);
      alert("Error seeding EOD data: " + err.message);
    }
  };

  // History panel
  const [showHistory, setShowHistory] = useState(false);
  // New hire guide
  const [showEODGuide, setShowEODGuide] = useState(false);

  // Find mention hit positions in text
  const findMentionHits = (text, mentions, secId) => {
    const secMentions = (mentions || []).filter(m => m.sectionId === secId);
    if (!text || secMentions.length === 0) return [];
    const hits = [];
    secMentions.forEach(m => {
      const tag = `@${m.entityName}`;
      let startIdx = 0;
      let idx;
      while ((idx = text.indexOf(tag, startIdx)) >= 0) {
        hits.push({ idx, len: tag.length, tag, m });
        startIdx = idx + tag.length;
      }
    });
    hits.sort((a, b) => a.idx - b.idx);
    const deduped = [];
    let lastEnd = 0;
    hits.forEach(h => { if (h.idx >= lastEnd) { deduped.push(h); lastEnd = h.idx + h.len; } });
    return deduped;
  };

  // Render mention-highlighted text (clickable — for locked/preview/profile pages)
  const renderContent = (text, mentions, secId) => {
    if (!text) return <span style={{ color: C.textMut, fontStyle: "italic" }}>Empty</span>;
    const deduped = findMentionHits(text, mentions, secId);
    if (deduped.length === 0) return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
    const parts = [];
    let key = 0;
    let cursor = 0;
    deduped.forEach(h => {
      if (h.idx > cursor) parts.push(<span key={key++} style={{ whiteSpace: "pre-wrap" }}>{text.slice(cursor, h.idx)}</span>);
      parts.push(
        <span key={key++} onClick={(e) => { e.stopPropagation(); nav(h.m.entityType === "dog" ? "dog-detail" : "client-detail", h.m.entityType === "dog" ? { clientId: h.m.clientId || data.dogs.find(d => d.id === h.m.entityId)?.clientId, dogId: h.m.entityId } : { clientId: h.m.entityId }); }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; e.currentTarget.style.textDecorationColor = C.pri + "60"; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = "none"; }}
          style={{ display: "inline", padding: "1px 8px", borderRadius: 6, background: C.priLt, color: C.pri, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", textUnderlineOffset: 2 }}>{h.tag}</span>
      );
      cursor = h.idx + h.len;
    });
    if (cursor < text.length) parts.push(<span key={key++} style={{ whiteSpace: "pre-wrap" }}>{text.slice(cursor)}</span>);
    return <>{parts}</>;
  };

  // Render inline overlay for edit mode — shows ALL text (since textarea text is transparent)
  // Mention spans are clickable (pointerEvents: auto) for navigation; rest is transparent to clicks
  const renderOverlay = (text, mentions, secId) => {
    if (!text) return <span style={{ color: "transparent" }}>{"\u200B"}</span>;
    const deduped = findMentionHits(text, mentions, secId);
    if (deduped.length === 0) return <span style={{ whiteSpace: "pre-wrap", color: C.text }}>{text}</span>;
    const parts = [];
    let key = 0;
    let cursor = 0;
    deduped.forEach(h => {
      if (h.idx > cursor) parts.push(<span key={key++} style={{ whiteSpace: "pre-wrap", color: C.text }}>{text.slice(cursor, h.idx)}</span>);
      parts.push(<span key={key++}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(h.m.entityType === "dog" ? "dog-detail" : "client-detail", h.m.entityType === "dog" ? { clientId: h.m.clientId || data.dogs.find(d => d.id === h.m.entityId)?.clientId, dogId: h.m.entityId } : { clientId: h.m.entityId }); }}
        onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; }}
        onMouseLeave={e => { e.currentTarget.style.textDecoration = "none"; }}
        style={{ whiteSpace: "pre-wrap", color: C.pri, background: C.priLt, borderRadius: 4, pointerEvents: "auto", cursor: "pointer", fontWeight: 600 }}>{h.tag}</span>);
      cursor = h.idx + h.len;
    });
    if (cursor < text.length) parts.push(<span key={key++} style={{ whiteSpace: "pre-wrap", color: C.text }}>{text.slice(cursor)}</span>);
    return <>{parts}</>;
  };

  // Check if any EOD exists for dates (for calendar dots)
  const eodDates = useMemo(() => new Set((data.eodEntries || []).map(e => e.date)), [data.eodEntries]);

  return (
    <div>
      <button onClick={() => nav("operations")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>← Operations</button>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>End of Day Report</h1>
          <button onClick={() => setShowEODGuide(v => !v)} style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${showEODGuide ? C.pri : C.border}`, background: showEODGuide ? C.priLt : "transparent", color: showEODGuide ? C.pri : C.textMut, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1, transition: "all 0.15s" }} title="How EOD Reports work">?</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(data.eodEntries || []).length < 5 && <Btn variant="secondary" size="sm" onClick={seedEODData} disabled={seeding}>{seeding ? "Generating..." : "📋 Seed Sample Data"}</Btn>}
          <Btn variant="secondary" size="sm" onClick={() => setShowEODSearch(true)} icon={<I.Search />}>Search</Btn>
          {isPastDay && isLocked ? <Btn variant="secondary" size="sm" disabled style={{opacity:0.5,cursor:"not-allowed"}}>🔒 Locked</Btn> : <Btn variant="secondary" onClick={toggleLock} size="sm">{isLocked ? "🔒 Locked" : "🔓 Lock Day"}</Btn>}
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
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>@ Mentions — linking notes to dogs & clients:</div>
          <div style={{ paddingLeft: 14, marginBottom: 10 }}>
            <div>Type <span style={{ fontWeight: 700, color: C.pri, background: C.priLt, padding: "1px 6px", borderRadius: 4 }}>@</span> in any section to search for a dog or client name. Use <span style={{ fontWeight: 700 }}>↓ ↑</span> arrows to navigate and <span style={{ fontWeight: 700 }}>Tab</span> or <span style={{ fontWeight: 700 }}>Enter</span> to select.</div>
            <div style={{ marginTop: 4 }}>When you mention a dog or client, it creates a <span style={{ fontWeight: 700, color: C.text }}>linked reference</span> — that note will automatically appear on the dog's or client's profile under "EOD Mentions". This means you only have to write it once.</div>
            <div style={{ marginTop: 4 }}>Example: In the Meds section, type <span style={{ fontWeight: 700, color: C.pri }}>"@Baxter given Trazodone at 2pm per owner"</span> and it'll show up both here and on Baxter's profile page.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Other features:</div>
          <div style={{ paddingLeft: 14, marginBottom: 8 }}>
            <div><span style={{ fontWeight: 700 }}>History</span> — Click "History" to see when the EOD was saved and locked/unlocked, with timestamps.</div>
            <div><span style={{ fontWeight: 700 }}>Calendar</span> — Use the calendar icon to jump to any past EOD. Gold dots indicate days that have saved reports.</div>
            <div><span style={{ fontWeight: 700 }}>Template</span> — The sections are fully customizable in Settings → EOD Template. You can add, remove, reorder, and edit section names and default content.</div>
          </div>
          <div style={{ fontSize: 11, color: C.textMut, fontStyle: "italic", borderTop: `1px solid ${C.borderLight}`, paddingTop: 8, marginTop: 4 }}>Tip: Get in the habit of adding notes throughout the day instead of trying to remember everything at close. Future you (and the morning shift) will thank you.</div>
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
            {!isToday && <div style={{ textAlign: "center", marginTop: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}><button onClick={() => { setViewDate(td); setShowCalendar(false); }} style={{ fontSize: 12, fontWeight: 700, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Go to Today</button></div>}
          </div>
        )}
      </div>

      {/* Edit History */}
      {showHistory && existing && (
        <Card style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Edit History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(existing.history || []).map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: C.textSec }}>
                <span style={{ fontWeight: 600, color: C.textMut }}>{new Date(h.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(h.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                {" — "}{h.action.charAt(0).toUpperCase() + h.action.slice(1)}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {template.map(sec => {
          const content = editSections[sec.id] ?? "";
          const secMentions = activeMentions.filter(m => m.sectionId === sec.id);
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
            const newContent = items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n");
            updateSection(sec.id, newContent);
          };
          const removeCheckItem = (idx) => {
            const items = parseChecklistItems(content);
            items.splice(idx, 1);
            const newContent = items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n");
            updateSection(sec.id, newContent);
          };
          const editCheckItem = (idx, newLabel) => {
            const items = parseChecklistItems(content);
            items[idx] = { ...items[idx], label: newLabel };
            const newContent = items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n");
            updateSection(sec.id, newContent);
          };
          const addCheckItem = (label) => {
            if (!label.trim()) return;
            const items = parseChecklistItems(content);
            items.push({ checked: false, label: label.trim() });
            const newContent = items.map(it => `${it.checked ? "[x] " : "[ ] "}${it.label}`).join("\n");
            updateSection(sec.id, newContent);
          };
          const checklistItems = isChecklist ? parseChecklistItems(content) : [];
          const checkedCount = checklistItems.filter(it => it.checked).length;

          return (
            <Card key={sec.id} style={{ padding: 0, overflow: "visible" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.borderLight}`, borderRadius: "14px 14px 0 0" }}>
                <span style={{ fontSize: 16 }}>{sec.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>{sec.title || sec.label}</span>
                {isChecklist && checklistItems.length > 0 && <Badge color={checkedCount === checklistItems.length ? "success" : "default"} size="sm">{checkedCount}/{checklistItems.length}</Badge>}
                {secMentions.length > 0 && <Badge color="primary" size="sm">{secMentions.length} mention{secMentions.length > 1 ? "s" : ""}</Badge>}
                {!isLocked && (() => {
                  const prevSec = (prevDayEntry?.sections || []).find(s => s.id === sec.id);
                  const prevContent = prevSec?.content || "";
                  const hasPrev = prevContent.trim().length > 0;
                  return (
                    <button disabled={!hasPrev}
                      onClick={(e) => { e.stopPropagation(); if (!hasPrev) return; if (!content.trim() || window.confirm(`Replace current content in "${sec.title || sec.label}" with content from ${new Date(prevDateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}?`)) { updateSection(sec.id, prevContent); } }}
                      onDoubleClick={(e) => e.stopPropagation()}
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
              <div style={{ padding: "12px 16px", position: "relative" }}>
                {isChecklist ? (
                  /* ── CHECKLIST MODE ── */
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
                              <input autoFocus value={item.label} onChange={e => {
                                  const pos = e.target.selectionStart;
                                  const el = e.target;
                                  editCheckItem(idx, e.target.value);
                                  const before = e.target.value.slice(0, pos);
                                  const atMatch = before.match(/@([A-Za-z0-9_ ]*)$/);
                                  if (atMatch) {
                                    const query = atMatch[1].trim().toLowerCase();
                                    const results = query.length === 0 ? allEntities.slice(0, 8) : allEntities.filter(ent => ent.name.toLowerCase().includes(query)).slice(0, 8);
                                    setMentionState({ sectionId: sec.id, checklistIdx: idx, query, cursorPos: pos, atStart: pos - atMatch[0].length, inputEl: el });
                                    setMentionResults(results);
                                    setMentionIdx(0);
                                  } else if (mentionState && mentionState.sectionId === sec.id) { setMentionState(null); }
                                }}
                                onKeyDown={e => handleKeyDown(sec.id, e)}
                                onBlur={() => { if (!mentionState || mentionState.sectionId !== sec.id) setEditingCheckItem(null); }}
                                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", color: item.checked ? C.textMut : C.text, textDecoration: item.checked ? "line-through" : "none", background: "transparent", padding: 0 }} />
                            ) : (
                              <span onClick={() => { if (!isLocked) setEditingCheckItem({ secId: sec.id, idx }); }} style={{ flex: 1, fontSize: 13, color: item.checked ? C.textMut : C.text, textDecoration: item.checked ? "line-through" : "none", cursor: isLocked ? "default" : "text" }}>{renderContent(item.label, activeMentions, sec.id)}</span>
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
                        <input placeholder="Add item... (use @ to mention)" onChange={e => {
                            const pos = e.target.selectionStart;
                            const before = e.target.value.slice(0, pos);
                            const atMatch = before.match(/@([A-Za-z0-9_ ]*)$/);
                            if (atMatch) {
                              const query = atMatch[1].trim().toLowerCase();
                              const results = query.length === 0 ? allEntities.slice(0, 8) : allEntities.filter(ent => ent.name.toLowerCase().includes(query)).slice(0, 8);
                              setMentionState({ sectionId: sec.id, checklistIdx: -1, query, cursorPos: pos, atStart: pos - atMatch[0].length, inputEl: e.target, isAddInput: true });
                              setMentionResults(results);
                              setMentionIdx(0);
                            } else if (mentionState && mentionState.sectionId === sec.id) { setMentionState(null); }
                          }}
                          onKeyDown={e => {
                            if (mentionState && mentionState.sectionId === sec.id && mentionResults.length > 0) {
                              handleKeyDown(sec.id, e);
                            } else if (e.key === "Enter" && e.target.value.trim()) {
                              addCheckItem(e.target.value); e.target.value = "";
                            }
                          }}
                          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", color: C.text, background: "transparent", padding: 0 }} />
                      </div>
                    )}
                    {isLocked && checklistItems.length === 0 && <span style={{ fontSize: 13, color: C.textMut, fontStyle: "italic" }}>No items</span>}
                    {/* Mention Dropdown for Checklist */}
                    {mentionState && mentionState.sectionId === sec.id && mentionResults.length > 0 && (
                      <div ref={mentionRef} style={{ position: "absolute", left: 16, bottom: -4, transform: "translateY(100%)", zIndex: 200, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", maxHeight: 240, overflow: "auto", width: 280 }}>
                        {mentionResults.map((ent, i) => (
                          <button key={ent.id} onClick={() => selectMention(ent)}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: i === mentionIdx ? C.priLt : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: ent.type === "dog" ? `linear-gradient(135deg, ${C.accLt}, ${C.priLt})` : `linear-gradient(135deg, ${C.priLt}, ${C.accLt})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.pri, flexShrink: 0 }}>
                              {ent.type === "dog" ? "🐕" : ent.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{ent.name}</div>
                              <div style={{ fontSize: 11, color: C.textSec }}>{ent.sub}</div>
                            </div>
                            <Badge size="sm" color={ent.type === "dog" ? "primary" : "default"}>{ent.type}</Badge>
                          </button>
                        ))}
                        <div style={{ padding: "6px 14px", borderTop: `1px solid ${C.borderLight}`, fontSize: 11, color: C.textMut }}>↑↓ navigate · Tab or Enter to select · Esc to dismiss</div>
                      </div>
                    )}
                  </div>
                ) : isLocked ? (
                  /* ── TEXT MODE: LOCKED (clickable mentions) ── */
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, minHeight: 24 }}>
                    {renderContent(content, activeMentions, sec.id)}
                  </div>
                ) : (
                  /* ── TEXT MODE: UNLOCKED — overlay editor with inline mention highlights ── */
                  <>
                    <div style={{ position: "relative", minHeight: 40 }}>
                      {/* Textarea — below overlay, transparent text, visible caret */}
                      <textarea value={content} onChange={(e) => handleTextChange(sec.id, e)} onKeyDown={(e) => handleKeyDown(sec.id, e)}
                        onFocus={() => setFocusedSecId(sec.id)} onBlur={() => setFocusedSecId(f => f === sec.id ? null : f)}
                        style={{ width: "100%", minHeight: 40, padding: 0, border: "none", outline: "none", fontSize: 13, color: "transparent", caretColor: C.text, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", background: "transparent", boxSizing: "border-box", position: "relative", zIndex: 1 }} />
                      {/* Overlay — on top of textarea, pointerEvents:none EXCEPT on mention spans */}
                      <div aria-hidden="false" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, fontSize: 13, fontFamily: "inherit", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", pointerEvents: "none", overflow: "hidden", padding: 0, zIndex: 2 }}>
                        {content ? renderOverlay(content, activeMentions, sec.id) : <span style={{ color: C.textMut, fontStyle: "italic" }}>{sec.defaultContent || "Type here... Use @ to mention a dog or client"}</span>}
                      </div>
                    </div>
                    {/* Mention Dropdown */}
                    {mentionState && mentionState.sectionId === sec.id && mentionResults.length > 0 && (
                      <div ref={mentionRef} style={{ position: "absolute", left: 16, bottom: -4, transform: "translateY(100%)", zIndex: 200, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", maxHeight: 240, overflow: "auto", width: 280 }}>
                        {mentionResults.map((ent, i) => (
                          <button key={ent.id} onClick={() => selectMention(ent)}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: i === mentionIdx ? C.priLt : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: ent.type === "dog" ? `linear-gradient(135deg, ${C.accLt}, ${C.priLt})` : `linear-gradient(135deg, ${C.priLt}, ${C.accLt})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.pri, flexShrink: 0 }}>
                              {ent.type === "dog" ? "🐕" : ent.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{ent.name}</div>
                              <div style={{ fontSize: 11, color: C.textSec }}>{ent.sub}</div>
                            </div>
                            <Badge size="sm" color={ent.type === "dog" ? "primary" : "default"}>{ent.type}</Badge>
                          </button>
                        ))}
                        <div style={{ padding: "6px 14px", borderTop: `1px solid ${C.borderLight}`, fontSize: 11, color: C.textMut }}>↑↓ navigate · Tab or Enter to select · Esc to dismiss</div>
                      </div>
                    )}
                  </>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, padding: "16px 0", borderTop: `1px solid ${C.borderLight}` }}>
        <Btn variant="secondary" size="sm" onClick={() => setShowAuditLog(v => !v)} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}>
          {showAuditLog ? "Hide Audit Log" : "Audit Log"} {eodAuditEntries.length > 0 && `(${eodAuditEntries.length})`}
        </Btn>
        {!isLocked && <Btn variant="secondary" onClick={toggleLock}>Lock Day</Btn>}
      </div>

      {/* Audit Log Panel */}
      {showAuditLog && (
        <Card style={{ marginTop: 8, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Audit Log</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{viewDateLabel} — {eodAuditEntries.length} audit {eodAuditEntries.length === 1 ? "entry" : "entries"}</div>
            </div>
          </div>
          {eodAuditEntries.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>
              No audit entries yet for this day. All edits, mentions, and lock/unlock actions will be recorded here.
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {eodAuditEntries.map((ae, idx) => {
                const actionColors = {
                  EDIT_SECTION: { bg: "#DBEAFE", color: "#2563EB", label: "Edited" },
                  ADD_CONTENT: { bg: "#D1FAE5", color: "#059669", label: "Added" },
                  ADD_MENTION: { bg: "#EDE9FE", color: "#7C3AED", label: "Mention" },
                  COPY_PREV_DAY: { bg: "#E0F2FE", color: "#0369A1", label: "Copied" },
                  LOCK_DAY: { bg: "#FEF3C7", color: "#D97706", label: "Locked" },
                  UNLOCK_DAY: { bg: "#FEE2E2", color: "#DC2626", label: "Unlocked" },
                };
                const ac = actionColors[ae.auditAction] || { bg: C.bg, color: C.textSec, label: ae.auditAction || "Action" };
                const formatTs = (ts) => { if (!ts) return "—"; const d = new Date(ts); return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }); };
                const expanded = expandedAuditId === (ae.id || idx);
                return (
                  <div key={ae.id || idx} style={{ borderBottom: idx < eodAuditEntries.length - 1 ? `1px solid ${C.borderLight}` : "none", padding: "12px 20px", cursor: ae.previousValue || ae.newValue ? "pointer" : "default", transition: "background 0.1s" }}
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

      {/* Search Overlay */}
      {showEODSearch && <EODSearchOverlay data={data} onClose={() => setShowEODSearch(false)} onSelectDate={(date) => setViewDate(date)} />}
    </div>
  );
}

export { EODPage };

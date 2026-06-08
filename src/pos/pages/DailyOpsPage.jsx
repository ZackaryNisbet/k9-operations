import { Badge, Btn, Card } from "../components/ui";
import { C } from "../constants/colors";
import { DAY_NAMES_SHORT, OPS_TYPES } from "../constants/operations";
import { ROOM_TYPES } from "../constants/forms";
import { React, useEffect, useState } from "react";
import { formatTime12hr, todayStr } from "../lib/format";

function DailyOpsPage({ data, save, sub, nav, profile }) {
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

  // Template-based items for today
  const template = isTemplate ? (data[meta.key] || meta.def) : [];
  const todayItems = template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);

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
    } else if (field === "asNeeded" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, asNeededBy: userName } }));
    } else if (field === "asNeededDone" && val === true) {
      setItems(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val, asNeededDoneBy: userName } }));
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
  const boardingToday = data.reservations.filter(r => r.type === "boarding" && r.checkIn <= viewDate && r.checkOut >= viewDate && (r.status === "checked-in" || r.status === "upcoming"));
  const boardingCheckedOut = data.reservations.filter(r => r.type === "boarding" && r.checkOut === viewDate && r.status === "checked-out");

  // Picture checklist: boarding, not first day, not last day
  const pictureDogs = data.reservations.filter(r => r.type === "boarding" && r.status === "checked-in" && r.checkIn < viewDate && r.checkOut > viewDate);

  // PP checklist: checked-in dogs (boarding or daycare) that have tag_pp or passed_private eval
  const ppDogIds = new Set();
  data.reservations.forEach(r => { if (r.type === "evaluation" && r.evalResult === "passed_private") ppDogIds.add(r.dogId); });
  data.dogs.forEach(d => { if ((d.tags || []).includes("tag_pp")) ppDogIds.add(d.id); });
  const ppReservations = data.reservations.filter(r => (r.type === "boarding" || r.type === "daycare") && r.status === "checked-in" && r.checkIn <= viewDate && r.checkOut >= viewDate && ppDogIds.has(r.dogId));

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
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{meta.title}</h2>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pctDone}%`, height: "100%", background: pctDone === 100 ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: pctDone === 100 ? C.suc : C.text }}>{checkedCount}/{totalCount}</span>
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
  const renderRoomCleaning = () => {
    const roomItems = items;
    return (
      <div>
        {ROOM_TYPES.map(rt => {
          const rooms = allRooms[rt] || [];
          if (!rooms.length) return null;
          return (
            <div key={rt} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{rt} <Badge color="default" size="sm">{rooms.length}</Badge></h3>
              <Card>
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr", borderBottom: `2px solid ${C.border}`, padding: "8px 12px", background: C.surfaceHover }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>ROOM</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>ROOM REFRESH</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>FULL DISINFECT</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textAlign: "center" }}>AS NEEDED</div>
                </div>
                {rooms.map((rm, i) => {
                  const ri = roomItems[rm] || {};
                  const activeRes = boardingToday.find(r => r.room === rm);
                  const coRes = boardingCheckedOut.find(r => r.room === rm);
                  const notFirst = activeRes && activeRes.checkIn < viewDate;
                  const notLast = activeRes && activeRes.checkOut > viewDate;
                  const needsRefresh = !!(activeRes && notFirst && notLast);
                  const needsDisinfect = !!(activeRes && activeRes.checkOut === viewDate) || !!coRes;
                  const canDisinfect = !!coRes;
                  const aDog = activeRes ? dogName(activeRes.dogId) : coRes ? dogName(coRes.dogId) : null;
                  return (
                    <div key={rm} style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr", padding: "8px 12px", borderBottom: i < rooms.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rm}</span>
                        {aDog && <div style={{ fontSize: 10, color: C.textMut }}>{aDog}</div>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {needsRefresh ? <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!ri.refresh} disabled={isLocked} onChange={e => toggleItem(rm, "refresh", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.suc }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.pri }}>Required</span>
                          </div>
                          {ri.refresh && ri.refreshBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.refreshBy}</div>}
                        </div> : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {needsDisinfect ? (canDisinfect ? <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <input type="checkbox" checked={!!ri.disinfect} disabled={isLocked} onChange={e => toggleItem(rm, "disinfect", e.target.checked)} style={{ width: 18, height: 18, accentColor: C.dan }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.dan }}>Required</span>
                          </div>
                          {ri.disinfect && ri.disinfectBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.disinfectBy}</div>}
                        </div> : <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut, fontStyle: "italic" }}>Awaiting checkout</span>) : <span style={{ fontSize: 11, color: C.textMut }}>—</span>}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <input type="checkbox" checked={!!ri.asNeeded} disabled={isLocked} onChange={e => toggleItem(rm, "asNeeded", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.acc }} />
                          {ri.asNeeded && <input type="checkbox" checked={!!ri.asNeededDone} disabled={isLocked} onChange={e => toggleItem(rm, "asNeededDone", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.suc }} title="Mark done" />}
                        </div>
                        {ri.asNeeded && ri.asNeededBy && <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{ri.asNeededBy}</div>}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          );
        })}
        {!Object.values(allRooms).some(r => r.length > 0) && <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No rooms configured. Add rooms in Settings → Rooms.</div></Card>}
      </div>
    );
  };

  // ─── Picture Checklist ───
  const renderPictures = () => {
    const dogs = pictureDogs;
    const picItems = items;
    const done = dogs.filter(r => picItems[r.dogId]).length;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: dogs.length ? `${(done / dogs.length) * 100}%` : "0%", height: "100%", background: done === dogs.length && dogs.length ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: done === dogs.length && dogs.length ? C.suc : C.text }}>{done}/{dogs.length} photos</span>
        </div>
        {dogs.length === 0 ? <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No dogs qualify for pictures today.</div><div style={{ color: C.textMut, fontSize: 12, marginTop: 4 }}>Boarding dogs on their first or last day are excluded.</div></Card> : (
          <Card>
            {dogs.map((r, i) => {
              const d = getDog(r.dogId);
              const c = getClient(r.clientId);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < dogs.length - 1 ? `1px solid ${C.border}` : "none", gap: 12 }}>
                  <input type="checkbox" checked={!!picItems[r.dogId]} disabled={isLocked} onChange={e => toggleItem(r.dogId, null, e.target.checked)} style={{ width: 20, height: 20, accentColor: C.suc }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: picItems[r.dogId] ? C.textMut : C.text, textDecoration: picItems[r.dogId] ? "line-through" : "none" }}>{d ? d.fields.name : "?"}</span>
                    <span style={{ fontSize: 12, color: C.textMut, marginLeft: 8 }}>{c ? `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim() : ""}</span>
                  </div>
                  <Badge color="primary" size="sm">{r.roomType} · {r.room}</Badge>
                  {d && d.fields.breed && <Badge color="default" size="sm">{d.fields.breed}</Badge>}
                </div>
              );
            })}
          </Card>
        )}
      </div>
    );
  };

  // Override toggleItem for pictures (flat boolean instead of object)
  const togglePicture = (dogId, val) => {
    if (isLocked) return;
    setItems(prev => ({ ...prev, [dogId]: val }));
    setDirty(true);
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
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 11, borderBottom: `2px solid ${C.border}` }}>OWNER</th>
                  {sesLabels.map((s, si) => (
                    <th key={si} colSpan={3} style={{ padding: "10px 6px", textAlign: "center", fontWeight: isRequired(si) ? 800 : 500, color: isRequired(si) ? C.pri : C.textMut, fontSize: 11, borderBottom: `2px solid ${isRequired(si) ? C.pri : C.border}`, borderLeft: `1px solid ${C.border}`, background: isRequired(si) ? C.priLt : C.surfaceHover }}>
                      {s}{isRequired(si) ? <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, marginLeft: 4, textTransform: "uppercase" }}>REQ</span> : <span style={{ fontSize: 9, fontWeight: 500, color: C.textMut, marginLeft: 4, fontStyle: "italic" }}>extra</span>}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: C.surfaceHover }}>
                  <th /><th />
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

  // Fix pictures toggle to use flat boolean
  const renderPicturesFixed = () => {
    const dogs = pictureDogs;
    const picItems = items;
    const done = dogs.filter(r => picItems[r.dogId]).length;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 8, background: C.surfaceHover, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: dogs.length ? `${(done / dogs.length) * 100}%` : "0%", height: "100%", background: done === dogs.length && dogs.length ? C.suc : C.pri, borderRadius: 4, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: done === dogs.length && dogs.length ? C.suc : C.text }}>{done}/{dogs.length} photos</span>
        </div>
        {dogs.length === 0 ? <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec, fontSize: 14 }}>No dogs qualify for pictures today.</div><div style={{ color: C.textMut, fontSize: 12, marginTop: 4 }}>Boarding dogs on their first or last day are excluded.</div></Card> : (
          <Card>
            {dogs.map((r, i) => {
              const d = getDog(r.dogId);
              const c = getClient(r.clientId);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < dogs.length - 1 ? `1px solid ${C.border}` : "none", gap: 12 }}>
                  <input type="checkbox" checked={!!picItems[r.dogId]} disabled={isLocked} onChange={e => togglePicture(r.dogId, e.target.checked)} style={{ width: 20, height: 20, accentColor: C.suc }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: picItems[r.dogId] ? C.textMut : C.text, textDecoration: picItems[r.dogId] ? "line-through" : "none" }}>{d ? d.fields.name : "?"}</span>
                    <span style={{ fontSize: 12, color: C.textMut, marginLeft: 8 }}>{c ? `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim() : ""}</span>
                  </div>
                  <Badge color="primary" size="sm">{r.roomType} · {r.room}</Badge>
                  {d && d.fields.breed && <Badge color="default" size="sm">{d.fields.breed}</Badge>}
                </div>
              );
            })}
          </Card>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={() => nav("operations")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>← Operations</button>
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
        : sub === "pictures" ? renderPicturesFixed()
        : sub === "pp" ? renderPP()
        : <Card style={{ padding: 32, textAlign: "center" }}><div style={{ color: C.textSec }}>Unknown checklist type</div></Card>}
      {dirty && !isLocked && <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", marginTop: 20 }}>
        <Btn onClick={saveEntry} style={{ padding: "10px 40px", fontSize: 14 }}>Save Changes</Btn>
      </div>}
    </div>
  );
}

export { DailyOpsPage };

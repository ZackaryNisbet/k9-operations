import { Btn, Inp, Modal } from "./ui";
import { C } from "../constants/colors";
import { DEF_MEDICATION_INSTRUCTION_OPTIONS, DEF_MEDICATION_NAME_OPTIONS, DEF_MEDICATION_TIME_OPTIONS, DEF_MEDICATION_UNIT_OPTIONS } from "../constants/dropdowns";
import { I } from "../icons";
import { addDays, gid } from "../lib/format";
import { useEffect, useMemo, useRef, useState } from "react";

function MedicationScheduleEditor({ schedules, onChange, data, readOnly, checkIn, checkOut, save }) {
  const [showModal, setShowModal] = useState(false);
  const [editIdx, setEditIdx] = useState(-1);
  const timeOpts = data.medicationTimeOptions || DEF_MEDICATION_TIME_OPTIONS;
  const unitOpts = data.medicationUnitOptions || DEF_MEDICATION_UNIT_OPTIONS;
  const nameOpts = data.medicationNameOptions || DEF_MEDICATION_NAME_OPTIONS;
  const instrOpts = data.medicationInstructionOptions || DEF_MEDICATION_INSTRUCTION_OPTIONS;

  const blank = { id: gid(), times: [], amount: "", unit: "", name: "", instruction: "", notes: "", dateMode: "every_day", customDates: [] };
  const [draft, setDraft] = useState(blank);
  // Searchable medication name state
  const [medNameSearch, setMedNameSearch] = useState("");
  const [medNameOpen, setMedNameOpen] = useState(false);
  const medNameRef = useRef(null);
  useEffect(() => { if (!medNameOpen) return; const h = (e) => { if (medNameRef.current && !medNameRef.current.contains(e.target)) setMedNameOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [medNameOpen]);

  const openAdd = () => { setDraft({ ...blank, id: gid() }); setMedNameSearch(""); setEditIdx(-1); setShowModal(true); };
  const openEdit = (idx) => {
    const s = schedules[idx];
    // Migrate legacy single `time` string to `times` array
    const times = s.times || (s.time ? [s.time] : []);
    setDraft({ ...s, times, instruction: s.instruction || s.notes || "", dateMode: s.dateMode || "every_day", customDates: s.customDates || [] });
    setMedNameSearch(s.name || "");
    setEditIdx(idx);
    setShowModal(true);
  };
  const saveDraft = () => {
    if (!draft.name.trim()) return;
    const updated = editIdx >= 0 ? schedules.map((s, i) => i === editIdx ? draft : s) : [...schedules, draft];
    onChange(updated);
    setShowModal(false);
  };
  const remove = (idx) => onChange(schedules.filter((_, i) => i !== idx));

  const toggleTime = (t) => setDraft(d => ({ ...d, times: d.times.includes(t) ? d.times.filter(x => x !== t) : [...d.times, t] }));

  // Build list of all dates in the reservation range for the custom date picker
  const stayDates = useMemo(() => {
    if (!checkIn || !checkOut) return [];
    const dates = [];
    let cur = checkIn;
    while (cur <= checkOut) { dates.push(cur); cur = addDays(cur, 1); }
    return dates;
  }, [checkIn, checkOut]);

  const toggleCustomDate = (d) => setDraft(prev => ({ ...prev, customDates: prev.customDates.includes(d) ? prev.customDates.filter(x => x !== d) : [...prev.customDates, d].sort() }));

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 8, letterSpacing: "0.03em", textTransform: "uppercase" }}>Medication Schedules</div>
      {schedules.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {schedules.map((s, i) => (
            <div key={s.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.name || "Unnamed"}</div>
                <div style={{ fontSize: 12, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[(s.times || []).join(", ") || s.time, s.amount && s.unit ? `${s.amount} ${s.unit}` : s.amount].filter(Boolean).join(" · ") || "No details"}
                </div>
                {s.dateMode === "custom" && s.customDates && s.customDates.length > 0 && <div style={{ fontSize: 10, color: C.pri, fontWeight: 600, marginTop: 2 }}>Custom: {s.customDates.map(d => new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})).join(", ")}</div>}
              </div>
              {!readOnly && <button onClick={() => openEdit(i)} style={{ border: "none", background: "none", cursor: "pointer", color: C.pri, padding: 4 }}><I.Edit /></button>}
              {!readOnly && <button onClick={() => remove(i)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 4 }}><I.Trash /></button>}
            </div>
          ))}
        </div>
      )}
      {!readOnly && <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: `2px dashed ${C.border}`, background: "transparent", cursor: "pointer", color: C.pri, fontWeight: 600, fontSize: 12, fontFamily: "inherit", width: "100%", justifyContent: "center" }}>
        <I.Plus /> Add Medication Schedule
      </button>}

      {showModal && (
        <Modal title={editIdx >= 0 ? "Edit Medication Schedule" : "Add Medication Schedule"} onClose={() => setShowModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Date range selector */}
            {stayDates.length > 1 && <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>Applicable Days</div>
              <div style={{ display: "flex", gap: 8, marginBottom: draft.dateMode === "custom" ? 10 : 0 }}>
                {[{v:"every_day",l:"Every Day"},{v:"custom",l:"Custom Dates"}].map(opt => {
                  const sel = draft.dateMode === opt.v;
                  return <button key={opt.v} onClick={() => setDraft(d => ({ ...d, dateMode: opt.v, customDates: opt.v === "every_day" ? [] : d.customDates }))} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `2px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : C.surface, color: sel ? C.pri : C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}{opt.l}
                  </button>;
                })}
              </div>
              {draft.dateMode === "custom" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {stayDates.map(d => {
                    const sel = draft.customDates.includes(d);
                    const dayLabel = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                    return <button key={d} onClick={() => toggleCustomDate(d)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : C.surface, color: sel ? C.pri : C.textSec, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                      {sel && <span style={{marginRight:4}}>✓</span>}{dayLabel}
                    </button>;
                  })}
                </div>
              )}
            </div>}
            {/* Time multi-select pills + custom time */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>Time <span style={{ color: C.dan }}>*</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {timeOpts.map(t => {
                  const sel = draft.times.includes(t);
                  return (
                    <button key={t} onClick={() => toggleTime(t)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `2px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : C.surface, color: sel ? C.pri : C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      {sel && <I.X />}{t}
                    </button>
                  );
                })}
                {/* Show custom time entries */}
                {draft.times.filter(t => !timeOpts.includes(t)).map(t => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `2px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                    <span style={{cursor:"pointer",display:"flex"}} onClick={() => toggleTime(t)}><I.X /></span>{t}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input type="time" id="med-custom-time-input" style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", color: C.text, background: C.surface, outline: "none" }} />
                <button type="button" onClick={() => { const inp = document.getElementById("med-custom-time-input"); if (!inp || !inp.value) return; const [h,m] = inp.value.split(":"); const hr = parseInt(h); const ampm = hr >= 12 ? "pm" : "am"; const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr; const label = `Custom (${hr12}:${m} ${ampm})`; if (!draft.times.includes(label)) toggleTime(label); inp.value = ""; }} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.pri, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Add Custom Time</button>
              </div>
            </div>
            {/* Searchable medication name with type-to-filter and Enter-to-add */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" }}>Medication Name <span style={{ color: C.dan }}>*</span></div>
              <div ref={medNameRef} style={{ position: "relative" }}>
                <input type="text" value={medNameSearch} onChange={e => { setMedNameSearch(e.target.value); setDraft(d => ({...d, name: e.target.value})); setMedNameOpen(true); }} onFocus={() => setMedNameOpen(true)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const val = medNameSearch.trim(); if (val) { setDraft(d => ({...d, name: val})); setMedNameOpen(false); if (save && !nameOpts.includes(val)) { const current = data.medicationNameOptions || DEF_MEDICATION_NAME_OPTIONS; if (!current.includes(val)) save({...data, medicationNameOptions: [...current, val].sort()}); } } } }} placeholder="Search or type new medication..." style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${medNameOpen ? C.pri : C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: C.text, background: C.surface, outline: "none", transition: "border 0.15s", boxSizing: "border-box" }} />
                {medNameOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 200, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", maxHeight: 220, overflowY: "auto" }}>
                    {nameOpts.filter(n => n.toLowerCase().includes(medNameSearch.toLowerCase())).map(n => (
                      <button key={n} onClick={() => { setDraft(d => ({...d, name: n})); setMedNameSearch(n); setMedNameOpen(false); }} style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: `1px solid ${C.borderLight}`, background: draft.name === n ? C.priLt : "transparent", color: draft.name === n ? C.pri : C.text, fontSize: 13, fontWeight: draft.name === n ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between" }} onMouseEnter={e => { if (draft.name !== n) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { if (draft.name !== n) e.currentTarget.style.background = "transparent"; }}>
                        <span>{n}</span>
                        {draft.name === n && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                    ))}
                    {medNameSearch.trim() && !nameOpts.some(n => n.toLowerCase() === medNameSearch.trim().toLowerCase()) && (
                      <button onClick={() => { const val = medNameSearch.trim(); setDraft(d => ({...d, name: val})); setMedNameOpen(false); if (save) { const current = data.medicationNameOptions || DEF_MEDICATION_NAME_OPTIONS; if (!current.includes(val)) save({...data, medicationNameOptions: [...current, val].sort()}); } }} style={{ width: "100%", padding: "10px 14px", border: "none", background: C.bg, color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        + Add "{medNameSearch.trim()}" as new medication
                      </button>
                    )}
                    {nameOpts.filter(n => n.toLowerCase().includes(medNameSearch.toLowerCase())).length === 0 && !medNameSearch.trim() && (
                      <div style={{ padding: "10px 14px", fontSize: 12, color: C.textMut }}>Type to search medications...</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Inp label="Amount" value={draft.amount} onChange={v => setDraft({ ...draft, amount: v })} placeholder="e.g. 1" />
              <Inp label="Unit" type="select" value={draft.unit} onChange={v => setDraft({ ...draft, unit: v })} options={unitOpts} />
            </div>
            <Inp label="Medication Instruction" type="select" value={draft.instruction} onChange={v => setDraft({ ...draft, instruction: v })} options={instrOpts} />
            <Inp label="Medication Notes" value={draft.notes} onChange={v => setDraft({ ...draft, notes: v })} placeholder="Any special notes…" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
              <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn onClick={saveDraft}>Save</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { MedicationScheduleEditor };

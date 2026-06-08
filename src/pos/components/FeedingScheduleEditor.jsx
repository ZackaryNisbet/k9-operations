import { BB_CHART, BB_KEYS } from "../constants/feeding";
import { Btn, Inp, Modal } from "./ui";
import { C } from "../constants/colors";
import { DEF_FEEDING_INSTRUCTION_OPTIONS, DEF_FEEDING_TIME_OPTIONS, DEF_FEEDING_UNIT_OPTIONS, DEF_FOOD_TYPE_OPTIONS } from "../constants/dropdowns";
import { I } from "../icons";
import { fmtDate, fmtInstr, gid } from "../lib/format";
import { useState } from "react";

function FeedingScheduleEditor({ schedules, onChange, data, readOnly, dogWeight, dogName, dogId, onWeightUpdate }) {
  const [showModal, setShowModal] = useState(false);
  const [editIdx, setEditIdx] = useState(-1);
  const timeOpts = data.feedingTimeOptions || DEF_FEEDING_TIME_OPTIONS;
  const unitOpts = data.feedingUnitOptions || DEF_FEEDING_UNIT_OPTIONS;
  const foodTypeOpts = data.foodTypeOptions || DEF_FOOD_TYPE_OPTIONS;
  const instrOpts = data.feedingInstructionOptions || DEF_FEEDING_INSTRUCTION_OPTIONS;

  const blank = { id: gid(), times: [], amount: "", unit: "", foodType: "", instruction: [], notes: "" };
  const [draft, setDraft] = useState(blank);
  const [bbOverride, setBbOverride] = useState(false); // true when user manually overrides amount

  // Weight confirmation state
  const [weightConfirm, setWeightConfirm] = useState(null); // null | "yes" | "no" | "unsure"
  const [weightInput, setWeightInput] = useState("");

  // Blue Buffalo chart matching (support old names for backward compat)
  const BB_NAME_MAP = { "Blue Buffalo Chicken": "Blue Buffalo GI Vet-Grade (Chicken)", "Blue Buffalo Salmon": "Blue Buffalo HF Vet-Grade (Salmon)" };
  const isBB = (ft) => !!BB_CHART[ft] || !!BB_CHART[BB_NAME_MAP[ft]];
  const bbChart = BB_CHART[draft.foodType] || BB_CHART[BB_NAME_MAP[draft.foodType]] || null;
  // Use confirmed weight if "No" was chosen
  const effectiveWeight = weightConfirm === "no" && weightInput ? parseFloat(weightInput) || dogWeight : dogWeight;
  const bbMatch = bbChart && effectiveWeight ? bbChart.find(r => effectiveWeight >= r.min && effectiveWeight <= r.max) : null;

  // Auto-calc helper: given matched row + number of feedings, compute per-feeding qty
  const calcAutoQty = (match, numTimes) => {
    if (!match || !numTimes) return "";
    const mid = (match.low + match.high) / 2;
    const perFeeding = mid / numTimes;
    // Round to nearest 0.25 cup, return as decimal
    const rounded = Math.round(perFeeding * 4) / 4;
    return rounded % 1 === 0 ? `${rounded}` : `${rounded}`;
  };

  // When foodType changes to Blue Buffalo AND user hasn't overridden, auto-set amount
  const updateFoodType = (v) => {
    const newChart = BB_CHART[v] || BB_CHART[BB_NAME_MAP[v]] || null;
    const wt = weightConfirm === "no" && weightInput ? parseFloat(weightInput) || dogWeight : dogWeight;
    const newMatch = newChart && wt ? newChart.find(r => wt >= r.min && wt <= r.max) : null;
    setBbOverride(false);
    // Reset weight confirmation when switching food type
    setWeightConfirm(null);
    setWeightInput("");
    if (newMatch && draft.times.length > 0) {
      const autoAmt = calcAutoQty(newMatch, draft.times.length);
      setDraft(d => ({ ...d, foodType: v, amount: autoAmt, unit: d.unit || "cups" }));
    } else {
      setDraft(d => ({ ...d, foodType: v }));
    }
  };

  const openAdd = () => { setDraft({ ...blank, id: gid() }); setEditIdx(-1); setBbOverride(false); setWeightConfirm(null); setWeightInput(""); setShowModal(true); };
  const openEdit = (idx) => { setDraft({ ...schedules[idx] }); setEditIdx(idx); setBbOverride(true); setWeightConfirm(null); setWeightInput(""); setShowModal(true); };
  const saveDraft = () => {
    if (draft.times.length === 0) return;
    const updated = editIdx >= 0 ? schedules.map((s, i) => i === editIdx ? draft : s) : [...schedules, draft];
    onChange(updated);
    setShowModal(false);
  };
  const remove = (idx) => onChange(schedules.filter((_, i) => i !== idx));

  const toggleTime = (t) => {
    setDraft(d => {
      const newTimes = d.times.includes(t) ? d.times.filter(x => x !== t) : [...d.times, t];
      // Auto-recalc if Blue Buffalo selected and not overridden
      const chart = BB_CHART[d.foodType] || BB_CHART[BB_NAME_MAP[d.foodType]] || null;
      const wt = weightConfirm === "no" && weightInput ? parseFloat(weightInput) || dogWeight : dogWeight;
      const match = chart && wt ? chart.find(r => wt >= r.min && wt <= r.max) : null;
      if (match && newTimes.length > 0 && !bbOverride) {
        const autoAmt = calcAutoQty(match, newTimes.length);
        return { ...d, times: newTimes, amount: autoAmt, unit: d.unit || "cups" };
      }
      return { ...d, times: newTimes };
    });
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 8, letterSpacing: "0.03em", textTransform: "uppercase" }}>Feeding Schedules</div>
      {schedules.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {schedules.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.times.join(", ") || "No time set"}</div>
                <div style={{ fontSize: 12, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[s.amount && s.unit ? `${s.amount} ${s.unit}` : s.amount, s.foodType].filter(Boolean).join(" · ") || "No details"}
                </div>
                {fmtInstr(s.instruction) && <div style={{fontSize:11,color:C.acc,fontWeight:600,marginTop:2}}>{fmtInstr(s.instruction)}</div>}
              </div>
              {!readOnly && <button onClick={() => openEdit(i)} style={{ border: "none", background: "none", cursor: "pointer", color: C.pri, padding: 4 }}><I.Edit /></button>}
              {!readOnly && <button onClick={() => remove(i)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 4 }}><I.Trash /></button>}
            </div>
          ))}
        </div>
      )}
      {!readOnly && <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: `2px dashed ${C.border}`, background: "transparent", cursor: "pointer", color: C.pri, fontWeight: 600, fontSize: 12, fontFamily: "inherit", width: "100%", justifyContent: "center" }}>
        <I.Plus /> Add Feeding Schedule
      </button>}

      {/* Modal */}
      {showModal && (
        <Modal title={editIdx >= 0 ? "Edit Feeding Schedule" : "Add Feeding Schedule"} onClose={() => setShowModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Time multi-select */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>Time <span style={{ color: C.dan }}>*</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {timeOpts.map(t => {
                  const sel = draft.times.includes(t);
                  return (
                    <button key={t} onClick={() => toggleTime(t)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `2px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : C.surface, color: sel ? C.pri : C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      {sel && <I.X />}{t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Inp label="Amount" value={draft.amount} onChange={v => { if (bbChart) setBbOverride(true); setDraft({ ...draft, amount: v }); }} placeholder="e.g. 1.5" />
              <Inp label="Unit" type="select" value={draft.unit} onChange={v => setDraft({ ...draft, unit: v })} options={unitOpts} />
            </div>
            <Inp label="Food Type" type="select" value={draft.foodType} onChange={updateFoodType} options={foodTypeOpts} />
            {/* Weight Confirmation Question — shown when Blue Buffalo selected */}
            {isBB(draft.foodType) && (
              <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", background: C.bg }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                  Is {dogName || "this dog"} still {dogWeight || "?"} lbs?
                </div>
                <div style={{ fontSize: 10, color: C.textMut, marginBottom: 10 }}>
                  {(() => {
                    const dog = dogId && data.dogs ? data.dogs.find(d => d.id === dogId) : null;
                    const lastUpd = dog?.fields?.weightLastUpdated;
                    return lastUpd ? `Weight last updated: ${fmtDate(lastUpd)}` : "Weight last updated: unknown";
                  })()}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {[{ key: "yes", label: "Yes" }, { key: "no", label: "No, it is" }, { key: "unsure", label: "Not Sure" }].map(opt => {
                    const sel = weightConfirm === opt.key;
                    return (
                      <button key={opt.key} onClick={() => {
                        setWeightConfirm(opt.key);
                        if (opt.key === "yes" && onWeightUpdate) {
                          // Update last-updated date (weight stays the same)
                          onWeightUpdate(dogWeight, "confirmed");
                        }
                        if (opt.key === "unsure" && onWeightUpdate) {
                          onWeightUpdate(dogWeight, "unsure");
                        }
                        if (opt.key !== "no") setWeightInput("");
                      }} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 8, border: `2px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : C.surface, color: sel ? C.pri : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                        {opt.label}
                      </button>
                    );
                  })}
                  {weightConfirm === "no" && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <input type="number" value={weightInput} onChange={e => setWeightInput(e.target.value)} onBlur={() => {
                        const newWt = parseFloat(weightInput);
                        if (newWt && newWt > 0 && onWeightUpdate) {
                          onWeightUpdate(newWt, "updated");
                          // Recalc auto-qty with new weight
                          const chart = BB_CHART[draft.foodType] || BB_CHART[BB_NAME_MAP[draft.foodType]] || null;
                          const match = chart ? chart.find(r => newWt >= r.min && newWt <= r.max) : null;
                          if (match && draft.times.length > 0 && !bbOverride) {
                            setDraft(d => ({ ...d, amount: calcAutoQty(match, d.times.length), unit: d.unit || "cups" }));
                          }
                        }
                      }} placeholder="lbs" style={{ width: 70, padding: "5px 8px", borderRadius: 8, border: `2px solid ${C.pri}`, fontSize: 12, fontFamily: "inherit", outline: "none", textAlign: "center" }} autoFocus />
                      <span style={{ fontSize: 12, color: C.textSec }}>lbs</span>
                    </div>
                  )}
                </div>
                {weightConfirm === "yes" && <div style={{ fontSize: 11, color: C.suc, fontWeight: 600, marginTop: 6 }}>Weight confirmed. Last updated date refreshed.</div>}
                {weightConfirm === "unsure" && <div style={{ fontSize: 11, color: C.acc, fontWeight: 600, marginTop: 6 }}>Using {dogWeight} lbs (owner unsure). Logged for reference.</div>}
                {weightConfirm === "no" && weightInput && <div style={{ fontSize: 11, color: C.pri, fontWeight: 600, marginTop: 6 }}>Updated weight to {weightInput} lbs. Feeding chart adjusted.</div>}
              </div>
            )}
            {/* Blue Buffalo Weight Feeding Chart — always shows BOTH columns */}
            {isBB(draft.foodType) && (
              <div style={{ border: `1.5px solid ${C.pri}30`, borderRadius: 10, overflow: "hidden", background: C.bg }}>
                <div style={{ padding: "8px 14px", background: C.priLt, borderBottom: `1px solid ${C.pri}20`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.pri }}>Blue Buffalo Weight Feeding Chart</span>
                  {effectiveWeight ? <span style={{ fontSize: 11, color: C.textSec }}>Dog weight: {effectiveWeight} lbs</span> : <span style={{ fontSize: 11, color: C.acc, fontWeight: 600 }}>No weight on file</span>}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 700, color: C.textSec, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>Weight</th>
                      {BB_KEYS.map(k => {
                        const shortLabel = k.includes("Chicken") ? "GI Chicken" : "HF Salmon";
                        const isSelCol = (draft.foodType === k) || (BB_NAME_MAP[draft.foodType] === k);
                        return <th key={k} style={{ textAlign: "center", padding: "6px 10px", fontWeight: 700, color: isSelCol ? C.pri : C.textMut, fontSize: 10, borderBottom: `1px solid ${C.border}`, background: isSelCol ? C.pri + "08" : "transparent" }}>{shortLabel} (cups/day)</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {BB_CHART[BB_KEYS[0]].map((_, ri) => {
                      const rowMatch = effectiveWeight ? (effectiveWeight >= BB_CHART[BB_KEYS[0]][ri].min && effectiveWeight <= BB_CHART[BB_KEYS[0]][ri].max) : false;
                      return (
                        <tr key={ri} style={{ background: rowMatch ? C.pri + "08" : ri % 2 === 0 ? "transparent" : C.bg, transition: "background 0.15s" }}>
                          <td style={{ padding: "6px 10px", fontWeight: rowMatch ? 700 : 500, color: rowMatch ? C.pri : C.text, borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, whiteSpace: "nowrap" }}>
                            {BB_CHART[BB_KEYS[0]][ri].range}
                          </td>
                          {BB_KEYS.map(k => {
                            const isSelCol = (draft.foodType === k) || (BB_NAME_MAP[draft.foodType] === k);
                            const cellRow = BB_CHART[k][ri];
                            const isHighlight = rowMatch && isSelCol;
                            return (
                              <td key={k} style={{ padding: "6px 10px", textAlign: "center", fontWeight: isHighlight ? 700 : rowMatch ? 600 : 500, color: isHighlight ? C.pri : isSelCol ? C.text : C.textMut, borderBottom: `1px solid ${C.borderLight}`, background: isHighlight ? C.pri + "18" : isSelCol ? C.pri + "06" : "transparent", position: "relative", fontSize: 11 }}>
                                {cellRow.cups}
                                {isHighlight && <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 800, color: "#fff", background: C.suc, padding: "1px 5px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em", verticalAlign: "middle" }}>Rec</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {bbMatch && draft.times.length > 0 && !bbOverride && (
                  <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.pri}20`, background: C.suc + "10", fontSize: 11, color: C.textSec }}>
                    Auto-calculated: <strong style={{ color: C.text }}>{draft.amount} {draft.unit || "cups"}</strong> per feeding ({draft.times.length} feeding{draft.times.length > 1 ? "s" : ""}/day, ~{((bbMatch.low + bbMatch.high) / 2).toFixed(1)} cups/day total)
                  </div>
                )}
                {bbOverride && bbMatch && (
                  <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.acc}30`, background: C.acc + "10", fontSize: 11, color: C.acc, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Manual override — rec: {calcAutoQty(bbMatch, draft.times.length || 1)} {draft.unit || "cups"}/feeding</span>
                    <button onClick={() => { setBbOverride(false); if (draft.times.length > 0) setDraft(d => ({ ...d, amount: calcAutoQty(bbMatch, d.times.length), unit: d.unit || "cups" })); }} style={{ border: "none", background: C.acc, color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Reset to Auto</button>
                  </div>
                )}
              </div>
            )}
            <div>
              <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:6,letterSpacing:"0.03em",textTransform:"uppercase"}}>Feeding Instructions <span style={{fontWeight:400,textTransform:"none"}}>(select all that apply)</span></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {instrOpts.map(opt => {
                  const instrArr = Array.isArray(draft.instruction) ? draft.instruction : (draft.instruction ? [draft.instruction] : []);
                  const sel = instrArr.includes(opt);
                  return <button key={opt} type="button" onClick={() => {
                    const cur = Array.isArray(draft.instruction) ? draft.instruction : (draft.instruction ? [draft.instruction] : []);
                    const next = sel ? cur.filter(x => x !== opt) : [...cur, opt];
                    setDraft({ ...draft, instruction: next });
                  }} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:"transparent",color:sel?C.pri:C.textSec,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>{opt}</button>;
                })}
              </div>
            </div>
            <Inp label="Feeding Notes" value={draft.notes} onChange={v => setDraft({ ...draft, notes: v })} placeholder="Any special notes…" />
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

export { FeedingScheduleEditor };

import { Badge, Btn, Card, Modal, Tip } from "../components/ui";
import { C, TAG_COLORS } from "../constants/colors";
import { DEF_EOD_TEMPLATE } from "../constants/operations";
import { DEF_QUESTIONNAIRE } from "../constants/forms";
import { DEF_REQUIRED_VACCINES, VACCINES } from "../constants/vaccines";
import { DogAvatar, VaxIcon } from "../components/widgets";
import { DogFormFields } from "../components/DogFormFields";
import { DogTagChips } from "../components/DogTagChips";
import { I } from "../icons";
import { calcAge, fixedLabel, getDogAgeCompliance, getDogDaycareSize } from "../lib/dogHelpers";
import { countNights } from "../lib/pricing";
import { fmtDate, fmtInstr, gid, todayStr } from "../lib/format";
import { supabase } from "../../supabaseClient";
import { useEffect, useRef, useState } from "react";
import { uuid } from "../lib/ids";

function DogDetailPage({ data, save, clientId, dogId, nav }) {
  const client = data.clients.find(c=>c.id===clientId);
  const dog = data.dogs.find(d=>d.id===dogId);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [editTags, setEditTags] = useState([]);
  const [editGroupOverride, setEditGroupOverride] = useState(null);
  const [editProfilePic, setEditProfilePic] = useState("");
  const [editFeedingSchedules, setEditFeedingSchedules] = useState([]);
  const [editMedSchedules, setEditMedSchedules] = useState([]);
  const [sentQuestionnaire, setSentQuestionnaire] = useState(false);
  const [ppConfirm, setPpConfirm] = useState(null); // { reservations, daysLeft }
  const [dogVetSearch, setDogVetSearch] = useState("");
  const [dogVetDropOpen, setDogVetDropOpen] = useState(false);
  const dogVetDropRef = useRef(null);
  useEffect(() => {
    if (!dogVetDropOpen) return;
    const handler = (e) => { if (dogVetDropRef.current && !dogVetDropRef.current.contains(e.target)) setDogVetDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dogVetDropOpen]);

  if (!dog||!client) return <div style={{padding:40,textAlign:"center",color:C.textSec}}>Dog not found</div>;

  // Find active boarding reservations for this dog
  const getActiveBoardingForDog = () => {
    const today = todayStr();
    return (data.reservations || []).filter(r =>
      r.dogId === dogId && r.type === "boarding" && r.status === "checked-in" && r.checkOut >= today
    );
  };

  const startEdit = () => { setEditFields({...dog.fields}); setEditTags([...(dog.tags||[])]); setEditGroupOverride(dog.daycareGroupOverride || null); setEditProfilePic(dog.profilePic || ""); setEditFeedingSchedules([...(dog.fields.feedingSchedules||[])]); setEditMedSchedules([...(dog.fields.medicationSchedules||[])]); setEditing(true); };

  const doSaveEdit = async (addPPToReservations) => {
    let updatedData = {...data, dogs: data.dogs.map(d=>d.id===dogId?{...d,fields:{...editFields,feedingSchedules:editFeedingSchedules,medicationSchedules:editMedSchedules},tags:editTags,daycareGroupOverride:editGroupOverride||null,profilePic:editProfilePic||""}:d)};
    // If switching to Private Play mid-stay, stamp reservations with privatePlayStartDate
    if (addPPToReservations && addPPToReservations.length > 0) {
      const today = todayStr();
      updatedData.reservations = (updatedData.reservations || data.reservations).map(r => {
        if (addPPToReservations.includes(r.id)) return { ...r, privatePlayStartDate: today };
        return r;
      });
    }
    await save(updatedData);
    setEditing(false);
    setPpConfirm(null);
  };

  const saveEdit = async () => {
    const hadPP = (dog.tags || []).includes("tag_pp");
    const willHavePP = editTags.includes("tag_pp");
    if (!hadPP && willHavePP) {
      const activeBoarding = getActiveBoardingForDog();
      if (activeBoarding.length > 0) {
        const today = todayStr();
        const resInfo = activeBoarding.map(r => {
          const daysLeft = countNights(today, r.checkOut);
          return { id: r.id, checkOut: r.checkOut, daysLeft };
        });
        setPpConfirm({ reservations: resInfo });
        return;
      }
    }
    await doSaveEdit([]);
  };

  const sendQuestionnaireText = async () => {
    const currentQ = (data.questionnaires || []).find(q => q.isCurrent) || DEF_QUESTIONNAIRE;
    const linkId = uuid();
    const msgId = gid();
    const clientName = (client.fields?.first_name || "").trim();
    const dogName = dog.fields?.name || "your dog";
    const now = new Date().toISOString();

    const newLink = {
      id: linkId,
      linkType: "questionnaire",
      relatedId: currentQ.id,
      clientId: client.id,
      expiresAt: new Date(Date.now() + 30*86400000).toISOString(),
      viewCount: 0,
    };

    const newMsg = {
      id: msgId,
      clientId: client.id,
      direction: "outbound",
      channel: "sms",
      body: `Hi ${clientName}, please complete the "Getting to Know Your Dog" questionnaire for ${dogName} before your visit: k9operations.com/form/${linkId}`,
      sentAt: now,
      sentBy: "Staff",
      status: "sent",
      _simulated: true,
    };

    await save({
      ...data,
      outboundLinks: [...(data.outboundLinks || []), newLink],
      messages: [...(data.messages || []), newMsg],
    });
    setSentQuestionnaire(true);
    setTimeout(() => setSentQuestionnaire(false), 3000);
  };

  const toggleTag = (tagId) => {
    setEditTags(prev => prev.includes(tagId) ? prev.filter(t=>t!==tagId) : [...prev, tagId]);
  };

  const vaxFields = data.dogFields.filter(f=>f.id.endsWith("_exp"));
  const infoFields = data.dogFields.filter(f=>!f.id.endsWith("_exp"));

  return (
    <div>
      <button onClick={()=>nav("client-detail",{clientId})} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.textSec,fontSize:14,fontWeight:600,padding:0,marginBottom:20,fontFamily:"inherit"}}><I.Back/> Back to {client.fields.first_name} {client.fields.last_name}</button>

      <Card style={{marginBottom:20,padding:"24px 28px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <DogAvatar dog={dog} size={56} />
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <h2 style={{margin:0,fontSize:22,fontWeight:800,color:C.text}}>{dog.fields.name}</h2>
                <VaxIcon dog={dog} requiredVaccines={data.requiredVaccines} policies={data.resortPolicies} />
                {(() => { const evs = (data.evaluations || []).filter(e => e.dogId === dogId && e.locked).sort((a, b) => (b.date||"").localeCompare(a.date||"")); if (!evs.length) return null; const le = evs[0]; const tipLines = evs.map((ev,i) => `Eval ${i+1}: ${ev.result==="green"?"Approved":"Not Approved"} \u2014 ${ev.totalScore||0}/${ev.maxScore||0} pts (${fmtDate(ev.date)})`).join("\n"); return (
                  <Tip text={tipLines}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: le.result === "green" ? C.suc : C.dan, color: "#fff", fontSize: 12, fontWeight: 800 }}>
                      {le.result === "green" ? "\u2713" : "\u2717"}
                    </span>
                  </Tip>
                ); })()}
              </div>
              <div style={{fontSize:14,color:C.textSec,marginTop:2}}>{dog.fields.breed}{dog.fields.weight?` · ${dog.fields.weight} lbs`:""}{dog.fields.sex?` · ${dog.fields.sex}`:""}{dog.fields.dob ? ` · ${calcAge(dog.fields.dob)} old` : ""}{` · ${fixedLabel(dog)}`}</div>
              {dog.fields.dob && <div style={{fontSize:12,color:C.pri,fontWeight:600,marginTop:2}}>🎂 Born {new Date(dog.fields.dob+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <Tip text={dog.daycareGroupOverride ? `Daycare group manually set to ${dog.daycareGroupOverride}` : `Auto-classified by weight (${dog.fields.weight || "?"} lbs, threshold: 35 lbs)`}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: getDogDaycareSize(dog) === "large" ? C.priLt : C.sucLt, color: getDogDaycareSize(dog) === "large" ? C.pri : C.suc, cursor: "default" }}>
                    {getDogDaycareSize(dog) === "large" ? "Large" : "Small"} Dog{dog.daycareGroupOverride ? " ✎" : ""}
                  </span>
                </Tip>
                <DogTagChips dog={dog} dogTags={data.dogTags} size="md" />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={() => nav("questionnaire", { clientId, dogId })} icon={<I.Clipboard />} size="sm">{dog.questionnaireResponses?._completedAt ? "View Questionnaire" : "Questionnaire"}</Btn>
            <Btn variant="secondary" onClick={sendQuestionnaireText} icon={sentQuestionnaire ? <I.Check /> : <I.Send />} size="sm" style={sentQuestionnaire ? { background: C.sucLt, borderColor: C.suc, color: C.suc } : {}}>{sentQuestionnaire ? "Sent!" : "Send Form"}</Btn>
            <Btn variant="secondary" onClick={startEdit} icon={<I.Edit/>} size="sm">Edit</Btn>
          </div>
        </div>
        {/* Age compliance banner */}
        {(() => {
          const ac = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
          if (ac.ok && ac.grandfathered) return (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderRadius:10,background:C.accLt,border:`1px solid ${C.acc}30`,marginBottom:16}}>
              <span style={{fontSize:16}}>🛡️</span>
              <div style={{fontSize:13,color:C.text}}><strong>Grandfathered Senior</strong> — {dog.fields.name} is {ac.age} years old but has {ac.visits} completed visits. Service is allowed.</div>
            </div>
          );
          if (!ac.ok) return (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderRadius:10,background:C.danLt,border:`1px solid ${C.dan}30`,marginBottom:16}}>
              <span style={{fontSize:16}}>⚠️</span>
              <div style={{fontSize:13,color:C.dan,fontWeight:600}}>{ac.reason}. This dog may not be serviced under current resort policy.</div>
            </div>
          );
          return null;
        })()}
        {/* Questionnaire status */}
        {dog.questionnaireResponses?._completedAt ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderRadius:10,background:C.sucLt,border:`1px solid ${C.suc}30`,marginBottom:16,cursor:"pointer"}} onClick={() => nav("questionnaire",{clientId,dogId})}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>📋</span>
              <div style={{fontSize:13,color:C.text}}><strong>Questionnaire Complete</strong> — Submitted {fmtDate(dog.questionnaireResponses._completedAt.slice(0,10))}</div>
            </div>
            <span style={{fontSize:12,color:C.pri,fontWeight:600}}>View →</span>
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderRadius:10,background:C.accLt,border:`1px solid ${C.acc}30`,marginBottom:16,cursor:"pointer"}} onClick={() => nav("questionnaire",{clientId,dogId})}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>📋</span>
              <div style={{fontSize:13,color:C.text}}><strong>Questionnaire Pending</strong> — "Getting to Know Your Dog" form not yet completed</div>
            </div>
            <span style={{fontSize:12,color:C.pri,fontWeight:600}}>Fill Out →</span>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:"12px 20px"}}>
          {infoFields.filter(f=>!["name","breed","weight","sex"].includes(f.id)&&dog.fields[f.id]&&f.type!=="textarea"&&f.type!=="checkbox").map(f=>(<div key={f.id}><div style={{fontSize:11,fontWeight:600,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2}}>{f.name}</div><div style={{fontSize:14,color:C.text}}>{f.type==="date"?fmtDate(dog.fields[f.id]):dog.fields[f.id]}</div></div>))}
          {infoFields.filter(f=>f.type==="checkbox"&&dog.fields[f.id]).map(f=>(<div key={f.id}><div style={{fontSize:11,fontWeight:600,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2}}>{f.name}</div><div style={{fontSize:14,color:C.suc,fontWeight:600}}>Yes</div></div>))}
        </div>
        {infoFields.filter(f=>f.type==="textarea"&&dog.fields[f.id]).map(f=>(<div key={f.id} style={{marginTop:12,padding:"10px 14px",background:C.bg,borderRadius:10}}><div style={{fontSize:11,fontWeight:600,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>{f.name}</div><div style={{fontSize:14,color:C.text,lineHeight:1.5}}>{dog.fields[f.id]}</div></div>))}

        {/* Feeding Schedules */}
        {(dog.fields.feedingSchedules||[]).length > 0 && (
          <div style={{marginTop:16}}>
            <div style={{fontSize:11,fontWeight:600,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Feeding Schedule</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {dog.fields.feedingSchedules.map((s,i) => (
                <div key={i} style={{padding:"10px 14px",background:C.bg,borderRadius:10,border:`1px solid ${C.borderLight}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    {(s.times||[]).map(t => <span key={t} style={{display:"inline-block",padding:"2px 8px",borderRadius:6,background:C.priLt,color:C.pri,fontSize:11,fontWeight:700}}>{t}</span>)}
                    <span style={{fontSize:13,fontWeight:600,color:C.text}}>{s.amount} {s.unit}</span>
                    {s.foodType && <span style={{fontSize:12,color:C.textSec}}>· {s.foodType}</span>}
                  </div>
                  {(fmtInstr(s.instruction) && fmtInstr(s.instruction) !== "Regular") && <div style={{fontSize:12,color:C.acc,fontWeight:600,marginTop:4}}>{fmtInstr(s.instruction)}</div>}
                  {s.notes && <div style={{fontSize:12,color:C.textSec,marginTop:2,fontStyle:"italic"}}>{s.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Medication Schedules */}
        {(dog.fields.medicationSchedules||[]).length > 0 && (
          <div style={{marginTop:16}}>
            <div style={{fontSize:11,fontWeight:600,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Medications</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {dog.fields.medicationSchedules.map((s,i) => (
                <div key={i} style={{padding:"10px 14px",background:C.bg,borderRadius:10,border:`1px solid ${C.borderLight}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:C.text}}>{s.name}</span>
                    <span style={{fontSize:12,color:C.textSec}}>{s.amount} {s.unit}</span>
                    {((s.times && s.times.length > 0) ? s.times : (s.time ? [s.time] : [])).map((t,ti) => (
                      <span key={ti} style={{display:"inline-block",padding:"2px 8px",borderRadius:6,background:C.accLt,color:C.acc,fontSize:11,fontWeight:700}}>{t}</span>
                    ))}
                  </div>
                  {fmtInstr(s.instruction) && <div style={{fontSize:12,color:C.textSec,marginTop:4,fontStyle:"italic"}}>{fmtInstr(s.instruction)}</div>}
                  {s.notes && !fmtInstr(s.instruction) && <div style={{fontSize:12,color:C.textSec,marginTop:4,fontStyle:"italic"}}>{s.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weight Log */}
        {((dog.fields.weightLog || []).length > 0 || dog.fields.weight) && (
          <div style={{marginTop:16}}>
            <div style={{fontSize:11,fontWeight:600,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Weight History</div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <span style={{fontSize:22,fontWeight:800,color:C.text}}>{dog.fields.weight || "?"} lbs</span>
              {dog.fields.weightLastUpdated && <span style={{fontSize:11,color:C.textMut}}>Last updated: {fmtDate(dog.fields.weightLastUpdated)}</span>}
            </div>
            {(dog.fields.weightLog || []).length > 0 && (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {[...(dog.fields.weightLog || [])].reverse().slice(0, 10).map((entry, i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 12px",background:i===0?C.priLt:C.bg,borderRadius:8,border:`1px solid ${i===0?C.pri+"30":C.borderLight}`}}>
                    <span style={{fontSize:12,fontWeight:600,color:C.text}}>{entry.weight} lbs</span>
                    <span style={{fontSize:11,color:C.textSec}}>{fmtDate(entry.date)}</span>
                    <span style={{fontSize:10,color:entry.reason==="updated"?C.pri:entry.reason==="confirmed"?C.suc:C.acc,fontWeight:600,textTransform:"uppercase"}}>
                      {entry.reason === "updated" ? "Weight Changed" : entry.reason === "confirmed" ? "Confirmed" : entry.reason === "unsure" ? "Owner Unsure" : entry.reason}
                    </span>
                    {entry.by && <span style={{fontSize:10,color:C.textMut,marginLeft:"auto"}}>by {entry.by}</span>}
                  </div>
                ))}
                {(dog.fields.weightLog || []).length > 10 && <div style={{fontSize:11,color:C.textMut,textAlign:"center",padding:4}}>+ {(dog.fields.weightLog || []).length - 10} older entries</div>}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Vaccines */}
      <h3 style={{margin:"0 0 12px",fontSize:17,fontWeight:700,color:C.text}}>Vaccine Records</h3>
      <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
        {/* Table header */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 140px 140px 120px",padding:"10px 20px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          <div>Vaccine</div><div>Expiration</div><div>Updated By</div><div>Actions</div>
        </div>
        {/* Rows - only required vaccines */}
        {(data.requiredVaccines || DEF_REQUIRED_VACCINES).map(vId => {
          const vaxDef = VACCINES.find(v => v.id === vId);
          if (!vaxDef) return null;
          const val = dog.fields[vId];
          const exp = val && new Date(val + "T00:00:00") < new Date();
          const soon = val && !exp && (new Date(val + "T00:00:00") - new Date()) < 30 * 86400000;
          const ok = val && !exp;
          return (
            <div key={vId} style={{display:"grid",gridTemplateColumns:"1fr 140px 140px 120px",padding:"12px 20px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:exp||!val?C.dan:soon?C.warn:C.suc,display:"inline-flex"}}>{ok?<I.VaxOk/>:<I.VaxBad/>}</span>
                <span style={{fontSize:14,fontWeight:600,color:C.text}}>{vaxDef.name}</span>
                {exp && <Badge color="danger" size="sm">Expired</Badge>}
                {soon && <Badge color="warning" size="sm">Expiring Soon</Badge>}
                {!val && <Badge color="danger" size="sm">Not on File</Badge>}
              </div>
              <div style={{fontSize:13,fontWeight:600,color:exp||!val?C.dan:soon?C.warn:C.text}}>{val?fmtDate(val):"—"}</div>
              <div style={{fontSize:12,color:C.textMut,fontStyle:"italic"}}>—</div>
              <label style={{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:6,background:C.priLt,color:C.pri,fontSize:11,fontWeight:600}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload
                <input type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const filePath = `${dogId}/${vId}_${Date.now()}.${file.name.split('.').pop()}`;
                    const { error } = await supabase.storage.from("vaccine-records").upload(filePath, file);
                    if (!error) {
                      addGlobalToast?.({ type:"success", message:`Vaccine record uploaded for ${vaxDef.name}` });
                    } else {
                      addGlobalToast?.({ type:"error", message:"Upload failed — check if Storage bucket exists" });
                    }
                  } catch (err) {
                    addGlobalToast?.({ type:"error", message:"Storage not configured yet" });
                  }
                  e.target.value = "";
                }} />
              </label>
            </div>
          );
        })}
        <div style={{padding:"10px 20px",background:C.bg,borderTop:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><I.Sparkle/><span style={{fontSize:12,color:C.pri,fontWeight:500}}>Use AI Command to update vaccine records faster!</span></div>
        </div>
      </Card>

      {/* EOD Mentions for this Dog */}
      {(() => {
        const mentions = (data.eodEntries || []).flatMap(e => (e.mentions || []).filter(m => m.entityType === "dog" && m.entityId === dogId).map(m => ({ ...m, date: e.date, eodId: e.id, sections: e.sections })));
        if (!mentions.length) return null;
        const sorted = mentions.sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div style={{marginTop:24}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <h3 style={{margin:0,fontSize:17,fontWeight:700,color:C.text}}>EOD Mentions</h3>
              <span style={{fontSize:12,color:C.textMut}}>{sorted.length} mention{sorted.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {sorted.slice(0, 15).map((m, i) => {
                const sec = (m.sections || []).find(s => s.id === m.sectionId);
                const sectionLabel = (data.eodTemplate || DEF_EOD_TEMPLATE).find(t => t.id === m.sectionId);
                return (
                  <Card key={m.id || i} style={{padding:"12px 18px",cursor:"pointer"}} onClick={() => nav("eod")}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:13,fontWeight:700,color:C.pri}}>{fmtDate(m.date)}</span>
                      {sectionLabel && <Badge color="default" size="sm">{sectionLabel.emoji} {sectionLabel.label}</Badge>}
                    </div>
                    {sec && sec.content && <div style={{fontSize:12,color:C.textSec,marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:500}}>{sec.content.slice(0, 150)}</div>}
                  </Card>
                );
              })}
              {sorted.length > 15 && <div style={{fontSize:12,color:C.textMut,textAlign:"center",padding:8}}>+ {sorted.length - 15} more mentions</div>}
            </div>
          </div>
        );
      })()}

      {/* Evaluations History */}
      {(() => {
        const evals = (data.evaluations || []).filter(e => e.dogId === dogId).sort((a, b) => (b.date||"").localeCompare(a.date||""));
        if (!evals.length) return null;
        return (
          <div style={{marginTop:24}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <h3 style={{margin:0,fontSize:17,fontWeight:700,color:C.text}}>Evaluations</h3>
              <span style={{fontSize:12,color:C.textMut}}>{evals.length} total</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {evals.map(ev => (
                <Card key={ev.id} style={{padding:"14px 18px",cursor:"pointer"}} onClick={() => nav("evaluation-form", { reservationId: ev.reservationId })}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:13,fontWeight:700,color:C.pri}}>{fmtDate(ev.date)}</span>
                        <Badge color={ev.result === "green" ? "success" : "danger"} size="sm">{ev.result === "green" ? "Approved" : "Not Approved"}</Badge>
                        <Badge color="default" size="sm">{ev.evalType === "dayboarding" ? "Day Boarding" : "Daycare"}</Badge>
                      </div>
                      <div style={{fontSize:12,color:C.textSec}}>{ev.totalScore}/{ev.maxScore} pts · Evaluated by {ev.evaluatorName || "Staff"}</div>
                    </div>
                    <div style={{width:28,height:28,borderRadius:"50%",background:ev.result==="green"?C.suc:C.dan,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,flexShrink:0}}>
                      {ev.result === "green" ? "\u2713" : "\u2717"}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Edit Modal with Tag Selection */}
      {editing&&<Modal title={`Edit ${dog.fields.name}`} onClose={()=>setEditing(false)} wide>
        {/* Dog Tags */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Dog Tags</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[...data.dogTags].sort((a, b) => a.id === "tag_eval" ? -1 : b.id === "tag_eval" ? 1 : 0).map(tag => {
              const sel = editTags.includes(tag.id);
              const tc = TAG_COLORS[tag.colorIdx % TAG_COLORS.length];
              return (
                <button key={tag.id} onClick={() => toggleTag(tag.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `2px solid ${sel ? tc.text : C.border}`, background: sel ? tc.bg : C.surface, color: sel ? tc.text : C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {sel && <I.Check />}
                  <I.Tag />{tag.name}
                </button>
              );
            })}
          </div>
        </div>
        {/* Profile Picture */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Profile Picture</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <DogAvatar dog={{ ...dog, profilePic: editProfilePic, fields: editFields }} size={48} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={editProfilePic && !editProfilePic.startsWith("data:") ? editProfilePic : ""} onChange={e => setEditProfilePic(e.target.value)} placeholder="Paste image URL…" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                <input type="file" accept="image/*" id="dogPicUpload" style={{ display: "none" }} onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                      const maxDim = 400;
                      let w = img.width, h = img.height;
                      if (w > maxDim || h > maxDim) { const r = Math.min(maxDim / w, maxDim / h); w = Math.round(w * r); h = Math.round(h * r); }
                      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                      canvas.toBlob(async (blob) => {
                        try {
                          const filePath = `${dogId}/${Date.now()}.jpg`;
                          const { error } = await supabase.storage.from("dog-profile-pics").upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
                          if (!error) {
                            const { data: urlData } = supabase.storage.from("dog-profile-pics").getPublicUrl(filePath);
                            setEditProfilePic(urlData.publicUrl);
                            return;
                          }
                        } catch (err) { console.warn("Storage upload failed, using base64:", err); }
                        setEditProfilePic(canvas.toDataURL("image/jpeg", 0.8));
                      }, "image/jpeg", 0.8);
                    };
                    img.src = ev.target.result;
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }} />
                <button onClick={() => document.getElementById("dogPicUpload").click()} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload</span>
                </button>
              </div>
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 3 }}>{editProfilePic && editProfilePic.startsWith("data:") ? "Image uploaded ✓" : "Paste a URL or upload a photo"}</div>
            </div>
            {editProfilePic && <button onClick={() => setEditProfilePic("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, fontSize: 12, fontFamily: "inherit" }}>Clear</button>}
          </div>
        </div>
        {/* Daycare Group Override */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Daycare Group</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: null, l: `Auto (${parseInt(editFields.weight) >= 35 || !editFields.weight ? "Large" : "Small"} — based on weight)` },
              { v: "large", l: "Large (Override)" },
              { v: "small", l: "Small (Override)" },
            ].map(opt => (
              <button key={String(opt.v)} onClick={() => setEditGroupOverride(opt.v)}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `2px solid ${editGroupOverride === opt.v ? C.pri : C.border}`, background: editGroupOverride === opt.v ? C.priLt : C.surface, color: editGroupOverride === opt.v ? C.pri : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", textAlign: "center" }}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>
        {/* Dog's Vet */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Dog's Vet</div>
          <div ref={dogVetDropRef} style={{ position: "relative" }}>
            <input
              type="text"
              value={dogVetSearch}
              onChange={(e) => setDogVetSearch(e.target.value)}
              onFocus={() => setDogVetDropOpen(true)}
              placeholder="Search veterinarians..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            {dogVetDropOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 8, zIndex: 10, maxHeight: 300, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                {(() => {
                  const filtered = (data.vets || []).filter(v => v.isActive !== false && (v.vetName || '').toLowerCase().includes(dogVetSearch.toLowerCase()));
                  return (
                    <div>
                      {filtered.map(vet => (
                        <div
                          key={vet.id}
                          onClick={() => {
                            setEditFields({ ...editFields, vetId: vet.id });
                            setDogVetSearch("");
                            setDogVetDropOpen(false);
                          }}
                          style={{ padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${C.borderLight}`, transition: "background 0.1s" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = C.priLt}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{vet.vetName}</div>
                          {vet.clinicName && <div style={{ fontSize: 12, color: C.textSec }}>{vet.clinicName}</div>}
                          {vet.phone && <div style={{ fontSize: 11, color: C.textMut }}>{vet.phone}</div>}
                        </div>
                      ))}
                      {filtered.length === 0 && <div style={{ padding: "10px 12px", color: C.textMut, fontSize: 13 }}>No vets found</div>}
                      {/* Add New Vet inline */}
                      <div
                        onClick={async () => {
                          const name = dogVetSearch.trim();
                          if (!name) return;
                          const newVet = { id: crypto.randomUUID(), vetName: name, clinicName: '', phone: '', email: '', notes: '', isActive: true };
                          await save({ ...data, vets: [...(data.vets || []), newVet] });
                          setEditFields({ ...editFields, vetId: newVet.id });
                          setDogVetSearch("");
                          setDogVetDropOpen(false);
                        }}
                        style={{ padding: "10px 12px", cursor: "pointer", borderTop: `1.5px solid ${C.border}`, background: C.priLt, transition: "background 0.1s", display: "flex", alignItems: "center", gap: 6 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = C.pri + "20"}
                        onMouseLeave={(e) => e.currentTarget.style.background = C.priLt}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>{dogVetSearch.trim() ? `Add "${dogVetSearch.trim()}" as new vet` : "Add New Vet"}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          {editFields.vetId && (() => {
            const vet = (data.vets || []).find(v => v.id === editFields.vetId);
            return vet ? (
              <div style={{ marginTop: 8, padding: "8px 12px", background: C.priLt, borderRadius: 6, border: `1px solid ${C.pri}20` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.pri }}>{vet.vetName}</div>
                {vet.clinicName && <div style={{ fontSize: 11, color: C.text }}>{vet.clinicName}</div>}
              </div>
            ) : null;
          })()}
        </div>
        <DogFormFields fields={editFields} dogFields={data.dogFields} data={data} errors={{}} onChange={(id,v)=>setEditFields({...editFields,[id]:v})} feedingSchedules={editFeedingSchedules} onFeedingChange={setEditFeedingSchedules} medSchedules={editMedSchedules} onMedChange={setEditMedSchedules} dogId={dogId} onWeightUpdate={(wt, reason) => {
          const now = new Date().toISOString().slice(0,10);
          const logEntry = { date: now, weight: wt, reason, by: "Staff" };
          setEditFields(f => ({ ...f, weight: String(wt), weightLastUpdated: now, weightLog: [...(f.weightLog || []), logEntry] }));
        }} />
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:24}}><Btn variant="secondary" onClick={()=>setEditing(false)}>Cancel</Btn><Btn onClick={saveEdit}>Save</Btn></div>
      </Modal>}
      {/* Private Play surcharge confirmation dialog */}
      {ppConfirm && <Modal title="Private Play Surcharge" onClose={() => setPpConfirm(null)} width={480}>
        <div style={{ padding: "4px 0" }}>
          <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B40", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#92400E", marginBottom: 6 }}>This dog is boarding right now</div>
            <div style={{ fontSize: 13, color: "#78350F", lineHeight: 1.5 }}>
              {ppConfirm.reservations.length === 1
                ? `This dog is boarding right now and has ${ppConfirm.reservations[0].daysLeft} day${ppConfirm.reservations[0].daysLeft !== 1 ? "s" : ""} left, we are going to add the private play surcharge for the REMAINDER of the stay.`
                : `These dogs are boarding right now, we are going to add the private play surcharge ($${(data.pricing?.privatePlaySurcharge || 10)}/night) for the REMAINDER of each stay.`}
            </div>
          </div>
          {ppConfirm.reservations.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8, background: C.surface }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Checkout: {fmtDate(r.checkOut)}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>{r.daysLeft} night{r.daysLeft !== 1 ? "s" : ""} remaining</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>${(data.pricing?.privatePlaySurcharge || 10) * r.daysLeft}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Btn variant="secondary" onClick={() => setPpConfirm(null)}>Cancel</Btn>
            <Btn onClick={() => doSaveEdit(ppConfirm.reservations.map(r => r.id))}>Confirm & Apply Surcharge</Btn>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

export { DogDetailPage };

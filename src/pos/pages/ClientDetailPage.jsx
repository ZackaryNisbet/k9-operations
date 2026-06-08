import React, { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Btn, Card, Inp } from "../components/ui";
import { BoardingPreviewModal } from "../components/BoardingPreviewModal";
import { C } from "../constants/colors";
import { DEF_AGREEMENTS } from "../constants/forms";
import { DEF_EOD_TEMPLATE } from "../constants/operations";
import { DogAvatar, VaxIcon, buildAuditEntry } from "../components/widgets";
import { DogTagChips } from "../components/DogTagChips";
import { I } from "../icons";
import { agrSigned } from "../lib/agreements";
import { calcAge, fixedLabel } from "../lib/dogHelpers";
import { fmtDate, fmtPhone, fmtTime, gid, todayStr } from "../lib/format";
import { isFieldRequired } from "../lib/fieldRules";

function ClientDetailPage({ data, save, clientId, nav, profile, openReservationId }) {
  const client = data.clients.find(c=>c.id===clientId);
  const dogs = data.dogs.filter(d=>d.clientId===clientId);
  const reservations = data.reservations.filter(r=>r.clientId===clientId).sort((a,b)=>b.checkIn.localeCompare(a.checkIn));
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [editRecurringDiscountId, setEditRecurringDiscountId] = useState(null);
  const [inlineFields, setInlineFields] = useState(() => ({...client.fields}));
  const [inlineRecurringDiscountId, setInlineRecurringDiscountId] = useState(client.recurringDiscountId || null);
  const [inlineDirty, setInlineDirty] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  // Keep inline fields in sync when client changes externally
  useEffect(() => {
    if (!inlineDirty) {
      setInlineFields({...client.fields});
      setInlineRecurringDiscountId(client.recurringDiscountId || null);
    }
  }, [client.fields, client.recurringDiscountId]);
  const updateInlineField = (fid, val) => { setInlineFields(prev => ({...prev, [fid]: val})); setInlineDirty(true); };
  const saveInlineEdit = async () => {
    setInlineSaving(true);
    // Build audit diffs
    const diffs = [];
    data.clientFields.forEach(f => {
      const oldVal = client.fields[f.id] || "";
      const newVal = inlineFields[f.id] || "";
      if (oldVal !== newVal) diffs.push({ field: f.name, oldVal: oldVal || "(empty)", newVal: newVal || "(empty)" });
    });
    if ((client.recurringDiscountId || null) !== (inlineRecurringDiscountId || null)) {
      const oldDisc = (data.discounts || []).find(d => d.id === client.recurringDiscountId);
      const newDisc = (data.discounts || []).find(d => d.id === inlineRecurringDiscountId);
      diffs.push({ field: "Recurring Discount", oldVal: oldDisc ? oldDisc.name : "None", newVal: newDisc ? newDisc.name : "None" });
    }
    const auditEntries = diffs.length > 0 ? [{
      id: gid(), tableName: 'k9_clients', recordId: clientId, reservationId: clientId,
      timestamp: new Date().toISOString(),
      userName: profile ? (profile.full_name || profile.email || "Staff") : "System",
      changedBy: profile ? (profile.full_name || profile.email || "Staff") : "System",
      action: "Updated Client Profile", details: diffs,
    }] : [];
    await save({
      ...data,
      clients: data.clients.map(c => c.id === clientId ? { ...c, fields: inlineFields, recurringDiscountId: inlineRecurringDiscountId || null } : c),
      auditLog: [...(data.auditLog || []), ...auditEntries],
    });
    setInlineDirty(false);
    setInlineSaving(false);
  };
  const cancelInlineEdit = () => { setInlineFields({...client.fields}); setInlineRecurringDiscountId(client.recurringDiscountId || null); setInlineDirty(false); };
  const [activeTab, setActiveTab] = useState("dogs");
  const [resSubTab, setResSubTab] = useState("upcoming");
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [textNotify, setTextNotify] = useState(null);
  const [vetSearch, setVetSearch] = useState("");
  const [vetDropOpen, setVetDropOpen] = useState(false);
  const vetDropRef = useRef(null);
  useEffect(() => {
    if (!vetDropOpen) return;
    const handler = (e) => { if (vetDropRef.current && !vetDropRef.current.contains(e.target)) setVetDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [vetDropOpen]);

  if (!client) return <div style={{padding:40,textAlign:"center",color:C.textSec}}>Client not found</div>;

  const startEdit = () => { setEditFields({...client.fields}); setEditRecurringDiscountId(client.recurringDiscountId || null); setEditing(true); };
  const saveEdit = async () => { await save({...data,clients:data.clients.map(c=>c.id===clientId?{...c,fields:editFields,recurringDiscountId:editRecurringDiscountId||null}:c)}); setEditing(false); };

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

  const sendAgreementLink = async (agrId) => {
    const agr = (data.agreements || []).find(a => a.id === agrId);
    if (!agr) return;
    const senderName = profile ? (profile.full_name || profile.email || 'Staff') : 'Staff';
    const clientName = (client.fields?.first_name || '').trim();
    const agrName = agr.name || 'Agreement';
    const now = new Date().toISOString();

    // Reuse existing outbound link for this client+agreement, or create new one
    const existingLink = (data.outboundLinks || []).find(l =>
      l.clientId === clientId && l.relatedId === agrId && l.linkType === 'agreement'
    );
    const linkId = existingLink ? existingLink.id : crypto.randomUUID();
    const msgId = gid();

    let updatedLinks = data.outboundLinks || [];
    if (existingLink) {
      // Refresh expiry on existing link
      updatedLinks = updatedLinks.map(l => l.id === linkId
        ? { ...l, expiresAt: new Date(Date.now() + 30*86400000).toISOString() }
        : l
      );
    } else {
      updatedLinks = [...updatedLinks, {
        id: linkId, linkType: 'agreement', relatedId: agrId,
        clientId: clientId, locationId: profile?.location_id || null,
        expiresAt: new Date(Date.now() + 30*86400000).toISOString(),
        viewCount: 0,
      }];
    }

    const newMsg = {
      id: msgId, clientId: clientId, direction: 'outbound', channel: 'sms',
      body: `Hi ${clientName}, please review and sign the ${agrName} agreement for K9 Operations: k9operations.com/sign/${linkId}`,
      sentAt: now, sentBy: senderName, status: 'sent', _simulated: true,
    };

    // Update agreement_log via client.agreements — use null logId so saveAgreementSignings INSERTs a proper row
    const agrs = { ...(client.agreements || {}) };
    const prevEntry = agrs[agrId];
    agrs[agrId] = { signed: false, date: null, status: 'sent', sentAt: now, sentBy: senderName, logId: prevEntry?.logId || null, messageId: msgId };

    await save({
      ...data,
      clients: data.clients.map(c => c.id === clientId ? { ...c, agreements: agrs } : c),
      outboundLinks: updatedLinks,
      messages: [...(data.messages || []), newMsg],
    });
  };

  const markAgreementSigned = async (agrId) => {
    const agrs = { ...(client.agreements || {}) };
    agrs[agrId] = { signed: true, date: todayStr(), status: 'signed' };
    await save({...data, clients: data.clients.map(c => c.id === clientId ? { ...c, agreements: agrs } : c)});
  };

  const [boardingPreviewId, setBoardingPreviewId] = useState(openReservationId || null);
  const [earlyCheckInModal, setEarlyCheckInModal] = useState(null); // {rid, currentDate, today}

  const handleCheckIn = async (rid) => {
    const res = data.reservations.find(r => r.id === rid);
    if (res && (res.type === "boarding" || res.type === "dayboarding")) { setBoardingPreviewId(rid); return; }

    // Check for early check-in (reservation is for future, but checking in today)
    if (res && res.checkIn) {
      const today = todayStr();
      const reservedDate = res.checkIn;
      if (reservedDate > today) {
        // Early check-in detected — show popup instead of checking in immediately
        setEarlyCheckInModal({ rid, currentDate: reservedDate, today });
        return;
      }
    }

    // Agreement gate for non-boarding check-ins
    if (res) {
      const ciAgrs = (data.agreements || DEF_AGREEMENTS).filter(a => a.required !== false);
      const allSigned = ciAgrs.every(a => agrSigned(client, a.id));
      if (!allSigned) { setBoardingPreviewId(rid); return; }
    }
    const ciAudit = buildAuditEntry(rid, "Checked In", [{field:"Status",oldVal:"Upcoming",newVal:"Checked In"}], profile);
    await save({...data, auditLog:[...(data.auditLog||[]),ciAudit], reservations:data.reservations.map(r=>r.id===rid?{...r,status:"checked-in"}:r)});
  };
  const handleCheckOut = async (rid) => {
    const res = data.reservations.find(r => r.id === rid);
    if (res && (res.type === "boarding" || res.type === "dayboarding")) { setBoardingPreviewId(rid); return; }
    const coAudit = buildAuditEntry(rid, "Checked Out", [{field:"Status",oldVal:"Checked In",newVal:"Checked Out"}], profile);
    const cdCoData = {...data, auditLog:[...(data.auditLog||[]),coAudit], reservations:data.reservations.map(r=>r.id===rid?{...r,status:"checked-out"}:r)};
    // ── Auto-feed to Conversion from Tour checkout (client detail) ──
    if (res && res.type === "tour" && res.clientId) {
      const tourCl = data.clients.find(c => c.id === res.clientId);
      if (tourCl) {
        const cRes = data.reservations.filter(r => r.clientId === res.clientId);
        const tSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
        const hasUp = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.id !== rid);
        if (tSpent === 0 && !hasUp) {
          const addD = (base, n) => { const d2 = new Date((base || todayStr()) + "T12:00:00"); d2.setDate(d2.getDate() + n); return d2.toISOString().split("T")[0]; };
          cdCoData.clients = data.clients.map(c => {
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
    await save(cdCoData);
  };

  const reactivateReservation = async (rid) => {
    const res = data.reservations.find(r => r.id === rid);
    if (!res || res.status !== "cancelled") return;
    const auditEntry = buildAuditEntry(rid, "Re-activated Reservation", [
      {field:"Status", oldVal:"Cancelled", newVal:"Upcoming"},
      {field:"Re-activated By", oldVal:"—", newVal: profile ? (profile.full_name || profile.email || "Staff") : "Staff"},
      {field:"Originally Cancelled", oldVal:"—", newVal: res.cancelledBy === "System (Auto)" ? "Auto-cancelled (check-in date lapsed)" : `Manual cancel by ${res.cancelledBy || "Unknown"}`},
    ], profile);
    await save({
      ...data,
      auditLog: [...(data.auditLog || []), auditEntry],
      reservations: data.reservations.map(r => r.id === rid ? {
        ...r, status: "upcoming", reactivatedAt: new Date().toISOString(), reactivatedBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff",
      } : r)
    });
  };

  const dn=(did)=>{const d=data.dogs.find(x=>x.id===did);return d?d.fields.name:"Unknown";};
  const tl=(t)=>t==="boarding"?"Boarding":t==="dayboarding"?"Day Board":t==="daycare"?"Daycare":t==="evaluation"?"Evaluation":"Tour";
  const sc=(s)=>s==="checked-in"?"success":s==="upcoming"?"info":"default";

  // Stats calculations
  const stats = useMemo(() => {
    const pmts = (data.payments || []).filter(p => p.clientId === clientId);
    const totalSpent = pmts.filter(p => p.status === "completed" && p.type !== "refund").reduce((s, p) => s + p.amount, 0);
    const sorted = [...reservations].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    const lastRes = sorted.find(r => r.checkIn <= todayStr());
    let daysSince = null;
    if (lastRes) {
      const lastDate = new Date(lastRes.checkIn + "T00:00:00");
      const now = new Date(); now.setHours(0,0,0,0);
      daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    }
    return { totalSpent, totalRes: reservations.length, daysSince };
  }, [reservations, data.payments, clientId]);

  // Notes data
  const handleSaveNote = async () => {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    const entry = { id: gid(), text: newNote.trim(), timestamp: new Date().toISOString(), addedBy: profile?.full_name || profile?.email || "Staff" };
    const updated = { ...client, clientNotes: [...(client.clientNotes || []), entry] };
    await save({ ...data, clients: data.clients.map(c => c.id === clientId ? updated : c) });
    setNewNote("");
    setNoteSaving(false);
  };
  const handleDeleteNote = async (noteId) => {
    const updated = { ...client, clientNotes: (client.clientNotes || []).filter(n => n.id !== noteId) };
    await save({ ...data, clients: data.clients.map(c => c.id === clientId ? updated : c) });
  };

  // EOD mentions
  const dogIds = dogs.map(d => d.id);
  const eodMentions = useMemo(() => (data.eodEntries || []).flatMap(e => (e.mentions || []).filter(m => (m.entityType === "client" && m.entityId === clientId) || (m.entityType === "dog" && dogIds.includes(m.entityId))).map(m => ({ ...m, date: e.date, eodId: e.id, sections: e.sections }))).sort((a, b) => b.date.localeCompare(a.date)), [data.eodEntries, clientId, dogIds.join(",")]);

  // Payments
  const pmts = useMemo(() => (data.payments || []).filter(p => p.clientId === clientId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [data.payments, clientId]);
  const statusClr = { completed: C.suc, pending: "#f59e0b", refunded: C.dan, failed: C.dan };
  const typeClr = { payment: C.pri, deposit: "#0ea5e9", tip: "#ec4899", refund: C.dan };

  // Reservation subtabs
  const upcomingRes = reservations.filter(r => r.status === "upcoming");
  const currentRes = reservations.filter(r => r.status === "checked-in");
  const pastRes = reservations.filter(r => r.status === "checked-out");
  const cancelledRes = reservations.filter(r => r.status === "cancelled");

  // Tab config
  const clientNotes = client.clientNotes || [];
  const notesCount = clientNotes.length + eodMentions.length;
  const clientSalesForCount = (data.packageSales || []).filter(s => s.clientId === clientId);
  const activePkgCount = clientSalesForCount.filter(s => (s.quantity || 0) - (s.used || 0) > 0).length;
  const tabs = [
    { id: "dogs", label: "Dogs", count: dogs.length, color: C.pri },
    { id: "reservations", label: "Reservations", count: reservations.length, color: C.acc },
    { id: "payments", label: "Payments", count: pmts.length, color: C.info },
    { id: "packages", label: "Packages", count: activePkgCount, color: "#EC4899" },
    { id: "lifecycle", label: "Lifecycle", count: (() => { const le = (client.lifecycleEvents || []).length; const cu = (client.lifecycle?.conversion?.updates || []).length; const ru = (client.lifecycle?.retention?.updates || []).length; return le + cu + ru; })(), color: "#8B5CF6" },
    { id: "notes", label: "Notes", count: notesCount, color: "#F59E0B" },
    { id: "history", label: "History", count: ((data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId)).length, color: "#6B7280" },
  ];

  // Reservation card renderer
  const renderResCard = (res) => (
    <Card key={res.id} style={{padding:"12px 18px",cursor:(res.type==="boarding"||res.type==="dayboarding")?"pointer":"default"}} onClick={()=>{if(res.type==="boarding"||res.type==="dayboarding")setBoardingPreviewId(res.id);}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:700,color:C.pri}}>{dn(res.dogId)}</span>
            <Badge color={tl(res.type)==="Tour"?"accent":tl(res.type)==="Daycare"?"success":tl(res.type)==="Evaluation"?"warning":"primary"} size="sm">{tl(res.type)}</Badge>
            {res.roomType && <Badge color="default" size="sm">{res.roomType}</Badge>}
            {res.type==="evaluation" && res.evalResult && res.evalResult !== "pending" && <Badge color={res.evalResult==="passed_group"?"success":"info"} size="sm">{res.evalResult==="passed_group"?"Passed Group":"Passed Private"}</Badge>}
          </div>
          <div style={{fontSize:13,color:C.textSec,marginTop:4}}>{fmtDate(res.checkIn)}{res.type!=="tour"&&res.type!=="evaluation"&&res.checkIn!==res.checkOut?` \u2192 ${fmtDate(res.checkOut)}`:""}{res.notes?` \u00B7 ${res.notes}`:""}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0,minWidth:90}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:3}}><I.Clock/><span style={{fontSize:10,fontWeight:600,color:C.textMut}}>IN</span><span style={{fontSize:12,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtTime(res.checkInTime)}</span></div>
            {res.actualCheckInTime && <div style={{fontSize:9,color:C.textMut,fontStyle:"italic",textAlign:"right"}}>actual: {new Date(res.actualCheckInTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>}
          </div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:3}}><I.Clock/><span style={{fontSize:10,fontWeight:600,color:C.textMut}}>OUT</span><span style={{fontSize:12,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtTime(res.checkOutTime)}</span></div>
            {res.actualCheckOutTime && <div style={{fontSize:9,color:C.textMut,fontStyle:"italic",textAlign:"right"}}>actual: {new Date(res.actualCheckOutTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {res.status==="upcoming"&&<Btn size="sm" variant="success" onClick={e=>{e.stopPropagation();handleCheckIn(res.id);}} icon={<I.LogIn/>}>Check In</Btn>}
          {res.status==="checked-in"&&<Btn size="sm" variant="accent" onClick={e=>{e.stopPropagation();handleCheckOut(res.id);}} icon={<I.LogOut/>}>Check Out</Btn>}
          {res.status==="cancelled"&&<Btn size="sm" variant="primary" onClick={e=>{e.stopPropagation();reactivateReservation(res.id);}} icon={<I.RefreshCw/>}>Re-activate</Btn>}
        </div>
      </div>
      {res.status==="cancelled"&&<div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:C.dan+"08",border:`1px solid ${C.dan}20`}}>
        <div style={{fontSize:11,color:C.dan,fontWeight:700}}>Cancelled {res.cancelledAt ? new Date(res.cancelledAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : ""}</div>
        <div style={{fontSize:11,color:C.textSec,marginTop:2}}>{res.cancelledBy==="System (Auto)"?"Auto-cancelled — check-in date lapsed":`Cancelled by ${res.cancelledBy||"Unknown"}`}{res.cancelReason&&res.cancelledBy!=="System (Auto)"?` · ${res.cancelReason}`:""}</div>
      </div>}
    </Card>
  );

  return (
    <div>
      {/* Header */}
      <Card style={{marginBottom:16,padding:"24px 28px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <h2 style={{margin:0,fontSize:22,fontWeight:800,color:C.text}}>{client.fields.first_name} {client.fields.last_name}</h2>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,fontSize:14,color:C.textSec}}><I.Phone/><span>{fmtPhone(client.fields.phone)}</span>{client.fields.email&&<span>&middot; {client.fields.email}</span>}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="primary" onClick={()=>nav("new-reservation",{clientId})} icon={<I.Plus/>} size="sm">New</Btn>
            <Btn variant="ghost" onClick={()=>nav("messages")} icon={<I.MessageSquare/>} size="sm">Message</Btn>
          </div>
        </div>

        {/* Inline Editable Client Fields */}
        <div style={{ padding: "14px 18px", background: C.bg, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Client Information</div>
            {inlineDirty && (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" size="sm" onClick={cancelInlineEdit}>Cancel</Btn>
                <Btn variant="primary" size="sm" onClick={saveInlineEdit} disabled={inlineSaving}>{inlineSaving ? "Saving..." : "Save Changes"}</Btn>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {data.clientFields.filter(f => f.type !== "textarea").map(f => (
              <div key={f.id} style={f.type === "checkbox" ? { display: "flex", alignItems: "end" } : {}}>
                <Inp label={f.name} type={f.type} value={inlineFields[f.id] || ""} onChange={v => updateInlineField(f.id, v)} required={isFieldRequired(f, "create")} options={f.options} />
              </div>
            ))}
            {(() => {
              const recurringDiscounts = (data.discounts || []).filter(d => d.discountKind === "recurring" && d.active !== false);
              return recurringDiscounts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Recurring Discount</label>
                  <select value={inlineRecurringDiscountId || ""} onChange={e => { setInlineRecurringDiscountId(e.target.value || null); setInlineDirty(true); }} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.surface, color: C.text, cursor: "pointer" }}>
                    <option value="">None</option>
                    {recurringDiscounts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type === "percentage" ? `${d.value}%` : `$${d.value}`} off)</option>)}
                  </select>
                </div>
              ) : null;
            })()}
          </div>
          {data.clientFields.filter(f => f.type === "textarea").map(f => (
            <div key={f.id} style={{ marginTop: 12 }}>
              <Inp label={f.name} type="textarea" value={inlineFields[f.id] || ""} onChange={v => updateInlineField(f.id, v)} />
            </div>
          ))}
        </div>

        {/* Agreement Status Section */}
        <div style={{ marginBottom: 16, padding: "14px 18px", background: C.bg, borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Agreement Status</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {data.agreements.map(agr => {
              const raw = client.agreements && client.agreements[agr.id];
              const isSigned = raw && (raw === true || raw.signed === true);
              const isPending = raw && !isSigned && (raw.status === 'sent' || raw.status === 'pending');
              const dateFmt = raw && raw.date ? new Date(raw.date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : null;
              const sentFmt = raw && raw.sentAt ? new Date(raw.sentAt).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" }) : null;
              const sentByName = raw?.sentBy || null;

              if (isSigned) {
                // Green pill — signed
                return (
                  <div key={agr.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: C.sucLt, border: `1.5px solid #A7F3D0` }}>
                    <span style={{ color: C.suc }}><I.CheckCircle /></span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.suc }}>{agr.name}</span>
                    {dateFmt && <span style={{ fontSize: 11, color: C.textMut }}>Signed {dateFmt}</span>}
                  </div>
                );
              } else if (isPending) {
                // Yellow pill — sent, awaiting signature
                return (
                  <div key={agr.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "#FEF3C7", border: "1.5px solid #F59E0B40", cursor: "pointer" }}
                    onClick={() => sendAgreementLink(agr.id)} title="Click to resend">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>{agr.name}</span>
                    <span style={{ fontSize: 11, color: "#78350F" }}>Pending</span>
                    {sentFmt && <span style={{ fontSize: 10, color: "#B45309" }}>sent {sentFmt}{sentByName ? ` by ${sentByName}` : ''}</span>}
                  </div>
                );
              } else {
                // Red pill — not sent, unsigned
                return (
                  <button key={agr.id} onClick={() => sendAgreementLink(agr.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "#FEE2E2", border: "1.5px solid #EF444440", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FECACA"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#FEE2E2"; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>Send {agr.name}</span>
                  </button>
                );
              }
            })}

          </div>
        </div>

        {/* Preferred Veterinarian Section */}
        <div style={{ marginBottom: 16, padding: "14px 18px", background: C.bg, borderRadius: 12, position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Preferred Veterinarian</div>
          <div ref={vetDropRef} style={{ position: "relative" }}>
            <input
              type="text"
              value={vetSearch}
              onChange={(e) => setVetSearch(e.target.value)}
              onFocus={() => setVetDropOpen(true)}
              placeholder="Search veterinarians..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            {vetDropOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 8, zIndex: 10, maxHeight: 300, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                {(() => {
                  const filtered = (data.vets || []).filter(v => v.isActive !== false && (v.vetName || '').toLowerCase().includes(vetSearch.toLowerCase()));
                  return (
                    <div>
                      {filtered.map(vet => (
                        <div
                          key={vet.id}
                          onClick={async () => {
                            await save({ ...data, clients: data.clients.map(c => c.id === clientId ? { ...c, preferredVetId: vet.id } : c) });
                            setVetSearch("");
                            setVetDropOpen(false);
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
                          const name = vetSearch.trim();
                          if (!name) return;
                          const newVet = { id: crypto.randomUUID(), vetName: name, clinicName: '', phone: '', email: '', notes: '', isActive: true };
                          await save({ ...data, vets: [...(data.vets || []), newVet], clients: data.clients.map(c => c.id === clientId ? { ...c, preferredVetId: newVet.id } : c) });
                          setVetSearch("");
                          setVetDropOpen(false);
                        }}
                        style={{ padding: "10px 12px", cursor: "pointer", borderTop: `1.5px solid ${C.border}`, background: C.priLt, transition: "background 0.1s", display: "flex", alignItems: "center", gap: 6 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = C.pri + "20"}
                        onMouseLeave={(e) => e.currentTarget.style.background = C.priLt}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>{vetSearch.trim() ? `Add "${vetSearch.trim()}" as new vet` : "Add New Vet"}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          {client.preferredVetId && (() => {
            const vet = (data.vets || []).find(v => v.id === client.preferredVetId);
            return vet ? (
              <div style={{ marginTop: 8, padding: "8px 12px", background: C.priLt, borderRadius: 6, border: `1px solid ${C.pri}20` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.pri }}>{vet.vetName}</div>
                {vet.clinicName && <div style={{ fontSize: 11, color: C.text }}>{vet.clinicName}</div>}
              </div>
            ) : null;
          })()}
        </div>

        {/* Fields are now inline above */}
      </Card>

      {/* Stats Bar */}
      <Card style={{marginBottom:16,padding:"16px 24px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[
            { label: "Referral Source", value: client.fields.referral_source || "Not set", color: client.fields.referral_source ? C.text : C.textMut },
            { label: "Client Since", value: (() => { const firstRes = reservations.length > 0 ? reservations[reservations.length - 1] : null; return firstRes ? fmtDate(firstRes.checkIn) : "N/A"; })(), color: C.text },
            { label: "Total Spent", value: `$${stats.totalSpent.toFixed(2)}`, color: C.suc },
            { label: "Total Reservations", value: String(stats.totalRes), color: C.pri },
            { label: "Days Since Last Visit", value: stats.daysSince === null ? "N/A" : stats.daysSince === 0 ? "Today" : `${stats.daysSince} days`, color: stats.daysSince !== null && stats.daysSince <= 7 ? C.suc : stats.daysSince !== null && stats.daysSince <= 30 ? C.warn : C.textSec },
          ].map(st => (
            <div key={st.label} style={{flex:"1 1 140px",padding:"10px 14px",background:C.bg,borderRadius:10,textAlign:"center",minWidth:120}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{st.label}</div>
              <div style={{fontSize:16,fontWeight:800,color:st.color}}>{st.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tab Bar */}
      <div style={{ display: "flex", borderBottom: `2px solid ${C.borderLight}`, background: C.bg, borderRadius: "12px 12px 0 0", marginBottom: 0 }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 16px", border: "none", borderBottom: `3px solid ${active ? tab.color : "transparent"}`, background: active ? C.surface : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", marginBottom: -2 }}>
              <span style={{ fontSize: 14, fontWeight: active ? 700 : 600, color: active ? C.text : C.textSec }}>{tab.label}</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, padding: "0 8px", borderRadius: 12, fontSize: 13, fontWeight: 800, background: active ? tab.color : C.surfaceHover, color: active ? "#fff" : C.textSec, transition: "all 0.15s" }}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{marginTop:16}}>

        {/* ──── DOGS TAB ──── */}
        {activeTab === "dogs" && (
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <h3 style={{margin:0,fontSize:17,fontWeight:700,color:C.text}}>Dogs ({dogs.length})</h3>
              <Btn variant="secondary" size="sm" onClick={()=>nav("new-dog",{clientId})} icon={<I.Plus/>}>Add Dog</Btn>
            </div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {dogs.length === 0 ? (
                <Card style={{flex:1,textAlign:"center",padding:32}}><div style={{fontSize:14,fontWeight:600,color:C.textSec,marginBottom:12}}>No dogs yet</div><Btn size="sm" onClick={()=>nav("new-dog",{clientId})} icon={<I.Plus/>}>Add Dog</Btn></Card>
              ) : dogs.map(dog => (
                <Card key={dog.id} hoverable onClick={()=>nav("dog-detail",{clientId,dogId:dog.id})} style={{flex:"1 1 280px",maxWidth:400,padding:"14px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                    <DogAvatar dog={dog} size={40} />
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:15,fontWeight:700,color:C.pri}}>{dog.fields.name}</span>
                        <VaxIcon dog={dog} requiredVaccines={data.requiredVaccines} policies={data.resortPolicies} />
                        <DogTagChips dog={dog} dogTags={data.dogTags} size="sm" />
                      </div>
                      <div style={{fontSize:12,color:C.textSec}}>{dog.fields.breed}{dog.fields.weight?` \u00B7 ${dog.fields.weight} lbs`:""}{dog.fields.dob ? ` \u00B7 ${calcAge(dog.fields.dob)} old` : ""}{` \u00B7 ${fixedLabel(dog)}`}</div>
                    </div>
                    <span style={{color:C.textMut}}><I.ChevronRight/></span>
                  </div>
                  <DogTagChips dog={dog} dogTags={data.dogTags} size="md" />
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ──── RESERVATIONS TAB ──── */}
        {activeTab === "reservations" && (
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <h3 style={{margin:0,fontSize:17,fontWeight:700,color:C.text}}>Reservations</h3>
              <Btn variant="secondary" size="sm" onClick={()=>nav("new-reservation",{clientId})} icon={<I.Plus/>}>New Reservation</Btn>
            </div>
            {/* Subtabs */}
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {[
                { id: "upcoming", label: "Upcoming", count: upcomingRes.length, color: C.info },
                { id: "current", label: "Current", count: currentRes.length, color: C.suc },
                { id: "past", label: "Past", count: pastRes.length, color: C.textMut },
                ...(cancelledRes.length > 0 ? [{ id: "cancelled", label: "Cancelled", count: cancelledRes.length, color: C.dan }] : []),
              ].map(st => {
                const active = resSubTab === st.id;
                return (
                  <button key={st.id} onClick={() => setResSubTab(st.id)} style={{
                    padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${active ? st.color : C.border}`,
                    background: active ? st.color + "14" : C.bg, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? st.color : C.textSec }}>{st.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? st.color : C.textMut, background: active ? st.color + "20" : C.surfaceHover, padding: "1px 7px", borderRadius: 8 }}>{st.count}</span>
                  </button>
                );
              })}
            </div>
            {/* Reservation list */}
            {(() => {
              const list = resSubTab === "upcoming" ? upcomingRes : resSubTab === "current" ? currentRes : resSubTab === "cancelled" ? cancelledRes : pastRes;
              return list.length === 0 ? (
                <Card style={{textAlign:"center",padding:32}}><div style={{fontSize:14,color:C.textSec}}>No {resSubTab} reservations</div></Card>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>{list.map(renderResCard)}</div>
              );
            })()}
          </div>
        )}

        {/* ──── PAYMENTS TAB ──── */}
        {activeTab === "payments" && (
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <h3 style={{margin:0,fontSize:17,fontWeight:700,color:C.text}}>Payment History ({pmts.length})</h3>
              <span style={{fontSize:14,fontWeight:700,color:C.pri}}>Total: ${stats.totalSpent.toFixed(2)}</span>
            </div>
            {pmts.length === 0 ? (
              <Card style={{textAlign:"center",padding:32}}><div style={{fontSize:14,color:C.textSec}}>No payments yet</div></Card>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {pmts.map(p => {
                  const r = data.reservations.find(res => res.id === p.reservationId);
                  return (
                    <Card key={p.id} style={{padding:"10px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{padding:"2px 7px",borderRadius:4,fontSize:11,fontWeight:600,background:typeClr[p.type]+"18",color:typeClr[p.type]}}>{p.type}</span>
                        <span style={{fontSize:15,fontWeight:700,color:C.text}}>${p.amount.toFixed(2)}</span>
                        <span style={{fontSize:12,color:C.textMut}}>{p.method === "card" ? `Card \u00B7\u00B7\u00B7\u00B7${p.cardLast4||""}` : p.method}</span>
                        {r && <span style={{fontSize:12,color:C.textMut}}>\u00B7 {r.roomType}</span>}
                        <span style={{fontSize:12,color:C.textMut,marginLeft:"auto"}}>{new Date(p.timestamp).toLocaleDateString()}</span>
                        <span style={{padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:600,background:statusClr[p.status]+"18",color:statusClr[p.status]}}>{p.status}</span>
                      </div>
                      {p.note && <div style={{fontSize:12,color:C.textMut,marginTop:4}}>{p.note}</div>}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ──── PACKAGES TAB ──── */}
        {activeTab === "packages" && (() => {
          const clientSales = (data.packageSales || []).filter(s => s.clientId === clientId);
          const pkgs = data.packages || [];
          const totalOutstanding = clientSales.reduce((sum, sale) => {
            const pkg = pkgs.find(p => p.id === sale.packageId);
            const remaining = (sale.quantity || 0) - (sale.used || 0);
            const retailUnitRate = ((sale.retailValue || pkg?.retailValue || 0) / (pkg?.quantity || 1));
            return sum + (remaining > 0 ? remaining * retailUnitRate : 0);
          }, 0);
          const storeCredit = client.storeCredit || 0;

          return (
            <div>
              {/* Summary strip */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                <Card style={{ padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 2 }}>Active Packages</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>{clientSales.filter(s => (s.quantity || 0) - (s.used || 0) > 0).length}</div>
                </Card>
                <Card style={{ padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 2 }}>Outstanding Value</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.acc }}>${totalOutstanding.toFixed(2)}</div>
                </Card>
                <Card style={{ padding: "16px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 2 }}>Store Credit</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.suc }}>${storeCredit.toFixed(2)}</div>
                </Card>
              </div>

              {/* Package list */}
              {clientSales.length === 0 ? (
                <Card style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.textMut }}>No packages purchased yet</div>
                </Card>
              ) : (
                <Card>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 0.7fr 1fr 0.8fr 0.8fr", gap: 0 }}>
                    {["Package", "Used", "Left", "Value", "Purchased", "Expires"].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 12px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>{h}</div>
                    ))}
                    {clientSales.map(sale => {
                      const pkg = pkgs.find(p => p.id === sale.packageId);
                      const remaining = Math.max(0, (sale.quantity || 0) - (sale.used || 0));
                      const retailUnitRate = ((sale.retailValue || pkg?.retailValue || 0) / (pkg?.quantity || 1));
                      const value = remaining * retailUnitRate;
                      let expiresAt = null;
                      if (pkg?.expirationType === "relative" && sale.purchaseDate) {
                        const d = new Date(sale.purchaseDate + "T00:00:00");
                        d.setDate(d.getDate() + (pkg.expirationDays || 90));
                        expiresAt = d.toISOString().slice(0, 10);
                      }
                      const expired = expiresAt && expiresAt < todayStr();
                      const usedUp = remaining <= 0;
                      const pctUsed = sale.quantity > 0 ? ((sale.used || 0) / sale.quantity) * 100 : 0;
                      return (
                        <React.Fragment key={sale.id}>
                          <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}` }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: usedUp || expired ? C.textMut : C.text }}>{sale.packageName || pkg?.name || "Package"}</div>
                            <div style={{ height: 4, borderRadius: 2, background: C.borderLight, marginTop: 6 }}>
                              <div style={{ height: 4, borderRadius: 2, background: usedUp ? C.textMut : expired ? C.dan : C.pri, width: `${Math.min(100, pctUsed)}%`, transition: "width 0.3s" }} />
                            </div>
                          </div>
                          <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.textMut }}>{sale.used || 0}</div>
                          <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, fontWeight: 700, color: remaining > 0 ? C.pri : C.textMut }}>{remaining}</div>
                          <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, fontWeight: 600, color: value > 0 ? C.text : C.textMut }}>${value.toFixed(2)}</div>
                          <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12, color: C.textMut }}>{sale.purchaseDate ? fmtDate(sale.purchaseDate) : "—"}</div>
                          <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12, color: expired ? C.dan : C.textMut, fontWeight: expired ? 600 : 400 }}>{expiresAt ? (expired ? "Expired " : "") + fmtDate(expiresAt) : "Never"}</div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Applicable Discounts */}
              {(() => {
                const discounts = (data.discounts || []).filter(d => d.active);
                if (discounts.length === 0) return null;
                return (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Available Discounts</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {discounts.map(d => (
                        <div key={d.id} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.suc}30`, background: C.sucLt, fontSize: 12, color: C.text }}>
                          <span style={{ fontWeight: 700 }}>{d.name}</span>
                          <span style={{ marginLeft: 6, color: C.suc, fontWeight: 600 }}>{d.type === "percentage" ? `${d.value}% off` : `$${d.value} off`}</span>
                          {d.usageCap > 0 && <span style={{ marginLeft: 6, color: C.textMut }}>({d.usageCap}x max)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ──── NOTES TAB ──── */}
        {activeTab === "lifecycle" && (() => {
          // Merge all lifecycle events and user logs into one chronological timeline
          const sysEvents = (client.lifecycleEvents || []).map(e => ({ type: "system", sortKey: e.date || "", ...e }));
          const convUpdates = (client.lifecycle?.conversion?.updates || []).map(u => ({ type: "user_log", tab: "leads", sortKey: u.loggedAt ? u.loggedAt.slice(0,10) : "", ...u }));
          const retUpdates = (client.lifecycle?.retention?.updates || []).map(u => ({ type: "user_log", tab: "lapsed", sortKey: u.loggedAt ? u.loggedAt.slice(0,10) : "", ...u }));
          const allEvents = [...sysEvents, ...convUpdates, ...retUpdates].sort((a, b) => (b.sortKey || "").localeCompare(a.sortKey || ""));

          const sysLabels = {
            "auto_fed_from_eval": "Auto-fed to Conversion from Evaluation",
            "auto_fed_from_tour": "Auto-fed to Conversion from Tour",
            "marked_cold": "Marked as Cold",
            "revived_from_cold": "Revived from Cold",
            "moved_to_retention": "Moved to Retention (lapsed)",
            "moved_to_active": "Moved to Active Customers",
            "created": "Client record created",
          };

          return (
            <div>
              <h3 style={{margin:"0 0 12px",fontSize:17,fontWeight:700,color:C.text}}>Lifecycle Timeline</h3>
              <p style={{fontSize:13,color:C.textSec,margin:"0 0 16px"}}>Read-only chronological log of all lifecycle events and outreach logs for this client.</p>

              {/* Pinned client notes */}
              {client.fields.notes && (
                <Card style={{padding:"12px 18px",marginBottom:16,borderLeft:`4px solid ${C.pri}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Client Notes (Profile)</div>
                  <div style={{fontSize:14,color:C.text,lineHeight:1.5}}>{client.fields.notes}</div>
                </Card>
              )}

              {allEvents.length === 0 ? (
                <Card style={{textAlign:"center",padding:32}}><div style={{fontSize:14,color:C.textSec}}>No lifecycle events yet</div></Card>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {allEvents.map((item, idx) => {
                    if (item.type === "user_log") {
                      const dt = item.loggedAt ? new Date(item.loggedAt) : null;
                      return (
                        <Card key={item.id || idx} style={{padding:"12px 18px",borderLeft:`4px solid #8B5CF6`}}>
                          <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                            <div style={{width:28,height:28,borderRadius:8,background:"#8B5CF620",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                              <I.Edit size={14} style={{color:"#8B5CF6"}} />
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                                <span style={{fontSize:13,fontWeight:700,color:C.text}}>{item.loggedBy || "Staff"}</span>
                                <Badge color="default" size="sm">{item.tab === "leads" ? "Leads" : "Lapsed"}</Badge>
                                {dt && <span style={{fontSize:11,color:C.textMut}}>{dt.toLocaleDateString()} {dt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>}
                              </div>
                              <div style={{fontSize:13,color:C.text,lineHeight:1.5,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{item.notes}</div>
                              <div style={{fontSize:11,color:C.textSec,marginTop:4}}>Target: {item.previousFollowUp ? fmtDate(item.previousFollowUp) : "—"} → Next: {fmtDate(item.newFollowUp)}</div>
                            </div>
                          </div>
                        </Card>
                      );
                    } else {
                      // System event — compact gray style
                      const label = sysLabels[item.event] || item.details || item.event;
                      return (
                        <div key={item.id || idx} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 18px",borderLeft:`4px solid ${C.border}`,background:C.bg,borderRadius:8}}>
                          <div style={{width:24,height:24,borderRadius:6,background:C.surfaceHover,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                          </div>
                          <div style={{flex:1}}>
                            <span style={{fontSize:12,fontWeight:600,color:C.textSec}}>{label}</span>
                          </div>
                          <span style={{fontSize:11,color:C.textMut,flexShrink:0}}>{item.date ? fmtDate(item.date) : ""}</span>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ──── NOTES TAB ──── */}
        {activeTab === "notes" && (
          <div>
            <h3 style={{margin:"0 0 16px",fontSize:17,fontWeight:700,color:C.text}}>Notes & EOD Mentions</h3>

            {/* Add new note */}
            <Card style={{padding:"14px 18px",marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Add Internal Note</div>
              <div style={{display:"flex",gap:8}}>
                <input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Type a note..." style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:14,fontFamily:"inherit",background:C.bg,color:C.text,outline:"none"}} onKeyDown={e=>{if(e.key==="Enter"&&newNote.trim())handleSaveNote();}} />
                <Btn size="sm" onClick={handleSaveNote} disabled={!newNote.trim()||noteSaving}>Add</Btn>
              </div>
            </Card>

            {/* Client notes */}
            {clientNotes.length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:13,fontWeight:700,color:C.textSec,marginBottom:8}}>Internal Notes ({clientNotes.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {clientNotes.sort((a,b)=>(b.timestamp||"").localeCompare(a.timestamp||"")).map(n => (
                    <Card key={n.id} style={{padding:"10px 16px"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,color:C.text,lineHeight:1.5,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{n.text}</div>
                          <div style={{fontSize:11,color:C.textMut,marginTop:4}}>{n.addedBy || "Staff"}{n.timestamp ? ` \u00B7 ${new Date(n.timestamp).toLocaleDateString()} ${new Date(n.timestamp).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}` : ""}</div>
                        </div>
                        <button onClick={()=>handleDeleteNote(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,padding:4,borderRadius:6,flexShrink:0}} title="Delete note"><I.Trash size={14}/></button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* EOD mentions */}
            {eodMentions.length > 0 && (
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.textSec,marginBottom:8}}>EOD Mentions ({eodMentions.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {eodMentions.map((m, i) => {
                    const dogName = m.entityType === "dog" ? dn(m.entityId) : null;
                    const tpl = (data.eodTemplate || DEF_EOD_TEMPLATE).find(t => t.id === m.sectionId);
                    const sec = (m.sections || []).find(s => s.id === m.sectionId);
                    const preview = sec && sec.content ? sec.content.slice(0, 150) : "";
                    return (
                      <Card key={`eod-${i}`} style={{padding:"10px 16px",borderLeft:`3px solid ${C.acc}`,cursor:"pointer"}} hoverable onClick={() => nav("eod")}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                          <div style={{width:28,height:28,borderRadius:8,background:C.acc+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                              <span style={{fontSize:13,fontWeight:700,color:C.text}}>{fmtDate(m.date)}</span>
                              {dogName && <Badge color="primary" size="sm">{dogName}</Badge>}
                              {tpl && <Badge color="default" size="sm">{tpl.emoji} {tpl.label}</Badge>}
                            </div>
                            <div style={{fontSize:13,color:C.textSec,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview || "EOD mention"}</div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {clientNotes.length === 0 && eodMentions.length === 0 && (
              <Card style={{textAlign:"center",padding:32}}><div style={{fontSize:14,color:C.textSec}}>No notes or EOD mentions yet</div></Card>
            )}
          </div>
        )}

        {/* ──── HISTORY TAB ──── */}
        {activeTab === "history" && (() => {
          const clientAudit = (data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId).sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));
          return (
            <div>
              {clientAudit.length === 0 && (
                <Card style={{textAlign:"center",padding:32}}><div style={{fontSize:14,color:C.textSec}}>No changes recorded yet</div></Card>
              )}
              {clientAudit.map(entry => {
                // details may be a JSON string after DB round-trip
                let details = entry.details;
                if (typeof details === 'string') { try { details = JSON.parse(details); } catch { details = []; } }
                if (!Array.isArray(details)) details = [];
                const ts = entry.timestamp || entry.createdAt;
                return (
                <Card key={entry.id} style={{padding:"14px 18px",marginBottom:8,borderLeft:`3px solid ${C.pri}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:28,height:28,borderRadius:8,background:C.pri+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <I.Edit size={14} color={C.pri}/>
                      </div>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:C.text}}>{entry.action}</div>
                        <div style={{fontSize:11,color:C.textMut}}>{entry.changedBy || entry.userName || "System"}{ts ? ` \u00B7 ${new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} ${new Date(ts).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}` : ""}</div>
                      </div>
                    </div>
                  </div>
                  {details.length > 0 && (
                    <div style={{marginLeft:36,display:"flex",flexDirection:"column",gap:4}}>
                      {details.map((d, i) => (
                        <div key={i} style={{fontSize:12,color:C.textSec,padding:"4px 10px",background:C.bg,borderRadius:6,display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontWeight:600,color:C.text,minWidth:100}}>{d.field}</span>
                          <span style={{textDecoration:"line-through",color:C.dan,fontSize:11}}>{d.oldVal}</span>
                          <span style={{color:C.textMut,fontSize:11}}>&rarr;</span>
                          <span style={{color:C.suc,fontWeight:600,fontSize:11}}>{d.newVal}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                );
              })}
            </div>
          );
        })()}

      </div>

      {/* Edit modal removed — fields are now inline */}

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

export { ClientDetailPage };

import { Btn, Inp, MiniDatePicker, fmtPhoneInput } from "../components/ui";
import { C, TAG_COLORS } from "../constants/colors";
import { DEF_AGREEMENTS, ROOM_TYPES } from "../constants/forms";
import { DEF_BATH_TYPE_OPTIONS } from "../constants/dropdowns";
import { DogFormFields } from "../components/DogFormFields";
import { FeedingScheduleEditor } from "../components/FeedingScheduleEditor";
import { I } from "../icons";
import { ItemizedReceipt, buildAuditEntry } from "../components/widgets";
import { MedicationScheduleEditor } from "../components/MedicationScheduleEditor";
import { calcReservationPricing, countNights } from "../lib/pricing";
import { fmtDate, fmtPhone, gid, summarizeFeeding, summarizeMeds, titleCase, todayStr } from "../lib/format";
import { getDogAgeCompliance, getDogDaycareSize, getSpayNeuterCompliance } from "../lib/dogHelpers";
import { getVaxStatus } from "../lib/vaccines";
import { hasPermission } from "../lib/roles";
import { isFieldRequired, validateFields } from "../lib/fieldRules";
import { useEffect, useMemo, useState } from "react";

function UnifiedNewPage({ data, save, nav, prefill, profile, addGlobalToast }) {
  // Early check-in modal (rendered at bottom of page)
  const [earlyCheckInModal, setEarlyCheckInModal] = useState(null);

  // Action level: determines which fields are required
  const [selectedAction, setSelectedAction] = useState(null); // null → show picker; "create"|"tour"|"eval"|"reservation"

  // Phase tracking: "client" → "dog" → "reservation"
  const [phase, setPhase] = useState("client");

  // Client fields (pre-filled from search)
  const [clientFields, setClientFields] = useState(() => {
    if (!prefill) return {};
    const v = prefill.trim();
    if (v.includes("@")) return { email: v };
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 7) return { phone: digits };
    const parts = v.split(/\s+/);
    if (parts.length >= 2) return { first_name: titleCase(parts[0]), last_name: titleCase(parts.slice(1).join(" ")) };
    return { first_name: titleCase(v) };
  });
  const [clientErrors, setClientErrors] = useState({});

  // Auto-focus: jump cursor to the next empty required field
  const autoFocusId = useMemo(() => {
    if (clientFields.first_name && clientFields.last_name) return "phone";
    if (clientFields.phone) return "first_name";
    if (clientFields.email) return "first_name";
    return "phone"; // default — phone is the first required field
  }, []);

  // Dog fields — support multiple dogs
  const [dogs, setDogs] = useState([{ id: gid(), fields: {}, tags: ["tag_eval"] }]);
  const [dogErrors, setDogErrors] = useState({});

  // Per-dog add-ons and bath selection: { [dogIdx]: { selectedBath, postBathReturn, selectedAddOns: [] } }
  const [dogAddOns, setDogAddOns] = useState({});
  const [expandedAddOns, setExpandedAddOns] = useState({});
  // Per-dog care expanded state
  const [careExpanded, setCareExpanded] = useState(true);
  // Closed date override — manager+ can acknowledge and proceed
  const [closedDateOverride2, setClosedDateOverride2] = useState(false);

  // Emergency contact local draft state — prevents focus loss when typing
  // Syncs to clientFields on blur so compliance check updates after field exit
  const [ecDraftName, setEcDraftName] = useState(clientFields.emergency_contact || "");
  const [ecDraftPhone, setEcDraftPhone] = useState(clientFields.emergency_phone || "");
  const syncEcName = () => setClientFields(prev => ({ ...prev, emergency_contact: ecDraftName }));
  const syncEcPhone = () => setClientFields(prev => ({ ...prev, emergency_phone: ecDraftPhone }));

  // Reservation fields
  const [type, setType] = useState("boarding");
  const [roomType, setRoomType] = useState("Luxury Suite");
  const [daycareSize, setDaycareSize] = useState("large");
  const [checkIn, setCheckIn] = useState(todayStr());
  const [checkOut, setCheckOut] = useState(todayStr());
  const [checkInTime, setCheckInTime] = useState("09:00");
  const [checkOutTime, setCheckOutTime] = useState("12:30");
  const [notes, setNotes] = useState("");

  // Auto-set daycare size from first dog's weight
  useEffect(() => {
    if (dogs.length > 0 && (type === "daycare" || type === "evaluation")) {
      const w = parseInt(dogs[0].fields.weight);
      if (w && !isNaN(w)) setDaycareSize(w < 35 ? "small" : "large");
    }
  }, [dogs[0]?.fields?.weight, type]);
  const [resErrors, setResErrors] = useState({});
  const [selectedRoom, setSelectedRoom] = useState("");
  const [showBookedRooms, setShowBookedRooms] = useState(false);
  const [complianceExpand, setComplianceExpand] = useState(null);

  const BATH_OPTS = data.bathTypeOptions || DEF_BATH_TYPE_OPTIONS;

  // Room availability
  const allRooms = data.rooms || {};
  const roomsForType = allRooms[roomType] || [];
  const bookedRoomNames = useMemo(() => {
    if (type !== "boarding" || !checkIn) return new Set();
    const ci = checkIn; const co = checkOut || checkIn;
    return new Set(data.reservations.filter(r => r.type === "boarding" && r.roomType === roomType && r.room && r.status !== "checked-out" && r.status !== "cancelled" && r.checkIn < co && r.checkOut > ci).map(r => r.room));
  }, [type, roomType, checkIn, checkOut, data.reservations]);
  const availableRooms = roomsForType.filter(r => !bookedRoomNames.has(r));
  const bookedRoomsArr = roomsForType.filter(r => bookedRoomNames.has(r));

  const roomScored = useMemo(() => {
    const ci = checkIn; const co = checkOut || checkIn;
    const allBoardingRes = data.reservations.filter(r => (r.type === "boarding" || r.type === "dayboarding") && r.roomType === roomType && r.room && r.status !== "checked-out" && r.status !== "cancelled");
    const totalRooms = roomsForType.length;
    const occupancy = totalRooms > 0 ? (totalRooms - availableRooms.length) / totalRooms : 0;
    const scored = roomsForType.map(room => {
      const booked = bookedRoomNames.has(room);
      const roomRes = allBoardingRes.filter(r => r.room === room);
      const before = roomRes.filter(r => r.checkOut <= ci).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
      const lastOut = before.length > 0 ? before[0].checkOut : null;
      const after = roomRes.filter(r => r.checkIn >= co).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      const nextIn = after.length > 0 ? after[0].checkIn : null;
      const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
      const gapBefore = lastOut ? daysBetween(lastOut, ci) : 999;
      const gapAfter = nextIn ? daysBetween(co, nextIn) : 999;
      const comfortScore = Math.min(gapBefore, 30) + Math.min(gapAfter, 30);
      const packScore = 60 - comfortScore;
      const blend = occupancy < 0.5 ? 0 : occupancy > 0.75 ? 1 : (occupancy - 0.5) / 0.25;
      const score = booked ? -9999 : (1 - blend) * comfortScore + blend * packScore;
      return { room, booked, lastOut, nextIn, gapBefore, gapAfter, score, occupancy };
    });
    scored.sort((a, b) => { if (a.booked !== b.booked) return a.booked ? 1 : -1; return b.score - a.score; });
    const topAvail = scored.find(r => !r.booked);
    if (topAvail) topAvail.recommended = true;
    return scored;
  }, [roomsForType, bookedRoomNames, checkIn, checkOut, roomType, data.reservations, availableRooms.length]);

  useEffect(() => { const rec = roomScored.find(r => r.recommended); if (rec && !selectedRoom) setSelectedRoom(rec.room); }, [roomScored]);
  useEffect(() => { if (type === "daycare" || type === "tour" || type === "evaluation") setCheckOut(checkIn); }, [type, checkIn]);
  useEffect(() => { if (type === "daycare") { setCheckInTime("07:00"); setCheckOutTime("18:00"); } else if (type === "tour") { setCheckInTime("14:00"); setCheckOutTime("14:30"); } else if (type === "evaluation") { setCheckInTime("09:00"); setCheckOutTime("15:00"); } else { setCheckInTime("09:00"); setCheckOutTime("11:00"); } }, [type]);
  useEffect(() => { setSelectedRoom(""); }, [roomType]);

  const updateDogField = (dogIdx, field, val) => {
    setDogs(prev => prev.map((d, i) => i === dogIdx ? { ...d, fields: { ...d.fields, [field]: val } } : d));
    setDogErrors(prev => ({ ...prev, [`${dogIdx}_${field}`]: undefined }));
  };

  const toggleDogTag = (dogIdx, tagId) => {
    setDogs(prev => prev.map((d, i) => i === dogIdx ? { ...d, tags: d.tags.includes(tagId) ? d.tags.filter(t => t !== tagId) : [...d.tags, tagId] } : d));
  };

  const addDog = () => setDogs(prev => [...prev, { id: gid(), fields: {}, tags: ["tag_eval"] }]);
  const removeDog = (idx) => { if (dogs.length > 1) setDogs(prev => prev.filter((_, i) => i !== idx)); };

  // Continue from client to dog+reservation
  const continueFromClient = () => {
    const errs = validateFields(data.clientFields, clientFields, selectedAction || "create");
    if (clientFields.phone) {
      const ex = data.clients.find(c => c.fields.phone === (clientFields.phone || "").replace(/\D/g, ""));
      if (ex) errs.phone = "Phone already exists — use search to find this client";
    }
    if (Object.keys(errs).length > 0) { setClientErrors(errs); return; }
    setPhase("reservation");
  };

  // Live pricing for unified page
  const livePricing = useMemo(() => {
    if (!type || phase !== "reservation" || dogs.length === 0) return null;
    if (type === "boarding" && dogs.length > 1) {
      let combined = { lineItems: [], subtotal: 0, discountTotal: 0, total: 0, deposit: 0, balance: 0, payAt: "booking", depositRefundable: false, depositPercent: 0 };
      dogs.forEach((dog, idx) => {
        const pr = calcReservationPricing({
          type, roomType, checkIn, checkOut, checkInTime, checkOutTime,
          dogs: [dog], dogProfiles: dogs, pricing: data.pricing,
          isSecondDogSameRoom: idx > 0,
          reservation: { actualCheckInTime: undefined },
        });
        combined.lineItems.push(...pr.lineItems);
        combined.subtotal += pr.subtotal;
        combined.discountTotal += pr.discountTotal;
        combined.total += pr.total;
        combined.deposit += pr.deposit;
        combined.balance += pr.balance;
        combined.payAt = pr.payAt;
        combined.depositRefundable = pr.depositRefundable;
        combined.depositPercent = pr.depositPercent;
      });
      combined.subtotal = Math.round(combined.subtotal * 100) / 100;
      combined.discountTotal = Math.round(combined.discountTotal * 100) / 100;
      combined.total = Math.round(combined.total * 100) / 100;
      combined.deposit = Math.round(combined.deposit * 100) / 100;
      combined.balance = Math.round(combined.balance * 100) / 100;
      return combined;
    }
    return calcReservationPricing({
      type, roomType, checkIn, checkOut, checkInTime, checkOutTime, daycareSize,
      dogs: [dogs[0]], dogProfiles: dogs, pricing: data.pricing,
      isSecondDogSameRoom: false,
      reservation: { actualCheckInTime: undefined },
    });
  }, [type, roomType, checkIn, checkOut, checkInTime, checkOutTime, daycareSize, phase, JSON.stringify(dogs.map(d => d.id))]);

  // Final save — create everything
  const handleCreateAll = async () => {
    // Sync EC draft fields to clientFields before save
    const finalClientFields = { ...clientFields, emergency_contact: ecDraftName, emergency_phone: ecDraftPhone };
    // Validate dogs
    const dErrs = {};
    dogs.forEach((dog, i) => {
      const dogValidation = validateFields(data.dogFields, dog.fields, selectedAction || "reservation");
      Object.entries(dogValidation).forEach(([k, v]) => { dErrs[`${i}_${k}`] = v; });
    });
    if (Object.keys(dErrs).length > 0) { setDogErrors(dErrs); return; }

    // Validate reservation
    const rErrs = {};
    if (!checkIn) rErrs.checkIn = "Required";
    if (type === "boarding" && checkOut < checkIn) rErrs.checkOut = "Must be after check-in";
    // Closed dates check — role-based: manager/owner/enterprise_admin can override, CSR/staff blocked
    const closedSet = new Set((data.closedDates || []).map(cd => cd.date));
    const hasClosedConflict2 = closedSet.has(checkIn) || (type==="boarding" && closedSet.has(checkOut));
    if (hasClosedConflict2 && !closedDateOverride2) {
      const canOverride = hasPermission(profile, data, "override_closed_dates");
      if (canOverride) {
        if(closedSet.has(checkIn)){const cd=(data.closedDates||[]).find(c=>c.date===checkIn);rErrs.checkIn=`Resort is closed${cd?.label?` (${cd.label})`:""} — click "Override Closed Date" to proceed`;}
        if(type==="boarding"&&closedSet.has(checkOut)){const cd=(data.closedDates||[]).find(c=>c.date===checkOut);rErrs.checkOut=`Resort is closed${cd?.label?` (${cd.label})`:""} — click "Override Closed Date" to proceed`;}
      } else {
        if(closedSet.has(checkIn)){const cd=(data.closedDates||[]).find(c=>c.date===checkIn);rErrs.checkIn=`Resort is closed${cd?.label?` (${cd.label})`:""}. Only a manager can override.`;}
        if(type==="boarding"&&closedSet.has(checkOut)){const cd=(data.closedDates||[]).find(c=>c.date===checkOut);rErrs.checkOut=`Resort is closed${cd?.label?` (${cd.label})`:""}. Only a manager can override.`;}
      }
    }
    if (Object.keys(rErrs).length > 0) { setResErrors(rErrs); return; }

    // Create client (use finalClientFields which includes EC draft values)
    const newClient = { id: gid(), fields: { ...finalClientFields, phone: (finalClientFields.phone || "").replace(/\D/g, "") }, createdAt: todayStr(), agreements: {} };

    // Create dogs
    const newDogs = dogs.map(d => ({ id: d.id, clientId: newClient.id, fields: { ...d.fields }, tags: d.tags }));

    // Create reservations (one per dog) with pricing snapshot
    const dogIds = dogs.length > 0 ? dogs.map(d => d.id) : [newDogs[0].id];
    const newReservations = dogIds.map((did, idx) => {
      const dog = newDogs.find(d => d.id === did);
      const autoDaycareSize = dog ? getDogDaycareSize(dog) : "large";
      const resPricing = calcReservationPricing({
        type, roomType, checkIn, checkOut: type === "boarding" ? checkOut : checkIn,
        checkInTime, checkOutTime, daycareSize: autoDaycareSize,
        dogs: dog ? [dog] : [], dogProfiles: newDogs, pricing: data.pricing,
        isSecondDogSameRoom: type === "boarding" && idx > 0,
        reservation: { actualCheckInTime: undefined },
      });
      return {
        id: gid(), clientId: newClient.id, dogId: did, type,
        ...((type === "boarding" || type === "dayboarding") ? { roomType, ...(selectedRoom ? { room: selectedRoom } : {}) } : {}),
        ...(type === "daycare" ? { daycareSize: autoDaycareSize } : {}),
        ...(type === "evaluation" ? { evalResult: "pending" } : {}),
        checkIn, checkOut: type === "boarding" ? checkOut : checkIn,
        checkInTime, checkOutTime, status: "upcoming", notes,
        careOverrides: {
          feedingSchedules: dog?.fields?.feedingSchedules || [],
          medicationSchedules: dog?.fields?.medicationSchedules || [],
          feeding: summarizeFeeding(dog?.fields?.feedingSchedules || []),
          medications: summarizeMeds(dog?.fields?.medicationSchedules || []),
          ...(dogAddOns[idx]?.selectedBath ? { bath_type: dogAddOns[idx].selectedBath } : {}),
          ...(dogAddOns[idx]?.postBathReturn ? { postBathReturn: dogAddOns[idx].postBathReturn } : {}),
        },
        ...(dogAddOns[idx]?.selectedAddOns?.length > 0 ? { selectedAddOns: dogAddOns[idx].selectedAddOns } : {}),
        pricing: resPricing,
        bookingSource: "phone",
        createdAt: new Date().toISOString(),
      };
    });

    // Auto-set eval tag for evaluation appointments or dogs without eval
    let saveDogs = [...data.dogs, ...newDogs];
    let saveDogTags = data.dogTags || [];
    if (type === "evaluation") {
      if (!saveDogTags.find(t => t.id === "tag_eval")) saveDogTags = [...saveDogTags, { id: "tag_eval", name: "Evaluation", colorIdx: 2 }];
      saveDogs = saveDogs.map(d => dogIds.includes(d.id) && !(d.tags || []).includes("tag_eval") ? { ...d, tags: [...(d.tags || []), "tag_eval"] } : d);
    }

    const createAudits = newReservations.map(r => buildAuditEntry(r.id, "Reservation Created", [{field:"Type",oldVal:"",newVal:r.type},{field:"Dates",oldVal:"",newVal:`${r.checkIn} → ${r.checkOut}`},{field:"Status",oldVal:"",newVal:"Upcoming"}], profile));
    await save({
      ...data,
      clients: [...data.clients, newClient],
      dogs: saveDogs,
      dogTags: saveDogTags,
      reservations: [...data.reservations, ...newReservations],
      auditLog: [...(data.auditLog || []), ...createAudits],
    });
    nav("dashboard");
    if (addGlobalToast) addGlobalToast({ message: "Client & Reservation Created", actionLabel: "View Reservation", onAction: () => nav("client-detail", { clientId: newClient.id, openReservation: newReservations[0]?.id }) });
  };

  // Create client + dogs only (skip reservation)
  const handleCreateClientOnly = async () => {
    // Sync EC draft fields
    const finalClientFields2 = { ...clientFields, emergency_contact: ecDraftName, emergency_phone: ecDraftPhone };
    // Validate client fields at the selected action level
    const actionLevel = selectedAction || "create";
    const cErrs = validateFields(data.clientFields, finalClientFields2, actionLevel);
    if (Object.keys(cErrs).length > 0) { setClientErrors(cErrs); return; }
    // Create client
    const newClient = { id: gid(), fields: { ...finalClientFields2, phone: (finalClientFields2.phone || "").replace(/\D/g, "") }, createdAt: todayStr(), agreements: {} };
    // Only create dogs if they have meaningful data (at least a name)
    const dogsWithData = dogs.filter(d => d.fields && d.fields.name && d.fields.name.trim());
    const newDogs = dogsWithData.map(d => ({ id: d.id, clientId: newClient.id, fields: { ...d.fields }, tags: d.tags }));
    await save({
      ...data,
      clients: [...data.clients, newClient],
      dogs: [...data.dogs, ...newDogs],
    });
    nav("client-detail", { clientId: newClient.id });
    if (addGlobalToast) addGlobalToast({ message: "Client Profile Created", actionLabel: "View Profile", onAction: () => nav("client-detail", { clientId: newClient.id }) });
  };

  const sectionStyle = (num, title, active) => ({
    padding: "24px 28px",
    borderRadius: 16,
    border: `1.5px solid ${active ? C.pri : C.border}`,
    background: active ? C.surface : C.bg,
    opacity: active ? 1 : 0.6,
    transition: "all 0.2s",
    marginBottom: 16,
  });

  const stepBadge = (num, label, done, active) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 14, background: done ? C.suc : active ? C.pri : C.border, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0, transition: "all 0.2s" }}>
        {done ? <I.Check /> : num}
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: done ? C.suc : active ? C.pri : C.textMut, transition: "all 0.2s" }}>{label}</span>
    </div>
  );

  const actionPickerOpts = [
    { key: "tour", icon: "🏠", label: "Tour", desc: "Book a facility tour" },
    { key: "eval", icon: "🐾", label: "Evaluation", desc: "Book a temperament eval" },
    { key: "reservation", icon: "📋", label: "Reservation", desc: "Book boarding, daycare, etc." },
    { key: "create", icon: "❓", label: "Not Sure Yet", desc: "Just create a record" },
  ];

  return (
    <div>
      <button onClick={() => nav("dashboard")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.textSec, fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 20, fontFamily: "inherit" }}><I.Back /> Back</button>
      <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 800, color: C.text }}>New Client{selectedAction && selectedAction !== "create" ? " & Reservation" : ""}</h1>
      <p style={{ margin: "0 0 28px", fontSize: 14, color: C.textSec, lineHeight: 1.5 }}>
        {!selectedAction ? "What are we booking today? This determines which fields are required." : selectedAction === "create" ? "Create a client record with minimal information. You can book a reservation later." : "Set up a new client, add their dog(s), and book their first reservation — all in one go."}
      </p>

      {/* ACTION PICKER */}
      {!selectedAction && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
          {actionPickerOpts.map(opt => (
            <button key={opt.key} onClick={() => {
              setSelectedAction(opt.key);
              if (opt.key === "tour") setType("tour");
              else if (opt.key === "eval") setType("evaluation");
              else if (opt.key === "reservation") setType("boarding");
            }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 22px", borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.background = C.priLt; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}>
              <div style={{ fontSize: 28 }}>{opt.icon}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* STEP 1: Client Info */}
      {selectedAction && (<>
      <div style={sectionStyle(1, "Client Info", phase === "client" || phase === "reservation")}>
        {stepBadge(1, "Client Information", phase === "reservation", phase === "client")}
        {phase === "client" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {data.clientFields.filter(f => f.type !== "textarea").map(f => (
                <div key={f.id}>
                  <Inp label={f.name} type={f.type} value={clientFields[f.id] || ""} onChange={v => { setClientFields({ ...clientFields, [f.id]: v }); setClientErrors({ ...clientErrors, [f.id]: undefined }); }} required={isFieldRequired(f, selectedAction || "create")} options={f.options} autoFocus={f.id === autoFocusId} />
                  {clientErrors[f.id] && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{clientErrors[f.id]}</div>}
                </div>
              ))}
            </div>
            {data.clientFields.filter(f => f.type === "textarea").map(f => (
              <div key={f.id} style={{ marginTop: 16 }}>
                <Inp label={f.name} type="textarea" value={clientFields[f.id] || ""} onChange={v => setClientFields({ ...clientFields, [f.id]: v })} />
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              {selectedAction === "create" ? (
                <Btn onClick={handleCreateClientOnly}>Create Client Record</Btn>
              ) : (
                <Btn onClick={continueFromClient}>Continue to Dogs & Reservation →</Btn>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.pri}, ${C.priL})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "#fff", flexShrink: 0 }}>
              {(clientFields.first_name || "?")[0]}{(clientFields.last_name || "?")[0]}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{clientFields.first_name} {clientFields.last_name}</div>
              <div style={{ fontSize: 12, color: C.textSec }}>{fmtPhone(clientFields.phone)}{clientFields.email ? ` · ${clientFields.email}` : ""}</div>
            </div>
            <button onClick={() => setPhase("client")} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: C.pri, fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>Edit</button>
          </div>
        )}
      </div>

      {/* STEP 2 & 3: Dogs + Reservation (shown when phase === "reservation") */}
      {phase === "reservation" && (
        <>
          {/* Dogs */}
          <div style={sectionStyle(2, "Dogs", true)}>
            {stepBadge(2, `Dog${dogs.length > 1 ? "s" : ""} Information`, false, true)}
            {dogs.map((dog, idx) => (
              <div key={dog.id} style={{ padding: 20, borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.surface, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Dog {dogs.length > 1 ? `#${idx + 1}` : ""} {dog.fields.name ? `— ${dog.fields.name}` : ""}</span>
                  {dogs.length > 1 && <button onClick={() => removeDog(idx)} style={{ border: "none", background: "none", cursor: "pointer", color: C.dan, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Remove</button>}
                </div>
                {/* Tags */}
                {data.dogTags.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Tags</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[...data.dogTags].sort((a, b) => a.id === "tag_eval" ? -1 : b.id === "tag_eval" ? 1 : 0).map(tag => {
                        const sel = dog.tags.includes(tag.id);
                        const tc = TAG_COLORS[tag.colorIdx % TAG_COLORS.length];
                        const isEval = tag.id === "tag_eval";
                        return (
                          <div key={tag.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            {isEval && <span style={{ fontSize: 9, fontWeight: 700, color: C.suc, textTransform: "uppercase", letterSpacing: "0.04em" }}>Recommended</span>}
                            <button onClick={() => toggleDogTag(idx, tag.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: `1.5px solid ${sel ? tc.text : C.border}`, background: sel ? tc.bg : C.surface, color: sel ? tc.text : C.textMut, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              {sel && <I.Check />}{tag.name}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <DogFormFields fields={dog.fields} dogFields={data.dogFields} data={data}
                  errors={Object.fromEntries(Object.entries(dogErrors).filter(([k]) => k.startsWith(`${idx}_`)).map(([k, v]) => [k.replace(`${idx}_`, ""), v]))}
                  onChange={(fid, v) => updateDogField(idx, fid, v)}
                  feedingSchedules={dog.fields.feedingSchedules || []}
                  onFeedingChange={fs => updateDogField(idx, "feedingSchedules", fs)}
                  medSchedules={dog.fields.medicationSchedules || []}
                  onMedChange={ms => updateDogField(idx, "medicationSchedules", ms)}
                  action={selectedAction || "reservation"}
                  onWeightUpdate={(wt) => {
                    updateDogField(idx, "weight", String(wt));
                    updateDogField(idx, "weightLastUpdated", new Date().toISOString().slice(0,10));
                  }} />
              </div>
            ))}
            <button onClick={addDog} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: `2px dashed ${C.border}`, background: "transparent", cursor: "pointer", color: C.pri, fontWeight: 600, fontSize: 13, fontFamily: "inherit", width: "100%", justifyContent: "center", transition: "all 0.15s" }}>
              <I.Plus /> Add Another Dog
            </button>
          </div>

          {/* Reservation */}
          <div style={sectionStyle(3, "Reservation", true)}>
            {stepBadge(3, "Reservation Details", false, true)}
            {/* Type */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6, letterSpacing: "0.03em", textTransform: "uppercase" }}>Type</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[{ v: "boarding", l: "Boarding" }, { v: "dayboarding", l: "Day Boarding" }, { v: "daycare", l: "Daycare" }, { v: "evaluation", l: "Evaluation" }, { v: "tour", l: "Tour" }].map(t => (
                  <button key={t.v} onClick={() => setType(t.v)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${type === t.v ? C.pri : C.border}`, background: type === t.v ? C.priLt : C.surface, color: type === t.v ? C.pri : C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.l}</button>
                ))}
              </div>
            </div>
            {/* Dates */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div><Inp label="Check-In Date" type="date" value={checkIn} onChange={setCheckIn} required />{checkIn&&<div style={{fontSize:11,color:C.pri,fontWeight:600,marginTop:2}}>{new Date(checkIn+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>}{resErrors.checkIn && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{resErrors.checkIn}</div>}</div>
              <div><Inp label="Check-In Time" type="time" value={checkInTime} onChange={setCheckInTime} /></div>
              {type === "boarding" && <div><Inp label="Check-Out Date" type="date" value={checkOut} onChange={setCheckOut} required />{checkOut&&<div style={{fontSize:11,color:C.pri,fontWeight:600,marginTop:2}}>{new Date(checkOut+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>}{checkIn&&checkOut&&<div style={{fontSize:11,fontWeight:600,color:C.textSec,marginTop:2}}>Nights: {countNights(checkIn,checkOut)}</div>}{resErrors.checkOut && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{resErrors.checkOut}</div>}</div>}
              {type === "boarding" && <div><Inp label="Check-Out Time" type="time" value={checkOutTime} onChange={setCheckOutTime} /></div>}
              {type !== "boarding" && <div><Inp label="Check-Out Time" type="time" value={checkOutTime} onChange={setCheckOutTime} /></div>}
            </div>
            {/* Room Type (boarding only) */}
            {type === "boarding" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 8, letterSpacing: "0.03em", textTransform: "uppercase" }}>Room Type</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ROOM_TYPES.map(rt => (
                    <button key={rt} onClick={() => setRoomType(rt)} style={{ padding: "10px 18px", borderRadius: 10, border: `2px solid ${roomType === rt ? C.pri : C.border}`, background: roomType === rt ? C.priLt : C.surface, color: roomType === rt ? C.pri : C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{rt}</button>
                  ))}
                </div>
                {roomsForType.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec, letterSpacing: "0.03em", textTransform: "uppercase" }}>Select Room <span style={{ fontWeight: 500, textTransform: "none", color: C.textMut }}>— {availableRooms.length}/{roomsForType.length} available</span></span>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textMut, cursor: "pointer" }}>
                        <input type="checkbox" checked={showBookedRooms} onChange={e => setShowBookedRooms(e.target.checked)} style={{ accentColor: C.pri }} />Show booked
                      </label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                      {roomScored.map(rs => {
                        const sel = selectedRoom === rs.room;
                        const booked = rs.booked;
                        if (booked && !showBookedRooms) return null;
                        return (
                          <button key={rs.room} onClick={() => !booked && setSelectedRoom(sel ? "" : rs.room)} disabled={booked}
                            style={{ padding: "10px 12px", borderRadius: 10, border: `2px solid ${booked ? C.borderLight : sel ? C.pri : rs.recommended ? C.suc : C.border}`, background: booked ? C.bg : sel ? C.priLt : C.surface, cursor: booked ? "not-allowed" : "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.12s", opacity: booked ? 0.5 : 1, position: "relative" }}>
                            {rs.recommended && !booked && <div style={{ position: "absolute", top: -8, right: 8, fontSize: 9, fontWeight: 700, color: "#fff", background: C.suc, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Best</div>}
                            <div style={{ fontSize: 14, fontWeight: 800, color: booked ? C.textMut : sel ? C.pri : C.text, textDecoration: booked ? "line-through" : "none" }}>{rs.room}</div>
                            {!booked && <div style={{ fontSize: 10, color: C.textMut, lineHeight: 1.5 }}>
                              <div>Last out: <span style={{ fontWeight: 600, color: rs.gapBefore <= 0 ? C.dan : rs.gapBefore <= 1 ? C.acc : C.textSec }}>{rs.lastOut ? `${fmtDate(rs.lastOut)}${rs.gapBefore >= 0 ? ` (${rs.gapBefore}d)` : ""}` : "None"}</span></div>
                              <div>Next in: <span style={{ fontWeight: 600, color: rs.gapAfter <= 0 ? C.dan : rs.gapAfter <= 1 ? C.acc : C.textSec }}>{rs.nextIn ? `${fmtDate(rs.nextIn)}${rs.gapAfter >= 0 ? ` (${rs.gapAfter}d)` : ""}` : "None"}</span></div>
                            </div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Per-Dog Care Instructions (bath, feeding, meds) — same as existing client flow */}
            {dogs.length > 0 && (selectedAction === "reservation" || selectedAction === "eval") && (
              <div style={{ marginTop: 16 }}>
                <button onClick={() => setCareExpanded(!careExpanded)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: careExpanded ? 12 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: type === "boarding" ? C.textSec : C.textMut, letterSpacing: "0.03em", textTransform: "uppercase" }}>Care Instructions per Dog</span>
                  {type !== "boarding" && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>(optional for {type === "daycare" ? "daycare" : type === "evaluation" ? "evaluations" : "this type"})</span>}
                  <span style={{ fontSize: 10, color: C.textMut, marginLeft: "auto" }}>{careExpanded ? "▲" : "▼"}</span>
                </button>
                {careExpanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {dogs.map((dog, idx) => {
                      const feedingSchedules = dog.fields.feedingSchedules || [];
                      const medicationSchedules = dog.fields.medicationSchedules || [];
                      return (
                        <div key={dog.id} style={{ padding: "16px 20px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.bg }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{dog.fields.name || `Dog ${idx + 1}`}</span>
                            <span style={{ fontSize: 12, color: C.textSec }}>{dog.fields.breed || ""}</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div>
                              <FeedingScheduleEditor schedules={feedingSchedules} onChange={v => updateDogField(idx, "feedingSchedules", v)} data={data} dogWeight={parseFloat(dog.fields.weight) || 0} dogName={dog.fields.name || `Dog ${idx + 1}`} dogId={dog.id} onWeightUpdate={(wt) => { updateDogField(idx, "weight", String(wt)); updateDogField(idx, "weightLastUpdated", new Date().toISOString().slice(0, 10)); }} />
                            </div>
                            <div>
                              <MedicationScheduleEditor schedules={medicationSchedules} onChange={v => updateDogField(idx, "medicationSchedules", v)} data={data} checkIn={checkIn} checkOut={checkOut} save={save} />
                            </div>
                            {type === "boarding" && countNights(checkIn, checkOut) >= 2 && <div>
                              <div style={{ padding: "10px 14px", borderRadius: 10, border: `1.5px dashed ${C.acc}`, background: C.acc + "08", marginBottom: 10, fontSize: 12, lineHeight: 1.5, color: C.textSec }}>
                                <strong style={{ color: C.text }}>Bathing Policy:</strong> K9 Operations requires all dogs boarding 2 or more nights receive a bath to ensure every pup goes home smelling and feeling great.
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Bathing Type <span style={{ color: C.dan }}>*</span></div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {BATH_OPTS.map(opt => {
                                  const sel = (dogAddOns[idx]?.selectedBath || "") === opt;
                                  return <button key={opt} onClick={() => {
                                    setDogAddOns(prev => {
                                      const prevAddOns = (prev[idx]?.selectedAddOns || []).filter(a => !a.endsWith(" Bath"));
                                      return { ...prev, [idx]: { ...prev[idx], selectedBath: sel ? "" : opt, selectedAddOns: sel ? prevAddOns : [...prevAddOns, `${opt} Bath`] } };
                                    });
                                  }} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : "transparent", color: sel ? C.pri : C.textSec, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 }}>
                                    {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                    {opt}
                                  </button>;
                                })}
                              </div>
                              {!(dog.tags || []).includes("tag_pp") && (dogAddOns[idx]?.selectedBath) && (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>After Bath on Checkout Day</div>
                                  <div style={{ fontSize: 11, color: C.textMut, marginBottom: 6 }}>Where should we return {dog.fields.name || `Dog ${idx + 1}`} after their bath?</div>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {[{ v: "Return to Group", icon: "👥" }, { v: "Return to Room", icon: "🏠" }].map(opt => {
                                      const sel = (dogAddOns[idx]?.postBathReturn || "") === opt.v;
                                      return <button key={opt.v} onClick={() => setDogAddOns(prev => ({ ...prev, [idx]: { ...prev[idx], postBathReturn: sel ? "" : opt.v } }))} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : "transparent", color: sel ? C.pri : C.textSec, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 }}>
                                        {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                        {opt.icon} {opt.v}
                                      </button>;
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Reservation Compliance for new clients */}
            {dogs.length > 0 && (() => {
              const vaxResults = dogs.map(dog => ({ dog, status: getVaxStatus(dog, data.requiredVaccines, data.resortPolicies) }));
              const allVaxOk = vaxResults.every(v => v.status.ok);
              const hasEmergency = !!(clientFields.emergency_contact && clientFields.emergency_phone);
              const agreements = data.agreements || DEF_AGREEMENTS;
              const reqAgrs = agreements.filter(a => a.required !== false);
              // New clients have no signed agreements
              const allAgrSigned = false;
              const ageResults = dogs.map(dog => ({ dog, status: getDogAgeCompliance(dog, data.resortPolicies, data.reservations) }));
              const allAgeOk = ageResults.every(a => a.status.ok);
              const snResults = dogs.map(dog => ({ dog, status: getSpayNeuterCompliance(dog) }));
              const allSnOk = snResults.every(s => s.status.ok);
              const renderCI = (ok, warn, label, detail, expandKey, children) => (
                <div key={expandKey} style={{ flex: "1 1 0", minWidth: 0 }}>
                  <button onClick={() => setComplianceExpand(prev => prev === expandKey ? null : expandKey)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${ok ? C.suc + "60" : warn ? C.acc + "60" : C.dan + "60"}`, background: ok ? C.suc + "12" : warn ? C.acc + "12" : C.dan + "12", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{ok ? "✓" : warn ? "⚠" : "✗"}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: ok ? C.suc : warn ? C.acc : C.dan }}>{label}</span>
                      <span style={{ fontSize: 9, color: C.textMut, marginLeft: "auto" }}>{complianceExpand === expandKey ? "▲" : "▼"}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.textSec, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</div>
                  </button>
                  {complianceExpand === expandKey && children && <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface }}>{children}</div>}
                </div>
              );
              return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 8, letterSpacing: "0.03em", textTransform: "uppercase" }}>Reservation Compliance</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
                    {renderCI(allVaxOk, false, "Vaccines", allVaxOk ? "All up to date" : vaxResults.filter(v => !v.status.ok).map(v => `${v.dog.fields.name || "Dog"}: ${[...v.status.expired, ...v.status.missing].length} issue${[...v.status.expired, ...v.status.missing].length > 1 ? "s" : ""}`).join(", "), "vax",
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {vaxResults.map((v, vi) => (
                          <div key={vi} style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>{v.dog.fields.name || `Dog ${vi + 1}`}</div>
                            {v.status.ok ? (
                              <div style={{ color: C.suc, fontSize: 11 }}>All vaccines current</div>
                            ) : (
                              <>
                                {v.status.expired.map(vId => <div key={vId} style={{ color: C.dan, fontSize: 11 }}>• {vId.replace(/_/g, " ")} — Expired</div>)}
                                {v.status.missing.map(vId => <div key={vId} style={{ color: C.dan, fontSize: 11 }}>• {vId.replace(/_/g, " ")} — Missing</div>)}
                              </>
                            )}
                            {(data.requiredVaccines || []).map(vId => {
                              const curDate = v.dog.fields[vId] || "";
                              return (
                                <div key={vId + "edit"} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: C.textSec, minWidth: 120 }}>{vId.replace(/_/g, " ")}</span>
                                  <MiniDatePicker value={curDate} onChange={(v) => {
                                      const newDogs = [...dogs];
                                      const idx = newDogs.findIndex(d => d.id === v.dog.id);
                                      if (idx >= 0) { newDogs[idx] = { ...newDogs[idx], fields: { ...newDogs[idx].fields, [vId]: v } }; setDogs(newDogs); }
                                    }} />
                                  {curDate && <span style={{ fontSize: 10, color: v.status.expired?.includes(vId) ? C.dan : C.suc, fontWeight: 600 }}>{v.status.expired?.includes(vId) ? "Expired" : "Valid"}</span>}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                    {renderCI(!!(clientFields.emergency_contact && clientFields.emergency_phone), false, "Emergency Contact", (clientFields.emergency_contact && clientFields.emergency_phone) ? clientFields.emergency_contact : "Not provided", "ec",
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ display: "block" }}>
                          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" }}>Emergency Contact Name</span>
                          <input type="text" value={ecDraftName} onChange={e => setEcDraftName(e.target.value)} onBlur={syncEcName} placeholder="Full name" style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: C.text, background: C.surface, outline: "none", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = C.pri} />
                        </label>
                        <label style={{ display: "block" }}>
                          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" }}>Emergency Phone</span>
                          <input type="tel" value={fmtPhoneInput(ecDraftPhone)} onChange={e => setEcDraftPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} onBlur={syncEcPhone} placeholder="(555) 123-4567" maxLength={14} style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: C.text, background: C.surface, outline: "none", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = C.pri} />
                        </label>
                      </div>
                    )}
                    {renderCI(allAgrSigned, false, "Agreements", reqAgrs.length > 0 ? `${reqAgrs.length} unsigned (new client)` : "None required", "agr",
                      <div style={{ fontSize: 12, color: C.textMut }}>
                        {reqAgrs.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {reqAgrs.map(agr => (
                              <div key={agr.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                                <span style={{ color: C.dan, fontSize: 12 }}>✗</span>
                                <span style={{ fontWeight: 600 }}>{agr.name}</span>
                                <span style={{ fontSize: 11, color: C.textMut }}>— Will need to sign after profile creation</span>
                              </div>
                            ))}
                          </div>
                        ) : "No agreements configured"}
                      </div>
                    )}
                    {renderCI(allAgeOk, ageResults.some(a => a.status.grandfathered), "Dog Age",
                      ageResults.every(a => !a.status.age || a.status.ok)
                        ? ageResults.map(a => a.status.age ? `${a.dog.fields.name || "Dog"}: ${a.status.age}yr` : null).filter(Boolean).join(", ") || "N/A"
                        : ageResults.filter(a => !a.status.ok).map(a => `${a.dog.fields.name || "Dog"}: ${a.status.age}yr — ${a.status.reason}`).join(", "),
                      "age",
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {ageResults.map((a, ai) => (
                          <div key={ai} style={{ fontSize: 12 }}>
                            <span style={{ fontWeight: 700, color: C.text }}>{a.dog.fields.name || `Dog ${ai + 1}`}</span>
                            {a.status.age ? (
                              <span style={{ color: a.status.ok ? C.suc : C.dan, marginLeft: 8 }}>
                                {a.status.age} years old
                                {!a.status.ok && !a.status.grandfathered && ` — ${a.status.reason}`}
                              </span>
                            ) : (
                              <span style={{ color: C.textMut, marginLeft: 8 }}>Age not set</span>
                            )}
                          </div>
                        ))}
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>Max age: {(data.resortPolicies || {}).maxDogAge || 13} years.</div>
                      </div>
                    )}
                    {renderCI(allSnOk, !allSnOk, "Spay/Neuter",
                      allSnOk ? snResults.map(s => `${s.dog.fields.name || "Dog"}: ${s.status.status === "Neutered" || s.status.status === "Spayed" ? s.status.status : (s.status.privatePlay ? "Intact (PP)" : s.status.status || "N/A")}`).join(", ") || "N/A"
                        : snResults.filter(s => !s.status.ok).map(s => `${s.dog.fields.name || "Dog"}: No group play`).join(", "),
                      "sn",
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {snResults.map((s, si) => (
                          <div key={si} style={{ fontSize: 12 }}>
                            <span style={{ fontWeight: 700, color: C.text }}>{s.dog.fields.name || `Dog ${si + 1}`}</span>
                            <span style={{ color: s.status.ok ? C.suc : C.acc, marginLeft: 8 }}>
                              {s.status.status === "Neutered" || s.status.status === "Spayed" ? s.status.status : `Intact${s.status.ageMonths != null ? ` (${s.status.ageMonths}mo)` : ""}`}
                              {s.status.privatePlay && " — Private Play"}
                              {!s.status.ok && " — Cannot participate in group play"}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                              <span style={{ fontSize: 10, color: C.textSec, fontWeight: 600, minWidth: 50 }}>Status</span>
                              <select value={s.dog.fields?.spayed_neutered || ""} style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontFamily: "inherit", outline: "none", cursor: "pointer" }}
                                onChange={e => { updateDogField(si, "spayed_neutered", e.target.value); }}>
                                <option value="">Unknown</option>
                                <option value="Neutered">Neutered</option>
                                <option value="Spayed">Spayed</option>
                                <option value="Intact">Intact</option>
                              </select>
                            </div>
                          </div>
                        ))}
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>Intact dogs 10+ months old cannot participate in group play but CAN be checked in.</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Daycare size is auto-derived from the dog's weight/override classification */}
            <div style={{ marginBottom: 16 }}><Inp label="General Notes" type="textarea" value={notes} onChange={setNotes} placeholder="Special instructions for this stay..." /></div>

            {/* Itemized Receipt */}
            {livePricing && livePricing.lineItems.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <ItemizedReceipt pricingResult={livePricing} />
              </div>
            )}

            {/* Closed date override banner */}
            {(() => {
              const cs = new Set((data.closedDates || []).map(cd => cd.date));
              const conflict = cs.has(checkIn) || (type==="boarding" && cs.has(checkOut));
              const canOverride = hasPermission(profile, data, "override_closed_dates");
              if (!conflict) return null;
              return (
                <div style={{marginBottom:16,padding:"12px 16px",borderRadius:10,background:closedDateOverride2?"rgba(22,163,74,0.08)":"rgba(220,38,38,0.06)",border:`1.5px solid ${closedDateOverride2?C.suc:C.dan}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,color:closedDateOverride2?C.suc:C.dan,fontWeight:600,flex:1}}>
                    {closedDateOverride2 ? "✓ Closed date override active" : canOverride ? "⚠ Dates conflict with a closed date. As a manager, you can override." : "⚠ Dates conflict with a closed date. Only a manager can override."}
                  </span>
                  {canOverride && !closedDateOverride2 && <Btn size="sm" style={{background:C.warn,color:"#fff",border:"none"}} onClick={()=>setClosedDateOverride2(true)}>Override Closed Date</Btn>}
                  {closedDateOverride2 && <Btn size="sm" variant="ghost" onClick={()=>setClosedDateOverride2(false)}>Remove Override</Btn>}
                </div>
              );
            })()}

            {/* Submit */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8 }}>
              <Btn variant="secondary" onClick={() => nav("dashboard")}>Cancel</Btn>
              <Btn variant="secondary" onClick={handleCreateClientOnly}>Create Profile & Skip Reservation</Btn>
              <Btn onClick={handleCreateAll}>Create Client, Dog{dogs.length > 1 ? "s" : ""} & Reservation</Btn>
            </div>
          </div>
        </>
      )}
      </>)}

      {/* Early Check-In Date Adjustment Modal (Item 24) */}
      {earlyCheckInModal && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={() => setEarlyCheckInModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{background:C.surface,borderRadius:12,border:`1.5px solid ${C.border}`,width:"90%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",padding:"32px"}}>
            <div style={{fontSize:20,fontWeight:800,color:C.text,marginBottom:16}}>Early Check-In</div>
            <div style={{fontSize:13,color:C.textSec,lineHeight:1.6,marginBottom:24}}>
              <p>This reservation is scheduled for <strong>{new Date(earlyCheckInModal.currentDate + "T00:00:00").toLocaleDateString('en-US', {weekday:'long',month:'short',day:'numeric'})}</strong>, but you're checking in today <strong>{new Date(earlyCheckInModal.today + "T00:00:00").toLocaleDateString('en-US', {weekday:'long',month:'short',day:'numeric'})}</strong>.</p>
              <p style={{marginTop:12}}>Would you like to adjust the check-in date to today?</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              <div style={{padding:12,background:C.bg,borderRadius:8}}>
                <div style={{fontSize:11,color:C.textMut,marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Current Date</div>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>{new Date(earlyCheckInModal.currentDate + "T00:00:00").toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}</div>
              </div>
              <div style={{padding:12,background:C.sucLt,borderRadius:8,border:`1.5px solid ${C.suc}`}}>
                <div style={{fontSize:11,color:C.textMut,marginBottom:4,textTransform:"uppercase",fontWeight:600}}>New Date</div>
                <div style={{fontSize:14,fontWeight:700,color:C.suc}}>{new Date(earlyCheckInModal.today + "T00:00:00").toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn variant="secondary" onClick={() => setEarlyCheckInModal(null)}>Cancel</Btn>
              <Btn variant="success" onClick={async () => {
                const res = data.reservations.find(r => r.id === earlyCheckInModal.rid);
                if (res) {
                  const dateChangeAudit = buildAuditEntry(earlyCheckInModal.rid, "Early Check-In Date Adjusted", [{field:"Check-In Date",oldVal:earlyCheckInModal.currentDate,newVal:earlyCheckInModal.today},{field:"Reason",oldVal:"",newVal:"Early check-in (dog arriving before scheduled date)"}], profile);
                  await save({...data, auditLog:[...(data.auditLog||[]),dateChangeAudit], reservations:data.reservations.map(r=>r.id===earlyCheckInModal.rid?{...r,checkIn:earlyCheckInModal.today,status:"checked-in"}:r)});
                }
                setEarlyCheckInModal(null);
              }}>Adjust Date & Check In</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { UnifiedNewPage };

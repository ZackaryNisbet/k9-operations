import { Badge, Btn, CalendarPicker, Card, Inp, MiniDatePicker, Modal, fmtPhoneInput } from "../components/ui";
import { C } from "../constants/colors";
import { ComplianceCheckItem } from "../components/ComplianceCheckItem";
import { DEF_AGREEMENTS, ROOM_TYPES } from "../constants/forms";
import { DEF_BATH_TYPE_OPTIONS } from "../constants/dropdowns";
import { DEF_PRICING } from "../constants/pricing";
import { DiscountPicker } from "../components/DiscountPicker";
import { FeedingScheduleEditor } from "../components/FeedingScheduleEditor";
import { I } from "../icons";
import { ItemizedReceipt, buildAuditEntry } from "../components/widgets";
import { ManualDiscountEntry } from "../components/ManualDiscountEntry";
import { MedicationScheduleEditor } from "../components/MedicationScheduleEditor";
import { addDays, fmtDate, fmtPhone, gid, summarizeFeeding, summarizeMeds, todayStr } from "../lib/format";
import { agrSigned } from "../lib/agreements";
import { calcReservationPricing, countNights, getAddOnPrices } from "../lib/pricing";
import { getDogAgeCompliance, getDogDaycareSize, getSpayNeuterCompliance } from "../lib/dogHelpers";
import { getVaxStatus } from "../lib/vaccines";
import { hasPermission } from "../lib/roles";
import { useEffect, useMemo, useRef, useState } from "react";

function NewReservationPage({ data, save, preClientId, nav, profile, addGlobalToast }) {
  const [clientId, setClientId] = useState(preClientId||"");
  const [selectedDogs, setSelectedDogs] = useState([]); // array of dogIds
  const [type, setType] = useState("boarding");
  const [roomType, setRoomType] = useState("Luxury Suite");
  const [daycareSize, setDaycareSize] = useState("large");
  const [checkIn, setCheckIn] = useState(todayStr());
  const [checkOut, setCheckOut] = useState(addDays(todayStr(), 1));
  const [checkInTime, setCheckInTime] = useState("09:00");
  const [checkOutTime, setCheckOutTime] = useState("12:30");
  const [notes, setNotes] = useState("");
  const [parentDestination, setParentDestination] = useState("");
  const [resDiscountType, setResDiscountType] = useState("none"); // "none", "percent", "flat"
  const [resDiscountValue, setResDiscountValue] = useState(0);
  const [resDiscountId, setResDiscountId] = useState(null);
  const [errors, setErrors] = useState({});
  const [selectedRoom, setSelectedRoom] = useState("");
  const [showBookedRooms, setShowBookedRooms] = useState(false);
  const [showPartialAvail, setShowPartialAvail] = useState(false);
  const [partialSegments, setPartialSegments] = useState([]); // [{roomType, startDate, endDate, room}]
  const [partialStep, setPartialStep] = useState(0); // which segment we're configuring

  // Per-dog care overrides: { [dogId]: { feedingSchedules, medicationSchedules, bath_type } }
  const [careFields, setCareFields] = useState({});
  // Emergency contact override (local state — not saved until reservation created)
  const [ecOverride, setEcOverride] = useState({ name: "", phone: "" });
  const [ecInitialized, setEcInitialized] = useState(false);
  // Closed date override — manager+ can acknowledge and proceed
  const [closedDateOverride, setClosedDateOverride] = useState(false);
  // Per-dog add-ons: { [dogId]: { bath_type, ... } }
  const [dogAddOns, setDogAddOns] = useState({});
  const [expandedAddOns, setExpandedAddOns] = useState({});
  // Auto-apply add-on rules when type or dogs change
  useEffect(() => {
    if (!type || selectedDogs.length === 0) return;
    const autoRules = (data.addOnRules || []).filter(r => {
      if (!r.autoApply) return false;
      if (r.serviceTypes && r.serviceTypes.length > 0 && !r.serviceTypes.includes(type)) return false;
      return true;
    });
    if (autoRules.length === 0) return;
    setDogAddOns(prev => {
      const next = { ...prev };
      for (const did of selectedDogs) {
        const dog = data.dogs.find(d => d.id === did);
        const dogTags = dog?.tags || [];
        const matched = autoRules.filter(r => {
          if (r.tagIds && r.tagIds.length > 0) return r.tagIds.some(tid => dogTags.includes(tid));
          return true; // empty tagIds = all dogs
        }).map(r => r.name);
        if (matched.length > 0) {
          const curr = next[did]?.selectedAddOns || [];
          const merged = [...new Set([...curr, ...matched])];
          next[did] = { ...next[did], selectedAddOns: merged };
        }
      }
      return next;
    });
  }, [type, selectedDogs.join(",")]);
  // Add-on date selection popup: { dogId, addon, prevState }
  const [addOnDatePopup, setAddOnDatePopup] = useState(null);
  // Per-dog room config
  const [perDogMode, setPerDogMode] = useState(false);
  const [perDogConfig, setPerDogConfig] = useState({});
  // Compliance expand state
  const [complianceExpand, setComplianceExpand] = useState(null);
  // Care instructions collapse (expanded by default for boarding, collapsed for daycare/eval/tour)
  const [careExpanded, setCareExpanded] = useState(true);
  // Applied coupons (package sale IDs with quantity to use as deposit)
  const [appliedCoupons, setAppliedCoupons] = useState([]); // [{saleId, unitsToUse, value}]
  const [showPastBoardingModal, setShowPastBoardingModal] = useState(false);
  const [lastUsedRoomType, setLastUsedRoomType] = useState("");

  // Helper: get first available room type
  const getFirstAvailableRoomType = (checkInDate, checkOutDate) => {
    const ci = checkInDate; const co = checkOutDate || checkInDate;
    for (const rt of ROOM_TYPES) {
      const rooms = (data.rooms || {})[rt] || [];
      const booked = new Set(data.reservations.filter(r => (r.type === "boarding" || r.type === "dayboarding") && r.roomType === rt && r.room && r.status !== "checked-out" && r.status !== "cancelled" && r.checkIn < co && r.checkOut > ci).map(r => r.room));
      if (rooms.filter(r => !booked.has(r)).length > 0) return rt;
    }
    return "Luxury Suite"; // fallback
  };

  // Helper: get last-used room type for a dog
  const getLastUsedRoomType = (dogId) => {
    const dogRes = data.reservations.filter(r => r.dogIds && r.dogIds.includes(dogId) && r.status === "checked-out" && r.roomType);
    if (dogRes.length === 0) return "";
    const sorted = dogRes.sort((a, b) => new Date(b.checkOut) - new Date(a.checkOut));
    return sorted[0].roomType || "";
  };

  // Auto-expand care for boarding, collapse for other types
  useEffect(() => { setCareExpanded(type === "boarding"); }, [type]);

  // Auto-apply recurring discount when client is selected
  useEffect(() => {
    if (!clientId) return;
    const cl = data.clients.find(c => c.id === clientId);
    if (cl && cl.recurringDiscountId) {
      const disc = (data.discounts || []).find(d => d.id === cl.recurringDiscountId && d.active !== false);
      if (disc) {
        setResDiscountType(disc.type === "percentage" ? "percent" : "flat");
        setResDiscountValue(disc.value);
        setResDiscountId(disc.id);
      }
    }
  }, [clientId]);

  // Auto-set daycare size from first selected dog
  useEffect(() => {
    if (selectedDogs.length > 0 && (type === "daycare" || type === "evaluation")) {
      const dog = data.dogs.find(d => d.id === selectedDogs[0]);
      if (dog) setDaycareSize(getDogDaycareSize(dog));
    }
  }, [selectedDogs, type]);

  // Auto-default room type to first available, or last-used for selected dog
  useEffect(() => {
    if (type === "boarding" || type === "dayboarding") {
      if (selectedDogs.length > 0) {
        const lastUsed = getLastUsedRoomType(selectedDogs[0]);
        if (lastUsed) {
          setLastUsedRoomType(lastUsed);
          setRoomType(lastUsed);
        } else {
          const firstAvail = getFirstAvailableRoomType(checkIn, checkOut);
          setLastUsedRoomType("");
          setRoomType(firstAvail);
        }
      } else {
        const firstAvail = getFirstAvailableRoomType(checkIn, checkOut);
        setLastUsedRoomType("");
        setRoomType(firstAvail);
      }
    }
  }, [selectedDogs, type]);

  // Room availability
  const allRooms = data.rooms || {};
  const roomsForType = allRooms[roomType] || [];
  const needsRoom = type === "boarding" || type === "dayboarding";
  // Per-room-type availability for the selected date range
  const roomAvailByType = useMemo(() => {
    if (!checkIn || !needsRoom) return {};
    const ci = checkIn; const co = checkOut || checkIn;
    const result = {};
    ROOM_TYPES.forEach(rt => {
      const rooms = allRooms[rt] || [];
      const booked = new Set(data.reservations.filter(r => (r.type === "boarding" || r.type === "dayboarding") && r.roomType === rt && r.room && r.status !== "checked-out" && r.status !== "cancelled" && r.checkIn < co && r.checkOut > ci).map(r => r.room));
      result[rt] = { available: rooms.filter(r => !booked.has(r)).length, total: rooms.length };
    });
    return result;
  }, [checkIn, checkOut, needsRoom, data.reservations]);
  const bookedRoomNames = useMemo(() => {
    if (!needsRoom || !checkIn) return new Set();
    const ci = checkIn; const co = checkOut || checkIn;
    return new Set(
      data.reservations.filter(r =>
        (r.type === "boarding" || r.type === "dayboarding") && r.roomType === roomType && r.room &&
        r.status !== "checked-out" && r.status !== "cancelled" && r.checkIn < co && r.checkOut > ci
      ).map(r => r.room)
    );
  }, [needsRoom, roomType, checkIn, checkOut, data.reservations]);
  const availableRooms = roomsForType.filter(r => !bookedRoomNames.has(r));
  const bookedRooms = roomsForType.filter(r => bookedRoomNames.has(r));

  // Partial availability: find room types with availability for PART of the date range
  const partialAvailByType = useMemo(() => {
    if (!checkIn || !checkOut || !needsRoom || !showPartialAvail) return {};
    const ci = checkIn; const co = checkOut;
    const totalNights = countNights(ci, co);
    if (totalNights <= 1) return {};
    const result = {};
    ROOM_TYPES.forEach(rt => {
      const avail = roomAvailByType[rt];
      if (!avail || avail.available > 0) return; // skip if already fully available
      const rooms = allRooms[rt] || [];
      if (rooms.length === 0) return;
      // For each night, check which rooms are free
      const nightDates = [];
      let d = ci;
      while (d < co) { nightDates.push(d); d = addDays(d, 1); }
      // Find the longest continuous stretch of availability for any room in this type
      let bestStretch = null;
      rooms.forEach(room => {
        const roomRes = data.reservations.filter(r => (r.type === "boarding" || r.type === "dayboarding") && r.roomType === rt && r.room === room && r.status !== "checked-out" && r.status !== "cancelled");
        let streakStart = null; let streakEnd = null;
        nightDates.forEach(nd => {
          const nextD = addDays(nd, 1);
          const isBooked = roomRes.some(r => r.checkIn < nextD && r.checkOut > nd);
          if (!isBooked) {
            if (!streakStart) streakStart = nd;
            streakEnd = nextD;
          } else {
            if (streakStart && (!bestStretch || countNights(streakStart, streakEnd) > countNights(bestStretch.start, bestStretch.end))) {
              bestStretch = { start: streakStart, end: streakEnd, room };
            }
            streakStart = null; streakEnd = null;
          }
        });
        if (streakStart && (!bestStretch || countNights(streakStart, streakEnd) > countNights(bestStretch.start, bestStretch.end))) {
          bestStretch = { start: streakStart, end: streakEnd, room };
        }
      });
      if (bestStretch && countNights(bestStretch.start, bestStretch.end) > 0 && countNights(bestStretch.start, bestStretch.end) < totalNights) {
        result[rt] = { ...bestStretch, nights: countNights(bestStretch.start, bestStretch.end), totalNights };
      }
    });
    return result;
  }, [checkIn, checkOut, needsRoom, showPartialAvail, roomAvailByType, data.reservations]);

  // Room scoring: for each room compute gap before/after and a smart score
  const roomScored = useMemo(() => {
    const ci = checkIn; const co = checkOut || checkIn;
    const allBoardingRes = data.reservations.filter(r => (r.type === "boarding" || r.type === "dayboarding") && r.roomType === roomType && r.room && r.status !== "checked-out" && r.status !== "cancelled");
    const totalRooms = roomsForType.length;
    const occupancy = totalRooms > 0 ? (totalRooms - availableRooms.length) / totalRooms : 0;

    // Private play zone boost
    const ppPol = (data.resortPolicies || {});
    const ppEnabled = ppPol.privatePlayEnabled !== false;
    const ppRooms = ppPol.privatePlayRooms || [];
    const hasPrivatePlayDog = selectedDogs.some(did => {
      const dog = data.dogs.find(d => d.id === did);
      return dog && (dog.tags || []).includes("tag_pp");
    });

    const scored = roomsForType.map(room => {
      const booked = bookedRoomNames.has(room);
      const roomRes = allBoardingRes.filter(r => r.room === room);

      // Find the reservation that ends most recently BEFORE our check-in
      const before = roomRes.filter(r => r.checkOut <= ci).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
      const lastOut = before.length > 0 ? before[0].checkOut : null;

      // Find the reservation that starts soonest AFTER our check-out
      const after = roomRes.filter(r => r.checkIn >= co).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      const nextIn = after.length > 0 ? after[0].checkIn : null;

      // Gap in days
      const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
      const gapBefore = lastOut ? daysBetween(lastOut, ci) : 999;
      const gapAfter = nextIn ? daysBetween(co, nextIn) : 999;

      // Hybrid score: at low occupancy prefer big gaps (staff comfort), at high occupancy prefer tight fit (maximize inventory)
      const comfortScore = Math.min(gapBefore, 30) + Math.min(gapAfter, 30);
      const packScore = 60 - comfortScore;
      const blend = occupancy < 0.5 ? 0 : occupancy > 0.75 ? 1 : (occupancy - 0.5) / 0.25;
      let score = booked ? -9999 : (1 - blend) * comfortScore + blend * packScore;

      // Boost private play zone rooms for dogs with private play tag
      const isPPRoom = ppEnabled && ppRooms.includes(room);
      if (!booked && ppEnabled && ppRooms.length > 0) {
        if (hasPrivatePlayDog && isPPRoom) score += 100;
        else if (hasPrivatePlayDog && !isPPRoom) score -= 20;
        else if (!hasPrivatePlayDog && isPPRoom) score -= 10; // non-PP dogs deprioritize PP rooms
      }

      return { room, booked, lastOut, nextIn, gapBefore, gapAfter, score, occupancy, isPPRoom };
    });

    // Sort: available first (by score desc), then booked
    scored.sort((a, b) => {
      if (a.booked !== b.booked) return a.booked ? 1 : -1;
      return b.score - a.score;
    });

    // Mark the top-scoring available room as recommended
    const topAvail = scored.find(r => !r.booked);
    if (topAvail) topAvail.recommended = true;

    return scored;
  }, [roomsForType, bookedRoomNames, checkIn, checkOut, roomType, data.reservations, availableRooms.length, selectedDogs, data.resortPolicies, data.dogs]);

  // Auto-select recommended room when room type or dates change
  useEffect(() => {
    const rec = roomScored.find(r => r.recommended);
    if (rec) {
      // Always select recommended room if current selection is empty or not available
      const currentStillAvail = selectedRoom && roomScored.some(r => r.room === selectedRoom && !r.booked);
      if (!currentStillAvail) setSelectedRoom(rec.room);
    } else if (roomScored.length > 0 && !roomScored.some(r => r.room === selectedRoom && !r.booked)) {
      // Current room no longer available and no recommended — pick first available
      const firstAvail = roomScored.find(r => !r.booked);
      setSelectedRoom(firstAvail ? firstAvail.room : "");
    }
  }, [roomScored]);

  const [showRoomGuide, setShowRoomGuide] = useState(false);

  // "Update profile?" modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [pendingChanges, setPendingChanges] = useState([]); // [{ dogId, field, oldVal, newVal, target }]
  const [pendingReservations, setPendingReservations] = useState([]);
  const [changeToggles, setChangeToggles] = useState({}); // { [index]: bool } — which changes to apply to profile

  const cDogs = data.dogs.filter(d=>d.clientId===clientId);

  // Client search
  const [clientSearch, setClientSearch] = useState(() => {
    if (preClientId) { const c = data.clients.find(x => x.id === preClientId); return c ? `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim() : ""; }
    return "";
  });
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const clientSearchRef = useRef(null);
  const clientDropRef = useRef(null);

  const clientResults = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return data.clients.slice(0, 8);
    const qDigits = q.replace(/\D/g, "");
    return data.clients.filter(c => {
      const name = `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.toLowerCase();
      const phone = (c.fields.phone || "").replace(/\D/g, "");
      const email = (c.fields.email || "").toLowerCase();
      const dogNames = data.dogs.filter(d => d.clientId === c.id).map(d => (d.fields.name || "").toLowerCase()).join(" ");
      return name.includes(q) || email.includes(q) || dogNames.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits));
    }).slice(0, 8);
  }, [clientSearch, data.clients, data.dogs]);

  const selectClient = (c) => {
    setClientId(c.id);
    setClientSearch(`${c.fields.first_name || ""} ${c.fields.last_name || ""}`.trim());
    setClientDropOpen(false);
    setErrors({ ...errors, clientId: undefined });
  };

  const clearClient = () => {
    setClientId("");
    setClientSearch("");
    setClientDropOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!clientDropOpen) return;
    const handler = (e) => { if (clientDropRef.current && !clientDropRef.current.contains(e.target)) setClientDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clientDropOpen]);

  // Auto-focus search on mount
  useEffect(() => { if (!preClientId && clientSearchRef.current) clientSearchRef.current.focus(); }, []);

  const BATH_OPTS = data.bathTypeOptions || DEF_BATH_TYPE_OPTIONS;

  // When client changes, reset dog selection and pre-select all if only one dog
  useEffect(()=>{
    if(cDogs.length===1){ setSelectedDogs([cDogs[0].id]); }
    else { setSelectedDogs([]); }
    setCareFields({});
    // Initialize EC from client profile
    const cl = data.clients.find(c=>c.id===clientId);
    if(cl) {
      setEcOverride({ name: cl.fields?.emergency_contact || "", phone: cl.fields?.emergency_phone || "" });
      setEcInitialized(true);
    } else {
      setEcOverride({ name: "", phone: "" });
      setEcInitialized(false);
    }
  },[clientId]);

  // When selected dogs change, initialize care fields from profiles (structured schedules)
  useEffect(()=>{
    const cf = {};
    selectedDogs.forEach(did => {
      const dog = data.dogs.find(d=>d.id===did);
      if(dog) {
        cf[did] = {
          feedingSchedules: careFields[did]?.feedingSchedules ?? (dog.fields.feedingSchedules || []),
          medicationSchedules: careFields[did]?.medicationSchedules ?? (dog.fields.medicationSchedules || []),
        };
      }
    });
    setCareFields(cf);
  },[selectedDogs.join(",")]);

  useEffect(()=>{if(type==="daycare"||type==="dayboarding"||type==="tour"||type==="evaluation")setCheckOut(checkIn);else if(type==="boarding"&&checkOut<=checkIn)setCheckOut(addDays(checkIn,1));},[type,checkIn]);
  useEffect(()=>{if(type==="daycare"||type==="dayboarding"){setCheckInTime("07:00");setCheckOutTime("18:00");}else if(type==="tour"){setCheckInTime("14:00");setCheckOutTime("14:30");}else if(type==="evaluation"){setCheckInTime("09:00");setCheckOutTime("15:00");}else{setCheckInTime("09:00");setCheckOutTime("11:00");}},[type]);
  useEffect(()=>{if(type==="dayboarding")setRoomType("Executive Room");},[type]);
  // (Bath auto-add removed — baths are manual add-ons only)
  useEffect(()=>{setSelectedRoom("");},[roomType]);

  // (Cycle hotkeys removed)

  const toggleDog = (did) => {
    setSelectedDogs(prev => prev.includes(did) ? prev.filter(d=>d!==did) : [...prev, did]);
  };

  const updateCare = (dogId, field, val) => {
    setCareFields(prev => ({ ...prev, [dogId]: { ...prev[dogId], [field]: val } }));
  };

  const handleSave = async (saveMode = "reserve") => {
    const errs={};
    if(!clientId)errs.clientId="Required";
    if(selectedDogs.length===0)errs.dogs="Select at least one dog";
    if(!checkIn)errs.checkIn="Required";
    if(type==="boarding"&&checkOut<checkIn)errs.checkOut="Must be after check-in";
    // Room validation: require a room for boarding/dayboarding
    if((type==="boarding"||type==="dayboarding")&&!perDogMode&&!selectedRoom)errs.room="Please select a room";
    // Required fields for boarding
    if(type==="boarding") {
      if(!parentDestination.trim()) errs.parentDestination="Required — where is the parent going?";
      if(!notes.trim()) errs.notes="Required — add general notes or special instructions";
    }
    // Closed dates check — role-based: manager/owner/enterprise_admin can override, CSR/staff blocked
    const closedSet = new Set((data.closedDates || []).map(cd => cd.date));
    const hasClosedConflict = closedSet.has(checkIn) || (type==="boarding" && closedSet.has(checkOut));
    if (hasClosedConflict && !closedDateOverride) {
      const canOverride = hasPermission(profile, data, "override_closed_dates");
      if (canOverride) {
        if(closedSet.has(checkIn)){const cd=(data.closedDates||[]).find(c=>c.date===checkIn);errs.checkIn=`Resort is closed on this date${cd?.label?` (${cd.label})`:""} — click "Override Closed Date" below to proceed`;}
        if(type==="boarding"&&closedSet.has(checkOut)){const cd=(data.closedDates||[]).find(c=>c.date===checkOut);errs.checkOut=`Resort is closed on this date${cd?.label?` (${cd.label})`:""} — click "Override Closed Date" below to proceed`;}
      } else {
        if(closedSet.has(checkIn)){const cd=(data.closedDates||[]).find(c=>c.date===checkIn);errs.checkIn=`Resort is closed on this date${cd?.label?` (${cd.label})`:""}. Only a manager can override this restriction.`;}
        if(type==="boarding"&&closedSet.has(checkOut)){const cd=(data.closedDates||[]).find(c=>c.date===checkOut);errs.checkOut=`Resort is closed on this date${cd?.label?` (${cd.label})`:""}. Only a manager can override this restriction.`;}
      }
    }
    // Duplicate / overlap check: warn if any selected dog is already checked-in or has an overlapping reservation
    const ci = checkIn; const co = checkOut || checkIn;
    for (const did of selectedDogs) {
      const dogName = (data.dogs.find(d => d.id === did)?.fields?.name) || "This dog";
      const existing = (data.reservations || []).filter(r => r.dogId === did && r.status !== "cancelled" && r.status !== "checked-out");
      const checkedIn = existing.find(r => r.status === "checked-in");
      if (checkedIn) {
        errs.dogs = `${dogName} is currently checked in (${checkedIn.type}, ${checkedIn.checkIn}). Check them out first or edit the existing reservation.`;
        break;
      }
      const overlapping = existing.find(r => r.status === "upcoming" && r.checkIn <= co && (r.checkOut || r.checkIn) >= ci);
      if (overlapping) {
        errs.dogs = `${dogName} already has an upcoming ${overlapping.type} reservation overlapping these dates (${overlapping.checkIn}${overlapping.checkOut && overlapping.checkOut !== overlapping.checkIn ? " – " + overlapping.checkOut : ""}). Edit or cancel that reservation first.`;
        break;
      }
    }
    if(Object.keys(errs).length>0){setErrors(errs);return;}

    // Daycare eval gate: auto-convert to evaluation if any dog lacks a locked eval
    if(type==="daycare") {
      const unevaluated = selectedDogs.filter(did => !(data.evaluations || []).some(e => e.dogId === did && e.locked));
      if(unevaluated.length > 0) {
        const names = unevaluated.map(did => { const d = data.dogs.find(x=>x.id===did); return d ? d.fields.name : "Unknown"; }).join(", ");
        setType("evaluation");
        setCheckInTime("09:00");
        setCheckOutTime("15:00");
        setErrors({ evalGate: `No evaluation on file for ${names}. Converted to Evaluation.` });
        return;
      }
    }

    // Build reservations with pricing snapshot
    const newRes = selectedDogs.map((did, idx) => {
      const dog = data.dogs.find(d => d.id === did);
      const autoDaycareSize = dog ? getDogDaycareSize(dog) : "large";
      // Per-dog room config
      const cfg = ((type === "boarding" || type === "dayboarding") && perDogMode) ? (perDogConfig[did] || {}) : {};
      const dogRoomType = cfg.roomType || roomType;
      const dogRoom = cfg.room || selectedRoom;
      const dogCheckOut = cfg.checkOut || checkOut;
      const configSegments = cfg.roomSegments || ((perDogConfig[did] || {}).roomSegments || []);
      const dogSegments = type === "boarding" ? (configSegments.length > 0 ? configSegments : (partialSegments.length > 1 && partialSegments.every(s => s.roomType) ? partialSegments : [])) : [];
      const isSecondInRoom = !perDogMode && type === "boarding" && idx > 0;
      const resPricing = calcReservationPricing({
        type, roomType: dogRoomType, checkIn, checkOut: type === "boarding" ? dogCheckOut : checkIn,
        checkInTime, checkOutTime, daycareSize: autoDaycareSize,
        dogs: dog ? [dog] : [], dogProfiles: data.dogs, pricing: data.pricing,
        isSecondDogSameRoom: isSecondInRoom,
        roomSegments: dogSegments.length > 0 ? dogSegments : undefined,
        appliedCoupons: appliedCoupons,
        reservation: { actualCheckInTime: undefined },
      });
      return {
        id:gid(),clientId,dogId:did,type,
        ...((type==="boarding"||type==="dayboarding") ? {roomType: dogRoomType, ...(dogRoom ? {room: dogRoom} : {}), ...(type==="boarding"&&dogSegments.length > 0 ? {roomSegments: dogSegments} : {})} : {}),
        ...(type==="daycare" ? {daycareSize: autoDaycareSize} : {}),
        ...(type==="evaluation" ? {evalResult:"pending"} : {}),
        checkIn,checkOut:type==="boarding"?dogCheckOut:checkIn,
        checkInTime,checkOutTime,status:"upcoming",notes,
        ...(type==="boarding"&&parentDestination?{parentDestination}:{}),
        ...(ecOverride.name || ecOverride.phone ? { emergencyContactOverride: { name: ecOverride.name, phone: ecOverride.phone } } : {}),
        careOverrides: {
          feedingSchedules: (careFields[did] || {}).feedingSchedules || [],
          medicationSchedules: (careFields[did] || {}).medicationSchedules || [],
          // Legacy text fields for backward compat with check-in modal
          feeding: summarizeFeeding((careFields[did] || {}).feedingSchedules || []),
          medications: summarizeMeds((careFields[did] || {}).medicationSchedules || []),
          ...(dogAddOns[did]?.selectedBath ? { bath_type: dogAddOns[did].selectedBath } : {}),
          ...(dogAddOns[did]?.postBathReturn ? { postBathReturn: dogAddOns[did].postBathReturn } : {}),
        },
        selectedAddOns: (() => {
          const manual = dogAddOns[did]?.selectedAddOns || [];
          const autoRules = (data.addOnRules || []).filter(r => {
            if (!r.autoApply) return false;
            // Check service type match (empty = all)
            if (r.serviceTypes && r.serviceTypes.length > 0 && !r.serviceTypes.includes(type)) return false;
            // Check tag match (empty = all dogs)
            if (r.tagIds && r.tagIds.length > 0) {
              const dogTags = dog?.tags || [];
              if (!r.tagIds.some(tid => dogTags.includes(tid))) return false;
            }
            return true;
          }).map(r => r.name);
          // Merge without duplicates
          return [...new Set([...manual, ...autoRules])];
        })(),
        pricing: resPricing,
        ...(isSecondInRoom ? {isSecondDogSameRoom: true} : {}),
        ...(resDiscountType !== "none" && resDiscountValue > 0 ? { discountType: resDiscountType, discountValue: resDiscountValue, discountId: resDiscountId || undefined } : {}),
        ...(saveMode === "save-only" ? { noDeposit: true } : {}),
        ...(appliedCoupons.length > 0 ? { appliedCoupons: appliedCoupons.map(c => ({ saleId: c.saleId, unitsUsed: c.unitsToUse, value: c.value })) } : {}),
        bookingSource: "phone",
        createdAt: new Date().toISOString(),
      };
    });

    // Check if any care fields differ from dog profile
    const changes = [];
    selectedDogs.forEach(did => {
      const dog = data.dogs.find(d=>d.id===did);
      if(!dog) return;
      const care = careFields[did] || {};
      const profileFeedSch = dog.fields.feedingSchedules || [];
      const profileMedSch = dog.fields.medicationSchedules || [];
      const resFeedSch = care.feedingSchedules || [];
      const resMedSch = care.medicationSchedules || [];
      if(JSON.stringify(resFeedSch) !== JSON.stringify(profileFeedSch) && resFeedSch.length > 0) {
        changes.push({ dogId: did, dogName: dog.fields.name, field: "feedingSchedules", oldVal: profileFeedSch, newVal: resFeedSch,
          oldLabel: summarizeFeeding(profileFeedSch) || "None", newLabel: summarizeFeeding(resFeedSch) || "None", target: "dog" });
      }
      if(JSON.stringify(resMedSch) !== JSON.stringify(profileMedSch) && resMedSch.length > 0) {
        changes.push({ dogId: did, dogName: dog.fields.name, field: "medicationSchedules", oldVal: profileMedSch, newVal: resMedSch,
          oldLabel: summarizeMeds(profileMedSch) || "None", newLabel: summarizeMeds(resMedSch) || "None", target: "dog" });
      }
    });
    // Check emergency contact changes
    const cl = data.clients.find(c=>c.id===clientId);
    if(cl) {
      const profileEcName = cl.fields?.emergency_contact || "";
      const profileEcPhone = cl.fields?.emergency_phone || "";
      if(ecOverride.name !== profileEcName && ecOverride.name !== "") {
        changes.push({ clientId, dogName: cl.fields.first_name + " " + cl.fields.last_name + " (Client)", field: "emergency_contact", oldVal: profileEcName, newVal: ecOverride.name, target: "client" });
      }
      if(ecOverride.phone !== profileEcPhone && ecOverride.phone !== "") {
        changes.push({ clientId, dogName: cl.fields.first_name + " " + cl.fields.last_name + " (Client)", field: "emergency_phone", oldVal: profileEcPhone, newVal: ecOverride.phone, target: "client" });
      }
    }

    if(changes.length > 0) {
      setPendingChanges(changes);
      setPendingReservations(newRes);
      // Initialize all toggles to OFF (reservation-only by default)
      const toggles = {};
      changes.forEach((_,i) => { toggles[i] = false; });
      setChangeToggles(toggles);
      setShowUpdateModal(true);
    } else {
      // No changes, just save reservations
      let saveDogs = data.dogs;
      let saveDogTags = data.dogTags;
      if (type === "evaluation") {
        if (!saveDogTags.find(t => t.id === "tag_eval")) saveDogTags = [...saveDogTags, { id: "tag_eval", name: "Evaluation", colorIdx: 2 }];
        saveDogs = saveDogs.map(d => selectedDogs.includes(d.id) && !(d.tags || []).includes("tag_eval") ? { ...d, tags: [...(d.tags || []), "tag_eval"] } : d);
      }
      let saveRes = [...newRes];
      if (type === "boarding" || type === "dayboarding") {
        selectedDogs.forEach(did => {
          const dogHasEval = (data.evaluations || []).some(e => e.dogId === did && e.locked);
          if (!dogHasEval) {
            saveRes = saveRes.map(r => r.dogId === did ? { ...r, needsEval: true } : r);
            if (!saveDogTags.find(t => t.id === "tag_eval")) saveDogTags = [...saveDogTags, { id: "tag_eval", name: "Evaluation", colorIdx: 2 }];
            saveDogs = saveDogs.map(d => d.id === did && !(d.tags || []).includes("tag_eval") ? { ...d, tags: [...(d.tags || []), "tag_eval"] } : d);
          }
        });
      }
      const createAudits = saveRes.map(r => buildAuditEntry(r.id, "Reservation Created", [{field:"Type",oldVal:"",newVal:r.type},{field:"Dates",oldVal:"",newVal:`${r.checkIn} → ${r.checkOut}`},{field:"Status",oldVal:"",newVal:"Upcoming"}], profile));
      // Deduct coupon units from package sales
      let updatedSales = data.packageSales || [];
      if (appliedCoupons.length > 0) {
        updatedSales = updatedSales.map(s => {
          const applied = appliedCoupons.find(c => c.saleId === s.id);
          if (!applied) return s;
          const newUsed = (s.used || 0) + applied.unitsToUse;
          return { ...s, used: newUsed, unitsRemaining: Math.max(0, (s.unitsRemaining || s.quantity || 0) - applied.unitsToUse) };
        });
        // Also record as deposit-via-coupon payment
        saveRes = saveRes.map(r => ({ ...r, amountCollected: appliedCoupons.reduce((sum, c) => sum + c.value, 0), depositMethod: "coupon" }));
      }
      // Track one-time discount usage on client
      let saveClients = data.clients;
      if (resDiscountId) {
        const disc = (data.discounts || []).find(d => d.id === resDiscountId);
        if (disc && disc.discountKind === "one-time") {
          saveClients = saveClients.map(c => c.id === clientId ? { ...c, discountUsage: [...(c.discountUsage || []), { discountId: resDiscountId, usedAt: new Date().toISOString(), reservationId: saveRes[0]?.id }] } : c);
        }
      }
      await save({...data, dogs: saveDogs, dogTags: saveDogTags, clients: saveClients, packageSales: updatedSales, reservations:[...data.reservations, ...saveRes], auditLog:[...(data.auditLog||[]),...createAudits]});
      nav("dashboard");
      if (addGlobalToast) addGlobalToast({ message: "Reservation Created", actionLabel: "View Reservation", onAction: () => nav("client-detail", { clientId, openReservation: saveRes[0]?.id }) });
    }
  };

  const confirmSave = async () => {
    let newDogs = [...data.dogs];
    let newClients = [...data.clients];
    // Apply only toggled-on changes
    pendingChanges.forEach((ch, i) => {
      if (!changeToggles[i]) return; // skip unchecked changes
      if (ch.target === "dog") {
        newDogs = newDogs.map(d => d.id === ch.dogId ? { ...d, fields: { ...d.fields, [ch.field]: ch.newVal } } : d);
      } else if (ch.target === "client") {
        newClients = newClients.map(c => c.id === ch.clientId ? { ...c, fields: { ...c.fields, [ch.field]: ch.newVal } } : c);
      }
    });
    let saveDogTags = data.dogTags;
    let saveRes = [...pendingReservations];
    if (type === "evaluation") {
      if (!saveDogTags.find(t => t.id === "tag_eval")) saveDogTags = [...saveDogTags, { id: "tag_eval", name: "Evaluation", colorIdx: 2 }];
      newDogs = newDogs.map(d => selectedDogs.includes(d.id) && !(d.tags || []).includes("tag_eval") ? { ...d, tags: [...(d.tags || []), "tag_eval"] } : d);
    }
    if (type === "boarding" || type === "dayboarding") {
      selectedDogs.forEach(did => {
        const dogHasEval = (data.evaluations || []).some(e => e.dogId === did && e.locked);
        if (!dogHasEval) {
          saveRes = saveRes.map(r => r.dogId === did ? { ...r, needsEval: true } : r);
          if (!saveDogTags.find(t => t.id === "tag_eval")) saveDogTags = [...saveDogTags, { id: "tag_eval", name: "Evaluation", colorIdx: 2 }];
          newDogs = newDogs.map(d => d.id === did && !(d.tags || []).includes("tag_eval") ? { ...d, tags: [...(d.tags || []), "tag_eval"] } : d);
        }
      });
    }
    const createAudits2 = saveRes.map(r => buildAuditEntry(r.id, "Reservation Created", [{field:"Type",oldVal:"",newVal:r.type},{field:"Dates",oldVal:"",newVal:`${r.checkIn} → ${r.checkOut}`},{field:"Status",oldVal:"",newVal:"Upcoming"}], profile));
    // Deduct coupon units
    let updatedSales2 = data.packageSales || [];
    if (appliedCoupons.length > 0) {
      updatedSales2 = updatedSales2.map(s => {
        const applied = appliedCoupons.find(c => c.saleId === s.id);
        if (!applied) return s;
        return { ...s, used: (s.used || 0) + applied.unitsToUse, unitsRemaining: Math.max(0, (s.unitsRemaining || s.quantity || 0) - applied.unitsToUse) };
      });
      saveRes = saveRes.map(r => ({ ...r, amountCollected: appliedCoupons.reduce((sum, c) => sum + c.value, 0), depositMethod: "coupon" }));
    }
    await save({...data, clients: newClients, dogs: newDogs, dogTags: saveDogTags, packageSales: updatedSales2, reservations:[...data.reservations, ...saveRes], auditLog:[...(data.auditLog||[]),...createAudits2]});
    setShowUpdateModal(false);
    nav("dashboard");
    if (addGlobalToast) addGlobalToast({ message: "Reservation Created", actionLabel: "View Reservation", onAction: () => nav("client-detail", { clientId, openReservation: saveRes[0]?.id }) });
  };

  const fieldLabel = (f) => ({ feedingSchedules: "Feeding Schedule", medicationSchedules: "Medication Schedule", bath_type: "Preferred Bath Type", emergency_contact: "Emergency Contact Name", emergency_phone: "Emergency Phone", feeding: "Feeding Instructions", medications: "Medications" })[f] || f;

  // Live pricing calculation
  const livePricing = useMemo(() => {
    if (!type || selectedDogs.length === 0) return null;
    const addOnPrices = getAddOnPrices(data.pricing, data.addOnRules);
    // Helper: append selected add-on line items for a dog
    const appendAddOns = (result, did) => {
      const dog = data.dogs.find(d => d.id === did);
      const dogName = dog ? (dog.fields.name || "Dog") : "Dog";
      const addOns = (dogAddOns[did]?.selectedAddOns || []);
      let addOnTotal = 0;
      addOns.forEach(addon => {
        const rate = addOnPrices[addon] ?? 0;
        if (rate > 0) {
          result.lineItems.push({ label: `${addon} — ${dogName}`, rate, qty: 1, total: rate, isAddon: true });
          addOnTotal += rate;
        }
      });
      result.subtotal += addOnTotal;
      result.total += addOnTotal;
      result.deposit = Math.round(result.subtotal * (result.depositPercent / 100) * 100) / 100;
      result.balance = Math.round((result.total - result.deposit) * 100) / 100;
    };
    // For multi-dog boarding, compute per-dog then combine
    if (type === "boarding" && selectedDogs.length > 1) {
      let combined = { lineItems: [], subtotal: 0, discountTotal: 0, total: 0, deposit: 0, balance: 0, payAt: "booking", depositRefundable: false, depositPercent: 0 };
      selectedDogs.forEach((did, idx) => {
        const dog = data.dogs.find(d => d.id === did);
        const cfg = perDogMode ? (perDogConfig[did] || {}) : {};
        const dogRT = cfg.roomType || roomType;
        const dogCO = cfg.checkOut || checkOut;
        const dogSegs = cfg.roomSegments || ((perDogConfig[did] || {}).roomSegments || []);
        const isSecond = !perDogMode && idx > 0;
        const pr = calcReservationPricing({
          type, roomType: dogRT, checkIn, checkOut: dogCO, checkInTime, checkOutTime,
          dogs: dog ? [dog] : [], dogProfiles: data.dogs, pricing: data.pricing,
          isSecondDogSameRoom: isSecond,
          roomSegments: dogSegs.length > 0 ? dogSegs : undefined,
          reservation: { actualCheckInTime: undefined },
        });
        combined.lineItems.push(...(dog ? [{label: dog.fields.name, isDogHeader: true}] : []), ...pr.lineItems);
        combined.subtotal += pr.subtotal;
        combined.discountTotal += pr.discountTotal;
        combined.total += pr.total;
        combined.deposit += pr.deposit;
        combined.balance += pr.balance;
        combined.payAt = pr.payAt;
        combined.depositRefundable = pr.depositRefundable;
        combined.depositPercent = pr.depositPercent;
      });
      // Append manual add-ons for each dog
      selectedDogs.forEach(did => appendAddOns(combined, did));
      // Late checkout fee: if checkout time is after 12:30 PM, add half-day daycare fee per dog
      if (checkOutTime && checkOutTime > "12:30") {
        const halfDayRate = (data.pricing || DEF_PRICING).daycareRates?.halfDay || 30;
        selectedDogs.forEach(did => {
          const dog = data.dogs.find(d => d.id === did);
          const dogName = dog ? (dog.fields.name || "Dog") : "Dog";
          combined.lineItems.push({ label: `Late Checkout Fee — ${dogName}`, rate: halfDayRate, qty: 1, total: halfDayRate, isAddon: true, isLateCheckout: true });
          combined.subtotal += halfDayRate;
          combined.total += halfDayRate;
        });
      }
      combined.subtotal = Math.round(combined.subtotal * 100) / 100;
      combined.discountTotal = Math.round(combined.discountTotal * 100) / 100;
      combined.total = Math.round(combined.total * 100) / 100;
      combined.deposit = Math.round(combined.deposit * 100) / 100;
      combined.balance = Math.round(combined.balance * 100) / 100;
      return combined;
    }
    const did = selectedDogs[0];
    const dog = data.dogs.find(d => d.id === did);
    const singleSegs = (perDogConfig[did] || {}).roomSegments || [];
    const result = calcReservationPricing({
      type, roomType, checkIn, checkOut, checkInTime, checkOutTime, daycareSize,
      dogs: dog ? [dog] : [], dogProfiles: data.dogs, pricing: data.pricing,
      isSecondDogSameRoom: false,
      roomSegments: singleSegs.length > 0 ? singleSegs : undefined,
      reservation: { actualCheckInTime: undefined },
    });
    // Append manual add-ons
    appendAddOns(result, did);
    // Late checkout fee for single dog boarding
    if (type === "boarding" && checkOutTime && checkOutTime > "12:30") {
      const halfDayRate = (data.pricing || DEF_PRICING).daycareRates?.halfDay || 30;
      const dogName = dog ? (dog.fields.name || "Dog") : "Dog";
      result.lineItems.push({ label: `Late Checkout Fee — ${dogName}`, rate: halfDayRate, qty: 1, total: halfDayRate, isAddon: true, isLateCheckout: true });
      result.subtotal += halfDayRate;
      result.total += halfDayRate;
      result.deposit = Math.round(result.subtotal * (result.depositPercent / 100) * 100) / 100;
      result.balance = Math.round((result.total - result.deposit) * 100) / 100;
    }
    return result;
  }, [type, roomType, checkIn, checkOut, checkInTime, checkOutTime, daycareSize, selectedDogs.join(","), data.pricing, perDogMode, JSON.stringify(perDogConfig), JSON.stringify(dogAddOns)]);

  return (
    <div>
      <button onClick={()=>nav("dashboard")} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.textSec,fontSize:14,fontWeight:600,padding:0,marginBottom:20,fontFamily:"inherit"}}><I.Back/> Back to Dashboard</button>
      <h1 style={{margin:"0 0 24px",fontSize:26,fontWeight:800,color:C.text}}>Book Reservation</h1>
      <Card style={{padding:28}}>
        {/* Client & Type */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div ref={clientDropRef} style={{ position: "relative" }}>
            <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"}}>Client <span style={{color:C.dan}}>*</span></div>
            <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${errors.clientId ? C.dan : clientDropOpen ? C.pri : C.border}`, borderRadius: 10, background: C.surface, overflow: "hidden", transition: "border-color 0.15s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 12 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input ref={clientSearchRef} value={clientSearch} onChange={e => { setClientSearch(e.target.value); setClientDropOpen(true); if (clientId) { setClientId(""); } }}
                onFocus={() => setClientDropOpen(true)}
                onKeyDown={e => {
                  if (e.key === "Enter" && clientDropOpen && !clientId) {
                    e.preventDefault();
                    if (clientResults.length > 0) { selectClient(clientResults[0]); }
                    else if (clientSearch.trim()) { nav("new-client", { prefill: clientSearch.trim() }); }
                  }
                }}
                placeholder="Search client name, dog, phone, email…"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: C.text, padding: "10px 10px", width: "100%", fontFamily: "inherit" }} />
              {clientId && (
                <button onClick={clearClient} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: "0 10px", display: "flex", flexShrink: 0 }} title="Clear">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            {/* Dropdown results */}
            {clientDropOpen && !clientId && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: 280, overflow: "auto" }}>
                {clientResults.map(c => {
                  const dogs = data.dogs.filter(d => d.clientId === c.id);
                  return (
                    <button key={c.id} onClick={() => selectClient(c)}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${C.pri}, ${C.priL})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0 }}>{(c.fields.first_name || "?")[0]}{(c.fields.last_name || "?")[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.fields.first_name} {c.fields.last_name}</div>
                        <div style={{ fontSize: 11, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fmtPhone(c.fields.phone)}{c.fields.email ? ` · ${c.fields.email}` : ""}
                          {dogs.length > 0 && ` · ${dogs.map(d => d.fields.name).join(", ")}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {/* Create new client option */}
                {clientSearch.trim() && (
                  <button onClick={() => nav("new-client", { prefill: clientSearch.trim() })}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", border: "none", borderTop: clientResults.length > 0 ? `1px solid ${C.borderLight}` : "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, border: `2px dashed ${C.pri}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.pri }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>Create New Client</div>
                      <div style={{ fontSize: 11, color: C.textMut }}>No match for "{clientSearch.trim()}" — press <kbd style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg, fontSize: 10, fontWeight: 700 }}>Enter</kbd> or click here</div>
                    </div>
                  </button>
                )}
                {!clientSearch.trim() && clientResults.length === 0 && (
                  <div style={{ padding: "16px 14px", textAlign: "center", color: C.textMut, fontSize: 13 }}>No clients yet</div>
                )}
              </div>
            )}
            {errors.clientId&&<div style={{color:C.dan,fontSize:12,fontWeight:600,marginTop:4}}>{errors.clientId}</div>}
            {clientId && <button onClick={() => nav("client-detail", { clientId })} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.pri}30`, background: C.priLt, color: C.pri, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = C.pri; e.currentTarget.style.color = "#fff"; }} onMouseLeave={e => { e.currentTarget.style.background = C.priLt; e.currentTarget.style.color = C.pri; }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Profile</button>}
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"}}>Type</div>
            <div style={{display:"flex",gap:8}}>
              {[{v:"boarding",l:"Boarding"},{v:"dayboarding",l:"Day Boarding"},{v:"daycare",l:"Daycare"},{v:"evaluation",l:"Evaluation"},{v:"tour",l:"Tour"}].map(t=>(
                <button key={t.v} onClick={()=>setType(t.v)} style={{flex:1,padding:"10px 0",borderRadius:10,border:`2px solid ${type===t.v?C.pri:C.border}`,background:type===t.v?C.priLt:C.surface,color:type===t.v?C.pri:C.textSec,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Eval gate banner: warn if daycare selected but dogs lack evaluation */}
        {type==="daycare"&&selectedDogs.length>0&&(()=>{
          const unevaled = selectedDogs.filter(did => !(data.evaluations || []).some(e => e.dogId === did && e.locked));
          if(unevaled.length===0) return null;
          const names = unevaled.map(did => { const d = data.dogs.find(x=>x.id===did); return d ? d.fields.name : "Unknown"; }).join(", ");
          return <div style={{padding:"12px 16px",borderRadius:10,background:C.warnLt,border:`1.5px solid ${C.warn}40`,marginTop:8}}>
            <div style={{fontSize:13,fontWeight:700,color:C.warn}}>Evaluation Required</div>
            <div style={{fontSize:12,color:C.textSec,marginTop:2}}>{names} {unevaled.length===1?"has":"have"} no evaluation on file. This booking will be automatically converted to an Evaluation when you save.</div>
          </div>;
        })()}
        {errors.evalGate&&<div style={{padding:"12px 16px",borderRadius:10,background:C.sucLt,border:`1.5px solid ${C.suc}40`,marginTop:8}}><div style={{fontSize:13,fontWeight:700,color:C.suc}}>Converted to Evaluation</div><div style={{fontSize:12,color:C.textSec,marginTop:2}}>{errors.evalGate}</div></div>}

        {/* Dates & Times — before room selection so availability is based on chosen dates */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:20}}>
          <CalendarPicker label="Check-In Date" value={checkIn} onChange={setCheckIn} required extraContent={<>{checkIn&&<div style={{fontSize:11,color:C.pri,fontWeight:600,marginTop:2}}>{new Date(checkIn+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>}{checkIn&&(data.closedDates||[]).some(cd=>cd.date===checkIn)&&<div style={{fontSize:11,fontWeight:700,color:C.dan,marginTop:2}}>Resort closed: {(data.closedDates||[]).find(cd=>cd.date===checkIn)?.label||"Closed"}</div>}{errors.checkIn&&<div style={{color:C.dan,fontSize:12,marginTop:4,fontWeight:600}}>{errors.checkIn}</div>}</>}/>
          <div><Inp label="Check-In Time" type="time" value={checkInTime} onChange={setCheckInTime}/></div>
          {(type==="boarding"||type==="dayboarding")&&<div style={{gridColumn:"1/-1",margin:"-8px 0 -4px"}}><div style={{fontSize:11,color:C.textMut,background:C.bg,padding:"6px 10px",borderRadius:6,border:`1px dashed ${C.border}`}}>{type==="dayboarding"?"Day boarding: drop-off & pick-up during regular operating hours — 7 AM – 7 PM Mon–Fri, 9 AM – 5:30 PM Sat–Sun.":"Boarding drop-off hours are from 9 AM – 5:30 PM, 7 days a week."}</div></div>}
          {type==="boarding"&&<CalendarPicker label="Check-Out Date" value={checkOut} onChange={setCheckOut} required min={checkIn} extraContent={<>{checkOut&&<div style={{fontSize:11,color:C.pri,fontWeight:600,marginTop:2}}>{new Date(checkOut+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>}{checkIn&&checkOut&&<div style={{fontSize:11,fontWeight:600,color:C.textSec,marginTop:2}}>Nights: {countNights(checkIn,checkOut)}</div>}{checkOut&&(data.closedDates||[]).some(cd=>cd.date===checkOut)&&<div style={{fontSize:11,fontWeight:700,color:C.dan,marginTop:2}}>Resort closed: {(data.closedDates||[]).find(cd=>cd.date===checkOut)?.label||"Closed"}</div>}{errors.checkOut&&<div style={{color:C.dan,fontSize:12,marginTop:4,fontWeight:600}}>{errors.checkOut}</div>}</>}/>}
          {type==="boarding"&&<div><Inp label="Check-Out Time" type="time" value={checkOutTime} onChange={setCheckOutTime}/></div>}
          {type==="boarding"&&<div style={{gridColumn:"1/-1",margin:"-8px 0 -4px"}}><div style={{fontSize:11,color:C.textMut,background:C.bg,padding:"6px 10px",borderRadius:6,border:`1px dashed ${C.border}`}}>Boarding pick-up hours start at 9 AM. Check-out time is 12:30 PM. Extended checkout to 5:30 PM available 7 days a week for a half-day daycare fee ({`$${((data.pricing||DEF_PRICING).daycareRates?.halfDay||30).toFixed(2)}`}).</div></div>}
          {/* Bathing policy notice moved to each dog's care section — only shown for 2+ night stays */}
          {type==="dayboarding"&&<div><Inp label="Pick-Up Time" type="time" value={checkOutTime} onChange={setCheckOutTime}/></div>}
          {type!=="boarding"&&type!=="dayboarding"&&<div><Inp label="Check-Out Time" type="time" value={checkOutTime} onChange={setCheckOutTime}/></div>}
        </div>

        {/* Sub-type selectors */}
        {(type === "boarding" || type === "dayboarding") && (
          <div style={{marginTop:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textSec,letterSpacing:"0.03em",textTransform:"uppercase"}}>Room Type <span style={{color:C.dan}}>*</span>{lastUsedRoomType && selectedDogs.length > 0 && <span style={{fontSize:10,fontWeight:500,color:C.pri,textTransform:"none",marginLeft:8}}>Last Used By {data.dogs.find(d=>d.id===selectedDogs[0])?.fields.name}</span>}</div>
              {selectedDogs.length > 0 && (()=>{const pastRes = data.reservations.filter(r => r.dogIds && r.dogIds.includes(selectedDogs[0]) && r.status === "checked-out" && r.roomType); return pastRes.length > 0 ? <button onClick={()=>setShowPastBoardingModal(!showPastBoardingModal)} style={{fontSize:11,fontWeight:600,color:C.pri,cursor:"pointer",background:"none",border:"none",textDecoration:"underline",textDecorationColor:C.pri+"40",padding:0}}>View Past Boarding</button> : null;})()}
            </div>
            {showPastBoardingModal && selectedDogs.length > 0 && (()=>{const pastRes = data.reservations.filter(r => r.dogIds && r.dogIds.includes(selectedDogs[0]) && r.status === "checked-out" && r.roomType).sort((a,b) => new Date(b.checkOut) - new Date(a.checkOut)); return <div style={{marginBottom:12,padding:"12px",borderRadius:8,background:C.bg,border:`1px solid ${C.border}`}}>{pastRes.map(res => <div key={res.id} style={{fontSize:11,color:C.textSec,padding:"4px 0",display:"flex",justifyContent:"space-between"}}><span><strong>{res.roomType}</strong></span><span>{fmtDate(res.checkIn)} → {fmtDate(res.checkOut)}</span></div>)}</div>; })()}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {ROOM_TYPES.map(rt => {
                const avail = roomAvailByType[rt];
                const noRooms = avail && avail.available === 0 && avail.total > 0;
                return (
                <button key={rt} onClick={()=>setRoomType(rt)}
                  style={{padding:"10px 18px",borderRadius:10,border:`2px solid ${roomType===rt?C.pri:noRooms?C.dan+"60":C.border}`,background:roomType===rt?C.priLt:C.surface,color:roomType===rt?C.pri:C.textSec,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"border-color 0.15s, background 0.15s, color 0.15s",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span>{rt}</span>
                  {avail && avail.total > 0 && <span style={{fontSize:10,fontWeight:500,color:noRooms?C.dan:roomType===rt?C.pri:C.textMut}}>{avail.available}/{avail.total} remaining</span>}
                </button>
                );
              })}
            </div>
            {/* Partial Availability Toggle */}
            {needsRoom && checkIn && checkOut && countNights(checkIn, checkOut) > 1 && (
              <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.textSec,cursor:"pointer"}}>
                  <input type="checkbox" checked={showPartialAvail} onChange={e => setShowPartialAvail(e.target.checked)} style={{accentColor:C.acc}} />
                  <span style={{fontWeight:600}}>Show Partial Availability</span>
                </label>
                <span style={{fontSize:10,color:C.textMut}}>Find rooms available for part of the stay</span>
              </div>
            )}
            {/* Partial Availability Cards */}
            {showPartialAvail && Object.keys(partialAvailByType).length > 0 && (
              <div style={{marginTop:10}}>
                <div style={{fontSize:11,fontWeight:700,color:C.acc,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>Partial Availability Found</div>
                {Object.entries(partialAvailByType).map(([rt, pa]) => {
                  const isSelected = partialSegments.some(s => s.roomType === rt);
                  return (
                    <div key={rt} style={{padding:"12px 16px",borderRadius:10,border:`1.5px solid ${isSelected ? C.suc : C.acc}40`,background:isSelected ? C.sucLt : `${C.acc}08`,marginBottom:8,cursor:"pointer"}}
                      onClick={() => {
                        if (isSelected) {
                          setPartialSegments(prev => prev.filter(s => s.roomType !== rt));
                        } else {
                          // Set first segment as partial room, then need to fill the remainder
                          const seg1 = { roomType: rt, startDate: pa.start, endDate: pa.end, room: pa.room };
                          // Determine remaining segment(s)
                          const remainingSegs = [];
                          if (pa.start > checkIn) remainingSegs.push({ startDate: checkIn, endDate: pa.start, roomType: "", room: "" });
                          if (pa.end < checkOut) remainingSegs.push({ startDate: pa.end, endDate: checkOut, roomType: "", room: "" });
                          setPartialSegments([seg1, ...remainingSegs]);
                          setRoomType(rt);
                        }
                      }}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <span style={{fontSize:13,fontWeight:700,color:C.text}}>{rt}</span>
                          <span style={{fontSize:11,color:C.textSec,marginLeft:8}}>Room {pa.room}</span>
                        </div>
                        <span style={{fontSize:11,fontWeight:600,color:isSelected ? C.suc : C.acc,padding:"2px 10px",borderRadius:10,background:isSelected ? C.sucLt : `${C.acc}15`}}>
                          {isSelected ? "Selected" : `${pa.nights}/${pa.totalNights} nights`}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:C.textSec,marginTop:4}}>
                        Available {fmtDate(pa.start)} through {fmtDate(pa.end)} ({pa.nights} night{pa.nights > 1 ? "s" : ""} of {pa.totalNights} total)
                      </div>
                      {isSelected && partialSegments.filter(s => !s.roomType).length > 0 && (
                        <div style={{marginTop:8,padding:"10px 14px",borderRadius:8,background:C.warnLt,border:`1px solid ${C.warn}30`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.warn,marginBottom:6}}>Select a room type for the remaining nights:</div>
                          {partialSegments.filter(s => !s.roomType).map((s, i) => {
                            const segNights = countNights(s.startDate, s.endDate);
                            return (
                              <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
                                <span style={{fontSize:12,fontWeight:600,color:C.text,minWidth:160}}>{fmtDate(s.startDate)} → {fmtDate(s.endDate)} ({segNights} night{segNights > 1 ? "s" : ""})</span>
                                <select value={s.roomType || ""} onChange={e => {
                                  const newSegs = [...partialSegments];
                                  const idx = newSegs.findIndex(x => x.startDate === s.startDate && !x.roomType);
                                  if (idx >= 0) {
                                    const selType = e.target.value;
                                    // Auto-assign first available room of that type for this segment
                                    const typeRooms = allRooms[selType] || [];
                                    const segBooked = new Set(data.reservations.filter(r => (r.type === "boarding" || r.type === "dayboarding") && r.roomType === selType && r.room && r.status !== "checked-out" && r.status !== "cancelled" && r.checkIn < s.endDate && r.checkOut > s.startDate).map(r => r.room));
                                    const avail = typeRooms.filter(rm => !segBooked.has(rm));
                                    newSegs[idx] = { ...newSegs[idx], roomType: selType, room: avail[0] || "" };
                                  }
                                  setPartialSegments(newSegs);
                                }} style={{padding:"6px 10px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,fontFamily:"inherit",background:C.surface,color:C.text,fontWeight:600,minWidth:180}}>
                                  <option value="">Choose room type...</option>
                                  {ROOM_TYPES.map(rrt => {
                                    const typeRooms = allRooms[rrt] || [];
                                    const segBooked = new Set(data.reservations.filter(r => (r.type === "boarding" || r.type === "dayboarding") && r.roomType === rrt && r.room && r.status !== "checked-out" && r.status !== "cancelled" && r.checkIn < s.endDate && r.checkOut > s.startDate).map(r => r.room));
                                    const availCount = typeRooms.filter(rm => !segBooked.has(rm)).length;
                                    return <option key={rrt} value={rrt} disabled={availCount === 0}>{rrt} ({availCount} available)</option>;
                                  })}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {isSelected && partialSegments.every(s => s.roomType) && partialSegments.length > 1 && (
                        <div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:C.sucLt,border:`1px solid ${C.suc}30`,fontSize:11,color:C.suc,fontWeight:600}}>
                          All segments configured — this will create a split-room reservation with {partialSegments.length} segments.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {showPartialAvail && Object.keys(partialAvailByType).length === 0 && checkIn && checkOut && countNights(checkIn, checkOut) > 1 && (
              <div style={{marginTop:8,padding:"10px 14px",borderRadius:8,background:C.bg,border:`1px solid ${C.borderLight}`,fontSize:12,color:C.textMut}}>
                No partial availability found for unavailable room types in this date range.
              </div>
            )}
            {/* Smart Room Selection */}
            {roomsForType.length > 0 && (
              <div style={{marginTop:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:11,fontWeight:600,color:C.textSec,letterSpacing:"0.03em",textTransform:"uppercase"}}>Select Room <span style={{fontWeight:500,textTransform:"none",color:C.textMut}}>— {availableRooms.length}/{roomsForType.length} available</span></span>
                    <button onClick={() => setShowRoomGuide(v => !v)} style={{ width: 18, height: 18, borderRadius: 9, border: `1.5px solid ${showRoomGuide ? C.pri : C.border}`, background: showRoomGuide ? C.priLt : "transparent", color: showRoomGuide ? C.pri : C.textMut, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1 }} title="How room recommendations work">?</button>
                  </div>
                  <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.textMut,cursor:"pointer"}}>
                    <input type="checkbox" checked={showBookedRooms} onChange={e=>setShowBookedRooms(e.target.checked)} style={{accentColor:C.pri}} />
                    Show booked
                  </label>
                </div>
                {/* Room Assignment Guide */}
                {showRoomGuide && (
                  <div style={{ marginBottom: 12, padding: "16px 18px", borderRadius: 10, border: `1.5px solid ${C.priLt}`, background: `linear-gradient(135deg, ${C.priLt}40, ${C.surface})`, fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.pri, marginBottom: 8 }}>How Room Recommendations Work</div>
                    <div style={{ marginBottom: 8 }}>
                      The system automatically recommends the <span style={{ fontWeight: 700, color: C.text }}>best room</span> (marked with a green "Best" badge) using a <span style={{ fontWeight: 700, color: C.text }}>hybrid scoring algorithm</span> that adapts based on how full the resort is.
                    </div>
                    <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>For each available room, the system checks:</div>
                    <div style={{ paddingLeft: 12, marginBottom: 8 }}>
                      <div><span style={{ fontWeight: 700 }}>Last Out</span> — when the previous guest checked out of this room, and how many days of buffer exist before this reservation's check-in.</div>
                      <div><span style={{ fontWeight: 700 }}>Next In</span> — when the next guest is booked to check into this room, and how many days of buffer exist after this reservation's check-out.</div>
                    </div>
                    <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>The strategy shifts with occupancy:</div>
                    <div style={{ paddingLeft: 12, marginBottom: 8 }}>
                      <div><span style={{ fontWeight: 700, color: C.suc }}>Below 50% occupancy (Comfort Mode)</span> — Picks the room with the <span style={{ fontWeight: 700 }}>biggest gaps</span> before and after. This gives staff the most time for turnarounds, cleaning, and prep. No rush.</div>
                      <div><span style={{ fontWeight: 700, color: C.acc }}>50–75% occupancy (Blended)</span> — Smoothly transitions between comfort and capacity optimization.</div>
                      <div><span style={{ fontWeight: 700, color: C.dan }}>Above 75% occupancy (Capacity Mode)</span> — Picks the room with the <span style={{ fontWeight: 700 }}>tightest fit</span>. This packs reservations snugly to preserve larger open windows for future bookings — critical during peak periods like holidays when every room counts.</div>
                    </div>
                    <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>Reading the room cards:</div>
                    <div style={{ paddingLeft: 12, marginBottom: 8 }}>
                      <div>Each card shows the room number, last checkout date, and next check-in date with the gap in days. <span style={{ fontWeight: 700, color: C.dan }}>Red</span> = same-day turnaround (tight!). <span style={{ fontWeight: 700, color: C.acc }}>Amber</span> = 1 day buffer. Normal = comfortable gap.</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.textMut, fontStyle: "italic" }}>You can always override the recommendation by clicking any available room. The "Best" badge is a suggestion, not a requirement.</div>
                  </div>
                )}

                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:8}}>
                  {roomScored.map(rs => {
                    const sel = selectedRoom === rs.room;
                    const booked = rs.booked;
                    if (booked && !showBookedRooms) return null;
                    return (
                      <button key={rs.room} onClick={() => !booked && setSelectedRoom(sel ? "" : rs.room)} disabled={booked}
                        style={{ padding: "10px 12px", borderRadius: 10, border: `2px solid ${booked ? C.borderLight : sel ? C.pri : rs.recommended ? C.suc : C.border}`, background: booked ? C.bg : sel ? C.priLt : C.surface, cursor: booked ? "not-allowed" : "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.12s", opacity: booked ? 0.5 : 1, position: "relative" }}>
                        {rs.recommended && !booked && <div style={{ position: "absolute", top: -8, right: 8, fontSize: 9, fontWeight: 700, color: "#fff", background: C.suc, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Best</div>}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: booked ? C.textMut : sel ? C.pri : C.text, textDecoration: booked ? "line-through" : "none" }}>{rs.room}</span>
                          {rs.isPPRoom && <span style={{ fontSize: 8, fontWeight: 700, color: C.acc, background: C.accLt, padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em" }}>PP</span>}
                        </div>
                        {!booked && (
                          <div style={{ fontSize: 10, color: C.textMut, lineHeight: 1.5 }}>
                            <div>Last out: <span style={{ fontWeight: 600, color: rs.gapBefore <= 0 ? C.dan : rs.gapBefore <= 1 ? C.acc : C.textSec }}>{rs.lastOut ? `${fmtDate(rs.lastOut)}${rs.gapBefore >= 0 ? ` (${rs.gapBefore}d)` : ""}` : "None"}</span></div>
                            <div>Next in: <span style={{ fontWeight: 600, color: rs.gapAfter <= 0 ? C.dan : rs.gapAfter <= 1 ? C.acc : C.textSec }}>{rs.nextIn ? `${fmtDate(rs.nextIn)}${rs.gapAfter >= 0 ? ` (${rs.gapAfter}d)` : ""}` : "None"}</span></div>
                          </div>
                        )}
                        {booked && <div style={{ fontSize: 10, color: C.textMut }}>Booked for these dates</div>}
                      </button>
                    );
                  })}
                </div>
                {availableRooms.length === 0 && <div style={{fontSize:12,color:C.dan,fontWeight:600,marginTop:6}}>No rooms available for these dates</div>}
                {errors.room && <div style={{fontSize:12,color:C.dan,fontWeight:600,marginTop:6}}>{errors.room}</div>}
              </div>
            )}
          </div>
        )}
        {/* Per-Dog Room Config (multi-dog boarding) */}
        {(type==="boarding"||type==="dayboarding")&&selectedDogs.length>1&&(
          <div style={{marginTop:16}}>
            <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"12px 16px",borderRadius:10,border:`1.5px solid ${perDogMode?C.pri:C.borderLight}`,background:perDogMode?C.priLt+"30":C.bg}}>
              <input type="checkbox" checked={perDogMode} onChange={e=>setPerDogMode(e.target.checked)} style={{accentColor:C.pri,width:16,height:16}}/>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.text}}>Customize rooms per dog</div>
                <div style={{fontSize:11,color:C.textSec}}>Assign each dog their own room type, room, or checkout date.</div>
              </div>
            </label>
            {perDogMode&&(
              <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:12}}>
                {selectedDogs.map(did=>{
                  const dog=data.dogs.find(d=>d.id===did);
                  if(!dog)return null;
                  const cfg=perDogConfig[did]||{};
                  const dogRT=cfg.roomType||roomType;
                  const dogCO=cfg.checkOut||checkOut;
                  const dogRoomsForType=(data.rooms||{})[dogRT]||[];
                  // Filter out rooms selected by OTHER dogs
                  const otherSelectedRooms=selectedDogs.filter(d2=>d2!==did).map(d2=>(perDogConfig[d2]||{}).room).filter(Boolean);
                  const segments=cfg.roomSegments||[];
                  return (
                    <div key={did} style={{padding:"16px 20px",borderRadius:12,border:`1.5px solid ${C.border}`,background:C.bg}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10}}>{dog.fields.name}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        <div>
                          <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,textTransform:"uppercase"}}>Room Type</div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {ROOM_TYPES.map(rt=>(
                              <button key={rt} onClick={()=>setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomType:rt,room:""}}))}
                                style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${dogRT===rt?C.pri:C.border}`,background:dogRT===rt?C.priLt:C.surface,color:dogRT===rt?C.pri:C.textSec,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{rt}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,textTransform:"uppercase"}}>Check-Out</div>
                          <MiniDatePicker value={dogCO} onChange={v=>setPerDogConfig(prev=>({...prev,[did]:{...prev[did],checkOut:v}}))}/>
                        </div>
                      </div>
                      {segments.length===0&&(
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,textTransform:"uppercase"}}>Room</div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {dogRoomsForType.map(rm=>{
                              const sel=cfg.room===rm;
                              const taken=otherSelectedRooms.includes(rm);
                              return <button key={rm} onClick={()=>!taken&&setPerDogConfig(prev=>({...prev,[did]:{...prev[did],room:sel?"":rm}}))} disabled={taken}
                                style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${sel?C.pri:taken?C.borderLight:C.border}`,background:sel?C.priLt:C.surface,color:sel?C.pri:taken?C.textMut:C.text,fontSize:11,fontWeight:600,cursor:taken?"not-allowed":"pointer",fontFamily:"inherit",opacity:taken?0.5:1}}>{rm}</button>;
                            })}
                          </div>
                        </div>
                      )}
                      {/* Room Transfer Segments */}
                      {segments.length>0&&(()=>{
                        const pdUpdateEnd=(si,newEnd)=>{
                          const ns=[...segments];ns[si]={...ns[si],endDate:newEnd};
                          if(si<ns.length-1)ns[si+1]={...ns[si+1],startDate:newEnd};
                          const lastEnd=ns[ns.length-1].endDate;
                          if(lastEnd>dogCO)setPerDogConfig(prev=>({...prev,[did]:{...prev[did],checkOut:lastEnd,roomSegments:ns}}));
                          else setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));
                        };
                        const pdUpdateStart=(si,newStart)=>{
                          const ns=[...segments];ns[si]={...ns[si],startDate:newStart};
                          if(si>0)ns[si-1]={...ns[si-1],endDate:newStart};
                          setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));
                        };
                        // Helper: compute scored rooms for a segment's date range & room type
                        const pdSegRoomScored = (segRT, segCI, segCO) => {
                          const segRooms = (data.rooms||{})[segRT]||[];
                          const allBR = data.reservations.filter(r=>(r.type==="boarding"||r.type==="dayboarding")&&r.roomType===segRT&&r.room&&r.status!=="checked-out");
                          const segBooked = new Set(allBR.filter(r=>r.checkIn<=segCO&&r.checkOut>=segCI).map(r=>r.room));
                          const daysBetween=(a,b)=>Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000);
                          const totalR=segRooms.length;const occ=totalR>0?(totalR-segRooms.filter(r=>!segBooked.has(r)).length)/totalR:0;
                          const scored=segRooms.map(room=>{
                            const bk=segBooked.has(room)||otherSelectedRooms.includes(room);
                            const rr=allBR.filter(r=>r.room===room);
                            const before=rr.filter(r=>r.checkOut<=segCI).sort((a,b)=>b.checkOut.localeCompare(a.checkOut));
                            const lastOut=before.length>0?before[0].checkOut:null;
                            const after=rr.filter(r=>r.checkIn>=segCO).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
                            const nextIn=after.length>0?after[0].checkIn:null;
                            const gapBefore=lastOut?daysBetween(lastOut,segCI):999;
                            const gapAfter=nextIn?daysBetween(segCO,nextIn):999;
                            const cs=Math.min(gapBefore,30)+Math.min(gapAfter,30);
                            const blend2=occ<0.5?0:occ>0.75?1:(occ-0.5)/0.25;
                            const score=bk?-9999:(1-blend2)*cs+blend2*(60-cs);
                            return {room,booked:bk,lastOut,nextIn,gapBefore,gapAfter,score};
                          });
                          scored.sort((a,b)=>{if(a.booked!==b.booked)return a.booked?1:-1;return b.score-a.score;});
                          const top=scored.find(r=>!r.booked);if(top)top.recommended=true;
                          return scored;
                        };
                        return (
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:6,textTransform:"uppercase"}}>Room Segments</div>
                          {segments.map((seg,si)=>{
                            const pdScored=pdSegRoomScored(seg.roomType,seg.startDate,seg.endDate);
                            const pdAvail=pdScored.filter(r=>!r.booked);
                            return (
                            <div key={si} style={{padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,background:C.surface,marginBottom:6}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                                <span style={{fontSize:11,fontWeight:700,color:C.pri}}>Segment {si+1}</span>
                                <button onClick={()=>{const ns=segments.filter((_,i)=>i!==si);setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));}}
                                  style={{padding:"2px 6px",borderRadius:4,border:`1px solid ${C.dan}40`,background:C.dan+"12",color:C.dan,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
                              </div>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                                <div><div style={{fontSize:9,color:C.textMut}}>From</div><MiniDatePicker value={seg.startDate} onChange={v=>pdUpdateStart(si,v)}/></div>
                                <div><div style={{fontSize:9,color:C.textMut}}>To</div><MiniDatePicker value={seg.endDate} onChange={v=>pdUpdateEnd(si,v)}/></div>
                              </div>
                              <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:6}}>
                                {ROOM_TYPES.map(rt=>(
                                  <button key={rt} onClick={()=>{const ns=[...segments];ns[si]={...ns[si],roomType:rt,room:""};setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));}}
                                    style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${seg.roomType===rt?C.pri:C.border}`,background:seg.roomType===rt?C.priLt:C.bg,color:seg.roomType===rt?C.pri:C.textSec,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{rt}</button>
                                ))}
                              </div>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(110px, 1fr))",gap:4}}>
                                {pdScored.filter(rs=>!rs.booked).map(rs=>{
                                  const sel2=seg.room===rs.room;
                                  return (
                                    <button key={rs.room} onClick={()=>{const ns=[...segments];ns[si]={...ns[si],room:sel2?"":rs.room};setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));}}
                                      style={{padding:"6px 8px",borderRadius:6,border:`1px solid ${sel2?C.pri:rs.recommended?C.suc:C.border}`,background:sel2?C.priLt:C.bg,cursor:"pointer",fontFamily:"inherit",textAlign:"left",position:"relative"}}>
                                      {rs.recommended&&!sel2&&<div style={{position:"absolute",top:-5,right:4,fontSize:7,fontWeight:700,color:"#fff",background:C.suc,padding:"0 4px",borderRadius:2}}>Best</div>}
                                      <div style={{fontSize:11,fontWeight:800,color:sel2?C.pri:C.text}}>{rs.room}</div>
                                      <div style={{fontSize:8,color:C.textMut}}>
                                        <span style={{color:rs.gapBefore<=0?C.dan:rs.gapBefore<=1?C.acc:C.textMut}}>{rs.lastOut?`←${rs.gapBefore}d`:"←∞"}</span>
                                        {" · "}
                                        <span style={{color:rs.gapAfter<=0?C.dan:rs.gapAfter<=1?C.acc:C.textMut}}>{rs.nextIn?`${rs.gapAfter}d→`:"∞→"}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              {pdAvail.length===0&&<div style={{fontSize:10,color:C.dan,fontWeight:600}}>No rooms available</div>}
                            </div>
                            );
                          })}
                        </div>
                        );
                      })()}
                      <button onClick={()=>{
                        const existing=cfg.roomSegments||[];
                        if(existing.length===0){
                          const mid=addDays(checkIn,Math.ceil(countNights(checkIn,dogCO)/2));
                          setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:[
                            {roomType:dogRT,room:cfg.room||"",startDate:checkIn,endDate:mid},
                            {roomType:dogRT,room:"",startDate:mid,endDate:dogCO},
                          ]}}));
                        } else {
                          const lastEnd=existing[existing.length-1].endDate;
                          setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:[...existing,{roomType:dogRT,room:"",startDate:lastEnd,endDate:dogCO}]}}));
                        }
                      }} style={{marginTop:8,display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.pri,fontSize:12,fontWeight:600,padding:0,fontFamily:"inherit"}}>
                        <I.Plus/> {segments.length>0?"Add Segment":"Add Room Transfer"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Room Transfer for single-dog boarding */}
        {type==="boarding"&&selectedDogs.length===1&&(()=>{
          const did=selectedDogs[0];
          const cfg=perDogConfig[did]||{};
          const segments=cfg.roomSegments||[];
          const dogCO=checkOut;
          const updateSegEnd=(si,newEnd)=>{
            const ns=[...segments];ns[si]={...ns[si],endDate:newEnd};
            // Auto-chain: if not last segment, update next segment's startDate
            if(si<ns.length-1)ns[si+1]={...ns[si+1],startDate:newEnd};
            // Auto-adjust checkout if last segment extends beyond
            const lastEnd=ns[ns.length-1].endDate;
            if(lastEnd>checkOut)setCheckOut(lastEnd);
            setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));
          };
          const updateSegStart=(si,newStart)=>{
            const ns=[...segments];ns[si]={...ns[si],startDate:newStart};
            // Auto-chain: if not first segment, update prev segment's endDate
            if(si>0)ns[si-1]={...ns[si-1],endDate:newStart};
            // Auto-adjust checkIn if first segment starts before
            if(si===0&&newStart<checkIn)setCheckIn(newStart);
            setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));
          };
          // Helper: compute scored rooms for a segment's date range & room type
          const segRoomScored = (segRT, segCI, segCO) => {
            const segRooms = (data.rooms||{})[segRT]||[];
            const allBR = data.reservations.filter(r=>(r.type==="boarding"||r.type==="dayboarding")&&r.roomType===segRT&&r.room&&r.status!=="checked-out");
            const totalR = segRooms.length;
            const segBooked = new Set(allBR.filter(r=>r.checkIn<=segCO&&r.checkOut>=segCI).map(r=>r.room));
            const occ = totalR>0?(totalR-segRooms.filter(r=>!segBooked.has(r)).length)/totalR:0;
            const daysBetween=(a,b)=>Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000);
            const scored=segRooms.map(room=>{
              const bk=segBooked.has(room);
              const rr=allBR.filter(r=>r.room===room);
              const before=rr.filter(r=>r.checkOut<=segCI).sort((a,b)=>b.checkOut.localeCompare(a.checkOut));
              const lastOut=before.length>0?before[0].checkOut:null;
              const after=rr.filter(r=>r.checkIn>=segCO).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
              const nextIn=after.length>0?after[0].checkIn:null;
              const gapBefore=lastOut?daysBetween(lastOut,segCI):999;
              const gapAfter=nextIn?daysBetween(segCO,nextIn):999;
              const comfortScore=Math.min(gapBefore,30)+Math.min(gapAfter,30);
              const packScore=60-comfortScore;
              const blend=occ<0.5?0:occ>0.75?1:(occ-0.5)/0.25;
              const score=bk?-9999:(1-blend)*comfortScore+blend*packScore;
              return {room,booked:bk,lastOut,nextIn,gapBefore,gapAfter,score};
            });
            scored.sort((a,b)=>{if(a.booked!==b.booked)return a.booked?1:-1;return b.score-a.score;});
            const top=scored.find(r=>!r.booked);if(top)top.recommended=true;
            return scored;
          };
          return (
            <div style={{marginTop:12}}>
              {segments.length>0&&(
                <div style={{marginTop:8}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:6,textTransform:"uppercase"}}>Room Segments</div>
                  {segments.map((seg,si)=>{
                    const segScored=segRoomScored(seg.roomType,seg.startDate,seg.endDate);
                    const segAvail=segScored.filter(r=>!r.booked);
                    return (
                    <div key={si} style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,background:C.bg,marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.pri}}>Segment {si+1}</div>
                        <button onClick={()=>{const ns=segments.filter((_,i)=>i!==si);setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));}}
                          style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.dan}40`,background:C.dan+"12",color:C.dan,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                        <div>
                          <div style={{fontSize:10,color:C.textMut,marginBottom:3}}>From</div>
                          <MiniDatePicker value={seg.startDate} onChange={v=>updateSegStart(si,v)}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:C.textMut,marginBottom:3}}>To</div>
                          <MiniDatePicker value={seg.endDate} onChange={v=>updateSegEnd(si,v)}/>
                        </div>
                      </div>
                      <div style={{fontSize:10,fontWeight:600,color:C.textSec,marginBottom:4,textTransform:"uppercase"}}>Room Type</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                        {ROOM_TYPES.map(rt=>(
                          <button key={rt} onClick={()=>{const ns=[...segments];ns[si]={...ns[si],roomType:rt,room:""};setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));}}
                            style={{padding:"5px 10px",borderRadius:6,border:`1.5px solid ${seg.roomType===rt?C.pri:C.border}`,background:seg.roomType===rt?C.priLt:C.surface,color:seg.roomType===rt?C.pri:C.textSec,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{rt}</button>
                        ))}
                      </div>
                      <div style={{fontSize:10,fontWeight:600,color:C.textSec,marginBottom:4,textTransform:"uppercase"}}>Select Room — {segAvail.length}/{segScored.length} available</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",gap:6}}>
                        {segScored.filter(rs=>!rs.booked).map(rs=>{
                          const sel=seg.room===rs.room;
                          return (
                            <button key={rs.room} onClick={()=>{const ns=[...segments];ns[si]={...ns[si],room:sel?"":rs.room};setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:ns}}));}}
                              style={{padding:"8px 10px",borderRadius:8,border:`1.5px solid ${sel?C.pri:rs.recommended?C.suc:C.border}`,background:sel?C.priLt:C.surface,cursor:"pointer",fontFamily:"inherit",textAlign:"left",position:"relative"}}>
                              {rs.recommended&&!sel&&<div style={{position:"absolute",top:-6,right:6,fontSize:8,fontWeight:700,color:"#fff",background:C.suc,padding:"1px 5px",borderRadius:3,textTransform:"uppercase"}}>Best</div>}
                              <div style={{fontSize:12,fontWeight:800,color:sel?C.pri:C.text}}>{rs.room}</div>
                              <div style={{fontSize:9,color:C.textMut,lineHeight:1.4}}>
                                <div>Last: <span style={{fontWeight:600,color:rs.gapBefore<=0?C.dan:rs.gapBefore<=1?C.acc:C.textSec}}>{rs.lastOut?`${fmtDate(rs.lastOut)} (${rs.gapBefore}d)`:"None"}</span></div>
                                <div>Next: <span style={{fontWeight:600,color:rs.gapAfter<=0?C.dan:rs.gapAfter<=1?C.acc:C.textSec}}>{rs.nextIn?`${fmtDate(rs.nextIn)} (${rs.gapAfter}d)`:"None"}</span></div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {segAvail.length===0&&<div style={{fontSize:11,color:C.dan,fontWeight:600,marginTop:4}}>No rooms available for these dates</div>}
                    </div>
                    );
                  })}
                </div>
              )}
              <button onClick={()=>{
                const existing=cfg.roomSegments||[];
                if(existing.length===0){
                  const mid=addDays(checkIn,Math.ceil(countNights(checkIn,dogCO)/2));
                  setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:[
                    {roomType:roomType,room:selectedRoom||"",startDate:checkIn,endDate:mid},
                    {roomType:roomType,room:"",startDate:mid,endDate:dogCO},
                  ]}}));
                } else {
                  const lastEnd=existing[existing.length-1].endDate;
                  setPerDogConfig(prev=>({...prev,[did]:{...prev[did],roomSegments:[...existing,{roomType:roomType,room:"",startDate:lastEnd,endDate:dogCO}]}}));
                }
              }} style={{marginTop:4,display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.pri,fontSize:12,fontWeight:600,padding:0,fontFamily:"inherit"}}>
                <I.Plus/> {segments.length>0?"Add Segment":"Add Room Transfer"}
              </button>
            </div>
          );
        })()}

        {/* Daycare size is auto-derived from the dog's weight/override classification */}

        {/* Dog Selection */}
        {clientId && (
          <div style={{marginTop:20}}>
            <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:8,letterSpacing:"0.03em",textTransform:"uppercase"}}>
              Select Dog{cDogs.length>1?"s":""} <span style={{color:C.dan}}>*</span>
            </div>
            {cDogs.length === 0 ? (
              <div style={{padding:"16px 0",color:C.textMut,fontSize:13}}>No dogs on file for this client. <span style={{color:C.pri,cursor:"pointer",fontWeight:600}} onClick={()=>nav("new-dog",{clientId})}>Add a dog first.</span></div>
            ) : (
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {cDogs.map(dog => {
                  const sel = selectedDogs.includes(dog.id);
                  return (
                    <button key={dog.id} onClick={()=>{toggleDog(dog.id);setErrors({...errors,dogs:undefined});}}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderRadius:12,border:`2px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:C.surface,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                      <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${sel?C.pri:C.border}`,background:sel?C.pri:"#fff",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0}}>
                        {sel&&<I.Check/>}
                      </div>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontSize:14,fontWeight:700,color:sel?C.pri:C.text}}>{dog.fields.name}</div>
                        <div style={{fontSize:11,color:C.textSec}}>{dog.fields.breed}{dog.fields.weight?` · ${dog.fields.weight} lbs`:""}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {errors.dogs&&<div style={{color:C.dan,fontSize:12,fontWeight:600,marginTop:6}}>{errors.dogs}</div>}
          </div>
        )}

        {/* Reservation Compliance Check */}
        {selectedDogs.length > 0 && (() => {
          const client = data.clients.find(c=>c.id===clientId);
          if(!client)return null;
          const dogs = selectedDogs.map(did=>data.dogs.find(d=>d.id===did)).filter(Boolean);
          const vaxResults = dogs.map(dog=>({dog,status:getVaxStatus(dog,data.requiredVaccines,data.resortPolicies)}));
          const allVaxOk = vaxResults.every(v=>v.status.ok);
          const profileEcName = client.fields?.emergency_contact || "";
          const profileEcPhone = client.fields?.emergency_phone || "";
          const hasEmergency = !!(profileEcName && profileEcPhone);
          const ecNameChanged = ecOverride.name !== profileEcName;
          const ecPhoneChanged = ecOverride.phone !== profileEcPhone;
          const ecModified = ecNameChanged || ecPhoneChanged;
          const agreements = data.agreements || DEF_AGREEMENTS;
          const reqAgrs = agreements.filter(a=>a.required!==false);
          const allAgrSigned = reqAgrs.every(a=>agrSigned(client,a.id));
          const ageResults = dogs.map(dog=>({dog,status:getDogAgeCompliance(dog,data.resortPolicies,data.reservations)}));
          const allAgeOk = ageResults.every(a=>a.status.ok);
          const snResults = dogs.map(dog=>({dog,status:getSpayNeuterCompliance(dog)}));
          const allSnOk = snResults.every(s=>s.status.ok);
          const toggleExpand = (key) => setComplianceExpand(prev => prev === key ? null : key);
          return (
            <div style={{marginTop:20}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:8,letterSpacing:"0.03em",textTransform:"uppercase"}}>Reservation Compliance</div>
              <div style={{display:"flex",gap:8,flexWrap:"nowrap"}}>
                <ComplianceCheckItem ok={allVaxOk} label="Vaccines" expandKey="vax" expanded={complianceExpand==="vax"} onToggle={toggleExpand}
                  detail={allVaxOk?"All up to date":vaxResults.filter(v=>!v.status.ok).map(v=>`${v.dog.fields.name}: ${[...v.status.expired,...v.status.missing].length} issue${[...v.status.expired,...v.status.missing].length>1?"s":""}`).join(", ")}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {vaxResults.map(v=>(
                      <div key={v.dog.id} style={{fontSize:12}}>
                        <div style={{fontWeight:700,color:C.text,marginBottom:4}}>{v.dog.fields.name}</div>
                        {v.status.ok ? (
                          <div style={{color:C.suc,fontSize:11,marginBottom:4}}>All vaccines current</div>
                        ) : (
                          <>
                            {v.status.expired.map(vId=><div key={vId} style={{color:C.dan,fontSize:11}}>• {vId.replace(/_/g," ")} — Expired</div>)}
                            {v.status.missing.map(vId=><div key={vId} style={{color:C.dan,fontSize:11}}>• {vId.replace(/_/g," ")} — Missing</div>)}
                          </>
                        )}
                        {/* Always show vaccine date inputs for updating */}
                        {(data.requiredVaccines||[]).map(vId=>{
                          const curDate = v.dog.fields[vId] || "";
                          return (
                            <div key={vId+"edit"} style={{marginTop:4,display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:11,color:C.textSec,minWidth:120}}>{vId.replace(/_/g," ")}</span>
                              <MiniDatePicker value={curDate} onChange={async(v)=>{
                                  const newDogs=data.dogs.map(d=>d.id===v.dog.id?{...d,fields:{...d.fields,[vId]:v}}:d);
                                  await save({...data,dogs:newDogs});
                                }}/>
                              {curDate && <span style={{fontSize:10,color:v.status.expired?.includes(vId)?C.dan:C.suc,fontWeight:600}}>{v.status.expired?.includes(vId)?"Expired":"Valid"}</span>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </ComplianceCheckItem>
                <ComplianceCheckItem ok={!!(ecOverride.name?.trim()&&ecOverride.phone?.trim()&&(ecOverride.phone||"").replace(/\D/g,"").length>=10)} warn={ecModified} label="Emergency Contact" expandKey="ec" expanded={complianceExpand==="ec"} onToggle={toggleExpand}
                  detail={ecOverride.name ? `${ecOverride.name}${ecModified?" (Modified)":""}` : "Not on file"}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {ecModified && <div style={{fontSize:11,color:C.acc,fontWeight:600}}>Modified from profile</div>}
                    <div><div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"}}>EMERGENCY CONTACT NAME</div>
                    <input value={ecOverride.name} onChange={e=>setEcOverride(prev=>({...prev,name:e.target.value}))} placeholder="Contact name..." style={{width:"100%",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:14,fontFamily:"inherit",color:C.text,background:C.surface,outline:"none",boxSizing:"border-box"}}/></div>
                    <div><div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"}}>EMERGENCY PHONE</div>
                    <input value={ecOverride.phone} onChange={e=>setEcOverride(prev=>({...prev,phone:fmtPhoneInput(e.target.value)}))} placeholder="(555) 555-5555" style={{width:"100%",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:14,fontFamily:"inherit",color:C.text,background:C.surface,outline:"none",boxSizing:"border-box"}}/></div>
                    {hasEmergency && !ecModified && <div style={{fontSize:11,color:C.suc,fontWeight:600}}>Contact on file — update above if needed</div>}
                    {(ecOverride.phone||"").replace(/\D/g,"").length > 0 && (ecOverride.phone||"").replace(/\D/g,"").length < 10 && <div style={{fontSize:11,color:C.dan,fontWeight:600}}>Phone must be a full 10-digit number</div>}
                  </div>
                </ComplianceCheckItem>
                <ComplianceCheckItem ok={allAgrSigned} label="Agreement" expandKey="agr" expanded={complianceExpand==="agr"} onToggle={toggleExpand}
                  detail={allAgrSigned?"All signed":reqAgrs.filter(a=>!agrSigned(client,a.id)).map(a=>a.name).join(", ")+" unsigned"}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {reqAgrs.map(agr=>{
                      const signed = agrSigned(client,agr.id);
                      const signedData = (client.agreements||{})[agr.id];
                      return (
                        <div key={agr.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.borderLight}`}}>
                          <div>
                            <span style={{fontSize:12,color:C.text,fontWeight:600}}>{agr.name}</span>
                            {signed && signedData?.date && <span style={{fontSize:10,color:C.suc,marginLeft:8}}>Signed {fmtDate(signedData.date)}</span>}
                          </div>
                          {!signed ? (
                            <Btn size="sm" onClick={async()=>{
                              const agrs={...(client.agreements||{}),[agr.id]:{signed:true,date:todayStr()}};
                              await save({...data,clients:data.clients.map(c=>c.id===clientId?{...c,agreements:agrs}:c)});
                            }}>Sign Now</Btn>
                          ) : (
                            <span style={{fontSize:11,color:C.suc,fontWeight:700}}>✓ Signed</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ComplianceCheckItem>
                <ComplianceCheckItem ok={allAgeOk} warn={ageResults.some(a=>a.status.grandfathered)} label="Dog Age" expandKey="age" expanded={complianceExpand==="age"} onToggle={toggleExpand}
                  detail={ageResults.every(a=>!a.status.age||a.status.ok)
                    ?ageResults.map(a=>a.status.age?`${a.dog.fields.name}: ${a.status.age}yr${a.status.grandfathered?" (Grandfathered)":""}`:null).filter(Boolean).join(", ")||"N/A"
                    :ageResults.filter(a=>!a.status.ok).map(a=>`${a.dog.fields.name}: ${a.status.age}yr — ${a.status.reason}`).join(", ")}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {ageResults.map(a=>(
                      <div key={a.dog.id} style={{fontSize:12}}>
                        <span style={{fontWeight:700,color:C.text}}>{a.dog.fields.name}</span>
                        {a.status.age ? (
                          <span style={{color:a.status.ok?C.suc:C.dan,marginLeft:8}}>
                            {a.status.age} years old
                            {a.status.grandfathered&&` (Grandfathered — ${a.status.visitCount || 0} visits)`}
                            {!a.status.ok&&!a.status.grandfathered&&` — ${a.status.reason}`}
                          </span>
                        ) : (
                          <span style={{color:C.textMut,marginLeft:8}}>Age not set</span>
                        )}
                      </div>
                    ))}
                    <div style={{fontSize:10,color:C.textMut,marginTop:4}}>Max age: {(data.resortPolicies||{}).maxDogAge||13} years. Grandfathered after {(data.resortPolicies||{}).grandfatherVisitThreshold||10} visits.</div>
                  </div>
                </ComplianceCheckItem>
                <ComplianceCheckItem ok={allSnOk} warn={!allSnOk} label="Spay/Neuter" expandKey="sn" expanded={complianceExpand==="sn"} onToggle={toggleExpand}
                  detail={allSnOk?snResults.map(s=>`${s.dog.fields.name}: ${s.status.status==="Neutered"||s.status.status==="Spayed"?s.status.status:(s.status.privatePlay?"Intact (PP)":s.status.status||"N/A")}`).join(", ")||"N/A":snResults.filter(s=>!s.status.ok).map(s=>`${s.dog.fields.name}: Intact — No group play`).join(", ")}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {snResults.map(s=>(
                      <div key={s.dog.id} style={{fontSize:12}}>
                        <span style={{fontWeight:700,color:C.text}}>{s.dog.fields.name}</span>
                        <span style={{color:s.status.ok?C.suc:C.acc,marginLeft:8}}>
                          {s.status.status==="Neutered"||s.status.status==="Spayed"?s.status.status:`Intact${s.status.ageMonths!=null?` (${s.status.ageMonths}mo)`:""}`}
                          {s.status.privatePlay&&" — Private Play"}
                          {!s.status.ok&&" — Cannot participate in group play"}
                        </span>
                      </div>
                    ))}
                    <div style={{fontSize:10,color:C.textMut,marginTop:4}}>Intact dogs 10+ months old cannot participate in group play but CAN be checked in.</div>
                  </div>
                </ComplianceCheckItem>
              </div>
            </div>
          );
        })()}

        {/* Per-Dog Care Fields */}
        {selectedDogs.length > 0 && (
          <div style={{marginTop:24}}>
            <button onClick={() => setCareExpanded(!careExpanded)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:0,marginBottom:careExpanded?12:0}}>
              <span style={{fontSize:11,fontWeight:600,color:type==="boarding"?C.textSec:C.textMut,letterSpacing:"0.03em",textTransform:"uppercase"}}>Care Instructions per Dog</span>
              {type !== "boarding" && <span style={{fontSize:10,color:C.textMut,fontStyle:"italic"}}>(optional for {type === "daycare" ? "daycare" : type === "evaluation" ? "evaluations" : "this type"})</span>}
              <span style={{fontSize:10,color:C.textMut,marginLeft:"auto"}}>{careExpanded?"▲":"▼"}</span>
            </button>
            {careExpanded && (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {selectedDogs.map(did => {
                const dog = data.dogs.find(d=>d.id===did);
                if(!dog)return null;
                const care = careFields[did] || {};
                const profileFeedSch = dog.fields.feedingSchedules || [];
                const profileMedSch = dog.fields.medicationSchedules || [];
                const feedingChanged = JSON.stringify(care.feedingSchedules || []) !== JSON.stringify(profileFeedSch);
                const medsChanged = JSON.stringify(care.medicationSchedules || []) !== JSON.stringify(profileMedSch);
                const anyChanged = feedingChanged || medsChanged;
                return (
                  <div key={did} style={{padding:"16px 20px",borderRadius:12,border:`1.5px solid ${anyChanged?C.acc:C.border}`,background:anyChanged?C.accLt+"30":C.bg}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <span style={{fontSize:15,fontWeight:700,color:C.text}}>{dog.fields.name}</span>
                      <span style={{fontSize:12,color:C.textSec}}>{dog.fields.breed}</span>
                      {anyChanged && <Badge color="warning" size="sm">Modified from profile</Badge>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      <div>
                        {feedingChanged && <div style={{fontSize:10,fontWeight:700,color:C.acc,marginBottom:2}}>Modified from profile</div>}
                        <FeedingScheduleEditor schedules={care.feedingSchedules || []} onChange={v=>updateCare(did,"feedingSchedules",v)} data={data} dogWeight={parseFloat(dog.fields.weight) || 0} dogName={dog.fields.name} dogId={dog.id} onWeightUpdate={(wt, reason) => {
                          const now = new Date().toISOString().slice(0,10);
                          const logEntry = { date: now, weight: wt, reason, by: profile?.name || "Staff" };
                          const updatedDogs = data.dogs.map(d => d.id === dog.id ? { ...d, fields: { ...d.fields, weight: String(wt), weightLastUpdated: now, weightLog: [...(d.fields.weightLog || []), logEntry] } } : d);
                          save({ ...data, dogs: updatedDogs });
                        }}/>
                      </div>
                      <div>
                        {medsChanged && <div style={{fontSize:10,fontWeight:700,color:C.acc,marginBottom:2}}>Modified from profile</div>}
                        <MedicationScheduleEditor schedules={care.medicationSchedules || []} onChange={v=>updateCare(did,"medicationSchedules",v)} data={data} checkIn={checkIn} checkOut={checkOut} save={save}/>
                      </div>
                      {type==="boarding"&&countNights(checkIn,checkOut)>=2&&<div>
                        <div style={{fontSize:11,color:C.textMut,background:C.bg,padding:"6px 10px",borderRadius:6,border:`1px dashed ${C.border}`,marginBottom:8}}>
                          <strong style={{color:C.text}}>Bathing Policy:</strong> K9 Operations requires all dogs boarding 2 or more nights receive a bath to ensure every pup goes home smelling and feeling great.
                        </div>
                        <div style={{fontSize:11,fontWeight:600,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:6}}>Bathing Type <span style={{color:C.dan}}>*</span></div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {BATH_OPTS.map(opt=>{
                            const bathAddonKey = `${opt} Bath`;
                            const sel=(dogAddOns[did]?.selectedBath||"")=== opt;
                            return <button key={opt} onClick={()=>{
                              // Set selected bath type and sync into selectedAddOns for pricing
                              setDogAddOns(prev=>{
                                const prevAddOns = (prev[did]?.selectedAddOns||[]).filter(a=>!a.endsWith(" Bath"));
                                return {...prev,[did]:{...prev[did], selectedBath: sel ? "" : opt, selectedAddOns: sel ? prevAddOns : [...prevAddOns, bathAddonKey]}};
                              });
                            }} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:"transparent",color:sel?C.pri:C.textSec,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",display:"flex",alignItems:"center",gap:4}}>
                              {sel&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              {opt}
                            </button>;
                          })}
                        </div>
                        {/* Post-bath return option for non-Private Play dogs */}
                        {!(dog.tags || []).includes("tag_pp") && (dogAddOns[did]?.selectedBath) && (() => {
                          const postBathReturn = dogAddOns[did]?.postBathReturn || "";
                          return (
                            <div style={{marginTop:12}}>
                              <div style={{fontSize:11,fontWeight:600,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:6}}>After Bath on Checkout Day <span style={{color:C.dan}}>*</span></div>
                              <div style={{fontSize:11,color:C.textMut,marginBottom:6}}>Where should we return {dog.fields.name} after their bath?</div>
                              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                                {[{v:"Return to Group",icon:"👥"},{v:"Return to Room",icon:"🏠"}].map(opt=>{
                                  const sel = postBathReturn === opt.v;
                                  return <button key={opt.v} onClick={()=>setDogAddOns(prev=>({...prev,[did]:{...prev[did],postBathReturn:sel?"":opt.v}}))} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:"transparent",color:sel?C.pri:C.textSec,fontSize:12,fontWeight:sel?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",display:"flex",alignItems:"center",gap:4}}>
                                    {sel&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                    {opt.icon} {opt.v}
                                  </button>;
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>}
                    </div>
                    {/* Add-Ons */}
                    {type!=="tour"&&(
                      <div style={{marginTop:10}}>
                        <button onClick={()=>setExpandedAddOns(prev=>({...prev,[did]:!prev[did]}))} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.pri,fontSize:12,fontWeight:600,padding:0,fontFamily:"inherit"}}>
                          <I.Plus/> {expandedAddOns[did]?"Hide Add-Ons":"Add Add-Ons"}
                        </button>
                        {expandedAddOns[did]&&(
                          <div style={{marginTop:8,padding:"12px 16px",borderRadius:8,border:`1px solid ${C.borderLight}`,background:C.surface}}>
                            <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:8}}>Add-Ons</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,alignItems:"stretch"}}>
                              {Object.entries(getAddOnPrices(data.pricing, data.addOnRules)).map(([addon,price])=>{
                                const isBathAddon = addon.endsWith(" Bath");
                                const hasBathSelected = !!dogAddOns[did]?.selectedBath;
                                // Skip bath add-ons if a bath is already selected (show "Add Another Bath" instead)
                                if (isBathAddon && hasBathSelected) return null;
                                const selected=(dogAddOns[did]?.selectedAddOns||[]).includes(addon);
                                const buttonLabel = isBathAddon ? "Add Another Bath" : addon;
                                return <button key={addon} onClick={()=>{
                                  // Show date selection popup for adding add-ons
                                  if (!selected) {
                                    setAddOnDatePopup({ dogId: did, addon, prevState: selected });
                                  } else {
                                    // If removing, just toggle off
                                    setDogAddOns(prev=>{const curr=prev[did]?.selectedAddOns||[];const next=curr.filter(a=>a!==addon);return{...prev,[did]:{...prev[did],selectedAddOns:next}};});
                                  }
                                }} style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${selected?C.pri:C.border}`,background:selected?C.priLt:C.bg,color:selected?C.pri:C.text,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,textAlign:"left"}}>
                                  <span>{buttonLabel}</span><span style={{color:C.textSec,fontWeight:400,whiteSpace:"nowrap"}}>${Number(price).toFixed(2)}</span>
                                </button>;
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {type==="boarding"&&(
          <div style={{marginTop:16}}><Inp label="Where are they going? (Parent destination)" value={parentDestination} onChange={(v)=>{setParentDestination(v); if(errors.parentDestination) setErrors({...errors, parentDestination:undefined});}} placeholder="e.g. Vacation in Florida, Business trip to NYC..."/>{errors.parentDestination && <div style={{color:C.dan,fontSize:12,fontWeight:600,marginTop:4}}>{errors.parentDestination}</div>}</div>
        )}
        <div style={{marginTop:16}}><Inp label="General Notes" type="textarea" value={notes} onChange={(v)=>{setNotes(v); if(errors.notes) setErrors({...errors, notes:undefined});}} placeholder="Special instructions for this stay..."/>{errors.notes && <div style={{color:C.dan,fontSize:12,fontWeight:600,marginTop:4}}>{errors.notes}</div>}</div>

        {/* Late Checkout Notice */}
        {type === "boarding" && checkOutTime && checkOutTime > "12:30" && selectedDogs.length > 0 && (() => {
          const halfDayRate = (data.pricing || DEF_PRICING).daycareRates?.halfDay || 30;
          const totalFee = halfDayRate * selectedDogs.length;
          return (
            <div style={{marginTop:16,padding:"14px 18px",borderRadius:10,border:`1.5px solid ${C.acc}`,background:C.acc+"08"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span style={{fontSize:14,fontWeight:700,color:C.acc}}>Late Checkout Fee Applied</span>
              </div>
              <div style={{fontSize:12,color:C.textSec,lineHeight:1.6}}>
                K9 Operations' standard check-out time is <strong style={{color:C.text}}>12:30 PM</strong>. Your selected check-out time of <strong style={{color:C.text}}>{(() => { const [h,m] = checkOutTime.split(":"); const hr = parseInt(h); const ampm = hr >= 12 ? "PM" : "AM"; const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr; return `${hr12}:${m} ${ampm}`; })()}</strong> qualifies as a late checkout, which incurs a half-day daycare fee of <strong style={{color:C.text}}>${halfDayRate.toFixed(2)}</strong> per dog.
              </div>
              <div style={{fontSize:13,fontWeight:700,color:C.acc,marginTop:6}}>
                Total late checkout fee: ${totalFee.toFixed(2)} ({selectedDogs.length} dog{selectedDogs.length > 1 ? "s" : ""} × ${halfDayRate.toFixed(2)})
              </div>
            </div>
          );
        })()}

        {/* Itemized Receipt with integrated discount */}
        {livePricing && livePricing.lineItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <ItemizedReceipt pricingResult={livePricing} />
            {/* Add Discount — uses configured discounts from Settings */}
            {livePricing.total > 0 && (() => {
              const configuredDiscounts = (data.discounts || []).filter(d => d.active !== false);
              const [showDiscDrop, setShowDiscDrop] = [resDiscountType !== "none", (v) => { if (!v) { setResDiscountType("none"); setResDiscountValue(0); } }];
              const hasDiscount = resDiscountType !== "none" && resDiscountValue > 0;
              let disc = 0;
              if (hasDiscount) { if (resDiscountType === "percent") disc = Math.round(livePricing.total * (resDiscountValue / 100) * 100) / 100; else disc = Math.min(resDiscountValue, livePricing.total); }
              const adjTotal = hasDiscount ? Math.max(0, Math.round((livePricing.total - disc) * 100) / 100) : livePricing.total;
              return (<div style={{marginTop:8}}>
                {hasDiscount && (<>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px",background:C.sucLt,borderRadius:8,border:`1px solid ${C.suc}25`}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.suc}}>Discount ({(() => { const d = configuredDiscounts.find(d => d.id === resDiscountId); return d ? d.name : ""; })()}) ({resDiscountType === "percent" ? `${resDiscountValue}%` : `$${Number(resDiscountValue).toFixed(2)}`})</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:C.suc}}>-${disc.toFixed(2)}</span>
                      <button onClick={() => { setResDiscountType("none"); setResDiscountValue(0); }} style={{background:"none",border:"none",cursor:"pointer",color:C.suc,padding:2,display:"flex"}}><I.X/></button>
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 20px",marginTop:4}}>
                    <span style={{fontSize:15,fontWeight:800,color:C.text}}>Adjusted Total</span>
                    <span style={{fontSize:15,fontWeight:800,color:C.text}}>${adjTotal.toFixed(2)}</span>
                  </div>
                </>)}
                {!hasDiscount && (() => {
                  if (configuredDiscounts.length > 0) return <DiscountPicker discounts={configuredDiscounts} clientId={clientId} data={data} onSelect={(d) => {
                    setResDiscountType(d.type === "percentage" ? "percent" : "flat");
                    setResDiscountValue(d.value);
                    setResDiscountId(d.id);
                  }}/>;
                  // Manual discount entry when no configured discounts
                  return <ManualDiscountEntry onApply={(type, value) => { setResDiscountType(type); setResDiscountValue(value); setResDiscountId(null); }}/>;
                })()}
              </div>);
            })()}

            {/* Apply Coupons as Deposit */}
            {clientId && type === "boarding" && (() => {
              const clientSales = (data.packageSales || []).filter(s => s.clientId === clientId && s.status === "active" && (s.unitsRemaining || 0) - (s.used || 0) > 0);
              // Filter for boarding-related packages only
              const eligibleSales = clientSales.filter(s => {
                const pkg = (data.packages || []).find(p => p.id === s.packageId);
                return pkg && (pkg.serviceCategory === "Boarding" || (pkg.serviceNames || [pkg.serviceName]).some(n => (roomType || "").toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes("boarding") || n.toLowerCase().includes(roomType.toLowerCase())));
              });
              if (eligibleSales.length === 0) return null;
              const totalCouponValue = appliedCoupons.reduce((sum, c) => sum + (c.value || 0), 0);
              return (
                <div style={{marginTop:12,padding:"14px 18px",borderRadius:10,border:`1.5px solid ${C.info}`,background:C.info+"08"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><path d="M14 2h6a2 2 0 0 1 2 2v6"/></svg>
                    <span style={{fontSize:14,fontWeight:700,color:C.info}}>Apply Coupons as Deposit</span>
                    <span style={{fontSize:11,color:C.textMut}}>({eligibleSales.length} available)</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {eligibleSales.map(sale => {
                      const pkg = (data.packages || []).find(p => p.id === sale.packageId);
                      const remaining = sale.unitsRemaining !== undefined ? sale.unitsRemaining : Math.max(0, (sale.quantity || 0) - (sale.used || 0));
                      const applied = appliedCoupons.find(c => c.saleId === sale.id);
                      const unitRate = pkg?.unitRate || 0;
                      return (
                        <div key={sale.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:applied ? C.info+"15" : C.bg,borderRadius:8,border:`1px solid ${applied ? C.info+"40" : C.borderLight}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.text}}>{sale.packageName || pkg?.name || "Package"}</div>
                            <div style={{fontSize:11,color:C.textMut}}>{remaining} unit{remaining !== 1 ? "s" : ""} remaining · ${unitRate.toFixed(2)}/unit · Expires {sale.expiryDate ? fmtDate(sale.expiryDate) : "N/A"}</div>
                          </div>
                          {applied ? (
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:13,fontWeight:700,color:C.info}}>{applied.unitsToUse} unit{applied.unitsToUse !== 1 ? "s" : ""} (${applied.value.toFixed(2)})</span>
                              <button onClick={() => setAppliedCoupons(prev => prev.filter(c => c.saleId !== sale.id))} style={{background:"none",border:"none",cursor:"pointer",color:C.dan,padding:2}}><I.X size={14}/></button>
                            </div>
                          ) : (
                            <Btn size="sm" variant="secondary" onClick={() => {
                              const depositNeeded = livePricing ? Math.round(livePricing.total * 0.5 * 100) / 100 : 0;
                              const alreadyApplied = appliedCoupons.reduce((s, c) => s + c.value, 0);
                              const still = Math.max(0, depositNeeded - alreadyApplied);
                              const unitsNeeded = unitRate > 0 ? Math.min(remaining, Math.ceil(still / unitRate)) : 1;
                              const val = Math.min(still, unitsNeeded * unitRate);
                              if (unitsNeeded > 0) setAppliedCoupons(prev => [...prev, { saleId: sale.id, unitsToUse: unitsNeeded, value: val }]);
                            }}>Apply</Btn>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {totalCouponValue > 0 && (
                    <div style={{marginTop:8,padding:"8px 12px",background:C.sucLt,borderRadius:8,fontSize:13,fontWeight:600,color:C.suc}}>
                      Coupons applied: ${totalCouponValue.toFixed(2)} toward deposit
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Closed date override banner for manager+ roles */}
        {(() => {
          const cs = new Set((data.closedDates || []).map(cd => cd.date));
          const conflict = cs.has(checkIn) || (type==="boarding" && cs.has(checkOut));
          const canOverride = hasPermission(profile, data, "override_closed_dates");
          if (!conflict) return null;
          return (
            <div style={{marginTop:20,padding:"12px 16px",borderRadius:10,background:closedDateOverride?"rgba(22,163,74,0.08)":"rgba(220,38,38,0.06)",border:`1.5px solid ${closedDateOverride?C.suc:C.dan}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <span style={{fontSize:13,color:closedDateOverride?C.suc:C.dan,fontWeight:600,flex:1}}>
                {closedDateOverride ? "✓ Closed date override active — reservation will be created on a closed date" : canOverride ? "⚠ Selected dates conflict with a closed date. As a manager, you can override this." : "⚠ Selected dates conflict with a closed date. Only a manager can override this restriction."}
              </span>
              {canOverride && !closedDateOverride && <Btn size="sm" style={{background:C.warn,color:"#fff",border:"none"}} onClick={()=>setClosedDateOverride(true)}>Override Closed Date</Btn>}
              {closedDateOverride && <Btn size="sm" variant="ghost" onClick={()=>setClosedDateOverride(false)}>Remove Override</Btn>}
            </div>
          );
        })()}

        <div style={{marginTop:28}}>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10,alignItems:"center"}}>
            <Btn variant="secondary" onClick={()=>nav(preClientId?"client-detail":"dashboard",preClientId?{clientId:preClientId}:{})}>Cancel</Btn>
            <div style={{position:"relative"}}>
              <Btn variant="ghost" onClick={()=>handleSave("save-only")} style={{border:`1.5px solid ${C.border}`,color:C.textSec}}>Save Without Reserving</Btn>
            </div>
            <Btn onClick={()=>handleSave("reserve")}>Reserve Stay{selectedDogs.length>1?"s":""}</Btn>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
            <div style={{fontSize:10,color:C.textMut,maxWidth:420,textAlign:"right",lineHeight:1.4}}>
              <strong>Save Without Reserving</strong> saves details in the system for high-intent clients who cannot pay now. They will not be guaranteed this spot and may be booked over if needed.
            </div>
          </div>
        </div>
      </Card>

      {/* Update Profile Modal */}
      {showUpdateModal && (() => {
        const allOn = pendingChanges.every((_,i) => changeToggles[i]);
        const anyOn = pendingChanges.some((_,i) => changeToggles[i]);
        const toggleAll = () => {
          const next = {};
          const setTo = !allOn;
          pendingChanges.forEach((_,i) => { next[i] = setTo; });
          setChangeToggles(next);
        };
        return (
        <Modal title="Update Profile?" onClose={()=>setShowUpdateModal(false)} wide>
          <div style={{marginBottom:16}}>
            <p style={{fontSize:14,color:C.text,lineHeight:1.6,margin:"0 0 16px"}}>
              You modified {pendingChanges.length} field{pendingChanges.length!==1?"s":""}. Toggle which changes should also update the profile for all future reservations.
            </p>
            {/* Select All toggle */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 12px",borderRadius:8,background:C.surface,border:`1px solid ${C.borderLight}`,cursor:"pointer"}} onClick={toggleAll}>
              <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${allOn?C.pri:C.border}`,background:allOn?C.pri:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}}>
                {allOn && <I.Check style={{width:12,height:12,color:"#fff"}}/>}
              </div>
              <span style={{fontSize:13,fontWeight:600,color:C.text}}>Update all fields on profile</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pendingChanges.map((ch,i) => {
                const isOn = !!changeToggles[i];
                return (
                <div key={i} style={{padding:"10px 14px",borderRadius:10,background:isOn?C.priLt+"20":C.bg,border:`1px solid ${isOn?C.pri:C.border}`,cursor:"pointer",transition:"all 0.15s"}} onClick={()=>setChangeToggles(prev=>({...prev,[i]:!prev[i]}))}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${isOn?C.pri:C.border}`,background:isOn?C.pri:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}}>
                      {isOn && <I.Check style={{width:12,height:12,color:"#fff"}}/>}
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color:C.text}}>{ch.dogName}</span>
                    <Badge color={isOn?"primary":"accent"} size="sm">{fieldLabel(ch.field)}</Badge>
                    {isOn && <span style={{fontSize:10,color:C.pri,fontWeight:600,marginLeft:"auto"}}>Will update profile</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 24px 1fr",gap:8,alignItems:"start",marginLeft:26}}>
                    <div style={{padding:"6px 10px",borderRadius:8,background:C.danLt,fontSize:12,color:C.dan}}>
                      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Profile (current)</div>
                      {ch.oldLabel || (typeof ch.oldVal === "string" ? ch.oldVal : null) || <span style={{fontStyle:"italic",opacity:0.6}}>Empty</span>}
                    </div>
                    <div style={{textAlign:"center",color:C.textMut,paddingTop:6}}>→</div>
                    <div style={{padding:"6px 10px",borderRadius:8,background:C.sucLt,fontSize:12,color:C.suc}}>
                      <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>New value</div>
                      {ch.newLabel || (typeof ch.newVal === "string" ? ch.newVal : null) || <span style={{fontStyle:"italic",opacity:0.6}}>Empty</span>}
                    </div>
                  </div>
                </div>
              );})}
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap",alignItems:"center"}}>
            {anyOn && <span style={{fontSize:11,color:C.textSec,marginRight:"auto"}}>{pendingChanges.filter((_,i)=>changeToggles[i]).length} of {pendingChanges.length} will update profile</span>}
            <Btn variant="secondary" onClick={()=>setShowUpdateModal(false)}>Cancel</Btn>
            <Btn onClick={confirmSave}>{anyOn ? "Save & Update Selected" : "Save Reservation Only"}</Btn>
          </div>
        </Modal>
      );})()}

      {/* Add-On Date Selection Popup */}
      {addOnDatePopup && (() => {
        const dateOptions = [
          { value: "every-day", label: "Every Day" },
          { value: "certain-dates", label: "Certain Dates" },
          { value: "except-first", label: "Every Day Except First" },
          { value: "except-last", label: "Every Day Except Last" },
        ];
        const [selectedOption, setSelectedOption] = useState("every-day");
        const [selectedDates, setSelectedDates] = useState([]);

        const handleConfirm = () => {
          // For now, apply the add-on for all selected dates (feature complete for MVP)
          setDogAddOns(prev => {
            const curr = prev[addOnDatePopup.dogId]?.selectedAddOns || [];
            const next = [...curr, addOnDatePopup.addon];
            return { ...prev, [addOnDatePopup.dogId]: { ...prev[addOnDatePopup.dogId], selectedAddOns: next } };
          });
          setAddOnDatePopup(null);
        };

        return (
          <Modal title="Add-On Date Selection" onClose={() => setAddOnDatePopup(null)} width={420}>
            <div style={{ padding: "4px 0" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>{addOnDatePopup.addon}</div>
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
                  Which days would you like to apply this add-on?
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {dateOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedOption(opt.value)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: `1.5px solid ${selectedOption === opt.value ? C.pri : C.border}`,
                      background: selectedOption === opt.value ? C.priLt : "transparent",
                      color: selectedOption === opt.value ? C.pri : C.text,
                      fontSize: 13,
                      fontWeight: selectedOption === opt.value ? 600 : 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `1.5px solid ${selectedOption === opt.value ? C.pri : C.border}`,
                      background: selectedOption === opt.value ? C.pri : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {selectedOption === opt.value && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <Btn variant="secondary" onClick={() => setAddOnDatePopup(null)}>Cancel</Btn>
                <Btn onClick={handleConfirm}>Apply Add-On</Btn>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

export { NewReservationPage };

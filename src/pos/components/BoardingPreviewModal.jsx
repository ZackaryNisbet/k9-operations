import { Badge, Btn, Inp, MiniDatePicker, Modal, fmtPhoneInput } from "./ui";
import { C } from "../constants/colors";
import { ComplianceCheckItem } from "./ComplianceCheckItem";
import { DEF_AGREEMENTS } from "../constants/forms";
import { DEF_EOD_TEMPLATE } from "../constants/operations";
import { DEF_PRICING } from "../constants/pricing";
import { DiscountPicker } from "./DiscountPicker";
import { FeedMedBreakdown, buildAuditEntry } from "./widgets";
import { FeedingScheduleEditor } from "./FeedingScheduleEditor";
import { I } from "../icons";
import { ManualDiscountEntry } from "./ManualDiscountEntry";
import { MedicationScheduleEditor } from "./MedicationScheduleEditor";
import { VACCINES } from "../constants/vaccines";
import { agrSigned } from "../lib/agreements";
import { calcReservationPricing, countNights, getAddOnPrices } from "../lib/pricing";
import { fmtDate, fmtInstr, gid, summarizeFeeding, summarizeMeds, todayStr } from "../lib/format";
import { getDogAgeCompliance, getSpayNeuterCompliance } from "../lib/dogHelpers";
import { getVaxStatus } from "../lib/vaccines";
import { useEffect, useRef, useState } from "react";
import { uuid } from "../lib/ids";

function BoardingPreviewModal({ reservation, dog, client, isCheckInMode, isCheckOutMode, onClose, onSave, data, save, profile, nav }) {
  // Profile defaults
  const profileFeeding = summarizeFeeding(dog.fields.feedingSchedules) || "";
  const profileMeds = summarizeMeds(dog.fields.medicationSchedules) || "";
  const profileBath = dog.fields.bath_type || "";
  const clientEcName = client.fields.emergency_contact || "";
  const clientEcPhone = client.fields.emergency_phone || "";

  // Local state — initialized from careOverrides (if set) else profile
  const [activeTab, setActiveTab] = useState("overview");
  const [complianceExpand, setComplianceExpand] = useState(null);
  const [parentDest, setParentDest] = useState(reservation.parentDestination || "");
  const [belongings, setBelongings] = useState(reservation.belongings || "");
  const [checkIn, setCheckIn] = useState(reservation.checkIn);
  const [checkOut, setCheckOut] = useState(reservation.checkOut);
  const [checkInTime, setCheckInTime] = useState(reservation.checkInTime);
  const [checkOutTime, setCheckOutTime] = useState(reservation.checkOutTime);
  const [feedingSchedules, setFeedingSchedules] = useState((reservation.careOverrides?.feedingSchedules?.length ? reservation.careOverrides.feedingSchedules : null) ?? dog.fields.feedingSchedules ?? []);
  const [medicationSchedules, setMedicationSchedules] = useState((reservation.careOverrides?.medicationSchedules?.length ? reservation.careOverrides.medicationSchedules : null) ?? dog.fields.medicationSchedules ?? []);
  const [bathType, setBathType] = useState(reservation.careOverrides?.bath_type ?? profileBath);
  const [postBathReturn, setPostBathReturn] = useState(reservation.careOverrides?.postBathReturn || "");
  const [ecName, setEcName] = useState(reservation.emergencyContactOverride?.name ?? clientEcName);
  const [ecPhone, setEcPhone] = useState(reservation.emergencyContactOverride?.phone ?? clientEcPhone);
  // B.12 fix: Sync ecName/ecPhone when client profile is updated externally (e.g. "Update Profile(s)" button)
  useEffect(() => {
    const curClientEc = client.fields.emergency_contact || "";
    const curClientEcPhone = client.fields.emergency_phone || "";
    if (!reservation.emergencyContactOverride) {
      if (curClientEc && curClientEc !== ecName) setEcName(curClientEc);
      if (curClientEcPhone && curClientEcPhone !== ecPhone) setEcPhone(curClientEcPhone);
    }
  }, [client.fields.emergency_contact, client.fields.emergency_phone]);
  const [notes, setNotes] = useState(reservation.notes || "");
  const [errors, setErrors] = useState({});
  const [showConflict, setShowConflict] = useState(false);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [pendingAction, setPendingAction] = useState(null); // "save" or "checkin"
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelRefundOption, setCancelRefundOption] = useState("keep");
  const [cancelCouponOption, setCancelCouponOption] = useState("return");
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  // Payment accordion state
  const [payExpanded, setPayExpanded] = useState(false);
  const [payMode, setPayMode] = useState("pay"); // "pay" or "refund"
  const [payMethod, setPayMethod] = useState("card");
  const [paySelectedCard, setPaySelectedCard] = useState(null); // saved card id or "new"
  const [payCard4, setPayCard4] = useState("");
  const [payCardBrand, setPayCardBrand] = useState("visa");
  const [paySaveCard, setPaySaveCard] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payTip, setPayTip] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payStaff, setPayStaff] = useState(profile ? (profile.full_name || profile.email || "").split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0,3) : "");
  const [payErr, setPayErr] = useState("");
  const [expandedLines, setExpandedLines] = useState({});
  const [discountType, setDiscountType] = useState(reservation.discountType || "none"); // "none", "percent", "flat"
  const [discountValue, setDiscountValue] = useState(reservation.discountValue || 0);
  const [selectedDiscountId, setSelectedDiscountId] = useState(reservation.discountId || null);
  const [fedToday, setFedToday] = useState(reservation.fedToday || "");
  const [medsToday, setMedsToday] = useState(reservation.medsToday || "");
  // Applied coupons (package sale IDs with quantity to use as deposit) for existing reservations
  const [appliedCoupons, setAppliedCoupons] = useState(reservation.appliedCoupons ? reservation.appliedCoupons.map(ac => ({ saleId: ac.saleId, unitsToUse: ac.unitsUsed || 0, value: ac.value || 0 })) : []);
  // Early check-in date adjustment popup
  const [showDateAdjustPopup, setShowDateAdjustPopup] = useState(false);
  const [adjustToToday, setAdjustToToday] = useState(false);
  // Activity tracking: { "2026-02-07|feeding_AM": { administered: true, by: "Name", at: "ISO", consumption: "100%" } }
  const [activityLog, setActivityLog] = useState(reservation.activityLog || {});
  const activityLogInitRef = useRef(JSON.stringify(reservation.activityLog || {}));
  // Auto-save activity log changes directly to reservation (no need to hit Save)
  useEffect(() => {
    const cur = JSON.stringify(activityLog);
    if (cur !== activityLogInitRef.current) {
      const prev = JSON.parse(activityLogInitRef.current);
      // Find what changed
      const actDiffs = [];
      const allKeys = new Set([...Object.keys(prev), ...Object.keys(activityLog)]);
      allKeys.forEach(key => {
        const oldEntry = prev[key] || {};
        const newEntry = activityLog[key] || {};
        if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
          const [dateStr, colName] = key.split("|");
          const label = (colName || key).replace(/_/g, " ");
          actDiffs.push({field: label, oldVal: oldEntry.administered ? "Done" : "—", newVal: newEntry.administered ? "Done" : "—"});
        }
      });
      activityLogInitRef.current = cur;
      const auditEntry = actDiffs.length > 0 ? [buildAuditEntry(reservation.id, "Updated Activity Log", actDiffs, profile)] : [];
      save({ ...data, auditLog: [...(data.auditLog || []), ...auditEntry], reservations: data.reservations.map(r => r.id === reservation.id ? { ...r, activityLog } : r) });
    }
  }, [activityLog]);

  const isCheckedIn = reservation.status === "checked-in";
  const isReadOnly = reservation.status === "checked-out" || reservation.status === "cancelled" || isCheckedIn;
  // Dates/times remain editable when checked in (late check-in corrections, early departure, extended stay)
  const datesLocked = reservation.status === "checked-out" || reservation.status === "cancelled";
  // Compliance gate: compute if any compliance checks are red (failed)
  const complianceFailures = (() => {
    if (!isCheckInMode) return [];
    const failures = [];
    const vaxStatus = getVaxStatus(dog, data.requiredVaccines, data.resortPolicies);
    const ageStatus = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
    const snStatus = getSpayNeuterCompliance(dog);
    const agreements = data.agreements || DEF_AGREEMENTS;
    const reqAgrs = agreements.filter(a => a.required !== false);
    const allAgrSigned = reqAgrs.every(a => agrSigned(client, a.id));
    if (!vaxStatus.ok) failures.push("Vaccines");
    if (!ageStatus.ok) failures.push("Dog Age");
    // Spay/Neuter is visual-only — does NOT block check-in/out per K9 Operations policy
    // (Intact dogs can enter the building; they just can't participate in group play if over 10 months)
    if (!allAgrSigned) failures.push("Agreements");
    if (!ecName?.trim() || !ecPhone?.trim() || (ecPhone||"").replace(/\D/g,"").length < 10) failures.push("Emergency Contact");
    return failures;
  })();
  const complianceBlocked = complianceFailures.length > 0;
  const BATH_OPTS = data.bathTypeOptions || ["Standard","Hypo","Medicated","Whitening"];
  const profileFeedingSchedules = dog.fields.feedingSchedules ?? [];
  const profileMedicationSchedules = dog.fields.medicationSchedules ?? [];
  const feedingChanged = JSON.stringify(feedingSchedules) !== JSON.stringify(profileFeedingSchedules);
  const medsChanged = JSON.stringify(medicationSchedules) !== JSON.stringify(profileMedicationSchedules);
  const bathChanged = bathType !== profileBath;
  const ecNameChanged = ecName !== clientEcName;
  const ecPhoneChanged = ecPhone !== clientEcPhone;

  // Build updated reservation object
  const buildUpdatedRes = () => ({
    ...reservation,
    parentDestination: parentDest,
    belongings,
    fedToday, medsToday,
    checkIn, checkOut, checkInTime, checkOutTime,
    notes,
    careOverrides: {
      feedingSchedules, medicationSchedules,
      bath_type: bathType,
      postBathReturn,
      feeding: summarizeFeeding(feedingSchedules),
      medications: summarizeMeds(medicationSchedules)
    },
    emergencyContactOverride: (ecNameChanged || ecPhoneChanged) ? { name: ecName, phone: ecPhone } : reservation.emergencyContactOverride || null,
    discountType: discountType !== "none" ? discountType : undefined,
    discountValue: discountType !== "none" ? discountValue : undefined,
    discountId: selectedDiscountId || undefined,
    ...(appliedCoupons.length > 0 ? { appliedCoupons: appliedCoupons.map(c => ({ saleId: c.saleId, unitsUsed: c.unitsToUse, value: c.value })) } : {}),
    activityLog,
  });

  // Detect profile changes
  const detectChanges = () => {
    const changes = [];
    if (feedingChanged && feedingSchedules.length > 0) changes.push({ type:"dog", field:"feedingSchedules", label:"Feeding Instructions", oldVal:profileFeedingSchedules, newVal:feedingSchedules, oldLabel:profileFeeding, newLabel:summarizeFeeding(feedingSchedules) });
    if (medsChanged && medicationSchedules.length > 0) changes.push({ type:"dog", field:"medicationSchedules", label:"Medications", oldVal:profileMedicationSchedules, newVal:medicationSchedules, oldLabel:profileMeds, newLabel:summarizeMeds(medicationSchedules) });
    if (bathChanged && bathType !== "") changes.push({ type:"dog", field:"bath_type", label:"Bathing Preference", oldVal:profileBath, newVal:bathType });
    if (ecNameChanged && ecName !== "") changes.push({ type:"client", field:"emergency_contact", label:"Emergency Contact Name", oldVal:clientEcName, newVal:ecName });
    if (ecPhoneChanged && ecPhone !== "") changes.push({ type:"client", field:"emergency_phone", label:"Emergency Contact Phone", oldVal:clientEcPhone, newVal:ecPhone });
    return changes;
  };

  const isBoarding = reservation.type === "boarding";

  // Calculate adjusted total for deposit/payment gating
  const getAdjustedTotal = () => {
    const pr = calcReservationPricing({ type: reservation.type || "boarding", roomType: reservation.roomType, checkIn, checkOut, checkInTime, checkOutTime, dogs: [dog], dogProfiles: data.dogs, pricing: data.pricing, isSecondDogSameRoom: false, reservation, actualCheckInTime: reservation?.actualCheckInTime });
    let adjT = pr.total;
    if (discountType === "percent" && discountValue > 0) adjT = Math.max(0, adjT - Math.round(adjT * (discountValue / 100) * 100) / 100);
    else if (discountType === "flat" && discountValue > 0) adjT = Math.max(0, adjT - Math.min(discountValue, adjT));
    return Math.round(adjT * 100) / 100;
  };

  // B.10 fix: Compute checkout payment gate (disable button like check-in does for compliance)
  const checkoutPaymentBlocked = (() => {
    if (!isCheckOutMode) return false;
    const adjTotal = getAdjustedTotal();
    if (adjTotal <= 0) return false;
    const resPmts = (data.payments || []).filter(p => p.reservationId === reservation.id && p.status !== "voided");
    const totalPaid = resPmts.filter(p => p.type !== "refund" && p.status !== "refunded").reduce((s, p) => s + p.amount, 0);
    const totalRefunded = resPmts.filter(p => p.type === "refund" || p.status === "refunded").reduce((s, p) => s + p.amount, 0);
    const collected = resPmts.length > 0 ? (totalPaid - totalRefunded) : (reservation.amountCollected || 0);
    return collected < adjTotal;
  })();
  const checkoutOutstanding = checkoutPaymentBlocked ? (() => {
    const adjTotal = getAdjustedTotal();
    const resPmts = (data.payments || []).filter(p => p.reservationId === reservation.id && p.status !== "voided");
    const totalPaid = resPmts.filter(p => p.type !== "refund" && p.status !== "refunded").reduce((s, p) => s + p.amount, 0);
    const totalRefunded = resPmts.filter(p => p.type === "refund" || p.status === "refunded").reduce((s, p) => s + p.amount, 0);
    const collected = resPmts.length > 0 ? (totalPaid - totalRefunded) : (reservation.amountCollected || 0);
    return Math.max(0, adjTotal - collected);
  })() : 0;

  const handleSave = (doCheckIn, doCheckOut) => {
    // Check for early check-in (trying to check in before reservation date)
    if (doCheckIn && !isBoarding) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const resCheckInDate = new Date(checkIn + "T00:00:00");
      const daysEarly = Math.floor((resCheckInDate - today) / 86400000);
      if (daysEarly > 0) {
        // Dog is scheduled for future date — offer date adjustment
        setShowDateAdjustPopup(true);
        setAdjustToToday(false);
        return;
      }
    }

    if (doCheckIn && isBoarding) {
      const errs = {};
      if (!parentDest.trim()) errs.parentDestination = "Required — ask where the parent is going";
      if (!belongings.trim()) errs.belongings = "Required — list items brought from home";
      // Deposit gate: 50% required based on nightly rate only (not add-ons/surcharges)
      // Calculate nightly rate separately from add-ons
      const pr = calcReservationPricing({ type: reservation.type || "boarding", roomType: reservation.roomType, checkIn, checkOut, checkInTime, checkOutTime, dogs: [dog], dogProfiles: data.dogs, pricing: data.pricing, isSecondDogSameRoom: false, reservation, actualCheckInTime: reservation?.actualCheckInTime });
      const nightlyRateLines = pr.lineItems.filter(l => !l.isAddon && !l.isSurcharge && !l.isDiscount);
      const nightlyRateTotal = nightlyRateLines.reduce((sum, l) => sum + l.total, 0);
      // Apply discount to nightly rate before calculating 50%
      let discountedNightlyRate = nightlyRateTotal;
      if (discountType === "percent" && discountValue > 0) discountedNightlyRate = Math.max(0, Math.round(nightlyRateTotal - (nightlyRateTotal * (discountValue / 100)) * 100) / 100);
      else if (discountType === "flat" && discountValue > 0) discountedNightlyRate = Math.max(0, nightlyRateTotal - discountValue);
      const depositRequired = Math.round(discountedNightlyRate * 0.5 * 100) / 100;
      const collected = reservation.amountCollected || 0;
      const totalCouponValue = appliedCoupons.reduce((sum, c) => sum + (c.value || 0), 0);
      const depositMet = collected + totalCouponValue >= depositRequired;
      if (nightlyRateTotal > 0 && !depositMet) errs.deposit = `50% deposit required ($${depositRequired.toFixed(2)}). Collected + Coupons: $${(collected + totalCouponValue).toFixed(2)}`;
      // Compliance gates — all must be green to check in
      const vaxStatus = getVaxStatus(dog, data.requiredVaccines, data.resortPolicies);
      if (!vaxStatus.ok) {
        const issues = [...(vaxStatus.expired || []), ...(vaxStatus.missing || [])].map(v => v.replace(/_/g, " "));
        errs.compliance_vaccines = `Vaccines not compliant: ${issues.join(", ")}`;
      }
      if (!ecName?.trim() || !ecPhone?.trim()) { errs.compliance_ec = "Emergency contact name and phone are required"; } else if ((ecPhone||"").replace(/\D/g,"").length < 10) { errs.compliance_ec = "Emergency contact phone must be a full 10-digit number"; }
      const agreements = data.agreements || DEF_AGREEMENTS;
      const reqAgrs = agreements.filter(a => a.required !== false);
      const allAgrSigned = reqAgrs.every(a => agrSigned(client, a.id));
      if (!allAgrSigned) {
        const unsigned = reqAgrs.filter(a => !agrSigned(client, a.id)).map(a => a.name);
        errs.compliance_agreements = `Unsigned agreements: ${unsigned.join(", ")}`;
      }
      const ageStatus = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
      if (!ageStatus.ok) errs.compliance_age = ageStatus.reason || "Dog does not meet age requirements";
      // Spay/Neuter is visual-only — does NOT block check-in per K9 Operations policy
      // (Intact dogs can enter the building; they just can't participate in group play if over 10 months)
      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    }
    // Compliance gate for ALL reservation types (daycare, evaluation, etc.)
    if (doCheckIn && !isBoarding) {
      const errs = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const resCheckInDate = new Date(checkIn + "T00:00:00");

      // Check if dog is expected today (reservation date matches)
      if (resCheckInDate.getTime() !== today.getTime()) {
        const daysEarly = Math.floor((resCheckInDate - today) / 86400000);
        if (daysEarly > 0) {
          errs.reservation_date = `Dog is scheduled for ${daysEarly} day${daysEarly > 1 ? 's' : ''} from now (${checkIn}). Adjust the reservation date to today to proceed with check-in.`;
        } else {
          errs.reservation_date = `Dog's reservation is for ${checkIn}, but today is ${new Date().toISOString().split('T')[0]}. Dates do not match.`;
        }
      }

      // Compliance checks for all types
      const vaxStatus = getVaxStatus(dog, data.requiredVaccines, data.resortPolicies);
      if (!vaxStatus.ok) {
        const issues = [...(vaxStatus.expired || []), ...(vaxStatus.missing || [])].map(v => v.replace(/_/g, " "));
        errs.compliance_vaccines = `Vaccines not compliant: ${issues.join(", ")}`;
      }
      if (!ecName?.trim() || !ecPhone?.trim()) { errs.compliance_ec = "Emergency contact name and phone are required"; } else if ((ecPhone||"").replace(/\D/g,"").length < 10) { errs.compliance_ec = "Emergency contact phone must be a full 10-digit number"; }
      const agreements = data.agreements || DEF_AGREEMENTS;
      const reqAgrs = agreements.filter(a => a.required !== false);
      const allAgrSigned = reqAgrs.every(a => agrSigned(client, a.id));
      if (!allAgrSigned) {
        const unsigned = reqAgrs.filter(a => !agrSigned(client, a.id)).map(a => a.name);
        errs.compliance_agreements = `Unsigned agreements: ${unsigned.join(", ")}`;
      }
      const ageStatus = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
      if (!ageStatus.ok) errs.compliance_age = ageStatus.reason || "Dog does not meet age requirements";

      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    }
    if (doCheckOut && isBoarding) {
      const errs = {};
      const adjTotal = getAdjustedTotal();
      const collected = reservation.amountCollected || 0;
      if (adjTotal > 0 && collected < adjTotal) { errs.payment = `Full payment required to check out. Outstanding: $${Math.max(0, adjTotal - collected).toFixed(2)}`; }
      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    }
    setErrors({});
    const changes = detectChanges();
    if (changes.length > 0) {
      setPendingChanges(changes);
      setPendingAction(doCheckIn ? "checkin" : doCheckOut ? "checkout" : "save");
      setShowConflict(true);
    } else {
      onSave(buildUpdatedRes(), doCheckIn, doCheckOut);
      if (doCheckIn) { setShowPrintPrompt(true); return; }
    }
  };

  const confirmConflict = async (updateProfiles) => {
    let newData = { ...data };
    const auditLogs = [];
    const fmtNow = new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
    const userName = profile ? (profile.full_name || profile.email || "Staff") : "Staff";
    if (updateProfiles) {
      const dogChanges = pendingChanges.filter(c => c.type === "dog");
      if (dogChanges.length) {
        newData.dogs = data.dogs.map(d => {
          if (d.id !== dog.id) return d;
          const fields = { ...d.fields };
          dogChanges.forEach(c => { fields[c.field] = c.newVal; });
          return { ...d, fields };
        });
        // Audit profile updates
        const profileDiffs = dogChanges.map(c => ({field: c.label || c.field, oldVal: (typeof c.oldVal === "object" ? (c.oldLabel || JSON.stringify(c.oldVal)) : c.oldVal) || "(empty)", newVal: (typeof c.newVal === "object" ? (c.newLabel || JSON.stringify(c.newVal)) : c.newVal) || "(empty)"}));
        if (profileDiffs.length > 0) auditLogs.push(buildAuditEntry(reservation.id, "Updated Dog Profile", profileDiffs, profile));
      }
      const clientChanges = pendingChanges.filter(c => c.type === "client");
      if (clientChanges.length) {
        newData.clients = data.clients.map(cl => {
          if (cl.id !== client.id) return cl;
          const fields = { ...cl.fields };
          clientChanges.forEach(ch => { fields[ch.field] = ch.newVal; });
          return { ...cl, fields };
        });
        // Audit client profile updates
        const clientDiffs = clientChanges.map(c => ({field: c.label || c.field, oldVal: c.oldVal || "(empty)", newVal: c.newVal || "(empty)"}));
        if (clientDiffs.length > 0) auditLogs.push(buildAuditEntry(reservation.id, "Updated Client Profile", clientDiffs, profile));
      }
    }
    const updatedRes = buildUpdatedRes();
    const doCheckIn = pendingAction === "checkin";
    const doCheckOut = pendingAction === "checkout";
    const merged = doCheckIn ? { ...updatedRes, status: "checked-in", actualCheckInTime: new Date().toISOString(), checkedInBy: userName } : doCheckOut ? { ...updatedRes, status: "checked-out", actualCheckOutTime: new Date().toISOString(), checkedOutBy: userName } : updatedRes;
    // Audit the reservation action (check-in, check-out, or update)
    if (doCheckIn) auditLogs.push(buildAuditEntry(reservation.id, "Checked In", [{field:"Status",oldVal:"Upcoming",newVal:"Checked In"},{field:"Actual Check-In",oldVal:"—",newVal:fmtNow},{field:"Checked In By",oldVal:"—",newVal:userName}], profile));
    if (doCheckOut) auditLogs.push(buildAuditEntry(reservation.id, "Checked Out", [{field:"Status",oldVal:"Checked In",newVal:"Checked Out"},{field:"Actual Check-Out",oldVal:"—",newVal:fmtNow},{field:"Checked Out By",oldVal:"—",newVal:userName}], profile));
    if (!doCheckIn && !doCheckOut) {
      const diffs = [];
      if (updatedRes.parentDestination !== reservation.parentDestination) diffs.push({field:"Parent Destination",oldVal:reservation.parentDestination||"(empty)",newVal:updatedRes.parentDestination||"(empty)"});
      if (updatedRes.belongings !== reservation.belongings) diffs.push({field:"Belongings",oldVal:reservation.belongings||"(empty)",newVal:updatedRes.belongings||"(empty)"});
      if (updatedRes.checkIn !== reservation.checkIn) diffs.push({field:"Check-In Date",oldVal:reservation.checkIn,newVal:updatedRes.checkIn});
      if (updatedRes.checkOut !== reservation.checkOut) diffs.push({field:"Check-Out Date",oldVal:reservation.checkOut,newVal:updatedRes.checkOut});
      if (updatedRes.checkInTime !== reservation.checkInTime) diffs.push({field:"Check-In Time",oldVal:reservation.checkInTime,newVal:updatedRes.checkInTime});
      if (updatedRes.checkOutTime !== reservation.checkOutTime) diffs.push({field:"Check-Out Time",oldVal:reservation.checkOutTime,newVal:updatedRes.checkOutTime});
      if (updatedRes.notes !== reservation.notes) diffs.push({field:"Notes",oldVal:reservation.notes||"(empty)",newVal:updatedRes.notes||"(empty)"});
      const oldCare = reservation.careOverrides || {}; const newCare = updatedRes.careOverrides || {};
      if ((newCare.bath_type||"") !== (oldCare.bath_type||"")) diffs.push({field:"Bath Type",oldVal:oldCare.bath_type||"(none)",newVal:newCare.bath_type||"(none)"});
      if ((newCare.feeding||"") !== (oldCare.feeding||"")) diffs.push({field:"Feeding Instructions",oldVal:oldCare.feeding||"(none)",newVal:newCare.feeding||"(none)"});
      if ((newCare.medications||"") !== (oldCare.medications||"")) diffs.push({field:"Medications",oldVal:oldCare.medications||"(none)",newVal:newCare.medications||"(none)"});
      if ((newCare.postBathReturn||"") !== (oldCare.postBathReturn||"")) diffs.push({field:"Post-Bath Return",oldVal:oldCare.postBathReturn||"(none)",newVal:newCare.postBathReturn||"(none)"});
      const oldEc = reservation.emergencyContactOverride || {}; const newEc = updatedRes.emergencyContactOverride || {};
      if ((newEc.name||"") !== (oldEc.name||"")) diffs.push({field:"Emergency Contact",oldVal:oldEc.name||"(profile default)",newVal:newEc.name||"(profile default)"});
      if ((newEc.phone||"") !== (oldEc.phone||"")) diffs.push({field:"Emergency Phone",oldVal:oldEc.phone||"(profile default)",newVal:newEc.phone||"(profile default)"});
      if ((updatedRes.fedToday||"") !== (reservation.fedToday||"")) diffs.push({field:"Fed Today",oldVal:reservation.fedToday||"(empty)",newVal:updatedRes.fedToday||"(empty)"});
      if ((updatedRes.medsToday||"") !== (reservation.medsToday||"")) diffs.push({field:"Meds Today",oldVal:reservation.medsToday||"(empty)",newVal:updatedRes.medsToday||"(empty)"});
      if (diffs.length > 0) auditLogs.push(buildAuditEntry(reservation.id, "Updated Reservation", diffs, profile));
    }
    // Create invoice on checkout
    if (doCheckOut) {
      const pricing = data.pricing || DEF_PRICING;
      const nights = Math.max(1, countNights(merged.checkIn, merged.checkOut));
      const rate = merged.ratePerNight || (pricing.boardingRates || {})[merged.roomType] || 0;
      const totalEst = merged.totalPrice || (rate * nights);
      const invoiceId = uuid();
      const invoice = {
        id: invoiceId, reservationId: reservation.id, clientId: client.id,
        invoiceNumber: `INV-${Date.now()}`,
        totalAmount: totalEst, status: 'paid',
        dueDate: todayStr(), paidAt: new Date().toISOString(),
      };
      const lineItem = {
        id: uuid(), invoiceId,
        description: `${merged.type === 'boarding' ? 'Boarding' : 'Daycare'} — ${merged.roomType || 'Standard'}`,
        quantity: nights, unitPrice: rate, totalPrice: totalEst,
        itemType: merged.type || 'boarding',
      };
      // Add selected add-ons as line items
      const addOnLineItems = (merged.selectedAddOns || []).map(ao => ({
        id: uuid(), invoiceId,
        description: `Add-on: ${ao.name || ao}`,
        quantity: 1, unitPrice: ao.price || 0, totalPrice: ao.price || 0,
        itemType: 'add_on',
      }));
      newData._invoices = [...(newData._invoices || []), invoice];
      newData._invoiceLineItems = [...(newData._invoiceLineItems || []), lineItem, ...addOnLineItems];
      // Link existing payments for this reservation to the invoice
      newData.payments = (newData.payments || []).map(p =>
        p.reservationId === reservation.id && !p.invoiceId ? { ...p, invoiceId } : p
      );
      merged.invoiceId = invoiceId;
    }
    newData.reservations = newData.reservations.map(r => r.id === reservation.id ? merged : r);
    newData.auditLog = [...(newData.auditLog || []), ...auditLogs];
    await save(newData);
    setShowConflict(false);
    if (doCheckIn) { setShowPrintPrompt(true); } else { onClose(); }
  };

  const handlePaymentSubmit = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) { setPayErr("Enter a valid amount"); return; }
    if (!payStaff) { setPayErr("Staff initials required"); return; }
    if (payMode !== "refund" && payMethod === "card" && payCard4.length < 4) { setPayErr("Enter last 4 digits of card"); return; }

    // Create payment object
    const payment = {
      id: gid(),
      reservationId: reservation.id,
      clientId: client.id,
      amount: parseFloat(payAmount) + (payTip && parseFloat(payTip) > 0 ? parseFloat(payTip) : 0),
      type: payMode === "refund" ? "refund" : "payment",
      method: payMode === "refund" ? "card" : payMethod,
      cardLast4: payMethod === "card" && payMode !== "refund" ? payCard4 : null,
      status: payMode === "refund" ? "refunded" : "completed",
      note: (payTip && parseFloat(payTip) > 0 ? `Tip: $${parseFloat(payTip).toFixed(2)}` : "") + (payNote ? (payTip && parseFloat(payTip) > 0 ? " | " : "") + payNote : ""),
      timestamp: new Date().toISOString(),
      stripePaymentIntentId: null,
      stripeRefundId: null,
      processedBy: payStaff,
    };

    // If new card and save card is checked, add to client's savedCards
    let updatedClients = data.clients;
    if (payMode !== "refund" && payMethod === "card" && (paySelectedCard === "new" || (!paySelectedCard && (client.savedCards || []).length === 0)) && paySaveCard) {
      const newCard = {
        id: gid(),
        brand: payCardBrand,
        last4: payCard4,
        expMonth: new Date().getMonth() + 1,
        expYear: new Date().getFullYear(),
        isDefault: (client.savedCards || []).length === 0,
        stripePaymentMethodId: null,
        createdAt: new Date().toISOString(),
      };
      updatedClients = data.clients.map(c => c.id === client.id ? { ...c, savedCards: [...(c.savedCards || []), newCard] } : c);
    }

    // Update payments and recalculate collected amount
    const payments = [...(data.payments || []), payment];
    const resPmts = payments.filter(p => p.reservationId === reservation.id && p.status === "completed" && p.type !== "refund");
    const resRefunds = payments.filter(p => p.reservationId === reservation.id && (p.type === "refund" || p.status === "refunded"));
    const newCollected = resPmts.reduce((s, p) => s + p.amount, 0) - resRefunds.reduce((s, p) => s + p.amount, 0);

    // Calculate deposit requirement
    const pricing = data.pricing || DEF_PRICING;
    const nights = Math.max(1, countNights(reservation.checkIn, reservation.checkOut));
    const rate = (pricing.boardingRates || {})[reservation.roomType] || 0;
    const estTotal = rate * nights;
    const depReq = Math.round(estTotal * 0.5 * 100) / 100;
    const noDeposit = newCollected < depReq;

    // Create audit entry
    const pmtAudit = buildAuditEntry(
      reservation.id,
      payment.type === "refund" ? "Issued Refund" : "Collected Payment",
      [{
        field: payment.type === "refund" ? "Refund" : "Payment",
        oldVal: `$${(reservation.amountCollected || 0).toFixed(2)} collected`,
        newVal: `$${payment.amount.toFixed(2)} ${payment.type} via ${payment.method}${payment.method === "card" ? " ····" + payment.cardLast4 : ""}`,
      }],
      profile
    );

    // Save everything
    await save({
      ...data,
      payments,
      clients: updatedClients,
      auditLog: [...(data.auditLog || []), pmtAudit],
      reservations: data.reservations.map(r => r.id === reservation.id ? { ...r, amountCollected: newCollected, noDeposit } : r),
    });

    // Reset and collapse accordion
    setPayExpanded(false);
    setPayAmount("");
    setPayTip("");
    setPayNote("");
    setPayErr("");
  };

  const secHeader = (label) => <div style={{fontSize:11,fontWeight:700,color:C.textMut,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:10,marginTop:20}}>{label}</div>;
  const profileHint = (label, changed) => (
    <div style={{fontSize:11,color:changed?C.acc:C.textMut,fontStyle:"italic",marginTop:2}}>
      {changed ? <><Badge color="warning" size="sm">Modified</Badge> <span style={{marginLeft:4}}>Profile: {label || "(empty)"}</span></> : `Profile: ${label || "(empty)"}`}
    </div>
  );
  const errMsg = (field) => errors[field] ? <div style={{color:C.dan,fontSize:12,fontWeight:600,marginTop:4}}>{errors[field]}</div> : null;
  const tabStyle = (active) => ({
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: 700,
    color: active ? C.pri : C.textSec,
    background: active ? C.priLt : "transparent",
    border: "none",
    borderBottom: active ? `2px solid ${C.pri}` : "2px solid transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  });

  // Build activity matrix — columns = service types, rows = dates
  const buildActivityMatrix = () => {
    const days = [];
    let d = new Date(checkIn + "T12:00:00");
    const end = new Date(checkOut + "T12:00:00");
    while (d <= end) {
      days.push(d.toISOString().split("T")[0]);
      d = new Date(d.getTime() + 86400000);
    }

    const cols = [];
    feedingSchedules.forEach(s => {
      (s.times || []).forEach(time => {
        cols.push({
          key: `feeding_${time.replace(/\s+/g,"_")}`,
          label: `Feeding - ${time}`,
          type: "feeding",
          detail: [s.amount, s.unit, s.foodType].filter(Boolean).join(" "),
          instruction: fmtInstr(s.instruction),
          notes: s.notes || "",
          activeDays: days.map(() => true),
        });
      });
    });

    medicationSchedules.forEach(s => {
      const timeStr = (s.times && s.times.length) ? s.times.join(", ") : (s.time || "");
      cols.push({
        key: `med_${(s.name||"").replace(/\s+/g,"_")}`,
        label: `Medication - ${s.name}`,
        type: "medication",
        detail: [timeStr, s.amount, s.unit].filter(Boolean).join(" "),
        notes: fmtInstr(s.instruction) || s.notes || "",
        activeDays: days.map(() => true),
      });
    });

    if (bathType) {
      cols.push({
        key: "bathing",
        label: "Bathing",
        type: "bathing",
        detail: bathType,
        notes: postBathReturn ? `After bath: ${postBathReturn}` : "",
        activeDays: days.map((_, i) => i === days.length - 1),
      });
    }

    return { days, cols };
  };

  // ── Print Run Card ────────────────────────────────────────────
  const printRunCard = () => {
    // Use default template if available
    const templates = data.runCardTemplates || [];
    const defaultTpl = templates.find(t => t.isDefault);
    const cfg = defaultTpl?.config || data.runCardConfig || {};
    const sectionLayout = cfg.sectionLayout || null;
    const show = (key) => {
      // Check sectionLayout first (new system), fall back to legacy toggle
      if (sectionLayout) {
        const sectionMap = { showBelongings: "belongings", showFeeding: "feeding", showMedications: "medications", showBath: "bath", showActivityGrid: "activityGrid", showEmergencyContact: "emergency", showNotes: "notes", showDogTags: "tags", showFedToday: "fedToday", showMedsToday: "medsToday" };
        const secId = sectionMap[key];
        if (secId && sectionLayout[secId]) return sectionLayout[secId].enabled !== false;
      }
      return cfg[key] !== false;
    };

    // Dog info
    const dName = dog.fields.name || "Unknown";
    const cLast = client.fields.last_name || "";
    const cFirst = client.fields.first_name || "";
    const cPhoneRaw = (client.fields.phone || "").replace(/\D/g, "");
    const cPhoneStr = cPhoneRaw.length === 10 ? `(${cPhoneRaw.slice(0,3)}) ${cPhoneRaw.slice(3,6)}-${cPhoneRaw.slice(6)}` : client.fields.phone || "";
    const breed = dog.fields.breed || "";
    const weight = dog.fields.weight ? `${dog.fields.weight} lbs` : "";
    const sex = dog.fields.sex || "";
    const altered = dog.fields.spayed_neutered || "";
    const sexStr = [sex, altered].filter(Boolean).join("/");

    // Age calculation
    let ageStr = "";
    if (dog.fields.dob) {
      const bd = new Date(dog.fields.dob + "T00:00:00");
      const now = new Date();
      let years = now.getFullYear() - bd.getFullYear();
      let months = now.getMonth() - bd.getMonth();
      if (months < 0) { years--; months += 12; }
      ageStr = years > 0 ? `${years} Year${years !== 1 ? "s" : ""}${months > 0 ? `, ${months} Month${months !== 1 ? "s" : ""}` : ""}` : `${months} Month${months !== 1 ? "s" : ""}`;
    }

    // Emergency contact
    const ecNameVal = ecName || client.fields.emergency_contact || "";
    const ecPhoneRaw = (ecPhone || client.fields.emergency_phone || "").replace(/\D/g, "");
    const ecPhoneStr = ecPhoneRaw.length === 10 ? `(${ecPhoneRaw.slice(0,3)}) ${ecPhoneRaw.slice(3,6)}-${ecPhoneRaw.slice(6)}` : ecPhone || client.fields.emergency_phone || "";

    // Room + dates
    const roomLabel = reservation.roomType || "";
    const roomNum = reservation.room || "";
    const ciDate = reservation.checkIn || "";
    const coDate = reservation.checkOut || "";
    const ciTime = reservation.checkInTime || "";
    const coTime = reservation.checkOutTime || "";

    const fmtT = (t) => {
      if (!t) return "";
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (m) { let h = parseInt(m[1]); const min = m[2]; const ap = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12; return `${h}:${min} ${ap}`; }
      return t;
    };
    const fmtD = (d) => {
      if (!d) return "";
      const dt = new Date(d + "T00:00:00");
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      return `${days[dt.getDay()]}, ${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
    };

    const resType = reservation.type === "dayboarding" ? "Day Boarding" : "Boarding";
    const inclNote = roomLabel.includes("Suite") || roomLabel.includes("Executive") ? " (All Inclusive)" : "";

    // Dog tags
    const tagNames = (dog.tags || []).map(tid => {
      const t = (data.dogTags || []).find(dt => dt.id === tid);
      return t ? t.name : "";
    }).filter(Boolean);

    // Icon indicators
    const hasMeds = medicationSchedules.length > 0;
    const hasFeeding = feedingSchedules.length > 0;
    const hasBath = bathType && bathType !== "None" && bathType !== "";

    // Feeding summary (above the table)
    const feedingSummaryHtml = feedingSchedules.map(s => {
      const times = (s.times || []).join(", ");
      const detail = [s.amount, s.unit, s.foodType].filter(Boolean).join(" ");
      const inst = fmtInstr(s.instruction) ? ` ${fmtInstr(s.instruction)}` : "";
      const n = s.notes ? ` ${s.notes}` : "";
      return `<div style="margin-bottom:4px;"><strong>${times}:</strong> ${detail}${inst}${n}</div>`;
    }).join("");

    // Profile picture placeholder (or default silhouette)
    const dogPicUrl = dog.fields.profilePic || "";
    const picHtml = dogPicUrl
      ? `<img src="${dogPicUrl}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #ccc;"/>`
      : `<div style="width:120px;height:120px;border-radius:8px;border:1px solid #ccc;background:#f0f0f0;display:flex;align-items:center;justify-content:center;">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
          </svg>
        </div>`;

    // ── Activity grid (feeding only — no bathing/meds rows) ──
    const { days: actDays, cols: actCols } = buildActivityMatrix();
    const feedingCols = actCols.filter(c => c.type === "feeding");

    const gridHtml = actDays.length > 0 && feedingCols.length > 0 ? (() => {
      const dayHeaders = actDays.map(d => {
        const dt = new Date(d + "T00:00:00");
        const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()];
        const dateStr = `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
        return `<th colspan="2" style="padding:4px 2px;text-align:center;border:1px solid #999;font-size:11px;background:#f5f5f5;">
          <div style="font-weight:700;">${dayName}</div>
          <div>${dateStr}</div>
        </th>`;
      }).join("");

      // Sub-header row: "administered" | "% eaten" for each day
      const subHeaders = actDays.map(() =>
        `<th style="padding:2px 4px;text-align:center;border:1px solid #999;font-size:8px;color:#666;background:#fafafa;width:50px;">administered</th>
         <th style="padding:2px 4px;text-align:center;border:1px solid #999;font-size:8px;color:#666;background:#fafafa;width:50px;">% eaten</th>`
      ).join("");

      const serviceRows = feedingCols.map(col => {
        // Parse label: remove "Feeding - " prefix, split time from detail
        const timeMatch = col.key.match(/feeding_(.+)/);
        const timeName = timeMatch ? timeMatch[1].replace(/_/g, " ") : "";
        const detailStr = col.detail || "";
        const labelHtml = `<div style="font-weight:700;font-size:11px;">${timeName}</div><div style="font-size:10px;color:#444;">${detailStr}</div>`;

        const cells = actDays.map((_, di) => {
          const isActive = col.activeDays ? col.activeDays[di] : true;
          if (!isActive) return `<td style="border:1px solid #999;padding:8px 4px;">&nbsp;</td><td style="border:1px solid #999;padding:8px 4px;">&nbsp;</td>`;
          return `<td style="border:1px solid #999;padding:8px 4px;min-width:40px;">&nbsp;</td>
                  <td style="border:1px solid #999;padding:8px 4px;min-width:40px;">&nbsp;</td>`;
        }).join("");
        return `<tr><td style="padding:6px 8px;border:1px solid #999;white-space:nowrap;vertical-align:top;">${labelHtml}</td>${cells}</tr>`;
      }).join("");

      return `<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:11px;">
        <thead>
          <tr><th style="padding:6px 8px;text-align:left;border:1px solid #999;font-size:11px;background:#f5f5f5;min-width:140px;"></th>${dayHeaders}</tr>
          <tr><th style="border:1px solid #999;"></th>${subHeaders}</tr>
        </thead>
        <tbody>${serviceRows}</tbody>
      </table>`;
    })() : "";

    // ── Medication table (ALWAYS shown) ──
    const medTableHtml = (() => {
      if (!hasMeds) return `<div style="margin-top:14px;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:12px;color:#666;"><strong>MEDICATIONS:</strong> No medications on file for this stay.</div>`;
      const medDayHeaders = actDays.map(d => {
        const dt = new Date(d + "T00:00:00");
        const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()];
        const dateStr = `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
        return `<th style="padding:4px 6px;text-align:center;border:1px solid #999;font-size:10px;background:#f5f5f5;"><div style="font-weight:700;">${dayName}</div><div>${dateStr}</div></th>`;
      }).join("");
      const medRows = medicationSchedules.map(s => {
        const timeStr = (s.times && s.times.length) ? s.times.join(", ") : (s.time || "");
        const label = `<div style="font-weight:700;font-size:11px;">${s.name || "Medication"}</div><div style="font-size:10px;color:#444;">${[timeStr, s.amount, s.unit].filter(Boolean).join(" ")}${fmtInstr(s.instruction) ? " — " + fmtInstr(s.instruction) : (s.notes ? " — " + s.notes : "")}</div>`;
        const cells = actDays.map(() => `<td style="border:1px solid #999;padding:6px 4px;text-align:center;">&nbsp;</td>`).join("");
        return `<tr><td style="padding:6px 8px;border:1px solid #999;vertical-align:top;">${label}</td>${cells}</tr>`;
      }).join("");
      return `<div style="margin-top:14px;"><div style="font-weight:900;font-size:12px;margin-bottom:4px;">MEDICATIONS:</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr><th style="padding:4px 8px;text-align:left;border:1px solid #999;font-size:10px;background:#f5f5f5;min-width:140px;"></th>${medDayHeaders}</tr></thead>
          <tbody>${medRows}</tbody>
        </table></div>`;
    })();

    // ── Bath table (ALWAYS shown) ──
    const bathTableHtml = (() => {
      if (!hasBath) return `<div style="margin-top:14px;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:12px;color:#666;"><strong>BATH:</strong> No bath scheduled for this stay.</div>`;
      // Bath on last day only
      const lastDay = actDays.length > 0 ? actDays[actDays.length - 1] : "";
      const bathDayHeaders = actDays.map(d => {
        const dt = new Date(d + "T00:00:00");
        const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()];
        const dateStr = `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
        return `<th style="padding:4px 6px;text-align:center;border:1px solid #999;font-size:10px;background:#f5f5f5;"><div style="font-weight:700;">${dayName}</div><div>${dateStr}</div></th>`;
      }).join("");
      const bathCells = actDays.map(d => {
        return `<td style="border:1px solid #999;padding:6px 4px;text-align:center;font-size:10px;">${d === lastDay ? "Scheduled" : ""}</td>`;
      }).join("");
      return `<div style="margin-top:14px;"><div style="font-weight:900;font-size:12px;margin-bottom:4px;">BATH: ${bathType}</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr><th style="padding:4px 8px;text-align:left;border:1px solid #999;font-size:10px;background:#f5f5f5;min-width:140px;"></th>${bathDayHeaders}</tr></thead>
          <tbody><tr><td style="padding:6px 8px;border:1px solid #999;font-weight:700;">${bathType} Bath</td>${bathCells}</tr></tbody>
        </table></div>`;
    })();

    // Build section HTML map for positioned layout
    const sectionHtmlMap = {
      header: `<div class="header"><div class="pic">${picHtml}</div><div class="header-info"><div><span class="dog-name">${dName}</span> <span class="owner-last">${cLast}</span><span style="margin-left:12px;" class="room-badge">| ${roomLabel}, ${roomNum}</span></div><div class="info-line">&bull; ${breed}${ageStr ? ", " + ageStr : ""}${sexStr ? " " + sexStr : ""}</div><div class="info-line">&bull; ${cFirst} ${cLast} ${cPhoneStr ? cPhoneStr : ""}</div><div style="font-size:14px;font-weight:700;margin:8px 0 4px;">${resType} | ${roomLabel}${inclNote}: ${fmtD(ciDate)}, ${fmtT(ciTime)} - <strong>${fmtD(coDate)}, ${fmtT(coTime)}</strong></div></div></div>`,
      dogInfo: `<div class="info-line">&bull; ${breed}${ageStr ? ", " + ageStr : ""}${weight ? ", " + weight : ""}${sexStr ? " " + sexStr : ""}</div>`,
      ownerContact: `<div class="info-line">&bull; ${cFirst} ${cLast} ${cPhoneStr ? cPhoneStr : ""}</div>`,
      resDates: `<div style="font-size:14px;font-weight:700;margin:4px 0;">${resType} | ${roomLabel}${inclNote}: ${fmtD(ciDate)}, ${fmtT(ciTime)} - <strong>${fmtD(coDate)}, ${fmtT(coTime)}</strong></div>`,
      belongings: show("showBelongings") && belongings ? `<div class="info-line">&bull; <strong>Describe pets belongings</strong> ${belongings}</div>` : "",
      fedToday: show("showFedToday") ? `<div class="info-line">&bull; <strong>Has your pet been fed today?</strong> ${fedToday || ""}</div>` : "",
      medsToday: show("showMedsToday") ? `<div class="info-line">&bull; <strong>Has your pet had medications today?</strong> ${medsToday || ""}</div>` : "",
      tags: (show("showDogTags") || hasMeds || hasFeeding || hasBath) ? `<div class="tag-row">${show("showDogTags") ? tagNames.map(t => `<span class="tag">${t}</span>`).join("") : ""}${hasMeds ? `<span class="icon-badge">💊Meds:</span>` : ""}${hasFeeding ? `<span class="icon-badge">🍽Food from Home:</span>` : ""}${hasBath ? `<span class="icon-badge">🛁${bathType} Bath:</span>` : ""}</div>` : "",
      emergency: show("showEmergencyContact") && (ecNameVal || ecPhoneStr) ? `<div style="margin:6px 0;font-size:12px;"><strong>Emergency Contact:</strong> ${ecNameVal} ${ecPhoneStr ? ecPhoneStr : ""}</div>` : "",
      notes: show("showNotes") && notes ? `<div style="margin:6px 0;font-size:12px;"><strong>Notes:</strong> ${notes}</div>` : "",
      feeding: show("showFeeding") && hasFeeding ? `<div class="section-header">FOOD: ${feedingSchedules.some(s => (s.foodType||"").toLowerCase().includes("home")) ? "FFH - Food From Home" : feedingSchedules[0]?.foodType || ""}</div>${feedingSummaryHtml}` : "",
      activityGrid: show("showActivityGrid") && gridHtml ? gridHtml : "",
      medications: medTableHtml,
      bath: bathTableHtml,
    };

    // Build body content
    // New element-based system: cfg.elements is an array of positioned variable elements
    const cfgElements = cfg.elements || [];
    let bodyContent;

    if (cfgElements.length > 0) {
      // ── NEW ELEMENT-BASED LAYOUT ──
      // Map varId to real data values
      const varDataMap = {
        dogPhoto: picHtml,
        dogName: `<span style="font-size:26px;font-weight:900;">${dName}</span>`,
        dogBreed: breed,
        dogAge: ageStr,
        dogWeight: weight,
        dogSex: sexStr,
        dogTags: tagNames.length > 0 ? `<span class="tag-row">${tagNames.map(t => `<span class="tag">${t}</span>`).join("")}${hasMeds ? `<span class="icon-badge">\u{1F48A}Meds</span>` : ""}${hasFeeding ? `<span class="icon-badge">\u{1F37D}Food</span>` : ""}${hasBath ? `<span class="icon-badge">\u{1F6C1}Bath</span>` : ""}</span>` : "",
        ownerName: `${cFirst} ${cLast}`,
        ownerPhone: cPhoneStr,
        emergencyName: ecNameVal,
        emergencyPhone: ecPhoneStr,
        resType: resType,
        roomType: roomLabel,
        roomNumber: roomNum,
        checkInDate: fmtD(ciDate),
        checkInTime: fmtT(ciTime),
        checkOutDate: fmtD(coDate),
        checkOutTime: fmtT(coTime),
        belongings: belongings || "",
        fedToday: fedToday || "",
        medsToday: medsToday || "",
        notes: notes || "",
        feedingSchedule: hasFeeding ? `<div class="section-header">FOOD: ${feedingSchedules.some(s => (s.foodType||"").toLowerCase().includes("home")) ? "FFH - Food From Home" : feedingSchedules[0]?.foodType || ""}</div>${feedingSummaryHtml}` : "",
        activityGrid: gridHtml || "",
        medications: medTableHtml,
        bathSchedule: bathTableHtml,
      };

      // ── GENERIC WYSIWYG PRINT ENGINE ──
      // Faithfully reproduces ANY canvas arrangement. No hardcoded variable names
      // for layout decisions — every element is treated uniformly.
      // Horizontal position: proportional to canvas X/W (canvas=612px wide).
      // Vertical order: sorted by canvas Y, with proportional gap preservation.
      // Height: driven by actual content (document flow), not canvas H.
      const CW = 612; // Canvas width (must match editor CARD_W)
      const visibleEls = cfgElements.filter(el => el.visible !== false);
      const sorted = [...visibleEls].sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));

      // ── Step 1: Group elements into rows by Y-overlap ──
      // Two elements share a row if their vertical extents overlap by >30% of
      // the shorter element's height. This handles side-by-side elements that
      // aren't pixel-perfect aligned (e.g., photo next to text fields).
      const rows = [];
      sorted.forEach(el => {
        const elTop = el.y || 0;
        const elBot = elTop + (el.h || 24);
        let placed = false;
        for (let i = rows.length - 1; i >= Math.max(0, rows.length - 3); i--) {
          const row = rows[i];
          const rowTop = Math.min(...row.map(e => e.y || 0));
          const rowBot = Math.max(...row.map(e => (e.y || 0) + (e.h || 24)));
          const oTop = Math.max(elTop, rowTop);
          const oBot = Math.min(elBot, rowBot);
          const overlap = oBot - oTop;
          const minH = Math.min(elBot - elTop, rowBot - rowTop);
          if (overlap > minH * 0.3) { row.push(el); placed = true; break; }
        }
        if (!placed) rows.push([el]);
      });

      // ── Step 2: Universal element renderer ──
      // Returns inner HTML for any element type. No special layout logic —
      // just content rendering with the element's own typography settings.
      const renderElContent = (el) => {
        const varId = el.varId;
        const fs = el.fontSize || 12;
        const fw = el.bold ? 700 : 400;
        const fst = el.italic ? "italic" : "normal";
        const clr = el.color || "#222";
        const ta = el.align || "left";
        const baseStyle = `font-size:${fs}px;font-weight:${fw};font-style:${fst};color:${clr};text-align:${ta};`;

        if (varId === "separator") return `<hr style="border:none;border-top:1px solid #ccc;margin:4px 0;">`;
        if (varId === "dogPhoto") return picHtml;
        if (varId === "labelCustom") {
          const lb = el.label ? `<strong>${el.label}</strong> ` : "";
          return `<div style="${baseStyle}">${lb}${el.customText || ""}</div>`;
        }

        const raw = varDataMap[varId];
        if (raw === undefined || raw === "") return null;

        // Table/grid types: handle page overflow uniformly
        const tableLabels = { activityGrid: "Activity Grid", medications: "Medications", bathSchedule: "Bath Schedule", feedingSchedule: "Feeding Schedule" };
        if (tableLabels[varId]) {
          if (needsPage2) {
            return `<div style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:11px;color:#666;font-style:italic;"><strong>${tableLabels[varId]}:</strong> See page 2 (${stayDays} days)</div>`;
          }
          return `<div style="overflow:hidden;">${raw}</div>`;
        }

        if (varId === "dogTags") return `<div style="margin:2px 0;">${raw}</div>`;

        const lb = el.label ? `<strong>${el.label}</strong> ` : "";
        return `<div style="${baseStyle}white-space:normal;overflow-wrap:break-word;">${lb}${raw}</div>`;
      };

      // ── Step 3: Overflow detection ──
      const stayDays = actDays.length;
      const needsPage2 = stayDays > 7;

      // ── Step 4: Build page rows with proportional positioning ──
      const page1Parts = [];
      let prevRowBot = 0;

      rows.forEach((row, ri) => {
        // Sort row elements left-to-right
        row.sort((a, b) => (a.x || 0) - (b.x || 0));
        const rowTop = Math.min(...row.map(e => e.y || 0));
        const rowBot = Math.max(...row.map(e => (e.y || 0) + (e.h || 24)));

        // Proportional vertical gap between rows (compressed for print)
        const yGap = ri > 0 ? Math.max(0, rowTop - prevRowBot) : 0;
        const gapPx = Math.min(Math.round(yGap * 0.4), 20);
        const mTop = gapPx > 3 ? gapPx : 2;
        prevRowBot = rowBot;

        if (row.length === 1) {
          // ── Single-element row ──
          const el = row[0];
          const content = renderElContent(el);
          if (!content) return;
          const leftPct = ((el.x || 0) / CW * 100).toFixed(1);
          const widthPct = ((el.w || CW) / CW * 100).toFixed(1);

          if (parseFloat(widthPct) > 85) {
            // Near-full-width: render as block
            page1Parts.push(`<div style="margin-top:${mTop}px;">${content}</div>`);
          } else {
            // Partial width: position proportionally
            page1Parts.push(`<div style="margin-top:${mTop}px;margin-left:${leftPct}%;width:${widthPct}%;">${content}</div>`);
          }
        } else {
          // ── Multi-element row: flex with proportional widths ──
          const parts = [];
          let lastRightEdge = 0;

          row.forEach((el, idx) => {
            const content = renderElContent(el);
            if (!content) return;
            const elX = el.x || 0;
            const elW = el.w || 100;
            const widthPct = (elW / CW * 100).toFixed(1);

            // Gap: space between this element's left and previous element's right
            const gap = idx === 0 ? elX : Math.max(0, elX - lastRightEdge);
            const gapPct = (gap / CW * 100).toFixed(1);
            const ml = parseFloat(gapPct) > 1.5 ? `margin-left:${gapPct}%;` : "";

            parts.push(`<div style="width:${widthPct}%;${ml}flex-shrink:0;min-width:0;overflow:hidden;">${content}</div>`);
            lastRightEdge = elX + elW;
          });

          if (parts.length > 0) {
            page1Parts.push(`<div style="display:flex;align-items:flex-start;margin-top:${mTop}px;">${parts.join("")}</div>`);
          }
        }
      });

      // Build page 2 for long stays (full-width calendar grids)
      let page2Html = "";
      if (needsPage2) {
        // Build a readable calendar-style grid: 7 columns (Mon-Sun), rows for each week
        const buildCalendarGrid = (title, contentFn) => {
          const dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
          // Group actDays into weeks
          const weeks = [];
          let currentWeek = [];
          actDays.forEach((d, i) => {
            const dt = new Date(d + "T00:00:00");
            const dow = dt.getDay(); // 0=Sun..6=Sat
            const mondayIdx = dow === 0 ? 6 : dow - 1; // Convert to Mon=0..Sun=6
            if (i === 0 && mondayIdx > 0) { for (let p = 0; p < mondayIdx; p++) currentWeek.push(null); }
            currentWeek.push(d);
            if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
          });
          if (currentWeek.length > 0) { while (currentWeek.length < 7) currentWeek.push(null); weeks.push(currentWeek); }
          const headerRow = dayNames.map(d => `<th style="padding:6px 4px;text-align:center;border:1px solid #999;font-size:11px;font-weight:700;background:#f5f5f5;">${d}</th>`).join("");
          const bodyRows = weeks.map(week => {
            const cells = week.map(day => {
              if (!day) return `<td style="border:1px solid #ddd;padding:6px;background:#fafafa;"></td>`;
              const dt = new Date(day + "T00:00:00");
              const dateStr = `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
              const content = contentFn(day);
              return `<td style="border:1px solid #999;padding:6px;vertical-align:top;font-size:10px;min-width:70px;"><div style="font-weight:700;margin-bottom:3px;">${dateStr}</div>${content}</td>`;
            }).join("");
            return `<tr>${cells}</tr>`;
          }).join("");
          return `<div style="margin-bottom:16px;"><div style="font-weight:900;font-size:13px;margin-bottom:6px;border-bottom:2px solid #333;padding-bottom:4px;">${title}</div><table style="width:100%;border-collapse:collapse;"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
        };

        const feedingGrid = hasFeeding ? buildCalendarGrid(
          `FEEDING: ${feedingSchedules.some(s => (s.foodType||"").toLowerCase().includes("home")) ? "FFH - Food From Home" : feedingSchedules[0]?.foodType || ""}`,
          (day) => feedingSchedules.map(s => {
            const times = (s.times || []).join(", ");
            return `<div style="margin:2px 0;font-size:9px;"><strong>${times}:</strong> ${s.amount||""} ${s.unit||""}<br><span style="font-size:8px;">administered: ___ % eaten: ___</span></div>`;
          }).join("")
        ) : "";

        const medsGrid = hasMeds ? buildCalendarGrid(
          "MEDICATIONS",
          (day) => medicationSchedules.map(s => {
            const timeStr = (s.times && s.times.length) ? s.times.join(", ") : (s.time || "");
            return `<div style="margin:2px 0;font-size:9px;"><strong>${s.name||"Med"}:</strong> ${timeStr} ${s.amount||""} ${s.unit||""}<br><span style="font-size:8px;">given: ___</span></div>`;
          }).join("")
        ) : "";

        const bathGrid = hasBath ? buildCalendarGrid(
          `BATH: ${bathType}`,
          (day) => {
            const lastDay = actDays[actDays.length - 1];
            return day === lastDay ? `<div style="font-size:10px;font-weight:700;color:#333;">Scheduled</div>` : "";
          }
        ) : "";

        page2Html = `<div style="page-break-before:always;padding-top:8px;">
          <div style="text-align:right;font-size:11px;color:#666;margin-bottom:8px;">Run Card (continued) — ${dName} ${cLast}</div>
          ${feedingGrid}${medsGrid}${bathGrid}
        </div>`;
      }

      const totalPages = needsPage2 ? 2 : 1;
      bodyContent = `<div style="text-align:right;font-size:11px;color:#666;margin-bottom:4px;">Run Card — Page 1 of ${totalPages}</div><div style="clear:both;">${page1Parts.join("\n")}</div>${page2Html}`;
    } else if (sectionLayout) {
      // ── LEGACY SECTION-BASED LAYOUT ──
      const sortedSections = Object.entries(sectionLayout)
        .filter(([id, pos]) => pos.enabled !== false && sectionHtmlMap[id])
        .sort((a, b) => (a[1].y || 0) - (b[1].y || 0));
      bodyContent = `<div class="run-card-num">Run Card 1 of 1</div>` +
        sortedSections.map(([id]) => sectionHtmlMap[id]).filter(Boolean).join("\n");
    } else {
      bodyContent = `<div class="run-card-num">Run Card 1 of 1</div>
        ${sectionHtmlMap.header}
        ${sectionHtmlMap.belongings}
        ${sectionHtmlMap.fedToday}
        ${sectionHtmlMap.medsToday}
        ${sectionHtmlMap.tags}
        ${sectionHtmlMap.emergency}
        ${sectionHtmlMap.notes}
        ${sectionHtmlMap.feeding}
        ${sectionHtmlMap.activityGrid}
        ${sectionHtmlMap.medications}
        ${sectionHtmlMap.bath}`;
    }

    const html = `<!DOCTYPE html><html><head><title>Run Card - ${dName}</title>
      <style>
        @page { size: portrait; margin: 0.4in; }
        body { font-family: Arial, sans-serif; color: #222; padding: 0; margin: 0; font-size: 13px; line-height: 1.4; }
        .card { border: 2px solid #333; padding: 16px; }
        .header { display: flex; gap: 16px; margin-bottom: 8px; }
        .pic { flex-shrink: 0; }
        .header-info { flex: 1; }
        .dog-name { font-size: 26px; font-weight: 900; }
        .owner-last { font-size: 26px; font-weight: 300; }
        .room-badge { font-size: 16px; color: #444; }
        .info-line { margin: 3px 0; font-size: 13px; }
        .section-header { font-weight: 900; font-size: 13px; margin: 10px 0 4px; padding-top: 6px; border-top: 1px solid #ccc; }
        .tag-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 6px 0; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; margin: 6px 0; }
        .tag { display: inline-block; background: #eee; border: 1px solid #999; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
        .icon-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
        .run-card-num { text-align: right; font-size: 11px; color: #666; margin-bottom: 8px; }
      </style></head><body>
      <div class="card">
        ${bodyContent}
      </div>
      <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ── Print Body Check PDF ──────────────────────────────────────
  const printBodyCheck = async () => {
    try {
      // Dynamically load pdf-lib from CDN
      if (!window.PDFLib) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
        document.head.appendChild(script);
        await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
      }
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

      // Fetch the body check template PDF
      const pdfBytes = await fetch("/body-check-template.pdf").then(r => r.arrayBuffer());
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(0);
      const { height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontSize = 11;
      const textColor = rgb(0, 0, 0);

      // Overlay reservation data
      const dName = dog.fields.name || "";
      const roomNum = reservation.room || "";
      const coDate = reservation.checkOut || "";
      const fmtDate = (d) => {
        if (!d) return "";
        const dt = new Date(d + "T00:00:00");
        return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`;
      };

      // Dog Name field: after "Dog Name:" text which ends around x=120
      page.drawText(dName, { x: 125, y: height - 36, size: fontSize, font: boldFont, color: textColor });
      // Room # field: after "Room #:" text which ends around x=310
      page.drawText(roomNum, { x: 325, y: height - 36, size: fontSize, font: boldFont, color: textColor });
      // Check-Out Date field: after "Check-Out Date:" text which ends around x=530
      page.drawText(fmtDate(coDate), { x: 530, y: height - 36, size: fontSize, font: boldFont, color: textColor });

      // Belongings field: print below header row, look for "Belongings:" area
      const bText = belongings || reservation.belongings || "";
      if (bText) {
        // Draw belongings label + text near bottom of form in the belongings section
        page.drawText("Belongings: " + bText, { x: 40, y: height - 56, size: 10, font, color: textColor, maxWidth: 520 });
      }

      // Save and open
      const modifiedPdf = await pdfDoc.save();
      const blob = new Blob([modifiedPdf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      console.error("Body check PDF generation failed:", err);
      alert("Failed to generate body check PDF. Please check that body-check-template.pdf is available.");
    }
  };

  const printRunCardWithBodyCheck = async () => {
    printRunCard();
    await printBodyCheck();
  };

  return (
    <Modal title={isCheckInMode ? `Check In: ${dog.fields.name}` : isCheckOutMode ? `Check Out: ${dog.fields.name}` : `${isBoarding ? "Boarding" : "Daycare"} Reservation: ${dog.fields.name}`} onClose={onClose} wide>
      {/* Header info bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:16}}>
        <span onClick={() => { if (nav) { onClose(); nav("dog-detail", { clientId: client.id, dogId: dog.id }); } }} style={{fontSize:16,fontWeight:800,color:C.pri,cursor:"pointer",textDecoration:"underline",textDecorationColor:C.pri+"40",textUnderlineOffset:2}} onMouseEnter={e => e.currentTarget.style.textDecorationColor = C.pri} onMouseLeave={e => e.currentTarget.style.textDecorationColor = C.pri+"40"}>{dog.fields.name}</span>
        <Badge color="default" size="sm">{dog.fields.breed}</Badge>
        <span style={{fontSize:13,color:C.textSec}}>owned by <strong onClick={() => { if (nav) { onClose(); nav("client-detail", { clientId: client.id }); } }} style={{color:C.pri,cursor:"pointer",textDecoration:"underline",textDecorationColor:C.pri+"40",textUnderlineOffset:2}} onMouseEnter={e => e.currentTarget.style.textDecorationColor = C.pri} onMouseLeave={e => e.currentTarget.style.textDecorationColor = C.pri+"40"}>{client.fields.first_name} {client.fields.last_name}</strong></span>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <Badge color={reservation.status==="checked-in"?"success":reservation.status==="upcoming"?"info":"default"}>{reservation.status==="checked-in"?"Checked In":reservation.status==="upcoming"?"Upcoming":"Checked Out"}</Badge>
          {reservation.roomType && <Badge color="primary">{reservation.roomType} · Room {reservation.room}</Badge>}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:16,gap:0}}>
        <button onClick={()=>setActiveTab("overview")} style={tabStyle(activeTab==="overview")}>Overview</button>
        <button onClick={()=>setActiveTab("activities")} style={tabStyle(activeTab==="activities")}>Activities</button>
        <button onClick={()=>setActiveTab("history")} style={tabStyle(activeTab==="history")}>History</button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div>
          {/* Reservation Compliance */}
          {(() => {
            const agreements = data.agreements || DEF_AGREEMENTS;
            const reqAgrs = agreements.filter(a=>a.required!==false);
            const vaxStatus = getVaxStatus(dog, data.requiredVaccines, data.resortPolicies);
            const ageStatus = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
            const snStatus = getSpayNeuterCompliance(dog);
            const allAgrSigned = reqAgrs.every(a=>agrSigned(client,a.id));
            const toggleExpand = (key) => setComplianceExpand(prev => prev === key ? null : key);
            return (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:8,letterSpacing:"0.03em",textTransform:"uppercase"}}>Reservation Compliance</div>
                <div style={{display:"flex",gap:8,flexWrap:"nowrap"}}>
                  <ComplianceCheckItem ok={vaxStatus.ok} label="Vaccines" expandKey="vax" expanded={complianceExpand==="vax"} onToggle={toggleExpand}
                    detail={vaxStatus.ok?"All up to date":`${[...vaxStatus.expired,...vaxStatus.missing].length} issue${[...vaxStatus.expired,...vaxStatus.missing].length>1?"s":""}`}>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {vaxStatus.ok ? (
                        <div style={{color:C.suc,fontSize:11}}>All vaccines current</div>
                      ) : (
                        <>
                          {vaxStatus.expired.map(vId=>{const vax=VACCINES.find(v=>v.id===vId);return <div key={vId} style={{color:C.dan,fontSize:11}}>• {vax?vax.name:vId.replace(/_/g," ")} — Expired</div>;})}
                          {vaxStatus.missing.map(vId=>{const vax=VACCINES.find(v=>v.id===vId);return <div key={vId} style={{color:C.dan,fontSize:11}}>• {vax?vax.name:vId.replace(/_/g," ")} — Missing</div>;})}
                        </>
                      )}
                      {(data.requiredVaccines||[]).map(vId=>{
                        const curDate = dog.fields[vId] || "";
                        const vax = VACCINES.find(v=>v.id===vId);
                        const vaxName = vax ? vax.name : vId.replace(/_/g," ");
                        return (
                          <div key={vId+"edit"} style={{marginTop:4,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,color:C.textSec,minWidth:100,fontWeight:600}}>{vaxName}</span>
                            <MiniDatePicker value={curDate} onChange={async(v)=>{
                                const newDogs=data.dogs.map(d=>d.id===dog.id?{...d,fields:{...d.fields,[vId]:v}}:d);
                                await save({...data,dogs:newDogs});
                              }}/>
                            {curDate && <span style={{fontSize:10,color:vaxStatus.expired?.includes(vId)?C.dan:C.suc,fontWeight:600}}>{vaxStatus.expired?.includes(vId)?"Expired":"Valid"}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </ComplianceCheckItem>
                  <ComplianceCheckItem ok={!!(ecName?.trim()&&ecPhone?.trim()&&(ecPhone||"").replace(/\D/g,"").length>=10)} label="Emergency Contact" expandKey="ec" expanded={complianceExpand==="ec"} onToggle={toggleExpand}
                    detail={ecName ? ecName : "Not on file"}>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <div><div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"}}>CONTACT NAME</div>
                      <input value={ecName} onChange={e=>setEcName(e.target.value)} disabled={isReadOnly} placeholder="Contact name..." style={{width:"100%",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:14,fontFamily:"inherit",color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",...(isReadOnly?{opacity:0.55,pointerEvents:"none",background:C.bg}:{})}}/></div>
                      <div><div style={{fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"}}>CONTACT PHONE</div>
                      <input value={ecPhone} onChange={e=>setEcPhone(fmtPhoneInput(e.target.value))} disabled={isReadOnly} placeholder="(555) 555-5555" style={{width:"100%",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:14,fontFamily:"inherit",color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",...(isReadOnly?{opacity:0.55,pointerEvents:"none",background:C.bg}:{})}}/></div>
                      {(ecPhone||"").replace(/\D/g,"").length > 0 && (ecPhone||"").replace(/\D/g,"").length < 10 && <div style={{fontSize:11,color:C.dan,fontWeight:600}}>Phone must be a full 10-digit number</div>}
                    </div>
                  </ComplianceCheckItem>
                  <ComplianceCheckItem ok={allAgrSigned} label="Agreements" expandKey="agr" expanded={complianceExpand==="agr"} onToggle={toggleExpand}
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
                                const agrs={...(client.agreements||{}),[ agr.id]:{signed:true,date:todayStr()}};
                                await save({...data,clients:data.clients.map(c=>c.id===client.id?{...c,agreements:agrs}:c)});
                              }}>Sign Now</Btn>
                            ) : (
                              <span style={{fontSize:11,color:C.suc,fontWeight:700}}>✓ Signed</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ComplianceCheckItem>
                  <ComplianceCheckItem ok={ageStatus.ok} warn={ageStatus.grandfathered} label="Dog Age" expandKey="age" expanded={complianceExpand==="age"} onToggle={toggleExpand}
                    detail={ageStatus.age?`${ageStatus.age}yr${ageStatus.grandfathered?" (Grandfathered)":""}`:ageStatus.ok?"N/A":`${ageStatus.age}yr — ${ageStatus.reason}`}>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {ageStatus.age ? (
                        <span style={{color:ageStatus.ok?C.suc:C.dan}}>
                          {ageStatus.age} years old
                          {ageStatus.grandfathered&&` (Grandfathered — ${ageStatus.visitCount || 0} visits)`}
                          {!ageStatus.ok&&!ageStatus.grandfathered&&` — ${ageStatus.reason}`}
                        </span>
                      ) : (
                        <span style={{color:C.textMut}}>Age not set</span>
                      )}
                      <div style={{fontSize:10,color:C.textMut,marginTop:4}}>Max age: {(data.resortPolicies||{}).maxDogAge||13} years. Grandfathered after {(data.resortPolicies||{}).grandfatherVisitThreshold||10} visits.</div>
                    </div>
                  </ComplianceCheckItem>
                  <ComplianceCheckItem ok={snStatus.ok} warn={!snStatus.ok} label="Spay/Neuter" expandKey="sn" expanded={complianceExpand==="sn"} onToggle={toggleExpand}
                    detail={snStatus.ok?(snStatus.status==="Neutered"||snStatus.status==="Spayed"?snStatus.status:(snStatus.privatePlay?"Intact (Private Play)":snStatus.status||"N/A")):`Intact — No group play`}>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <span style={{color:snStatus.ok?C.suc:C.acc,fontSize:11}}>
                        {snStatus.status==="Neutered"||snStatus.status==="Spayed"?`${snStatus.status}`:`Intact${snStatus.ageMonths!=null?` (${snStatus.ageMonths} months old)`:""}`}
                        {snStatus.privatePlay&&" — Private Play assigned"}
                        {!snStatus.ok&&" — Cannot participate in group play (can still check in)"}
                      </span>
                      <div style={{fontSize:10,color:C.textMut,marginTop:2}}>Intact dogs 10+ months old cannot participate in group play but CAN be checked in.</div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                        <span style={{fontSize:10,color:C.textSec,fontWeight:600,minWidth:50}}>Status</span>
                        <select value={dog.fields?.spayed_neutered||""} style={{flex:1,fontSize:11,padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",outline:"none",cursor:"pointer"}}
                          onChange={async(e)=>{await save({...data,dogs:data.dogs.map(d=>d.id===dog.id?{...d,fields:{...d.fields,spayed_neutered:e.target.value}}:d)});}}>
                          <option value="">Unknown</option>
                          <option value="Neutered">Neutered</option>
                          <option value="Spayed">Spayed</option>
                          <option value="Intact">Intact</option>
                        </select>
                      </div>
                      {!snStatus.ok && (
                        <button onClick={async()=>{
                          const curTags = dog.tags || [];
                          if (!curTags.includes("tag_pp")) {
                            const newTags = [...curTags.filter(t => t !== "tag_eval" && t !== "tag_lp" && t !== "tag_sp"), "tag_pp"];
                            await save({...data, dogs: data.dogs.map(d => d.id === dog.id ? {...d, tags: newTags} : d)});
                          }
                        }} style={{padding:"6px 12px",borderRadius:6,border:`1.5px solid ${C.pri}`,background:`${C.pri}08`,color:C.pri,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",width:"fit-content"}}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.pri;e.currentTarget.style.color="#fff";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=`${C.pri}08`;e.currentTarget.style.color=C.pri;}}>
                          Assign Private Play
                        </button>
                      )}
                    </div>
                  </ComplianceCheckItem>
                </div>
              </div>
            );
          })()}

          {/* Read-only banner for completed/active reservations */}
          {isReadOnly && <div style={{padding:"10px 14px",borderRadius:8,background:C.bg,border:`1.5px solid ${C.border}`,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span style={{fontSize:12,fontWeight:600,color:C.textMut}}>{isCheckedIn ? "This reservation is checked in. Most details are locked — dates/times can still be adjusted for early departures or extended stays." : "This reservation is complete. All details are read-only."}</span>
          </div>}

          {/* EOD Mentions During Stay */}
          {(() => {
            const stayMentions = (data.eodEntries || []).flatMap(e => {
              if (!e.date || e.date < reservation.checkIn || (reservation.checkOut && e.date > reservation.checkOut)) return [];
              return (e.mentions || []).filter(m => (m.entityType === "dog" && m.entityId === reservation.dogId) || (m.entityType === "client" && m.entityId === reservation.clientId))
                .map(m => ({ ...m, date: e.date, sections: e.sections }));
            }).sort((a, b) => b.date.localeCompare(a.date));
            if (!stayMentions.length) return null;
            return (
              <div style={{marginBottom:16,padding:"14px 18px",borderRadius:12,border:`2px solid ${C.acc}`,background:C.acc+"08"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span style={{fontSize:14,fontWeight:800,color:C.acc}}>EOD Notes ({stayMentions.length})</span>
                  <span style={{fontSize:11,color:C.textMut}}>during this stay</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {stayMentions.map((m, i) => {
                    const sec = (m.sections || []).find(s => s.id === m.sectionId);
                    const tpl = (data.eodTemplate || DEF_EOD_TEMPLATE).find(t => t.id === m.sectionId);
                    return (
                      <div key={m.id||i} style={{padding:"8px 12px",borderRadius:8,background:"#fff",border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:12,fontWeight:700,color:C.pri}}>{fmtDate(m.date)}</span>
                          {tpl && <span style={{fontSize:11,color:C.textMut}}>{tpl.emoji} {tpl.label}</span>}
                        </div>
                        {sec?.content && <div style={{fontSize:12,color:C.text,marginTop:3,lineHeight:1.5}}>{sec.content.slice(0, 200)}{sec.content.length > 200 ? "…" : ""}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Section: Dates — remain editable when checked in (early departure / extended stay) */}
          {secHeader("Reservation Dates")}
          {isCheckedIn && <div style={{padding:"8px 12px",borderRadius:8,background:C.priLt,border:`1.5px solid ${C.pri}30`,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            <span style={{fontSize:11,fontWeight:600,color:C.pri}}>Dates & times can still be adjusted for early departures or extended stays.</span>
          </div>}
          {isCheckOutMode && reservation.actualCheckInTime && <div style={{padding:"10px 14px",borderRadius:8,background:"#f0fdf4",border:"1.5px solid #bbf7d0",marginBottom:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>Actual Check-In</div>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>{new Date(reservation.actualCheckInTime).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} at {new Date(reservation.actualCheckInTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>Elapsed</div>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>{(() => { const mins = Math.floor((Date.now() - new Date(reservation.actualCheckInTime).getTime()) / 60000); const h = Math.floor(mins / 60); const m = mins % 60; return h > 0 ? `${h}h ${m}m` : `${m}m`; })()}</div>
            </div>
          </div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
            <div><Inp label="Check-In Date" type="date" value={checkIn} onChange={setCheckIn} disabled={datesLocked}/>{checkIn&&<div style={{fontSize:11,color:C.pri,fontWeight:600,marginTop:2}}>{new Date(checkIn+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>}</div>
            <Inp label="Check-In Time" type="time" value={checkInTime} onChange={setCheckInTime} disabled={datesLocked}/>
            <div><Inp label="Check-Out Date" type="date" value={checkOut} onChange={setCheckOut} disabled={datesLocked}/>{checkOut&&<div style={{fontSize:11,color:C.pri,fontWeight:600,marginTop:2}}>{new Date(checkOut+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>}</div>
            <Inp label="Check-Out Time" type="time" value={checkOutTime} onChange={setCheckOutTime} disabled={datesLocked}/>
          </div>

          {/* Section: Check-In Requirements (boarding only) */}
          {isBoarding && <>
            {secHeader(isCheckInMode ? "Check-In Requirements" : "Stay Details")}
            <div style={{padding:"16px 18px",borderRadius:12,border:`1.5px solid ${isCheckInMode?C.acc:C.border}`,background:isCheckInMode?C.accLt+"20":C.bg}}>
              <Inp label={<>Parent Destination {isCheckInMode && <span style={{color:C.dan}}>*</span>}</>} value={parentDest} onChange={v=>{setParentDest(v);setErrors({...errors,parentDestination:undefined});}} placeholder="Where is the parent going during this stay?" disabled={isReadOnly}/>
              {errMsg("parentDestination")}
              <div style={{marginTop:12}}>
                <Inp label={<>Belongings from Home {isCheckInMode && <span style={{color:C.dan}}>*</span>}</>} type="textarea" rows={2} value={belongings} onChange={v=>{setBelongings(v);setErrors({...errors,belongings:undefined});}} placeholder="List items brought from home (bed, toys, food, etc.)" disabled={isReadOnly}/>
                {errMsg("belongings")}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
                <Inp label="Has your pet been fed today?" value={fedToday} onChange={setFedToday} placeholder="Yes / No / Details" disabled={isReadOnly}/>
                <Inp label="Has your pet had medications today?" value={medsToday} onChange={setMedsToday} placeholder="Yes / No / Details" disabled={isReadOnly}/>
              </div>
            </div>
          </>}

          {/* Section: Care Instructions - with structured editors */}
          {secHeader("Care Instructions")}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <FeedingScheduleEditor schedules={feedingSchedules} onChange={setFeedingSchedules} data={data} readOnly={isReadOnly} dogWeight={parseFloat(dog.fields.weight) || 0} dogName={dog.fields.name} dogId={dog.id} onWeightUpdate={(wt, reason) => {
                const now = new Date().toISOString().slice(0,10);
                const logEntry = { date: now, weight: wt, reason, by: profile?.name || "Staff" };
                const updatedDogs = data.dogs.map(d => d.id === dog.id ? { ...d, fields: { ...d.fields, weight: String(wt), weightLastUpdated: now, weightLog: [...(d.fields.weightLog || []), logEntry] } } : d);
                save({ ...data, dogs: updatedDogs });
              }}/>
              {profileHint(summarizeFeeding(profileFeedingSchedules), feedingChanged)}
            </div>
            <div>
              <MedicationScheduleEditor schedules={medicationSchedules} onChange={setMedicationSchedules} data={data} readOnly={isReadOnly} save={save}/>
              {profileHint(summarizeMeds(profileMedicationSchedules), medsChanged)}
            </div>
            {countNights(checkIn,checkOut)>=2&&<div>
              <div style={{padding:"10px 14px",borderRadius:10,border:`1.5px dashed ${C.acc}`,background:C.acc+"08",marginBottom:10,fontSize:12,lineHeight:1.5,color:C.textSec}}>
                <strong style={{color:C.text}}>Bathing Policy:</strong> K9 Operations requires all dogs boarding 2 or more nights receive a bath to ensure every pup goes home smelling and feeling great.
              </div>
              <div style={{fontSize:11,fontWeight:600,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:6}}>Bathing Type <span style={{color:C.dan}}>*</span></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {BATH_OPTS.map(opt=>{
                  const sel=bathType===opt;
                  const isProfile=profileBath===opt;
                  return <button key={opt} onClick={()=>{if(!isReadOnly)setBathType(opt);}} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:"transparent",color:sel?C.pri:C.textSec,fontSize:12,fontWeight:sel?700:500,cursor:isReadOnly?"default":"pointer",fontFamily:"inherit",transition:"all 0.15s",display:"flex",alignItems:"center",gap:4,...(isReadOnly?{opacity:0.55,pointerEvents:"none"}:{})}}>
                    {sel&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    {opt}{isProfile&&<span style={{fontSize:9,color:C.acc,fontWeight:700,marginLeft:2}}>(Profile)</span>}
                  </button>;
                })}
              </div>
              {profileHint(profileBath, bathChanged)}
              {/* Post-bath return option for non-Private Play dogs */}
              {bathType && !(dog.tags || []).includes("tag_pp") && (
                <div style={{marginTop:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:6}}>After Bath on Checkout Day</div>
                  <div style={{fontSize:11,color:C.textMut,marginBottom:6}}>Where should we return {dog.fields.name} after their bath?</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {["Return to Group","Return to Room"].map(opt=>{
                      const sel=postBathReturn===opt;
                      return <button key={opt} onClick={()=>{if(!isReadOnly)setPostBathReturn(sel?"":opt);}} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:"transparent",color:sel?C.pri:C.textSec,fontSize:12,fontWeight:sel?700:500,cursor:isReadOnly?"default":"pointer",fontFamily:"inherit",transition:"all 0.15s",display:"flex",alignItems:"center",gap:4,...(isReadOnly?{opacity:0.55,pointerEvents:"none"}:{})}}>
                        {sel&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        {opt}
                      </button>;
                    })}
                  </div>
                </div>
              )}
            </div>}
          </div>

          {/* Section: Notes */}
          {secHeader("Notes")}
          <Inp type="textarea" rows={2} value={notes} onChange={setNotes} placeholder="Special instructions for this stay..." disabled={isReadOnly}/>

          {/* ─── RECEIPT ─── Clean, unified receipt section ─── */}
          {(() => {
            const pr = calcReservationPricing({ type: reservation.type || "boarding", roomType: reservation.roomType, checkIn, checkOut, checkInTime, checkOutTime, dogs: [dog], dogProfiles: data.dogs, pricing: data.pricing, isSecondDogSameRoom: false, reservation, actualCheckInTime: reservation?.actualCheckInTime });
            // Append bath add-on if bath type is selected and 2+ nights
            if (bathType && countNights(checkIn,checkOut) >= 2) {
              const addOnPrices = getAddOnPrices(data.pricing, data.addOnRules);
              const bathKey = `${bathType} Bath`;
              const bathRate = addOnPrices[bathKey] ?? 0;
              if (bathRate > 0) {
                pr.lineItems.push({ label: `${bathKey}`, rate: bathRate, qty: 1, total: bathRate, isAddon: true });
                pr.subtotal += bathRate;
                pr.total += bathRate;
              }
            }
            // Also append any saved selectedAddOns from the reservation (non-bath add-ons)
            if (reservation.selectedAddOns && Array.isArray(reservation.selectedAddOns)) {
              const addOnPrices2 = getAddOnPrices(data.pricing, data.addOnRules);
              reservation.selectedAddOns.filter(a => !a.endsWith(" Bath")).forEach(addon => {
                const rate = addOnPrices2[addon] ?? 0;
                if (rate > 0) {
                  pr.lineItems.push({ label: addon, rate, qty: 1, total: rate, isAddon: true });
                  pr.subtotal += rate;
                  pr.total += rate;
                }
              });
            }
            let manualDiscount = 0;
            if (discountType === "percent" && discountValue > 0) manualDiscount = Math.round(pr.total * (discountValue / 100) * 100) / 100;
            else if (discountType === "flat" && discountValue > 0) manualDiscount = Math.min(discountValue, pr.total);
            const adjTotal = Math.max(0, Math.round((pr.total - manualDiscount) * 100) / 100);
            const resPmts = (data.payments || []).filter(p => p.reservationId === reservation.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const totalPaid = resPmts.filter(p => p.status === "completed" && p.type !== "refund").reduce((s, p) => s + p.amount, 0);
            const totalRefunded = resPmts.filter(p => p.type === "refund" || p.status === "refunded").reduce((s, p) => s + p.amount, 0);
            // Use live payment data for collected amount (more reliable than stored amountCollected)
            const collected = resPmts.length > 0 ? (totalPaid - totalRefunded) : (reservation.amountCollected || 0);
            const outstanding = Math.max(0, adjTotal - collected);
            const overpayment = collected > adjTotal ? Math.round((collected - adjTotal) * 100) / 100 : 0;
            const needsDeposit = reservation.type === "boarding" || reservation.type === "dayboarding";
            const depositRequired = needsDeposit ? Math.round(adjTotal * 0.5 * 100) / 100 : 0;
            const depositMet = !needsDeposit || collected >= depositRequired;
            const fullPaymentMet = collected >= adjTotal;
            const fmt = (v) => v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`;
            const configuredDiscounts = (data.discounts || []).filter(d => d.active !== false);
            const hasDiscount = discountType !== "none" && discountValue > 0;
            if (adjTotal === 0 && pr.total === 0) return <div style={{marginTop:20,fontSize:13,color:C.textMut,fontStyle:"italic"}}>No charge for this reservation.</div>;

            return (
              <div style={{marginTop:24,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",background:C.surface}}>
                {/* Receipt line items */}
                <div style={{padding:"20px 24px 0"}}>
                  {pr.lineItems.filter(l=>!l.isDogHeader).map((line, i, arr) => {
                    const hasDetail = line.feedDetail || line.medDetail;
                    const isExp = expandedLines[i];
                    return (
                      <div key={i} style={{borderBottom:i<arr.length-1?`1px solid ${C.borderLight||"#f0f0f0"}`:"none"}}>
                        <div onClick={()=>hasDetail&&setExpandedLines(p=>({...p,[i]:!p[i]}))} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",cursor:hasDetail?"pointer":"default"}}>
                          <span style={{fontSize:14,color:line.isAddon?C.textSec:C.text,fontWeight:line.isAddon?500:600,fontStyle:line.isAddon?"italic":"normal",display:"flex",alignItems:"center",gap:4}}>
                            {line.label}
                            {hasDetail&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" style={{transition:"transform 0.15s",transform:isExp?"rotate(180deg)":"rotate(0deg)"}}><polyline points="6 9 12 15 18 9"/></svg>}
                          </span>
                          <span style={{fontSize:14,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmt(line.total)}</span>
                        </div>
                        {hasDetail&&isExp&&<div style={{paddingBottom:8}}><FeedMedBreakdown detail={line.feedDetail||line.medDetail} label={line.feedDetail?"Feeding":"Medication"}/></div>}
                      </div>
                    );
                  })}
                </div>

                {/* Totals section */}
                <div style={{padding:"16px 24px",background:C.bg,borderTop:`1px solid ${C.borderLight||"#f0f0f0"}`}}>
                  {/* Discount row */}
                  {hasDiscount && (
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:13,color:C.suc,fontWeight:600}}>Discount ({discountType==="percent"?`${discountValue}%`:`$${Number(discountValue).toFixed(2)}`})</span>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:13,fontWeight:700,color:C.suc}}>−{fmt(manualDiscount)}</span>
                        {!isReadOnly&&<button onClick={()=>{setDiscountType("none");setDiscountValue(0);}} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,padding:0,display:"flex",fontSize:12}}>✕</button>}
                      </div>
                    </div>
                  )}
                  {/* Add discount link */}
                  {!hasDiscount && !isReadOnly && (
                    <div style={{marginBottom:8,position:"relative"}}>
                      {configuredDiscounts.length > 0 ? (
                        <DiscountPicker discounts={configuredDiscounts} clientId={reservation.clientId} data={data} onSelect={(d) => { setDiscountType(d.type === "percentage" ? "percent" : "flat"); setDiscountValue(d.value); setSelectedDiscountId(d.id); }}/>
                      ) : (
                        <ManualDiscountEntry onApply={(type, value) => { setDiscountType(type); setDiscountValue(value); setSelectedDiscountId(null); }}/>
                      )}
                    </div>
                  )}
                  {/* Total */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"8px 0",borderTop:`1.5px solid ${C.border}`}}>
                    <span style={{fontSize:18,fontWeight:800,color:C.text,letterSpacing:"-0.02em"}}>Total</span>
                    <span style={{fontSize:18,fontWeight:800,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmt(adjTotal)}</span>
                  </div>
                </div>

                {/* Payment summary — clean two-column */}
                <div style={{padding:"16px 24px",borderTop:`1px solid ${C.borderLight||"#f0f0f0"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,color:C.textSec}}>Paid</span>
                    <span style={{fontSize:13,fontWeight:700,color:collected <= 0 ? C.dan : depositMet ? C.suc : C.acc,fontVariantNumeric:"tabular-nums"}}>{fmt(collected)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:13,color:outstanding>0?C.text:overpayment>0?C.warn:C.suc,fontWeight:600}}>{outstanding>0?"Balance Due":overpayment>0?"Credit (Overpayment)":"Paid in Full"}</span>
                    <span style={{fontSize:13,fontWeight:800,color:outstanding>0?C.text:overpayment>0?C.warn:C.suc,fontVariantNumeric:"tabular-nums"}}>{outstanding>0?fmt(outstanding):overpayment>0?fmt(overpayment):"✓"}</span>
                  </div>
                  {overpayment > 0 && (
                    <div style={{marginTop:8,padding:"8px 12px",background:C.warnLt,borderRadius:8,border:`1px solid ${C.warn}30`,fontSize:12,fontWeight:600,color:C.warn}}>
                      Stay shortened — {fmt(overpayment)} overpaid. Consider issuing a refund.
                    </div>
                  )}

                  {/* Warnings — subtle inline */}
                  {isCheckInMode && !depositMet && <div style={{marginTop:10,fontSize:12,fontWeight:600,color:C.dan}}>50% deposit required to check in (min ${fmt(depositRequired)})</div>}
                  {isCheckOutMode && !fullPaymentMet && <div style={{marginTop:10,fontSize:12,fontWeight:600,color:C.dan}}>Full payment required to check out — {fmt(outstanding)} outstanding</div>}

                  {/* Apply Coupons as Deposit Section */}
                  {(() => {
                    const clientSales = (data.packageSales || []).filter(s => s.clientId === reservation.clientId && s.status === "active" && (s.unitsRemaining || 0) - (s.used || 0) > 0);
                    const eligibleSales = clientSales.filter(s => {
                      const pkg = (data.packages || []).find(p => p.id === s.packageId);
                      return pkg && (pkg.serviceCategory === "Boarding" || (pkg.serviceNames || [pkg.serviceName]).some(n => (reservation.roomType || "").toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes("boarding") || n.toLowerCase().includes(reservation.roomType.toLowerCase())));
                    });
                    if (eligibleSales.length === 0) return null;
                    const totalCouponValue = appliedCoupons.reduce((sum, c) => sum + (c.value || 0), 0);
                    return (
                      <div style={{marginTop:12,marginBottom:12,padding:"12px 0",borderTop:`1px solid ${C.borderLight||"#f0f0f0"}`,borderBottom:`1px solid ${C.borderLight||"#f0f0f0"}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><path d="M14 2h6a2 2 0 0 1 2 2v6"/></svg>
                          <span style={{fontSize:13,fontWeight:700,color:C.info}}>Apply Coupons as Deposit</span>
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
                                  <div style={{fontSize:12,fontWeight:600,color:C.text}}>{sale.packageName || pkg?.name || "Package"}</div>
                                  <div style={{fontSize:10,color:C.textMut}}>{remaining} unit{remaining !== 1 ? "s" : ""} remaining · ${unitRate.toFixed(2)}/unit</div>
                                </div>
                                {applied ? (
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{fontSize:12,fontWeight:700,color:C.info}}>{applied.unitsToUse} unit{applied.unitsToUse !== 1 ? "s" : ""} (${applied.value.toFixed(2)})</span>
                                    <button onClick={() => setAppliedCoupons(prev => prev.filter(c => c.saleId !== sale.id))} style={{background:"none",border:"none",cursor:"pointer",color:C.dan,padding:2}}><I.X size={14}/></button>
                                  </div>
                                ) : (
                                  <Btn size="sm" variant="secondary" onClick={() => {
                                    const depositNeeded = adjTotal * 0.5;
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
                          <div style={{marginTop:8,padding:"8px 12px",background:C.sucLt,borderRadius:8,fontSize:12,fontWeight:600,color:C.suc}}>
                            Coupons applied: ${totalCouponValue.toFixed(2)} toward deposit
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Payment history */}
                  {resPmts.length > 0 && (
                    <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.borderLight||"#f0f0f0"}`}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Transactions</div>
                      {resPmts.map(p => (
                        <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.borderLight||"#f0f0f0"}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{width:6,height:6,borderRadius:3,background:p.type==="refund"?C.dan:p.status==="completed"?C.suc:"#f59e0b",flexShrink:0}}/>
                            <span style={{fontSize:13,fontWeight:600,color:C.text}}>{fmt(p.amount)}</span>
                            <span style={{fontSize:12,color:C.textMut}}>{p.method==="card"?`····${p.cardLast4||""}`:p.method}</span>
                          </div>
                          <span style={{fontSize:12,color:C.textMut}}>{new Date(p.timestamp).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Payment accordion — inline expansion */}
                  {reservation.status !== "checked-out" && reservation.status !== "cancelled" && (
                    <div style={{marginTop:14}}>
                      {/* Toggle buttons */}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={() => {
                          if (payExpanded && payMode === "pay") { setPayExpanded(false); return; }
                          setPayMode("pay");
                          const depAmt = isCheckInMode ? Math.max(0, depositRequired - collected) : outstanding > 0 ? outstanding : 0;
                          setPayAmount(depAmt > 0 ? depAmt.toFixed(2) : "");
                          setPayMethod("card");
                          // Auto-select saved card if available (fixes B.9)
                          const _savedCards = client.savedCards || [];
                          const _defCard = _savedCards.find(c => c.isDefault) || _savedCards[0];
                          if (_defCard) {
                            setPaySelectedCard(_defCard.id);
                            setPayCard4(_defCard.last4 || "");
                            setPayCardBrand(_defCard.brand || "visa");
                          } else {
                            setPaySelectedCard("new");
                            setPayCard4("");
                            setPayCardBrand("visa");
                          }
                          setPayTip("");
                          setPayNote("");
                          setPayErr("");
                          setPayExpanded(true);
                        }} style={{padding:"8px 16px",borderRadius:10,border:"none",background:C.pri,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,transition:"opacity 0.15s"}}
                          onMouseEnter={e=>e.currentTarget.style.opacity="0.9"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                          <I.DollarSign/>{isCheckInMode?"Collect Deposit":isCheckOutMode?"Collect Balance":"Collect Payment"}
                        </button>
                        {totalPaid>0&&<button onClick={() => {
                          if (payExpanded && payMode === "refund") { setPayExpanded(false); return; }
                          setPayMode("refund");
                          setPayAmount("");
                          setPayMethod("card");
                          setPayErr("");
                          setPayExpanded(true);
                        }} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textSec,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                          <I.RefreshCw/>Refund
                        </button>}
                      </div>

                      {/* Accordion content */}
                      <div style={{overflow:"hidden",maxHeight:payExpanded?1200:0,transition:"max-height 0.3s ease",opacity:payExpanded?1:0,transitionProperty:"max-height, opacity"}}>
                        <div style={{padding:"16px 0 0"}}>
                          {payErr && <div style={{color:C.dan,fontSize:13,fontWeight:600,marginBottom:12,padding:"8px 12px",background:C.danLt,borderRadius:8}}>{payErr}</div>}

                          {/* Amount */}
                          <div style={{marginBottom:12}}>
                            <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Amount</label>
                            <div style={{position:"relative"}}>
                              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.textMut,fontWeight:600}}>$</span>
                              <input type="number" step="0.01" value={payAmount} onChange={e=>{setPayAmount(e.target.value);setPayErr("");}} placeholder="0.00" style={{width:"100%",padding:"8px 12px 8px 28px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:14,color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                            </div>
                          </div>

                          {payMode !== "refund" && <>
                            {/* Payment Method pills */}
                            <div style={{marginBottom:12}}>
                              <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:6}}>Method</label>
                              <div style={{display:"flex",gap:6}}>
                                {[{v:"card",l:"Card",icon:<I.CreditCard size={14}/>},{v:"cash",l:"Cash",icon:<I.DollarSign size={14}/>},{v:"check",l:"Check",icon:<I.FileText size={14}/>}].map(m=>(
                                  <button key={m.v} onClick={()=>{setPayMethod(m.v);setPaySelectedCard(null);}} style={{flex:1,padding:"8px 0",borderRadius:8,border:`1.5px solid ${payMethod===m.v?C.pri:C.border}`,background:payMethod===m.v?C.priLt:"transparent",color:payMethod===m.v?C.pri:C.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.15s"}}>
                                    {m.icon}{m.l}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Card selection */}
                            {payMethod === "card" && (() => {
                              const savedCards = client.savedCards || [];
                              return (
                                <div style={{marginBottom:12}}>
                                  {savedCards.length > 0 && <>
                                    <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:6}}>Saved Cards</label>
                                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
                                      {savedCards.map(card => (
                                        <button key={card.id} onClick={()=>{setPaySelectedCard(card.id);setPayCard4(card.last4);setPayCardBrand(card.brand);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${paySelectedCard===card.id?C.pri:C.border}`,background:paySelectedCard===card.id?C.priLt:C.surface,cursor:"pointer",fontFamily:"inherit",textAlign:"left",width:"100%",transition:"all 0.15s"}}>
                                          <div style={{width:32,height:20,borderRadius:4,background:C.bg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:C.textSec,textTransform:"uppercase",flexShrink:0}}>{card.brand?.slice(0,4)||"Card"}</div>
                                          <span style={{fontSize:12,fontWeight:600,color:C.text}}>····{card.last4}</span>
                                          <span style={{fontSize:11,color:C.textMut}}>{String(card.expMonth).padStart(2,"0")}/{String(card.expYear).slice(-2)}</span>
                                          {card.isDefault && <span style={{fontSize:9,fontWeight:700,color:C.suc,background:C.sucLt,padding:"2px 6px",borderRadius:4,textTransform:"uppercase",whiteSpace:"nowrap"}}>Default</span>}
                                          <div style={{marginLeft:"auto",flexShrink:0}}>
                                            {paySelectedCard===card.id ? <svg width="16" height="16" viewBox="0 0 24 24" fill={C.pri} stroke="white" strokeWidth="3"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg> : <div style={{width:16,height:16,borderRadius:8,border:`2px solid ${C.border}`}}/>}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </>}

                                  {/* New card option or default if no saved cards */}
                                  <button onClick={()=>setPaySelectedCard("new")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px dashed ${paySelectedCard==="new"||(!paySelectedCard&&savedCards.length===0)?C.pri:C.border}`,background:paySelectedCard==="new"||(!paySelectedCard&&savedCards.length===0)?C.priLt:C.surface,cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"left",transition:"all 0.15s"}}>
                                    <div style={{width:32,height:20,borderRadius:4,border:`1.5px dashed ${C.pri}`,display:"flex",alignItems:"center",justifyContent:"center",color:C.pri,flexShrink:0}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
                                    <span style={{fontSize:12,fontWeight:600,color:C.pri}}>New Card</span>
                                    <div style={{marginLeft:"auto",flexShrink:0}}>
                                      {(paySelectedCard==="new"||(!paySelectedCard&&savedCards.length===0)) ? <svg width="16" height="16" viewBox="0 0 24 24" fill={C.pri} stroke="white" strokeWidth="3"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg> : <div style={{width:16,height:16,borderRadius:8,border:`2px solid ${C.border}`}}/>}
                                    </div>
                                  </button>

                                  {/* New card fields */}
                                  {(paySelectedCard === "new" || (!paySelectedCard && savedCards.length === 0)) && (
                                    <div style={{marginTop:10,padding:"12px",background:C.bg,borderRadius:8,border:`1px solid ${C.border}`}}>
                                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                                        <div>
                                          <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Last 4 Digits</label>
                                          <input maxLength={4} value={payCard4} onChange={e=>setPayCard4(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="0000" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:13,color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                                        </div>
                                        <div>
                                          <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Brand</label>
                                          <div style={{display:"flex",gap:4}}>
                                            {["visa","mc","amex","disc"].map(b=>(
                                              <button key={b} onClick={()=>setPayCardBrand(b)} style={{flex:1,padding:"7px 0",borderRadius:6,border:`1.5px solid ${payCardBrand===b?C.pri:C.border}`,background:payCardBrand===b?C.priLt:"transparent",color:payCardBrand===b?C.pri:C.textMut,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",transition:"all 0.15s"}}>{b}</button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:11,fontWeight:600,color:C.text}}>
                                        <input type="checkbox" checked={paySaveCard} onChange={e=>setPaySaveCard(e.target.checked)} style={{accentColor:C.pri,width:15,height:15,cursor:"pointer"}}/>
                                        Save card on file
                                      </label>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </>}

                          {/* Staff + Tip row */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                            <div>
                              <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Staff Initials</label>
                              <input maxLength={3} value={payStaff} onChange={e=>setPayStaff(e.target.value.toUpperCase())} placeholder="e.g. ZN" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:13,color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                            </div>
                            <div>
                              <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Tip ($)</label>
                              <input type="number" step="0.01" value={payTip} onChange={e=>setPayTip(e.target.value)} placeholder="0.00" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:13,color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                            </div>
                          </div>

                          {/* Note */}
                          <div style={{marginBottom:12}}>
                            <label style={{fontSize:11,fontWeight:600,color:C.textSec,display:"block",marginBottom:4}}>Note (optional)</label>
                            <input value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="Optional note..." style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:13,color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                          </div>

                          {/* Action buttons */}
                          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                            <button onClick={()=>setPayExpanded(false)} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"opacity 0.15s"}}
                              onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                              Cancel
                            </button>
                            <button onClick={handlePaymentSubmit} style={{padding:"8px 16px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"opacity 0.15s"}}
                              onMouseEnter={e=>e.currentTarget.style.opacity="0.9"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                              {payMode==="refund"?"Issue Refund":"Confirm Payment"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 2: ACTIVITIES */}
      {activeTab === "activities" && (
        <div>
          {secHeader("Daily Activities")}
          {(() => {
            const { days, cols } = buildActivityMatrix();
            const isLocked = reservation.status === "checked-out" || reservation.status === "cancelled";
            if (days.length === 0) return <div style={{fontSize:13,color:C.textMut,fontStyle:"italic"}}>No activities scheduled</div>;
            if (cols.length === 0) return <div style={{fontSize:13,color:C.textMut,fontStyle:"italic"}}>No feeding, medication, or bathing scheduled</div>;

            const CONSUMPTION_OPTS = ["","0%","25%","50%","75%","100%"];
            const logKey = (day, col) => `${day}|${col.key}`;
            const getLog = (day, col) => activityLog[logKey(day, col)] || {};
            const updateLog = (day, col, updates) => {
              if (isLocked) return;
              const key = logKey(day, col);
              const prev = activityLog[key] || {};
              const next = { ...prev, ...updates };
              setActivityLog({ ...activityLog, [key]: next });
            };
            const staffName = profile ? (profile.full_name || profile.email || "Staff") : "Staff";

            return (
              <div style={{overflowX:"auto"}}>
                {isLocked && <div style={{padding:"8px 12px",background:C.bg,borderRadius:8,border:`1px solid ${C.border}`,marginBottom:10,fontSize:12,color:C.textSec,display:"flex",alignItems:"center",gap:6}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Activities are locked after checkout (read-only)
                </div>}
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${C.border}`}}>
                      <th style={{padding:"10px 12px",textAlign:"left",fontWeight:700,color:C.text,position:"sticky",left:0,background:C.surface,zIndex:1,minWidth:110}}>Date</th>
                      {cols.map(col => (
                        <th key={col.key} style={{padding:"10px 12px",textAlign:"center",fontWeight:700,color:C.text,minWidth:140}}>
                          <div>{String(col.label || "")}</div>
                          {col.detail && <div style={{fontSize:10,fontWeight:500,color:C.textSec,marginTop:2}}>{typeof col.detail === "object" ? JSON.stringify(col.detail) : String(col.detail)}</div>}
                          {col.instruction && <div style={{fontSize:10,fontWeight:500,color:C.textMut,marginTop:1}}>{typeof col.instruction === "object" ? JSON.stringify(col.instruction) : String(col.instruction)}</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day, di) => {
                      const isToday = day === todayStr();
                      return (
                        <tr key={day} style={{borderBottom:`1px solid ${C.borderLight}`,background:isToday?C.priLt:"transparent"}}>
                          <td style={{padding:"10px 12px",fontWeight:700,color:C.pri,position:"sticky",left:0,background:isToday?C.priLt:C.surface,zIndex:1,whiteSpace:"nowrap"}}>
                            <div style={{fontSize:13}}>{new Date(day+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
                            {isToday && <div style={{fontSize:9,fontWeight:800,color:C.pri,textTransform:"uppercase",letterSpacing:"0.06em"}}>Today</div>}
                          </td>
                          {cols.map(col => {
                            const active = col.activeDays[di];
                            if (!active) return <td key={col.key} style={{padding:"10px 12px",textAlign:"center",color:C.textMut}}>—</td>;
                            const entry = getLog(day, col);
                            const administered = !!entry.administered;
                            return (
                              <td key={col.key} style={{padding:"8px 10px",textAlign:"center",verticalAlign:"top",background:administered?C.suc+"10":"transparent"}}>
                                {/* Administered checkbox */}
                                <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,cursor:isLocked?"default":"pointer",marginBottom:col.type==="feeding"?6:0}}>
                                  <input type="checkbox" checked={administered} disabled={isLocked} style={{accentColor:C.suc,width:15,height:15,cursor:isLocked?"default":"pointer"}}
                                    onChange={e => {
                                      if (isLocked) return;
                                      if (e.target.checked) {
                                        updateLog(day, col, { administered: true, by: staffName, at: new Date().toISOString() });
                                      } else {
                                        updateLog(day, col, { administered: false, by: "", at: "" });
                                      }
                                    }} />
                                  <span style={{fontSize:11,fontWeight:600,color:administered?C.suc:C.textMut}}>
                                    {administered ? "Done" : "Administered"}
                                  </span>
                                </label>
                                {administered && entry.by && (
                                  <div style={{fontSize:9,color:C.suc,marginBottom:col.type==="feeding"?4:0}}>
                                    by {entry.by}{entry.at ? ` · ${new Date(entry.at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}` : ""}
                                  </div>
                                )}
                                {/* Consumption tracker — feeding only */}
                                {col.type === "feeding" && (
                                  <div style={{marginTop:2}}>
                                    <div style={{fontSize:9,fontWeight:600,color:C.textMut,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.04em"}}>Ate</div>
                                    <div style={{display:"flex",gap:2,justifyContent:"center",flexWrap:"wrap"}}>
                                      {CONSUMPTION_OPTS.filter(o=>o).map(opt => {
                                        const sel = entry.consumption === opt;
                                        return (
                                          <button key={opt} onClick={() => { if (!isLocked) updateLog(day, col, { consumption: sel ? "" : opt }); }} disabled={isLocked}
                                            style={{padding:"3px 6px",borderRadius:5,border:`1.5px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:"transparent",color:sel?C.pri:C.textSec,fontSize:10,fontWeight:sel?700:500,cursor:isLocked?"default":"pointer",fontFamily:"inherit",minWidth:28,opacity:isLocked?0.6:1}}>
                                            {opt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {col.notes && <div style={{fontSize:9,fontStyle:"italic",color:C.textMut,marginTop:3}}>{typeof col.notes === "object" ? JSON.stringify(col.notes) : String(col.notes)}</div>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 3: HISTORY */}
      {activeTab === "history" && (
        <div>
          {secHeader("Reservation History")}
          {(() => {
            const safeStr = (v) => {
              if (v == null) return "";
              if (typeof v === "object") return JSON.stringify(v);
              return String(v);
            };
            const logs = (data.auditLog || [])
              .filter(e => e.reservationId === reservation.id)
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (logs.length === 0) return <div style={{fontSize:13,color:C.textMut,fontStyle:"italic",padding:"20px 0"}}>No history entries for this reservation.</div>;
            return logs.map(entry => (
              <div key={safeStr(entry.id)} style={{padding:"14px 16px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Badge color={safeStr(entry.action).includes("Check") ? "success" : safeStr(entry.action).includes("Cancel") ? "danger" : "info"} size="sm">{safeStr(entry.action)}</Badge>
                    <span style={{fontSize:12,color:C.textSec}}>by {safeStr(entry.userName)}</span>
                  </div>
                  <span style={{fontSize:11,color:C.textMut}}>{entry.timestamp ? new Date(entry.timestamp).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}) : ""}</span>
                </div>
                {Array.isArray(entry.details) && entry.details.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
                    {entry.details.map((d, di) => (
                      <div key={di} style={{fontSize:12,display:"flex",gap:6,alignItems:"baseline",color:C.textSec}}>
                        <span style={{fontWeight:600,color:C.text,minWidth:100}}>{safeStr(d.field)}</span>
                        <span style={{textDecoration:"line-through",color:C.dan}}>{safeStr(d.oldVal)}</span>
                        <span style={{color:C.textMut}}>→</span>
                        <span style={{fontWeight:600,color:C.suc}}>{safeStr(d.newVal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ));
          })()}
        </div>
      )}

      {/* Footer */}
      {errors.deposit && <div style={{color:C.dan,fontSize:13,fontWeight:600,marginTop:8,padding:"8px 14px",background:C.danLt,borderRadius:8}}>{errors.deposit}</div>}
      {errors.payment && <div style={{color:C.dan,fontSize:13,fontWeight:600,marginTop:8,padding:"8px 14px",background:C.danLt,borderRadius:8}}>{errors.payment}</div>}
      {(errors.compliance_vaccines || errors.compliance_ec || errors.compliance_agreements || errors.compliance_age || errors.reservation_date) && (
        <div style={{marginTop:8,padding:"10px 14px",background:C.danLt,borderRadius:8,border:`1px solid ${C.dan}30`}}>
          <div style={{fontSize:13,fontWeight:700,color:C.dan,marginBottom:4}}>⚠ Check-in blocked — resolve the following:</div>
          {errors.reservation_date && <div style={{fontSize:12,color:C.dan,marginTop:2}}>• {errors.reservation_date}</div>}
          {errors.compliance_vaccines && <div style={{fontSize:12,color:C.dan,marginTop:2}}>• {errors.compliance_vaccines}</div>}
          {errors.compliance_ec && <div style={{fontSize:12,color:C.dan,marginTop:2}}>• {errors.compliance_ec}</div>}
          {errors.compliance_agreements && <div style={{fontSize:12,color:C.dan,marginTop:2}}>• {errors.compliance_agreements}</div>}
          {errors.compliance_age && <div style={{fontSize:12,color:C.dan,marginTop:2}}>• {errors.compliance_age}</div>}
        </div>
      )}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:24,alignItems:"center"}}>
        {reservation.status !== "checked-out" && reservation.status !== "cancelled" && (
          <button onClick={()=>setShowCancelConfirm(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",borderRadius:8,border:`1px solid ${C.danLt}`,background:"transparent",color:C.dan,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginRight:"auto"}}><I.Trash/> Cancel Reservation</button>
        )}
        {isBoarding && reservation.status !== "checked-out" && reservation.status !== "cancelled" && (
          <>
            <button onClick={printRunCard} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:`1.5px solid ${C.pri}`,background:C.priLt||"#EBF5FF",color:C.pri,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print Run Card
            </button>
            <button onClick={printRunCardWithBodyCheck} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:`1.5px solid ${C.acc||"#F59E0B"}`,background:(C.accLt||"#FFF8E1"),color:C.acc||"#F59E0B",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Print + Body Check
            </button>
          </>
        )}
        <Btn variant="secondary" onClick={() => { if (!isReadOnly || isCheckedIn) { handleSave(false, false); } onClose(); }}>Close{(!isReadOnly || isCheckedIn) ? " & Save" : ""}</Btn>
        {isCheckOutMode ? (
          <>{checkoutPaymentBlocked && <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,fontSize:12,color:"#DC2626",fontWeight:600,marginRight:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Collect ${checkoutOutstanding.toFixed(2)} to check out
          </div>}
          <Btn variant="accent" onClick={()=>handleSave(false, true)} icon={<I.LogOut/>} disabled={checkoutPaymentBlocked} style={checkoutPaymentBlocked ? {opacity:0.5,cursor:"not-allowed"} : {}} title={checkoutPaymentBlocked ? `Full payment required — $${checkoutOutstanding.toFixed(2)} outstanding` : ""}>Check Out</Btn></>
        ) : isCheckedIn ? (
          <Btn onClick={()=>handleSave(false, false)}>Save Date Changes</Btn>
        ) : !isReadOnly && (isCheckInMode ? (
          <>{complianceBlocked && <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,fontSize:12,color:"#DC2626",fontWeight:600,marginRight:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Resolve: {complianceFailures.join(", ")}
          </div>}
          <Btn variant="success" onClick={()=>handleSave(true, false)} icon={<I.LogIn/>} disabled={complianceBlocked} style={complianceBlocked ? {opacity:0.5,cursor:"not-allowed"} : {}} title={complianceBlocked ? "Resolve: " + complianceFailures.join(", ") : ""}>Check In</Btn></>
        ) : (
          <Btn onClick={()=>handleSave(false, false)}>Save Changes</Btn>
        ))}
      </div>

      {/* Early Check-in Date Adjustment Popup */}
      {showDateAdjustPopup && (() => {
        const today = new Date().toISOString().split('T')[0];
        const daysEarly = Math.floor((new Date(checkIn + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
        const confirmDateAdjust = async (shouldAdjust) => {
          if (shouldAdjust) {
            // Adjust date to today and add audit log entry
            const oldCheckIn = checkIn;
            const newCheckIn = today;

            // Create updated reservation with adjusted date
            const adjustedRes = {
              ...reservation,
              parentDestination: parentDest,
              belongings,
              fedToday, medsToday,
              checkIn: newCheckIn, checkOut, checkInTime, checkOutTime,
              notes,
              careOverrides: {
                feedingSchedules, medicationSchedules,
                bath_type: bathType,
                postBathReturn,
                feeding: summarizeFeeding(feedingSchedules),
                medications: summarizeMeds(medicationSchedules)
              },
              emergencyContactOverride: (ecName !== clientEcName || ecPhone !== clientEcPhone) ? { name: ecName, phone: ecPhone } : reservation.emergencyContactOverride || null,
              discountType: discountType !== "none" ? discountType : undefined,
              discountValue: discountType !== "none" ? discountValue : undefined,
              discountId: selectedDiscountId || undefined,
              ...(appliedCoupons.length > 0 ? { appliedCoupons: appliedCoupons.map(c => ({ saleId: c.saleId, unitsUsed: c.unitsToUse, value: c.value })) } : {}),
              activityLog,
              status: "checked-in",
              actualCheckInTime: new Date().toISOString(),
              checkedInBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff",
            };

            // Check compliance with new date
            const errs = {};
            if (!ecName?.trim() || !ecPhone?.trim()) { errs.compliance_ec = "Emergency contact name and phone are required"; } else if ((ecPhone||"").replace(/\D/g,"").length < 10) { errs.compliance_ec = "Emergency contact phone must be a full 10-digit number"; }
            const agreements = data.agreements || DEF_AGREEMENTS;
            const reqAgrs = agreements.filter(a => a.required !== false);
            const allAgrSigned = reqAgrs.every(a => agrSigned(client, a.id));
            if (!allAgrSigned) {
              const unsigned = reqAgrs.filter(a => !agrSigned(client, a.id)).map(a => a.name);
              errs.compliance_agreements = `Unsigned agreements: ${unsigned.join(", ")}`;
            }
            const vaxStatus = getVaxStatus(dog, data.requiredVaccines, data.resortPolicies);
            if (!vaxStatus.ok) {
              const issues = [...(vaxStatus.expired || []), ...(vaxStatus.missing || [])].map(v => v.replace(/_/g, " "));
              errs.compliance_vaccines = `Vaccines not compliant: ${issues.join(", ")}`;
            }
            const ageStatus = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
            if (!ageStatus.ok) errs.compliance_age = ageStatus.reason || "Dog does not meet age requirements";

            if (Object.keys(errs).length > 0) {
              setErrors(errs);
              setShowDateAdjustPopup(false);
              return;
            }

            setShowDateAdjustPopup(false);
            onSave(adjustedRes, true, false);
          } else {
            setShowDateAdjustPopup(false);
          }
        };

        return (
          <Modal title="Adjust Reservation Date?" onClose={() => setShowDateAdjustPopup(false)}>
            <div style={{padding:"0"}}>
              <div style={{padding:"16px 20px",background:C.infLt,borderRadius:8,marginBottom:16,border:`1px solid ${C.inf}30`}}>
                <div style={{fontSize:14,fontWeight:700,color:C.inf,marginBottom:6}}>{dog.fields.name} is scheduled for {daysEarly} day{daysEarly > 1 ? 's' : ''} from now</div>
                <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>Reservation date: <strong>{checkIn}</strong> → Today: <strong>{today}</strong></div>
              </div>
              <p style={{fontSize:14,color:C.text,margin:"0 0 20px",lineHeight:1.6}}>Would you like to adjust the reservation date to today and proceed with check-in?</p>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={() => confirmDateAdjust(false)} style={{padding:"8px 20px",borderRadius:8,border:`1.5px solid ${C.border}`,background:"transparent",color:C.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                <button onClick={() => confirmDateAdjust(true)} style={{padding:"8px 20px",borderRadius:8,border:"none",background:C.inf,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Adjust Date & Check In</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Cancel Reservation Confirmation */}
      {showCancelConfirm && (() => {
        const collected = reservation.amountCollected || 0;
        const hasCoupons = (reservation.appliedCoupons || []).length > 0;
        const checkInDate = new Date(reservation.checkIn + "T00:00:00");
        const hoursUntil = (checkInDate - new Date()) / 3600000;
        const within72 = hoursUntil >= 72;
        const cancelPolicyDays = (data.resortPolicies || {}).cancellationNoticeDays || 3;
        const withinPolicy = hoursUntil >= cancelPolicyDays * 24;
        return (
          <Modal title="Cancel Reservation" onClose={()=>setShowCancelConfirm(false)} wide>
            {/* Policy header */}
            <div style={{padding:"12px 16px",borderRadius:10,background:C.danLt,border:`1px solid ${C.dan}30`,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:C.dan,marginBottom:4}}>K9 Operations Cancellation Policy</div>
              <div style={{fontSize:12,color:C.text,lineHeight:1.5}}>Deposits are non-refundable. Exceptions may be made at management discretion. Team members must notify management when issuing refunds.</div>
            </div>

            <p style={{fontSize:14,color:C.text,lineHeight:1.6,margin:"0 0 8px"}}>
              Cancel reservation for <strong>{dog.fields.name}</strong> · {reservation.roomType ? `${reservation.roomType} · ` : ""}{fmtDate(reservation.checkIn)} — {fmtDate(reservation.checkOut)}
            </p>

            {/* Recommendation based on notice period */}
            <div style={{padding:"10px 14px",borderRadius:8,background:withinPolicy ? C.sucLt : C.warnLt,border:`1px solid ${withinPolicy ? C.suc : C.warn}30`,marginBottom:16,fontSize:12,color:C.text,lineHeight:1.5}}>
              <strong style={{color: withinPolicy ? C.suc : C.warn}}>
                {withinPolicy ? "Recommendation: Return deposit as store credit" : "Recommendation: Keep deposit (non-refundable)"}
              </strong>
              <div style={{marginTop:2}}>
                {withinPolicy
                  ? `Client gave ${Math.round(hoursUntil)} hours notice (meets the ${cancelPolicyDays * 24}-hour policy). Consider returning their deposit as store credit.`
                  : `Client gave only ${Math.round(Math.max(0, hoursUntil))} hours notice (less than ${cancelPolicyDays * 24}-hour policy). Deposit is non-refundable per policy.`}
              </div>
            </div>

            {/* Deposit refund options */}
            {collected > 0 && !hasCoupons && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Deposit: ${collected.toFixed(2)} — How to handle?</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[
                    { id: "keep", label: "Keep Deposit", desc: "Non-refundable per policy. No refund issued.", color: C.textSec },
                    { id: "store-credit", label: "Refund as Store Credit", desc: `Issue $${collected.toFixed(2)} store credit to client's account.`, color: C.info },
                    { id: "card", label: "Return to Card", desc: "Issue a refund to original payment method. Requires management approval.", color: C.warn },
                  ].map(opt => (
                    <label key={opt.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderRadius:8,border:`1.5px solid ${cancelRefundOption === opt.id ? opt.color : C.border}`,background:cancelRefundOption === opt.id ? opt.color + "10" : "transparent",cursor:"pointer"}}>
                      <input type="radio" name="cancelRefund" checked={cancelRefundOption === opt.id} onChange={() => setCancelRefundOption(opt.id)} style={{marginTop:3}} />
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:C.text}}>{opt.label}</div>
                        <div style={{fontSize:11,color:C.textMut}}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Coupon return options */}
            {hasCoupons && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Coupons Applied — Return to account?</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[
                    { id: "return", label: "Return Coupons", desc: "Return coupons to client's account with original expiration dates.", color: C.suc },
                    { id: "forfeit", label: "Forfeit Coupons", desc: "Do not return coupons. They will not be added back.", color: C.dan },
                  ].map(opt => (
                    <label key={opt.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderRadius:8,border:`1.5px solid ${cancelCouponOption === opt.id ? opt.color : C.border}`,background:cancelCouponOption === opt.id ? opt.color + "10" : "transparent",cursor:"pointer"}}>
                      <input type="radio" name="cancelCoupon" checked={cancelCouponOption === opt.id} onChange={() => setCancelCouponOption(opt.id)} style={{marginTop:3}} />
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:C.text}}>{opt.label}</div>
                        <div style={{fontSize:11,color:C.textMut}}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn variant="secondary" onClick={()=>setShowCancelConfirm(false)}>Keep Reservation</Btn>
              <Btn variant="danger" onClick={async ()=>{
                const auditDiffs = [{field:"Status",oldVal:reservation.status==="checked-in"?"Checked In":"Upcoming",newVal:"Cancelled"}];
                let updatedSales = data.packageSales || [];
                let updatedClients = data.clients;

                // Handle coupon returns
                if (hasCoupons && cancelCouponOption === "return") {
                  (reservation.appliedCoupons || []).forEach(ac => {
                    updatedSales = updatedSales.map(s => s.id === ac.saleId ? { ...s, used: Math.max(0, (s.used || 0) - ac.unitsUsed), unitsRemaining: (s.unitsRemaining || 0) + ac.unitsUsed } : s);
                  });
                  auditDiffs.push({field:"Coupons",oldVal:"Applied",newVal:"Returned to account"});
                }

                // Handle deposit refund
                if (collected > 0 && cancelRefundOption === "store-credit") {
                  updatedClients = updatedClients.map(c => c.id === reservation.clientId ? { ...c, storeCredit: (c.storeCredit || 0) + collected } : c);
                  auditDiffs.push({field:"Deposit Refund",oldVal:`$${collected.toFixed(2)}`,newVal:"Store Credit"});
                } else if (collected > 0 && cancelRefundOption === "card") {
                  auditDiffs.push({field:"Deposit Refund",oldVal:`$${collected.toFixed(2)}`,newVal:"Returned to Card (requires processing)"});
                } else if (collected > 0) {
                  auditDiffs.push({field:"Deposit",oldVal:`$${collected.toFixed(2)}`,newVal:"Kept (non-refundable)"});
                }

                const cancelAudit = buildAuditEntry(reservation.id, "Cancelled Reservation", auditDiffs, profile);
                await save({
                  ...data,
                  clients: updatedClients,
                  packageSales: updatedSales,
                  auditLog:[...(data.auditLog||[]),cancelAudit],
                  reservations: data.reservations.map(r => r.id === reservation.id ? {
                    ...r, status:"cancelled", cancelledAt:new Date().toISOString(),
                    cancelledBy: profile?(profile.full_name||profile.email||"Staff"):"Staff",
                    cancelRefundMethod: cancelRefundOption || "keep",
                    cancelCouponAction: hasCoupons ? cancelCouponOption : undefined,
                  } : r)
                });
                setShowCancelConfirm(false);
                onClose();
              }} icon={<I.Trash/>}>Confirm Cancellation</Btn>
            </div>
          </Modal>
        );
      })()}

      {/* Print Run Card + Body Check Prompt (after check-in) */}
      {showPrintPrompt && (
        <Modal title="Check-In Complete" onClose={() => { setShowPrintPrompt(false); onClose(); }}>
          <div style={{ textAlign: "center", padding: "12px 0 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>{dog.fields.name} is checked in!</div>
            <div style={{ fontSize: 13, color: C.textSec }}>Would you like to print the Run Card and Body Check form?</div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Btn variant="secondary" onClick={() => { setShowPrintPrompt(false); onClose(); }}>No</Btn>
            <Btn onClick={() => { printRunCard(); setShowPrintPrompt(false); onClose(); }} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>}>Run Card Only</Btn>
            <Btn variant="success" onClick={() => { printRunCardWithBodyCheck(); setShowPrintPrompt(false); onClose(); }} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>}>Run Card + Body Check</Btn>
          </div>
        </Modal>
      )}

      {/* Conflict Resolution Modal */}
      {showConflict && (
        <Modal title="Update Profile?" onClose={()=>setShowConflict(false)} wide>
          <div style={{marginBottom:16}}>
            <p style={{fontSize:14,color:C.text,lineHeight:1.6,margin:"0 0 16px"}}>
              You changed care instructions or emergency contact for this reservation. Would you like to update the profile for all future reservations, or keep these changes just for this reservation?
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {pendingChanges.map((ch,i) => (
                <div key={i} style={{padding:"10px 14px",borderRadius:10,background:C.bg,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:700,color:C.text}}>{ch.type==="dog"?dog.fields.name:`${client.fields.first_name} ${client.fields.last_name}`}</span>
                    <Badge color="accent" size="sm">{ch.label}</Badge>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 24px 1fr",gap:8,alignItems:"start"}}>
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
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
            <Btn variant="secondary" onClick={()=>setShowConflict(false)}>Cancel</Btn>
            <Btn variant="accent" onClick={()=>confirmConflict(false)}>This Reservation Only</Btn>
            <Btn onClick={()=>confirmConflict(true)}>Update Profile(s)</Btn>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

export { BoardingPreviewModal };

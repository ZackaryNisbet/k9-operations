// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useData } from "./useData";
import { useAuth } from "./AuthProvider";
import { supabase } from "./supabaseClient";

import { uuid } from "./pos/lib/ids";

import { I } from "./pos/icons";

import { K9Logo, K9LogoMini } from "./pos/brand";

// K9 Operations Locations
import { K9_LOCATIONS } from "./pos/constants/locations";

import { POS_BASE, buildUrl, parseUrl } from "./pos/lib/routing";

import { LocationSelector } from "./pos/components/LocationSelector";


// ─── Utilities ──────────────────────────────────────────────────────────────
import { gid, formatDogNames, titleCase, fmtPhone, _toDateStr, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, summarizeFeeding, summarizeMeds, todayStr, getSimulatedNow, formatTime12hr, addDays, getMonday, getWeekDays, shortDay, dayNum } from "./pos/lib/format";

import { getVaxStatus } from "./pos/lib/vaccines";

// === Vaccine Reminder Engine ===
// Scans all dogs, matches expiring vaccines to configured tiers, deduplicates against log,
// batches multiple vaccines per client, and returns an array of reminder actions to send.
import { buildVaccineReminders } from "./pos/lib/vaccineReminders";

import { getDogAgeCompliance, getSpayNeuterCompliance, calcAge, fixedLabel, getDogDaycareSize } from "./pos/lib/dogHelpers";


import { EVAL_SECTIONS, EVAL_SCORE_PTS, getEvalAgeBucket, scoreEvalAge, calcEvalSectionPts, getEvalVisibleSections, getEvalVisibleQuestions, getEvalMaxScore, getEvalTotalScore, getEvalResult, hasCompletedEval } from "./pos/lib/evaluation";

import { countNights, countHours, getAddOnPrices, calcReservationPricing } from "./pos/lib/pricing";

import { C, TAG_COLORS } from "./pos/constants/colors";

import { PERMISSION_CATEGORIES, ALL_PERM_KEYS, buildPerms, DEFAULT_ROLES } from "./pos/constants/permissions";

import { DEF_EOD_TEMPLATE, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, OPS_TYPES, DAY_NAMES_SHORT, OPERATIONS_CATALOG } from "./pos/constants/operations";

import { getRoomCleaningStats, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "./pos/lib/ops";

import { DEF_CLIENT_FIELDS, DEF_DOG_FIELDS } from "./pos/constants/fields";

import { ACTION_LEVELS, ACTION_LABELS, isFieldRequired, validateFields, migrateFieldsToMatrix } from "./pos/lib/fieldRules";

import { DEF_AGREEMENTS, DEF_QUESTIONNAIRE, DEF_DOG_TAGS, CLASSIFICATION_TAG_IDS, ROOM_TYPES, EVAL_RESULTS, DEF_HOTKEY_BINDINGS, HOTKEY_LABELS } from "./pos/constants/forms";

import { DEF_PRICING } from "./pos/constants/pricing";

import { DEF_BREED_OPTIONS, DEF_FEEDING_TIME_OPTIONS, DEF_FEEDING_UNIT_OPTIONS, DEF_FOOD_TYPE_OPTIONS, DEF_FOOD_SOURCE_OPTIONS, DEF_FEEDING_INSTRUCTION_OPTIONS, DEF_MEDICATION_UNIT_OPTIONS, DEF_MEDICATION_TIME_OPTIONS, DEF_MEDICATION_NAME_OPTIONS, DEF_MEDICATION_INSTRUCTION_OPTIONS, DEF_BATH_TYPE_OPTIONS } from "./pos/constants/dropdowns";

import { VACCINES, DEF_REQUIRED_VACCINES } from "./pos/constants/vaccines";

// ─── Demo Data Generator ─────────────────────────────────────────────────────
import { DEMO, NEW_LOCATION_DEFAULTS } from "./pos/demo/demoData";

// ─── Reusable Components ────────────────────────────────────────────────────
import { ErrorBoundary, Hl, Tip, Badge, Btn, CustomSelect, MiniDatePicker, fmtPhoneInput, Inp, CalendarPicker, Card, Modal } from "./pos/components/ui";

// Stable compliance CheckItem — defined at module level so React doesn't unmount/remount on every render
import { ComplianceCheckItem } from "./pos/components/ComplianceCheckItem";


// Discount picker dropdown — shows configured discounts from Settings
import { DiscountPicker } from "./pos/components/DiscountPicker";

// Manual discount entry (shown when no configured discounts are available)
import { ManualDiscountEntry } from "./pos/components/ManualDiscountEntry";



import { LEGACY_ROLE_MAP, ROLE_CODE_MAP, _resolveRole, hasPermission, getRoleName, getRoleColor, NAV_PERM_MAP } from "./pos/lib/roles";

import { FeedMedBreakdown, ItemizedReceipt, VaxIcon, DogAvatar, buildAuditEntry } from "./pos/components/widgets";

// ─── Agreement Status Icons (for client rows) ──────────────────────────────
import { agrSigned } from "./pos/lib/agreements";

import { AgreementIcons } from "./pos/components/AgreementIcons";

// ─── Dog Tag Chips ──────────────────────────────────────────────────────────
import { DogTagChips } from "./pos/components/DogTagChips";


// ─── Dog Avatar ─────────────────────────────────────────────────────────────


import { DogPicHover } from "./pos/components/DogPicHover";

// ─── Data Hook ──────────────────────────────────────────────────────────────
// useData is now imported from ./useData.js (Supabase-powered)


// ═══════════════════════════════════════════════════════════════════════════
// BOARDING PREVIEW / CHECK-IN MODAL
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD - Tabbed layout with check-in/out times
// ═══════════════════════════════════════════════════════════════════════════
function DashboardPage({ data, save, nav, onNew, profile }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  // Time Travel: sync dashboard to simulated date when it changes
  const prevTdRef = useRef(td);
  useEffect(() => { if (td !== prevTdRef.current) { setViewDate(td); prevTdRef.current = td; } }, [td]);
  const [activeTab, setActiveTab] = useState("expected");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSummaryDetail, setShowSummaryDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [addOnsView, setAddOnsView] = useState(false);
  const [typeFilters, setTypeFilters] = useState(new Set());
  const toggleTypeFilter = (type) => { setAddOnsView(false); setTypeFilters(prev => {
    const next = new Set(prev);
    if (next.has(type)) next.delete(type); else next.add(type);
    return next;
  }); };
  const typeFilterActive = typeFilters.size > 0;
  const typeMatch = (r) => !typeFilterActive || typeFilters.has(r.type);

  // Activities tab state
  const [actSearch, setActSearch] = useState("");
  const [actTypeFilter, setActTypeFilter] = useState(new Set());
  const toggleActType = (t) => setActTypeFilter(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const [actTimeFilter, setActTimeFilter] = useState(""); // "", "am", "noon", "pm"
  const [bulkTime, setBulkTime] = useState("all");
  const [bulkType, setBulkType] = useState("all");
  const [bulkAnimating, setBulkAnimating] = useState(false);
  const [bulkAnimatedIds, setBulkAnimatedIds] = useState(new Set());
  const [showSellPkg, setShowSellPkg] = useState(false);

  const shiftDate = (days) => {
    const d = new Date(viewDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    setViewDate(d.toISOString().split("T")[0]);
  };
  const isToday = viewDate === td;
  const viewDateObj = new Date(viewDate + "T12:00:00");
  const viewDateLabel = viewDateObj.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});

  const cn = (cid) => { const c=data.clients.find(x=>x.id===cid); return c?`${c.fields.first_name||""} ${c.fields.last_name||""}`.trim():"Unknown"; };
  const dn = (did) => { const d=data.dogs.find(x=>x.id===did); return d?d.fields.name||"Unknown":"Unknown"; };
  const db = (did) => { const d=data.dogs.find(x=>x.id===did); return d?d.fields.breed||"":""; };
  const getDog = (did) => data.dogs.find(x=>x.id===did);

  // Reservations for viewed date (any status, touching that date)
  const vd = viewDate;
  const todayAll = data.reservations.filter(r => r.status !== "cancelled" && (r.checkIn === vd || r.checkOut === vd || (r.checkIn <= vd && r.checkOut >= vd)));

  const expected = data.reservations.filter(r=>r.checkIn===vd&&r.status==="upcoming");
  const inHouse = data.reservations.filter(r=>r.status==="checked-in"&&r.checkIn<=vd&&r.checkOut>=vd);
  const goingHome = data.reservations.filter(r=>r.status==="checked-in"&&r.checkOut===vd);
  const checkedOut = data.reservations.filter(r=>r.status==="checked-out"&&r.checkOut===vd);

  // ═══ Add-Ons Summary (for in-house dogs) ═══
  const addOnsSummary = useMemo(() => {
    const counts = {};
    const details = {};
    for (const res of inHouse) {
      const dog = data.dogs.find(d => d.id === res.dogId);
      const client = data.clients.find(c => c.id === res.clientId);
      const dogName = dog?.fields?.name || "Unknown";
      const clientName = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown";
      for (const addon of (res.addOns || [])) {
        counts[addon] = (counts[addon] || 0) + 1;
        if (!details[addon]) details[addon] = [];
        details[addon].push({ resId: res.id, dogName, clientName, clientId: res.clientId, dogId: res.dogId });
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, dogs: details[name] }))
      .sort((a, b) => b.count - a.count);
  }, [inHouse, data.dogs, data.clients]);

  // ═══ Auto-cancel expired reservations (check-in date passed without check-in) ═══
  useEffect(() => {
    const today = todayStr();
    const expired = data.reservations.filter(r => r.status === "upcoming" && r.checkIn < today);
    if (expired.length === 0) return;
    const auditEntries = expired.map(r => buildAuditEntry(r.id, "Auto-Cancelled", [{field:"Status",oldVal:"Upcoming",newVal:"Cancelled"},{field:"Reason",oldVal:"—",newVal:"Check-in date lapsed without check-in"}], null));
    save({
      ...data,
      auditLog: [...(data.auditLog || []), ...auditEntries],
      reservations: data.reservations.map(r => {
        if (r.status === "upcoming" && r.checkIn < today) {
          return { ...r, status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: "System (Auto)", cancelReason: "Check-in date lapsed" };
        }
        return r;
      })
    });
  }, []);

  // ═══ Activities Hub — aggregate all feeding/meds/baths for in-house dogs today ═══
  const actStaffName = profile ? (profile.full_name || profile.email || "Staff") : "Staff";
  const parseTimeSort = (t) => {
    const tl = (t || "").toLowerCase().trim();
    if (tl === "am" || tl === "morning") return 6;
    if (tl === "noon" || tl === "midday" || tl === "lunch") return 12;
    if (tl === "pm" || tl === "afternoon") return 15;
    if (tl === "evening" || tl === "dinner") return 18;
    if (tl === "end of day") return 20;
    if (tl === "any" || tl === "as needed") return 12;
    const m = tl.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (m) { let h = parseInt(m[1]); const min = parseInt(m[2] || "0"); const ap = (m[3] || "").toLowerCase(); if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0; return h + min / 60; }
    return 12;
  };
  const fmtTimeLabel = (t) => {
    const tl = (t || "").trim();
    if (!tl) return "—";
    const m = tl.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { let h = parseInt(m[1]); const min = m[2]; const ap = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12; return `${h}:${min} ${ap}`; }
    return tl;
  };
  const fmtTimeTwoLine = (t) => {
    const tl = (t || "").trim();
    if (!tl) return { label: "—", sub: "" };
    // Handle format like "AM (6:00 am)" or "Noon (12:00 pm)" or "PM (6:00 pm)"
    const paren = tl.match(/^([A-Za-z]+)\s*\(([^)]+)\)/);
    if (paren) return { label: paren[1].toUpperCase(), sub: paren[2].trim() };
    // Handle raw HH:MM (24h)
    const m = tl.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { let h = parseInt(m[1]); const min = m[2]; const ap = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12; return { label: ap, sub: `${h}:${min} ${ap.toLowerCase()}` }; }
    // Fallback: treat entire string as label (e.g., "End of Day", "Any")
    return { label: tl, sub: "" };
  };

  const allActivities = useMemo(() => {
    const today = todayStr();
    const ihRes = data.reservations.filter(r => r.status === "checked-in" && r.checkIn <= vd && r.checkOut >= vd);
    const rows = [];
    ihRes.forEach(res => {
      const dog = data.dogs.find(d => d.id === res.dogId);
      const client = data.clients.find(c => c.id === res.clientId);
      if (!dog) return;
      const feedSch = (res.careOverrides?.feedingSchedules?.length ? res.careOverrides.feedingSchedules : null) || dog.fields.feedingSchedules || [];
      const medSch = (res.careOverrides?.medicationSchedules?.length ? res.careOverrides.medicationSchedules : null) || dog.fields.medicationSchedules || [];
      const bath = res.careOverrides?.bath_type || dog.fields.bath_type || "";
      const log = res.activityLog || {};

      const base = { reservationId: res.id, dogId: res.dogId, clientId: res.clientId, dog, client, room: res.room || "", checkOut: res.checkOut || "", checkOutTime: res.checkOutTime || "" };

      feedSch.forEach(s => {
        (s.times || []).forEach(time => {
          const colKey = `feeding_${time.replace(/\s+/g, "_")}`;
          rows.push({ ...base, id: `${res.id}_${colKey}`, type: "feeding", colKey, time, label: `Feeding – ${time}`, qty: [s.amount, s.unit].filter(Boolean).join(" "), foodType: s.foodType || "", detail: [s.amount, s.unit, s.foodType].filter(Boolean).join(" "), instruction: fmtInstr(s.instruction), notes: s.notes || "", logEntry: log[`${today}|${colKey}`] || {} });
        });
      });

      medSch.forEach(s => {
        // Support both new `times` array and legacy `time` string
        const medTimes = (s.times && s.times.length > 0) ? s.times : (s.time ? [s.time] : ["Any"]);
        medTimes.forEach(time => {
          const colKey = `med_${(s.name || "").replace(/\s+/g, "_")}_${time.replace(/\s+/g, "_")}`;
          rows.push({ ...base, id: `${res.id}_${colKey}`, type: "medication", colKey, time, label: s.name || "Medication", qty: [s.amount, s.unit].filter(Boolean).join(" "), foodType: "", detail: [s.amount, s.unit].filter(Boolean).join(" "), instruction: fmtInstr(s.instruction) || s.notes || "", notes: s.notes || "", logEntry: log[`${today}|${colKey}`] || {} });
        });
      });

      if (bath && res.checkOut === today) {
        const colKey = "bathing";
        const postBathRet = res.careOverrides?.postBathReturn || "";
        rows.push({ ...base, id: `${res.id}_${colKey}`, type: "bathing", colKey, time: "End of Day", label: "Bath", detail: bath, instruction: postBathRet ? `After bath: ${postBathRet}` : "", notes: "", postBathReturn: postBathRet, logEntry: log[`${today}|${colKey}`] || {} });
      }
    });
    rows.sort((a, b) => parseTimeSort(a.time) - parseTimeSort(b.time));
    return rows;
  }, [data.reservations, data.dogs, data.clients, vd]);

  const filteredActivities = useMemo(() => {
    let rows = allActivities;
    if (actTypeFilter.size > 0) rows = rows.filter(r => actTypeFilter.has(r.type));
    if (actTimeFilter) {
      rows = rows.filter(r => {
        const s = parseTimeSort(r.time);
        if (actTimeFilter === "am") return s < 11;
        if (actTimeFilter === "noon") return s >= 11 && s < 14;
        if (actTimeFilter === "pm") return s >= 14;
        return true;
      });
    }
    if (actSearch.trim()) {
      const q = actSearch.toLowerCase();
      rows = rows.filter(r => {
        const dName = (r.dog?.fields.name || "").toLowerCase();
        const cName = `${r.client?.fields.first_name || ""} ${r.client?.fields.last_name || ""}`.toLowerCase();
        return dName.includes(q) || cName.includes(q) || (r.room || "").toLowerCase().includes(q);
      });
    }
    return rows;
  }, [allActivities, actTypeFilter, actTimeFilter, actSearch]);

  // Bulk action helpers (lifted to Dashboard level for access from filter bar)
  const pendingActivities = filteredActivities.filter(r => !r.logEntry?.administered);
  const executeBulkMark = async () => {
    if (pendingActivities.length === 0 || bulkAnimating) return;
    setBulkAnimating(true);
    setBulkAnimatedIds(new Set());
    const today = todayStr();
    const actStaffName = profile?.full_name || "Staff";
    // Stagger saves row-by-row so checkboxes check off in sync with the highlight
    const snapshot = [...pendingActivities];
    let runningReservations = [...data.reservations];
    const bulkAuditEntries = [];
    for (let i = 0; i < snapshot.length; i++) {
      const row = snapshot[i];
      const logKey = `${today}|${row.colKey}`;
      const logData = { administered: true, by: actStaffName, at: new Date().toISOString() };
      if (row.type === "feeding") logData.consumption = "100%";
      bulkAuditEntries.push(buildAuditEntry(row.reservationId, "Updated Activity", [{field:`Activity: ${row.colKey.replace(/_/g," ")}`, oldVal:"—", newVal:"Done"}], profile));
      // Update the accumulator with this single row
      runningReservations = runningReservations.map(r => r.id === row.reservationId ? { ...r, activityLog: { ...(r.activityLog || {}), [logKey]: { ...(r.activityLog || {})[logKey], ...logData } } } : r);
      // Save triggers re-render → this row's checkbox checks off
      save({ ...data, auditLog: [...(data.auditLog || []), ...bulkAuditEntries], reservations: runningReservations });
      setBulkAnimatedIds(prev => new Set([...prev, row.id]));
      if (i < snapshot.length - 1) await new Promise(r => setTimeout(r, 120));
    }
    setTimeout(() => { setBulkAnimating(false); setBulkAnimatedIds(new Set()); }, 800);
  };
  const bulkResetAll = () => {
    const today = todayStr();
    let updatedReservations = [...data.reservations];
    filteredActivities.forEach(row => {
      if (!row.logEntry?.administered) return;
      const logKey = `${today}|${row.colKey}`;
      updatedReservations = updatedReservations.map(r => r.id === row.reservationId ? { ...r, activityLog: { ...(r.activityLog || {}), [logKey]: { administered: false, by: "", at: "" } } } : r);
    });
    save({ ...data, reservations: updatedReservations });
  };

  const updateActivityLog = (reservationId, colKey, updates) => {
    const logKey = `${todayStr()}|${colKey}`;
    const oldEntry = (data.reservations.find(r => r.id === reservationId)?.activityLog || {})[logKey] || {};
    const diffs = [];
    if (updates.administered !== undefined && updates.administered !== oldEntry.administered) diffs.push({field:`Activity: ${colKey.replace(/_/g," ")}`, oldVal: oldEntry.administered ? "Done" : "—", newVal: updates.administered ? "Done" : "—"});
    if (updates.consumption !== undefined && updates.consumption !== (oldEntry.consumption || "")) diffs.push({field:`Consumption: ${colKey.replace(/_/g," ")}`, oldVal: oldEntry.consumption || "—", newVal: updates.consumption || "—"});
    const auditEntries = diffs.length > 0 ? [buildAuditEntry(reservationId, "Updated Activity", diffs, profile)] : [];
    save({ ...data, auditLog: [...(data.auditLog || []), ...auditEntries], reservations: data.reservations.map(r => r.id === reservationId ? { ...r, activityLog: { ...(r.activityLog || {}), [logKey]: { ...(r.activityLog || {})[logKey], ...updates } } } : r) });
  };

  // Facility capacity calculations
  const fs = data.facilitySettings || { largeDogDaycareSF: 0, smallDogDaycareSF: 0 };
  const lgDaycareCap = Math.floor((fs.largeDogDaycareSF || 0) / 18);
  const smDaycareCap = Math.floor((fs.smallDogDaycareSF || 0) / 12);
  const allRooms = data.rooms || {};
  const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);

  // Count dogs in large daycare (checked-in daycare, dayboarding, evals, or group-play boarding dogs classified as large)
  const lgDaycareCount = inHouse.filter(r => {
    if (r.type === "daycare" && r.daycareSize === "large") return true;
    if (r.type === "dayboarding" || r.type === "evaluation") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "large"; }
    if (r.type === "boarding") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "large" && !(dog.tags || []).includes("tag_pp"); }
    return false;
  }).length;
  // Count dogs in small daycare
  const smDaycareCount = inHouse.filter(r => {
    if (r.type === "daycare" && r.daycareSize === "small") return true;
    if (r.type === "dayboarding" || r.type === "evaluation") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "small"; }
    if (r.type === "boarding") { const dog = data.dogs.find(d => d.id === r.dogId); return dog && getDogDaycareSize(dog) === "small" && !(dog.tags || []).includes("tag_pp"); }
    return false;
  }).length;
  // Count boarding rooms occupied tonight (exclude dogs checking out today — their room frees up tonight)
  const boardingInHouse = inHouse.filter(r => r.type === "boarding" || r.type === "dayboarding");
  const boardingOcc = boardingInHouse.filter(r => r.checkOut !== vd).length;

  const [boardingPreviewId, setBoardingPreviewId] = useState(null);

  // Quick Check-in
  const [showQuickDC, setShowQuickDC] = useState(false);
  const [dcSearch, setDcSearch] = useState("");
  const [dcCompExpand, setDcCompExpand] = useState(null);
  const dcSearchRef = useRef(null);
  useEffect(() => { if (showQuickDC && dcSearchRef.current) dcSearchRef.current.focus(); }, [showQuickDC]);

  const quickDCCheckIn = async (clientId, dogId, resType) => {
    const dog = data.dogs.find(d => d.id === dogId);
    const daycareSize = dog ? getDogDaycareSize(dog) : "large";
    const nowTime = new Date().toTimeString().slice(0, 5);
    const nowISO = new Date().toISOString();
    const newRes = {
      id: gid(), clientId, dogId, type: resType, daycareSize,
      ...(resType === "dayboarding" ? { roomType: "Executive Room" } : {}),
      checkIn: vd, checkOut: vd,
      checkInTime: nowTime,
      checkOutTime: "", status: "checked-in", notes: "",
      actualCheckInTime: nowISO,
      checkedInBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff",
      bookingSource: "walk-in",
      createdAt: nowISO,
      careOverrides: {},
      pricing: calcReservationPricing({
        type: resType, checkIn: vd, checkOut: vd,
        checkInTime: nowTime,
        checkOutTime: "", daycareSize,
        dogs: dog ? [dog] : [], dogProfiles: data.dogs,
        pricing: data.pricing, isSecondDogSameRoom: false,
      }),
    };
    const auditEntry = buildAuditEntry(newRes.id, "Checked In", [{field:"Status",oldVal:"Walk-in",newVal:"Checked In"},{field:"Actual Check-In",oldVal:"—",newVal:new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}], profile);
    await save({ ...data, auditLog: [...(data.auditLog||[]), auditEntry], reservations: [...data.reservations, newRes] });
    setShowQuickDC(false);
    setDcSearch("");
    addDashToast({ dogName: dog?.fields?.name || "?", action: `${resType} checked in`, oldVal: "Walk-in", newVal: "Checked In", undoRes: newRes });
  };

  // Toast notifications
  const [dashToasts, setDashToasts] = useState([]);
  const dashToastId = useRef(0);
  const addDashToast = (t) => {
    const id = ++dashToastId.current;
    const toast = { id, ...t };
    setDashToasts(prev => [...prev, toast]);
    setTimeout(() => setDashToasts(prev => prev.filter(x => x.id !== id)), 10000);
  };
  const dismissDashToast = (id) => setDashToasts(prev => prev.filter(x => x.id !== id));
  const undoDashToast = async (toast) => {
    const currentRes = data.reservations.find(r => r.id === toast.undoRes.id);
    const undoAction = toast.action?.includes("checked in") ? "Undo Check-In" : toast.action?.includes("checked out") ? "Undo Check-Out" : "Undo Action";
    const diffs = [];
    if (currentRes && currentRes.status !== toast.undoRes.status) {
      diffs.push({ field: "Status", oldVal: currentRes.status === "checked-in" ? "Checked In" : currentRes.status === "checked-out" ? "Checked Out" : currentRes.status, newVal: toast.undoRes.status === "upcoming" ? "Upcoming" : toast.undoRes.status === "checked-in" ? "Checked In" : toast.undoRes.status });
    }
    const auditEntry = buildAuditEntry(toast.undoRes.id, undoAction, diffs.length > 0 ? diffs : [{ field: "Action", oldVal: toast.action || "Change", newVal: "Reverted" }], profile);
    await save({ ...data, auditLog: [...(data.auditLog || []), auditEntry], reservations: data.reservations.map(r => r.id === toast.undoRes.id ? toast.undoRes : r) });
    dismissDashToast(toast.id);
  };

  // Text notification toast for reservation changes
  const [textNotify, setTextNotify] = useState(null); // { clientName, clientPhone, dogName, diffs, message, showPreview, sending }
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

  // Direct check-in for non-boarding (evals, tours, daycare) with CRM auto-creation
  const directCheckIn = async (rid) => {
    const res = data.reservations.find(r => r.id === rid);
    // Agreement gate: block check-in if required agreements unsigned
    if (res) {
      const ciClient = data.clients.find(c => c.id === res.clientId);
      if (ciClient) {
        const ciAgrs = (data.agreements || DEF_AGREEMENTS).filter(a => a.required !== false);
        const allSigned = ciAgrs.every(a => agrSigned(ciClient, a.id));
        if (!allSigned) {
          const unsigned = ciAgrs.filter(a => !agrSigned(ciClient, a.id)).map(a => a.name);
          addDashToast({ dogName: (data.dogs.find(d => d.id === res.dogId)?.fields?.name) || "?", action: "cannot check in", oldVal: "Unsigned: " + unsigned.join(", "), newVal: "Open reservation to sign" });
          nav("client-detail", { clientId: ciClient.id, openReservation: rid });
          return;
        }
      }
    }
    const newData = { ...data, reservations: data.reservations.map(r => r.id === rid ? { ...r, status: "checked-in", actualCheckInTime: new Date().toISOString(), checkedInBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff" } : r) };
    // Audit log for direct check-in
    newData.auditLog = [...(newData.auditLog || []), buildAuditEntry(rid, "Checked In", [{field:"Status",oldVal:"Upcoming",newVal:"Checked In"}], profile)];
    await save(newData);
    if (res) {
      const dog = data.dogs.find(d => d.id === res.dogId);
      addDashToast({ dogName: dog ? dog.fields.name : "?", action: "checked in", oldVal: "Upcoming", newVal: "Checked In", undoRes: { ...res } });
    }
  };

  const handleCheckIn = (rid) => {
    const res = data.reservations.find(r => r.id === rid);
    if (res && (res.type === "boarding" || res.type === "dayboarding")) {
      setBoardingPreviewId(rid);
      return;
    }
    directCheckIn(rid);
  };
  const handleCheckOut = async (rid) => {
    const res = data.reservations.find(r=>r.id===rid);
    // Boarding/dayboarding/daycare: open preview modal for checkout (payment gate)
    if (res && (res.type === "boarding" || res.type === "dayboarding" || res.type === "daycare")) {
      setBoardingPreviewId(rid);
      return;
    }
    if (res && res.type === "evaluation") {
      const existingEval = (data.evaluations || []).find(e => e.reservationId === rid && e.locked);
      if (!existingEval) {
        nav("evaluation-form", { reservationId: rid });
        return;
      }
      // Eval already done — proceed with checkout, set evalResult from evaluation
      const evalResultVal = existingEval.result === "green" ? "passed_group" : "pending";
      const origRes = res ? { ...res } : null;
      const evalCoAudit = buildAuditEntry(rid, "Checked Out", [{field:"Status",oldVal:"Checked In",newVal:"Checked Out"},{field:"Eval Result",oldVal:"Pending",newVal:evalResultVal==="passed_group"?"Passed Group":"Pending"}], profile);
      await save({...data, auditLog:[...(data.auditLog||[]),evalCoAudit], reservations:data.reservations.map(r=>r.id===rid?{...r,status:"checked-out",evalResult:evalResultVal,actualCheckOutTime:new Date().toISOString(),checkedOutBy:profile?(profile.full_name||profile.email||"Staff"):"Staff"}:r)});
      if (origRes) {
        const dog = data.dogs.find(d => d.id === origRes.dogId);
        addDashToast({ dogName: dog ? dog.fields.name : "?", action: "checked out", oldVal: "Checked In", newVal: "Checked Out", undoRes: origRes });
      }
      return;
    }
    const origRes = res ? { ...res } : null;
    const coAudit = buildAuditEntry(rid, "Checked Out", [{field:"Status",oldVal:"Checked In",newVal:"Checked Out"}], profile);
    const coSaveData = {...data, auditLog:[...(data.auditLog||[]),coAudit], reservations:data.reservations.map(r=>r.id===rid?{...r,status:"checked-out",actualCheckOutTime:new Date().toISOString(),checkedOutBy:profile?(profile.full_name||profile.email||"Staff"):"Staff"}:r)};
    // ── Auto-feed to Conversion from Tour checkout ──
    if (res && res.type === "tour" && res.clientId) {
      const tourClient = data.clients.find(c => c.id === res.clientId);
      if (tourClient) {
        const cRes = data.reservations.filter(r => r.clientId === res.clientId);
        const totalSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
        const hasUpcoming = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.id !== rid);
        if (totalSpent === 0 && !hasUpcoming) {
          const addD = (base, n) => { const d = new Date((base || todayStr()) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
          coSaveData.clients = data.clients.map(c => {
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
    await save(coSaveData);
    if (origRes) {
      const dog = data.dogs.find(d => d.id === origRes.dogId);
      addDashToast({ dogName: dog ? dog.fields.name : "?", action: "checked out", oldVal: "Checked In", newVal: "Checked Out", undoRes: origRes });
    }
  };
  // Old evalModalRes removed — now uses EvaluationFormPage

  const typeLabel=(t)=>t==="boarding"?"Boarding":t==="dayboarding"?"Day Board":t==="daycare"?"Daycare":t==="evaluation"?"Evaluation":"Tour";
  const typeColor=(t)=>t==="boarding"?"primary":t==="dayboarding"?"primary":t==="daycare"?"success":t==="evaluation"?"warning":"accent";

  // ═══ Summary Stats ═══
  const todayByType = (type, extra) => todayAll.filter(r => r.type === type && (!extra || extra(r)));
  const countByStatus = (arr, st) => arr.filter(r => r.status === st).length;

  // Tours
  const tours = todayByType("tour");
  const toursScheduled = tours.length;
  const toursCompleted = countByStatus(tours, "checked-out");

  // Evaluations
  const evals = todayByType("evaluation");
  const evalsScheduled = evals.length;
  const evalsRemaining = evals.filter(r => r.status === "upcoming").length;
  const evalsPassedGroup = evals.filter(r => r.evalResult === "passed_group").length;
  const evalsPassedPrivate = evals.filter(r => r.evalResult === "passed_private").length;

  // Daycare - Large
  const dcLarge = todayByType("daycare", r => r.daycareSize === "large");
  const dcLargeScheduled = dcLarge.length;
  const dcLargeIn = countByStatus(dcLarge, "checked-in");
  const dcLargeOut = countByStatus(dcLarge, "checked-out");

  // Daycare - Small
  const dcSmall = todayByType("daycare", r => r.daycareSize === "small");
  const dcSmallScheduled = dcSmall.length;
  const dcSmallIn = countByStatus(dcSmall, "checked-in");
  const dcSmallOut = countByStatus(dcSmall, "checked-out");

  // Boarding by room type (includes dayboarding)
  const boardingToday = todayAll.filter(r => r.type === "boarding" || r.type === "dayboarding");
  const boardingByRoom = ROOM_TYPES.map(rt => {
    const rooms = boardingToday.filter(r => r.roomType === rt);
    return { name: rt, scheduled: rooms.length, checkedIn: countByStatus(rooms, "checked-in"), checkedOut: countByStatus(rooms, "checked-out") };
  });

  // Search filter: match reservation against query by client name, dog name, phone, email
  const searchMatch = useCallback((res, q) => {
    if (!q) return true;
    const lower = q.toLowerCase();
    const client = data.clients.find(x => x.id === res.clientId);
    const dog = data.dogs.find(x => x.id === res.dogId);
    const cName = client ? `${client.fields.first_name || ""} ${client.fields.last_name || ""}`.toLowerCase() : "";
    const cPhone = (client?.fields.phone || "").replace(/\D/g, "");
    const cEmail = (client?.fields.email || "").toLowerCase();
    const dName = (dog?.fields.name || "").toLowerCase();
    const qDigits = lower.replace(/\D/g, "");
    return cName.includes(lower) || dName.includes(lower) || cEmail.includes(lower) || (qDigits.length >= 3 && cPhone.includes(qDigits));
  }, [data.clients, data.dogs]);

  const sq = searchQuery.trim();
  const fExpected = useMemo(() => expected.filter(r => searchMatch(r, sq) && typeMatch(r)), [expected, sq, searchMatch, typeFilterActive, typeFilters]);
  const fInHouse = useMemo(() => inHouse.filter(r => searchMatch(r, sq) && typeMatch(r)), [inHouse, sq, searchMatch, typeFilterActive, typeFilters]);
  const fGoingHome = useMemo(() => goingHome.filter(r => searchMatch(r, sq) && typeMatch(r)), [goingHome, sq, searchMatch, typeFilterActive, typeFilters]);
  const fCheckedOut = useMemo(() => checkedOut.filter(r => searchMatch(r, sq) && typeMatch(r)), [checkedOut, sq, searchMatch, typeFilterActive, typeFilters]);


  const isFiltering = !!sq || typeFilterActive;

  // Auto-switch to first tab with results when filtering
  useEffect(() => {
    if (!isFiltering || activeTab === "activities") return;
    const current = activeTab === "expected" ? fExpected : activeTab === "inhouse" ? fInHouse : activeTab === "goinghome" ? fGoingHome : fCheckedOut;
    if (current.length > 0) return;
    if (fExpected.length > 0) setActiveTab("expected");
    else if (fInHouse.length > 0) setActiveTab("inhouse");
    else if (fGoingHome.length > 0) setActiveTab("goinghome");
    else if (fCheckedOut.length > 0) setActiveTab("checkedout");
  }, [isFiltering, fExpected.length, fInHouse.length, fGoingHome.length, fCheckedOut.length]);

  const tabs = [
    { id: "expected", label: "Expected", count: isFiltering ? fExpected.length : expected.length, total: expected.length, color: C.info },
    { id: "inhouse", label: "In-House", count: isFiltering ? fInHouse.length : inHouse.length, total: inHouse.length, color: C.suc },
    { id: "goinghome", label: "Going Home", count: isFiltering ? fGoingHome.length : goingHome.length, total: goingHome.length, color: C.acc },
    { id: "checkedout", label: "Checked Out", count: isFiltering ? fCheckedOut.length : checkedOut.length, total: checkedOut.length, color: C.textSec },
    { id: "activities", label: "Activities", count: filteredActivities.filter(r => !r.logEntry?.administered).length, total: allActivities.length, color: C.acc },
  ];

  const rawItems = activeTab === "activities" ? [] : activeTab === "expected" ? fExpected : activeTab === "inhouse" ? fInHouse : activeTab === "goinghome" ? fGoingHome : fCheckedOut;

  const handleSort = (col) => {
    if (sortCol === col) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortCol(col); setSortDir("asc"); }
  };

  const activeItems = useMemo(() => {
    const items = [...rawItems];
    if (!sortCol) return items;
    return items.sort((a, b) => {
      let va, vb;
      if (sortCol === "inTime") { va = a.checkInTime || ""; vb = b.checkInTime || ""; }
      else if (sortCol === "outTime") { va = a.checkOutTime || ""; vb = b.checkOutTime || ""; }
      else if (sortCol === "dog") { va = dn(a.dogId).toLowerCase(); vb = dn(b.dogId).toLowerCase(); }
      else if (sortCol === "client") { va = cn(a.clientId).toLowerCase(); vb = cn(b.clientId).toLowerCase(); }
      else if (sortCol === "service") { va = a.type || ""; vb = b.type || ""; }
      else if (sortCol === "lodging") { va = a.type === "boarding" ? `${a.roomType || ""} ${a.room || ""}` : ""; vb = b.type === "boarding" ? `${b.roomType || ""} ${b.room || ""}` : ""; }
      else if (sortCol === "inDate") { va = a.checkIn || ""; vb = b.checkIn || ""; }
      else if (sortCol === "outDate") { va = a.checkOut || ""; vb = b.checkOut || ""; }
      else { va = ""; vb = ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rawItems, sortCol, sortDir]);

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <I.SortNone />;
    return sortDir === "asc" ? <I.SortAsc /> : <I.SortDesc />;
  };

  const colHeaderStyle = (col) => ({
    display: "flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none",
    color: sortCol === col ? C.pri : C.textMut,
    fontWeight: sortCol === col ? 800 : 700,
  });

  // Calendar helpers
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(viewDate+"T12:00:00"); return d.getMonth(); });
  const [calYear, setCalYear] = useState(() => { const d = new Date(viewDate+"T12:00:00"); return d.getFullYear(); });
  useEffect(() => { const d = new Date(viewDate+"T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const startDay = first.getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calMonth, calYear]);
  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => {
    const m = String(calMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    setViewDate(`${calYear}-${m}-${d}`);
    setShowCalendar(false);
  };
  const calRef = useRef(null);
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  // Summary grid data
  // Daycare totals (large + small + evals)
  const dcTotalScheduled = dcLargeScheduled + dcSmallScheduled + evalsScheduled;
  const dcTotalIn = dcLargeIn + dcSmallIn + evals.filter(r => r.status === "checked-in").length;
  const dcTotalOut = dcLargeOut + dcSmallOut + evals.filter(r => r.status === "checked-out").length;

  // Boarding totals
  const boardTotalScheduled = boardingByRoom.reduce((s, r) => s + r.scheduled, 0);
  const boardTotalIn = boardingByRoom.reduce((s, r) => s + r.checkedIn, 0);
  const boardTotalOut = boardingByRoom.reduce((s, r) => s + r.checkedOut, 0);

  // Grand total
  const grandScheduled = dcTotalScheduled + boardTotalScheduled + toursScheduled;
  const grandIn = dcTotalIn + boardTotalIn + tours.filter(r => r.status === "checked-in").length;
  const grandOut = dcTotalOut + boardTotalOut + toursCompleted;

  const summaryRows = [
    { label: "Tours", cols: [
      { label: "Scheduled", value: toursScheduled },
      { label: "Completed", value: toursCompleted, color: C.suc },
    ]},
    { section: "daycare" },
    { label: "Evaluations", cols: [
      { label: "Scheduled", value: evalsScheduled },
      { label: "Remaining", value: evalsRemaining, color: C.warn },
      { label: "Passed Group", value: evalsPassedGroup, color: C.suc },
      { label: "Passed Private", value: evalsPassedPrivate, color: C.info },
    ]},
    { label: "Large Daycare", cols: [
      { label: "Scheduled", value: dcLargeScheduled },
      { label: "Checked In", value: dcLargeIn, color: C.suc },
      { label: "Checked Out", value: dcLargeOut, color: C.textSec },
    ]},
    { label: "Small Daycare", cols: [
      { label: "Scheduled", value: dcSmallScheduled },
      { label: "Checked In", value: dcSmallIn, color: C.suc },
      { label: "Checked Out", value: dcSmallOut, color: C.textSec },
    ]},
    { label: "Total Daycare", isTotal: true, cols: [
      { label: "Scheduled", value: dcTotalScheduled },
      { label: "Checked In", value: dcTotalIn, color: C.suc },
      { label: "Checked Out", value: dcTotalOut, color: C.textSec },
    ]},
    { section: "boarding" },
    ...boardingByRoom.map(rm => ({
      label: rm.name, cols: [
        { label: "Booked", value: rm.scheduled },
        { label: "Checked In", value: rm.checkedIn, color: C.suc },
        { label: "Checked Out", value: rm.checkedOut, color: C.textSec },
      ]
    })),
    { label: "Total Boarding", isTotal: true, cols: [
      { label: "Booked", value: boardTotalScheduled },
      { label: "Checked In", value: boardTotalIn, color: C.suc },
      { label: "Checked Out", value: boardTotalOut, color: C.textSec },
    ]},
    { label: "Grand Total", isGrand: true, cols: [
      { label: "Scheduled", value: grandScheduled },
      { label: "Checked In", value: grandIn, color: C.suc },
      { label: "Checked Out", value: grandOut, color: C.textSec },
    ]},
  ];

  const grid = "minmax(90px,1.1fr) minmax(120px,1.6fr) minmax(58px,0.55fr) minmax(80px,1fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(50px,0.8fr) minmax(44px,0.45fr)";
  const [addOnPopup, setAddOnPopup] = useState(null); // { resId, anchorRect }
  const addOnPopupRef = useRef(null);
  useEffect(() => {
    if (!addOnPopup) return;
    const handler = (e) => { if (addOnPopupRef.current && !addOnPopupRef.current.contains(e.target)) setAddOnPopup(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addOnPopup]);
  const availableAddOns = (data.addOnRules || []).length > 0
    ? (data.addOnRules || []).map(r => r.name)
    : Object.keys({ ...DEF_PRICING.addOns, ...((data.pricing || {}).addOns || {}) });
  const toggleResAddOn = async (resId, addon) => {
    const res = data.reservations.find(r => r.id === resId);
    if (!res) return;
    const curr = res.addOns || [];
    const next = curr.includes(addon) ? curr.filter(a => a !== addon) : [...curr, addon];
    await save({ ...data, reservations: data.reservations.map(r => r.id === resId ? { ...r, addOns: next } : r) });
  };
  const summaryGrid = "160px repeat(4, 1fr)";

  // Group active items by clientId for merged rows
  const groupedItems = useMemo(() => {
    const groups = [];
    const map = {};
    for (const res of activeItems) {
      if (!map[res.clientId]) {
        map[res.clientId] = { clientId: res.clientId, reservations: [] };
        groups.push(map[res.clientId]);
      }
      map[res.clientId].reservations.push(res);
    }
    return groups;
  }, [activeItems]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Dashboard</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, position: "relative" }}>
            <button onClick={() => shiftDate(-1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0 }} title="Previous day">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text, textAlign: "center", padding: "4px 2px", whiteSpace: "nowrap" }}>
              {viewDateLabel}
            </span>
            <button onClick={() => shiftDate(1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0 }} title="Next day">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button onClick={() => setShowCalendar(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${showCalendar ? C.pri : C.border}`, background: showCalendar ? C.priLt : C.surface, cursor: "pointer", color: showCalendar ? C.pri : C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0, transition: "all 0.15s" }} title="Open calendar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            {!isToday && (
              <button onClick={() => setViewDate(td)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Today</button>
            )}

            {/* Calendar Popup */}
            {showCalendar && (
              <div ref={calRef} style={{ position: "absolute", top: "100%", left: 28, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
                {/* Month nav */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <button onClick={calPrev} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
                  <button onClick={calNext} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                {/* Day-of-week headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
                  {calDays.map((day, i) => {
                    if (day === null) return <div key={`e${i}`} />;
                    const m = String(calMonth + 1).padStart(2, "0");
                    const d = String(day).padStart(2, "0");
                    const dateStr = `${calYear}-${m}-${d}`;
                    const isSelected = dateStr === viewDate;
                    const isTodayCell = dateStr === td;
                    // count total dogs on-site for this date
                    const resCount = data.reservations.filter(r => r.status !== "cancelled" && r.checkIn <= dateStr && r.checkOut >= dateStr).length;
                    return (
                      <button key={i} onClick={() => calSelect(day)}
                        style={{
                          width: 34, height: 38, borderRadius: 10, border: isSelected ? `2px solid ${C.pri}` : isTodayCell ? `2px solid ${C.acc}` : "2px solid transparent",
                          background: isSelected ? C.pri : "transparent",
                          color: isSelected ? "#fff" : isTodayCell ? C.acc : C.text,
                          fontSize: 13, fontWeight: isSelected || isTodayCell ? 700 : 500,
                          cursor: "pointer", fontFamily: "inherit", padding: 0,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto",
                          transition: "all 0.1s", gap: 0, lineHeight: 1,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surfaceHover; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                      >
                        {day}
                        {resCount > 0 && <span style={{ fontSize: 8, fontWeight: 600, color: isSelected ? "rgba(255,255,255,0.7)" : C.textMut, lineHeight: 1, marginTop: 1 }}>{resCount}</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Today shortcut in calendar */}
                {!isToday && (
                  <div style={{ textAlign: "center", marginTop: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}>
                    <button onClick={() => { setViewDate(td); setShowCalendar(false); }} style={{ fontSize: 12, fontWeight: 700, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Go to Today</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span data-shortcut-quickdc="1" onClick={()=>setShowQuickDC(true)} style={{display:"inline-flex"}}><Btn variant="success" onClick={()=>setShowQuickDC(true)} icon={<I.Plus/>}>Quick Check-In{(data.hotkeySettings||{}).showHints===true&&<kbd style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:4,padding:"1px 5px",marginLeft:4,fontFamily:"'Outfit',monospace",lineHeight:1.4}}>Q</kbd>}</Btn></span>
          <Btn onClick={() => setShowSellPkg(true)} icon={<I.ShoppingCart/>} style={{background:C.acc,color:"#fff",border:"none"}}>Sell Package</Btn>
          <Btn onClick={onNew} icon={<I.Plus/>}>New {(data.hotkeySettings||{}).showHints===true&&<kbd style={{fontSize:10,fontWeight:600,color:C.textMut,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",marginLeft:4,fontFamily:"'Outfit',monospace",lineHeight:1.4}}>N</kbd>}</Btn>
        </div>
      </div>

      {/* ═══ Daily Summary + Occupancy (combined) ═══ */}
      {(() => {
        const totalDaycareCount = lgDaycareCount + smDaycareCount;
        const totalDaycareCap = lgDaycareCap + smDaycareCap;
        const overallCount = totalDaycareCount + boardingOcc;
        const overallCap = totalDaycareCap + totalRoomCount;
        const overallPct = overallCap > 0 ? Math.round((overallCount / overallCap) * 100) : 0;
        const boardingPct = totalRoomCount > 0 ? Math.round((boardingOcc / totalRoomCount) * 100) : 0;
        const daycarePct = totalDaycareCap > 0 ? Math.round((totalDaycareCount / totalDaycareCap) * 100) : 0;
        const pctColor = (p) => p > 85 ? C.dan : p > 60 ? C.acc : C.suc;
        return (
      <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
        {/* Grand Total Row - always visible, clickable to expand */}
        <button onClick={() => setShowSummaryDetail(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", padding: "12px 20px", background: C.priLt, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", gap: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"}
          onMouseLeave={e => e.currentTarget.style.background = C.priLt}
        >
          <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>{isToday ? "Today's Total" : viewDateObj.toLocaleDateString("en-US",{month:"short",day:"numeric"}) + " Total"}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.pri }}>{grandScheduled} Scheduled</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{grandScheduled}</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.pri, textTransform: "uppercase", opacity: 0.6 }}>Sched</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.suc, fontVariantNumeric: "tabular-nums" }}>{grandIn}</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.suc, textTransform: "uppercase", opacity: 0.7 }}>In</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{grandOut}</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.textMut, textTransform: "uppercase" }}>Out</div>
            </div>
            <div style={{ width: 1, height: 28, background: `${C.pri}25`, margin: "0 4px" }} />
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: pctColor(boardingPct), fontVariantNumeric: "tabular-nums" }}>{boardingPct}%</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.pri, textTransform: "uppercase", opacity: 0.6 }}>Board</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: pctColor(overallPct), fontVariantNumeric: "tabular-nums" }}>{overallPct}%</span>
              <div style={{ fontSize: 9, fontWeight: 600, color: C.pri, textTransform: "uppercase", opacity: 0.6 }}>Facility</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: "transform 0.2s", transform: showSummaryDetail ? "rotate(180deg)" : "rotate(0deg)" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </button>

        {/* Expandable Detail */}
        {showSummaryDetail && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {/* Summary breakdown table */}
            <div style={{ padding: "0 20px 12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: summaryGrid, gap: 0, marginTop: 8 }}>
                {summaryRows.filter(r => !r.isGrand).map((row, ri, arr) => {
                  if (row.section) {
                    return (
                      <React.Fragment key={`sec-${ri}`}>
                        <div style={{ gridColumn: "1 / -1", height: 0, borderBottom: `2px solid ${C.border}`, margin: "4px 0" }} />
                      </React.Fragment>
                    );
                  }
                  const padded = [...row.cols];
                  while (padded.length < 4) padded.push(null);
                  const nextRow = arr[ri + 1];
                  const isLast = ri === arr.length - 1;
                  const isBeforeSection = nextRow && nextRow.section;
                  const bb = isLast || isBeforeSection ? "none" : row.isTotal ? "none" : `1px solid ${C.borderLight}`;
                  const bg = row.isTotal ? C.bg : "transparent";
                  const labelWeight = row.isTotal ? 700 : 600;
                  const numSize = row.isTotal ? 15 : 14;
                  const bt = row.isTotal ? `2px solid ${C.border}` : "none";
                  return (
                    <React.Fragment key={ri}>
                      <div style={{ padding: "7px 0", borderBottom: bb, borderTop: bt, fontSize: 12, fontWeight: labelWeight, color: C.text, display: "flex", alignItems: "center", background: bg, paddingLeft: row.isTotal ? 6 : 0, borderRadius: row.isTotal ? "6px 0 0 6px" : 0 }}>{row.label}</div>
                      {padded.map((c, ci) => (
                        <div key={ci} style={{ padding: "7px 4px", borderBottom: bb, borderTop: bt, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: bg, borderRadius: row.isTotal && ci === padded.length - 1 ? "0 6px 6px 0" : 0 }}>
                          {c ? (<>
                            <span style={{ fontSize: numSize, fontWeight: 800, color: c.color || C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{c.value}</span>
                            <span style={{ fontSize: 8, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 1 }}>{c.label}</span>
                          </>) : null}
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Occupancy breakdown */}
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Occupancy</div>
                {/* 3-column breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  {[
                    { label: "Large Daycare", count: lgDaycareCount, cap: lgDaycareCap, color: C.pri, ltColor: C.priLt },
                    { label: "Small Daycare", count: smDaycareCount, cap: smDaycareCap, color: C.acc, ltColor: "#FFF7ED" },
                    { label: "Boarding", count: boardingOcc, cap: totalRoomCount, color: C.suc, ltColor: C.sucLt },
                  ].map(s => {
                    const p = s.cap > 0 ? Math.round((s.count / s.cap) * 100) : 0;
                    const bc = p > 85 ? C.dan : p > 60 ? C.acc : s.color;
                    return (
                      <div key={s.label} style={{ padding: "10px 12px", borderRadius: 10, background: s.ltColor, border: `1px solid ${s.color}20` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{s.count}<span style={{ fontWeight: 500, color: C.textSec }}>/{s.cap}</span></span>
                        </div>
                        <div style={{ width: "100%", height: 5, borderRadius: 3, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(p, 100)}%`, height: "100%", borderRadius: 3, background: bc, transition: "width 0.5s ease" }} />
                        </div>
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 3, textAlign: "right" }}>{p}%</div>
                      </div>
                    );
                  })}
                </div>
                {/* Summary row: Total Daycare + Overall Facility */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Daycare</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{totalDaycareCount}<span style={{ fontWeight: 500, color: C.textSec }}>/{totalDaycareCap}</span> <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(daycarePct), marginLeft: 2 }}>{daycarePct}%</span></span>
                    </div>
                    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(daycarePct, 100)}%`, height: "100%", borderRadius: 2, background: pctColor(daycarePct), transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: C.priLt, border: `1px solid ${C.pri}20` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em" }}>Overall Facility</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{overallCount}<span style={{ fontWeight: 500, color: C.textSec }}>/{overallCap}</span> <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(overallPct), marginLeft: 2 }}>{overallPct}%</span></span>
                    </div>
                    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(overallPct, 100)}%`, height: "100%", borderRadius: 2, background: pctColor(overallPct), transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
        );
      })()}

      {/* ═══ Tabbed Dashboard Table ═══ */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Search bar */}
        {(() => {
          const isAct = activeTab === "activities";
          const curQ = isAct ? actSearch : searchQuery;
          const setCurQ = isAct ? setActSearch : setSearchQuery;
          const hasQ = curQ.trim().length > 0;
          return (
            <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1.5px solid ${C.borderLight}`, background: C.bg, transition: "border-color 0.15s" }}
              onFocus={e => e.currentTarget.style.borderBottomColor = C.pri}
              onBlur={e => e.currentTarget.style.borderBottomColor = C.borderLight}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={hasQ ? C.pri : C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input data-shortcut-search className="no-focus-ring" value={curQ} onChange={e => setCurQ(e.target.value)} placeholder={isAct ? "Search by dog name, client name, or room…" : "Search by client name, dog name, phone, or email…"} style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: C.text, padding: "12px 10px", width: "100%", fontFamily: "inherit" }} />
              {!hasQ && !isAct && (data.hotkeySettings||{}).showHints===true && <kbd style={{fontSize:11,fontWeight:600,color:C.textMut,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:5,padding:"2px 7px",fontFamily:"'Outfit',monospace",flexShrink:0,lineHeight:1.4}}>/</kbd>}
              {hasQ && <button onClick={() => setCurQ("")} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex", fontFamily: "inherit" }} title="Clear search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
              {/* Filter pills — swap for Activities tab */}
              <div style={{ display: "flex", gap: 4, marginLeft: 8, flexShrink: 0 }}>
                {isAct ? (
                  <>
                    {[
                      { type: "feeding", label: "Feeding", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>, color: C.pri },
                      { type: "medication", label: "Meds", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 9h6"/></svg>, color: C.acc },
                      { type: "bathing", label: "Baths", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h0a2 2 0 012 2v1"/></svg>, color: C.info },
                    ].map(f => {
                      const on = actTypeFilter.has(f.type);
                      return (
                        <button key={f.type} onClick={() => toggleActType(f.type)}
                          style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${on ? f.color : C.border}`, background: on ? f.color : "transparent", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em", display: "flex", alignItems: "center", gap: 4 }}>
                          {f.icon}{f.label}
                        </button>
                      );
                    })}
                    {actTypeFilter.size > 0 && <button onClick={() => setActTypeFilter(new Set())} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: "0 2px", display: "flex", alignItems: "center", fontFamily: "inherit" }} title="Clear type filters"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                    {/* Time-of-day filter divider + pills */}
                    <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px", flexShrink: 0 }}/>
                    {[
                      { id: "am", label: "AM", desc: "Before 11 AM" },
                      { id: "noon", label: "Noon", desc: "11 AM – 2 PM" },
                      { id: "pm", label: "PM", desc: "After 2 PM" },
                    ].map(f => {
                      const on = actTimeFilter === f.id;
                      return (
                        <button key={f.id} onClick={() => setActTimeFilter(on ? "" : f.id)} title={f.desc}
                          style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${on ? C.text : C.border}`, background: on ? C.text : "transparent", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                          {f.label}
                        </button>
                      );
                    })}
                    {/* Bulk Action divider + controls */}
                    <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px", flexShrink: 0 }}/>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                      <span style={{ fontSize: 10, fontWeight: 800, color: C.pri, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>BULK</span>
                    </div>
                    <button onClick={executeBulkMark} disabled={pendingActivities.length === 0 || bulkAnimating} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: pendingActivities.length > 0 ? (bulkAnimating ? C.suc : C.pri) : C.border, color: pendingActivities.length > 0 ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: pendingActivities.length > 0 && !bulkAnimating ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s" }}
                      title={`Mark ${pendingActivities.length} pending items as complete`}>
                      {bulkAnimating ? "Marking..." : `Mark ${pendingActivities.length}`}
                    </button>
                    <button onClick={bulkResetAll} style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                      title="Reset all completed items">
                      Reset
                    </button>
                  </>
                ) : (
                  <>
                    {[
                      { type: "evaluation", label: "Evals", color: C.acc },
                      { type: "tour", label: "Tours", color: C.info },
                      { type: "boarding", label: "Board", color: C.pri },
                      { type: "dayboarding", label: "Day Board", color: C.pri },
                      { type: "daycare", label: "Daycare", color: C.suc },
                    ].map(f => {
                      const on = typeFilters.has(f.type);
                      return (
                        <button key={f.type} onClick={() => toggleTypeFilter(f.type)}
                          style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${on ? f.color : C.border}`, background: on ? f.color : "transparent", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                          {f.label}
                        </button>
                      );
                    })}
                    <span style={{ width: 1, height: 18, background: C.border, margin: "0 2px" }} />
                    <button onClick={() => { setAddOnsView(v => !v); if (!addOnsView) { setTypeFilters(new Set()); } }}
                      style={{ padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${addOnsView ? C.warn : C.border}`, background: addOnsView ? C.warn : "transparent", color: addOnsView ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                      Add-Ons
                    </button>
                    {(typeFilterActive || addOnsView) && <button onClick={() => { setTypeFilters(new Set()); setAddOnsView(false); }} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: "0 2px", display: "flex", alignItems: "center", fontFamily: "inherit" }} title="Clear filters"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                  </>
                )}
              </div>
            </div>
          );
        })()}
        {/* ═══ ADD-ONS SUMMARY VIEW ═══ */}
        {addOnsView ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Active Add-Ons</h3>
              <span style={{ fontSize: 12, color: C.textMut, fontWeight: 500 }}>across {inHouse.length} in-house {inHouse.length === 1 ? "dog" : "dogs"}</span>
            </div>
            {addOnsSummary.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: C.textMut, fontSize: 14 }}>No add-ons currently active for in-house dogs</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {addOnsSummary.map(item => {
                  const addonPrices = getAddOnPrices(data.pricing, data.addOnRules);
                  const price = addonPrices[item.name] ?? 0;
                  const totalRev = price * item.count;
                  return (
                    <div key={item.name} style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, background: C.surface, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40, height: 40, borderRadius: 10, background: C.warn + "18", color: C.warn, fontSize: 18, fontWeight: 800 }}>{item.count}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>${price.toFixed(2)} each · ${totalRev.toFixed(2)} total revenue</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "50%" }}>
                          {item.dogs.map((d, i) => (
                            <span key={i} onClick={() => nav("client-detail", { clientId: d.clientId })}
                              style={{ fontSize: 11, background: C.priO, color: C.pri, padding: "3px 8px", borderRadius: 8, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}
                              onMouseEnter={e => { e.target.style.background = C.pri; e.target.style.color = "#fff"; }}
                              onMouseLeave={e => { e.target.style.background = C.priO; e.target.style.color = C.pri; }}>
                              {d.dogName} ({d.clientName.split(" ").pop()})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: C.surfaceAlt, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>Total active add-ons</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.pri }}>{addOnsSummary.reduce((s, i) => s + i.count, 0)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Tab Bar */}
        <div style={{ display: "flex", borderBottom: `2px solid ${C.borderLight}`, background: C.bg }}>
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSortCol(null); }}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 16px", border: "none", borderBottom: `3px solid ${active ? tab.color : "transparent"}`, background: active ? C.surface : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", marginBottom: -2 }}>
                <span style={{ fontSize: 14, fontWeight: active ? 700 : 600, color: active ? C.text : C.textSec }}>{tab.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, padding: "0 8px", borderRadius: 12, fontSize: 13, fontWeight: 800, background: active ? tab.color : C.surfaceHover, color: active ? "#fff" : C.textSec, transition: "all 0.15s" }}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* ═══ ACTIVITIES TAB ═══ */}
        {activeTab === "activities" ? (
          <div>
            {/* Print Bath Schedule Button */}
            {(() => {
              const bathRows = allActivities.filter(r => r.type === "bathing");
              if (bathRows.length === 0) return null;
              const printBathSchedule = () => {
                const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
                const sorted = [...bathRows].sort((a, b) => {
                  const tA = a.checkOutTime || "23:59"; const tB = b.checkOutTime || "23:59";
                  return tA.localeCompare(tB);
                });
                const rows = sorted.map(r => {
                  const dName = r.dog?.fields.name || "Unknown";
                  const cLast = r.client?.fields.last_name || "";
                  const breed = r.dog?.fields.breed || "";
                  const weight = r.dog?.fields.weight ? `${r.dog.fields.weight} lbs` : "";
                  const co = r.checkOutTime ? fmtTimeLabel(r.checkOutTime) : "TBD";
                  const administered = r.logEntry?.administered;
                  const postBath = r.postBathReturn || "";
                  return `<tr style="${administered ? "background:#e8f5e9;" : ""}">
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:700;">${dName}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${cLast}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${breed}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${weight}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;">${r.room || "—"}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:700;">${r.detail || "Standard"}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:600;color:${postBath === "Return to Group" ? "#2e7d32" : postBath === "Return to Room" ? "#e65100" : "#666"};">${postBath || "—"}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;font-weight:700;">${co}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #ddd;text-align:center;">${administered ? "✓" : "☐"}</td>
                  </tr>`;
                }).join("");
                const html = `<!DOCTYPE html><html><head><title>Bath Schedule - ${today}</title>
                  <style>
                    @page { size: landscape; margin: 0.5in; }
                    body { font-family: Arial, sans-serif; color: #222; padding: 0; margin: 0; }
                    h1 { font-size: 22px; margin: 0 0 4px; color: #14532D; }
                    h2 { font-size: 14px; font-weight: 400; color: #666; margin: 0 0 16px; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th { background: #14532D; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
                    .summary { margin-top: 20px; font-size: 12px; color: #666; display: flex; gap: 24px; }
                    .summary span { font-weight: 700; color: #222; }
                  </style></head><body>
                  <h1>K9 Operations — Bath Schedule</h1>
                  <h2>${today} · ${bathRows.length} bath${bathRows.length !== 1 ? "s" : ""} scheduled</h2>
                  <table>
                    <thead><tr><th>Dog</th><th>Owner</th><th>Breed</th><th>Weight</th><th>Room</th><th>Bath Type</th><th>After Bath</th><th>Departs</th><th style="text-align:center">Done</th></tr></thead>
                    <tbody>${rows}</tbody>
                  </table>
                  <div class="summary">
                    <div>Total: <span>${bathRows.length}</span></div>
                    <div>Completed: <span>${bathRows.filter(r => r.logEntry?.administered).length}</span></div>
                    <div>Remaining: <span>${bathRows.filter(r => !r.logEntry?.administered).length}</span></div>
                  </div>
                  <script>window.onload=()=>{window.print();}<\/script>
                </body></html>`;
                const w = window.open("", "_blank");
                w.document.write(html);
                w.document.close();
              };
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
                  <div style={{ fontSize: 12, color: C.textSec }}>
                    <span style={{ fontWeight: 700, color: C.text }}>{bathRows.length}</span> bath{bathRows.length !== 1 ? "s" : ""} scheduled today · <span style={{ fontWeight: 700, color: C.suc }}>{bathRows.filter(r => r.logEntry?.administered).length}</span> done
                  </div>
                  <button onClick={printBathSchedule} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print Bath Schedule
                  </button>
                </div>
              );
            })()}
            {/* Activities Table Header */}
            {(() => {
              const showDeparts = actTypeFilter.has("bathing") || (actTypeFilter.size === 0 && filteredActivities.some(r => r.type === "bathing"));
              const bathOnly = actTypeFilter.size === 1 && actTypeFilter.has("bathing");
              const actGrid = bathOnly
                ? "80px minmax(120px,1.4fr) minmax(90px,1.2fr) 70px 80px minmax(90px,1fr) 80px 72px"
                : showDeparts
                  ? "80px minmax(120px,1.4fr) minmax(90px,1.2fr) 70px 80px minmax(90px,1fr) minmax(120px,1.3fr) 72px"
                  : "80px minmax(130px,1.5fr) minmax(110px,1.3fr) 70px 80px minmax(100px,1fr) minmax(155px,1.4fr)";
              const CONSUMPTION_OPTS = ["0%","25%","50%","75%","100%"];
              const typeBadge = (t) => {
                const cfg = t === "feeding" ? { bg: C.pri, label: "Feeding" } : t === "medication" ? { bg: C.acc, label: "Meds" } : { bg: C.info, label: "Bath" };
                return <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,fontWeight:700,color:"#fff",background:cfg.bg,padding:"2px 8px",borderRadius:6,whiteSpace:"nowrap"}}>{cfg.label}</span>;
              };
              const pendingCount = pendingActivities.length;

              const timePills = [["all","All"],["am","AM"],["noon","Noon"],["pm","PM"]];
              const typePills = [["all","All"],["feeding","Feeding"],["medication","Meds"],["bathing","Bath"]];

              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: actGrid, padding: "10px 12px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
                    <div>Time</div>
                    <div>Dog / Client</div>
                    <div>Task Details</div>
                    <div>Qty</div>
                    <div>Administered</div>
                    <div>By</div>
                    <div>{bathOnly ? "Bath Type" : "% Eaten"}</div>
                    {showDeparts && <div>Departs</div>}
                  </div>
                  <div style={{ minHeight: 200 }}>
                    {filteredActivities.length === 0 ? (
                      <div style={{ padding: "48px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>{allActivities.length === 0 ? "☕" : "🔍"}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.textSec }}>
                          {allActivities.length === 0 ? "No activities scheduled for in-house guests today" : "No activities match your search or filters"}
                        </div>
                        {allActivities.length === 0 && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>Activities will appear here when checked-in dogs have feeding, medication, or bath schedules.</div>}
                      </div>
                    ) : (
                      filteredActivities.map((row, ri) => {
                        const entry = row.logEntry;
                        const administered = !!entry.administered;
                        const justAnimated = bulkAnimatedIds.has(row.id);
                        const cLast = row.client?.fields.last_name || "";
                        const dName = row.dog?.fields.name || "Unknown";
                        return (
                          <div key={row.id} style={{ display: "grid", gridTemplateColumns: actGrid, padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "center", background: administered ? C.suc + "08" : "transparent", transition: "background 0.3s", cursor: "pointer", ...(justAnimated ? { background: C.suc + "22", boxShadow: `inset 4px 0 0 ${C.suc}`, transition: "background 0.6s ease-out, box-shadow 0.6s ease-out" } : {}) }}
                            onClick={() => setBoardingPreviewId(row.reservationId)}
                            onMouseEnter={e => { if (!administered) e.currentTarget.style.background = C.surfaceHover; }}
                            onMouseLeave={e => { e.currentTarget.style.background = administered ? C.suc + "08" : "transparent"; }}>
                            {/* Time */}
                            <div style={{ fontVariantNumeric: "tabular-nums" }}>
                              {(() => { const t = fmtTimeTwoLine(row.time); return (<><div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{t.label}</div>{t.sub && <div style={{ fontSize: 10, color: C.textMut, lineHeight: 1.2 }}>{t.sub}</div>}</>); })()}
                            </div>
                            {/* Dog + Client */}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <button onClick={e => { e.stopPropagation(); nav("dog-detail", { clientId: row.clientId, dogId: row.dogId }); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: C.pri, textDecoration: "underline", textDecorationColor: C.pri + "40" }}>{dName}</span>
                                </button>
                                <span style={{ fontSize: 12, color: C.textSec }}>{cLast}</span>
                              </div>
                              {row.room && <div style={{ fontSize: 11, color: C.textMut }}>Room {row.room}</div>}
                            </div>
                            {/* Task Details */}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                                {typeBadge(row.type)}
                                {row.foodType && <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{row.foodType}</span>}
                                {row.type === "bathing" && row.detail && <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{row.detail}</span>}
                              </div>
                              {row.instruction && <div style={{ fontSize: 11, color: C.textSec, fontStyle: "italic", marginTop: 2 }}>{row.instruction}</div>}
                              {row.notes && <div style={{ fontSize: 10, color: C.textMut, marginTop: 1 }}>{row.notes}</div>}
                            </div>
                            {/* QTY */}
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                              {row.qty || "—"}
                            </div>
                            {/* Administered Checkbox */}
                            <div onClick={e => e.stopPropagation()}>
                              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                                <input type="checkbox" checked={administered} style={{ accentColor: C.suc, width: 16, height: 16, cursor: "pointer" }}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      updateActivityLog(row.reservationId, row.colKey, { administered: true, by: actStaffName, at: new Date().toISOString() });
                                    } else {
                                      updateActivityLog(row.reservationId, row.colKey, { administered: false, by: "", at: "" });
                                    }
                                  }} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: administered ? C.suc : C.textMut }}>
                                  {administered ? "Done" : "Mark"}
                                </span>
                              </label>
                            </div>
                            {/* Administered By */}
                            <div onClick={e => e.stopPropagation()}>
                              {administered && entry.by ? (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{entry.by}</div>
                                  {entry.at && <div style={{ fontSize: 10, color: C.textMut }}>{new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</div>}
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: C.textMut }}>—</span>
                              )}
                            </div>
                            {/* % Eaten / Bath Type */}
                            <div onClick={e => e.stopPropagation()}>
                              {row.type === "feeding" ? (
                                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                                  {CONSUMPTION_OPTS.map(opt => {
                                    const sel = entry.consumption === opt;
                                    return (
                                      <button key={opt} onClick={() => updateActivityLog(row.reservationId, row.colKey, { consumption: sel ? "" : opt })}
                                        style={{ padding: "3px 7px", borderRadius: 6, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : "transparent", color: sel ? C.pri : C.textSec, fontSize: 10, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", minWidth: 30, transition: "all 0.12s" }}>
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : row.type === "bathing" && bathOnly ? (
                                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{row.detail}</span>
                              ) : (
                                <span style={{ fontSize: 11, color: C.textMut }}>—</span>
                              )}
                            </div>
                            {/* Departs (shown when baths visible) */}
                            {showDeparts && (
                              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                                {row.checkOutTime ? fmtTimeLabel(row.checkOutTime) : "—"}
                                {row.checkOut && <div style={{ fontSize: 10, color: C.textMut }}>{fmtDate(row.checkOut)}</div>}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
        <>
        {/* Table Header */}
        <div style={{ display: "grid", gridTemplateColumns: grid, padding: "10px 12px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
          <div style={colHeaderStyle("client")} onClick={() => handleSort("client")}>Client <SortIcon col="client" /></div>
          <div style={colHeaderStyle("dog")} onClick={() => handleSort("dog")}>Dog <SortIcon col="dog" /></div>
          <div style={colHeaderStyle("service")} onClick={() => handleSort("service")}>Service <SortIcon col="service" /></div>
          <div style={colHeaderStyle("lodging")} onClick={() => handleSort("lodging")}>Lodging <SortIcon col="lodging" /></div>
          <div style={colHeaderStyle("inDate")} onClick={() => handleSort("inDate")}>In Date <SortIcon col="inDate" /></div>
          <div style={colHeaderStyle("inTime")} onClick={() => handleSort("inTime")}>In Time <SortIcon col="inTime" /></div>
          <div style={colHeaderStyle("outDate")} onClick={() => handleSort("outDate")}>Out Date <SortIcon col="outDate" /></div>
          <div style={colHeaderStyle("outTime")} onClick={() => handleSort("outTime")}>Out Time <SortIcon col="outTime" /></div>
          <div>Add-Ons</div>
          <div style={{ textAlign: "right" }}>Action</div>
        </div>

        {/* Rows */}
        <div style={{ minHeight: 200 }}>
          {groupedItems.length === 0 ? (
            <div style={{ padding: "48px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.textSec }}>
                {activeTab === "expected" ? "No arrivals expected today" : activeTab === "inhouse" ? "No dogs currently in-house" : activeTab === "goinghome" ? "No departures today" : "No check-outs yet today"}
              </div>
            </div>
          ) : (
            groupedItems.map(group => {
              const client = data.clients.find(x => x.id === group.clientId);
              const resCount = group.reservations.length;
              return (
                <div key={group.clientId} data-row style={{ display: "grid", gridTemplateColumns: grid, padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "start", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {/* Col 1: Client (spans all dog rows) */}
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: resCount > 1 ? resCount * 52 : "auto" }}>
                    <div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); nav("client-detail", { clientId: group.clientId }); }}
                        onMouseEnter={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="underline"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = "transparent"; }}
                        onMouseLeave={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="none"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = C.surfaceHover; }}>
                        <Hl><span data-hl style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{cn(group.clientId)}</span></Hl>
                        {client && <AgreementIcons client={client} agreements={data.agreements} />}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSec, fontVariantNumeric: "tabular-nums" }}>{fmtPhone(client?.fields.phone)}</div>
                    </div>
                  </div>

                  {/* Col 2-6: Dogs (each dog is a sub-row) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: resCount > 1 ? 8 : 0, gridColumn: "2 / -1" }}>
                    {group.reservations.map(res => {
                      const dog = getDog(res.dogId);
                      const showCheckIn = activeTab === "expected";
                      const showCheckOut = activeTab === "inhouse" || activeTab === "goinghome";
                      const age = dog ? calcAge(dog.fields.dob) : null;
                      const weight = dog?.fields.weight;
                      const snLabel = dog ? fixedLabel(dog) : "";
                      const dogDetails = [age, weight ? `${weight}lbs` : null, snLabel].filter(Boolean).join(" · ");
                      return (
                        <div key={res.id} onClick={() => setBoardingPreviewId(res.id)} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1.6fr) minmax(58px,0.55fr) minmax(80px,1fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(68px,0.7fr) minmax(62px,0.6fr) minmax(50px,0.8fr) minmax(44px,0.45fr)", alignItems: "center", minHeight: 40, cursor: "pointer" }}>
                          {/* Dog info */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); if (dog) nav("dog-detail", { clientId: res.clientId, dogId: res.dogId }); }}
                              onMouseEnter={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="underline"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = "transparent"; }}
                              onMouseLeave={e => { e.currentTarget.querySelector("[data-hl]")&&(e.currentTarget.querySelector("[data-hl]").style.textDecoration="none"); const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = C.surfaceHover; }}>
                              <Hl><span data-hl style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>{dn(res.dogId)}</span></Hl>
                              {dog && <DogPicHover dog={dog} size={20} />}
                              {dog && <VaxIcon dog={dog} requiredVaccines={data.requiredVaccines} policies={data.resortPolicies} />}
                              {dog && <DogTagChips dog={dog} dogTags={data.dogTags} size="sm" />}
                              {dog && (() => { const allEvals = (data.evaluations||[]).filter(e=>e.dogId===res.dogId&&e.locked).sort((a,b)=>(b.date||"").localeCompare(a.date||"")); if (!allEvals.length) return null; const le = allEvals[0]; const tipLines = allEvals.map((ev,i) => `Eval ${i+1}: ${ev.result==="green"?"Approved":"Not Approved"} \u2014 ${ev.totalScore||0}/${ev.maxScore||0} pts (${fmtDate(ev.date)})`).join("\n"); return (
                                <Tip text={tipLines}>
                                  <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:le.result==="green"?C.suc:C.dan,color:"#fff",fontSize:9,fontWeight:800,flexShrink:0}}>{le.result==="green"?"\u2713":"\u2717"}</span>
                                </Tip>); })()}
                              {/* EOD Mention count icon */}
                              {(() => { const eodCount = (data.eodEntries || []).reduce((cnt, e) => { if (!e.date || e.date < res.checkIn || (res.checkOut && e.date > res.checkOut)) return cnt; return cnt + (e.mentions || []).filter(m => m.entityType === "dog" && m.entityId === res.dogId).length; }, 0); if (!eodCount) return null; return (
                                <Tip text={`${eodCount} EOD note${eodCount !== 1 ? "s" : ""} during stay`}>
                                  <span style={{display:"inline-flex",alignItems:"center",gap:2,padding:"1px 6px",borderRadius:8,background:C.acc+"20",color:C.acc,fontSize:10,fontWeight:800,flexShrink:0}}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    ×{eodCount}
                                  </span>
                                </Tip>); })()}
                            </div>
                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 1 }}>{dog?.fields?.breed ? `${dog.fields.breed} · ` : ""}{dogDetails}</div>
                            {res.notes && <div style={{ fontSize: 10, color: C.textMut, fontStyle: "italic", marginTop: 2 }}>{res.notes}</div>}
                          </div>
                          {/* Service */}
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{typeLabel(res.type)}</span>
                          </div>
                          {/* Lodging */}
                          <div style={{ minWidth: 0, overflow: "hidden" }}>
                            {(res.type === "boarding" || res.type === "dayboarding") && res.roomType && <><div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{res.roomType}</div>{res.room && <div style={{ fontSize: 11, color: C.textSec }}>{res.room}</div>}{res.checkIn && res.checkOut && (() => { const nights = Math.round((new Date(res.checkOut+"T12:00:00") - new Date(res.checkIn+"T12:00:00")) / 86400000); return nights > 0 ? <div style={{ fontSize: 11, color: C.textMut }}>{nights} night{nights !== 1 ? "s" : ""}</div> : null; })()}</>}
                          </div>
                          {/* In Date */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckInTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(new Date(res.actualCheckInTime).toISOString().split("T")[0])}</span>
                              {new Date(res.actualCheckInTime).toISOString().split("T")[0] !== res.checkIn && <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtDate(res.checkIn)}</div>}
                            </> : <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(res.checkIn)}</span>}
                          </div>
                          {/* In Time */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckInTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{new Date(res.actualCheckInTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                              <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtTime(res.checkInTime)}</div>
                            </> : <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtTime(res.checkInTime)}</span>}
                          </div>
                          {/* Out Date */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckOutTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(new Date(res.actualCheckOutTime).toISOString().split("T")[0])}</span>
                              {new Date(res.actualCheckOutTime).toISOString().split("T")[0] !== res.checkOut && <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtDate(res.checkOut)}</div>}
                            </> : <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(res.checkOut)}</span>}
                          </div>
                          {/* Out Time */}
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {res.actualCheckOutTime ? <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{new Date(res.actualCheckOutTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                              <div style={{ fontSize: 10, color: C.textMut, textDecoration: "line-through" }}>sched: {fmtTime(res.checkOutTime)}</div>
                            </> : <>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtTime(res.checkOutTime)}</span>
                            </>}
                          </div>
                          {/* Add-Ons */}
                          <div style={{ position: "relative" }}>
                            {res.type !== "tour" ? (() => {
                              const resAddOns = res.addOns || [];
                              return (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", minHeight: 24 }}
                                  onMouseEnter={e => { const b = e.currentTarget.querySelector("[data-addon-plus]"); if (b) { b.style.opacity = "1"; b.style.pointerEvents = "auto"; } }}
                                  onMouseLeave={e => { const b = e.currentTarget.querySelector("[data-addon-plus]"); if (b) { b.style.opacity = resAddOns.length > 0 ? "0.6" : "0"; b.style.pointerEvents = resAddOns.length > 0 ? "auto" : "none"; } }}>
                                  {resAddOns.map(a => (
                                    <span key={a} style={{ fontSize: 9, background: C.priO, color: C.pri, padding: "1px 6px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{a}</span>
                                  ))}
                                  <span data-addon-plus
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setAddOnPopup(prev => prev?.resId === res.id ? null : { resId: res.id, x: rect.left, y: rect.bottom + 4 });
                                    }}
                                    onMouseEnter={e => { const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = "transparent"; }}
                                    onMouseLeave={e => { const r = e.currentTarget.closest("[data-row]"); if (r) r.style.background = C.surfaceHover; }}
                                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", border: `1.5px dashed ${C.border}`, color: C.textMut, fontSize: 14, cursor: "pointer", opacity: resAddOns.length > 0 ? 0.6 : 0, pointerEvents: resAddOns.length > 0 ? "auto" : "none", transition: "opacity 0.15s" }}
                                  >+</span>
                                </div>
                              );
                            })() : null}
                          </div>
                          {/* Action */}
                          <div style={{ textAlign: "right" }} onClick={e => e.stopPropagation()}>
                            {showCheckIn && <Btn size="sm" variant="success" onClick={() => handleCheckIn(res.id)} icon={<I.LogIn/>}>In</Btn>}
                            {showCheckOut && (() => {
                              const dogHasEvalTag = dog && (dog.tags || []).includes("tag_eval");
                              const isEvalRes = res.type === "evaluation";
                              const evalDone = hasCompletedEval(data, res);
                              const needsEvalBtn = (isEvalRes && !evalDone) || (dogHasEvalTag && !evalDone) || ((res.type === "boarding" || res.type === "dayboarding") && res.needsEval && !evalDone);
                              return needsEvalBtn ? <Btn size="sm" variant="warning" onClick={() => nav("evaluation-form", { reservationId: res.id })} icon={<I.Clipboard/>}>Eval</Btn> : null;
                            })()}
                            {showCheckOut && (
                              <Btn size="sm" variant="accent" onClick={() => handleCheckOut(res.id)} icon={<I.LogOut/>}>Out</Btn>
                            )}
                            {activeTab === "checkedout" && <Badge color="default" size="sm">Done</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        </>
        )}
        </>
        )}
      </Card>

      {/* Add-On Quick-Add Popup */}
      {addOnPopup && (() => {
        const res = data.reservations.find(r => r.id === addOnPopup.resId);
        if (!res) return null;
        const resAddOns = res.addOns || [];
        const addonRulesMap = Object.fromEntries((data.addOnRules || []).map(r => [r.name, r.price]));
        const addonPrices = (data.addOnRules || []).length > 0 ? addonRulesMap : { ...DEF_PRICING.addOns, ...((data.pricing || {}).addOns || {}) };
        return ReactDOM.createPortal(
          <div ref={addOnPopupRef} style={{ position: "fixed", left: Math.min(addOnPopup.x, window.innerWidth - 260), top: Math.min(addOnPopup.y, window.innerHeight - 400), zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", padding: "8px 0", minWidth: 240, maxHeight: 400, overflowY: "auto", fontFamily: "'Outfit', -apple-system, sans-serif" }}>
            <div style={{ padding: "6px 14px 8px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.borderLight}` }}>Add-Ons</div>
            {availableAddOns.map(addon => {
              const active = resAddOns.includes(addon);
              const price = addonPrices[addon] ?? 0;
              return (
                <div key={addon} onClick={() => toggleResAddOn(addOnPopup.resId, addon)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", cursor: "pointer", transition: "background 0.1s", fontSize: 13, borderBottom: `1px solid ${C.borderLight}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${active ? C.pri : C.border}`, background: active ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{active ? "\u2713" : ""}</span>
                  <span style={{ flex: 1, fontWeight: 500, color: C.text }}>{addon}</span>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>${price}</span>
                </div>
              );
            })}
            {availableAddOns.length === 0 && <div style={{ padding: "12px 14px", fontSize: 12, color: C.textMut }}>No add-ons configured. Add them in Settings → Pricing.</div>}
          </div>,
          document.body
        );
      })()}

      {/* Quick Check-in Modal */}
      {showQuickDC && (
        <Modal title="Quick Check-In" wide onClose={()=>{setShowQuickDC(false);setDcSearch("");setDcCompExpand(null);}}>
          <div style={{marginBottom:12}}>
            <input ref={dcSearchRef} className="no-focus-ring" value={dcSearch} onChange={e=>setDcSearch(e.target.value)} placeholder="Search client or dog name..." style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:14,fontWeight:500,fontFamily:"inherit",outline:"none",background:C.bg}} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
          <div style={{maxHeight:350,overflowY:"auto"}}>
            {(() => {
              const q = dcSearch.trim().toLowerCase();
              if (!q) return <div style={{padding:20,textAlign:"center",color:C.textMut,fontSize:13}}>Type a client or dog name to search</div>;
              const results = [];
              data.clients.forEach(cl => {
                const cName = `${cl.fields?.first_name||""} ${cl.fields?.last_name||""}`.trim();
                const dogs = data.dogs.filter(d => d.fields?.owner_id === cl.id || data.reservations.some(r => r.clientId === cl.id && r.dogId === d.id));
                const uniqueDogs = [...new Map(dogs.map(d => [d.id, d])).values()];
                const cMatch = cName.toLowerCase().includes(q);
                uniqueDogs.forEach(dog => {
                  const dName = (dog.fields?.name || "").toLowerCase();
                  if (cMatch || dName.includes(q)) {
                    const alreadyIn = data.reservations.some(r => r.dogId === dog.id && (r.type === "daycare" || r.type === "dayboarding") && r.checkIn === vd && r.status === "checked-in");
                    results.push({ clientId: cl.id, clientName: cName, dogId: dog.id, dogName: dog.fields?.name, breed: dog.fields?.breed, size: getDogDaycareSize(dog), alreadyIn });
                  }
                });
              });
              if (results.length === 0) return <div style={{padding:20,textAlign:"center",color:C.textMut,fontSize:13}}>No dogs found matching "{dcSearch}"</div>;
              return results.slice(0, 10).map((r, i) => {
                const dog = data.dogs.find(d=>d.id===r.dogId);
                const client = data.clients.find(c=>c.id===r.clientId);
                const vaxStatus = getVaxStatus(dog, data.requiredVaccines, data.resortPolicies);
                const ecOk = !!(client?.fields?.emergency_contact?.trim() && client?.fields?.emergency_phone?.trim());
                const agreements = data.agreements || DEF_AGREEMENTS;
                const reqAgrs = agreements.filter(a=>a.required!==false);
                const agrOk = reqAgrs.every(a=>agrSigned(client,a.id));
                const ageStatus = getDogAgeCompliance(dog, data.resortPolicies, data.reservations);
                const snStatus = getSpayNeuterCompliance(dog);
                const allGreen = vaxStatus.ok && ecOk && agrOk && ageStatus.ok && snStatus.ok;
                const checks = [
                  { ok: vaxStatus.ok, label: "Vaccines", expandKey: "vax",
                    detail: vaxStatus.ok ? "Up to date" : `${[...(vaxStatus.expired||[]),...(vaxStatus.missing||[])].length} issue(s)`,
                    children: <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {vaxStatus.ok ? <div style={{color:C.suc,fontSize:11}}>All vaccines current</div> : <>
                        {(vaxStatus.expired||[]).map(vId=>{const vax=VACCINES.find(v=>v.id===vId);return <div key={vId} style={{color:C.dan,fontSize:11}}>• {vax?vax.name:vId.replace(/_/g," ")} — Expired</div>;})}
                        {(vaxStatus.missing||[]).map(vId=>{const vax=VACCINES.find(v=>v.id===vId);return <div key={vId} style={{color:C.dan,fontSize:11}}>• {vax?vax.name:vId.replace(/_/g," ")} — Missing</div>;})}
                      </>}
                      {(data.requiredVaccines||[]).map(vId=>{
                        const curDate=dog.fields[vId]||"";const vax=VACCINES.find(v=>v.id===vId);const vaxName=vax?vax.name:vId.replace(/_/g," ");
                        return <div key={vId+"e"} style={{marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,color:C.textSec,minWidth:90,fontWeight:600}}>{vaxName}</span>
                          <MiniDatePicker value={curDate} onChange={async(v)=>{await save({...data,dogs:data.dogs.map(d=>d.id===dog.id?{...d,fields:{...d.fields,[vId]:v}}:d)});}}/>
                          {curDate&&<span style={{fontSize:9,color:vaxStatus.expired?.includes(vId)?C.dan:C.suc,fontWeight:600}}>{vaxStatus.expired?.includes(vId)?"Expired":"Valid"}</span>}
                        </div>;
                      })}
                    </div>
                  },
                  { ok: ecOk, label: "Emergency Contact", expandKey: "ec",
                    detail: ecOk ? client.fields.emergency_contact : "Missing",
                    children: <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:10,color:C.textSec,fontWeight:600,minWidth:50}}>Name</span>
                        <input value={client?.fields?.emergency_contact||""} placeholder="Contact name..." style={{flex:1,fontSize:11,padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",outline:"none"}}
                          onChange={async(e)=>{await save({...data,clients:data.clients.map(c=>c.id===client.id?{...c,fields:{...c.fields,emergency_contact:e.target.value}}:c)});}}/>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:10,color:C.textSec,fontWeight:600,minWidth:50}}>Phone</span>
                        <input value={client?.fields?.emergency_phone||""} placeholder="Contact phone..." style={{flex:1,fontSize:11,padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",outline:"none"}}
                          onChange={async(e)=>{await save({...data,clients:data.clients.map(c=>c.id===client.id?{...c,fields:{...c.fields,emergency_phone:e.target.value}}:c)});}}/>
                      </div>
                    </div>
                  },
                  { ok: agrOk, label: "Agreements", expandKey: "agr",
                    detail: agrOk ? "All signed" : `${reqAgrs.filter(a=>!agrSigned(client,a.id)).length} unsigned`,
                    children: <div style={{display:"flex",flexDirection:"column",gap:4}}>
                      {reqAgrs.map(agr=>{
                        const signed=agrSigned(client,agr.id);const signedData=(client.agreements||{})[agr.id];
                        return <div key={agr.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.borderLight}`}}>
                          <div>
                            <span style={{fontSize:11,color:C.text,fontWeight:600}}>{agr.name}</span>
                            {signed&&signedData?.date&&<span style={{fontSize:9,color:C.suc,marginLeft:6}}>Signed {fmtDate(signedData.date)}</span>}
                          </div>
                          {!signed ? <Btn size="sm" onClick={async()=>{
                            const agrs={...(client.agreements||{}),[agr.id]:{signed:true,date:todayStr()}};
                            await save({...data,clients:data.clients.map(c=>c.id===client.id?{...c,agreements:agrs}:c)});
                          }}>Sign Now</Btn> : <span style={{fontSize:10,color:C.suc,fontWeight:700}}>✓ Signed</span>}
                        </div>;
                      })}
                    </div>
                  },
                  { ok: ageStatus.ok, warn: ageStatus.grandfathered, label: "Dog Age", expandKey: "age",
                    detail: ageStatus.ok ? (ageStatus.age ? `${ageStatus.age}yr${ageStatus.grandfathered?" (Grandfathered)":""}` : "OK") : (ageStatus.reason || "Failed"),
                    children: <div style={{display:"flex",flexDirection:"column",gap:4}}>
                      {ageStatus.age ? <span style={{color:ageStatus.ok?C.suc:C.dan,fontSize:11}}>
                        {ageStatus.age} years old{ageStatus.grandfathered&&` (Grandfathered — ${ageStatus.visitCount||0} visits)`}{!ageStatus.ok&&!ageStatus.grandfathered&&` — ${ageStatus.reason}`}
                      </span> : <span style={{color:C.textMut,fontSize:11}}>Age not set</span>}
                      <div style={{fontSize:9,color:C.textMut,marginTop:2}}>Max age: {(data.resortPolicies||{}).maxDogAge||13} years. Grandfathered after {(data.resortPolicies||{}).grandfatherVisitThreshold||10} visits.</div>
                    </div>
                  },
                  { ok: snStatus.ok, label: "Spay/Neuter", expandKey: "sn",
                    detail: snStatus.ok?(snStatus.status==="Neutered"||snStatus.status==="Spayed"?snStatus.status:(snStatus.privatePlay?"Intact (PP)":snStatus.status||"N/A")):`Intact — ${snStatus.reason||"Must be Private Play"}`,
                    children: <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <span style={{color:snStatus.ok?C.suc:C.dan,fontSize:11}}>
                        {snStatus.status==="Neutered"||snStatus.status==="Spayed"?snStatus.status:`Intact${snStatus.ageMonths!=null?` (${snStatus.ageMonths} months old)`:""}`}
                        {snStatus.privatePlay&&" — Private Play assigned"}
                        {!snStatus.ok&&` — ${snStatus.reason}`}
                      </span>
                      <div style={{fontSize:9,color:C.textMut}}>Intact dogs 10+ months old must be assigned to Private Play.</div>
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
                  },
                ];
                return (
                <div key={i} style={{padding:"12px 14px",borderRadius:12,border:`1px solid ${r.alreadyIn?C.suc+"40":C.border}`,marginBottom:8,background:r.alreadyIn?C.sucLt:C.surface}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:r.alreadyIn?0:8}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span onClick={(e)=>{e.stopPropagation();setShowQuickDC(false);setDcSearch("");nav("dog-detail",{clientId:r.clientId,dogId:r.dogId});}} style={{fontWeight:700,fontSize:14,color:C.pri,cursor:"pointer",textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{r.dogName}</span>
                        <span style={{fontWeight:400,color:C.textSec,fontSize:12}}>({r.breed})</span>
                        {dog && <DogPicHover dog={dog} size={20}/>}
                        {dog && <VaxIcon dog={dog} requiredVaccines={data.requiredVaccines} policies={data.resortPolicies}/>}
                        {dog && <DogTagChips dog={dog} dogTags={data.dogTags} size="sm"/>}
                        {dog && (()=>{ const allEvals=(data.evaluations||[]).filter(e=>e.dogId===r.dogId&&e.locked).sort((a,b)=>(b.date||"").localeCompare(a.date||"")); if(!allEvals.length)return null; const le=allEvals[0]; const tipLines=allEvals.map((ev,ei)=>`Eval ${ei+1}: ${ev.result==="green"?"Approved":"Not Approved"} \u2014 ${ev.totalScore||0}/${ev.maxScore||0} pts (${fmtDate(ev.date)})`).join("\n"); return <Tip text={tipLines}><span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:le.result==="green"?C.suc:C.dan,color:"#fff",fontSize:9,fontWeight:800,flexShrink:0}}>{le.result==="green"?"\u2713":"\u2717"}</span></Tip>; })()}
                      </div>
                      <div style={{fontSize:12,color:C.textSec,display:"flex",alignItems:"center",gap:2,flexWrap:"wrap"}}>
                        <span onClick={(e)=>{e.stopPropagation();setShowQuickDC(false);setDcSearch("");nav("client-detail",{clientId:r.clientId});}} style={{color:C.pri,cursor:"pointer",fontWeight:600,textDecoration:"none"}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{r.clientName}</span>
                        <span style={{color:C.textMut}}>{"\u2022"}</span>
                        <span>{r.size === "small" ? "Small" : "Large"} daycare</span>
                      </div>
                    </div>
                    {r.alreadyIn && <Badge color="success" size="sm">Already In</Badge>}
                  </div>
                  {!r.alreadyIn && (() => {
                    // Compliance rules: check which validations apply per appointment type
                    const cRules = data.complianceRules || {};
                    const isCheckRequired = (checkId, apptType) => {
                      const rule = cRules[checkId];
                      if (!rule || rule.appliesTo === "all") return true;
                      if (rule.appliesTo === "none") return false;
                      if (rule.appliesTo === "custom") return (rule.apptTypes || []).includes(apptType);
                      return true;
                    };
                    // Spay/neuter is visual-only — does NOT block check-in per K9 Operations policy
                    const dcGreen = [
                      {id:"vaccines",ok:vaxStatus.ok},{id:"emergency_contact",ok:ecOk},{id:"agreements",ok:agrOk},{id:"dog_age",ok:ageStatus.ok}
                    ].every(c => !isCheckRequired(c.id, "group_daycare") || c.ok);
                    const dbGreen = [
                      {id:"vaccines",ok:vaxStatus.ok},{id:"emergency_contact",ok:ecOk},{id:"agreements",ok:agrOk},{id:"dog_age",ok:ageStatus.ok}
                    ].every(c => !isCheckRequired(c.id, "dayboarding") || c.ok);
                    return <>
                    <div style={{display:"flex",gap:8,marginBottom:8}}>
                      <button onClick={()=>{if(dcGreen)quickDCCheckIn(r.clientId, r.dogId, "daycare");}} disabled={!dcGreen}
                        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${dcGreen?C.suc+"30":C.border}`,background:dcGreen?`${C.suc}08`:C.bg,color:dcGreen?C.suc:C.textMut,fontSize:13,fontWeight:700,cursor:dcGreen?"pointer":"not-allowed",fontFamily:"inherit",transition:"all 0.15s",opacity:dcGreen?1:0.5}}
                        onMouseEnter={e=>{if(dcGreen){e.currentTarget.style.background=C.suc;e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor=C.suc;}}}
                        onMouseLeave={e=>{if(dcGreen){e.currentTarget.style.background=`${C.suc}08`;e.currentTarget.style.color=C.suc;e.currentTarget.style.borderColor=`${C.suc}30`;}}}>
                        <I.LogIn style={{width:14,height:14}}/> Daycare
                      </button>
                      <button onClick={()=>{if(dbGreen)quickDCCheckIn(r.clientId, r.dogId, "dayboarding");}} disabled={!dbGreen}
                        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${dbGreen?C.pri+"30":C.border}`,background:dbGreen?`${C.pri}08`:C.bg,color:dbGreen?C.pri:C.textMut,fontSize:13,fontWeight:700,cursor:dbGreen?"pointer":"not-allowed",fontFamily:"inherit",transition:"all 0.15s",opacity:dbGreen?1:0.5}}
                        onMouseEnter={e=>{if(dbGreen){e.currentTarget.style.background=C.pri;e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor=C.pri;}}}
                        onMouseLeave={e=>{if(dbGreen){e.currentTarget.style.background=`${C.pri}08`;e.currentTarget.style.color=C.pri;e.currentTarget.style.borderColor=`${C.pri}30`;}}}>
                        <I.LogIn style={{width:14,height:14}}/> Day Boarding
                      </button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                      {checks.map((ck,ci)=>{
                        const expKey=`${r.dogId}|${ck.expandKey}`;
                        const isExp=dcCompExpand===expKey;
                        return (
                        <div key={ci} style={{gridColumn:isExp?"1 / -1":"auto"}}>
                          <button onClick={()=>setDcCompExpand(prev=>prev===expKey?null:expKey)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1.5px solid ${ck.ok?C.suc+"50":ck.warn?C.acc+"50":C.dan+"50"}`,background:ck.ok?`${C.suc}0C`:ck.warn?`${C.acc}0C`:`${C.dan}0C`,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.12s"}}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <span style={{fontSize:12,fontWeight:800,color:ck.ok?C.suc:ck.warn?C.acc:C.dan}}>{ck.ok?"✓":ck.warn?"⚠":"✗"}</span>
                              <span style={{fontSize:11,fontWeight:700,color:ck.ok?C.suc:ck.warn?C.acc:C.dan}}>{ck.label}</span>
                              <span style={{fontSize:8,color:C.textMut,marginLeft:"auto"}}>{isExp?"▲":"▼"}</span>
                            </div>
                            <div style={{fontSize:9,color:C.textSec,marginTop:1,paddingLeft:17}}>{ck.detail}</div>
                          </button>
                          {isExp && ck.children && <div style={{marginTop:4,padding:"8px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,fontSize:11}}>{ck.children}</div>}
                        </div>
                        );
                      })}
                    </div>
                  </>;
                  })()}
                </div>
                );
              });
            })()}
          </div>
        </Modal>
      )}

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
            const origCopy = { ...bRes };
            const merged = { ...bRes, ...updatedRes };
            if (doCheckIn) { merged.status = "checked-in"; merged.actualCheckInTime = new Date().toISOString(); merged.checkedInBy = profile ? (profile.full_name || profile.email || "Staff") : "Staff"; }
            if (doCheckOut) { merged.status = "checked-out"; merged.actualCheckOutTime = new Date().toISOString(); merged.checkedOutBy = profile ? (profile.full_name || profile.email || "Staff") : "Staff"; }
            // Store adjusted pricing with discount on reservation
            if (updatedRes.discountType && updatedRes.discountValue) {
              merged.discountType = updatedRes.discountType;
              merged.discountValue = updatedRes.discountValue;
            }
            // Deduct coupons from package sales if applied
            let updatedPackageSales = [...(data.packageSales || [])];
            if (updatedRes.appliedCoupons && updatedRes.appliedCoupons.length > 0) {
              updatedRes.appliedCoupons.forEach(ac => {
                updatedPackageSales = updatedPackageSales.map(s => s.id === ac.saleId ? { ...s, used: (s.used || 0) + ac.unitsUsed, unitsRemaining: Math.max(0, (s.unitsRemaining || s.quantity || 0) - ac.unitsUsed) } : s);
              });
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
            // Also log date/time changes made during checkout
            if (doCheckOut) {
              const coDiffs = [];
              if (updatedRes.checkIn !== bRes.checkIn) coDiffs.push({field:"Check-In Date",oldVal:bRes.checkIn,newVal:updatedRes.checkIn});
              if (updatedRes.checkOut !== bRes.checkOut) coDiffs.push({field:"Check-Out Date",oldVal:bRes.checkOut,newVal:updatedRes.checkOut});
              if (updatedRes.checkInTime !== bRes.checkInTime) coDiffs.push({field:"Check-In Time",oldVal:bRes.checkInTime,newVal:updatedRes.checkInTime});
              if (updatedRes.checkOutTime !== bRes.checkOutTime) coDiffs.push({field:"Check-Out Time",oldVal:bRes.checkOutTime,newVal:updatedRes.checkOutTime});
              if (coDiffs.length > 0) auditLogs.push(buildAuditEntry(bRes.id, "Adjusted Dates at Check-Out", coDiffs, profile));
            }
            const newAuditLog = [...(data.auditLog || []), ...auditLogs];
            await save({ ...data, auditLog: newAuditLog, packageSales: updatedPackageSales, reservations: data.reservations.map(r => r.id === bRes.id ? merged : r) });
            addDashToast({ dogName: bDog.fields.name, action: doCheckIn ? "checked in" : doCheckOut ? "checked out" : "updated", oldVal: doCheckIn ? "Upcoming" : doCheckOut ? "Checked In" : "Previous", newVal: doCheckIn ? "Checked In" : doCheckOut ? "Checked Out" : "Saved", undoRes: origCopy });
            // Offer to text client about reservation changes (not for check-in/out)
            if (!doCheckIn && !doCheckOut && diffs.length > 0 && bClient) {
              showTextNotifyToast(bClient, bDog, diffs);
            }
            setBoardingPreviewId(null);
          }}
          data={data} save={save} profile={profile} nav={nav}
        />;
      })()}

      {/* Dashboard Toast notifications */}
      {dashToasts.length > 0 && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
          {dashToasts.map(t => (
            <div key={t.id} style={{
              pointerEvents: "auto",
              background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)",
              border: `1.5px solid ${C.border}`, borderRadius: 12,
              padding: "12px 16px", maxWidth: 380, minWidth: 260,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              display: "flex", alignItems: "center", gap: 12, fontSize: 13,
              animation: "k9toast 0.3s ease-out",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>
                  {t.dogName}<span style={{ fontWeight: 500, color: C.textSec }}> {t.action}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textMut }}>
                  <span style={{ textDecoration: "line-through", color: C.dan }}>{t.oldVal}</span>
                  <span style={{ margin: "0 5px", color: C.textMut }}>&rarr;</span>
                  <span style={{ fontWeight: 600, color: C.suc }}>{t.newVal}</span>
                </div>
              </div>
              <button onClick={() => undoDashToast(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Undo</button>
              <button onClick={() => dismissDashToast(t.id)} style={{ width: 22, height: 22, borderRadius: 11, border: "none", background: "transparent", cursor: "pointer", color: C.textMut, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit" }}>&times;</button>
            </div>
          ))}
          {/* Text notification toast */}
          {textNotify && (
            <div style={{ pointerEvents: "auto", background: "rgba(255,255,255,0.98)", backdropFilter: "blur(8px)", border: `2px solid ${C.pri}`, borderRadius: 14, padding: "14px 18px", maxWidth: 420, minWidth: 300, boxShadow: "0 6px 24px rgba(0,0,0,0.18)", animation: "k9toast 0.3s ease-out" }}>
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
      )}
      {showSellPkg && <SellPackageModal data={data} save={save} onClose={() => setShowSellPkg(false)} nav={nav} profile={profile} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED FILTER DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
import { LC_FILTER_FIELDS, LC_OP_LABELS, applyStructuredFilters, LC_QUICK_PRESETS, RPT_FILTER_FIELDS, getFilterFieldsForReport, getPresetsForReport, applyReportFilters, DEFAULT_LIFECYCLE_BANNERS } from "./pos/lib/filters";

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE FILTER PANEL (renders inside sidebar)
// ═══════════════════════════════════════════════════════════════════════════
import { LifecycleFilterPanel } from "./pos/components/LifecycleFilterPanel";



// ═══════════════════════════════════════════════════════════════════════════
// REPORT FILTER FIELD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC FILTER PANEL (renders inside sidebar — matches LifecycleFilterPanel style)
// ═══════════════════════════════════════════════════════════════════════════
import { GenericFilterPanel } from "./pos/components/GenericFilterPanel";



// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS PAGE — Customer Lifecycle
// ═══════════════════════════════════════════════════════════════════════════
import { ClientsPage } from "./pos/pages/ClientsPage";

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT DETAIL
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATION FORM
// ═══════════════════════════════════════════════════════════════════════════
import { EvaluationFormPage } from "./pos/pages/EvaluationFormPage";

// ═══════════════════════════════════════════════════════════════════════════
// DOG DETAIL
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE VIEWER
// ═══════════════════════════════════════════════════════════════════════════
import { QuestionnaireViewer } from "./pos/components/QuestionnaireViewer";

// ═══════════════════════════════════════════════════════════════════════════
// NEW CLIENT
// ═══════════════════════════════════════════════════════════════════════════
import { NewClientPage } from "./pos/pages/NewClientPage";

// ═══════════════════════════════════════════════════════════════════════════
// BREED SEARCH DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════
import { BreedSearch } from "./pos/components/BreedSearch";

// ═══════════════════════════════════════════════════════════════════════════
// FEEDING SCHEDULE EDITOR
// ═══════════════════════════════════════════════════════════════════════════
// Blue Buffalo weight-based feeding charts (cups per day)
import { BB_CHART, BB_KEYS } from "./pos/constants/feeding";

import { FeedingScheduleEditor } from "./pos/components/FeedingScheduleEditor";

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION SCHEDULE EDITOR
// ═══════════════════════════════════════════════════════════════════════════
import { MedicationScheduleEditor } from "./pos/components/MedicationScheduleEditor";

// Helper: renders dog form fields with special handling for breed, sex, spay/neuter, bath, feeding, meds
function DogFormFields({ fields, dogFields, data, errors, onChange, feedingSchedules, onFeedingChange, medSchedules, onMedChange, autoFocusBreed, action, dogId, onWeightUpdate }) {
  const sex = fields.sex || "";
  const spayLabel = sex === "Female" ? "Spayed / Intact" : sex === "Male" ? "Neutered / Intact" : "Spayed/Neutered";
  const spayOpts = sex === "Female" ? ["Spayed", "Intact"] : sex === "Male" ? ["Neutered", "Intact"] : ["Neutered", "Spayed", "Intact"];
  const breeds = data.breedOptions || DEF_BREED_OPTIONS;
  const bathOpts = data.bathTypeOptions || DEF_BATH_TYPE_OPTIONS;
  const SPECIAL = new Set(["breed", "spayed_neutered", "bath_type"]);

  return (
    <>
      {/* Generic fields in grid — skip special ones & textareas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {dogFields.filter(f => f.type !== "textarea" && !SPECIAL.has(f.id)).map(f => (
          <div key={f.id} style={f.type === "checkbox" ? { display: "flex", alignItems: "end" } : {}}>
            {f.id === "breed" ? null : (
              <Inp label={f.name} type={f.type} value={fields[f.id] || ""} onChange={v => onChange(f.id, v)} required={isFieldRequired(f, action || "reservation")} options={f.options} />
            )}
            {f.id === "dob" && fields.dob && calcAge(fields.dob) && (
              <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <span>🎂</span> {calcAge(fields.dob)} old
              </div>
            )}
            {errors[f.id] && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors[f.id]}</div>}
          </div>
        ))}
        {/* Breed — searchable dropdown */}
        <div>
          <BreedSearch value={fields.breed || ""} onChange={v => onChange("breed", v)} breeds={breeds} autoFocus={autoFocusBreed} />
          {errors.breed && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors.breed}</div>}
        </div>
        {/* Spayed/Neutered — dynamic based on sex */}
        <div>
          <Inp label={spayLabel} type="select" value={fields.spayed_neutered || ""} onChange={v => onChange("spayed_neutered", v)} options={["", ...spayOpts]} />
        </div>
        {/* Bath type */}
        <div>
          <Inp label="Preferred Bath Type" type="select" value={fields.bath_type || ""} onChange={v => onChange("bath_type", v)} options={["", ...bathOpts]} />
        </div>
      </div>
      {/* Textareas */}
      {dogFields.filter(f => f.type === "textarea").map(f => (
        <div key={f.id} style={{ marginTop: 12 }}>
          <Inp label={f.name} type="textarea" value={fields[f.id] || ""} onChange={v => onChange(f.id, v)} />
        </div>
      ))}
      {/* Feeding schedules */}
      <div style={{ marginTop: 16 }}>
        <FeedingScheduleEditor schedules={feedingSchedules} onChange={onFeedingChange} data={data} dogWeight={parseFloat(fields.weight) || 0} dogName={fields.name || ""} dogId={dogId} onWeightUpdate={onWeightUpdate} />
      </div>
      {/* Medication schedules */}
      <div style={{ marginTop: 16 }}>
        <MedicationScheduleEditor schedules={medSchedules} onChange={onMedChange} data={data} />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW DOG (with tag selection)
// ═══════════════════════════════════════════════════════════════════════════
function NewDogPage({ data, save, clientId, nav }) {
  const client = data.clients.find(c=>c.id===clientId);
  const [fields, setFields] = useState({});
  const [tags, setTags] = useState([]);
  const [errors, setErrors] = useState({});
  const [feedingSchedules, setFeedingSchedules] = useState([]);
  const [medSchedules, setMedSchedules] = useState([]);
  if(!client)return null;

  const toggleTag = (tagId) => setTags(prev => prev.includes(tagId) ? prev.filter(t=>t!==tagId) : [...prev, tagId]);
  const updateField = (fid, v) => { setFields(prev => ({ ...prev, [fid]: v })); setErrors(prev => ({ ...prev, [fid]: undefined })); };

  const handleSave = async () => {
    const errs=validateFields(data.dogFields, fields, "reservation");
    if(Object.keys(errs).length>0){setErrors(errs);return;}
    const nd={id:gid(),clientId,fields:{...fields, feedingSchedules, medicationSchedules: medSchedules},tags};
    await save({...data,dogs:[...data.dogs,nd]});
    nav("client-detail",{clientId});
  };
  return (
    <div>
      <button onClick={()=>nav("client-detail",{clientId})} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.textSec,fontSize:14,fontWeight:600,padding:0,marginBottom:20,fontFamily:"inherit"}}><I.Back/> Back to {client.fields.first_name}</button>
      <h1 style={{margin:"0 0 24px",fontSize:26,fontWeight:800,color:C.text}}>Add Dog</h1>
      <Card style={{padding:28}}>
        <DogFormFields fields={fields} dogFields={data.dogFields} data={data} errors={errors} onChange={updateField} action="reservation"
          feedingSchedules={feedingSchedules} onFeedingChange={setFeedingSchedules}
          medSchedules={medSchedules} onMedChange={setMedSchedules} onWeightUpdate={(wt) => {
            updateField("weight", String(wt));
            updateField("weightLastUpdated", new Date().toISOString().slice(0,10));
          }} />
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:28}}><Btn variant="secondary" onClick={()=>nav("client-detail",{clientId})}>Cancel</Btn><Btn onClick={handleSave}>Add Dog</Btn></div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW RESERVATION
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// LODGING CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
function LodgingCalendarPage({ data, save, nav, onNew, profile }) {
  const td = todayStr();
  const [weekStart, setWeekStart] = useState(() => getMonday(td));
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEnd = weekDays[6];

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(getMonday(td));
  const isCurrentWeek = weekStart === getMonday(td);

  // Calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(weekStart+"T12:00:00"); return d.getMonth(); });
  const [calYear, setCalYear] = useState(() => { const d = new Date(weekStart+"T12:00:00"); return d.getFullYear(); });
  useEffect(() => { const d = new Date(weekStart+"T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calMonth, calYear]);
  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => {
    const m = String(calMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const picked = `${calYear}-${m}-${d}`;
    setWeekStart(getMonday(picked));
    setShowCalendar(false);
  };
  const calRef = useRef(null);
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const dn = (did, cid) => { const d = data.dogs.find(x => x.id === did); const dogName = d ? d.fields.name : "?"; const c = cid ? data.clients.find(x => x.id === cid) : (d ? data.clients.find(x => x.id === d.clientId) : null); const ln = c?.fields?.last_name; return ln ? `${dogName} ${ln}` : dogName; };
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = (rt) => setCollapsed(prev => ({ ...prev, [rt]: !prev[rt] }));

  // All rooms grouped by type (must be before drag/optimize which reference it)
  const allRooms = data.rooms || {};

  // Dynamically compute which reservations have unpaid deposits (accounts for refunds)
  const unpaidDepositIds = useMemo(() => {
    const ids = new Set();
    (data.reservations || []).forEach(r => {
      if (r.status !== "upcoming" && r.status !== "checked-in") return;
      if (r.type !== "boarding" && r.type !== "dayboarding") return;
      const pmts = (data.payments || []).filter(p => p.reservationId === r.id && p.status === "completed" && p.type !== "refund");
      const refs = (data.payments || []).filter(p => p.reservationId === r.id && (p.type === "refund" || p.status === "refunded"));
      const collected = pmts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) - refs.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const pricing = data.pricing || DEF_PRICING;
      const nights = Math.max(1, countNights(r.checkIn, r.checkOut));
      const rate = (pricing.boardingRates || {})[r.roomType] || 0;
      const est = rate * nights;
      const depositReq = Math.round(est * 0.5 * 100) / 100;
      if (collected < depositReq) ids.add(r.id);
    });
    return ids;
  }, [data.reservations, data.payments, data.pricing]);

  // Night-level selection mode
  const [nightSelectMode, setNightSelectMode] = useState(false);
  const [selectedNights, setSelectedNights] = useState({}); // { [resId]: Set of date strings }
  const [nightDragTarget, setNightDragTarget] = useState(null); // { resId, room } during night-drag

  const toggleNightSelect = (resId, date) => {
    setSelectedNights(prev => {
      const next = { ...prev };
      const set = new Set(next[resId] || []);
      if (set.has(date)) set.delete(date);
      else set.add(date);
      next[resId] = set;
      if (set.size === 0) delete next[resId];
      return next;
    });
  };

  const moveSelectedNights = async (resId, targetRoom) => {
    const nights = selectedNights[resId];
    if (!nights || nights.size === 0) return;
    const res = data.reservations.find(r => r.id === resId);
    if (!res) return;
    const sortedNights = [...nights].sort();
    const newRoomType = roomTypeOf(targetRoom) || res.roomType;
    // Build segments: group consecutive nights
    const segments = [];
    let segStart = sortedNights[0];
    let segEnd = addDays(sortedNights[0], 1);
    for (let i = 1; i < sortedNights.length; i++) {
      if (sortedNights[i] === segEnd) { segEnd = addDays(segEnd, 1); }
      else { segments.push({ startDate: segStart, endDate: segEnd }); segStart = sortedNights[i]; segEnd = addDays(sortedNights[i], 1); }
    }
    segments.push({ startDate: segStart, endDate: segEnd });
    // Build remaining segments (nights NOT selected stay in original room)
    const allNights = [];
    let d = res.checkIn;
    while (d < res.checkOut) { allNights.push(d); d = addDays(d, 1); }
    const remainingNights = allNights.filter(n => !nights.has(n));
    const remainingSegs = [];
    if (remainingNights.length > 0) {
      let rs = remainingNights[0]; let re = addDays(rs, 1);
      for (let i = 1; i < remainingNights.length; i++) {
        if (remainingNights[i] === re) { re = addDays(re, 1); }
        else { remainingSegs.push({ startDate: rs, endDate: re, roomType: res.roomType, room: res.room }); rs = remainingNights[i]; re = addDays(remainingNights[i], 1); }
      }
      remainingSegs.push({ startDate: rs, endDate: re, roomType: res.roomType, room: res.room });
    }
    // Add moved segments
    const movedSegs = segments.map(s => ({ startDate: s.startDate, endDate: s.endDate, roomType: newRoomType, room: targetRoom }));
    const allSegs = [...remainingSegs, ...movedSegs].sort((a, b) => a.startDate.localeCompare(b.startDate));
    // Check for conflicts on moved nights
    for (const ms of movedSegs) {
      if (hasConflict(resId, targetRoom, ms.startDate, ms.endDate)) {
        addToast({ dogName: dn(res.dogId), action: "conflict", oldVal: "", newVal: `Cannot move to ${targetRoom} — overlap exists` });
        return;
      }
    }
    // Save with roomSegments
    await save({ ...data, reservations: data.reservations.map(r => r.id === resId ? { ...r, roomSegments: allSegs } : r) });
    addToast({ dogName: dn(res.dogId), action: "nights transferred", oldVal: `${nights.size} night${nights.size > 1 ? "s" : ""} from ${res.room}`, newVal: targetRoom, undoRes: res });
    setSelectedNights({});
    setNightDragTarget(null);
  };

  // Interaction state: custom mouse system for drag/resize
  const [interaction, setInteraction] = useState(null);
  const interRef = useRef(null);
  const justDraggedRef = useRef(false);
  const [boardingPreviewId, setBoardingPreviewId] = useState(null);
  const [textNotify, setTextNotify] = useState(null);

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // Edge detection: returns "left" | "right" | null
  const getEdge = (e, el) => {
    const r = el.getBoundingClientRect();
    if (e.clientX - r.left < 8) return "left";
    if (r.right - e.clientX < 8) return "right";
    return null;
  };

  // Column pixel width from the day-grid container
  const getColWidth = () => {
    const el = document.querySelector("[data-day-grid]");
    return el ? el.getBoundingClientRect().width / 7 : 100;
  };

  // Conflict check
  const hasConflict = (resId, room, ci, co) =>
    data.reservations.some(r =>
      r.id !== resId && r.room === room && r.type === "boarding" &&
      r.status !== "checked-out" && r.checkIn < co && r.checkOut > ci
    );

  // Toast helpers
  const addToast = (t) => {
    const id = ++toastIdRef.current;
    const toast = { id, ...t };
    setToasts(prev => [...prev, toast]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 10000);
  };
  const dismissToast = (id) => setToasts(prev => prev.filter(x => x.id !== id));
  const handleUndo = async (toast) => {
    if (toast.undoRes.id === "__optimize__") {
      const auditEntry = buildAuditEntry("__optimize__", "Undo Optimize", [{ field: "Action", oldVal: "Optimized", newVal: "Reverted" }], profile);
      await save({ ...data, auditLog: [...(data.auditLog || []), auditEntry], reservations: toast.undoRes._prevReservations });
    } else {
      const currentRes = data.reservations.find(r => r.id === toast.undoRes.id);
      const undoAction = toast.action?.includes("checked in") ? "Undo Check-In" : toast.action?.includes("checked out") ? "Undo Check-Out" : toast.action?.includes("transferred") ? "Undo Transfer" : "Undo Action";
      const diffs = [];
      if (currentRes && currentRes.status !== toast.undoRes.status) {
        diffs.push({ field: "Status", oldVal: currentRes.status === "checked-in" ? "Checked In" : currentRes.status === "checked-out" ? "Checked Out" : currentRes.status, newVal: toast.undoRes.status === "upcoming" ? "Upcoming" : toast.undoRes.status === "checked-in" ? "Checked In" : toast.undoRes.status });
      }
      if (currentRes && currentRes.room !== toast.undoRes.room) {
        diffs.push({ field: "Room", oldVal: currentRes.room || "—", newVal: toast.undoRes.room || "—" });
      }
      const auditEntry = buildAuditEntry(toast.undoRes.id, undoAction, diffs.length > 0 ? diffs : [{ field: "Action", oldVal: toast.action || "Change", newVal: "Reverted" }], profile);
      await save({ ...data, auditLog: [...(data.auditLog || []), auditEntry], reservations: data.reservations.map(r => r.id === toast.undoRes.id ? toast.undoRes : r) });
    }
    dismissToast(toast.id);
  };

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

  // Find roomType for a given room string
  const roomTypeOf = (room) => ROOM_TYPES.find(rt => (allRooms[rt] || []).includes(room)) || null;

  // Start an interaction (mousedown on a block)
  const startInteraction = (e, res, type) => {
    e.preventDefault();
    e.stopPropagation();
    const colW = getColWidth();
    const state = { type, resId: res.id, origRes: { ...res }, startX: e.clientX, startY: e.clientY, colW, origCI: res.checkIn, origCO: res.checkOut, origRoom: res.room, dayDelta: 0, targetRoom: res.room, moved: false };
    interRef.current = state;
    setInteraction(state);

    const onMove = (me) => {
      const s = interRef.current;
      if (!s) return;
      const dx = me.clientX - s.startX;
      const dy = me.clientY - s.startY;
      if (!s.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // deadzone
      s.moved = true;
      s.dayDelta = Math.round(dx / s.colW);
      // Detect target room via elementFromPoint
      if (s.type === "move") {
        const el = document.elementFromPoint(me.clientX, me.clientY);
        const rowEl = el && el.closest ? el.closest("[data-room-row]") : null;
        if (rowEl) {
          const tRoom = rowEl.dataset.roomRow;
          if (tRoom) s.targetRoom = tRoom;
        }
      }
      interRef.current = { ...s };
      setInteraction({ ...s });
    };

    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const s = interRef.current;
      interRef.current = null;
      setInteraction(null);
      if (!s || !s.moved) return;
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);

      // Compute final dates
      let ci, co;
      if (s.type === "move") { ci = addDays(s.origCI, s.dayDelta); co = addDays(s.origCO, s.dayDelta); }
      else if (s.type === "resize-left") { ci = addDays(s.origCI, s.dayDelta); co = s.origCO; }
      else { ci = s.origCI; co = addDays(s.origCO, s.dayDelta); }

      // Validate
      if (ci >= co) return;
      const tRoom = s.type === "move" ? s.targetRoom : s.origRoom;
      if (ci === s.origCI && co === s.origCO && tRoom === s.origRoom) return;
      if (hasConflict(s.resId, tRoom, ci, co)) return;

      // Save — update roomType if moving across room types
      const newRoomType = roomTypeOf(tRoom) || s.origRes.roomType;
      await save({ ...data, reservations: data.reservations.map(r => r.id === s.resId ? { ...r, checkIn: ci, checkOut: co, room: tRoom, roomType: newRoomType } : r) });

      // Toast
      const dogName = dn(s.origRes.dogId);
      let action, oldVal, newVal;
      if (s.type === "move" && tRoom !== s.origRoom && s.dayDelta === 0) {
        action = "moved"; oldVal = s.origRoom; newVal = tRoom;
      } else if (s.type === "move" && tRoom !== s.origRoom) {
        action = "moved & shifted"; oldVal = `${s.origRoom}, ${fmtDate(s.origCI)} – ${fmtDate(s.origCO)}`; newVal = `${tRoom}, ${fmtDate(ci)} – ${fmtDate(co)}`;
      } else if (s.type === "resize-left") {
        action = "check-in changed"; oldVal = fmtDate(s.origCI); newVal = fmtDate(ci);
      } else if (s.type === "resize-right") {
        action = "check-out changed"; oldVal = fmtDate(s.origCO); newVal = fmtDate(co);
      } else {
        action = "shifted"; oldVal = `${fmtDate(s.origCI)} – ${fmtDate(s.origCO)}`; newVal = `${fmtDate(ci)} – ${fmtDate(co)}`;
      }
      addToast({ dogName, action, oldVal, newVal, undoRes: s.origRes });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Optimize state & logic
  const [showOptimizeConfirm, setShowOptimizeConfirm] = useState(false);
  const [showOptGuide, setShowOptGuide] = useState(false);

  const computeOptimized = useCallback(() => {
    const newRoomMap = {}; // resId -> newRoom
    for (const rt of ROOM_TYPES) {
      const rooms = allRooms[rt] || [];
      if (rooms.length === 0) continue;
      // Include all active reservations for packing, but only move upcoming ones
      const resOfType = data.reservations.filter(r => r.type === "boarding" && r.roomType === rt && r.status !== "checked-out" && r.status !== "cancelled");
      const sorted = [...resOfType].sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut));
      const latestCO = {};
      rooms.forEach(rm => { latestCO[rm] = "1900-01-01"; });
      // First, lock checked-in reservations to their current rooms
      for (const res of sorted) {
        if (res.status === "checked-in") {
          latestCO[res.room] = res.checkOut > latestCO[res.room] ? res.checkOut : latestCO[res.room];
        }
      }
      // Then pack only upcoming reservations around the locked ones
      for (const res of sorted) {
        if (res.status === "checked-in") continue; // skip — already locked in place
        let bestRoom = null, bestCO = null;
        for (const rm of rooms) {
          if (latestCO[rm] <= res.checkIn) {
            if (bestCO === null || latestCO[rm] > bestCO) { bestRoom = rm; bestCO = latestCO[rm]; }
          }
        }
        if (!bestRoom) { bestRoom = rooms.reduce((b, rm) => latestCO[rm] < latestCO[b] ? rm : b); }
        latestCO[bestRoom] = res.checkOut;
        if (bestRoom !== res.room) newRoomMap[res.id] = bestRoom;
      }
    }
    return newRoomMap;
  }, [allRooms, data.reservations]);

  const optimizeMoveCount = useMemo(() => Object.keys(computeOptimized()).length, [computeOptimized]);

  const runOptimize = async () => {
    const moves = computeOptimized();
    const count = Object.keys(moves).length;
    if (count === 0) { setShowOptimizeConfirm(false); return; }
    const prevReservations = [...data.reservations];
    await save({ ...data, reservations: data.reservations.map(r => moves[r.id] ? { ...r, room: moves[r.id] } : r) });
    setShowOptimizeConfirm(false);
    addToast({ dogName: `${count} reservation${count > 1 ? "s" : ""}`, action: "optimized", oldVal: "fragmented", newVal: "packed tight", undoRes: { id: "__optimize__", _prevReservations: prevReservations } });
  };

  const activeTypes = useMemo(() => ROOM_TYPES.filter(rt => (allRooms[rt] || []).length > 0), [allRooms]);
  const allCollapsed = activeTypes.length > 0 && activeTypes.every(rt => collapsed[rt]);
  const toggleAll = () => {
    const next = {};
    activeTypes.forEach(rt => { next[rt] = !allCollapsed; });
    setCollapsed(next);
  };
  const roomRows = useMemo(() => {
    const rows = [];
    ROOM_TYPES.forEach(rt => {
      const list = allRooms[rt] || [];
      if (list.length > 0) {
        rows.push({ type: "header", roomType: rt, count: list.length });
        list.forEach(r => rows.push({ type: "room", roomType: rt, room: r }));
      }
    });
    return rows;
  }, [allRooms]);

  // Boarding + dayboarding reservations that overlap this week
  const weekRes = useMemo(() =>
    data.reservations.filter(r =>
      (r.type === "boarding" || r.type === "dayboarding") && r.room && r.status !== "checked-out" && r.status !== "cancelled" &&
      r.checkIn <= weekEnd && r.checkOut >= weekStart
    ), [data.reservations, weekStart, weekEnd]);

  // Map: room -> [reservations]
  const resByRoom = useMemo(() => {
    const m = {};
    weekRes.forEach(r => { if (!m[r.room]) m[r.room] = []; m[r.room].push(r); });
    return m;
  }, [weekRes]);

  // Per room-type, per day: how many rooms are booked
  const dailyOccByType = useMemo(() => {
    const m = {};
    ROOM_TYPES.forEach(rt => {
      const rooms = allRooms[rt] || [];
      m[rt] = weekDays.map(d =>
        rooms.filter(room => (resByRoom[room] || []).some(r => r.checkIn <= d && r.checkOut > d)).length
      );
    });
    return m;
  }, [allRooms, weekDays, resByRoom]);

  // Overall day+night occupancy (boarding + dayboarding): rooms booked / total rooms
  const totalRoomCount = useMemo(() => activeTypes.reduce((s, rt) => s + (allRooms[rt] || []).length, 0), [activeTypes, allRooms]);
  const dailyOccOverall = useMemo(() =>
    weekDays.map((_, di) => activeTypes.reduce((s, rt) => s + (dailyOccByType[rt] || [])[di], 0)),
    [weekDays, activeTypes, dailyOccByType]
  );

  // Overnight-only occupancy (boarding only, excludes dayboarding)
  const overnightResByRoom = useMemo(() => {
    const m = {};
    weekRes.filter(r => r.type === "boarding").forEach(r => { if (!m[r.room]) m[r.room] = []; m[r.room].push(r); });
    return m;
  }, [weekRes]);
  const dailyOccOvernight = useMemo(() =>
    weekDays.map(d => activeTypes.reduce((s, rt) =>
      s + (allRooms[rt] || []).filter(room => (overnightResByRoom[room] || []).some(r => r.checkIn <= d && r.checkOut > d)).length, 0)),
    [weekDays, activeTypes, allRooms, overnightResByRoom]
  );

  // Week label
  const weekLabel = (() => {
    const ms = new Date(weekStart + "T12:00:00");
    const me = new Date(weekEnd + "T12:00:00");
    const sameMonth = ms.getMonth() === me.getMonth();
    if (sameMonth) return `${ms.toLocaleDateString("en-US",{month:"long"})} ${ms.getDate()} – ${me.getDate()}, ${ms.getFullYear()}`;
    return `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}, ${me.getFullYear()}`;
  })();

  const COL_W = "1fr";
  const LABEL_W = 120;
  const ROW_H = 48;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Lodging Calendar</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { setNightSelectMode(v => !v); if (nightSelectMode) { setSelectedNights({}); setNightDragTarget(null); } }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${nightSelectMode ? C.acc : C.border}`, background: nightSelectMode ? `${C.acc}15` : "transparent", color: nightSelectMode ? C.acc : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Night Select
          </button>
          <Btn onClick={onNew} icon={<I.Plus />}>New {(data.hotkeySettings||{}).showHints===true&&<kbd style={{fontSize:10,fontWeight:600,color:C.textMut,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",marginLeft:4,fontFamily:"'Outfit',monospace",lineHeight:1.4}}>N</kbd>}</Btn>
        </div>
      </div>
      {/* Night selection instructions */}
      {nightSelectMode && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: `${C.acc}08`, border: `1.5px solid ${C.acc}30`, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: C.textSec }}>
            <span style={{ fontWeight: 700, color: C.acc }}>Night Select Mode:</span> Hover over nights in a reservation to see the checkbox, click it to select, then drag those selected nights to a different room.
          </div>
          {Object.keys(selectedNights).length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.suc }}>{Object.values(selectedNights).reduce((s, set) => s + set.size, 0)} night(s) selected</span>
              <Btn size="sm" variant="ghost" onClick={() => setSelectedNights({})}>Clear</Btn>
            </div>
          )}
        </div>
      )}
      {/* Transfer selected nights panel */}
      {nightSelectMode && Object.keys(selectedNights).length > 0 && (() => {
        const resId = Object.keys(selectedNights)[0];
        const res = data.reservations.find(r => r.id === resId);
        if (!res) return null;
        const nightCount = selectedNights[resId]?.size || 0;
        const sortedDates = [...(selectedNights[resId] || [])].sort();
        const dateLabel = sortedDates.length <= 3 ? sortedDates.map(d => fmtDate(d)).join(", ") : `${fmtDate(sortedDates[0])} – ${fmtDate(sortedDates[sortedDates.length - 1])}`;
        // Build date ranges for conflict check
        const nightRanges = [];
        if (sortedDates.length > 0) {
          let rs = sortedDates[0]; let re = addDays(sortedDates[0], 1);
          for (let i = 1; i < sortedDates.length; i++) {
            if (sortedDates[i] === re) { re = addDays(re, 1); }
            else { nightRanges.push({ start: rs, end: re }); rs = sortedDates[i]; re = addDays(sortedDates[i], 1); }
          }
          nightRanges.push({ start: rs, end: re });
        }
        // Filter rooms: exclude current room and rooms with conflicts
        const availRoomsList = [];
        ROOM_TYPES.forEach(rt => (allRooms[rt] || []).forEach(room => {
          if (room === res.room) return;
          const hasConfl = nightRanges.some(nr => hasConflict(resId, room, nr.start, nr.end));
          if (!hasConfl) availRoomsList.push({ room, type: rt });
        }));
        return (
          <div style={{ padding: "14px 18px", borderRadius: 12, background: C.sucLt, border: `1.5px solid ${C.suc}40`, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.suc }}>Transfer {nightCount} night{nightCount > 1 ? "s" : ""}</div>
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{dn(res.dogId, res.clientId)} · Currently in {res.room} · {dateLabel}</div>
              </div>
              <button onClick={() => setSelectedNights({})} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, fontSize: 16, padding: "2px 6px", fontFamily: "inherit" }}>×</button>
            </div>
            {availRoomsList.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Available rooms (no conflicts):</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {availRoomsList.map(({ room, type: rt }) => (
                    <button key={room} onClick={() => moveSelectedNights(resId, room)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.suc; e.currentTarget.style.background = C.sucLt; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}>
                      {room} <span style={{ fontSize: 9, color: C.textMut, marginLeft: 4 }}>{rt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.dan, fontWeight: 600 }}>No available rooms for these dates — all rooms have conflicts.</div>
            )}
          </div>
        );
      })()}

      {/* Week navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 16, position: "relative" }}>
        <button onClick={prevWeek} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontFamily: "inherit", padding: 0 }} title="Previous week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, textAlign: "center", padding: "4px 2px", whiteSpace: "nowrap" }}>{weekLabel}</span>
        <button onClick={nextWeek} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.textSec, fontFamily: "inherit", padding: 0 }} title="Next week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button onClick={() => setShowCalendar(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${showCalendar ? C.pri : C.border}`, background: showCalendar ? C.priLt : C.surface, cursor: "pointer", color: showCalendar ? C.pri : C.textSec, fontSize: 14, fontFamily: "inherit", padding: 0, transition: "all 0.15s" }} title="Open calendar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        {!isCurrentWeek && (
          <button onClick={goToday} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Today</button>
        )}

        {/* Calendar Popup */}
        {showCalendar && (
          <div ref={calRef} style={{ position: "absolute", top: "100%", left: 28, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={calPrev} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
              <button onClick={calNext} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
              {calDays.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const m = String(calMonth + 1).padStart(2, "0");
                const d = String(day).padStart(2, "0");
                const dateStr = `${calYear}-${m}-${d}`;
                const isInWeek = dateStr >= weekStart && dateStr <= weekEnd;
                const isTodayCell = dateStr === td;
                const hasRes = data.reservations.some(r => r.type === "boarding" && r.status !== "checked-out" && r.checkIn <= dateStr && r.checkOut >= dateStr);
                return (
                  <button key={i} onClick={() => calSelect(day)}
                    style={{
                      width: 34, height: 34, borderRadius: 10, border: isInWeek ? `2px solid ${C.pri}` : isTodayCell ? `2px solid ${C.acc}` : "2px solid transparent",
                      background: isInWeek ? C.priLt : "transparent",
                      color: isInWeek ? C.pri : isTodayCell ? C.acc : C.text,
                      fontSize: 13, fontWeight: isInWeek || isTodayCell ? 700 : 500,
                      cursor: "pointer", fontFamily: "inherit", padding: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto",
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={e => { if (!isInWeek) e.currentTarget.style.background = C.surfaceHover; }}
                    onMouseLeave={e => { if (!isInWeek) e.currentTarget.style.background = "transparent"; }}
                  >
                    {day}
                    {hasRes && !isInWeek && <div style={{ width: 4, height: 4, borderRadius: 2, background: C.pri, marginTop: 1 }} />}
                  </button>
                );
              })}
            </div>
            {!isCurrentWeek && (
              <div style={{ textAlign: "center", marginTop: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}>
                <button onClick={() => { goToday(); setShowCalendar(false); }} style={{ fontSize: 12, fontWeight: 700, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Go to This Week</button>
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowOptimizeConfirm(true)} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.acc}`, background: `${C.acc}18`, color: C.acc, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-4.9 3.6 1.9-5.8L4 8.8h6.1z"/></svg>
          Optimize
        </button>
        <button onClick={() => setShowOptGuide(v => !v)} style={{ width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${showOptGuide ? C.pri : C.border}`, background: showOptGuide ? C.priLt : "transparent", color: showOptGuide ? C.pri : C.textMut, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1 }} title="How drag & drop and optimization work">?</button>
        {activeTypes.length > 0 && (
          <button onClick={toggleAll} style={{ padding: "4px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points={allCollapsed ? "6 9 12 15 18 9" : "18 15 12 9 6 15"}/></svg>
            {allCollapsed ? "Expand All" : "Collapse All"}
          </button>
        )}
      </div>

      {/* Drag & Optimize guide */}
      {showOptGuide && (
        <div style={{ marginBottom: 12, padding: "16px 18px", borderRadius: 10, border: `1.5px solid ${C.priLt}`, background: `linear-gradient(135deg, ${C.priLt}40, ${C.surface})`, fontSize: 12, lineHeight: 1.7, color: C.textSec }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.pri, marginBottom: 8 }}>How Drag & Drop and Optimize Work</div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>Drag to Move & Shift Dates</div>
          <div style={{ paddingLeft: 12, marginBottom: 10 }}>
            <div>Grab the <span style={{ fontWeight: 700, color: C.text }}>body</span> of a reservation block and drag it <span style={{ fontWeight: 700, color: C.text }}>left or right</span> to shift the check-in and check-out dates. Drag it <span style={{ fontWeight: 700, color: C.text }}>up or down</span> to move it to a different room within the same room type.</div>
            <div style={{ marginTop: 4 }}>A <span style={{ fontWeight: 700, color: C.pri }}>dashed blue ghost</span> shows the projected position. If the target has a conflict, the move is silently rejected.</div>
            <div style={{ marginTop: 4 }}>Click a reservation normally (without dragging) to view the client's details.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>Edge Resize</div>
          <div style={{ paddingLeft: 12, marginBottom: 10 }}>
            <div>Hover over the <span style={{ fontWeight: 700, color: C.text }}>left or right edge</span> of a block — the cursor changes to a resize arrow. Drag the edge to <span style={{ fontWeight: 700, color: C.text }}>extend or shorten</span> the reservation. Left edge changes check-in, right edge changes check-out.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>Optimize Button</div>
          <div style={{ paddingLeft: 12, marginBottom: 10 }}>
            <div>The <span style={{ fontWeight: 700, color: C.acc }}>Optimize</span> button automatically rearranges reservations to <span style={{ fontWeight: 700, color: C.text }}>minimize room fragmentation</span> and free up as many rooms as possible for new bookings.</div>
            <div style={{ marginTop: 4 }}>It uses a <span style={{ fontWeight: 700, color: C.text }}>best-fit packing algorithm</span> per room type: reservations are sorted by check-in date and each one is assigned to the room whose last checkout is closest to (but not after) the check-in — packing them tightly together.</div>
            <div style={{ marginTop: 4 }}>Dogs <span style={{ fontWeight: 700, color: C.text }}>never move between room types</span> — a Luxury Suite dog stays in a Luxury Suite. Before applying changes, a confirmation dialog shows exactly how many reservations will be moved.</div>
          </div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>When to use each</div>
          <div style={{ paddingLeft: 12, marginBottom: 4 }}>
            <div><span style={{ fontWeight: 700, color: C.pri }}>Drag & Drop</span> — Use when you need to move a specific dog for operational reasons (cleaning schedule, behavioral separation, client preference).</div>
            <div style={{ marginTop: 4 }}><span style={{ fontWeight: 700, color: C.acc }}>Optimize</span> — Use when you want to maximize availability across the board, especially before a busy weekend or holiday. Run it periodically to keep things tidy.</div>
          </div>
          <div style={{ fontSize: 11, color: C.textMut, fontStyle: "italic", marginTop: 6 }}>All changes are saved instantly. You can always manually drag reservations after optimizing to fine-tune the layout.</div>
        </div>
      )}

      {/* Calendar grid */}
      <Card style={{ padding: 0, overflow: "auto" }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `2px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10, background: C.bg }}>
          <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", borderRight: `1px solid ${C.border}` }}>Room</div>
          {weekDays.map(d => {
            const isToday = d === td;
            return (
              <div key={d} style={{ padding: "8px 0", textAlign: "center", borderRight: `1px solid ${C.borderLight}`, background: isToday ? C.priLt : "transparent" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? C.pri : C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>{shortDay(d)}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? C.pri : C.text, lineHeight: 1.2 }}>{dayNum(d)}</div>
              </div>
            );
          })}
        </div>

        {/* Overall occupancy row — Overnight only (boarding, excludes dayboarding) */}
        {totalRoomCount > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `2px solid ${C.border}`, background: C.surface, minHeight: 36 }}>
            <div style={{ padding: "0 8px", display: "flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: C.text, borderRight: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.2 }}>Overnight</div>
            {dailyOccOvernight.map((booked, di) => {
              const pct = totalRoomCount > 0 ? Math.round((booked / totalRoomCount) * 100) : 0;
              return (
                <div key={di} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: `1px solid ${C.borderLight}`, background: weekDays[di] === td ? `${C.priLt}40` : "transparent" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{pct}%</span>
                  <span style={{ fontSize: 9, fontWeight: 500, color: C.textMut }}>{booked}/{totalRoomCount}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Room rows */}
        {roomRows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 14 }}>No rooms configured. Go to Settings → Rooms to add rooms.</div>
        ) : (
          roomRows.map((row, ri) => {
            if (row.type === "header") {
              const isCol = !!collapsed[row.roomType];
              const occ = dailyOccByType[row.roomType] || [];
              return (
                <React.Fragment key={`h-${row.roomType}`}>
                  {/* Clickable section header */}
                  <div onClick={() => toggleCollapse(row.roomType)} style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px 1fr`, borderBottom: `1px solid ${C.border}`, background: C.priLt, cursor: "pointer", userSelect: "none" }}>
                    <div style={{ gridColumn: "1 / -1", padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round" style={{ transition: "transform 0.15s", transform: isCol ? "rotate(-90deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em" }}>{row.roomType}</span>
                      <span style={{ fontWeight: 500, color: C.textSec, fontSize: 12 }}>({row.count})</span>
                    </div>
                  </div>
                  {/* Collapsed summary row: per-day occupancy */}
                  {isCol && (
                    <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `1px solid ${C.border}`, minHeight: 36, background: C.surface }}>
                      <div style={{ padding: "0 12px", display: "flex", alignItems: "center", fontSize: 11, fontWeight: 600, color: C.textMut, borderRight: `1px solid ${C.border}` }}>Booked</div>
                      {occ.map((count, di) => {
                        const total = row.count;
                        return (
                          <div key={di} style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRight: `1px solid ${C.borderLight}`, background: weekDays[di] === td ? `${C.priLt}40` : "transparent" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{count}<span style={{ fontWeight: 500, color: C.textMut }}>/{total}</span></span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </React.Fragment>
              );
            }
            // Skip room rows if this type is collapsed
            if (collapsed[row.roomType]) return null;
            const roomReservations = resByRoom[row.room] || [];
            const isDropTarget = interaction && interaction.type === "move" && interaction.targetRoom === row.room && interaction.moved;
            // Find checkout happening today for this room
            const todayCheckout = roomReservations.find(r => r.checkOut === td && r.status !== "cancelled");
            return (
              <div key={`r-${row.room}`} data-room-row={row.room}
                style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, ${COL_W})`, borderBottom: `1px solid ${C.borderLight}`, minHeight: ROW_H, background: isDropTarget ? `${C.priLt}60` : "transparent", transition: "background 0.15s" }}>
                {/* Room label with checkout time */}
                <div style={{ padding: "0 12px", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.text, borderRight: `1px solid ${C.border}`, background: C.surface }}>
                  <span>{row.room}</span>
                  {todayCheckout && <span style={{ fontSize: 9, fontWeight: 600, color: C.acc, background: C.acc + "15", padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap" }} title={`${dn(todayCheckout.dogId)} checking out ${fmtTime(todayCheckout.checkOutTime)}`}>out {fmtTime(todayCheckout.checkOutTime)}</span>}
                </div>
                {/* 7 day cells with reservation overlays */}
                <div data-day-grid style={{ gridColumn: "2 / -1", position: "relative", display: "grid", gridTemplateColumns: `repeat(7, ${COL_W})`, minHeight: ROW_H }}>
                  {/* Background cells */}
                  {weekDays.map(d => (
                    <div key={d} style={{ borderRight: `1px solid ${C.borderLight}`, background: d === td ? `${C.priLt}40` : "transparent", minHeight: ROW_H }} />
                  ))}
                  {/* Reservation blocks */}
                  {roomReservations.map(res => {
                    const inter = interaction && interaction.resId === res.id && interaction.moved ? interaction : null;
                    const ciDate = res.checkIn < weekStart ? weekStart : res.checkIn;
                    const coDate = res.checkOut > weekEnd ? weekEnd : res.checkOut;
                    const startIdx = weekDays.indexOf(ciDate);
                    const endIdx = weekDays.indexOf(coDate);
                    if (startIdx < 0 || endIdx < 0) return null;
                    // Half-day positioning — dayboarding (same-day) gets wider bar so name is readable
                    const isSameDay = res.checkIn === res.checkOut;
                    const startOff = isSameDay ? 0.08 : (res.checkIn >= weekStart ? 0.5 : 0);
                    const endOff = isSameDay ? 0.92 : (res.checkOut <= weekEnd ? 0.5 : 1);
                    const leftPct = ((startIdx + startOff) / 7) * 100;
                    const widthPct = ((endIdx + endOff - startIdx - startOff) / 7) * 100;
                    const span = endIdx - startIdx + 1;
                    const showGreenEdge = res.checkIn >= weekStart;
                    const showRedEdge = res.checkOut <= weekEnd;
                    const isCheckedIn = res.status === "checked-in";
                    const isUpcoming = res.status === "upcoming";
                    const bg = isCheckedIn ? C.pri : isUpcoming ? C.priLt : C.bg;
                    const fg = isCheckedIn ? "#fff" : isUpcoming ? C.pri : C.textMut;

                    // Ghost preview: compute projected position during drag/resize
                    let ghostEl = null;
                    if (inter) {
                      let gCI, gCO;
                      if (inter.type === "move") { gCI = addDays(inter.origCI, inter.dayDelta); gCO = addDays(inter.origCO, inter.dayDelta); }
                      else if (inter.type === "resize-left") { gCI = addDays(inter.origCI, inter.dayDelta); gCO = inter.origCO; }
                      else { gCI = inter.origCI; gCO = addDays(inter.origCO, inter.dayDelta); }
                      if (gCI < gCO) {
                        const gCiV = gCI < weekStart ? weekStart : gCI;
                        const gCoV = gCO > weekEnd ? weekEnd : gCO;
                        const gSi = weekDays.indexOf(gCiV);
                        const gEi = weekDays.indexOf(gCoV);
                        if (gSi >= 0 && gEi >= 0) {
                          const gSOff = gCI >= weekStart ? 0.5 : 0;
                          const gEOff = gCO <= weekEnd ? 0.5 : 1;
                          const gLeft = ((gSi + gSOff) / 7) * 100;
                          const gWidth = ((gEi + gEOff - gSi - gSOff) / 7) * 100;
                          ghostEl = (
                            <div key={`ghost-${res.id}`} style={{
                              position: "absolute", top: 4, bottom: 4,
                              left: `calc(${gLeft}% + 2px)`, width: `calc(${gWidth}% - 4px)`,
                              background: `${C.pri}30`, borderRadius: 6, border: `2px dashed ${C.pri}`,
                              pointerEvents: "none", zIndex: 5,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: C.pri, opacity: 0.8 }}>{dn(res.dogId, res.clientId)}</span>
                            </div>
                          );
                        }
                      }
                    }

                    return (
                      <React.Fragment key={res.id}>
                        {/* Ghost preview (if dragging/resizing this block) */}
                        {inter && inter.type === "move" && inter.targetRoom !== row.room ? null : ghostEl}
                        {/* Actual block */}
                        <div
                          onMouseDown={(e) => {
                            if (nightSelectMode) {
                              // In night select mode, allow dragging if nights are selected
                              const hasSelected = selectedNights[res.id] && selectedNights[res.id].size > 0;
                              if (hasSelected && e.button === 0 && e.target.closest("[data-day-grid]")) {
                                // Drag selected nights to different room
                                e.preventDefault();
                                e.stopPropagation();
                                const colW = getColWidth();
                                const state = { type: "night-drag", resId: res.id, startX: e.clientX, startY: e.clientY, colW, origRoom: res.room, targetRoom: res.room, moved: false };
                                interRef.current = state;
                                setInteraction(state);
                                const onMove = (me) => {
                                  const s = interRef.current;
                                  if (!s) return;
                                  const dx = me.clientX - s.startX;
                                  const dy = me.clientY - s.startY;
                                  if (!s.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                                  s.moved = true;
                                  if (s.type === "night-drag") {
                                    const el = document.elementFromPoint(me.clientX, me.clientY);
                                    const rowEl = el && el.closest ? el.closest("[data-room-row]") : null;
                                    if (rowEl) {
                                      const tRoom = rowEl.dataset.roomRow;
                                      if (tRoom) s.targetRoom = tRoom;
                                    }
                                  }
                                  interRef.current = { ...s };
                                  setInteraction({ ...s });
                                };
                                const onUp = async () => {
                                  window.removeEventListener("mousemove", onMove);
                                  window.removeEventListener("mouseup", onUp);
                                  const s = interRef.current;
                                  interRef.current = null;
                                  setInteraction(null);
                                  if (!s || !s.moved) return;
                                  if (s.targetRoom === s.origRoom) return;
                                  await moveSelectedNights(res.id, s.targetRoom);
                                };
                                window.addEventListener("mousemove", onMove);
                                window.addEventListener("mouseup", onUp);
                              }
                              return;
                            }
                            if (e.button !== 0) return;
                            const edge = getEdge(e, e.currentTarget);
                            startInteraction(e, res, edge === "left" ? "resize-left" : edge === "right" ? "resize-right" : "move");
                          }}
                          onMouseMove={(e) => { if (nightSelectMode || interaction) return; const edge = getEdge(e, e.currentTarget); e.currentTarget.style.cursor = edge ? "col-resize" : "grab"; }}
                          onClick={() => { if (nightSelectMode) return; if (!justDraggedRef.current) setBoardingPreviewId(res.id); }}
                          title={nightSelectMode ? (selectedNights[res.id] && selectedNights[res.id].size > 0 ? "Drag selected nights to a different room" : "Click nights to select them for transfer") : `${dn(res.dogId, res.clientId)} · ${fmtDate(res.checkIn)} → ${fmtDate(res.checkOut)} · ${res.status} · Drag to shift dates or move rooms · Drag edges to resize`}
                          style={{
                            position: "absolute", top: 6, bottom: 6,
                            left: `calc(${leftPct}% + 3px)`, width: `calc(${widthPct}% - 6px)`,
                            background: bg, borderRadius: 6, cursor: nightSelectMode ? (selectedNights[res.id] && selectedNights[res.id].size > 0 ? "grab" : "pointer") : (inter ? "grabbing" : "grab"),
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                            overflow: "hidden", whiteSpace: "nowrap",
                            borderLeft: showGreenEdge ? `4px solid ${C.suc}` : "none",
                            borderRight: showRedEdge ? `4px solid ${C.dan}` : "none",
                            borderTop: `1px solid ${isCheckedIn ? "rgba(255,255,255,0.15)" : C.border}`,
                            borderBottom: `1px solid ${isCheckedIn ? "rgba(0,0,0,0.1)" : C.border}`,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                            transition: inter ? "none" : "opacity 0.15s",
                            zIndex: inter ? 10 : 2,
                            opacity: inter ? 0.35 : (interaction && interaction.resId !== res.id) ? 0.5 : 1,
                          }}
                          onMouseEnter={e => { if (!interaction && !nightSelectMode) e.currentTarget.style.opacity = "0.85"; }}
                          onMouseLeave={e => { if (!interaction && !nightSelectMode) e.currentTarget.style.opacity = "1"; }}
                        >
                          {/* Night dividers (always shown) + selection overlays (night select mode only) */}
                          {countNights(res.checkIn, res.checkOut) > 1 && (() => {
                            const resNights = [];
                            let nd = res.checkIn < weekStart ? weekStart : res.checkIn;
                            const resEnd = res.checkOut > addDays(weekEnd, 1) ? addDays(weekEnd, 1) : res.checkOut;
                            while (nd < resEnd) { resNights.push(nd); nd = addDays(nd, 1); }
                            const totalW = (endIdx + endOff - startIdx - startOff);
                            const selSet = selectedNights[res.id] || new Set();
                            return resNights.map((nightDate, ni) => {
                              const nightIdx = weekDays.indexOf(nightDate);
                              if (nightIdx < 0) return null;
                              const nightStartOff = nightDate === res.checkIn ? startOff : 0;
                              const nightEndDate = addDays(nightDate, 1);
                              const nightEndOff = nightEndDate >= res.checkOut ? endOff : (nightEndDate > weekEnd ? 1 : 0);
                              const nightEndIdx = weekDays.indexOf(nightEndDate < weekStart ? weekStart : (nightEndDate > weekEnd ? weekEnd : nightEndDate));
                              const nLeft = ((nightIdx + nightStartOff - startIdx - startOff) / totalW) * 100;
                              const effEnd = nightEndIdx >= 0 ? nightEndIdx : 7;
                              const nWidth = ((effEnd + nightEndOff - nightIdx - nightStartOff) / totalW) * 100;
                              const isSel = selSet.has(nightDate);
                              return (
                                <div key={nightDate}
                                  onClick={nightSelectMode ? (e) => { e.stopPropagation(); toggleNightSelect(res.id, nightDate); } : undefined}
                                  style={{ position: "absolute", top: 0, bottom: 0, left: `${nLeft}%`, width: `${nWidth}%`, borderRight: ni < resNights.length - 1 ? `1px dashed ${nightSelectMode ? "rgba(128,128,128,0.35)" : "rgba(128,128,128,0.15)"}` : "none", background: isSel ? `${C.suc}40` : "transparent", cursor: nightSelectMode ? "pointer" : "inherit", display: "flex", alignItems: "center", justifyContent: "center", zIndex: nightSelectMode ? 3 : 1, transition: "background 0.1s, border 0.1s", pointerEvents: nightSelectMode ? "auto" : "none" }}
                                  onMouseEnter={nightSelectMode ? (e => { if (!isSel) e.currentTarget.style.background = `${C.acc}20`; }) : undefined}
                                  onMouseLeave={nightSelectMode ? (e => { if (!isSel) e.currentTarget.style.background = "transparent"; }) : undefined}>
                                  {nightSelectMode && (
                                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSel ? C.suc : "rgba(132,204,22,0.5)"}`, background: isSel ? C.suc : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                                      {isSel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                    </div>
                                  )}
                                </div>
                              );
                            });
                          })()}
                          {!nightSelectMode && (res.noDeposit || unpaidDepositIds.has(res.id)) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isCheckedIn ? "#fca5a5" : C.dan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}} title="No deposit collected"><line x1="12" y1="1" x2="12" y2="17"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/><line x1="4" y1="1" x2="20" y2="23" stroke={isCheckedIn ? "#fca5a5" : C.dan} strokeWidth="2"/></svg>}
                          <span style={{ fontSize: 11, fontWeight: 700, color: fg, overflow: "hidden", textOverflow: "ellipsis", padding: "0 4px", pointerEvents: "none", zIndex: 1 }}>
                            {dn(res.dogId, res.clientId)}
                          </span>
                          {!nightSelectMode && showGreenEdge && span > 1 && <span style={{ fontSize: 9, color: isCheckedIn ? "rgba(255,255,255,0.6)" : C.textMut, flexShrink: 0 }}>in {fmtTime(res.checkInTime)}{res.actualCheckInTime ? ` (${new Date(res.actualCheckInTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})})` : ""}</span>}
                          {!nightSelectMode && showRedEdge && span > 2 && <span style={{ fontSize: 9, color: isCheckedIn ? "rgba(255,255,255,0.6)" : C.textMut, flexShrink: 0 }}>out {fmtTime(res.checkOutTime)}{res.actualCheckOutTime ? ` (${new Date(res.actualCheckOutTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})})` : ""}</span>}
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {/* Ghost block for move-to-different-room: render in target room */}
                  {interaction && interaction.moved && interaction.type === "move" && interaction.targetRoom === row.room && interaction.targetRoom !== interaction.origRoom && (() => {
                    const s = interaction;
                    const gCI = addDays(s.origCI, s.dayDelta);
                    const gCO = addDays(s.origCO, s.dayDelta);
                    if (gCI >= gCO) return null;
                    const gCiV = gCI < weekStart ? weekStart : gCI;
                    const gCoV = gCO > weekEnd ? weekEnd : gCO;
                    const gSi = weekDays.indexOf(gCiV);
                    const gEi = weekDays.indexOf(gCoV);
                    if (gSi < 0 || gEi < 0) return null;
                    const gSOff = gCI >= weekStart ? 0.5 : 0;
                    const gEOff = gCO <= weekEnd ? 0.5 : 1;
                    const gLeft = ((gSi + gSOff) / 7) * 100;
                    const gWidth = ((gEi + gEOff - gSi - gSOff) / 7) * 100;
                    return (
                      <div style={{
                        position: "absolute", top: 4, bottom: 4,
                        left: `calc(${gLeft}% + 2px)`, width: `calc(${gWidth}% - 4px)`,
                        background: `${C.pri}30`, borderRadius: 6, border: `2px dashed ${C.pri}`,
                        pointerEvents: "none", zIndex: 5,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.pri, opacity: 0.8 }}>{dn(s.origRes.dogId, s.origRes.clientId)}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* Optimize confirmation modal */}
      {showOptimizeConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowOptimizeConfirm(false)}>
          <Card style={{ maxWidth: 420, width: "90%", padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.acc}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-4.9 3.6 1.9-5.8L4 8.8h6.1z"/></svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Optimize Room Assignments</h3>
            </div>
            <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, margin: "0 0 8px" }}>
              Rearranges reservations within each room type to minimize fragmentation and maximize available rooms. Dogs never move between room types.
            </p>
            <div style={{ padding: "12px 16px", borderRadius: 10, background: optimizeMoveCount > 0 ? `${C.pri}10` : `${C.suc}10`, border: `1px solid ${optimizeMoveCount > 0 ? `${C.pri}30` : `${C.suc}30`}`, marginBottom: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: optimizeMoveCount > 0 ? C.pri : C.suc }}>
                {optimizeMoveCount > 0 ? `${optimizeMoveCount} reservation${optimizeMoveCount > 1 ? "s" : ""} will be moved` : "Already optimized! No moves needed."}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowOptimizeConfirm(false)} style={{ padding: "8px 20px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              {optimizeMoveCount > 0 && (
                <button onClick={async () => { await runOptimize(); setShowOptimizeConfirm(false); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.acc, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Optimize</button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              pointerEvents: "auto",
              background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)",
              border: `1.5px solid ${C.border}`, borderRadius: 12,
              padding: "12px 16px", maxWidth: 380, minWidth: 260,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              display: "flex", alignItems: "center", gap: 12, fontSize: 13,
              animation: "k9toast 0.3s ease-out",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>
                  {t.dogName}<span style={{ fontWeight: 500, color: C.textSec }}>&rsquo;s reservation {t.action}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textMut }}>
                  <span style={{ textDecoration: "line-through", color: C.dan }}>{t.oldVal}</span>
                  <span style={{ margin: "0 5px", color: C.textMut }}>&rarr;</span>
                  <span style={{ fontWeight: 600, color: C.suc }}>{t.newVal}</span>
                </div>
              </div>
              <button onClick={() => handleUndo(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Undo</button>
              <button onClick={() => dismissToast(t.id)} style={{ width: 22, height: 22, borderRadius: 11, border: "none", background: "transparent", cursor: "pointer", color: C.textMut, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit" }}>&times;</button>
            </div>
          ))}
        </div>
      )}

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

// ═══════════════════════════════════════════════════════════════════════════
// OPERATIONS HUB
// ═══════════════════════════════════════════════════════════════════════════
import { OperationsHub } from "./pos/pages/OperationsHub";

// ═══════════════════════════════════════════════════════════════════════════
// MANAGEMENT HUB
// ═══════════════════════════════════════════════════════════════════════════
import { ManagementHub } from "./pos/pages/ManagementHub";


// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG VIEWER PAGE
// ═══════════════════════════════════════════════════════════════════════════
import { AuditLogPage } from "./pos/pages/AuditLogPage";

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE TRACKER PAGE
// ═══════════════════════════════════════════════════════════════════════════
import { ATTENDANCE_TYPES, ATTENDANCE_TYPE_COLORS } from "./pos/constants/attendance";

import { AttendanceTrackerPage } from "./pos/pages/AttendanceTrackerPage";


// ═══════════════════════════════════════════════════════════════════════════
// DAILY OPERATIONS PAGE
// ═══════════════════════════════════════════════════════════════════════════
import { DailyOpsPage } from "./pos/pages/DailyOpsPage";


// ═══════════════════════════════════════════════════════════════════════════
// AGREEMENTS PAGE (standalone management)
// ═══════════════════════════════════════════════════════════════════════════
import { AgreementsPage } from "./pos/pages/AgreementsPage";

// ═══════════════════════════════════════════════════════════════════════════
// EOD (END OF DAY) PAGE
// ═══════════════════════════════════════════════════════════════════════════
// EOD SEARCH OVERLAY
// ═══════════════════════════════════════════════════════════════════════════
import { EODSearchOverlay } from "./pos/components/EODSearchOverlay";

// ═══════════════════════════════════════════════════════════════════════════
import { EODPage } from "./pos/pages/EODPage";

// ═══════════════════════════════════════════════════════════════════════════
// DROPDOWN LISTS SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// RUN CARD CONFIG TAB
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// VET DIRECTORY TAB
// ═══════════════════════════════════════════════════════════════════════════
import { VetDirectoryTab } from "./pos/components/VetDirectoryTab";

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
import { QuestionnaireSettingsTab } from "./pos/components/QuestionnaireSettingsTab";

import { RunCardConfigTab } from "./pos/components/RunCardConfigTab";
import { PricingTab } from "./pos/components/PricingTab";

import { PackagesSection } from "./pos/components/PackagesSection";

import { CreatePackageWizard } from "./pos/components/CreatePackageWizard";

import { SellPackageModal } from "./pos/components/SellPackageModal";

import { DropdownListsTab } from "./pos/components/DropdownListsTab";

// ═══════════════════════════════════════════════════════════════════════════
// EOD TEMPLATE SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
import { EODTemplateTab } from "./pos/components/EODTemplateTab";

// ─── Daily Ops Template Editor ───────────────────────────────────────────────
import { DailyOpsTemplateTab } from "./pos/components/DailyOpsTemplateTab";

// ═══════════════════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS TAB — Matrix Grid View
// ═══════════════════════════════════════════════════════════════════════════
import { RolesPermissionsTab } from "./pos/components/RolesPermissionsTab";

// ═══════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT TAB (used inside Settings)
// ═══════════════════════════════════════════════════════════════════════════
import { TeamTab } from "./pos/components/TeamTab";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Location Management
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseLocationsPage } from "./pos/pages/EnterpriseLocationsPage";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Operations Oversight
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseOperationsPage } from "./pos/pages/EnterpriseOperationsPage";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Package Management
// ═══════════════════════════════════════════════════════════════════════════
import { EnterprisePackagesPage } from "./pos/pages/EnterprisePackagesPage";

// Enterprise package creation wizard (multi-step)
import { EnterpriseCreatePkgForm } from "./pos/components/EnterpriseCreatePkgForm";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — User Management
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseUsersPage } from "./pos/pages/EnterpriseUsersPage";

// ═══════════════════════════════════════════════════════════════════════════
// ONLINE BOOKINGS INBOX
// ═══════════════════════════════════════════════════════════════════════════
import { OnlineBookingsPage } from "./pos/pages/OnlineBookingsPage";

// ═══════════════════════════════════════════════════════════════════════════
// LMS — LEARNING MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
import { DEFAULT_LMS_CURRICULUM } from "./pos/constants/lms";

import { LMSPage } from "./pos/pages/LMSPage";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Management (Attendance Aggregation)
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseManagementPage } from "./pos/pages/EnterpriseManagementPage";

// ═══════════════════════════════════════════════════════════════════════════
// DISCOUNTS SECTION
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
import { MessageTemplatesTab } from "./pos/components/MessageTemplatesTab";

import { DiscountsSection } from "./pos/components/DiscountsSection";

import { DiscountForm } from "./pos/components/DiscountForm";

// ═══════════════════════════════════════════════════════════════════════════
// PACKAGE REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════
import { PackageReportsTab } from "./pos/components/PackageReportsTab";

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS (Fields + Dog Tags)
// ═══════════════════════════════════════════════════════════════════════════
import { SettingsPage } from "./pos/pages/SettingsPage";

// ═══════════════════════════════════════════════════════════════════════════
// SUPERHUMAN-STYLE "NEW" OVERLAY
// ═══════════════════════════════════════════════════════════════════════════
import { NewOverlay } from "./pos/components/NewOverlay";

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED NEW PAGE (Client + Dog + Reservation — all in one)
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// AI COMMAND PAGE
// ═══════════════════════════════════════════════════════════════════════════

import { DogSelectButtons } from "./pos/components/DogSelectButtons";


// ─── Messages Page ────────────────────────────────────────────────────────
import { MessagesPage } from "./pos/pages/MessagesPage";

// ─── Payment Form Modal ──────────────────────────────────────────────────
import { PaymentFormModal } from "./pos/components/PaymentFormModal";

// ─── Payments Page ────────────────────────────────────────────────────────
import { PaymentsPage } from "./pos/pages/PaymentsPage";

// ═══════════════════════════════════════════════════════════════════════════
// REUSABLE REPORT COMPONENTS — DataTable, KPICard, Charts
// ═══════════════════════════════════════════════════════════════════════════


/**
 * DataTable Component
 * Displays tabular data with search, column filtering, sorting, and pagination
 */
import { DataTable, KPICard, SVGLineChart, SVGBarChart, SVGDonutChart, SVGHeatmap, SVGFunnel } from "./pos/charts/charts";


// ═══════════════════════════════════════════════════════════════════════════
// REPORTS PAGE — Revenue Intelligence Dashboard v2
// ═══════════════════════════════════════════════════════════════════════════
// © 2026 K9 Operations LLC. All Rights Reserved.
// Revenue Intelligence Dashboard v2 — Single-page, interactive, world-class

// ══════════════════════════════════════════════════════════════════════════
// INTERACTIVE LINE CHART — DEFINED AT MODULE SCOPE so React preserves
// component identity across parent re-renders (enables animation persistence)
// ══════════════════════════════════════════════════════════════════════════
import { CHART_PTS, _chartFmt$, _chartFmt$k } from "./pos/lib/chartFmt";

import { InteractiveLineChart } from "./pos/charts/InteractiveLineChart";

function ReportsPage({ data, save, nav, profile, rptFilterOpen, setRptFilterOpen, rptFilters, setRptFilters, onActiveReportChange }) {
  const [timeRange, setTimeRange] = useState("month");
  const [compareMode, setCompareMode] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [animEpoch, setAnimEpoch] = useState(0);
  const [nlpQuery, setNlpQuery] = useState("");
  const [nlpResults, setNlpResults] = useState(null);
  const [nlpLoading, setNlpLoading] = useState(false);
  const [showNLPSuggestions, setShowNLPSuggestions] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const [transactionPage, setTransactionPage] = useState(0);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [accrualSortConfig, setAccrualSortConfig] = useState({ key: "checkIn", direction: "desc" });
  const [cashTableOpen, setCashTableOpen] = useState(false);
  const [accrualTableOpen, setAccrualTableOpen] = useState(false);

  // Wrapper that bumps animEpoch so both charts start/end animation in perfect sync
  const changeTimeRange = (range) => { setTimeRange(range); setAnimEpoch(e => e + 1); };

  // ─── NLP SUGGESTED QUERIES ───
  // ═══════════════════════════════════════════════════════════════════════
  // NLP INTELLIGENCE ENGINE — Smart local query processor
  // Covers 90%+ of business queries with zero API cost.
  // Falls back to LLM (via Supabase Edge Function) for ambiguous queries.
  // ═══════════════════════════════════════════════════════════════════════

  const nlpSuggestionsBank = [
    { cat: "Revenue", q: "Revenue by suite type" },
    { cat: "Revenue", q: "Revenue by category" },
    { cat: "Revenue", q: "Revenue trend over time" },
    { cat: "Revenue", q: "MoM revenue growth" },
    { cat: "Clients", q: "Top 10 clients by spend" },
    { cat: "Clients", q: "New clients this period" },
    { cat: "Operations", q: "Occupancy rate by room type" },
    { cat: "Operations", q: "Average length of stay" },
    { cat: "Operations", q: "Busiest day of the week" },
    { cat: "Analysis", q: "Discount impact analysis" },
    { cat: "Analysis", q: "Add-on attach rate" },
    { cat: "Analysis", q: "Payment method breakdown" },
    { cat: "Analysis", q: "Booking source breakdown" },
    { cat: "Analysis", q: "RevPAR analysis" },
  ];

  // ─── SYNONYM MAP — maps casual language to canonical terms ───
  const _SYN = {
    revenue: ["revenue", "income", "earnings", "sales", "money", "made", "earned", "brought in", "collected", "gross", "net"],
    client: ["client", "customer", "owner", "pet parent", "person", "people", "who"],
    dog: ["dog", "pet", "pup", "puppy", "animal", "canine", "fur baby"],
    boarding: ["boarding", "stay", "stayed", "overnight", "boarded", "nights", "sleepover"],
    daycare: ["daycare", "day care", "day-care", "daytime", "day visit"],
    room: ["room", "suite", "compartment", "kennel", "unit", "space"],
    occupancy: ["occupancy", "occupied", "full", "empty", "availability", "utilization", "capacity"],
    discount: ["discount", "coupon", "promo", "promotion", "deal", "savings", "markdown", "reduction"],
    addon: ["add-on", "addon", "add on", "extra", "upsell", "service", "bath", "groom", "upgrade"],
    payment: ["payment", "pay", "paid", "charge", "transaction", "card", "cash", "check"],
    category: ["category", "type", "kind", "breakdown", "segment", "group"],
    trend: ["trend", "over time", "growth", "change", "trajectory", "direction", "progress", "history"],
    top: ["top", "best", "highest", "most", "biggest", "leading", "largest"],
    bottom: ["bottom", "worst", "lowest", "least", "smallest", "fewest"],
    average: ["average", "avg", "mean", "typical", "per"],
    compare: ["compare", "vs", "versus", "compared", "against", "difference"],
    busiest: ["busiest", "busiest", "peak", "popular", "high traffic", "most active"],
    source: ["source", "booking source", "channel", "where", "online", "phone", "walk-in", "walk in"],
    breed: ["breed", "species", "type of dog"],
    frequency: ["frequency", "often", "frequent", "repeat", "returning", "loyal", "retention"],
    new: ["new", "first time", "first-time", "new client", "new customer", "acquired"],
    length: ["length", "duration", "how long", "nights", "days", "stay length"],
    revpar: ["revpar", "rev par", "revenue per available room"],
  };

  // ─── INTENT DEFINITIONS — each has keywords, handler, and follow-ups ───
  const _matchScore = (q, terms) => terms.reduce((sc, t) => sc + (q.includes(t) ? (t.includes(" ") ? 3 : 1) : 0), 0);

  const _INTENTS = useMemo(() => [
    { id: "rev_by_suite", keywords: ["revenue", "suite", "room type", "room", "boarding revenue"], requiredAny: ["suite", "room", "type"], score: 0 },
    { id: "rev_by_category", keywords: ["revenue", "category", "breakdown", "by category", "segment"], requiredAny: ["category", "segment", "breakdown"], score: 0 },
    { id: "rev_trend", keywords: ["revenue", "trend", "over time", "growth", "trajectory", "history", "month over month", "mom", "week over week"], requiredAny: ["trend", "over time", "growth", "history", "mom", "trajectory"], score: 0 },
    { id: "rev_total", keywords: ["total revenue", "how much", "made", "earned", "total sales", "gross revenue"], requiredAny: ["total", "how much", "made", "earned"], score: 0 },
    { id: "top_clients", keywords: ["top", "client", "customer", "spend", "best", "highest", "most", "biggest spender"], requiredAny: ["client", "customer", "spend", "spender"], score: 0 },
    { id: "new_clients", keywords: ["new", "first time", "acquired", "client", "customer"], requiredAny: ["new", "first time", "first-time"], score: 0 },
    { id: "client_frequency", keywords: ["repeat", "returning", "loyal", "frequent", "retention", "client", "customer", "how often"], requiredAny: ["repeat", "returning", "loyal", "frequent", "retention", "how often"], score: 0 },
    { id: "payment_methods", keywords: ["payment", "method", "card", "cash", "check", "how", "paid"], requiredAny: ["payment", "method", "card", "cash", "check", "paid"], score: 0 },
    { id: "booking_sources", keywords: ["booking", "source", "channel", "online", "phone", "walk-in", "where", "booked"], requiredAny: ["source", "channel", "where", "booked", "online", "walk-in"], score: 0 },
    { id: "occupancy", keywords: ["occupancy", "occupied", "full", "empty", "capacity", "utilization", "availability"], requiredAny: ["occupancy", "occupied", "full", "empty", "capacity", "utilization"], score: 0 },
    { id: "occupancy_by_room", keywords: ["occupancy", "room", "suite", "type", "by room", "by suite"], requiredAny: ["occupancy", "occupied"], requiredAll: ["room", "suite", "type"], score: 0 },
    { id: "avg_stay", keywords: ["average", "length", "stay", "duration", "nights", "how long", "typical"], requiredAny: ["length", "duration", "how long", "stay", "nights"], score: 0 },
    { id: "busiest_day", keywords: ["busiest", "peak", "popular", "day of week", "which day", "day", "most active"], requiredAny: ["busiest", "peak", "which day", "day of week", "most active"], score: 0 },
    { id: "discount_impact", keywords: ["discount", "coupon", "promo", "impact", "analysis", "savings", "leakage"], requiredAny: ["discount", "coupon", "promo"], score: 0 },
    { id: "addon_analysis", keywords: ["add-on", "addon", "add on", "attach", "upsell", "extra", "bath", "groom", "service"], requiredAny: ["add-on", "addon", "add on", "attach", "upsell", "bath", "groom"], score: 0 },
    { id: "revpar", keywords: ["revpar", "rev par", "revenue per available room", "per room"], requiredAny: ["revpar", "rev par", "per room", "per available"], score: 0 },
    { id: "top_dogs", keywords: ["top", "dog", "pet", "most", "frequent", "popular", "booked"], requiredAny: ["dog", "pet", "pup"], score: 0 },
    { id: "breed_breakdown", keywords: ["breed", "type of dog", "breakdown", "mix"], requiredAny: ["breed"], score: 0 },
    { id: "rev_by_service", keywords: ["revenue", "service", "boarding", "daycare", "by service"], requiredAny: ["service", "boarding vs", "daycare vs"], score: 0 },
  ], []);

  // ─── DATE RANGE LOGIC ───
  const today = new Date().toISOString().split("T")[0];
  const getDateRange = (range) => {
    if (range === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
    let from = today;
    if (range === "today") from = today;
    else if (range === "week") from = addDays(today, -7);
    else if (range === "month") from = addDays(today, -30);
    else if (range === "quarter") from = addDays(today, -90);
    else if (range === "year") from = addDays(today, -365);
    return { from, to: today };
  };

  const { from: dateFrom, to: dateTo } = getDateRange(timeRange);
  const days = (() => {
    if (timeRange === "custom" && customFrom && customTo) {
      return Math.max(1, Math.round((new Date(customTo) - new Date(customFrom)) / 86400000));
    }
    return timeRange === "today" ? 1 : timeRange === "week" ? 7 : timeRange === "month" ? 30 : timeRange === "quarter" ? 90 : 365;
  })();
  const prevFrom = addDays(dateFrom, -days);
  const prevTo = addDays(dateFrom, -1);

  // ─── FORMATTING HELPERS ───
  const fmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
  const fmt$k = (v) => fmt$(v);
  const fmtPercent = (v) => `${typeof v === "number" ? v.toFixed(1) : "0.0"}%`;
  const fmtDateLabel = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); return `${dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`; };

  // ─── CASH BASIS DATA ───
  const cashBasisData = useMemo(() => {
    const payments = (data.payments || []).filter(p => p.status === "completed" && p.type !== "refund");

    const calcMetrics = (pmts) => {
      const total = pmts.reduce((sum, p) => sum + (p.amount || 0), 0);
      const byCategory = {}, byMethod = {}, bySource = {}, byDate = {};

      pmts.forEach(p => {
        const cat = p.category || "Other";
        byCategory[cat] = (byCategory[cat] || 0) + (p.amount || 0);
        const meth = p.method || "other";
        byMethod[meth] = (byMethod[meth] || 0) + 1;
        const res = (data.reservations || []).find(r => r.id === p.reservationId);
        const src = res?.bookingSource || "phone";
        bySource[src] = (bySource[src] || 0) + (p.amount || 0);
        const dt = p.timestamp?.split("T")[0] || today;
        byDate[dt] = (byDate[dt] || 0) + (p.amount || 0);
      });

      return { total, count: pmts.length, byCategory, byMethod, bySource, byDate, avgTransaction: pmts.length > 0 ? total / pmts.length : 0, payments: pmts };
    };

    const currentPayments = payments.filter(p => p.timestamp && p.timestamp.split("T")[0] >= dateFrom && p.timestamp.split("T")[0] <= dateTo);
    const previousPayments = compareMode
      ? payments.filter(p => p.timestamp && p.timestamp.split("T")[0] >= prevFrom && p.timestamp.split("T")[0] <= prevTo)
      : [];

    const current = calcMetrics(currentPayments);
    const previous = calcMetrics(previousPayments);

    return {
      current,
      previous,
      trend: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : 0,
      trendAvg: previous.count > 0 ? ((current.avgTransaction - previous.avgTransaction) / previous.avgTransaction) * 100 : 0,
    };
  }, [data.payments, data.reservations, dateFrom, dateTo, prevFrom, prevTo, compareMode]);

  // ─── ACCRUAL DATA ───
  const accrualData = useMemo(() => {
    const reservations = data.reservations || [];
    const pricing = data.pricing || DEF_PRICING;
    const addOnPrices = getAddOnPrices(pricing, data.addOnRules);
    const boardingRates = { ...DEF_PRICING.boardingRates, ...(pricing.boardingRates || {}) };
    const daycareRates = { ...DEF_PRICING.daycareRates, ...(pricing.daycareRates || {}) };
    const multiDogDiscount = pricing.multiDogDiscount ?? DEF_PRICING.multiDogDiscount;

    const processDateRange = (from, to) => {
      const daysList = [];
      let cur = from;
      while (cur <= to) { daysList.push(cur); cur = addDays(cur, 1); }

      const dayData = {};
      daysList.forEach(d => {
        dayData[d] = { boardingRevenue: 0, daycareRevenue: 0, feedingRevenue: 0, medicationRevenue: 0, addOnRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
      });

      reservations.forEach(res => {
        if (res.status === "cancelled") return;

        if (res.type === "boarding" && res.checkIn && res.checkOut) {
          const totalNights = countNights(res.checkIn, res.checkOut);
          if (totalNights <= 0) return;
          const rate = boardingRates[res.roomType] || 0;
          const segments = res.roomSegments || [{ startDate: res.checkIn, endDate: res.checkOut, room: res.room, roomType: res.roomType }];

          segments.forEach(segment => {
            const segRate = boardingRates[segment.roomType || res.roomType] || rate;
            let segNight = segment.startDate || res.checkIn;
            while (segNight < (segment.endDate || res.checkOut)) {
              if (segNight >= from && segNight <= to && dayData[segNight]) {
                dayData[segNight].boardingRevenue += segRate;
                dayData[segNight].roomsOccupied += 1;
              }
              segNight = addDays(segNight, 1);
            }
          });

          let discountAmount = 0;
          if (res.discountType === "percent") discountAmount = (rate * totalNights * (res.discountValue || 0)) / 100;
          else if (res.discountType === "flat") discountAmount = res.discountValue || 0;
          else if (res.discountType === "coupon") discountAmount = res.discountValue || 0;
          if (res.isSecondDogSameRoom && multiDogDiscount > 0) discountAmount += (rate * totalNights * multiDogDiscount) / 100;

          if (discountAmount > 0 && res.checkOut <= to) {
            const cd = addDays(res.checkOut, -1);
            if (dayData[cd]) dayData[cd].discounts += discountAmount;
          }

          if (res.selectedAddOns && res.selectedAddOns.length > 0 && res.checkOut <= to) {
            const cd = addDays(res.checkOut, -1);
            if (dayData[cd]) {
              const addOnTotal = res.selectedAddOns.reduce((sum, a) => sum + ((addOnPrices[a] || 0) * totalNights), 0);
              dayData[cd].addOnRevenue += addOnTotal;
            }
          }

          if (res.careOverrides?.feeding || (data.dogs && data.dogs.find(d => d.id === res.dogId)?.feeding)) {
            const feedingRate = res.careOverrides?.feedingRate || pricing.feedingRate || 0;
            if (res.checkOut <= to) { const cd = addDays(res.checkOut, -1); if (dayData[cd]) dayData[cd].feedingRevenue += feedingRate * totalNights; }
          }
          if (res.careOverrides?.medication) {
            const medRate = res.careOverrides?.medicationRate || pricing.medicationRate || 0;
            if (res.checkOut <= to) { const cd = addDays(res.checkOut, -1); if (dayData[cd]) dayData[cd].medicationRevenue += medRate * totalNights; }
          }
        } else if (res.type === "daycare" && res.checkIn && res.checkIn >= from && res.checkIn <= to) {
          const hrs = countHours(res.checkInTime || "09:00", res.checkOutTime || "17:00");
          const halfDayThreshold = pricing.halfDayThreshold ?? 4;
          const rate = hrs < halfDayThreshold ? (daycareRates.halfDay || 0) : (daycareRates.fullDay || 0);
          if (dayData[res.checkIn]) dayData[res.checkIn].daycareRevenue += rate;
        }
      });

      daysList.forEach(d => {
        dayData[d].totalRevenue = dayData[d].boardingRevenue + dayData[d].daycareRevenue + dayData[d].feedingRevenue + dayData[d].medicationRevenue + dayData[d].addOnRevenue;
        dayData[d].netRevenue = dayData[d].totalRevenue - dayData[d].discounts;
      });

      const totals = { boardingRevenue: 0, daycareRevenue: 0, feedingRevenue: 0, medicationRevenue: 0, addOnRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
      daysList.forEach(d => { Object.keys(totals).forEach(k => { totals[k] += dayData[d][k]; }); });

      return { dayData, totals, days: daysList };
    };

    const current = processDateRange(dateFrom, dateTo);
    const previous = compareMode ? processDateRange(prevFrom, prevTo) : { dayData: {}, totals: { totalRevenue: 0, discounts: 0 }, days: [] };

    const allRooms = data.rooms || {};
    const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);
    const revenueTrend = previous.totals.totalRevenue > 0
      ? ((current.totals.totalRevenue - previous.totals.totalRevenue) / previous.totals.totalRevenue) * 100 : 0;
    const occupancyRate = totalRoomCount > 0 && current.days.length > 0 ? (current.totals.roomsOccupied / (totalRoomCount * current.days.length)) * 100 : 0;
    const revPAR = totalRoomCount > 0 && current.days.length > 0 ? current.totals.boardingRevenue / (totalRoomCount * current.days.length) : 0;

    return { current, previous, revenueTrend, occupancyRate, revPAR, days: current.days };
  }, [data.reservations, data.dogs, data.pricing, data.addOnRules, data.rooms, dateFrom, dateTo, prevFrom, prevTo, compareMode]);

  // ─── DISCOUNT BREAKDOWN ───
  const discountBreakdown = useMemo(() => {
    const reservations = data.reservations || [];
    const byType = { none: 0, percent: 0, flat: 0, coupon: 0, multidog: 0 };
    const byAmount = { none: 0, percent: 0, flat: 0, coupon: 0, multidog: 0 };

    reservations.forEach(res => {
      if (res.status === "cancelled" || res.type !== "boarding") return;
      if (res.checkOut < dateFrom || res.checkIn > dateTo) return;
      const totalNights = countNights(res.checkIn, res.checkOut);
      const boardingRates = { ...DEF_PRICING.boardingRates, ...(data.pricing?.boardingRates || {}) };
      const rate = boardingRates[res.roomType] || 0;

      if (!res.discountType || res.discountType === "none") { byType.none += 1; }
      else if (res.discountType === "percent") { byType.percent += 1; byAmount.percent += (rate * totalNights * (res.discountValue || 0)) / 100; }
      else if (res.discountType === "flat") { byType.flat += 1; byAmount.flat += res.discountValue || 0; }
      else if (res.discountType === "coupon") { byType.coupon += 1; byAmount.coupon += res.discountValue || 0; }
      if (res.isSecondDogSameRoom) { byType.multidog += 1; byAmount.multidog += (rate * totalNights * (data.pricing?.multiDogDiscount || 10)) / 100; }
    });

    const grossRevenue = accrualData.current.totals.totalRevenue;
    const totalDiscounts = Object.values(byAmount).reduce((sum, v) => sum + v, 0);
    return { byType, byAmount, grossRevenue, totalDiscounts };
  }, [data.reservations, accrualData.current, dateFrom, dateTo]);

  // ─── TRANSACTIONS TABLE DATA ───
  const transactionsData = useMemo(() => {
    let transactions = (cashBasisData.current.payments || []).map(p => {
      const res = (data.reservations || []).find(r => r.id === p.reservationId);
      const dog = res ? (data.dogs || []).find(d => d.id === res.dogId) : null;
      const client = res ? (data.clients || []).find(c => c.id === res.clientId) : null;
      return { id: p.id, date: p.timestamp?.split("T")[0] || "—", clientName: client?.fields?.first_name || "—", dogName: dog?.fields?.name || "—", service: res?.type === "boarding" ? "Boarding" : res?.type === "daycare" ? "Daycare" : "—", room: res?.room || "—", amount: p.amount || 0, method: p.method || "other", source: res?.bookingSource || "phone", reservationId: p.reservationId };
    });

    if (transactionSearch) {
      const q = transactionSearch.toLowerCase();
      transactions = transactions.filter(t => t.clientName.toLowerCase().includes(q) || t.dogName.toLowerCase().includes(q) || t.date.includes(q));
    }
    transactions.sort((a, b) => {
      const aVal = a[sortConfig.key], bVal = b[sortConfig.key];
      const cmp = typeof aVal === "number" ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortConfig.direction === "desc" ? -cmp : cmp;
    });
    return transactions;
  }, [cashBasisData.current.payments, data.reservations, data.dogs, data.clients, sortConfig, transactionSearch]);

  // ─── ACCRUAL RESERVATIONS TABLE DATA ───
  const accrualReservationsData = useMemo(() => {
    const reservations = (data.reservations || []).filter(r => {
      if (r.status === "cancelled") return false;
      if (r.checkOut < dateFrom || r.checkIn > dateTo) return false;
      return r.type === "boarding";
    });
    const boardingRates = { ...DEF_PRICING.boardingRates, ...(data.pricing?.boardingRates || {}) };
    const multiDogDiscountVal = data.pricing?.multiDogDiscount ?? 10;

    let processed = reservations.map(res => {
      const dog = (data.dogs || []).find(d => d.id === res.dogId);
      const client = (data.clients || []).find(c => c.id === res.clientId);
      const nights = countNights(res.checkIn, res.checkOut);
      const rate = boardingRates[res.roomType] || 0;
      const retailTotal = rate * nights;

      let discountAmount = 0;
      if (res.discountType === "percent") discountAmount = (retailTotal * (res.discountValue || 0)) / 100;
      else if (res.discountType === "flat") discountAmount = res.discountValue || 0;
      else if (res.discountType === "coupon") discountAmount = res.discountValue || 0;
      if (res.isSecondDogSameRoom) discountAmount += (retailTotal * multiDogDiscountVal) / 100;

      return {
        id: res.id, dogName: dog?.fields?.name || "—",
        clientName: (client?.fields?.first_name || "") + " " + (client?.fields?.last_name || ""),
        roomType: res.roomType, checkIn: res.checkIn, checkOut: res.checkOut, nights, nightlyRate: rate,
        retailTotal, discountType: res.discountType || "none", discountAmount, netTotal: retailTotal - discountAmount,
        status: res.checkOut <= today ? "checked-out" : res.checkIn <= today ? "active" : "upcoming",
        reservationId: res.id,
      };
    });

    processed.sort((a, b) => {
      const aVal = a[accrualSortConfig.key], bVal = b[accrualSortConfig.key];
      const cmp = typeof aVal === "number" ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return accrualSortConfig.direction === "desc" ? -cmp : cmp;
    });
    return processed;
  }, [data.reservations, data.dogs, data.clients, accrualSortConfig, dateFrom, dateTo]);

  // ─── NLP QUERY PROCESSING ───
  // ─── INTENT CLASSIFIER — scores each intent against the query ───
  const classifyIntent = useCallback((query) => {
    const q = query.toLowerCase().trim();
    let best = null, bestScore = 0;
    for (const intent of _INTENTS) {
      let score = _matchScore(q, intent.keywords);
      // Boost if required terms present
      if (intent.requiredAny && intent.requiredAny.some(t => q.includes(t))) score += 5;
      else if (intent.requiredAny) score = Math.max(0, score - 10); // Penalize if no required term
      if (intent.requiredAll && !intent.requiredAll.some(t => q.includes(t))) score = Math.max(0, score - 5);
      if (score > bestScore) { bestScore = score; best = intent.id; }
    }
    return { intent: best, confidence: bestScore };
  }, [_INTENTS]);

  // ─── ENTITY EXTRACTOR — pulls modifiers from query ───
  const extractEntities = useCallback((query) => {
    const q = query.toLowerCase().trim();
    const entities = {};
    // Limit
    const limitMatch = q.match(/(?:top|bottom|first|last)\s+(\d+)/);
    entities.limit = limitMatch ? parseInt(limitMatch[1]) : 10;
    entities.sortDir = (q.includes("bottom") || q.includes("least") || q.includes("lowest") || q.includes("worst")) ? "asc" : "desc";
    // Room type filter
    if (q.includes("luxury")) entities.roomType = "Luxury Suite";
    else if (q.includes("executive")) entities.roomType = "Executive Room";
    else if (q.includes("double")) entities.roomType = "Double Compartment";
    else if (q.includes("single")) entities.roomType = "Single Compartment";
    return entities;
  }, []);

  // ─── AGGREGATOR FUNCTIONS — reusable data transformers ───
  const _agg = useMemo(() => {
    const reservations = (data.reservations || []).filter(r => r.status !== "cancelled" && r.type === "boarding" && r.checkOut >= dateFrom && r.checkIn <= dateTo);
    const allReservations = (data.reservations || []).filter(r => r.status !== "cancelled" && r.checkOut >= dateFrom && r.checkIn <= dateTo);
    const payments = cashBasisData.current.payments || [];
    const dogs = data.dogs || [];
    const clients = data.clients || [];
    const pricing = data.pricing || DEF_PRICING;
    const br = { ...DEF_PRICING.boardingRates, ...(pricing.boardingRates || {}) };
    const allRooms = data.rooms || {};
    const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);

    return {
      revBySuite: () => {
        const byType = {};
        reservations.forEach(res => { const n = countNights(res.checkIn, res.checkOut); byType[res.roomType] = (byType[res.roomType] || 0) + ((br[res.roomType] || 0) * n); });
        const total = Object.values(byType).reduce((s, v) => s + v, 0);
        return { type: "table", title: "Boarding Revenue by Suite Type", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Suite Type", "Revenue", "Share", "Reservations"],
          rows: Object.entries(byType).sort(([, a], [, b]) => b - a).map(([type, rev]) => {
            const cnt = reservations.filter(r => r.roomType === type).length;
            return [type, fmt$(rev), fmtPercent(total > 0 ? (rev / total) * 100 : 0), String(cnt)];
          }),
          followUps: ["Occupancy rate by room type", "Revenue trend over time", "Average length of stay"] };
      },

      revByCategory: () => {
        const cats = cashBasisData.current.byCategory;
        const total = cashBasisData.current.total;
        return { type: "table", title: "Revenue by Category", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Category", "Amount", "Share"],
          rows: Object.entries(cats).sort(([, a], [, b]) => b - a).map(([cat, amt]) => [cat, fmt$(amt), fmtPercent(total > 0 ? (amt / total) * 100 : 0)]),
          followUps: ["Revenue by suite type", "Revenue trend over time", "Top 10 clients by spend"] };
      },

      revTrend: () => {
        // Build period-over-period comparison
        const curTotal = cashBasisData.current.total;
        const prevTotal = cashBasisData.previous.total;
        const growthPct = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : 0;
        const curAvg = cashBasisData.current.avgTransaction;
        const prevAvg = cashBasisData.previous.avgTransaction;
        const avgGrowth = prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0;

        // Daily breakdown for chart
        const chartPoints = [];
        let cur = dateFrom;
        while (cur <= dateTo) { chartPoints.push({ date: cur, label: fmtDateLabel(cur), value: cashBasisData.current.byDate?.[cur] || 0 }); cur = addDays(cur, 1); }

        return { type: "summary", title: "Revenue Trend Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Current Period", value: fmt$(curTotal) },
            { label: "Previous Period", value: fmt$(prevTotal) },
            { label: "Growth", value: `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`, color: growthPct >= 0 ? C.suc : C.dan },
            { label: "Avg Txn Change", value: `${avgGrowth >= 0 ? "+" : ""}${avgGrowth.toFixed(1)}%`, color: avgGrowth >= 0 ? C.suc : C.dan },
            { label: "Daily Avg", value: fmt$(days > 0 ? curTotal / days : 0) },
            { label: "Transactions", value: String(cashBasisData.current.count) },
          ],
          followUps: ["Revenue by category", "Top 10 clients by spend", "Busiest day of the week"] };
      },

      revTotal: () => {
        const cashTotal = cashBasisData.current.total;
        const accrualTotal = accrualData.current.totals.totalRevenue;
        const accrualNet = accrualData.current.totals.netRevenue;
        return { type: "summary", title: "Total Revenue Summary", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Cash Collected", value: fmt$(cashTotal) },
            { label: "Accrual Gross", value: fmt$(accrualTotal) },
            { label: "Accrual Net", value: fmt$(accrualNet) },
            { label: "Transactions", value: String(cashBasisData.current.count) },
            { label: "Avg Transaction", value: fmt$(cashBasisData.current.avgTransaction) },
            { label: "Daily Avg", value: fmt$(days > 0 ? cashTotal / days : 0) },
          ],
          followUps: ["Revenue by category", "Revenue trend over time", "MoM revenue growth"] };
      },

      topClients: (limit = 10, dir = "desc") => {
        const byClient = {};
        const clientVisits = {};
        payments.forEach(p => {
          const res = (data.reservations || []).find(r => r.id === p.reservationId);
          const client = res ? clients.find(c => c.id === res.clientId) : null;
          const name = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown";
          byClient[name] = (byClient[name] || 0) + (p.amount || 0);
          clientVisits[name] = (clientVisits[name] || 0) + 1;
        });
        const sorted = Object.entries(byClient).sort(([, a], [, b]) => dir === "desc" ? b - a : a - b).slice(0, limit);
        const total = cashBasisData.current.total;
        return { type: "table", title: `${dir === "desc" ? "Top" : "Bottom"} ${limit} Clients by Spend`, subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Client", "Spend", "Share", "Visits"],
          rows: sorted.map(([name, amt]) => [name, fmt$(amt), fmtPercent(total > 0 ? (amt / total) * 100 : 0), String(clientVisits[name] || 0)]),
          followUps: ["New clients this period", "Client retention rate", "Revenue by category"] };
      },

      newClients: () => {
        // Clients whose first payment falls within the current date range
        const allPayments = (data.payments || []).filter(p => p.status === "completed" && p.type !== "refund");
        const firstPayByClient = {};
        allPayments.forEach(p => {
          const res = (data.reservations || []).find(r => r.id === p.reservationId);
          const cId = res?.clientId;
          if (!cId) return;
          const dt = p.timestamp?.split("T")[0];
          if (!firstPayByClient[cId] || dt < firstPayByClient[cId]) firstPayByClient[cId] = dt;
        });
        const newIds = Object.entries(firstPayByClient).filter(([, dt]) => dt >= dateFrom && dt <= dateTo);
        const newList = newIds.map(([cId, dt]) => {
          const client = clients.find(c => c.id === cId);
          const name = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown";
          const spent = payments.filter(p => { const r = (data.reservations || []).find(r2 => r2.id === p.reservationId); return r?.clientId === cId; }).reduce((s, p) => s + (p.amount || 0), 0);
          return { name, date: dt, spent };
        }).sort((a, b) => b.spent - a.spent);
        return { type: "table", title: "New Clients This Period", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)} — ${newList.length} new client${newList.length !== 1 ? "s" : ""}`,
          columns: ["Client", "First Visit", "Spend"],
          rows: newList.slice(0, 20).map(c => [c.name, fmtDateLabel(c.date), fmt$(c.spent)]),
          followUps: ["Top 10 clients by spend", "Client retention rate", "Revenue trend over time"] };
      },

      clientFrequency: () => {
        const visits = {};
        allReservations.forEach(res => {
          const cId = res.clientId;
          if (!cId) return;
          visits[cId] = (visits[cId] || 0) + 1;
        });
        const freq = Object.values(visits);
        const once = freq.filter(f => f === 1).length;
        const repeat = freq.filter(f => f > 1).length;
        const avgVisits = freq.length > 0 ? freq.reduce((s, v) => s + v, 0) / freq.length : 0;
        const topRepeaters = Object.entries(visits).sort(([, a], [, b]) => b - a).slice(0, 5).map(([cId, cnt]) => {
          const client = clients.find(c => c.id === cId);
          return { name: client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "Unknown", count: cnt };
        });
        return { type: "summary", title: "Client Retention & Frequency", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Unique Clients", value: String(freq.length) },
            { label: "First-Time", value: String(once) },
            { label: "Returning", value: String(repeat) },
            { label: "Retention Rate", value: fmtPercent(freq.length > 0 ? (repeat / freq.length) * 100 : 0) },
            { label: "Avg Visits", value: avgVisits.toFixed(1) },
          ],
          extra: topRepeaters.length > 0 ? { type: "mini-table", title: "Most Frequent Clients", columns: ["Client", "Visits"], rows: topRepeaters.map(r => [r.name, String(r.count)]) } : null,
          followUps: ["Top 10 clients by spend", "New clients this period", "Average length of stay"] };
      },

      paymentMethods: () => {
        const mc = {};
        const ma = {};
        payments.forEach(p => {
          const m = p.method || "other";
          mc[m] = (mc[m] || 0) + 1;
          ma[m] = (ma[m] || 0) + (p.amount || 0);
        });
        const total = Object.values(mc).reduce((s, v) => s + v, 0);
        return { type: "table", title: "Payment Method Breakdown", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Method", "Count", "Share", "Amount"],
          rows: Object.entries(mc).sort(([, a], [, b]) => b - a).map(([m, c]) => [m.charAt(0).toUpperCase() + m.slice(1), String(c), fmtPercent(total > 0 ? (c / total) * 100 : 0), fmt$(ma[m] || 0)]),
          followUps: ["Revenue by category", "Top 10 clients by spend", "Booking source breakdown"] };
      },

      bookingSources: () => {
        const src = cashBasisData.current.bySource;
        const total = cashBasisData.current.total;
        return { type: "table", title: "Booking Source Breakdown", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Source", "Revenue", "Share"],
          rows: Object.entries(src).sort(([, a], [, b]) => b - a).map(([s, v]) => [s === "online" ? "Online" : s === "phone" ? "Phone" : s === "walk-in" ? "Walk-In" : s, fmt$(v), fmtPercent(total > 0 ? (v / total) * 100 : 0)]),
          followUps: ["Payment method breakdown", "Revenue by category", "New clients this period"] };
      },

      occupancy: () => {
        const dayCount = accrualData.days.length || 1;
        const totalOcc = accrualData.current.totals.roomsOccupied;
        const rate = totalRoomCount > 0 ? (totalOcc / (totalRoomCount * dayCount)) * 100 : 0;
        const available = Math.max(0, totalRoomCount * dayCount - totalOcc);
        // Daily occupancy for sparkline data
        const dailyRates = accrualData.days.map(d => {
          const occ = accrualData.current.dayData[d]?.roomsOccupied || 0;
          return totalRoomCount > 0 ? (occ / totalRoomCount) * 100 : 0;
        });
        const peakDay = dailyRates.length > 0 ? accrualData.days[dailyRates.indexOf(Math.max(...dailyRates))] : null;
        return { type: "summary", title: "Occupancy Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Avg Occupancy", value: fmtPercent(rate) },
            { label: "Room-Nights Sold", value: String(totalOcc) },
            { label: "Room-Nights Available", value: String(available) },
            { label: "Total Rooms", value: String(totalRoomCount) },
            { label: "Peak Day", value: peakDay ? fmtDateLabel(peakDay) : "—" },
            { label: "Peak Occupancy", value: dailyRates.length > 0 ? fmtPercent(Math.max(...dailyRates)) : "—" },
          ],
          followUps: ["Occupancy rate by room type", "RevPAR analysis", "Revenue by suite type"] };
      },

      occupancyByRoom: () => {
        const roomTypes = Object.keys(allRooms);
        const dayCount = accrualData.days.length || 1;
        const byType = {};
        roomTypes.forEach(rt => { byType[rt] = { count: allRooms[rt]?.length || 0, occupied: 0 }; });
        reservations.forEach(res => {
          const segments = res.roomSegments || [{ startDate: res.checkIn, endDate: res.checkOut, roomType: res.roomType }];
          segments.forEach(seg => {
            const rt = seg.roomType || res.roomType;
            if (!byType[rt]) byType[rt] = { count: 0, occupied: 0 };
            let d = seg.startDate || res.checkIn;
            while (d < (seg.endDate || res.checkOut)) {
              if (d >= dateFrom && d <= dateTo) byType[rt].occupied++;
              d = addDays(d, 1);
            }
          });
        });
        return { type: "table", title: "Occupancy by Room Type", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Room Type", "Rooms", "Room-Nights Sold", "Occupancy Rate"],
          rows: roomTypes.map(rt => {
            const cap = (byType[rt]?.count || 0) * dayCount;
            const occ = byType[rt]?.occupied || 0;
            return [rt, String(byType[rt]?.count || 0), String(occ), fmtPercent(cap > 0 ? (occ / cap) * 100 : 0)];
          }),
          followUps: ["Occupancy rate", "Revenue by suite type", "RevPAR analysis"] };
      },

      avgStay: () => {
        const stays = reservations.map(r => countNights(r.checkIn, r.checkOut)).filter(n => n > 0);
        const avg = stays.length > 0 ? stays.reduce((s, v) => s + v, 0) / stays.length : 0;
        const median = stays.length > 0 ? stays.sort((a, b) => a - b)[Math.floor(stays.length / 2)] : 0;
        const max = stays.length > 0 ? Math.max(...stays) : 0;
        const min = stays.length > 0 ? Math.min(...stays) : 0;
        // Distribution
        const dist = {};
        stays.forEach(n => { const bucket = n >= 7 ? "7+" : String(n); dist[bucket] = (dist[bucket] || 0) + 1; });
        return { type: "summary", title: "Length of Stay Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)} — ${stays.length} reservation${stays.length !== 1 ? "s" : ""}`,
          items: [
            { label: "Average", value: `${avg.toFixed(1)} nights` },
            { label: "Median", value: `${median} nights` },
            { label: "Shortest", value: `${min} night${min !== 1 ? "s" : ""}` },
            { label: "Longest", value: `${max} nights` },
          ],
          extra: Object.keys(dist).length > 0 ? { type: "mini-table", title: "Stay Distribution", columns: ["Nights", "Count"],
            rows: Object.entries(dist).sort(([a], [b]) => (a === "7+" ? 99 : +a) - (b === "7+" ? 99 : +b)).map(([n, c]) => [`${n} night${n === "1" ? "" : "s"}`, String(c)]) } : null,
          followUps: ["Top 10 clients by spend", "Occupancy rate", "Revenue by suite type"] };
      },

      busiestDay: () => {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const byDay = [0, 0, 0, 0, 0, 0, 0];
        const revByDay = [0, 0, 0, 0, 0, 0, 0];
        Object.entries(cashBasisData.current.byDate || {}).forEach(([dt, amt]) => {
          const dow = new Date(dt + "T12:00:00").getDay();
          byDay[dow]++;
          revByDay[dow] += amt;
        });
        const peakIdx = byDay.indexOf(Math.max(...byDay));
        const peakRevIdx = revByDay.indexOf(Math.max(...revByDay));
        return { type: "table", title: "Activity by Day of Week", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Day", "Transactions", "Revenue"],
          rows: dayNames.map((d, i) => [d, String(byDay[i]), fmt$(revByDay[i])]),
          highlight: { row: peakIdx, label: "Peak day" },
          followUps: ["Occupancy rate", "Revenue trend over time", "Average length of stay"] };
      },

      discountImpact: () => {
        const gross = discountBreakdown.grossRevenue;
        const disc = discountBreakdown.totalDiscounts;
        const net = gross - disc;
        const rate = gross > 0 ? (disc / gross) * 100 : 0;
        return { type: "summary", title: "Discount Impact Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Gross Revenue", value: fmt$(gross) },
            { label: "Total Discounts", value: fmt$(disc), color: C.dan },
            { label: "Net Revenue", value: fmt$(net) },
            { label: "Discount Rate", value: fmtPercent(rate), color: rate > 15 ? C.dan : rate > 8 ? C.warn : C.suc },
            { label: "% Discounts", value: `${discountBreakdown.byType.percent}` },
            { label: "Flat Discounts", value: `${discountBreakdown.byType.flat}` },
            { label: "Coupons", value: `${discountBreakdown.byType.coupon}` },
            { label: "Multi-Dog", value: `${discountBreakdown.byType.multidog}` },
          ],
          followUps: ["Revenue by category", "Top 10 clients by spend", "RevPAR analysis"] };
      },

      addonAnalysis: () => {
        const addOnPrices = { ...(pricing.addOns || {}) };
        const boardingRes = reservations;
        const withAddOns = boardingRes.filter(r => r.selectedAddOns && r.selectedAddOns.length > 0);
        const attachRate = boardingRes.length > 0 ? (withAddOns.length / boardingRes.length) * 100 : 0;
        const addOnCounts = {};
        const addOnRev = {};
        withAddOns.forEach(r => {
          const nights = countNights(r.checkIn, r.checkOut);
          (r.selectedAddOns || []).forEach(a => {
            addOnCounts[a] = (addOnCounts[a] || 0) + 1;
            addOnRev[a] = (addOnRev[a] || 0) + ((addOnPrices[a] || 0) * nights);
          });
        });
        const totalAddOnRev = Object.values(addOnRev).reduce((s, v) => s + v, 0);
        return { type: "summary", title: "Add-On Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "Attach Rate", value: fmtPercent(attachRate) },
            { label: "Total Add-On Revenue", value: fmt$(totalAddOnRev) },
            { label: "Reservations w/ Add-Ons", value: `${withAddOns.length} of ${boardingRes.length}` },
            { label: "Avg Add-On Rev", value: fmt$(withAddOns.length > 0 ? totalAddOnRev / withAddOns.length : 0) },
          ],
          extra: Object.keys(addOnCounts).length > 0 ? { type: "mini-table", title: "Popular Add-Ons", columns: ["Add-On", "Count", "Revenue"],
            rows: Object.entries(addOnCounts).sort(([, a], [, b]) => b - a).map(([a, c]) => [a, String(c), fmt$(addOnRev[a] || 0)]) } : null,
          followUps: ["Revenue by category", "Average length of stay", "Discount impact analysis"] };
      },

      revpar: () => {
        const dayCount = accrualData.days.length || 1;
        const totalOcc = accrualData.current.totals.roomsOccupied;
        const boardingRev = accrualData.current.totals.boardingRevenue;
        const revPAR = totalRoomCount > 0 && dayCount > 0 ? boardingRev / (totalRoomCount * dayCount) : 0;
        const adr = totalOcc > 0 ? boardingRev / totalOcc : 0;
        const occRate = totalRoomCount > 0 ? (totalOcc / (totalRoomCount * dayCount)) * 100 : 0;
        return { type: "summary", title: "RevPAR Analysis", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          items: [
            { label: "RevPAR", value: fmt$(revPAR) },
            { label: "ADR", value: fmt$(adr) },
            { label: "Occupancy", value: fmtPercent(occRate) },
            { label: "Boarding Revenue", value: fmt$(boardingRev) },
            { label: "Room-Nights Sold", value: String(totalOcc) },
            { label: "Available Room-Nights", value: String(totalRoomCount * dayCount) },
          ],
          followUps: ["Revenue by suite type", "Occupancy rate by room type", "Revenue trend over time"] };
      },

      topDogs: (limit = 10, dir = "desc") => {
        const byDog = {};
        reservations.forEach(res => {
          const dog = dogs.find(d => d.id === res.dogId);
          const name = dog?.fields?.name || "Unknown";
          if (!byDog[name]) byDog[name] = { nights: 0, visits: 0, breed: dog?.fields?.breed || "—" };
          byDog[name].nights += countNights(res.checkIn, res.checkOut);
          byDog[name].visits++;
        });
        const sorted = Object.entries(byDog).sort(([, a], [, b]) => dir === "desc" ? b.nights - a.nights : a.nights - b.nights).slice(0, limit);
        return { type: "table", title: `${dir === "desc" ? "Top" : "Bottom"} ${limit} Dogs by Stay`, subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Dog", "Breed", "Nights", "Visits"],
          rows: sorted.map(([name, d]) => [name, d.breed, String(d.nights), String(d.visits)]),
          followUps: ["Top 10 clients by spend", "Average length of stay", "Breed breakdown"] };
      },

      breedBreakdown: () => {
        const byBreed = {};
        reservations.forEach(res => {
          const dog = dogs.find(d => d.id === res.dogId);
          const breed = dog?.fields?.breed || "Unknown";
          byBreed[breed] = (byBreed[breed] || 0) + 1;
        });
        const total = Object.values(byBreed).reduce((s, v) => s + v, 0);
        return { type: "table", title: "Reservations by Breed", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Breed", "Reservations", "Share"],
          rows: Object.entries(byBreed).sort(([, a], [, b]) => b - a).slice(0, 15).map(([b, c]) => [b, String(c), fmtPercent(total > 0 ? (c / total) * 100 : 0)]),
          followUps: ["Top 10 dogs by stay", "Average length of stay", "Revenue by suite type"] };
      },

      revByService: () => {
        const boarding = accrualData.current.totals.boardingRevenue;
        const daycare = accrualData.current.totals.daycareRevenue;
        const feeding = accrualData.current.totals.feedingRevenue;
        const meds = accrualData.current.totals.medicationRevenue;
        const addOns = accrualData.current.totals.addOnRevenue;
        const total = boarding + daycare + feeding + meds + addOns;
        const rows = [
          ["Boarding", fmt$(boarding), fmtPercent(total > 0 ? (boarding / total) * 100 : 0)],
          ["Daycare", fmt$(daycare), fmtPercent(total > 0 ? (daycare / total) * 100 : 0)],
          ["Feeding", fmt$(feeding), fmtPercent(total > 0 ? (feeding / total) * 100 : 0)],
          ["Medication Admin", fmt$(meds), fmtPercent(total > 0 ? (meds / total) * 100 : 0)],
          ["Add-Ons", fmt$(addOns), fmtPercent(total > 0 ? (addOns / total) * 100 : 0)],
        ].filter(r => r[1] !== fmt$(0));
        return { type: "table", title: "Revenue by Service Type", subtitle: `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`,
          columns: ["Service", "Revenue", "Share"], rows,
          followUps: ["Revenue by category", "Add-on attach rate", "Revenue trend over time"] };
      },
    };
  }, [data, cashBasisData, accrualData, discountBreakdown, dateFrom, dateTo, days]);

  // ─── MAIN QUERY PROCESSOR ───
  const processNLPQuery = useCallback((query) => {
    const q = query.toLowerCase().trim();
    setNlpLoading(true);

    // Small delay for perceived processing (feels more "intelligent" than instant)
    setTimeout(() => {
      const { intent, confidence } = classifyIntent(q);
      const entities = extractEntities(q);
      let result = null;

      // Dispatch to aggregator based on classified intent
      const dispatch = {
        rev_by_suite: () => _agg.revBySuite(),
        rev_by_category: () => _agg.revByCategory(),
        rev_trend: () => _agg.revTrend(),
        rev_total: () => _agg.revTotal(),
        top_clients: () => _agg.topClients(entities.limit, entities.sortDir),
        new_clients: () => _agg.newClients(),
        client_frequency: () => _agg.clientFrequency(),
        payment_methods: () => _agg.paymentMethods(),
        booking_sources: () => _agg.bookingSources(),
        occupancy: () => _agg.occupancy(),
        occupancy_by_room: () => _agg.occupancyByRoom(),
        avg_stay: () => _agg.avgStay(),
        busiest_day: () => _agg.busiestDay(),
        discount_impact: () => _agg.discountImpact(),
        addon_analysis: () => _agg.addonAnalysis(),
        revpar: () => _agg.revpar(),
        top_dogs: () => _agg.topDogs(entities.limit, entities.sortDir),
        breed_breakdown: () => _agg.breedBreakdown(),
        rev_by_service: () => _agg.revByService(),
      };

      if (intent && confidence >= 5 && dispatch[intent]) {
        result = dispatch[intent]();
        setNlpResults(result);
        setNlpLoading(false);
      } else {
        // Low confidence — use AI assistant edge function (Claude with DB access)
        const tryAIFallback = async () => {
          try {
            const locId = data._locationId || data.locationId;
            const { data: aiResult, error } = await supabase.functions.invoke("ai-assistant", {
              body: { query: q, locationId: locId, userId: "reports" },
            });
            if (!error && aiResult?.structured) {
              // Map structured response to NLP results format
              const s = aiResult.structured;
              result = {
                type: s.type === "table" ? "table" : s.type === "metric" ? "metric" : "message",
                title: s.title || "AI Analysis",
                subtitle: s.subtitle,
                message: aiResult.response,
                followUps: s.followUps || [],
              };
              if (s.type === "table" && s.data) {
                result.headers = s.data.headers;
                result.rows = s.data.rows;
              }
              if (s.type === "metric" && s.data) {
                result.value = s.data.value;
                result.label = s.data.label;
                result.change = s.data.change;
              }
              if (s.type === "summary" && s.data) {
                result.items = s.data.items;
              }
            } else if (!error && aiResult?.response) {
              result = { type: "message", title: "AI Analysis", message: aiResult.response, followUps: [] };
            } else {
              // AI unavailable — fall back to local intent matching with lower threshold
              if (intent && dispatch[intent]) {
                result = dispatch[intent]();
              } else {
                result = {
                  type: "message",
                  title: "I'm not sure what you're looking for",
                  message: `Try one of these: "Revenue by suite type", "Top 10 clients by spend", "Occupancy rate", "Average length of stay", "Discount impact", or "Busiest day of the week".`,
                  followUps: ["Revenue by category", "Top 10 clients by spend", "Occupancy rate", "Discount impact analysis"],
                };
              }
            }
          } catch {
            // Offline/edge function not deployed — fall back to local
            if (intent && dispatch[intent]) {
              result = dispatch[intent]();
            } else {
              result = {
                type: "message",
                title: "I'm not sure what you're looking for",
                message: `Try one of these: "Revenue by suite type", "Top 10 clients by spend", "Occupancy rate", "Average length of stay", "Discount impact", or "Busiest day of the week".`,
                followUps: ["Revenue by category", "Top 10 clients by spend", "Occupancy rate", "Discount impact analysis"],
              };
            }
          }
          setNlpResults(result);
          setNlpLoading(false);
        };
        tryAIFallback();
      }
    }, 150);
  }, [classifyIntent, extractEntities, _agg]);

  // ─── CHART DATA PREP ───
  // ─── SMART CHART BUCKETING ───
  // Determines how to aggregate data points based on the time span
  const getQuarter = (dateStr) => { const m = new Date(dateStr + "T00:00:00").getMonth(); return m < 3 ? "Q1" : m < 6 ? "Q2" : m < 9 ? "Q3" : "Q4"; };
  const getMonthLabel = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short" });
  const getMonthYearLabel = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });

  // Bucket strategy: today/week/month → daily, quarter → weekly, year → monthly
  const bucketMode = useMemo(() => {
    if (timeRange === "year" || days > 180) return "monthly";
    if (timeRange === "quarter" || days > 60) return "weekly";
    return "daily";
  }, [timeRange, days]);

  const bucketDays = useCallback((daysList, getValueForDay, getPrevValueForDay) => {
    if (bucketMode === "daily") {
      return daysList.map(d => ({
        date: d,
        label: fmtDateLabel(d),
        value: getValueForDay(d),
        prevValue: getPrevValueForDay ? getPrevValueForDay(d) : 0,
      }));
    }

    if (bucketMode === "monthly") {
      const monthBuckets = {};
      daysList.forEach(d => {
        const key = d.slice(0, 7); // "2025-03"
        if (!monthBuckets[key]) {
          const q = getQuarter(d);
          monthBuckets[key] = { date: d, label: `${getMonthLabel(d)} (${q})`, value: 0, prevValue: 0 };
        }
        monthBuckets[key].value += getValueForDay(d);
        if (getPrevValueForDay) monthBuckets[key].prevValue += getPrevValueForDay(d);
      });
      return Object.values(monthBuckets);
    }

    // weekly
    const weekBuckets = [];
    for (let i = 0; i < daysList.length; i += 7) {
      const chunk = daysList.slice(i, i + 7);
      const first = chunk[0], last = chunk[chunk.length - 1];
      const q = getQuarter(first);
      const label = chunk.length >= 5
        ? `${getMonthLabel(first)} ${new Date(first + "T00:00:00").getDate()}–${new Date(last + "T00:00:00").getDate()} (${q})`
        : `${fmtDateLabel(first)} (${q})`;
      weekBuckets.push({
        date: first,
        label,
        value: chunk.reduce((sum, d) => sum + getValueForDay(d), 0),
        prevValue: getPrevValueForDay ? chunk.reduce((sum, d) => sum + getPrevValueForDay(d), 0) : 0,
      });
    }
    return weekBuckets;
  }, [bucketMode, fmtDateLabel]);

  const cashChartData = useMemo(() => {
    const daysList = [];
    let cur = dateFrom;
    while (cur <= dateTo) { daysList.push(cur); cur = addDays(cur, 1); }
    return bucketDays(
      daysList,
      (d) => cashBasisData.current.byDate?.[d] || 0,
      compareMode ? (d) => cashBasisData.previous.byDate?.[addDays(d, -days)] || 0 : null
    );
  }, [cashBasisData, dateFrom, dateTo, days, compareMode, bucketDays]);

  const accrualChartData = useMemo(() => {
    const daysList = accrualData.days;
    return bucketDays(
      daysList,
      (d) => accrualData.current.dayData[d]?.netRevenue || 0,
      compareMode ? (d) => {
        const idx = daysList.indexOf(d);
        const prevDay = accrualData.previous.days[idx];
        return prevDay ? (accrualData.previous.dayData[prevDay]?.netRevenue || 0) : 0;
      } : null
    );
  }, [accrualData, compareMode, bucketDays]);

  const categoryData = useMemo(() => {
    const cats = cashBasisData.current.byCategory;
    const total = cashBasisData.current.total;
    const colors = ["#14532D", "#84CC16", "#0D7A56", "#1A5EC4", "#C4720C", "#6366F1", "#C42B2B", "#059669"];
    return Object.entries(cats).map(([label, value], idx) => ({ label, value, percent: total > 0 ? (value / total) * 100 : 0, color: colors[idx % colors.length] })).sort((a, b) => b.value - a.value);
  }, [cashBasisData.current]);

  const bookingSourceData = useMemo(() => {
    const src = cashBasisData.current.bySource;
    const total = cashBasisData.current.total;
    return Object.entries(src).map(([label, value]) => ({ label: label === "online" ? "Online" : label === "phone" ? "Phone" : label === "walk-in" ? "Walk-In" : label, value, percent: total > 0 ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [cashBasisData.current]);

  const paymentMethodData = useMemo(() => {
    const methods = cashBasisData.current.byMethod;
    const total = Object.values(methods).reduce((s, v) => s + v, 0);
    return Object.entries(methods).map(([m, count]) => ({ label: m.charAt(0).toUpperCase() + m.slice(1), value: count, percent: total > 0 ? (count / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [cashBasisData.current]);

  // ══════════════════════════════════════════════════════════════════════════
  // INTERACTIVE BAR CHART (category breakdown with hover)
  // ══════════════════════════════════════════════════════════════════════════
  const InteractiveBarChart = ({ items, height = 220, onBarClick }) => {
    const [hoverIdx, setHoverIdx] = useState(null);
    if (!items || items.length === 0) return <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13 }}>No data</div>;

    const max = Math.max(...items.map(i => i.value), 1);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.slice(0, 8).map((item, idx) => (
          <div key={idx}
            style={{ cursor: "pointer", padding: "6px 0", transition: "all 0.2s", opacity: hoverIdx !== null && hoverIdx !== idx ? 0.5 : 1 }}
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => onBarClick?.(item)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.label}</span>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmt$(item.value)}</span>
                <span style={{ fontSize: 10, color: C.textMut, minWidth: 36, textAlign: "right" }}>{fmtPercent(item.percent)}</span>
              </div>
            </div>
            <div style={{ width: "100%", height: 20, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(item.value / max) * 100}%`,
                background: hoverIdx === idx ? `${item.color}dd` : item.color,
                borderRadius: 4,
                transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s",
              }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MINI DONUT CHART
  // ══════════════════════════════════════════════════════════════════════════
  const MiniDonut = ({ items, size = 110, id = "donut" }) => {
    const [hoverIdx, setHoverIdx] = useState(null);
    if (!items || items.length === 0) return null;
    const total = items.reduce((s, i) => s + i.value, 0);
    const colors = ["#14532D", "#84CC16", "#0D7A56", "#1A5EC4", "#C4720C"];
    const r = size / 2 - 8, ir = r * 0.6;
    let angle = -Math.PI / 2;

    const arcs = items.map((item, idx) => {
      const slice = (item.value / (total || 1)) * Math.PI * 2;
      const start = angle;
      angle += slice;
      const la = slice > Math.PI ? 1 : 0;
      const cx = size / 2, cy = size / 2;
      const path = `M ${cx + ir * Math.cos(start)} ${cy + ir * Math.sin(start)} L ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} A ${r} ${r} 0 ${la} 1 ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)} L ${cx + ir * Math.cos(angle)} ${cy + ir * Math.sin(angle)} A ${ir} ${ir} 0 ${la} 0 ${cx + ir * Math.cos(start)} ${cy + ir * Math.sin(start)} Z`;
      return { path, color: colors[idx % colors.length], item, pct: total > 0 ? ((item.value / total) * 100).toFixed(0) : "0" };
    });

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width={size} height={size} style={{ flexShrink: 0 }}>
          {arcs.map((a, i) => (
            <path key={i} d={a.path} fill={a.color} stroke="white" strokeWidth="2"
              opacity={hoverIdx !== null && hoverIdx !== i ? 0.4 : 1}
              style={{ transition: "opacity 0.15s", cursor: "pointer" }}
              onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {arcs.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, opacity: hoverIdx !== null && hoverIdx !== i ? 0.5 : 1, transition: "opacity 0.15s" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
              <span style={{ color: C.text, fontWeight: 500 }}>{a.item.label}</span>
              <span style={{ color: C.textMut, marginLeft: "auto" }}>{a.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ANIMATED KPI CARD
  // ══════════════════════════════════════════════════════════════════════════
  const KPI = ({ label, value, displayValue, trend, accentColor = C.pri, icon, delay = 0 }) => {
    const [animVal, setAnimVal] = useState(0);
    const numVal = typeof value === "number" ? value : 0;
    const isNumeric = typeof value === "number";

    useEffect(() => {
      if (!isNumeric) return;
      let start;
      const dur = 700;
      const animate = (ts) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setAnimVal(numVal * eased);
        if (p < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, [numVal, isNumeric]);

    return (
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "16px 18px",
        flex: "1 1 0",
        minWidth: 170,
        position: "relative",
        overflow: "hidden",
        transition: "all 0.25s ease",
        cursor: "default",
        animation: `rptFadeUp 0.5s ease both`,
        animationDelay: `${delay * 80}ms`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 6px 20px ${accentColor}18`; e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}40)` }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: C.textMut, marginBottom: 8 }}>{label}</div>
          {null /* icon removed — clean aesthetic */}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.1 }}>
          {displayValue || (isNumeric ? fmt$(animVal) : value)}
        </div>
        {trend !== undefined && trend !== 0 && (
          <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: trend >= 0 ? C.sucLt : C.danLt, color: trend >= 0 ? C.suc : C.dan, fontSize: 11, fontWeight: 600 }}>
            {trend >= 0 ? "↑" : "↓"} {fmtPercent(Math.abs(trend))}
            <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>vs prev</span>
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // COLLAPSIBLE SECTION
  // ══════════════════════════════════════════════════════════════════════════
  const CollapsibleSection = ({ title, open, onToggle, count, children }) => (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", transition: "all 0.3s" }}>
      <div onClick={onToggle} style={{
        padding: "14px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.bg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
          {count !== undefined && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: C.priLt, color: C.pri, fontWeight: 600 }}>{count}</span>}
        </div>
        <span style={{ fontSize: 14, color: C.textMut, transition: "transform 0.3s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
      </div>
      {open && <div style={{ padding: "0 20px 20px", animation: "rptFadeUp 0.3s ease" }}>{children}</div>}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RESERVATION DRAWER
  // ══════════════════════════════════════════════════════════════════════════
  const ReservationDrawer = ({ reservation, onClose }) => {
    if (!reservation) return null;
    const res = (data.reservations || []).find(r => r.id === reservation);
    const dog = res ? (data.dogs || []).find(d => d.id === res.dogId) : null;
    const client = res ? (data.clients || []).find(c => c.id === res.clientId) : null;
    const br = { ...DEF_PRICING.boardingRates, ...(data.pricing?.boardingRates || {}) };
    const nights = res ? countNights(res.checkIn, res.checkOut) : 0;
    const baseRate = res ? br[res.roomType] || 0 : 0;
    const baseTotal = baseRate * nights;
    let disc = 0;
    if (res?.discountType === "percent") disc = (baseTotal * (res.discountValue || 0)) / 100;
    else if (res?.discountType === "flat") disc = res.discountValue || 0;
    else if (res?.discountType === "coupon") disc = res.discountValue || 0;
    const net = baseTotal - disc;

    return ReactDOM.createPortal(
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
        <div style={{ width: 400, height: "100%", background: C.surface, boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", animation: "rptSlideIn 0.3s ease" }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Reservation Details</h3>
            <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: C.textMut, padding: 4 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {res && dog && client && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.textMut, marginBottom: 3 }}>Dog</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{dog.fields?.name}</div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.textMut, marginBottom: 3 }}>Client</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{client.fields?.first_name} {client.fields?.last_name}</div>
                  {client.fields?.phone && <div style={{ fontSize: 12, color: C.textSec }}>{client.fields.phone}</div>}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.textMut, marginBottom: 3 }}>Stay</div>
                  <div style={{ fontSize: 13, color: C.text }}>{res.roomType} · Room {res.room || "—"}</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{fmtDateLabel(res.checkIn)} → {fmtDateLabel(res.checkOut)} ({nights} nights)</div>
                </div>
                <div style={{ padding: 16, background: C.bg, borderRadius: 12, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.textMut, marginBottom: 12 }}>Pricing Waterfall</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: C.textSec }}>{nights} nights × {fmt$(baseRate)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt$(baseTotal)}</span>
                  </div>
                  {disc > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: C.dan }}>
                    <span style={{ fontSize: 13 }}>Discount ({res.discountType})</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>-{fmt$(disc)}</span>
                  </div>}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${C.border}`, fontWeight: 700, fontSize: 14 }}>
                    <span>Net Total</span><span>{fmt$(net)}</span>
                  </div>
                </div>
                <div style={{
                  display: "inline-block", padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: res.checkOut <= today ? C.bg : res.checkIn <= today ? C.sucLt : C.infoLt,
                  color: res.checkOut <= today ? C.textMut : res.checkIn <= today ? C.suc : C.info,
                }}>{res.checkOut <= today ? "Checked Out" : res.checkIn <= today ? "Active" : "Upcoming"}</div>
              </>
            )}
          </div>
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
            <button onClick={() => { if (res) nav("client-detail", { clientId: res.clientId }); onClose(); }} style={{ flex: 1, padding: "9px 14px", background: C.pri, color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>View Profile</button>
            <button onClick={onClose} style={{ flex: 1, padding: "9px 14px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Close</button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // NLP RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  // ─── MINI TABLE RENDERER (reused in NLPResults) ───
  const MiniTable = ({ title, columns, rows }) => (
    <div style={{ marginTop: 14 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 6 }}>{title}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
          {columns.map((col, i) => <th key={i} style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 }}>{col}</th>)}
        </tr></thead>
        <tbody>{rows.map((row, ri) => (
          <tr key={ri} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
            {row.map((cell, ci) => <td key={ci} style={{ padding: "5px 8px", color: C.text }}>{cell}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );

  // ─── FOLLOW-UP SUGGESTIONS RENDERER ───
  const FollowUpSuggestions = ({ suggestions }) => {
    if (!suggestions || suggestions.length === 0) return null;
    return (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.borderLight}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: 0.5 }}>Related</span>
        {suggestions.map((s, i) => (
          <button key={i} onClick={() => { setNlpQuery(s); processNLPQuery(s); }}
            style={{ padding: "4px 10px", background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 20, fontSize: 10, color: C.textSec, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = C.pri; e.currentTarget.style.color = "white"; e.currentTarget.style.borderColor = C.pri; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.textSec; e.currentTarget.style.borderColor = C.borderLight; }}
          >{s}</button>
        ))}
      </div>
    );
  };

  const NLPResults = () => {
    if (!nlpResults) return null;

    const headerBlock = (
      <div style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>{nlpResults.title}</h4>
        {nlpResults.subtitle && <p style={{ margin: "3px 0 0 0", fontSize: 11, color: C.textMut }}>{nlpResults.subtitle}</p>}
      </div>
    );

    if (nlpResults.type === "table") {
      return (
        <div style={{ background: C.surface, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16, animation: "rptFadeUp 0.4s ease" }}>
          {headerBlock}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {nlpResults.columns.map((col, i) => <th key={i} style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "right", fontWeight: 700, color: C.textMut, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{col}</th>)}
            </tr></thead>
            <tbody>{nlpResults.rows.map((row, ri) => (
              <tr key={ri} style={{
                borderBottom: `1px solid ${C.borderLight}`,
                background: nlpResults.highlight?.row === ri ? `${C.accLt}60` : "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg}
              onMouseLeave={e => e.currentTarget.style.background = nlpResults.highlight?.row === ri ? `${C.accLt}60` : "transparent"}>
                {row.map((cell, ci) => <td key={ci} style={{ padding: "8px 10px", color: C.text, textAlign: ci === 0 ? "left" : "right", fontWeight: ci === 0 ? 600 : 400 }}>{cell}</td>)}
              </tr>
            ))}</tbody>
          </table>
          <FollowUpSuggestions suggestions={nlpResults.followUps} />
        </div>
      );
    } else if (nlpResults.type === "summary") {
      return (
        <div style={{ background: C.surface, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16, animation: "rptFadeUp 0.4s ease" }}>
          {headerBlock}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            {nlpResults.items.map((item, i) => (
              <div key={i} style={{ padding: "10px 12px", background: C.bg, borderRadius: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.textMut, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: item.color || C.text }}>{item.value}</div>
              </div>
            ))}
          </div>
          {nlpResults.extra && <MiniTable {...nlpResults.extra} />}
          <FollowUpSuggestions suggestions={nlpResults.followUps} />
        </div>
      );
    } else {
      return (
        <div style={{ background: C.surface, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16, animation: "rptFadeUp 0.4s ease" }}>
          {headerBlock}
          <p style={{ margin: 0, color: C.textSec, fontSize: 12, lineHeight: 1.5 }}>{nlpResults.message}</p>
          <FollowUpSuggestions suggestions={nlpResults.followUps} />
        </div>
      );
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // TABLE HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  const handleCashSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }));
  };
  const handleAccrualSort = (key) => {
    setAccrualSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }));
  };

  const thStyle = { padding: "10px 10px", textAlign: "left", fontWeight: 700, color: C.textMut, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", whiteSpace: "nowrap" };
  const tdStyle = { padding: "10px 10px", color: C.text, fontSize: 12 };

  const itemsPerPage = 20;
  const startIdx = transactionPage * itemsPerPage;
  const pageItems = transactionsData.slice(startIdx, startIdx + itemsPerPage);
  const maxPages = Math.ceil(transactionsData.length / itemsPerPage);
  const cashTotalAmount = transactionsData.reduce((s, t) => s + t.amount, 0);

  const accrualTotalRetail = accrualReservationsData.reduce((s, r) => s + r.retailTotal, 0);
  const accrualTotalNet = accrualReservationsData.reduce((s, r) => s + r.netTotal, 0);

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER — Two-column: Cash Basis (left) | Accrual (right)
  // ══════════════════════════════════════════════════════════════════════════
  const sectionCard = { background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}`, marginBottom: 10 };
  const sectionTitle = { margin: "0 0 10px 0", fontSize: 12, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: 0.5 };

  return (
    <>
      <style>{`
        @keyframes rptFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rptSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes rptShimmer { from { background-position: -600px 0; } to { background-position: 600px 0; } }
      `}</style>

      <div style={{ margin: "0 auto", padding: "16px 20px" }}>
        {/* ─── HEADER ROW ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "'Outfit', sans-serif", color: C.text, lineHeight: 1.2 }}>Revenue Intelligence</h1>
            <p style={{ fontSize: 11, color: C.textMut, margin: "3px 0 0 0" }}>{fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)}{compareMode ? ` vs ${fmtDateLabel(prevFrom)} – ${fmtDateLabel(prevTo)}` : ""}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: C.bg, borderRadius: 8, padding: 2 }}>
              {["today", "week", "month", "quarter", "year", "custom"].map(range => (
                <button key={range} onClick={() => changeTimeRange(range)} style={{
                  padding: "5px 12px", borderRadius: 6, border: "none",
                  background: timeRange === range ? C.pri : "transparent",
                  color: timeRange === range ? "white" : C.textSec,
                  fontWeight: 600, fontSize: 11, cursor: "pointer", transition: "all 0.2s ease",
                }}>{range.charAt(0).toUpperCase() + range.slice(1)}</button>
              ))}
            </div>
            {timeRange === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setAnimEpoch(ep => ep + 1); }}
                  style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.surface, color: C.text }} />
                <span style={{ fontSize: 11, color: C.textMut }}>–</span>
                <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setAnimEpoch(ep => ep + 1); }}
                  style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.surface, color: C.text }} />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: C.textSec, fontWeight: 500 }}>Compare</span>
              <div onClick={() => setCompareMode(!compareMode)} style={{ width: 36, height: 20, borderRadius: 10, background: compareMode ? C.pri : C.border, transition: "background 0.2s", position: "relative", cursor: "pointer" }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: "white", position: "absolute", top: 2, left: compareMode ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
              </div>
            </div>
          </div>
        </div>

        {/* ─── NLP QUERY BAR ─── */}
        <div style={{ background: C.surface, borderRadius: 10, padding: "10px 14px", marginBottom: 16, border: `1px solid ${C.border}`, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Ask anything... 'Revenue by category', 'Top 10 clients', 'Occupancy rate'"
              value={nlpQuery} onChange={(e) => setNlpQuery(e.target.value)}
              onFocus={() => setShowNLPSuggestions(true)}
              onBlur={() => setTimeout(() => setShowNLPSuggestions(false), 200)}
              onKeyDown={(e) => { if (e.key === "Enter" && nlpQuery.trim()) { setShowNLPSuggestions(false); processNLPQuery(nlpQuery); } }}
              style={{ flex: 1, padding: "7px 10px", border: `1px solid ${C.borderLight}`, borderRadius: 6, fontSize: 12, background: C.bg, outline: "none" }} />
            {nlpLoading && <div style={{ width: 24, height: 24, borderRadius: 4, background: `linear-gradient(90deg, ${C.bg}, ${C.borderLight}, ${C.bg})`, backgroundSize: "600px", animation: "rptShimmer 1.5s infinite" }} />}
          </div>
          {showNLPSuggestions && !nlpQuery && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: "0 0 10px 10px", zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", maxHeight: 320, overflowY: "auto" }}>
              {["Revenue", "Clients", "Operations", "Analysis"].map(cat => {
                const items = nlpSuggestionsBank.filter(s => s.cat === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div style={{ padding: "6px 14px 2px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: C.textMut }}>{cat}</div>
                    {items.map((s, i) => (
                      <div key={i} onClick={() => { setNlpQuery(s.q); processNLPQuery(s.q); setShowNLPSuggestions(false); }}
                        style={{ padding: "7px 14px 7px 22px", fontSize: 12, cursor: "pointer", color: C.text, transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{s.q}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* NLP Results */}
        {nlpResults && <NLPResults />}

        {/* ═══════════════════════════════════════════════════════════════════
            TWO-COLUMN LAYOUT: Cash Basis (left) | Accrual (right)
            ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* ═══ LEFT COLUMN: CASH BASIS ═══ */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 12px", background: `${C.pri}08`, borderRadius: 8, borderLeft: `3px solid ${C.pri}` }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.pri }}>Cash Basis Revenue</h2>
            </div>

            {/* KPI CARDS — 2×2 grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <KPI label="Total Revenue" value={cashBasisData.current.total} trend={compareMode ? cashBasisData.trend : undefined} accentColor={C.pri} delay={0} />
              <KPI label="Avg Transaction" value={cashBasisData.current.avgTransaction} trend={compareMode ? cashBasisData.trendAvg : undefined} accentColor={C.acc} delay={1} />
              <KPI label="Transactions" value={cashBasisData.current.count} displayValue={String(cashBasisData.current.count)} accentColor={C.suc} delay={2} />
              <KPI label="Top Category" displayValue={categoryData.length > 0 ? categoryData[0].label : "—"} value={0} accentColor={C.info} delay={3} />
            </div>

            {/* Revenue Trend Chart */}
            <div style={sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={sectionTitle}>Cash Revenue Trend</h3>
                {compareMode && <span style={{ fontSize: 9, padding: "2px 6px", background: C.accLt, color: C.accDk, borderRadius: 4, fontWeight: 600 }}>vs prev</span>}
              </div>
              <InteractiveLineChart chartData={cashChartData} color={C.pri} showCompare={compareMode} height={210} id="rpt-cash" animationEpoch={animEpoch} />
            </div>

            {/* Category Breakdown */}
            <div style={sectionCard}>
              <h3 style={sectionTitle}>Revenue by Category</h3>
              <InteractiveBarChart items={categoryData} />
            </div>

            {/* Donuts side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={sectionCard}>
                <h4 style={{ ...sectionTitle, fontSize: 11 }}>Booking Source</h4>
                <MiniDonut items={bookingSourceData} size={90} id="rpt-src" />
              </div>
              <div style={sectionCard}>
                <h4 style={{ ...sectionTitle, fontSize: 11 }}>Payment Methods</h4>
                <MiniDonut items={paymentMethodData} size={90} id="rpt-pay" />
              </div>
            </div>

            {/* Transactions Table */}
            <CollapsibleSection title="Transactions" open={cashTableOpen} onToggle={() => setCashTableOpen(!cashTableOpen)} count={transactionsData.length}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <input type="text" placeholder="Search..." value={transactionSearch}
                  onChange={e => { setTransactionSearch(e.target.value); setTransactionPage(0); }}
                  style={{ flex: 1, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, background: C.bg }} />
                <button style={{ padding: "6px 12px", background: C.pri, color: "white", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 10, whiteSpace: "nowrap" }}>Export</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    <th style={thStyle} onClick={() => handleCashSort("date")}>Date {sortConfig.key === "date" ? (sortConfig.direction === "desc" ? "↓" : "↑") : ""}</th>
                    <th style={thStyle}>Client</th><th style={thStyle}>Dog</th>
                    <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleCashSort("amount")}>Amount {sortConfig.key === "amount" ? (sortConfig.direction === "desc" ? "↓" : "↑") : ""}</th>
                    <th style={thStyle}>Method</th>
                  </tr></thead>
                  <tbody>
                    {pageItems.map((t, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        onClick={() => setSelectedReservation(t.reservationId)}>
                        <td style={tdStyle}>{t.date}</td>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{t.clientName}</td>
                        <td style={tdStyle}>{t.dogName}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmt$(t.amount)}</td>
                        <td style={{ ...tdStyle, textTransform: "capitalize" }}>{t.method}</td>
                      </tr>
                    ))}
                    <tr style={{ background: C.bg, fontWeight: 700, borderTop: `2px solid ${C.border}` }}>
                      <td colSpan="3" style={{ ...tdStyle, textAlign: "right" }}>Total</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{fmt$(cashTotalAmount)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              {maxPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
                  <button onClick={() => setTransactionPage(Math.max(0, transactionPage - 1))} disabled={transactionPage === 0} style={{ padding: "5px 10px", border: `1px solid ${C.border}`, background: C.surface, borderRadius: 5, cursor: "pointer", fontSize: 11 }}>Prev</button>
                  <span style={{ padding: "5px 10px", color: C.textMut, fontSize: 11 }}>{transactionPage + 1}/{maxPages}</span>
                  <button onClick={() => setTransactionPage(Math.min(maxPages - 1, transactionPage + 1))} disabled={transactionPage >= maxPages - 1} style={{ padding: "5px 10px", border: `1px solid ${C.border}`, background: C.surface, borderRadius: 5, cursor: "pointer", fontSize: 11 }}>Next</button>
                </div>
              )}
            </CollapsibleSection>
          </div>

          {/* ═══ RIGHT COLUMN: ACCRUAL ═══ */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "8px 12px", background: `${C.acc}10`, borderRadius: 8, borderLeft: `3px solid ${C.acc}` }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.accDk }}>Accrual Revenue</h2>
            </div>

            {/* KPI CARDS — 2×2 grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <KPI label="Total Accrual" value={accrualData.current.totals.totalRevenue} trend={compareMode ? accrualData.revenueTrend : undefined} accentColor={C.pri} delay={0} />
              <KPI label="Occupancy" displayValue={fmtPercent(accrualData.occupancyRate)} value={0} accentColor={C.acc} delay={1} />
              <KPI label="RevPAR" value={accrualData.revPAR} accentColor={C.suc} delay={2} />
              <KPI label="Discounts" value={discountBreakdown.totalDiscounts} accentColor={C.dan} delay={3} />
            </div>

            {/* Accrual Revenue Trend Chart */}
            <div style={sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={sectionTitle}>Accrual Revenue Trend</h3>
                {compareMode && <span style={{ fontSize: 9, padding: "2px 6px", background: C.accLt, color: C.accDk, borderRadius: 4, fontWeight: 600 }}>vs prev</span>}
              </div>
              <InteractiveLineChart chartData={accrualChartData} color={C.acc} compareColor={C.pri} showCompare={compareMode} height={210} id="rpt-accrual" animationEpoch={animEpoch} />
            </div>

            {/* Revenue Composition */}
            <div style={sectionCard}>
              <h3 style={sectionTitle}>Revenue Composition</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Boarding", value: accrualData.current.totals.boardingRevenue, color: "#14532D" },
                  { label: "Daycare", value: accrualData.current.totals.daycareRevenue, color: "#84CC16" },
                  { label: "Add-Ons & Feeding", value: accrualData.current.totals.addOnRevenue + accrualData.current.totals.feedingRevenue + accrualData.current.totals.medicationRevenue, color: "#0D7A56" },
                  { label: "Discounts", value: -accrualData.current.totals.discounts, color: C.dan },
                ].filter(i => i.value !== 0).map((item, idx) => {
                  const maxComp = Math.max(accrualData.current.totals.boardingRevenue, 1);
                  return (
                    <div key={idx}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{item.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: item.value < 0 ? C.dan : C.text }}>{item.value < 0 ? "-" : ""}{fmt$(Math.abs(item.value))}</span>
                      </div>
                      <div style={{ width: "100%", height: 14, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min((Math.abs(item.value) / maxComp) * 100, 100)}%`, background: item.color, borderRadius: 3, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, padding: 10, background: C.priLt, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.pri }}>Net Revenue</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: C.pri }}>{fmt$(accrualData.current.totals.netRevenue)}</span>
              </div>
            </div>

            {/* Discount Transparency */}
            <div style={sectionCard}>
              <h3 style={sectionTitle}>Discount Transparency</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ padding: "8px 12px", background: C.bg, borderRadius: 8, flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: C.textMut, marginBottom: 2 }}>Gross</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmt$(discountBreakdown.grossRevenue)}</div>
                </div>
                <span style={{ fontSize: 14, color: C.textMut }}>→</span>
                <div style={{ padding: "8px 12px", background: C.danLt, borderRadius: 8, flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: C.dan, marginBottom: 2 }}>Discounts</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.dan }}>-{fmt$(discountBreakdown.totalDiscounts)}</div>
                </div>
                <span style={{ fontSize: 14, color: C.textMut }}>→</span>
                <div style={{ padding: "8px 12px", background: C.priLt, borderRadius: 8, flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: C.pri, marginBottom: 2 }}>Net</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.pri }}>{fmt$(discountBreakdown.grossRevenue - discountBreakdown.totalDiscounts)}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {[
                  { type: "None", count: discountBreakdown.byType.none, amount: 0 },
                  { type: "%", count: discountBreakdown.byType.percent, amount: discountBreakdown.byAmount.percent },
                  { type: "Flat", count: discountBreakdown.byType.flat, amount: discountBreakdown.byAmount.flat },
                  { type: "Coupon", count: discountBreakdown.byType.coupon, amount: discountBreakdown.byAmount.coupon },
                  { type: "Multi", count: discountBreakdown.byType.multidog, amount: discountBreakdown.byAmount.multidog },
                ].map((d, i) => (
                  <div key={i} style={{ padding: "8px 8px", background: C.bg, borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: C.textMut, marginBottom: 2 }}>{d.type}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{d.count}</div>
                    {d.amount > 0 && <div style={{ fontSize: 10, color: C.dan }}>-{fmt$(d.amount)}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Accrual Table */}
            <CollapsibleSection title="Reservations" open={accrualTableOpen} onToggle={() => setAccrualTableOpen(!accrualTableOpen)} count={accrualReservationsData.length}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    <th style={thStyle}>Dog</th><th style={thStyle}>Room</th>
                    <th style={thStyle} onClick={() => handleAccrualSort("checkIn")}>In {accrualSortConfig.key === "checkIn" ? (accrualSortConfig.direction === "desc" ? "↓" : "↑") : ""}</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Nts</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Retail</th>
                    <th style={thStyle}>Disc</th>
                    <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleAccrualSort("netTotal")}>Net {accrualSortConfig.key === "netTotal" ? (accrualSortConfig.direction === "desc" ? "↓" : "↑") : ""}</th>
                  </tr></thead>
                  <tbody>
                    {accrualReservationsData.map((r, i) => (
                      <tr key={i} style={{
                        borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", transition: "background 0.1s",
                        background: r.status === "active" ? `${C.sucLt}40` : r.status === "upcoming" ? `${C.infoLt}40` : "transparent",
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                      onClick={() => setSelectedReservation(r.reservationId)}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{r.dogName}</td>
                        <td style={tdStyle}>{r.roomType}</td>
                        <td style={{ ...tdStyle, fontSize: 10 }}>{r.checkIn}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{r.nights}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmt$(r.retailTotal)}</td>
                        <td style={{ ...tdStyle, color: r.discountAmount > 0 ? C.dan : C.textMut, fontSize: 10 }}>{r.discountType !== "none" ? r.discountType : "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: C.pri }}>{fmt$(r.netTotal)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: C.bg, fontWeight: 700, borderTop: `2px solid ${C.border}` }}>
                      <td colSpan="4" style={{ ...tdStyle, textAlign: "right" }}>Totals</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{fmt$(accrualTotalRetail)}</td>
                      <td />
                      <td style={{ ...tdStyle, textAlign: "right" }}>{fmt$(accrualTotalNet)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>

      {/* RESERVATION DRAWER */}
      {selectedReservation && (
        <ReservationDrawer reservation={selectedReservation} onClose={() => setSelectedReservation(null)} />
      )}
    </>
  );
}

import { renderAIFormattedText } from "./pos/lib/aiText";

import { K9LoadingAnimation } from "./pos/components/K9LoadingAnimation";

import { AIAssistantPage } from "./pos/pages/AIAssistantPage";

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
import { CommandBar } from "./pos/components/CommandBar";

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { data: rawData, loading, save, locationId, loadError, isEmpty } = useData(profile);
  // If no data yet in Supabase, initialize with DEMO data
  // SAFETY: Only initialize DEMO when Supabase CONFIRMS data is empty (isEmpty=true).
  // NEVER overwrite on load errors or null data from slow connections.
  // NOTE: Locations created via "Add Location" use {_initialized:true} to skip this.
  // Also fallback to DEMO when profile has no location_id (new user before claim completes)
  const rawOrDemo = rawData || (loading ? null : ((isEmpty || !profile?.location_id) ? DEMO : null));
  // Normalize: ensure all expected arrays/objects exist so new/empty locations don't crash on .filter()
  const data = rawOrDemo ? (() => {
    const merged = {
      reservations: [], clients: [], dogs: [], messages: [], teamMembers: [],
      packages: [], packageSales: [], agreements: [], dogTags: [],
      auditLog: [], closedDates: [], dailyOps: [], eodEntries: [],
      evaluations: [], onlineBookings: [], payments: [], requiredVaccines: [],
      attendanceRoster: [], attendanceEntries: [], attendanceAuditLog: [],
      roles: DEFAULT_ROLES,
      clientFields: DEF_CLIENT_FIELDS, dogFields: DEF_DOG_FIELDS,
      rooms: {},
      ...rawOrDemo,
    };
    // Ensure core tag definitions always exist (can't operate without them)
    if (!merged.dogTags || merged.dogTags.length === 0) merged.dogTags = DEF_DOG_TAGS;
    // Migrate old boolean required → requiredFor matrix
    merged.clientFields = migrateFieldsToMatrix(merged.clientFields, DEF_CLIENT_FIELDS);
    merged.dogFields = migrateFieldsToMatrix(merged.dogFields, DEF_DOG_FIELDS);
    return merged;
  })() : null;
  useEffect(() => {
    if (!loading && !rawData && locationId && isEmpty && !loadError) {
      console.log('[K9] Initializing new location with demo data');
      save(DEMO);
    }
  }, [loading, rawData, locationId, isEmpty, loadError]);
  // Auto-initialize new locations that have {_initialized:true} but no real config
  useEffect(() => {
    if (rawData && rawData._initialized && !rawData.dogTags && !rawData.rooms) {
      console.log('[K9] Seeding new location with structural defaults');
      save({ ...NEW_LOCATION_DEFAULTS, ...rawData });
    }
  }, [rawData?._initialized, rawData?.dogTags]);
  // Auto-initialize roles system for existing data that predates the permissions feature
  useEffect(() => { if (data && !data.roles) { save({ ...data, roles: DEFAULT_ROLES }); } }, [data?.roles]);

  // ═══ Auto-migration: convert legacy pricing.addOns into addOnRules ═══
  useEffect(() => {
    if (!data || data.addOnRules) return; // already migrated
    const legacyAddOns = { ...DEF_PRICING.addOns, ...((data.pricing || {}).addOns || {}) };
    const rules = Object.entries(legacyAddOns).map(([name, price]) => ({
      id: gid(), name, price: Number(price) || 0, serviceTypes: [], tagIds: [], autoApply: false,
    }));
    if (rules.length > 0) {
      console.log('[K9] Migrating legacy add-ons to addOnRules:', rules.length);
      save({ ...data, addOnRules: rules });
    }
  }, [data?.addOnRules]);

  // ═══ Auto-migration: ensure every dog has exactly ONE tag + proper eval/reservation support ═══
  // Classified dogs (LP/SP/PP) MUST have: a locked eval form + at least one prior reservation.
  // Eval dogs MUST NOT have eval forms or prior completed stays.
  const [migrationRan, setMigrationRan] = useState(false);
  useEffect(() => {
    if (!data || !data.dogs || data.dogs.length === 0 || migrationRan) return;
    const VALID = new Set(["tag_eval", "tag_lp", "tag_sp", "tag_pp"]);
    const today = new Date().toISOString().slice(0, 10);
    const addDays = (base, n) => { const d = new Date(base + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };

    // Check: does ANY dog need fixing? (wrong tag count OR classified dog missing eval)
    const evalSet = new Set((data.evaluations || []).filter(e => e.locked).map(e => e.dogId));
    const needsFix = data.dogs.some(d => {
      const ct = (d.tags || []).filter(t => VALID.has(t));
      if (ct.length !== 1) return true; // wrong tag count
      const tag = ct[0];
      if (tag !== "tag_eval" && !evalSet.has(d.id)) return true; // classified but no eval
      return false;
    });
    if (!needsFix) return;
    setMigrationRan(true);
    console.log("[K9] Auto-migration: fixing tags + eval records for all dogs");

    let newEvals = [...(data.evaluations || [])];
    let newRes = [...(data.reservations || [])];
    let rIdx = newRes.length + 5000; // high offset to avoid ID collision

    const fixedDogs = data.dogs.map(d => {
      const ct = (d.tags || []).filter(t => VALID.has(t));
      const w = parseInt(d.fields?.weight) || 40;
      const hasPP = (d.tags || []).includes("tag_pp");

      // Determine the correct single tag
      let tag;
      if (ct.length === 1) {
        tag = ct[0]; // already has exactly one — keep it
      } else {
        // Assign based on weight; preserve PP if it was set
        if (hasPP) tag = "tag_pp";
        else if (w < 35) tag = "tag_sp";
        else tag = "tag_lp";
      }

      // For classified dogs (LP/SP/PP): ensure eval record + prior reservation exist
      if (tag !== "tag_eval") {
        const hasLockedEval = newEvals.some(e => e.dogId === d.id && e.locked);
        if (!hasLockedEval) {
          const evalDate = addDays(today, -(30 + Math.floor(Math.random() * 150)));
          const isPP = tag === "tag_pp";
          const evalResId = "r_mig_" + (rIdx++);
          // Create the evaluation reservation
          newRes.push({
            id: evalResId, clientId: d.clientId, dogId: d.id, type: "evaluation",
            evalResult: isPP ? "passed_private" : "passed_group",
            checkIn: evalDate, checkOut: evalDate,
            checkInTime: "10:00", checkOutTime: "11:00",
            status: "checked-out", notes: ""
          });
          // Create the locked evaluation form
          newEvals.push({
            id: "eval_mig_" + d.id, dogId: d.id, clientId: d.clientId,
            reservationId: evalResId, date: evalDate,
            evaluatorName: "Staff", evalType: "initial",
            hasExperience: !isPP, answers: {}, subtotals: {},
            totalScore: isPP ? 15 : 26, maxScore: 30,
            result: isPP ? "yellow" : "green",
            notes: isPP ? "Reactive with other dogs; private play recommended" : "Great in group play; social and friendly",
            locked: true, createdAt: new Date(evalDate + "T12:00:00").toISOString(),
          });
        }
        // Ensure at least one prior completed reservation exists
        const hasPrior = newRes.some(r => r.dogId === d.id && r.status === "checked-out" && r.type !== "evaluation");
        if (!hasPrior) {
          const stayDate = addDays(today, -(14 + Math.floor(Math.random() * 60)));
          const sm = w < 35;
          newRes.push({
            id: "r_mig_" + (rIdx++), clientId: d.clientId, dogId: d.id, type: "daycare",
            daycareSize: sm ? "small" : "large", checkIn: stayDate, checkOut: stayDate,
            checkInTime: "07:00", checkOutTime: "17:00",
            status: "checked-out", notes: ""
          });
        }
      }

      return { ...d, tags: [tag] };
    });

    save({ ...data, dogs: fixedDogs, evaluations: newEvals, reservations: newRes });
  }, [data?.dogs?.length, migrationRan]);

  // ═══ Auto-migration: add lifecycle tracking to clients ═══
  const [lifecycleMigRan, setLifecycleMigRan] = useState(false);
  useEffect(() => {
    if (!data || !data.clients || data.clients.length === 0 || lifecycleMigRan) return;
    const needsMigration = data.clients.some(c => !c.lifecycle);
    if (!needsMigration) return;
    setLifecycleMigRan(true);
    console.log("[K9] Auto-migration: adding lifecycle structure to clients");
    const addDays = (base, n) => { const d = new Date((base || todayStr()) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
    const migratedClients = data.clients.map(c => {
      if (c.lifecycle && c.lifecycle.cold !== undefined && c.lifecycle.conversion?.source !== undefined) return c;
      const defaultFollowUp = addDays(c.createdAt, 1);
      const conv = c.lifecycle?.conversion || {};
      const ret = c.lifecycle?.retention || {};
      return {
        ...c,
        lifecycle: {
          conversion: { notes: conv.notes || "", followUpDate: conv.followUpDate || defaultFollowUp, updates: conv.updates || [], source: conv.source || "", sourceDate: conv.sourceDate || "", sourceReservationId: conv.sourceReservationId || "" },
          retention: { notes: ret.notes || "", followUpDate: ret.followUpDate || "", updates: ret.updates || [] },
          cold: c.lifecycle?.cold ?? false,
          coldDate: c.lifecycle?.coldDate ?? "",
          coldFrom: c.lifecycle?.coldFrom ?? "",
        },
        lifecycleEvents: c.lifecycleEvents || [{ event: "created", date: (c.createdAt || todayStr()).slice(0, 10), details: "Client record created" }],
      };
    });
    save({ ...data, clients: migratedClients });
  }, [data?.clients?.length, lifecycleMigRan]);

  // ═══ Auto-migration: rename old Blue Buffalo food types ═══
  const [bbMigRan, setBbMigRan] = useState(false);
  useEffect(() => {
    if (!data || bbMigRan) return;
    const OLD_TO_NEW = { "Blue Buffalo Chicken": "Blue Buffalo GI Vet-Grade (Chicken)", "Blue Buffalo Salmon": "Blue Buffalo HF Vet-Grade (Salmon)" };
    const renameFT = (v) => OLD_TO_NEW[v] || v;
    // Check if migration needed
    const hasOldOpts = (data.foodTypeOptions || []).some(f => OLD_TO_NEW[f]);
    const hasOldDogFeeds = (data.dogs || []).some(d => (d.fields?.feedingSchedules || []).some(s => OLD_TO_NEW[s.foodType]));
    const hasOldResFeeds = (data.reservations || []).some(r => (r.careOverrides?.feedingSchedules || []).some(s => OLD_TO_NEW[s.foodType]));
    const hasOldPricing = data.pricing?.addOns && (OLD_TO_NEW["Blue Buffalo Chicken"] in (data.pricing?.addOns || {}) || OLD_TO_NEW["Blue Buffalo Salmon"] in (data.pricing?.addOns || {}));
    if (!hasOldOpts && !hasOldDogFeeds && !hasOldResFeeds) return;
    setBbMigRan(true);
    console.log("[K9] Auto-migration: renaming Blue Buffalo food types");
    const migrated = { ...data };
    if (hasOldOpts) migrated.foodTypeOptions = (data.foodTypeOptions || []).map(renameFT);
    if (hasOldDogFeeds) migrated.dogs = data.dogs.map(d => ({
      ...d, fields: { ...d.fields, feedingSchedules: (d.fields?.feedingSchedules || []).map(s => s.foodType && OLD_TO_NEW[s.foodType] ? { ...s, foodType: renameFT(s.foodType) } : s) }
    }));
    if (hasOldResFeeds) migrated.reservations = (data.reservations || []).map(r => r.careOverrides?.feedingSchedules?.some(s => OLD_TO_NEW[s.foodType]) ? {
      ...r, careOverrides: { ...r.careOverrides, feedingSchedules: r.careOverrides.feedingSchedules.map(s => s.foodType && OLD_TO_NEW[s.foodType] ? { ...s, foodType: renameFT(s.foodType) } : s) }
    } : r);
    save(migrated);
  }, [data?.foodTypeOptions, data?.dogs?.length, bbMigRan]);

  // ═══ Dynamic Locations (loaded from Supabase) ═══
  const [dbLocations, setDbLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    try {
      const { data: locs, error } = await supabase.rpc('list_locations');
      if (!error && locs) {
        setDbLocations(Array.isArray(locs) ? locs : []);
      }
    } catch (e) {
      console.log('[K9] list_locations RPC not available:', e.message);
    }
    setLocationsLoading(false);
  }, []);

  useEffect(() => { if (profile) loadLocations(); }, [profile]);

  const allLocations = useMemo(() => [
    { id: "enterprise", name: "Enterprise", slug: "enterprise", isEnterprise: true },
    ...dbLocations.map(l => ({ id: l.id, name: l.name, slug: l.slug || l.id, region: l.region || "" })),
    { id: "lite", name: "K9 Operations Lite", slug: "lite", isLite: true },
  ], [dbLocations]);

  // ═══ URL-based routing state ═══
  const [currentLocation, setCurrentLocation] = useState(() => {
    try {
      const v = localStorage.getItem("k9_location");
      if (v) return v;
    } catch {}
    // Default new users to demo view (first non-enterprise location)
    return dbLocations.length > 0 ? dbLocations[0].id : "demo";
  });
  const initRoute = useMemo(() => parseUrl(window.location.pathname, null), []);
  const [page, setPage] = useState(() => initRoute.locSlug === "enterprise" ? initRoute.page : initRoute.page);
  const [params, setParams] = useState(() => initRoute.params);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountSwitchOpen, setAccountSwitchOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [switchLoading, setSwitchLoading] = useState(false);
  const [teamAccounts, setTeamAccounts] = useState([]);
  const [signInTime, setSignInTime] = useState(() => Date.now());
  const [lcFilterOpen, setLcFilterOpen] = useState(false);
  const [lcFilters, setLcFilters] = useState({});
  useEffect(() => { if (page !== "clients" && lcFilterOpen) setLcFilterOpen(false); }, [page, lcFilterOpen]);
  const [rptFilterOpen, setRptFilterOpen] = useState(false);
  const [rptFilters, setRptFilters] = useState({});
  useEffect(() => { if (page !== "reports") { setRptFilterOpen(false); setRptFilters({}); } }, [page]);
  // (navTooltip removed — auto-expand sidebar replaces it)
  const [rptActiveReport, setRptActiveReport] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch team accounts for quick-switch
  useEffect(() => {
    if (!profile?.location_id) return;
    supabase.from("profiles").select("id,full_name,email,role").eq("location_id", profile.location_id)
      .then(({ data: members }) => { if (members) setTeamAccounts(members.filter(m => m.id !== profile.id)); });
  }, [profile?.location_id, profile?.id]);

  // Auto-sign-out timer
  useEffect(() => {
    const sessionCfg = data?.sessionTimeout || {};
    if (!sessionCfg.enabled || !sessionCfg.hours) return;
    const ms = sessionCfg.hours * 60 * 60 * 1000;
    const timer = setInterval(() => {
      if (Date.now() - signInTime >= ms) {
        alert("Session expired — you've been signed in for " + sessionCfg.hours + " hour" + (sessionCfg.hours > 1 ? "s" : "") + ". Signing out for security.");
        signOut();
      }
    }, 30000); // check every 30s
    return () => clearInterval(timer);
  }, [data?.sessionTimeout?.enabled, data?.sessionTimeout?.hours, signInTime, signOut]);

  // FR.3: Employee login/usage audit logging — log sign-ins to audit_log
  const loginLoggedRef = useRef(false);
  useEffect(() => {
    if (!profile || !data || loginLoggedRef.current) return;
    loginLoggedRef.current = true;
    const entry = {
      id: gid(),
      location_id: profile.location_id,
      reservation_id: null,
      timestamp: new Date().toISOString(),
      user_name: profile.full_name || profile.email || "Unknown",
      changed_by: profile.full_name || profile.email || "Unknown",
      action: "Employee Sign-In",
      details: JSON.stringify([
        { field: "User", oldVal: "—", newVal: profile.full_name || profile.email },
        { field: "Role", oldVal: "—", newVal: profile.role || "staff" },
        { field: "Method", oldVal: "—", newVal: "Password" },
      ]),
    };
    supabase.from("audit_log").insert(entry).then(() => {});
  }, [profile, data]);

  // Handle account switch
  const handleAccountSwitch = async () => {
    if (!switchTarget || !switchPassword) return;
    setSwitchLoading(true);
    setSwitchError("");
    const { error } = await supabase.auth.signInWithPassword({ email: switchTarget.email, password: switchPassword });
    setSwitchLoading(false);
    if (error) { setSwitchError("Invalid password. Please try again."); return; }
    // FR.3: Log account switch
    supabase.from("audit_log").insert({
      id: gid(), location_id: profile?.location_id, reservation_id: null,
      timestamp: new Date().toISOString(),
      user_name: switchTarget.full_name || switchTarget.email,
      changed_by: profile?.full_name || profile?.email || "Unknown",
      action: "Account Switch",
      details: JSON.stringify([
        { field: "From", oldVal: profile?.full_name || profile?.email, newVal: switchTarget.full_name || switchTarget.email },
        { field: "Role", oldVal: profile?.role, newVal: switchTarget.role || "staff" },
      ]),
    }).then(() => {});
    loginLoggedRef.current = false; // reset so new session gets logged
    setSwitchTarget(null); setSwitchPassword(""); setAccountSwitchOpen(false); setSignInTime(Date.now());
  };

  const [navStack, setNavStack] = useState([{ page: initRoute.page, params: initRoute.params }]);
  const skipUrlPush = useRef(false);
  const isEnterprise = currentLocation === "enterprise";
  const locSlug = useMemo(() => {
    const loc = allLocations.find(l => l.id === currentLocation);
    return loc ? loc.slug : (allLocations[1]?.slug || "demo");
  }, [currentLocation, allLocations]);
  const currentLoc = useMemo(() => allLocations.find(l => !l.isEnterprise && l.id === currentLocation) || null, [allLocations, currentLocation]);

  // Set initial location from URL on mount
  useEffect(() => {
    const parsed = parseUrl(window.location.pathname, data);
    const locMatch = allLocations.find(l => l.slug === parsed.locSlug);
    if (locMatch && locMatch.id !== currentLocation) {
      setCurrentLocation(locMatch.id);
      try { localStorage.setItem("k9_location", locMatch.id); } catch {}
    }
    // Re-parse with data to resolve client/dog params
    if (data && parsed.page === "clients" && window.location.pathname.includes("/client/")) {
      const reParsed = parseUrl(window.location.pathname, data);
      if (reParsed.page !== "clients") { setPage(reParsed.page); setParams(reParsed.params); setNavStack([{ page: reParsed.page, params: reParsed.params }]); }
    }
  }, [data, allLocations]);

  // Sync URL when page/params/location change
  useEffect(() => {
    if (skipUrlPush.current) { skipUrlPush.current = false; return; }
    const url = buildUrl(locSlug, page, params, data);
    if (window.location.pathname !== url) window.history.pushState({ page, params, loc: currentLocation }, "", url);
  }, [page, params, locSlug]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = (e) => {
      skipUrlPush.current = true;
      const parsed = parseUrl(window.location.pathname, data);
      const locMatch = allLocations.find(l => l.slug === parsed.locSlug);
      if (locMatch) { setCurrentLocation(locMatch.id); try { localStorage.setItem("k9_location", locMatch.id); } catch {} }
      setPage(parsed.page); setParams(parsed.params);
      setNavStack([{ page: parsed.page, params: parsed.params }]);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [data, allLocations]);

  // Replace initial URL if at root
  useEffect(() => {
    if (window.location.pathname === POS_BASE || window.location.pathname === POS_BASE + "/") {
      window.history.replaceState({}, "", buildUrl(locSlug, page, params, data));
    }
  }, []);

  const handleLocationChange = useCallback(async (locId) => {
    setCurrentLocation(locId);
    try { localStorage.setItem("k9_location", locId); } catch {}
    const loc = allLocations.find(l => l.id === locId);
    const slug = loc ? loc.slug : locId;
    const selectedLoc = allLocations.find(l => l.id === locId);
    if (selectedLoc?.isLite) {
      window.location.href = "/";
      return;
    }
    if (locId === "enterprise") {
      setPage("enterprise-locations"); setParams({}); setNavStack([{ page: "enterprise-locations", params: {} }]);
      window.history.pushState({}, "", `${POS_BASE}/enterprise/locations`);
    } else {
      setPage("dashboard"); setParams({}); setNavStack([{ page: "dashboard", params: {} }]);
      window.history.pushState({}, "", `${POS_BASE}/${slug}/dashboard`);
      // Switch active location in Supabase so useData loads the right data
      try {
        const { data: result } = await supabase.rpc('switch_location', { p_location_id: locId });
        if (result?.success) await refreshProfile();
      } catch (e) {
        console.log('[K9] switch_location RPC not available:', e.message);
      }
    }
  }, [allLocations, refreshProfile]);

  const TOP_LEVEL_PAGES = useMemo(() => new Set(["dashboard","clients","reservations","messages","payments","reports","operations","eod","ops-opening","ops-forms","ops-closing","ai","settings","enterprise-locations","enterprise-operations"]), []);
  const nav = useCallback((pg, prms = {}) => {
    setPage(pg); setParams(prms); setMobileMenuOpen(false);
    if (TOP_LEVEL_PAGES.has(pg)) {
      setNavStack([{ page: pg, params: prms }]);
    } else {
      setNavStack(prev => {
        const idx = prev.findIndex(e => e.page === pg);
        if (idx >= 0) { const s = prev.slice(0, idx + 1); s[idx] = { page: pg, params: prms }; return s; }
        return [...prev, { page: pg, params: prms }];
      });
    }
  }, [TOP_LEVEL_PAGES]);

  // ═══ Time Travel (Developer Tool) ═══
  const isDevUser = hasPermission(profile, data, 'use_time_travel');
  const [timeTravelDate, setTimeTravelDate] = useState(() => {
    try { return sessionStorage.getItem("k9_timetravel") || ""; } catch { return ""; }
  });
  const [timeTravelOpen, setTimeTravelOpen] = useState(false);
  const updateTimeTravel = useCallback((dateStr) => {
    setTimeTravelDate(dateStr);
    window.__K9_TIME_TRAVEL__ = dateStr || null;
    try {
      if (dateStr) sessionStorage.setItem("k9_timetravel", dateStr);
      else sessionStorage.removeItem("k9_timetravel");
    } catch {}
  }, []);
  useEffect(() => {
    if (isDevUser && timeTravelDate) window.__K9_TIME_TRAVEL__ = timeTravelDate;
    return () => { window.__K9_TIME_TRAVEL__ = null; };
  }, []);

  // ═══ New Overlay ═══
  const [showNewOverlay, setShowNewOverlay] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const openNew = useCallback(() => setShowNewOverlay(true), []);

  // ═══ Global Toast ═══
  const [globalToasts, setGlobalToasts] = useState([]);
  const globalToastId = useRef(0);
  const addGlobalToast = useCallback((t) => {
    const id = ++globalToastId.current;
    const toast = { id, ...t };
    setGlobalToasts(prev => [...prev, toast]);
    setTimeout(() => setGlobalToasts(prev => prev.filter(x => x.id !== id)), 8000);
  }, []);
  const dismissGlobalToast = useCallback((id) => setGlobalToasts(prev => prev.filter(x => x.id !== id)), []);

  // ═══ Keyboard Shortcuts ═══
  // ═══ Global Cmd+K → Command Bar ═══
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const hkEnabled = ((data || {}).hotkeySettings || {}).enabled === true;
  const hkHints = ((data || {}).hotkeySettings || {}).showHints === true;
  const hkBindingsGlobal = { ...DEF_HOTKEY_BINDINGS, ...((data || {}).hotkeySettings || {}).bindings };
  useEffect(() => {
    const b = hkBindingsGlobal;
    const handler = (e) => {
      // Skip if typing in an input, textarea, select, or contenteditable
      const tag = (e.target.tagName || "").toLowerCase();
      const editable = e.target.isContentEditable;
      if (tag === "input" || tag === "textarea" || tag === "select" || editable) {
        if (e.key === "Escape") { e.target.blur(); return; }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!hkEnabled) return;

      // Number keys 1-9 → navigate to sidebar tabs
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const flatNav = ["dashboard","reservations","clients","messages","payments","ops-opening","eod","ai","settings"];
        if (num <= flatNav.length) { e.preventDefault(); nav(flatNav[num - 1]); return; }
      }

      const k = e.key.toLowerCase();
      if (k === b.dashboard) { e.preventDefault(); nav("dashboard"); }
      else if (k === b.lodging) { e.preventDefault(); nav("reservations"); }
      else if (k === b.clients) { e.preventDefault(); nav("clients"); }

      else if (k === b.newReservation) { e.preventDefault(); setShowNewOverlay(true); }
      else if (k === b.settings) { e.preventDefault(); nav("settings"); }
      else if (k === b.ai) { e.preventDefault(); nav("ai"); }
      else if (k === b.quickDaycare) { e.preventDefault(); const qdc = document.querySelector("[data-shortcut-quickdc]"); if (qdc) qdc.click(); else { nav("dashboard"); setTimeout(() => { const el = document.querySelector("[data-shortcut-quickdc]"); if (el) el.click(); }, 100); } }
      else if (k === b.search) {
          e.preventDefault();
          setTimeout(() => {
            const el = document.querySelector("[data-shortcut-search]") ||
              document.querySelector("input[placeholder*='Search']") ||
              document.querySelector("input[placeholder*='search']");
            if (el) { el.focus(); el.select(); }
          }, 50);
        }
      else if (k === "escape") { /* noop */ }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [nav, hkEnabled, JSON.stringify(hkBindingsGlobal)]);

  // ═══ Breadcrumb ═══
  const breadcrumbLabel = useCallback((pg, prms) => {
    switch(pg) {
      case "dashboard": return "Dashboard";
      case "clients": return "Clients";
      case "reservations": return "Reservations";

      case "messages": return "Messages";
      case "payments": return "Payments";
      case "operations": return "Operations";
      case "eod": return "End of Day";
      case "ai": return "AI Command";
      case "lms": return "Learning";
      case "reports": return "Reports";
      case "online-bookings": return "Online Bookings";
      case "settings": return "Settings";
      case "ops-opening": return "Opening";
      case "ops-fe": return "FE Checklist";
      case "ops-be": return "BE Checklist";
      case "ops-rooms": return "Room Cleaning & Setups";
      case "ops-pictures": return "Pictures";
      case "ops-pp": return "PP Checklist";
      case "ops-closing": return "Closing";
      case "ops-forms": return "Forms";
      case "client-detail": {
        const c = (data?.clients||[]).find(cl => cl.id === prms?.clientId);
        return c ? `${c.fields?.first_name||""} ${c.fields?.last_name||""}`.trim() || "Client" : "Client";
      }
      case "dog-detail": {
        const d = (data?.dogs||[]).find(dg => dg.id === prms?.dogId);
        return d?.fields?.name || "Dog";
      }
      case "new-client": return "New Client";
      case "new-dog": return "New Dog";
      case "new-reservation": return "New Reservation";
      case "unified-new": return "New Client & Reservation";
      case "evaluation-form": {
        const evRes = (data?.reservations||[]).find(r => r.id === prms?.reservationId);
        const evDog = evRes ? (data?.dogs||[]).find(d => d.id === evRes.dogId) : null;
        return evDog ? `Evaluate ${evDog.fields.name}` : "Evaluation Form";
      }
      case "management": return "Management";
      case "mgmt-attendance": return "Attendance Tracker";
      case "mgmt-audit-log": return "Audit Log";
      case "enterprise-locations": return "Location Management";
      case "enterprise-operations": return "Operations Oversight";
      case "enterprise-packages": return "Package Management";
      case "enterprise-management": return "Management";
      default: return pg;
    }
  }, [data]);

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,fontFamily:"'Outfit', sans-serif"}}><div style={{textAlign:"center"}}><K9Logo size={48}/><div style={{fontSize:14,fontWeight:600,color:C.pri,marginTop:12,letterSpacing:"0.05em",textTransform:"uppercase"}}>Loading...</div></div></div>;

  const opsChildren = [
    {id:"ops-opening",label:"Opening",sub:"opening"},
    {id:"ops-fe",label:"FE Checklist",sub:"fe"},
    {id:"ops-be",label:"BE Checklist",sub:"be"},
    {id:"ops-rooms",label:"Room Cleaning & Setups",sub:"room_cleaning"},
    {id:"ops-pictures",label:"Pictures",sub:"pictures"},
    {id:"ops-pp",label:"PP Checklist",sub:"pp"},
    {id:"ops-closing",label:"Closing",sub:"closing"},
  ];
  const locationNavSections = [
    { label:null, items:[
      { id:"dashboard",label:"Dashboard",icon:<I.Dashboard/>,hotkey:"1" },
      { id:"reservations",label:"Lodging Calendar",icon:<I.Calendar/>,hotkey:"2" },
      { id:"online-bookings",label:"Online Bookings",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
      { id:"clients",label:"Customer Lifecycle",icon:<I.Users/>,hotkey:"3" },
      { id:"messages",label:"Messages",icon:<I.MessageSquare/>,hotkey:"4" },
    ]},
    { label:null, items:[
      { id:"operations",label:"Operations",icon:<I.Clipboard/>,hotkey:"6" },
      { id:"lms",label:"Learning",icon:<I.GraduationCap/> },
    ]},
    { label:null, items:[
      { id:"ai",label:"AI Command",icon:<I.Sparkle/>,hotkey:"7" },
    ]},
    { label:null, items:[
      { id:"settings",label:"Settings",icon:<I.Settings/>,hotkey:"8" },
      { id:"reports",label:"Reports",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg> },
    ]},
  ];
  const enterpriseNavSections = [
    { label:null, items:[
      { id:"enterprise-locations",label:"Location Management",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> },
      { id:"enterprise-operations",label:"Operations Oversight",icon:<I.Clipboard/> },
      { id:"enterprise-packages",label:"Package Management",icon:<I.ShoppingCart/> },
      { id:"enterprise-users",label:"User Management",icon:<I.Users/> },
      { id:"enterprise-management",label:"Management",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg> },
    ]},
  ];
  const navSections = isEnterprise ? enterpriseNavSections : locationNavSections;
  // Flat list for lookups
  const navItems = navSections.flatMap(s => s.items);
  const isOpsPage = page.startsWith("ops-");
  const isMgmtPage = page.startsWith("mgmt-") || page === "management";
  const isSettingsSubPage = page.startsWith("settings-");
  const activeNav = isEnterprise ? page : isOpsPage||page==="eod"||page==="operations"||isMgmtPage?"operations":isSettingsSubPage||page==="settings"?"settings":["dashboard","clients","reservations","online-bookings","messages","reports","ai","lms"].includes(page)?page:["client-detail","new-client","dog-detail","new-dog","questionnaire"].includes(page)?"clients":["new-reservation","unified-new"].includes(page)?"reservations":page==="evaluation-form"?"dashboard":"dashboard";

  function renderPage() {
    // Enterprise pages — gated to owner/enterprise_admin
    const isEnterpriseRole = profile?.role === 'owner' || profile?.role === 'enterprise_admin';
    const entDenied = <div style={{padding:"60px 40px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>🔒</div><div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>Access Restricted</div><div style={{fontSize:14,color:C.textSec}}>Enterprise features are only available to owners and enterprise admins.</div></div>;
    if (page === "enterprise-locations") return isEnterpriseRole ? <EnterpriseLocationsPage data={data} save={save} nav={nav} profile={profile} handleLocationChange={handleLocationChange} addGlobalToast={addGlobalToast} allLocations={allLocations} refreshLocations={loadLocations}/> : entDenied;
    if (page === "enterprise-operations") return isEnterpriseRole ? <EnterpriseOperationsPage data={data} save={save} nav={nav} profile={profile} handleLocationChange={handleLocationChange} allLocations={allLocations}/> : entDenied;
    if (page === "enterprise-packages") return isEnterpriseRole ? <EnterprisePackagesPage data={data} save={save} allLocations={allLocations}/> : entDenied;
    if (page === "enterprise-users") return isEnterpriseRole ? <EnterpriseUsersPage profile={profile} allLocations={allLocations}/> : entDenied;
    if (page === "enterprise-management") return isEnterpriseRole ? <EnterpriseManagementPage data={data} save={save} nav={nav} profile={profile} allLocations={allLocations}/> : entDenied;
    if (isOpsPage) {
      const oc = opsChildren.find(c => c.id === page);
      return <DailyOpsPage data={data} save={save} sub={oc ? oc.sub : "opening"} nav={nav} profile={profile}/>;
    }
    // Permission-gated routing
    const hp = (k) => hasPermission(profile, data, k);
    const denied = <div style={{padding:"60px 40px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>🔒</div><div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>Access Restricted</div><div style={{fontSize:14,color:C.textSec}}>You don't have permission to view this page. Contact your admin to update your role.</div></div>;
    if (page === "management") return (hp("view_management") || hp("view_daily_ops")) ? <ManagementHub data={data} save={save} nav={nav} profile={profile}/> : denied;
    if (page === "mgmt-attendance") return (hp("view_management") || hp("view_daily_ops")) ? <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile}/> : denied;
    if (page === "mgmt-audit-log") return hp("view_audit_log") ? <AuditLogPage data={data} nav={nav} profile={profile}/> : denied;
    switch(page) {
      case "operations": return <OperationsHub data={data} save={save} nav={nav} profile={profile}/>;
      case "dashboard": return <DashboardPage data={data} save={save} nav={nav} onNew={openNew} profile={profile}/>;
      case "clients": return hp("view_clients") ? <ClientsPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} lcFilters={lcFilters} setLcFilters={setLcFilters} setLcFilterOpen={setLcFilterOpen} locationSlug={currentLoc?.slug}/> : denied;
      case "client-detail": return hp("view_client_detail") ? <ClientDetailPage data={data} save={save} clientId={params.clientId} nav={nav} profile={profile} openReservationId={params.openReservation}/> : denied;
      case "new-client": return hp("create_client") ? <NewClientPage data={data} save={save} nav={nav} prefill={params.prefill} addGlobalToast={addGlobalToast}/> : denied;
      case "dog-detail": return hp("view_dog_detail") ? <DogDetailPage data={data} save={save} clientId={params.clientId} dogId={params.dogId} nav={nav} profile={profile}/> : denied;
      case "questionnaire": return hp("view_dog_detail") ? <QuestionnaireViewer data={data} save={save} clientId={params.clientId} dogId={params.dogId} nav={nav}/> : denied;
      case "new-dog": return hp("create_dog") ? <NewDogPage data={data} save={save} clientId={params.clientId} nav={nav}/> : denied;
      case "reservations": return hp("view_calendar") ? <LodgingCalendarPage data={data} save={save} nav={nav} onNew={openNew} profile={profile}/> : denied;
      case "online-bookings": return <OnlineBookingsPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} allLocations={allLocations}/>;
      case "new-reservation": return hp("create_reservation") ? <NewReservationPage data={data} save={save} preClientId={params.clientId} nav={nav} profile={profile} addGlobalToast={addGlobalToast}/> : denied;
      case "unified-new": return <UnifiedNewPage data={data} save={save} nav={nav} prefill={params.prefill} profile={profile} addGlobalToast={addGlobalToast}/>;
      case "evaluation-form": return <EvaluationFormPage data={data} save={save} reservationId={params.reservationId} nav={nav} profile={profile}/>;
      case "eod": return hp("view_eod") ? <EODPage data={data} save={save} nav={nav} profile={profile}/> : denied;

      case "messages": return hp("view_messages") ? <MessagesPage data={data} save={save} nav={nav} profile={profile}/> : denied;
      case "payments": return hp("view_payments") ? <PaymentsPage data={data} save={save} nav={nav} profile={profile}/> : denied;
      case "reports": return hp("view_payments") ? <ReportsPage data={data} save={save} nav={nav} profile={profile} rptFilterOpen={rptFilterOpen} setRptFilterOpen={setRptFilterOpen} rptFilters={rptFilters} setRptFilters={setRptFilters} onActiveReportChange={setRptActiveReport}/> : denied;
      case "ai": return hp("use_ai") ? <AIAssistantPage data={data} save={save} nav={nav} profile={profile}/> : denied;
      case "lms": return <LMSPage data={data} save={save} nav={nav} profile={profile}/>;
      case "settings": return hp("view_settings") ? <SettingsPage data={data} save={save} profile={profile} nav={nav} locationSlug={locSlug} addGlobalToast={addGlobalToast}/> : denied;
      default:
        if (isSettingsSubPage) {
          const subTab = page.replace("settings-", "");
          return hp("view_settings") ? <SettingsPage data={data} save={save} profile={profile} nav={nav} settingsTab={subTab} locationSlug={locSlug} addGlobalToast={addGlobalToast}/> : denied;
        }
        return <DashboardPage data={data} save={save} nav={nav} onNew={openNew} profile={profile}/>;
    }
  }

  return (
    <ErrorBoundary>
    <div style={{display:"flex",height: isDevUser && timeTravelDate ? "calc(100vh - 32px)" : "100vh",marginTop: isDevUser && timeTravelDate ? 32 : 0,fontFamily:"'Outfit', -apple-system, sans-serif",background:C.bg,overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-thumb{background:#C4C8D0;border-radius:3px;} ::-webkit-scrollbar-track{background:transparent;}
        input:focus,select:focus,textarea:focus{border-color:${C.pri}!important;box-shadow:0 0 0 3px rgba(20,83,45,0.08);}
        input.no-focus-ring:focus{border-color:transparent!important;box-shadow:none!important;outline:none!important;}
        @media(max-width:900px){.sidebar-d{display:none!important;}.mob-h{display:flex!important;}.main-content{padding:20px 16px!important;padding-top:72px!important;}}
        @media(min-width:901px){.mob-h{display:none!important;}.mob-ov{display:none!important;}}
        h1,h2,h3,h4,h5,h6,.brand-headline{font-family:'Outfit', sans-serif !important;font-weight:700;}
        @keyframes k9toast{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes k9overlay{from{opacity:0;transform:translateY(-16px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        .nav-tip{position:relative;} .nav-tip::after{content:attr(data-tip);position:absolute;left:calc(100% + 12px);top:50%;transform:translateY(-50%);background:#1a2940;color:#fff;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);} .nav-tip:hover::after{opacity:1;}
      `}</style>

      {/* Sidebar Desktop — always collapsed, expands on hover */}
      {(() => {
        const filterMode = (lcFilterOpen && page === "clients") || (rptFilterOpen && page === "reports");
        const sbExpanded = filterMode || sidebarOpen;
        return (
      <div className="sidebar-d"
        onMouseEnter={()=>{if(!filterMode)setSidebarOpen(true);}}
        onMouseLeave={()=>{if(!filterMode)setSidebarOpen(false);}}
        style={{width:filterMode?240:(sbExpanded?240:68),background:filterMode?C.surface:`linear-gradient(180deg, ${C.pri} 0%, #0D3B1E 100%)`,display:"flex",flexDirection:"column",transition:"width 0.15s cubic-bezier(0.4,0,0.2,1), background 0.15s ease",overflow:"hidden",flexShrink:0,borderRight:filterMode?`1px solid ${C.border}`:"none",zIndex:50}}>
        {filterMode ? (
          page === "clients" ? <LifecycleFilterPanel filters={lcFilters} onChange={setLcFilters} onClose={() => setLcFilterOpen(false)} /> : <GenericFilterPanel fields={getFilterFieldsForReport(rptActiveReport)} filters={rptFilters} onChange={setRptFilters} onClose={() => setRptFilterOpen(false)} presets={getPresetsForReport(rptActiveReport)} />
        ) : (<>
        <div style={{padding:"22px 15px 18px",display:"flex",alignItems:"center",justifyContent:"flex-start",gap:12,height:40,boxSizing:"content-box"}}>
          <div style={{flexShrink:0,width:34,display:"flex",alignItems:"center",justifyContent:"center"}}>{sbExpanded ? <K9Logo size={38}/> : <K9LogoMini size={34}/>}</div>
          <div style={{overflow:"hidden",opacity:sbExpanded?1:0,transition:"opacity 0.1s",whiteSpace:"nowrap"}}><div style={{fontSize:16,fontWeight:700,color:C.acc,fontFamily:"'Outfit', sans-serif",letterSpacing:"0.02em"}}>K9 Operations</div><div style={{fontSize:10,color:"rgba(132,204,22,0.6)",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase"}}>Lite · KOL</div></div>
        </div>
        <div style={{margin:"0 16px 10px",height:1,background:"rgba(132,204,22,0.15)"}}/>
        <div style={{height:44,flexShrink:0,padding:"0 10px",marginBottom:10,display:"flex",alignItems:"center"}}>
          <LocationSelector currentLocation={currentLocation} onLocationChange={handleLocationChange} collapsed={!sbExpanded} allLocations={allLocations} profile={profile} />
        </div>
        <nav style={{flex:1,padding:"0 10px",overflowY:"auto"}}>
          {navSections.map((sec, si) => (
            <div key={si}>
              {sec.label && sbExpanded && <div style={{padding:"14px 14px 6px",fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(132,204,22,0.45)",userSelect:"none"}}>{sec.label}</div>}
              {!sec.label && si > 0 && <div style={{margin:"10px 14px",height:1,background:"rgba(132,204,22,0.12)"}}/>}
              {sec.items.filter(item => { const perm = NAV_PERM_MAP[item.id]; return !perm || hasPermission(profile, data, perm); }).map(item=>{const act=activeNav===item.id;
                return(<div key={item.id}>
                  <button onMouseEnter={e=>{if(!act)e.currentTarget.style.background="rgba(132,204,22,0.08)";}} onMouseLeave={e=>{if(!act)e.currentTarget.style.background="transparent";}} onClick={()=>nav(item.id)} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:item.indent?"8px 14px 8px 28px":"10px 14px",justifyContent:"flex-start",border:"none",borderRadius:10,background:act?"rgba(132,204,22,0.15)":"transparent",color:act?C.acc:"rgba(255,255,255,0.85)",fontSize:item.indent?12:13,fontWeight:act?600:500,cursor:"pointer",marginBottom:3,fontFamily:"inherit",transition:"background 0.12s, color 0.12s",whiteSpace:"nowrap",position:"relative",boxSizing:"border-box"}}>
                    <span style={{flexShrink:0,width:20,display:"flex",alignItems:"center",justifyContent:"center"}}>{item.icon}</span>{sbExpanded&&<><span style={{flex:1,textAlign:"left",overflow:"hidden"}}>{item.label}{item.id==="messages"&&(()=>{const uc=(data?.messages||[]).filter(m=>m.direction==="inbound"&&!m.readAt).length;return uc>0?<span style={{marginLeft:6,background:C.acc,color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px",minWidth:18,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{uc}</span>:null;})()}</span>{item.hotkey&&hkHints&&<kbd style={{fontSize:9,fontWeight:600,color:"rgba(132,204,22,0.35)",background:"rgba(132,204,22,0.08)",border:"1px solid rgba(132,204,22,0.12)",borderRadius:4,padding:"1px 5px",fontFamily:"'Outfit',monospace",lineHeight:1.4,flexShrink:0}}>{item.hotkey}</kbd>}</>}
                  </button>
                </div>);
              })}
            </div>
          ))}
        </nav>
        <div style={{padding:"14px 10px",display:"flex",flexDirection:"column",gap:6,position:"relative"}}>
          {sbExpanded && (
            <div style={{position:"relative"}}>
              <button onClick={() => setAccountSwitchOpen(!accountSwitchOpen)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 8px",border:"none",borderRadius:8,background:accountSwitchOpen ? "rgba(132,204,22,0.15)" : "transparent",color:"rgba(132,204,22,0.6)",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,textAlign:"left",transition:"background 0.15s"}}>
                <div style={{width:26,height:26,borderRadius:13,background:"rgba(132,204,22,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:800,color:C.acc}}>{(profile?.full_name || profile?.email || "?")[0].toUpperCase()}</span>
                </div>
                <div style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"rgba(132,204,22,0.55)",fontSize:11}}>{profile?.full_name || profile?.email}</div>
                <span style={{fontSize:8,color:"rgba(132,204,22,0.3)",transform:accountSwitchOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.15s"}}>&#9650;</span>
              </button>

              {/* Quick-switch dropdown */}
              {accountSwitchOpen && (
                <div style={{position:"absolute",bottom:"100%",left:0,right:0,marginBottom:6,background:"#0D3B1E",border:"1px solid rgba(132,204,22,0.2)",borderRadius:10,boxShadow:"0 -8px 32px rgba(0,0,0,0.4)",overflow:"hidden",zIndex:200,maxHeight:280,overflowY:"auto"}}>
                  <div style={{padding:"10px 12px 6px",fontSize:9,fontWeight:700,color:"rgba(132,204,22,0.35)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Switch Account</div>
                  {teamAccounts.length === 0 ? (
                    <div style={{padding:"12px",fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center",fontStyle:"italic"}}>No other accounts at this location</div>
                  ) : teamAccounts.map(acct => (
                    <button key={acct.id} onClick={() => { setSwitchTarget(acct); setSwitchPassword(""); setSwitchError(""); setAccountSwitchOpen(false); }}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"none",background:"transparent",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontFamily:"inherit",fontSize:12,textAlign:"left",transition:"background 0.1s"}}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(132,204,22,0.1)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{width:28,height:28,borderRadius:14,background:"rgba(132,204,22,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:12,fontWeight:800,color:C.acc}}>{(acct.full_name || acct.email || "?")[0].toUpperCase()}</span>
                      </div>
                      <div style={{flex:1,overflow:"hidden"}}>
                        <div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acct.full_name || acct.email}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acct.email}</div>
                      </div>
                      <div style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:"rgba(132,204,22,0.1)",color:"rgba(132,204,22,0.5)",fontWeight:600,textTransform:"uppercase"}}>{acct.role}</div>
                    </button>
                  ))}
                  <div style={{borderTop:"1px solid rgba(132,204,22,0.1)",padding:"6px 12px"}}>
                    <button onClick={signOut} style={{width:"100%",padding:"8px",border:"none",borderRadius:6,background:"rgba(239,68,68,0.12)",color:"rgba(255,150,150,0.8)",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Sign Out</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!sbExpanded && <button onClick={signOut} style={{width:"100%",padding:"7px 14px",border:"none",borderRadius:8,background:"rgba(239,68,68,0.12)",color:"rgba(255,150,150,0.8)",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:500,textAlign:"center",boxSizing:"border-box"}}>⏻</button>}
          {sbExpanded && <div style={{textAlign:"center",fontSize:9,color:"rgba(255,255,255,0.5)",marginTop:4,lineHeight:1.4}}>&copy; 2026 K9 Operations LLC<br/>All Rights Reserved</div>}

          {/* Password prompt modal for account switch */}
          {switchTarget && ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>
              <div onClick={e => e.stopPropagation()} style={{background:C.surface,borderRadius:16,padding:28,width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:4}}>Switch Account</div>
                <div style={{fontSize:13,color:C.textSec,marginBottom:20}}>Enter password for <strong>{switchTarget.full_name || switchTarget.email}</strong></div>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:C.bg,borderRadius:10,marginBottom:16}}>
                  <div style={{width:32,height:32,borderRadius:16,background:C.priLt,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:14,fontWeight:800,color:C.pri}}>{(switchTarget.full_name || switchTarget.email || "?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:C.text}}>{switchTarget.full_name || "Team Member"}</div>
                    <div style={{fontSize:11,color:C.textMut}}>{switchTarget.email}</div>
                  </div>
                </div>
                <input type="password" value={switchPassword} onChange={e => setSwitchPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAccountSwitch()} placeholder="Password" autoFocus style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${switchError ? "#EF4444" : C.border}`,fontSize:14,fontFamily:"inherit",background:C.bg,color:C.text,boxSizing:"border-box",marginBottom:switchError ? 8 : 16}} />
                {switchError && <div style={{fontSize:12,color:"#EF4444",marginBottom:12,fontWeight:500}}>{switchError}</div>}
                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                  <Btn variant="secondary" onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>Cancel</Btn>
                  <Btn variant="primary" onClick={handleAccountSwitch} disabled={!switchPassword || switchLoading}>{switchLoading ? "Signing in..." : "Switch"}</Btn>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        </>)}
      </div>
        );
      })()}

      {/* Mobile Header */}
      <div className="mob-h" style={{display:"none",position:"fixed",top:0,left:0,right:0,height:56,background:C.pri,alignItems:"center",justifyContent:"space-between",padding:"0 16px",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><button onClick={()=>setMobileMenuOpen(!mobileMenuOpen)} style={{background:"none",border:"none",color:C.acc,cursor:"pointer",padding:4}}><I.Menu/></button><div><span style={{fontSize:16,fontWeight:700,color:C.acc,fontFamily:"'Outfit', sans-serif"}}>K9 Operations</span><div style={{fontSize:9,color:"rgba(132,204,22,0.6)",letterSpacing:"0.05em",textTransform:"uppercase"}}>{(allLocations.find(l=>l.id===currentLocation)||allLocations[1]||allLocations[0]).name}</div></div></div>
        <K9LogoMini size={28}/>
      </div>

      {mobileMenuOpen&&<div className="mob-ov" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200}} onClick={()=>setMobileMenuOpen(false)}><div onClick={e=>e.stopPropagation()} style={{width:260,height:"100%",background:`linear-gradient(180deg, ${C.pri} 0%, #0D3B1E 100%)`,padding:"24px 16px",overflowY:"auto"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><K9Logo size={38}/><div><div style={{fontSize:16,fontWeight:700,color:C.acc,fontFamily:"'Outfit', sans-serif"}}>K9 Operations</div><div style={{fontSize:10,color:"rgba(132,204,22,0.6)",letterSpacing:"0.08em",textTransform:"uppercase"}}>Lite · KOL</div></div></div><div style={{marginBottom:16}}><LocationSelector currentLocation={currentLocation} onLocationChange={handleLocationChange} collapsed={false} allLocations={allLocations} profile={profile} /></div>{navSections.map((sec,si)=>(<div key={si}>{sec.label&&<div style={{padding:"14px 14px 6px",fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(132,204,22,0.45)",userSelect:"none"}}>{sec.label}</div>}{!sec.label&&si>0&&<div style={{margin:"10px 14px",height:1,background:"rgba(132,204,22,0.12)"}}/>}{sec.items.map(item=>(<div key={item.id}><button onClick={()=>{nav(item.id);setMobileMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:item.indent?"10px 14px 10px 28px":"12px 14px",border:"none",borderRadius:10,background:activeNav===item.id?"rgba(132,204,22,0.15)":"transparent",color:activeNav===item.id?C.acc:"rgba(255,255,255,0.85)",fontSize:item.indent?13:14,fontWeight:activeNav===item.id?600:500,cursor:"pointer",marginBottom:4,fontFamily:"inherit"}}>{item.icon}<span style={{flex:1,textAlign:"left"}}>{item.label}</span></button></div>))}</div>))}</div></div>}

      {/* Main */}
      <div className="main-content" style={{flex:1,overflow:"auto",padding:"28px 32px",scrollbarGutter:"stable"}}>
        <div style={{maxWidth: 1440, margin:"0 auto"}}>
          {navStack.length > 1 && (
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13,flexWrap:"wrap"}}>
              {navStack.map((entry, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{color:C.border,fontSize:11,userSelect:"none"}}>›</span>}
                  {i < navStack.length - 1 ? (
                    <span onClick={() => { setPage(entry.page); setParams(entry.params); setNavStack(s => s.slice(0, i + 1)); const url = buildUrl(locSlug, entry.page, entry.params, data); if (window.location.pathname !== url) window.history.pushState({}, "", url); }}
                      style={{cursor:"pointer",color:C.pri,fontWeight:500,padding:"2px 6px",borderRadius:6,transition:"background 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.priLt}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {breadcrumbLabel(entry.page, entry.params)}
                    </span>
                  ) : (
                    <span style={{fontWeight:600,color:C.text,padding:"2px 6px"}}>{breadcrumbLabel(entry.page, entry.params)}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          <ErrorBoundary key={page}>{renderPage()}</ErrorBoundary>
        </div>
      </div>


      {/* ═══ Time Travel Banner ═══ */}
      {isDevUser && timeTravelDate && (
        <div style={{position:"fixed",top:0,left:0,right:0,height:32,background:"#DC2626",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,zIndex:10000,letterSpacing:0.5,fontFamily:"inherit"}}>
          ⚠ TIME TRAVEL ACTIVE — Simulating {(() => { try { const d = new Date(timeTravelDate + "T12:00:00"); return d.toLocaleDateString("en-US",{weekday:"short",month:"long",day:"numeric",year:"numeric"}); } catch { return timeTravelDate; } })()} (real: {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})})
          <button onClick={() => updateTimeTravel("")} style={{marginLeft:16,padding:"2px 10px",borderRadius:4,border:"1px solid rgba(255,255,255,0.5)",background:"transparent",color:"white",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Clear</button>
        </div>
      )}

      {/* ═══ Time Travel Toolbar ═══ */}
      {isDevUser && (
        <div style={{position:"fixed",bottom:24,left:24,zIndex:9998,fontFamily:"inherit"}}>
          {!timeTravelOpen ? (
            <button onClick={() => setTimeTravelOpen(true)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:24,border:timeTravelDate ? "2px solid #DC2626" : "1px solid #d1d5db",background:timeTravelDate ? "#FEF2F2" : "#fff",color:timeTravelDate ? "#DC2626" : "#374151",fontSize:12,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 12px rgba(0,0,0,0.12)",fontFamily:"inherit",transition:"all 0.2s"}}>
              <span style={{fontSize:16}}>🕐</span>
              {timeTravelDate ? `Simulating: ${timeTravelDate}` : "Time Travel"}
            </button>
          ) : (
            <div style={{width:320,background:"#fff",border:timeTravelDate ? "2px solid #DC2626" : "1px solid #d1d5db",borderRadius:16,padding:20,boxShadow:"0 12px 32px rgba(0,0,0,0.18)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>🕐</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#111"}}>Time Travel</span>
                  <span style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:"#EFF6FF",color:"#1D4ED8",fontWeight:600}}>DEV</span>
                </div>
                <button onClick={() => setTimeTravelOpen(false)} style={{width:24,height:24,borderRadius:12,border:"none",background:"#f3f4f6",cursor:"pointer",fontSize:14,fontWeight:700,color:"#6b7280",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>×</button>
              </div>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:10}}>Override the app's date for testing. DB writes still use real time.</div>
              <input type="date" value={timeTravelDate} onChange={e => updateTimeTravel(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}} />
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {[["Today",""],["+ 1d",1],["+ 7d",7],["+ 30d",30],["+ 90d",90]].map(([label,days]) => (
                  <button key={label} onClick={() => {
                    if (days === "") { updateTimeTravel(""); return; }
                    const d = new Date(); d.setDate(d.getDate() + days);
                    updateTimeTravel(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
                  }} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #e5e7eb",background:days === "" ? "#f3f4f6" : "#fff",fontSize:11,fontWeight:600,cursor:"pointer",color:days === "" ? "#DC2626" : "#374151",fontFamily:"inherit"}}>
                    {label}
                  </button>
                ))}
              </div>
              {timeTravelDate && (
                <div style={{padding:"8px 10px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",fontSize:11,color:"#DC2626",fontWeight:600,textAlign:"center"}}>
                  Active: {timeTravelDate} → {(() => { try { return new Date(timeTravelDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}); } catch { return timeTravelDate; } })()}
                </div>
              )}
              <div style={{fontSize:10,color:"#9ca3af",marginTop:8,textAlign:"center"}}>Real date: {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Global Toast ═══ */}
      {globalToasts.length > 0 && (
        <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:8,maxWidth:400}}>
          {globalToasts.map(t => {
            const tIcon = t.type === "error" ? I.AlertTriangle : t.type === "info" ? I.InfoCircle : I.Check;
            const tBg = t.type === "error" ? (C.danLt||"#fef2f2") : t.type === "info" ? (C.priLt||"#eff6ff") : (C.sucLt||"#e8f5e9");
            const tFg = t.type === "error" ? C.dan : t.type === "info" ? C.pri : C.suc;
            return (
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",animation:"k9toast 0.3s ease-out"}}>
              <div style={{width:28,height:28,borderRadius:14,background:tBg,color:tFg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{React.createElement(tIcon)}</div>
              <div style={{flex:1,fontSize:13,fontWeight:600,color:C.text}}>{t.message}</div>
              {t.actionLabel && <button onClick={()=>{t.onAction&&t.onAction();dismissGlobalToast(t.id);}} style={{padding:"6px 14px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.actionLabel}</button>}
              <button onClick={()=>dismissGlobalToast(t.id)} style={{width:22,height:22,borderRadius:11,border:"none",background:"transparent",cursor:"pointer",color:C.textMut,fontSize:15,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:0,fontFamily:"inherit"}}>&times;</button>
            </div>
            );
          })}
        </div>
      )}

      {/* ═══ Superhuman-style "New" Overlay ═══ */}
      {showNewOverlay && <NewOverlay data={data} nav={nav} onClose={() => setShowNewOverlay(false)} />}
      {commandBarOpen && <CommandBar data={data} profile={profile} isOpen={commandBarOpen} onClose={() => setCommandBarOpen(false)} nav={nav} allLocations={allLocations} onLocationChange={handleLocationChange} />}
    </div>
    </ErrorBoundary>
  );
}

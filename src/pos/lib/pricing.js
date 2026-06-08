import { DEF_PRICING } from "../constants/pricing";
import { addDays } from "./format";

// ─── Pricing Engine ──────────────────────────────────────────────────────────
const countNights = (ci, co) => {
  const a = new Date(ci + "T12:00:00"), b = new Date(co + "T12:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
};
const countHours = (tIn, tOut) => {
  if (!tIn || !tOut) return 8;
  const [h1,m1] = tIn.split(":").map(Number);
  const [h2,m2] = tOut.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
};

// Get add-on price map from addOnRules or legacy pricing
function getAddOnPrices(dataOrPricing, addOnRules) {
  if (addOnRules && addOnRules.length > 0) {
    return Object.fromEntries(addOnRules.map(r => [r.name, Number(r.price) || 0]));
  }
  const p = dataOrPricing || {};
  return { ...DEF_PRICING.addOns, ...(p.addOns || {}) };
}

function calcReservationPricing({ type, roomType, checkIn, checkOut, checkInTime, checkOutTime, daycareSize, dogs, dogProfiles, pricing, isSecondDogSameRoom, roomSegments, reservation, appliedCoupons, addOnRules, actualCheckInTime }) {
  const p = pricing || DEF_PRICING;
  const lines = [];
  let subtotal = 0;
  let discountTotal = 0;
  const totalCouponValue = appliedCoupons ? appliedCoupons.reduce((sum, c) => sum + (c.value || 0), 0) : 0;

  if (type === "boarding") {
    let roomLineTotal = 0;
    let baseRoomCost = 0; // Track room cost before discount for coupon comparison
    if (roomSegments && roomSegments.length > 0) {
      // Price each room segment separately
      roomSegments.forEach(seg => {
        const segNights = countNights(seg.startDate, seg.endDate);
        const segRate = (p.boardingRates || {})[seg.roomType] || 0;
        let segTotal = segNights * segRate;
        baseRoomCost += segTotal;
        // Apply multi-dog discount (20% off) ONLY if coupons don't cover this dog's charges
        // If coupons will cover the room cost, the discount becomes irrelevant
        if (isSecondDogSameRoom && p.multiDogDiscount > 0 && totalCouponValue < baseRoomCost) {
          const discountAmount = Math.round(segTotal * (p.multiDogDiscount / 100) * 100) / 100;
          segTotal -= discountAmount;
          roomLineTotal += discountAmount; // Track discount for line item
        }
        lines.push({ label: `${seg.roomType} × ${segNights} night${segNights !== 1 ? "s" : ""}`, rate: segRate, qty: segNights, total: segTotal, isMultiDogDiscounted: isSecondDogSameRoom && p.multiDogDiscount > 0 && totalCouponValue < baseRoomCost });
        subtotal += segTotal;
      });
    } else {
      const nights = countNights(checkIn, checkOut);
      const rate = (p.boardingRates || {})[roomType] || 0;
      let lineTotal = nights * rate;
      baseRoomCost = lineTotal;
      // Apply multi-dog discount (20% off) ONLY if coupons don't cover this dog's charges
      if (isSecondDogSameRoom && p.multiDogDiscount > 0 && totalCouponValue < baseRoomCost) {
        const discountAmount = Math.round(lineTotal * (p.multiDogDiscount / 100) * 100) / 100;
        lineTotal -= discountAmount;
        roomLineTotal = discountAmount; // Track discount for line item
      }
      lines.push({ label: `${roomType} × ${nights} night${nights !== 1 ? "s" : ""}`, rate, qty: nights, total: lineTotal, isMultiDogDiscounted: isSecondDogSameRoom && p.multiDogDiscount > 0 && totalCouponValue < baseRoomCost });
      subtotal += lineTotal;
    }
    // Only show explicit discount line if multi-dog discount was applied and significant
    if (isSecondDogSameRoom && p.multiDogDiscount > 0 && roomLineTotal > 0) {
      lines.push({ label: `Multi-dog discount (${p.multiDogDiscount}% off 2nd dog)`, total: -roomLineTotal, isDiscount: true });
      discountTotal += roomLineTotal;
    }
    // Private Play surcharge (prorated if tag changed mid-stay)
    const ppSurcharge = p.privatePlaySurcharge || 0;
    if (ppSurcharge > 0 && dogs && dogs.length > 0 && dogs[0] && (dogs[0].tags || []).includes("tag_pp")) {
      const totalNights = roomSegments && roomSegments.length > 0
        ? roomSegments.reduce((sum, seg) => sum + countNights(seg.startDate, seg.endDate), 0)
        : countNights(checkIn, checkOut);
      const ppStartDate = reservation?.privatePlayStartDate;
      let ppNights = totalNights;
      if (ppStartDate && ppStartDate > checkIn) {
        ppNights = countNights(ppStartDate, checkOut);
        if (ppNights < 0) ppNights = 0;
        if (ppNights > totalNights) ppNights = totalNights;
      }
      if (ppNights > 0) {
        const ppTotal = ppSurcharge * ppNights;
        const label = ppStartDate && ppStartDate > checkIn
          ? `Private Play surcharge ($${ppSurcharge}/night × ${ppNights} remaining)`
          : `Private Play surcharge ($${ppSurcharge}/night × ${ppNights})`;
        lines.push({ label, rate: ppSurcharge, qty: ppNights, total: ppTotal, isSurcharge: true });
        subtotal += ppTotal;
      }
    }
  } else if (type === "dayboarding") {
    const rate = p.dayboardingRate || ((p.daycareRates || {}).fullDay || 0) + 4;
    lines.push({ label: `Day Boarding — ${roomType}`, rate, qty: 1, total: rate });
    subtotal += rate;
  } else if (type === "daycare") {
    const threshold = p.halfDayThreshold || 5;
    let isHalf;
    if (actualCheckInTime) {
      const elapsedMins = (Date.now() - new Date(actualCheckInTime).getTime()) / 60000;
      isHalf = elapsedMins < threshold * 60;
    } else {
      const hrs = countHours(checkInTime, checkOutTime);
      isHalf = hrs < threshold;
    }
    const rate = isHalf ? (p.daycareRates || {}).halfDay || 0 : (p.daycareRates || {}).fullDay || 0;
    lines.push({ label: `Daycare — ${isHalf ? "Half" : "Full"} Day`, rate, qty: 1, total: rate });
    subtotal += rate;
  } else if (type === "evaluation") {
    const fee = p.evaluationFee || 0;
    lines.push({ label: "Evaluation", rate: fee, qty: 1, total: fee });
    subtotal += fee;
  } else if (type === "tour") {
    const fee = p.tourFee || 0;
    lines.push({ label: "Facility Tour", rate: fee, qty: 1, total: fee });
    subtotal += fee;
  }

  // Add-ons per dog
  if (dogs && dogs.length > 0) {
    const stayDays = type === "boarding" ? Math.max(1, countNights(checkIn, checkOut)) : 1;
    // Build day-by-day date range for feeding/med charge calculations
    const dayDates = [];
    if (checkIn && checkOut && type === "boarding") {
      let cur = checkIn;
      while (cur <= checkOut) { dayDates.push(cur); cur = addDays(cur, 1); }
    } else if (checkIn) {
      dayDates.push(checkIn);
    }
    const ciHour = checkInTime ? parseInt(checkInTime.split(":")[0]) : 9;
    const coHour = checkOutTime ? parseInt(checkOutTime.split(":")[0]) : 11;
    const ftp = p.foodTypePricing || {};
    const mp = p.medPricing || {};

    dogs.forEach(dog => {
      const profile = dogProfiles ? dogProfiles.find(d => d.id === dog.id) : null;
      const fields = profile ? profile.fields : (dog.fields || {});
      const dogName = fields.name || "Dog";
      // Bath — only priced when explicitly included via selectedAddOns on the reservation
      // (no longer auto-added from dog profile; bath add-ons are manual)
      // Feeding pricing — per serving with AM/PM skip logic
      const feeds = fields.feedingSchedules || [];
      if (feeds.length > 0 && dayDates.length > 0) {
        const feedDetail = []; // {date, am, noon, pm} for breakdown
        let totalServings = 0;
        let totalFeedCost = 0;
        const feedsByTime = { am: [], noon: [], pm: [] };
        feeds.forEach(f => {
          (f.times || []).forEach(t => {
            const tl = t.toLowerCase();
            if (tl.includes("am")) feedsByTime.am.push(f);
            else if (tl.includes("noon") || tl.includes("12")) feedsByTime.noon.push(f);
            else if (tl.includes("pm")) feedsByTime.pm.push(f);
          });
        });
        dayDates.forEach((d, di) => {
          const isFirst = di === 0;
          const isLast = di === dayDates.length - 1;
          const row = { date: d, am: true, noon: true, pm: true };
          // Skip AM on first day if check-in after 6 AM
          if (isFirst && ciHour > 6) row.am = false;
          // Skip PM on last day if check-out before 17 (5 PM)
          if (isLast && coHour < 17) row.pm = false;
          // If no noon feeds exist, mark as N/A
          if (feedsByTime.noon.length === 0) row.noon = false;
          // Calculate cost for this day
          const dayCost = (row.am ? feedsByTime.am.reduce((s, f) => s + (ftp[f.foodType] || 0), 0) : 0)
            + (row.noon ? feedsByTime.noon.reduce((s, f) => s + (ftp[f.foodType] || 0), 0) : 0)
            + (row.pm ? feedsByTime.pm.reduce((s, f) => s + (ftp[f.foodType] || 0), 0) : 0);
          const dayServings = (row.am ? feedsByTime.am.length : 0) + (row.noon ? feedsByTime.noon.length : 0) + (row.pm ? feedsByTime.pm.length : 0);
          totalServings += dayServings;
          totalFeedCost += dayCost;
          feedDetail.push(row);
        });
        if (totalFeedCost > 0) {
          const foodTypeLabel = feeds.length === 1 && feeds[0].foodType ? feeds[0].foodType : "Food";
          lines.push({ label: `${foodTypeLabel} (${totalServings} servings) — ${dogName}`, total: totalFeedCost, isAddon: true, feedDetail, feedsByTime, dogName });
          subtotal += totalFeedCost;
        }
      }
      // Medication pricing — per serving with same AM/PM logic
      const meds = fields.medicationSchedules || [];
      if (meds.length > 0 && dayDates.length > 0) {
        let totalMedCost = 0;
        let totalMedServings = 0;
        const medDetail = [];
        const medsByTime = { am: [], noon: [], pm: [] };
        meds.forEach(m => {
          (m.times || []).forEach(t => {
            const tl = t.toLowerCase();
            if (tl.includes("am")) medsByTime.am.push(m);
            else if (tl.includes("noon") || tl.includes("12")) medsByTime.noon.push(m);
            else if (tl.includes("pm")) medsByTime.pm.push(m);
          });
        });
        dayDates.forEach((d, di) => {
          const isFirst = di === 0;
          const isLast = di === dayDates.length - 1;
          const row = { date: d, am: true, noon: true, pm: true };
          if (isFirst && ciHour > 6) row.am = false;
          if (isLast && coHour < 17) row.pm = false;
          if (medsByTime.noon.length === 0) row.noon = false;
          const dayCost = (row.am ? medsByTime.am.length : 0) * (mp.Bagged || mp.Unbagged || 0)
            + (row.noon ? medsByTime.noon.length : 0) * (mp.Bagged || mp.Unbagged || 0)
            + (row.pm ? medsByTime.pm.length : 0) * (mp.Bagged || mp.Unbagged || 0);
          const dayServings = (row.am ? medsByTime.am.length : 0) + (row.noon ? medsByTime.noon.length : 0) + (row.pm ? medsByTime.pm.length : 0);
          totalMedServings += dayServings;
          totalMedCost += dayCost;
          medDetail.push(row);
        });
        if (totalMedCost > 0) {
          lines.push({ label: `Medication admin (${totalMedServings} doses) — ${dogName}`, total: totalMedCost, isAddon: true, medDetail, medsByTime, dogName });
          subtotal += totalMedCost;
        }
      }
    });
  }

  const total = Math.max(0, subtotal - discountTotal);
  const rule = (p.paymentRules || {})[type] || {};
  const depositPercent = rule.depositPercent || 0;
  const deposit = Math.round(total * (depositPercent / 100) * 100) / 100;
  const balance = Math.round((total - deposit) * 100) / 100;

  return {
    lineItems: lines,
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    total: Math.round(total * 100) / 100,
    deposit,
    balance,
    payAt: rule.payAt || "booking",
    depositRefundable: rule.depositRefundable || false,
    depositPercent,
  };
}

export { countNights, countHours, getAddOnPrices, calcReservationPricing };

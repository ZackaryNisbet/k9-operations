// K9 Operations — Accrual Revenue Engine
// SINGLE SOURCE OF TRUTH for accrual revenue computation.
// Implements the same methodology as the receipt modal:
//   Boarding: sibling grouping + room rate fallback
//   Daycare: base rates ($45 full / $30 half) + enrichment costs
// Used by both the accrual chart and the receipt modal.

import { LITE_DEF_PRICING, addDays, countNights } from "./theme";

const br = LITE_DEF_PRICING.boardingRates;
const dcRates = LITE_DEF_PRICING.daycareRates;

/**
 * computeAccrualByDay(rawReservations, dateFrom, dateTo)
 *
 * Given raw reservation rows from gingr_reservations (Supabase REST format),
 * returns a Map<dateString, { boardingRevenue, daycareRevenue, totalRevenue }>
 * for each day in [dateFrom, dateTo].
 *
 * Methodology (matches receipt modal exactly):
 *   Boarding:
 *     1. Filter to boarding reservations overlapping the date range
 *     2. Get total = transaction.price || deposit.amount || 0
 *     3. Group siblings by owner + checkIn + checkOut
 *     4. Group total = max(total) from group; if $0, fallback to roomRate × nights × dogCount
 *     5. perNight = groupTotal / totalNights / dogCount
 *     6. Each dog contributes perNight to each night it occupies within the range
 *   Daycare:
 *     1. Filter to daycare reservations starting within the date range
 *     2. Base rate: $45 full-day, $30 half-day
 *     3. Add enrichment/service costs from the services array
 */
export function computeAccrualByDay(rawReservations, dateFrom, dateTo) {
  // Initialize day map
  const dayMap = {};
  let cur = dateFrom;
  while (cur <= dateTo) {
    dayMap[cur] = { boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0 };
    cur = addDays(cur, 1);
  }

  const boarding = [];
  const daycare = [];

  (rawReservations || []).forEach(r => {
    const typeName = (r.reservation_type_name || "").toLowerCase();
    const isBoarding = typeName.includes("boarding") && !typeName.includes("day boarding");
    const isDaycare = typeName.includes("daycare") || typeName.includes("day care") || typeName.includes("day boarding");
    if (!isBoarding && !isDaycare) return;

    const dep = r.deposit && !Array.isArray(r.deposit) ? r.deposit : {};
    const txn = r.transaction && !Array.isArray(r.transaction) ? r.transaction : {};
    const total = Number(txn.price) || Number(dep.amount) || 0;
    const startD = r.start_date ? r.start_date.split("T")[0] : dateFrom;
    const endD = r.end_date ? r.end_date.split("T")[0] : startD;
    const ownerName = [r.owner_first_name, r.owner_last_name].filter(Boolean).join(" ");
    const roomMatch = (r.reservation_type_name || "").match(/\|\s*([^(]+)/);
    const roomType = roomMatch ? roomMatch[1].trim() : "Room";

    if (isBoarding && startD && endD) {
      const nights = countNights(startD, endD);
      if (nights <= 0) return;
      boarding.push({
        ownerName, roomType, totalCost: total,
        checkIn: startD, checkOut: endD, totalNights: nights,
      });
    } else if (isDaycare && startD >= dateFrom && startD <= dateTo) {
      let baseRate = dcRates.fullDay;
      if (typeName.includes("half")) baseRate = dcRates.halfDay;
      let enrichCost = 0;
      const svcs = Array.isArray(r.services) ? r.services : [];
      svcs.forEach(s => { enrichCost += Number(s.cost) || 0; });
      daycare.push({ date: startD, amount: baseRate + enrichCost });
    }
  });

  // ─── Boarding: sibling grouping ───
  const siblingGroups = {};
  boarding.forEach(b => {
    const gKey = `${b.ownerName}|${b.checkIn}|${b.checkOut}`;
    if (!siblingGroups[gKey]) siblingGroups[gKey] = [];
    siblingGroups[gKey].push(b);
  });

  Object.values(siblingGroups).forEach(group => {
    let resTotalFromGroup = Math.max(...group.map(b => b.totalCost));
    const dogCount = group.length;
    const totalNights = group[0].totalNights;
    const checkIn = group[0].checkIn;
    const checkOut = group[0].checkOut;

    // Fallback: if no transaction/deposit pricing, estimate from room rate
    if (resTotalFromGroup <= 0) {
      const roomRate = br[group[0].roomType] || 75; // default to Executive if unknown
      resTotalFromGroup = roomRate * totalNights * dogCount;
    }

    const perNight = resTotalFromGroup / totalNights / dogCount;

    // Spread per-night revenue across each night in the range
    let night = checkIn;
    while (night < checkOut) {
      if (night >= dateFrom && night <= dateTo && dayMap[night]) {
        dayMap[night].boardingRevenue += perNight * dogCount;
      }
      night = addDays(night, 1);
    }
  });

  // ─── Daycare ───
  daycare.forEach(dc => {
    if (dayMap[dc.date]) {
      dayMap[dc.date].daycareRevenue += dc.amount;
    }
  });

  // Compute totals
  Object.values(dayMap).forEach(d => {
    d.totalRevenue = d.boardingRevenue + d.daycareRevenue;
  });

  return dayMap;
}

/**
 * computeAccrualTotals(dayMap)
 * Returns { boardingRevenue, daycareRevenue, totalRevenue } summed across all days.
 */
export function computeAccrualTotals(dayMap) {
  let boardingRevenue = 0, daycareRevenue = 0, totalRevenue = 0;
  Object.values(dayMap).forEach(d => {
    boardingRevenue += d.boardingRevenue;
    daycareRevenue += d.daycareRevenue;
    totalRevenue += d.totalRevenue;
  });
  return { boardingRevenue, daycareRevenue, totalRevenue };
}

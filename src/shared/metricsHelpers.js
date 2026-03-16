// K9 Operations — Shared Metrics Helpers
// SINGLE SOURCE OF TRUTH for all dashboard metrics.
// Every computation here matches what the individual pages show.

import {
  C, LITE_DEF_PRICING, OPERATIONS_CATALOG, todayStr, addDays, countNights,
} from "./theme";
import { getRoomCleaningStats, getPPStats, getOpsProgress, getOpsCountLabel } from "./opsHelpers";

/* ═══════════════════════════════════════════════════════════════════════════
   computeOccupancyMetrics
   Same logic as DashboardPage todaySnapshot + OperationsHub todayProgressData
   ═══════════════════════════════════════════════════════════════════════════ */
export function computeOccupancyMetrics(data, today) {
  const reservations = data.reservations || [];
  const dogs = data.dogs || [];

  const inHouse = reservations.filter(r => r.status === "checked-in" && r.checkIn <= today && r.checkOut >= today);
  const boardingInHouse = inHouse.filter(r => r.type === "boarding").length;
  const daycareInHouse = inHouse.filter(r => r.type === "daycare" || r.type === "dayboarding").length;
  const goingHome = reservations.filter(r => r.status === "checked-in" && r.checkOut === today).length;
  const checkedOut = reservations.filter(r => r.checkOut === today && r.status === "checked-out").length;
  const arriving = reservations.filter(r => r.checkIn === today && (r.status === "upcoming" || r.status === "checked-in")).length;
  const expected = arriving + inHouse.length;

  const allRooms = data.rooms || {};
  const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);
  const boardingOccupied = reservations.filter(r => r.status === "checked-in" && r.type === "boarding" && r.checkIn <= today && r.checkOut > today).length;
  const occupancyPct = totalRoomCount > 0 ? Math.round((boardingOccupied / totalRoomCount) * 100) : 0;

  return {
    expected, dogsInHouse: boardingInHouse + daycareInHouse,
    boardingInHouse, daycareInHouse, goingHome, checkedOut, arriving,
    occupancyPct, totalRoomCount,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   computeServiceMetrics
   Matches OperationsHub Services section exactly:
   - inHouseToday = checked-in OR (upcoming with check-in/out spanning today)
   - Baths: inHouseToday with "bath" in _services
   - Pamper: unique dogs in Luxury Suite (resTypeId 5) OR with "pamper" in _services
   - Ice Cream + others: inHouseToday with matching _services entry
   ═══════════════════════════════════════════════════════════════════════════ */
export function computeServiceMetrics(data, today) {
  const reservations = data.reservations || [];

  // Tours: match by r.type === "tour" (how ClientsPage and reportHelpers count them)
  const tours = reservations.filter(r => r.checkIn === today && r.type === "tour").length;

  // Evals: match by type === "evaluation" OR _resTypeName includes "eval"
  const evals = reservations.filter(r =>
    r.checkIn === today && (r.type === "evaluation" || (r._resTypeName && r._resTypeName.toLowerCase().includes("eval")))
  ).length;

  // Bookings today
  const bookingsToday = reservations.filter(r => r.checkIn === today && r.status !== "cancelled").length;

  // ─── In-house today: same filter as OperationsHub Services section ───
  const inHouseToday = reservations.filter(r =>
    (r.status === "checked-in") ||
    (r.status === "upcoming" && (r.scheduledCheckIn || r.checkIn) <= today && (r.scheduledCheckOut || r.checkOut) >= today)
  );

  // Baths: inHouseToday reservations with "bath" in _services (matches OperationsHub line 876-881)
  const bathsTotal = inHouseToday.filter(r => {
    const svcs = r._services;
    if (!svcs) return false;
    const arr = Array.isArray(svcs) ? svcs : [];
    return arr.some(s => (typeof s === "string" ? s : s?.name || "").toLowerCase() === "bath");
  }).length;
  const bathsDone = 0; // OperationsHub Services section only shows total count, no done tracking

  // Pamper: unique dogs in Luxury Suite (resTypeId 5) or with "pamper" in _services (matches OperationsHub line 882-891)
  let pamperTotal = 0;
  const pamperSeen = new Set();
  inHouseToday.forEach(r => {
    if (pamperSeen.has(r.dogId)) return;
    const isLS = r._resTypeId == 5 || (r._resTypeName || "").toLowerCase().includes("luxury suite");
    const svcs = r._services;
    const arr = Array.isArray(svcs) ? svcs : [];
    const hasPP = arr.some(s => (typeof s === "string" ? s : s?.name || "").toLowerCase().includes("pamper"));
    if (isLS || hasPP) { pamperSeen.add(r.dogId); pamperTotal++; }
  });
  const pamperDone = 0; // OperationsHub Services section only shows total count, no done tracking

  // Ice Cream: inHouseToday with "Ice Cream" in _services (matches OperationsHub line 893-898)
  const iceCreamTotal = inHouseToday.filter(r => {
    const svcs = r._services;
    if (!svcs) return false;
    const arr = Array.isArray(svcs) ? svcs : [];
    return arr.some(s => (typeof s === "string" ? s : s?.name || "") === "Ice Cream");
  }).length;
  const iceCreamDone = 0; // OperationsHub Services section only shows total count, no done tracking

  // Room cleaning stats
  const cleaningStats = getRoomCleaningStats(data, today);

  // PP stats — use CORRECT property names from getPPStats
  const ppStats = getPPStats(data, today);

  return {
    tours, evals, bookingsToday,
    bathsTotal, bathsDone,
    pamperTotal, pamperDone,
    roomsToClean: cleaningStats.totalNeeded || 0,
    roomsCleaned: cleaningStats.totalDone || 0,
    ppTotal: ppStats.totalDogs || 0,
    ppCompleted: ppStats.completedSessions || 0,
    iceCreamTotal, iceCreamDone,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   computeLifecycleMetrics
   Matches FunnelPage metrics + ClientsPage clientTabMap for remaining counts
   ═══════════════════════════════════════════════════════════════════════════ */
export function computeLifecycleMetrics(data, dateFrom, dateTo, today) {
  const clients = data.clients || [];
  const ss = data.serverStats || {};
  const reservations = data.reservations || [];

  // Build per-client stats from server RPC (same as FunnelPage)
  const statsMap = {};
  clients.forEach(c => {
    const gid = String(c.gingrId);
    const srv = ss[gid];
    if (srv) {
      statsMap[c.id] = {
        totalSpent: Number(srv.total_spent) || 0,
        totalRes: Number(srv.total_res) || 0,
        hasRealBooking: srv.has_real_booking || false,
        hasSpent: (Number(srv.total_spent) || 0) > 0,
        lastResDate: srv.last_res_date || "",
      };
    } else {
      statsMap[c.id] = {
        totalSpent: 0,
        totalRes: c._numReservations || 0,
        hasRealBooking: (c._numReservations || 0) > 0,
        hasSpent: false,
        lastResDate: c._lastReservation ? c._lastReservation.split("T")[0] : "",
      };
    }
  });

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const d = dateStr.split("T")[0];
    return d >= dateFrom && d <= dateTo;
  };

  // LEADS: Clients created in timeframe (same as FunnelPage)
  const createdInRange = clients.filter(c => inRange(c.createdAt));
  const leadsInRange = createdInRange.filter(c => {
    const s = statsMap[c.id];
    if (s.lastResDate && s.lastResDate < dateFrom && s.hasRealBooking) return false;
    return true;
  });

  // CONTACTED: Leads who have log entries in timeframe OR converted (same as FunnelPage)
  const contactedLeads = leadsInRange.filter(c => {
    const convUpdates = c.lifecycle?.conversion?.updates || [];
    const retUpdates = c.lifecycle?.retention?.updates || [];
    const allUpdates = [...convUpdates, ...retUpdates];
    const hasLog = allUpdates.some(u => {
      const logDate = u.loggedAt ? u.loggedAt.split("T")[0] : "";
      return logDate >= dateFrom && logDate <= dateTo;
    });
    const lcUpdates = c.lifecycleUpdates || [];
    const hasLcLog = lcUpdates.some(u => u.type === "outreach" || u.type === "follow_up" || u.type === "note");
    const s = statsMap[c.id];
    const becameCustomer = s.hasSpent || s.hasRealBooking;
    return hasLog || hasLcLog || becameCustomer;
  });

  // NEW CUSTOMERS (same as FunnelPage)
  const newCustomers = leadsInRange.filter(c => {
    const s = statsMap[c.id];
    return s.hasSpent || s.hasRealBooking;
  });
  const newCustomerRevenue = newCustomers.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);

  // LTV (same as FunnelPage)
  const spendingClients = clients.filter(c => statsMap[c.id]?.hasSpent || statsMap[c.id]?.hasRealBooking);
  const totalLTV = spendingClients.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
  const avgLTV = spendingClients.length > 0 ? totalLTV / spendingClients.length : 0;
  // Conversion Rate = (leads who became customers / total leads in range) × 100
  // "Became customer" = hasSpent or hasRealBooking (boarding/daycare/grooming, not tour/eval)
  const conversionRate = leadsInRange.length > 0 ? (newCustomers.length / leadsInRange.length * 100) : 0;

  // Today-specific metrics
  // Only count manual outreaches (exclude system-logged entries like auto-seeded follow-ups)
  const todayOutreaches = clients.reduce((count, c) => {
    const convUpdates = c.lifecycle?.conversion?.updates || [];
    const retUpdates = c.lifecycle?.retention?.updates || [];
    const allUp = [...convUpdates, ...retUpdates];
    const todayLogs = allUp.filter(u => {
      if (u.loggedBy === "System") return false;
      const d = u.loggedAt ? u.loggedAt.split("T")[0] : "";
      return d === today;
    });
    return count + todayLogs.length;
  }, 0);

  // Converted: clients whose most recent reservation is today and have a real booking
  // (boarding, daycare, grooming — not tours/evals)
  const todayConversions = clients.filter(c => {
    const s = statsMap[c.id];
    return s.lastResDate === today && s.hasRealBooking;
  }).length;

  // First-Time Spenders: clients whose chronologically first paid reservation is in the date range
  // Sort client reservations by checkIn to find the true first paid visit
  const firstTimePayers = clients.filter(c => {
    const s = statsMap[c.id];
    if (!s.hasSpent) return false;
    const clientRes = reservations
      .filter(r =>
        r.status !== "cancelled" && (r.pricing?.total || 0) > 0 &&
        String(r._clientId || r.clientId) === String(c.id)
      )
      .sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || ""));
    const firstRes = clientRes[0];
    if (firstRes && firstRes.checkIn >= dateFrom && firstRes.checkIn <= dateTo) return true;
    return false;
  }).length;

  const todayNewLeads = createdInRange.filter(c => {
    const created = c.createdAt ? c.createdAt.split("T")[0] : "";
    return created === today;
  }).length;

  // Remaining Leads: use same logic as ClientsPage clientTabMap
  // ClientsPage determines conversion = !hasSpent && !hasRealBooking && !isCold
  const resByClient = {};
  reservations.forEach(r => { (resByClient[r.clientId] || (resByClient[r.clientId] = [])).push(r); });

  const td = today;
  let remainingLeads = 0;
  let remainingAtRisk = 0;
  // Lapsed thresholds from settings (boarding-heavy customers get a longer window)
  const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
  const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
  // Only show customers who lapsed within the last 30 days (recently crossed threshold).
  // Anyone who lapsed longer ago is "old Gingr data" and excluded from the dashboard.
  const LAPSED_RECENCY_DAYS = 30;
  const tdNoon = new Date(td + "T12:00:00");

  clients.forEach(c => {
    const s = statsMap[c.id];
    const hasSpent = (s?.totalSpent || 0) > 0;
    const gingrId = String(c.gingrId);
    const srv = ss[gingrId];

    // Lite clients (manually added, no Gingr data) count as leads unless cold
    if (c.isLiteClient) {
      const isCold = c.lifecycle?.cold === true;
      if (!isCold) remainingLeads++;
      return;
    }

    const hasRealBookingSynced = srv
      ? (srv.has_real_booking || false)
      : (resByClient[c.id] || []).some(r => r.type !== "tour" && r.type !== "evaluation");
    const hasUpcomingSynced = srv
      ? (srv.has_upcoming || false)
      : (resByClient[c.id] || []).some(r => r.checkIn >= td && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation");

    const totalRes = s?.totalRes || 0;
    const hasEverBooked = totalRes > 0;
    const hasRealBooking = hasRealBookingSynced || hasEverBooked;
    const hasUpcoming = hasUpcomingSynced || (!!(c._nextReservation && c._nextReservation.split("T")[0] >= td));

    const isCold = c.lifecycle?.cold === true;
    const isConversion = !hasSpent && !hasRealBooking && !isCold;

    // CLM-001: Gingr-sourced conversion clients created >14 days ago go to "Old From Gingr Sync" (excluded)
    const fourteenDaysAgo = addDays(td, -14);
    const isOldGingrSync = isConversion && !!c.gingrId && c.createdAt && c.createdAt.split("T")[0] < fourteenDaysAgo;

    if (isConversion && !isOldGingrSync) remainingLeads++;

    // Lapsed classification:
    // 1. Determine service type: if >50% of bookings are boarding → boarding threshold, else daycare
    // 2. daysSince >= threshold → customer has lapsed
    // 3. daysSince < threshold + 30 → recently lapsed (show on dashboard)
    // 4. daysSince >= threshold + 30 → old lapsed data, excluded
    if (hasRealBooking && !hasUpcoming && totalRes > 0 && !isCold) {
      const lastResDate = s?.lastResDate || "";
      if (lastResDate) {
        const daysSince = Math.round((tdNoon - new Date(lastResDate + "T12:00:00")) / 86400000);
        const resCount = srv ? Number(srv.total_res) : (resByClient[c.id] || []).length;
        const boardingCount = srv ? (Number(srv.boarding_count) || 0) : (resByClient[c.id] || []).filter(r => r.type === "boarding").length;
        const bdPct = resCount > 0 ? boardingCount / resCount : 0;
        const thresh = bdPct > 0.5 ? bdThresh : dcThresh;
        if (daysSince >= thresh && daysSince < thresh + LAPSED_RECENCY_DAYS) {
          remainingAtRisk++;
        }
      }
    }
  });

  return {
    leads: leadsInRange.length, contacted: contactedLeads.length, newCustomers: newCustomers.length,
    conversionRate, newCustomerRevenue, avgLTV, totalLTV,
    spendingClientsCount: spendingClients.length,
    remainingLeads, remainingAtRisk, todayOutreaches, todayConversions,
    firstTimePayers, todayNewLeads,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   computeRefundMetrics
   Same logic as RefundsPage — checks pricing.refund || pricing.refundAmount
   ═══════════════════════════════════════════════════════════════════════════ */
export function computeRefundMetrics(reservations, dateFrom, dateTo) {
  const inRange = (reservations || []).filter(r =>
    r.checkIn >= dateFrom && r.checkIn <= dateTo
  );
  let totalRefunds = 0, refundCount = 0;
  inRange.forEach(res => {
    const refund = res.pricing?.refund || res.pricing?.refundAmount || 0;
    if (refund > 0) { totalRefunds += refund; refundCount++; }
  });
  return { total: totalRefunds, count: refundCount, avg: refundCount > 0 ? totalRefunds / refundCount : 0 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   computeRevenueMetrics (cash-basis)
   Pre-indexed: groups reservations by checkIn date once,
   then range queries filter by date O(range_days).
   ═══════════════════════════════════════════════════════════════════════════ */
let _cashCache = { reservations: null, byDate: null };

function getCashIndex(reservations) {
  if (_cashCache.reservations === reservations) return _cashCache.byDate;
  // Group valid reservations by checkIn date
  const byDate = {};
  (reservations || []).forEach(r => {
    if (r.status === "cancelled" || !(r.pricing?.total > 0)) return;
    const d = r.checkIn;
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });
  _cashCache = { reservations, byDate };
  return byDate;
}

export function computeCashRevenueMetrics(reservations, dateFrom, dateTo, prevFrom, prevTo, today) {
  const cashIndex = getCashIndex(reservations);
  const calcMetrics = (from, to) => {
    let total = 0, count = 0;
    const byCategory = {};
    const byDate = {};
    let cur = from;
    while (cur <= to) {
      const dayRes = cashIndex[cur];
      if (dayRes) {
        dayRes.forEach(r => {
          const amt = r.pricing?.total || 0;
          total += amt;
          count++;
          const cat = r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : r.type === "evaluation" ? "Evaluation" : "Other";
          byCategory[cat] = (byCategory[cat] || 0) + amt;
          byDate[cur] = (byDate[cur] || 0) + amt;
        });
      }
      cur = addDays(cur, 1);
    }
    return {
      total, count, byCategory, byDate,
      avgTransaction: count > 0 ? total / count : 0,
    };
  };
  const current = calcMetrics(dateFrom, dateTo);
  const previous = calcMetrics(prevFrom, prevTo);
  return {
    current, previous,
    trend: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : 0,
    trendAvg: previous.count > 0 ? ((current.avgTransaction - previous.avgTransaction) / previous.avgTransaction) * 100 : 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Pre-indexed accrual data — built once per reservations array,
   then range queries are O(days_in_range) instead of O(136K).
   ═══════════════════════════════════════════════════════════════════════════ */
let _accrualCache = { reservations: null, index: null };

function getAccrualIndex(reservations) {
  if (_accrualCache.reservations === reservations) return _accrualCache.index;
  // Build a date → { boardingRevenue, daycareRevenue, roomsOccupied } index
  const index = {};
  (reservations || []).forEach(res => {
    if (res.status === "cancelled") return;
    if (res.type === "boarding" && res.checkIn && res.checkOut) {
      const totalNights = countNights(res.checkIn, res.checkOut);
      if (totalNights <= 0) return;
      const perNightRate = (res.pricing?.total || 0) / totalNights;
      let night = res.checkIn;
      while (night < res.checkOut) {
        if (!index[night]) index[night] = { boardingRevenue: 0, daycareRevenue: 0, roomsOccupied: 0 };
        index[night].boardingRevenue += perNightRate;
        index[night].roomsOccupied += 1;
        night = addDays(night, 1);
      }
    } else if (res.type === "daycare" && res.checkIn) {
      const d = res.checkIn;
      if (!index[d]) index[d] = { boardingRevenue: 0, daycareRevenue: 0, roomsOccupied: 0 };
      index[d].daycareRevenue += (res.pricing?.total || 0);
    }
  });
  _accrualCache = { reservations, index };
  return index;
}

export function computeAccrualRevenueMetrics(data, dateFrom, dateTo, prevFrom, prevTo) {
  const reservations = data.reservations || [];
  const accrualIndex = getAccrualIndex(reservations);

  const processDateRange = (from, to) => {
    const daysList = [];
    let cur = from;
    while (cur <= to) { daysList.push(cur); cur = addDays(cur, 1); }
    const dayData = {};
    const totals = { boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
    daysList.forEach(d => {
      const entry = accrualIndex[d];
      const br = entry ? entry.boardingRevenue : 0;
      const dr = entry ? entry.daycareRevenue : 0;
      const ro = entry ? entry.roomsOccupied : 0;
      const tr = br + dr;
      dayData[d] = { boardingRevenue: br, daycareRevenue: dr, totalRevenue: tr, discounts: 0, netRevenue: tr, roomsOccupied: ro };
      totals.boardingRevenue += br;
      totals.daycareRevenue += dr;
      totals.totalRevenue += tr;
      totals.netRevenue += tr;
      totals.roomsOccupied += ro;
    });
    return { dayData, totals, days: daysList };
  };
  const current = processDateRange(dateFrom, dateTo);
  const previous = processDateRange(prevFrom, prevTo);
  const allRooms = data.rooms || {};
  const totalRoomCount = Object.values(allRooms).reduce((sum, arr) => sum + arr.length, 0);
  const revenueTrend = previous.totals.totalRevenue > 0 ? ((current.totals.totalRevenue - previous.totals.totalRevenue) / previous.totals.totalRevenue) * 100 : 0;
  const occupancyRate = totalRoomCount > 0 && current.days.length > 0 ? (current.totals.roomsOccupied / (totalRoomCount * current.days.length)) * 100 : 0;
  const revPAR = totalRoomCount > 0 && current.days.length > 0 ? current.totals.boardingRevenue / (totalRoomCount * current.days.length) : 0;
  return { current, previous, revenueTrend, occupancyRate, revPAR, totalRoomCount, days: current.days };
}

/* ═══════════════════════════════════════════════════════════════════════════
   computeDiscountBreakdown
   Same logic as DashboardPage discountBreakdown
   ═══════════════════════════════════════════════════════════════════════════ */
export function computeDiscountBreakdown(reservations, dateFrom, dateTo) {
  const rackRates = LITE_DEF_PRICING.boardingRates;
  const filtered = (reservations || []).filter(r =>
    r.status !== "cancelled" && r.type === "boarding" && r.checkIn >= dateFrom && r.checkIn <= dateTo
  );
  let discounted = 0, atRack = 0, totalRackRevenue = 0, totalActualRevenue = 0;
  filtered.forEach(res => {
    const nights = countNights(res.checkIn, res.checkOut);
    if (nights <= 0) return;
    const actual = res.pricing?.total || 0;
    const typeName = res._resTypeName || "";
    const rackRate = Object.entries(rackRates).find(([k]) => typeName.toLowerCase().includes(k.toLowerCase()))?.[1] || 0;
    const expectedRack = rackRate * nights;
    totalRackRevenue += expectedRack;
    totalActualRevenue += actual;
    if (expectedRack > 0 && actual < expectedRack * 0.98) { discounted++; } else { atRack++; }
  });
  const totalDiscounts = Math.max(0, totalRackRevenue - totalActualRevenue);
  return { discounted, atRack, totalRackRevenue, totalActualRevenue, totalDiscounts };
}

/* ═══════════════════════════════════════════════════════════════════════════
   computeOpsProgress
   Same logic as DashboardPage opsProgress
   ═══════════════════════════════════════════════════════════════════════════ */
export function computeOpsProgress(data, today) {
  const cats = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon);
  return cats.map(cat => {
    const progress = getOpsProgress(data, cat, today);
    const countLabel = getOpsCountLabel(data, cat, today);
    return { id: cat.id, label: cat.label, progress, countLabel, routeTo: cat.routeTo };
  });
}

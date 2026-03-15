// K9 Operations — LiteReportsPage
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

function LiteReportsPage({ data, nav }) {
  const today = todayStr();
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


  const changeTimeRange = (range) => { setTimeRange(range); setAnimEpoch(e => e + 1); };

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

  const fmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
  const fmt$k = (v) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : fmt$(v);
  const fmtPercent = (v) => `${typeof v === "number" ? v.toFixed(1) : "0.0"}%`;
  const fmtDateLabel = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); return `${dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`; };

  const cashBasisData = useMemo(() => {
    const allRes = (data.reservations || []).filter(r => r.status !== "cancelled" && r.pricing?.total > 0);
    const calcMetrics = (resInRange) => {
      const total = resInRange.reduce((sum, r) => sum + (r.pricing?.total || 0), 0);
      const byCategory = {}, byMethod = { "gingr": 0 }, bySource = { "gingr": 0 }, byDate = {};
      resInRange.forEach(r => {
        const cat = r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : r.type === "evaluation" ? "Evaluation" : "Other";
        byCategory[cat] = (byCategory[cat] || 0) + (r.pricing?.total || 0);
        byMethod["gingr"] += 1;
        bySource["gingr"] += (r.pricing?.total || 0);
        const dt = r.checkIn || today;
        byDate[dt] = (byDate[dt] || 0) + (r.pricing?.total || 0);
      });
      return { total, count: resInRange.length, byCategory, byMethod, bySource, byDate, avgTransaction: resInRange.length > 0 ? total / resInRange.length : 0, payments: resInRange.map(r => ({
        id: r.id, amount: r.pricing?.total || 0, timestamp: r.checkIn + "T12:00:00", method: "gingr",
        category: r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : "Other",
        reservationId: r.id,
      })) };
    };
    const currentRes = allRes.filter(r => r.checkIn >= dateFrom && r.checkIn <= dateTo);
    const previousRes = compareMode ? allRes.filter(r => r.checkIn >= prevFrom && r.checkIn <= prevTo) : [];
    const current = calcMetrics(currentRes);
    const previous = calcMetrics(previousRes);
    return {
      current, previous,
      trend: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : 0,
      trendAvg: previous.count > 0 ? ((current.avgTransaction - previous.avgTransaction) / previous.avgTransaction) * 100 : 0,
    };
  }, [data.reservations, dateFrom, dateTo, prevFrom, prevTo, compareMode]);

  const accrualData = useMemo(() => {
    const reservations = data.reservations || [];
    const processDateRange = (from, to) => {
      const daysList = []; let cur = from;
      while (cur <= to) { daysList.push(cur); cur = addDays(cur, 1); }
      const dayData = {};
      daysList.forEach(d => { dayData[d] = { boardingRevenue: 0, daycareRevenue: 0, feedingRevenue: 0, medicationRevenue: 0, addOnRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 }; });
      reservations.forEach(res => {
        if (res.status === "cancelled") return;
        if (res.type === "boarding" && res.checkIn && res.checkOut) {
          const totalNights = countNights(res.checkIn, res.checkOut);
          if (totalNights <= 0) return;
          const perNightRate = (res.pricing?.total || 0) / totalNights;
          let night = res.checkIn;
          while (night < res.checkOut) {
            if (night >= from && night <= to && dayData[night]) {
              dayData[night].boardingRevenue += perNightRate;
              dayData[night].roomsOccupied += 1;
            }
            night = addDays(night, 1);
          }
        } else if (res.type === "daycare" && res.checkIn && res.checkIn >= from && res.checkIn <= to) {
          if (dayData[res.checkIn]) dayData[res.checkIn].daycareRevenue += (res.pricing?.total || 0);
        }
      });
      daysList.forEach(d => {
        dayData[d].totalRevenue = dayData[d].boardingRevenue + dayData[d].daycareRevenue;
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
    const revenueTrend = previous.totals.totalRevenue > 0 ? ((current.totals.totalRevenue - previous.totals.totalRevenue) / previous.totals.totalRevenue) * 100 : 0;
    const occupancyRate = totalRoomCount > 0 && current.days.length > 0 ? (current.totals.roomsOccupied / (totalRoomCount * current.days.length)) * 100 : 0;
    const revPAR = totalRoomCount > 0 && current.days.length > 0 ? current.totals.boardingRevenue / (totalRoomCount * current.days.length) : 0;
    return { current, previous, revenueTrend, occupancyRate, revPAR, days: current.days };
  }, [data.reservations, data.rooms, dateFrom, dateTo, prevFrom, prevTo, compareMode]);

  const discountBreakdown = useMemo(() => {
    // Estimate discounts by comparing actual price to rack rate × nights
    const rackRates = LITE_DEF_PRICING.boardingRates;
    const reservations = (data.reservations || []).filter(r =>
      r.status !== "cancelled" && r.type === "boarding" &&
      r.checkIn >= dateFrom && r.checkIn <= dateTo
    );
    let discounted = 0, atRack = 0, totalRackRevenue = 0, totalActualRevenue = 0;
    reservations.forEach(res => {
      const nights = countNights(res.checkIn, res.checkOut);
      if (nights <= 0) return;
      const actual = res.pricing?.total || 0;
      // Determine rack rate from reservation type name
      const typeName = res._resTypeName || "";
      const rackRate = Object.entries(rackRates).find(([k]) => typeName.toLowerCase().includes(k.toLowerCase()))?.[1] || 0;
      const expectedRack = rackRate * nights;
      totalRackRevenue += expectedRack;
      totalActualRevenue += actual;
      if (expectedRack > 0 && actual < expectedRack * 0.98) { // 2% tolerance
        discounted++;
      } else {
        atRack++;
      }
    });
    const totalDiscounts = Math.max(0, totalRackRevenue - totalActualRevenue);
    const grossRevenue = accrualData.current.totals.totalRevenue;
    return {
      byType: { none: atRack, percent: 0, flat: 0, coupon: 0, multidog: discounted },
      byAmount: { none: 0, percent: 0, flat: 0, coupon: 0, multidog: totalDiscounts },
      grossRevenue,
      totalDiscounts,
      hasEstimates: true,
    };
  }, [accrualData.current, data.reservations, dateFrom, dateTo]);

  const transactionsData = useMemo(() => {
    let transactions = (cashBasisData.current.payments || []).map(p => {
      const res = (data.reservations || []).find(r => r.id === p.reservationId);
      const dog = res ? (data.dogs || []).find(d => d.id === res.dogId) : null;
      const client = res ? (data.clients || []).find(c => c.id === res.clientId) : null;
      return { id: p.id, date: p.timestamp?.split("T")[0] || "—", clientName: client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : (res?._ownerName || "—"), dogName: dog?.fields?.name || (res?._animalName || "—"), service: p.category || "—", room: res?.room || "—", amount: p.amount || 0, method: "Gingr", source: "Gingr", reservationId: p.reservationId };
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

  const accrualReservationsData = useMemo(() => {
    const reservations = (data.reservations || []).filter(r => {
      if (r.status === "cancelled") return false;
      if (r.checkOut < dateFrom || r.checkIn > dateTo) return false;
      return r.type === "boarding";
    });
    let processed = reservations.map(res => {
      const dog = (data.dogs || []).find(d => d.id === res.dogId);
      const client = (data.clients || []).find(c => c.id === res.clientId);
      const nights = countNights(res.checkIn, res.checkOut);
      const retailTotal = res.pricing?.total || 0;
      const nightlyRate = nights > 0 ? retailTotal / nights : 0;
      return {
        id: res.id, dogName: dog?.fields?.name || (res._animalName || "—"),
        clientName: client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : (res._ownerName || "—"),
        roomType: res._resTypeName || "Boarding", checkIn: res.checkIn, checkOut: res.checkOut, nights, nightlyRate,
        retailTotal, discountType: "none", discountAmount: 0, netTotal: retailTotal,
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

  const classifyIntent = useCallback((query) => {
    const q = query.toLowerCase().trim();
    let best = null, bestScore = 0;
    for (const intent of _INTENTS) {
      let score = _matchScore(q, intent.keywords);
      if (intent.requiredAny && intent.requiredAny.some(t => q.includes(t))) score += 5;
      else if (intent.requiredAny) score = Math.max(0, score - 10);
      if (intent.requiredAll && !intent.requiredAll.some(t => q.includes(t))) score = Math.max(0, score - 5);
      if (score > bestScore) { bestScore = score; best = intent.id; }
    }
    return { intent: best, confidence: bestScore };
  }, [_INTENTS]);

  const extractEntities = useCallback((query) => {
    const q = query.toLowerCase().trim();
    const entities = {};
    const limitMatch = q.match(/(?:top|bottom|first|last)\s+(\d+)/);
    entities.limit = limitMatch ? parseInt(limitMatch[1]) : 10;
    entities.sortDir = (q.includes("bottom") || q.includes("least") || q.includes("lowest") || q.includes("worst")) ? "asc" : "desc";
    if (q.includes("luxury")) entities.roomType = "Luxury Suite";
    else if (q.includes("executive")) entities.roomType = "Executive Room";
    else if (q.includes("double")) entities.roomType = "Double Compartment";
    else if (q.includes("single")) entities.roomType = "Single Compartment";
    return entities;
  }, []);

  const _agg = useMemo(() => {
    const reservations = (data.reservations || []).filter(r => r.status !== "cancelled" && r.type === "boarding" && r.checkOut >= dateFrom && r.checkIn <= dateTo);
    const allReservations = (data.reservations || []).filter(r => r.status !== "cancelled" && r.checkOut >= dateFrom && r.checkIn <= dateTo);
    const payments = cashBasisData.current.payments || [];
    const dogs = data.dogs || [];
    const clients = data.clients || [];
    const pricing = LITE_DEF_PRICING;
    const br = LITE_DEF_PRICING.boardingRates;
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
        const curTotal = cashBasisData.current.total;
        const prevTotal = cashBasisData.previous.total;
        const growthPct = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : 0;
        const curAvg = cashBasisData.current.avgTransaction;
        const prevAvg = cashBasisData.previous.avgTransaction;
        const avgGrowth = prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0;
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
        const addOnPrices = LITE_DEF_PRICING.addOns || {};
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

  const processNLPQuery = useCallback((query) => {
    const q = query.toLowerCase().trim();
    setNlpLoading(true);
    setTimeout(() => {
      const { intent, confidence } = classifyIntent(q);
      const entities = extractEntities(q);
      let result = null;
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
        setNlpResults(result);
        setNlpLoading(false);
      }
    }, 150);
  }, [classifyIntent, extractEntities, _agg]);

  const getQuarter = (dateStr) => { const m = new Date(dateStr + "T00:00:00").getMonth(); return m < 3 ? "Q1" : m < 6 ? "Q2" : m < 9 ? "Q3" : "Q4"; };
  const getMonthLabel = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short" });
  const getMonthYearLabel = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });

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
        const key = d.slice(0, 7);
        if (!monthBuckets[key]) {
          const q = getQuarter(d);
          monthBuckets[key] = { date: d, label: `${getMonthLabel(d)} (${q})`, value: 0, prevValue: 0 };
        }
        monthBuckets[key].value += getValueForDay(d);
        if (getPrevValueForDay) monthBuckets[key].prevValue += getPrevValueForDay(d);
      });
      return Object.values(monthBuckets);
    }
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
        value: chunk.reduce((s, d) => s + getValueForDay(d), 0),
        prevValue: getPrevValueForDay ? chunk.reduce((s, d) => s + getPrevValueForDay(d), 0) : 0,
      });
    }
    return weekBuckets;
  }, [bucketMode]);

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
    const items = Object.entries(methods).map(([m, count]) => ({ label: m.charAt(0).toUpperCase() + m.slice(1), value: count, percent: total > 0 ? (count / total) * 100 : 0 }));
    return items.sort((a, b) => b.value - a.value);
  }, [cashBasisData.current.byMethod]);

  const MiniDonut = ({ items, size = 120, id = "donut" }) => {
    const total = items.reduce((s, v) => s + v.value, 0);
    const circumference = 2 * Math.PI * (size / 2 - 8);
    let offset = 0;
    const segments = items.map((item, idx) => {
      const pct = total > 0 ? item.value / total : 0;
      const len = pct * circumference;
      const seg = <circle key={idx} cx={size / 2} cy={size / 2} r={size / 2 - 8} fill="none" stroke={[C.pri, C.acc, C.suc, C.warn, C.dan][idx % 5]} strokeWidth="12" strokeDasharray={`${len} ${circumference}`} strokeDashoffset={-offset} opacity="0.9" style={{ transition: "opacity 200ms" }} />;
      offset += len;
      return seg;
    });
    const legend = items.map((item, idx) => (
      <div key={idx} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: [C.pri, C.acc, C.suc, C.warn, C.dan][idx % 5] }}></div>
        <span style={{ color: C.textSec }}>{item.label}</span>
      </div>
    ));
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <svg width={size} height={size}>
          {segments}
        </svg>
        <div style={{ fontSize: 11 }}>{legend}</div>
      </div>
    );
  };

  const KPI = ({ label, value, displayValue, trend, accentColor, icon, delay }) => (
    <div style={{ padding: 16, background: C.surface, borderRadius: 14, borderTop: `3px solid ${accentColor}`, animation: `rptFadeUp 500ms ease-out ${delay * 80}ms backwards`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "box-shadow 200ms" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"}>
      <div style={{ fontSize: 11, color: C.textMut, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 4 }}>{displayValue || fmt$k(value)}</div>
      {trend !== undefined && <div style={{ fontSize: 11, color: trend >= 0 ? C.suc : C.dan }}>{trend >= 0 ? "+" : ""}{trend.toFixed(1)}%</div>}
    </div>
  );

  const CollapsibleSection = ({ title, open, onToggle, count, children }) => (
    <div style={{ marginBottom: 16 }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontWeight: 600, fontSize: 14, color: C.text }}>
        <span>{title} {count !== undefined && <span style={{ marginLeft: 8, fontSize: 12, color: C.textMut }}>({count})</span>}</span>
        <span style={{ transition: "transform 200ms", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
      </button>
      {open && <div style={{ marginTop: 8, animation: "rptFadeUp 300ms ease-out" }}>{children}</div>}
    </div>
  );

  const ReservationDrawer = ({ reservation, onClose }) => {
    if (!reservation) return null;
    const res = (data.reservations || []).find(r => r.id === reservation);
    if (!res) return null;
    const dog = (data.dogs || []).find(d => d.id === res.dogId);
    const client = (data.clients || []).find(c => c.id === res.clientId);
    const nights = countNights(res.checkIn, res.checkOut);
    const total = res.pricing?.total || 0;
    const perNight = nights > 0 ? total / nights : 0;
    return ReactDOM.createPortal(
      <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 400, background: C.surface, height: "100%", overflowY: "auto", padding: 20, boxShadow: "-4px 0 16px rgba(0,0,0,0.1)", animation: `rptSlideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Reservation Details</h2>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: C.textSec, padding: 0 }}>×</button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              ["DOG", dog?.fields?.name || "—"],
              ["OWNER", client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "—"],
              ["CHECK-IN", res.checkIn],
              ["CHECK-OUT", res.checkOut],
              ["NIGHTS", String(nights)],
              ["ROOM TYPE", res._resTypeName || "—"],
              ["NIGHTLY RATE", fmt$(perNight)],
              ["TOTAL", fmt$(total)],
              ["TYPE", res.type?.charAt(0).toUpperCase() + res.type?.slice(1) || "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: 12, background: C.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: C.textMut, marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ width: "100%", marginTop: 24, padding: "12px 16px", background: C.pri, color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 200ms" }} onMouseEnter={e => (e.target.style.background = C.priL)} onMouseLeave={e => (e.target.style.background = C.pri)}>Close</button>
        </div>
      </div>,
      document.body
    );
  };

  const MiniTable = ({ title, columns, rows }) => (
    <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
      {title && <div style={{ padding: 12, background: C.bg, fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          <tr>{columns.map((col, i) => <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textMut }}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none" }}>{row.map((cell, j) => <td key={j} style={{ padding: "8px 12px", color: C.text }}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );

  const FollowUpSuggestions = ({ suggestions }) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      {suggestions?.map((s, i) => (
        <button key={i} onClick={() => setNlpQuery(s)} style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, fontSize: 12, cursor: "pointer", color: C.text, transition: "all 200ms" }} onMouseEnter={e => { e.target.style.background = C.pri; e.target.style.color = "white"; }} onMouseLeave={e => { e.target.style.background = C.bg; e.target.style.color = C.text; }}>
          {s}
        </button>
      ))}
    </div>
  );

  const NLPResults = () => {
    if (!nlpResults) return null;
    if (nlpResults.type === "table") {
      return (
        <div style={{ marginBottom: 16, padding: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, animation: "rptFadeUp 300ms ease-out" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: C.text }}>{nlpResults.title}</h2>
          <p style={{ margin: "0 0 12px 0", fontSize: 11, color: C.textMut }}>{nlpResults.subtitle}</p>
          <MiniTable columns={nlpResults.columns} rows={nlpResults.rows} />
          <FollowUpSuggestions suggestions={nlpResults.followUps} />
        </div>
      );
    }
    if (nlpResults.type === "summary") {
      return (
        <div style={{ marginBottom: 16, padding: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, animation: "rptFadeUp 300ms ease-out" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: C.text }}>{nlpResults.title}</h2>
          <p style={{ margin: "0 0 16px 0", fontSize: 11, color: C.textMut }}>{nlpResults.subtitle}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            {nlpResults.items?.map((item, i) => (
              <div key={i} style={{ padding: 12, background: C.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: C.textMut, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: item.color || C.text }}>{item.value}</div>
              </div>
            ))}
          </div>
          {nlpResults.extra && <div style={{ marginTop: 12 }}><MiniTable title={nlpResults.extra.title} columns={nlpResults.extra.columns} rows={nlpResults.extra.rows} /></div>}
          <FollowUpSuggestions suggestions={nlpResults.followUps} />
        </div>
      );
    }
    return (
      <div style={{ marginBottom: 16, padding: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, animation: "rptFadeUp 300ms ease-out" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: C.text }}>{nlpResults.title}</h2>
        <p style={{ margin: "0 0 12px 0", fontSize: 12, color: C.text }}>{nlpResults.message}</p>
        <FollowUpSuggestions suggestions={nlpResults.followUps} />
      </div>
    );
  };

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

  return (
    <div style={{ padding: "16px 20px" }}>
      <style>{`
        @keyframes rptFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rptSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes rptShimmer { from { background-position: -600px 0; } to { background-position: 600px 0; } }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "Outfit, sans-serif", color: C.text }}>Revenue Intelligence</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: C.textMut }}>{fmtDateLabel(dateFrom)} – {fmtDateLabel(dateTo)} {compareMode && `vs ${fmtDateLabel(prevFrom)} – ${fmtDateLabel(prevTo)}`}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", background: C.surfaceHover, borderRadius: 8, padding: 2, gap: 2 }}>
            {["today", "week", "month", "quarter", "year", "custom"].map(range => (
              <button key={range} onClick={() => { changeTimeRange(range); setNlpResults(null); }} style={{ padding: "6px 12px", background: timeRange === range ? C.pri : "transparent", color: timeRange === range ? "white" : C.text, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 200ms" }}>
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
          {timeRange === "custom" && (
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.surface }} />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.surface }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.text }}>Compare</span>
            <div onClick={() => setCompareMode(!compareMode)} style={{ width: 44, height: 24, background: compareMode ? C.pri : C.border, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", padding: "2px", transition: "background 200ms" }}>
              <div style={{ width: 20, height: 20, background: "white", borderRadius: "50%", transition: "transform 200ms", transform: compareMode ? "translateX(20px)" : "translateX(0)" }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 14px", background: C.surface, borderRadius: 10, marginBottom: 16, border: `1px solid ${C.border}`, position: "relative" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input placeholder="Ask anything..." value={nlpQuery} onChange={e => setNlpQuery(e.target.value)} onFocus={() => setShowNLPSuggestions(true)} onBlur={() => setTimeout(() => setShowNLPSuggestions(false), 200)} onKeyDown={e => { if (e.key === "Enter" && nlpQuery.trim()) { processNLPQuery(nlpQuery); setShowNLPSuggestions(false); } }} style={{ flex: 1, border: "none", background: "transparent", color: C.text, fontSize: 14, outline: "none", padding: 0 }} />
          {nlpLoading && <div style={{ width: 16, height: 16, background: `linear-gradient(90deg, transparent, ${C.pri}, transparent)`, backgroundSize: "200% 100%", animation: "rptShimmer 1.5s infinite", borderRadius: 2 }} />}
        </div>
        {showNLPSuggestions && !nlpQuery && (
          <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 300, overflowY: "auto", zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
            {nlpSuggestionsBank.reduce((acc, item) => { const cat = item.cat; if (!acc[cat]) acc[cat] = []; acc[cat].push(item.q); return acc; }, {}) && Object.entries(nlpSuggestionsBank.reduce((acc, item) => { const cat = item.cat; if (!acc[cat]) acc[cat] = []; acc[cat].push(item.q); return acc; }, {})).map(([cat, qs]) => (
              <div key={cat}>
                <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: C.textMut, background: C.bg, borderBottom: `1px solid ${C.border}` }}>{cat.toUpperCase()}</div>
                {qs.map((q, i) => (
                  <div key={i} onClick={() => { setNlpQuery(q); processNLPQuery(q); setShowNLPSuggestions(false); }} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.borderLight}`, cursor: "pointer", color: C.text, fontSize: 12, transition: "background 200ms" }} onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {q}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {nlpResults && <NLPResults />}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ padding: 12, background: `${C.priLt}15`, borderLeft: `3px solid ${C.pri}`, borderRadius: "0 8px 8px 0", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.pri }}>Cash Basis Revenue</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <KPI label="Total Revenue" value={cashBasisData.current.total} trend={cashBasisData.trend} accentColor={C.pri} delay={0} />
            <KPI label="Avg Transaction" value={cashBasisData.current.avgTransaction} trend={cashBasisData.trendAvg} accentColor={C.acc} delay={1} />
            <KPI label="Transactions" value={0} displayValue={String(cashBasisData.current.count)} accentColor={C.suc} delay={2} />
            <KPI label="Top Category" displayValue={Object.entries(cashBasisData.current.byCategory || {}).sort(([, a], [, b]) => b - a)[0]?.[0] || "—"} value={0} accentColor={C.info} delay={3} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Cash Revenue Trend</h3>
            <InteractiveLineChart chartData={cashChartData} color={C.pri} showCompare={compareMode} height={210} id="rpt-cash" animationEpoch={animEpoch} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Revenue by Category</h3>
            <InteractiveBarChart items={categoryData} onBarClick={item => setNlpQuery(`Revenue for ${item.label}`)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Booking Source</h3>
              <MiniDonut items={bookingSourceData} />
            </div>
            <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Payment Methods</h3>
              <MiniDonut items={paymentMethodData} />
            </div>
          </div>
          <CollapsibleSection title="Transactions" open={cashTableOpen} onToggle={() => setCashTableOpen(!cashTableOpen)} count={transactionsData.length}>
            <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
              <input placeholder="Search..." value={transactionSearch} onChange={e => setTransactionSearch(e.target.value)} style={{ flex: 1, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.bg }} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead style={{ borderBottom: `1px solid ${C.border}` }}>
                  <tr>{["Date", "Client", "Dog", "Service", "Amount"].map((h, i) => <th key={i} onClick={() => { const newDir = sortConfig.key === ["date", "clientName", "dogName", "service", "amount"][i] ? (sortConfig.direction === "desc" ? "asc" : "desc") : "desc"; setSortConfig({ key: ["date", "clientName", "dogName", "service", "amount"][i], direction: newDir }); }} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.textMut, cursor: "pointer", userSelect: "none" }}>{h} {sortConfig.key === ["date", "clientName", "dogName", "service", "amount"][i] && (sortConfig.direction === "desc" ? "▼" : "▲")}</th>)}</tr>
                </thead>
                <tbody>
                  {transactionsData.slice(0, 10).map((t, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}><td style={{ padding: "8px 12px", color: C.text }}>{t.date}</td><td style={{ padding: "8px 12px", color: C.text }}>{t.clientName}</td><td style={{ padding: "8px 12px", color: C.text }}>{t.dogName}</td><td style={{ padding: "8px 12px", color: C.text }}>{t.service}</td><td style={{ padding: "8px 12px", color: C.suc, fontWeight: 600 }}>{fmt$(t.amount)}</td></tr>)}
                </tbody>
              </table>
            </div>
            {transactionsData.length > 10 && <div style={{ marginTop: 12, fontSize: 12, color: C.textMut }}>Showing 10 of {transactionsData.length}</div>}
          </CollapsibleSection>
        </div>

        <div>
          <div style={{ padding: 12, background: `${C.accLt}15`, borderLeft: `3px solid ${C.acc}`, borderRadius: "0 8px 8px 0", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.accDk }}>Accrual Revenue</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <KPI label="Total Accrual" value={accrualData.current.totals.totalRevenue} trend={accrualData.revenueTrend} accentColor={C.acc} delay={0} />
            <KPI label="Occupancy" displayValue={fmtPercent(accrualData.occupancyRate)} value={0} accentColor={C.info} delay={1} />
            <KPI label="RevPAR" value={accrualData.revPAR} accentColor={C.warn} delay={2} />
            <KPI label="Net Revenue" value={accrualData.current.totals.netRevenue} accentColor={C.suc} delay={3} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Accrual Revenue Trend</h3>
            <InteractiveLineChart chartData={accrualChartData} color={C.acc} compareColor={C.pri} showCompare={compareMode} height={210} id="rpt-accrual" animationEpoch={animEpoch} />
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: C.text }}>Revenue Composition</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { label: "Boarding", value: accrualData.current.totals.boardingRevenue, color: C.pri },
                { label: "Daycare", value: accrualData.current.totals.daycareRevenue, color: C.acc },
              ].filter(x => x.value > 0).map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color }} />
                    <span style={{ fontSize: 12, color: C.text }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmt$k(item.value)}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Net Revenue</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.suc }}>{fmt$k(accrualData.current.totals.netRevenue)}</span>
              </div>
            </div>
          </div>
          <div style={{ padding: 16, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px 0" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>Discount Transparency</h3>
              <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>(estimated from rack rates)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "At Rack Rate", count: discountBreakdown.byType.none },
                { label: "Discounted", count: discountBreakdown.byType.multidog },
                { label: "Est. Discount", count: discountBreakdown.totalDiscounts > 0 ? `$${Math.round(discountBreakdown.totalDiscounts).toLocaleString()}` : "$0" },
              ].map((item, i) => (
                <div key={i} style={{ textAlign: "center", padding: 12, background: C.bg, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: C.textMut, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: i === 2 && discountBreakdown.totalDiscounts > 0 ? C.dan : C.text }}>{item.count}</div>
                </div>
              ))}
            </div>
          </div>
          <CollapsibleSection title="Reservations" open={accrualTableOpen} onToggle={() => setAccrualTableOpen(!accrualTableOpen)} count={accrualReservationsData.length}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead style={{ borderBottom: `1px solid ${C.border}` }}>
                  <tr>{["Dog", "Room", "In", "Nts", "Retail", "Disc", "Net"].map((h, i) => <th key={i} onClick={() => { const keys = ["dogName", "roomType", "checkIn", "nights", "retailTotal", "discountAmount", "netTotal"]; const newDir = sortConfig.key === keys[i] ? (sortConfig.direction === "desc" ? "asc" : "desc") : "desc"; setSortConfig({ key: keys[i], direction: newDir }); }} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: C.textMut, fontSize: 10, cursor: "pointer", userSelect: "none" }}>{h} {sortConfig.key === ["dogName", "roomType", "checkIn", "nights", "retailTotal", "discountAmount", "netTotal"][i] && (sortConfig.direction === "desc" ? "▼" : "▲")}</th>)}</tr>
                </thead>
                <tbody>
                  {accrualReservationsData.slice(0, 8).map((r, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}><td style={{ padding: "6px 8px", color: C.text }}>{r.dogName}</td><td style={{ padding: "6px 8px", color: C.text }}>{r.roomType}</td><td style={{ padding: "6px 8px", color: C.text, fontSize: 10 }}>{r.checkIn}</td><td style={{ padding: "6px 8px", color: C.text }}>{r.nights}</td><td style={{ padding: "6px 8px", color: C.text }}>{fmt$(r.retailTotal)}</td><td style={{ padding: "6px 8px", color: r.discountAmount > 0 ? C.dan : C.textMut }}>{fmt$(r.discountAmount)}</td><td style={{ padding: "6px 8px", color: C.suc, fontWeight: 600 }}>{fmt$(r.netTotal)}</td></tr>)}
                </tbody>
              </table>
            </div>
            {accrualReservationsData.length > 8 && <div style={{ marginTop: 12, fontSize: 12, color: C.textMut }}>Showing 8 of {accrualReservationsData.length}</div>}
          </CollapsibleSection>
        </div>
      </div>

      {selectedReservation && <ReservationDrawer reservation={selectedReservation} onClose={() => setSelectedReservation(null)} />}
    </div>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────────

export default LiteReportsPage;

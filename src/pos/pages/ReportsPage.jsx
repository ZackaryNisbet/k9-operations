import ReactDOM from "react-dom";
import { C } from "../constants/colors";
import { DEF_PRICING } from "../constants/pricing";
import { InteractiveLineChart } from "../charts/InteractiveLineChart";
import { addDays } from "../lib/format";
import { countHours, countNights, getAddOnPrices } from "../lib/pricing";
import { supabase } from "../../supabaseClient";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export { ReportsPage };

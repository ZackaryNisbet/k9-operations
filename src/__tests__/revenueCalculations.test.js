// Tests for revenue calculation logic
// Extracted from DashboardPage.jsx and ReportsPage.jsx

import { describe, it, expect } from 'vitest';

// ─── Extracted helpers ─────────────────────────────────────────────────────
const countNights = (ci, co) => {
  const a = new Date(ci + "T12:00:00"), b = new Date(co + "T12:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
};

const addDays = (d, n) => {
  const dt = new Date(d + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
};

const LITE_DEF_PRICING = {
  boardingRates: { "Luxury Suite": 95, "Executive Room": 75, "Double Compartment": 65, "Single Compartment": 55 },
  daycareRates: { fullDay: 45, halfDay: 30 },
  halfDayThreshold: 5,
  multiDogDiscount: 20,
};

// ─── Cash Basis Revenue Calculator ─────────────────────────────────────────
// Extracted from DashboardPage.jsx lines 414-445
function calcCashBasisMetrics(reservations) {
  const allRes = reservations.filter(r => r.status !== "cancelled" && r.pricing?.total > 0);
  const total = allRes.reduce((sum, r) => sum + (r.pricing?.total || 0), 0);
  const byCategory = {};
  allRes.forEach(r => {
    const cat = r.type === "boarding" ? "Boarding" : r.type === "daycare" ? "Daycare" : r.type === "evaluation" ? "Evaluation" : "Other";
    byCategory[cat] = (byCategory[cat] || 0) + (r.pricing?.total || 0);
  });
  return {
    total,
    count: allRes.length,
    byCategory,
    avgTransaction: allRes.length > 0 ? total / allRes.length : 0,
  };
}

// ─── Accrual Revenue Calculator ────────────────────────────────────────────
// Extracted from DashboardPage.jsx lines 448-492
function processAccrualDateRange(reservations, from, to) {
  const daysList = [];
  let cur = from;
  while (cur <= to) { daysList.push(cur); cur = addDays(cur, 1); }
  const dayData = {};
  daysList.forEach(d => {
    dayData[d] = { boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
  });
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
  const totals = { boardingRevenue: 0, daycareRevenue: 0, totalRevenue: 0, discounts: 0, netRevenue: 0, roomsOccupied: 0 };
  daysList.forEach(d => { Object.keys(totals).forEach(k => { totals[k] += dayData[d][k]; }); });
  return { dayData, totals, days: daysList };
}

// ─── Occupancy & RevPAR Calculator ─────────────────────────────────────────
function calcOccupancyAndRevPAR(accrualResult, totalRoomCount) {
  const occupancyRate = totalRoomCount > 0 && accrualResult.days.length > 0
    ? (accrualResult.totals.roomsOccupied / (totalRoomCount * accrualResult.days.length)) * 100
    : 0;
  const revPAR = totalRoomCount > 0 && accrualResult.days.length > 0
    ? accrualResult.totals.boardingRevenue / (totalRoomCount * accrualResult.days.length)
    : 0;
  return { occupancyRate, revPAR };
}

// ─── Discount Calculator ───────────────────────────────────────────────────
// Extracted from DashboardPage.jsx lines 509-528
function calcDiscountBreakdown(reservations) {
  const rackRates = LITE_DEF_PRICING.boardingRates;
  const boardingRes = reservations.filter(r =>
    r.status !== "cancelled" && r.type === "boarding"
  );
  let discounted = 0, atRack = 0, totalRackRevenue = 0, totalActualRevenue = 0;
  boardingRes.forEach(res => {
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

// ─── Revenue Trend Calculator ──────────────────────────────────────────────
function calcRevenueTrend(currentTotal, previousTotal) {
  return previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Cash Basis Revenue', () => {
  describe('basic calculations', () => {
    it('calculates total revenue from boarding reservations', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-out', pricing: { total: 285 }, checkIn: '2026-03-01' },
        { id: '2', type: 'boarding', status: 'checked-in', pricing: { total: 570 }, checkIn: '2026-03-03' },
      ];
      const result = calcCashBasisMetrics(reservations);
      expect(result.total).toBe(855);
      expect(result.count).toBe(2);
      expect(result.byCategory.Boarding).toBe(855);
    });

    it('calculates total with mixed service types', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-out', pricing: { total: 285 }, checkIn: '2026-03-01' },
        { id: '2', type: 'daycare', status: 'checked-out', pricing: { total: 45 }, checkIn: '2026-03-01' },
        { id: '3', type: 'evaluation', status: 'checked-out', pricing: { total: 25 }, checkIn: '2026-03-01' },
      ];
      const result = calcCashBasisMetrics(reservations);
      expect(result.total).toBe(355);
      expect(result.byCategory.Boarding).toBe(285);
      expect(result.byCategory.Daycare).toBe(45);
      expect(result.byCategory.Evaluation).toBe(25);
    });

    it('calculates average transaction correctly', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-out', pricing: { total: 100 }, checkIn: '2026-03-01' },
        { id: '2', type: 'boarding', status: 'checked-out', pricing: { total: 200 }, checkIn: '2026-03-02' },
        { id: '3', type: 'boarding', status: 'checked-out', pricing: { total: 300 }, checkIn: '2026-03-03' },
      ];
      const result = calcCashBasisMetrics(reservations);
      expect(result.avgTransaction).toBe(200);
    });
  });

  describe('filtering', () => {
    it('excludes cancelled reservations', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-out', pricing: { total: 285 }, checkIn: '2026-03-01' },
        { id: '2', type: 'boarding', status: 'cancelled', pricing: { total: 570 }, checkIn: '2026-03-01' },
      ];
      const result = calcCashBasisMetrics(reservations);
      expect(result.total).toBe(285);
      expect(result.count).toBe(1);
    });

    it('excludes reservations with zero pricing', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-out', pricing: { total: 285 }, checkIn: '2026-03-01' },
        { id: '2', type: 'boarding', status: 'checked-out', pricing: { total: 0 }, checkIn: '2026-03-01' },
      ];
      const result = calcCashBasisMetrics(reservations);
      expect(result.total).toBe(285);
      expect(result.count).toBe(1);
    });

    it('excludes reservations with null pricing', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-out', pricing: { total: 285 }, checkIn: '2026-03-01' },
        { id: '2', type: 'boarding', status: 'checked-out', pricing: null, checkIn: '2026-03-01' },
      ];
      const result = calcCashBasisMetrics(reservations);
      expect(result.total).toBe(285);
      expect(result.count).toBe(1);
    });
  });

  describe('zero/empty cases', () => {
    it('returns zero for empty reservations', () => {
      const result = calcCashBasisMetrics([]);
      expect(result.total).toBe(0);
      expect(result.count).toBe(0);
      expect(result.avgTransaction).toBe(0);
    });

    it('returns zero when all are cancelled', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'cancelled', pricing: { total: 285 }, checkIn: '2026-03-01' },
      ];
      const result = calcCashBasisMetrics(reservations);
      expect(result.total).toBe(0);
      expect(result.count).toBe(0);
    });
  });
});

describe('Accrual Revenue (Nightly Spreading)', () => {
  describe('single boarding reservation spreading', () => {
    it('spreads a 3-night stay evenly across nights', () => {
      // $285 for 3 nights = $95/night
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      // Check-in day through day before check-out
      expect(result.dayData['2026-03-01'].boardingRevenue).toBeCloseTo(95, 2);
      expect(result.dayData['2026-03-02'].boardingRevenue).toBeCloseTo(95, 2);
      expect(result.dayData['2026-03-03'].boardingRevenue).toBeCloseTo(95, 2);
      expect(result.totals.boardingRevenue).toBeCloseTo(285, 2);
    });

    it('spreads a 1-night stay to the check-in day only', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-02');
      expect(result.dayData['2026-03-01'].boardingRevenue).toBeCloseTo(95, 2);
      // Check-out day should NOT have revenue (night counted on check-in day)
      expect(result.dayData['2026-03-02'].boardingRevenue).toBe(0);
    });

    it('spreads a 7-night stay correctly', () => {
      // $665 for 7 nights = $95/night (Luxury Suite rate)
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-08', pricing: { total: 665 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-07');
      expect(result.totals.boardingRevenue).toBeCloseTo(665, 2);
      expect(result.totals.roomsOccupied).toBe(7); // 1 room × 7 nights
    });
  });

  describe('partial date range', () => {
    it('only counts nights within the requested date range', () => {
      // 5-night stay ($475) but only query 2 days
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-06', pricing: { total: 475 } },
      ];
      // Only look at March 3-4 (2 of the 5 nights)
      const result = processAccrualDateRange(reservations, '2026-03-03', '2026-03-04');
      const perNight = 475 / 5; // $95
      expect(result.totals.boardingRevenue).toBeCloseTo(perNight * 2, 2);
      expect(result.totals.roomsOccupied).toBe(2);
    });

    it('excludes revenue when reservation is completely outside range', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-10', checkOut: '2026-03-13', pricing: { total: 285 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-05');
      expect(result.totals.boardingRevenue).toBe(0);
      expect(result.totals.roomsOccupied).toBe(0);
    });
  });

  describe('multiple reservations', () => {
    it('sums revenue from multiple boarding reservations on same night', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
        { id: '2', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 75 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      expect(result.dayData['2026-03-01'].boardingRevenue).toBeCloseTo(170, 2);
      expect(result.dayData['2026-03-01'].roomsOccupied).toBe(2);
    });

    it('sums revenue from overlapping boarding stays', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } }, // $95/night
        { id: '2', type: 'boarding', status: 'checked-in', checkIn: '2026-03-02', checkOut: '2026-03-05', pricing: { total: 225 } }, // $75/night
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-04');
      // Mar 1: only res1 = $95
      expect(result.dayData['2026-03-01'].boardingRevenue).toBeCloseTo(95, 2);
      // Mar 2: res1 ($95) + res2 ($75) = $170
      expect(result.dayData['2026-03-02'].boardingRevenue).toBeCloseTo(170, 2);
      // Mar 3: res1 ($95) + res2 ($75) = $170
      expect(result.dayData['2026-03-03'].boardingRevenue).toBeCloseTo(170, 2);
      // Mar 4: only res2 = $75
      expect(result.dayData['2026-03-04'].boardingRevenue).toBeCloseTo(75, 2);
    });
  });

  describe('daycare revenue', () => {
    it('assigns full daycare cost to check-in day', () => {
      const reservations = [
        { id: '1', type: 'daycare', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-01', pricing: { total: 45 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      expect(result.dayData['2026-03-01'].daycareRevenue).toBe(45);
      expect(result.dayData['2026-03-01'].boardingRevenue).toBe(0);
      expect(result.dayData['2026-03-01'].totalRevenue).toBe(45);
    });

    it('does not spread daycare across multiple days', () => {
      const reservations = [
        { id: '1', type: 'daycare', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-01', pricing: { total: 45 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      expect(result.dayData['2026-03-01'].daycareRevenue).toBe(45);
      expect(result.dayData['2026-03-02'].daycareRevenue).toBe(0);
      expect(result.dayData['2026-03-03'].daycareRevenue).toBe(0);
    });

    it('excludes daycare outside date range', () => {
      const reservations = [
        { id: '1', type: 'daycare', status: 'checked-in', checkIn: '2026-03-10', checkOut: '2026-03-10', pricing: { total: 45 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-05');
      expect(result.totals.daycareRevenue).toBe(0);
    });
  });

  describe('mixed boarding + daycare', () => {
    it('correctly combines boarding and daycare on same day', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
        { id: '2', type: 'daycare', status: 'checked-in', checkIn: '2026-03-02', checkOut: '2026-03-02', pricing: { total: 45 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      // Mar 2: boarding $95 + daycare $45 = $140 total
      expect(result.dayData['2026-03-02'].boardingRevenue).toBeCloseTo(95, 2);
      expect(result.dayData['2026-03-02'].daycareRevenue).toBe(45);
      expect(result.dayData['2026-03-02'].totalRevenue).toBeCloseTo(140, 2);
    });

    it('totals correctly across full range', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
        { id: '2', type: 'daycare', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-01', pricing: { total: 45 } },
        { id: '3', type: 'daycare', status: 'checked-in', checkIn: '2026-03-02', checkOut: '2026-03-02', pricing: { total: 45 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      expect(result.totals.boardingRevenue).toBeCloseTo(285, 2);
      expect(result.totals.daycareRevenue).toBe(90);
      expect(result.totals.totalRevenue).toBeCloseTo(375, 2);
    });
  });

  describe('cancelled reservations', () => {
    it('excludes cancelled boarding reservations', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'cancelled', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      expect(result.totals.boardingRevenue).toBe(0);
      expect(result.totals.totalRevenue).toBe(0);
    });

    it('excludes cancelled daycare reservations', () => {
      const reservations = [
        { id: '1', type: 'daycare', status: 'cancelled', checkIn: '2026-03-01', checkOut: '2026-03-01', pricing: { total: 45 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      expect(result.totals.daycareRevenue).toBe(0);
    });
  });

  describe('zero-night / zero-price edge cases', () => {
    it('skips same-day boarding (zero nights)', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-01', pricing: { total: 95 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      expect(result.totals.boardingRevenue).toBe(0);
    });

    it('handles zero-priced boarding reservation', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 0 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      expect(result.totals.boardingRevenue).toBe(0);
      expect(result.totals.roomsOccupied).toBe(3); // rooms still occupied even if free
    });

    it('handles missing pricing object', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04' },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      expect(result.totals.boardingRevenue).toBe(0);
      expect(result.totals.roomsOccupied).toBe(3);
    });
  });

  describe('netRevenue calculation', () => {
    it('netRevenue equals totalRevenue when no discounts', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      expect(result.dayData['2026-03-01'].netRevenue).toBeCloseTo(95, 2);
      expect(result.dayData['2026-03-01'].totalRevenue).toBeCloseTo(95, 2);
    });
  });

  describe('day generation', () => {
    it('generates correct number of days in range', () => {
      const result = processAccrualDateRange([], '2026-03-01', '2026-03-07');
      expect(result.days).toHaveLength(7);
      expect(result.days[0]).toBe('2026-03-01');
      expect(result.days[6]).toBe('2026-03-07');
    });

    it('generates a single day for same-day range', () => {
      const result = processAccrualDateRange([], '2026-03-01', '2026-03-01');
      expect(result.days).toHaveLength(1);
      expect(result.days[0]).toBe('2026-03-01');
    });
  });
});

describe('Revenue Trend Calculation', () => {
  it('calculates positive trend correctly', () => {
    expect(calcRevenueTrend(1200, 1000)).toBeCloseTo(20, 2);
  });

  it('calculates negative trend correctly', () => {
    expect(calcRevenueTrend(800, 1000)).toBeCloseTo(-20, 2);
  });

  it('returns 0 when previous is zero (no division by zero)', () => {
    expect(calcRevenueTrend(1000, 0)).toBe(0);
  });

  it('returns 0 when both are zero', () => {
    expect(calcRevenueTrend(0, 0)).toBe(0);
  });

  it('calculates 100% increase correctly', () => {
    expect(calcRevenueTrend(2000, 1000)).toBeCloseTo(100, 2);
  });

  it('calculates 50% decrease correctly', () => {
    expect(calcRevenueTrend(500, 1000)).toBeCloseTo(-50, 2);
  });
});

describe('Discount Breakdown', () => {
  it('identifies at-rack reservation (no discount)', () => {
    const reservations = [
      {
        id: '1', type: 'boarding', status: 'checked-out',
        checkIn: '2026-03-01', checkOut: '2026-03-04',
        pricing: { total: 285 }, // 3 nights × $95 = $285 (Luxury Suite rack rate)
        _resTypeName: 'Boarding | Luxury Suite (All Inclusive)',
      },
    ];
    const result = calcDiscountBreakdown(reservations);
    expect(result.atRack).toBe(1);
    expect(result.discounted).toBe(0);
    expect(result.totalDiscounts).toBe(0);
  });

  it('identifies discounted reservation (>2% below rack)', () => {
    const reservations = [
      {
        id: '1', type: 'boarding', status: 'checked-out',
        checkIn: '2026-03-01', checkOut: '2026-03-04',
        pricing: { total: 240 }, // 3 nights × $95 = $285 rack; $240 actual = 15.8% discount
        _resTypeName: 'Boarding | Luxury Suite (All Inclusive)',
      },
    ];
    const result = calcDiscountBreakdown(reservations);
    expect(result.discounted).toBe(1);
    expect(result.atRack).toBe(0);
    expect(result.totalDiscounts).toBe(45); // $285 - $240
    expect(result.totalRackRevenue).toBe(285);
    expect(result.totalActualRevenue).toBe(240);
  });

  it('considers within 2% tolerance as at-rack', () => {
    // 3 nights Luxury Suite: rack = $285, actual = $280 = 1.75% off (within 2% tolerance)
    const reservations = [
      {
        id: '1', type: 'boarding', status: 'checked-out',
        checkIn: '2026-03-01', checkOut: '2026-03-04',
        pricing: { total: 280 },
        _resTypeName: 'Boarding | Luxury Suite (All Inclusive)',
      },
    ];
    const result = calcDiscountBreakdown(reservations);
    expect(result.atRack).toBe(1);
    expect(result.discounted).toBe(0);
  });

  it('handles multiple room types correctly', () => {
    const reservations = [
      {
        id: '1', type: 'boarding', status: 'checked-out',
        checkIn: '2026-03-01', checkOut: '2026-03-04',
        pricing: { total: 285 }, // 3 × $95 Luxury Suite
        _resTypeName: 'Boarding | Luxury Suite (All Inclusive)',
      },
      {
        id: '2', type: 'boarding', status: 'checked-out',
        checkIn: '2026-03-01', checkOut: '2026-03-04',
        pricing: { total: 150 }, // 3 × $75 = $225 rack, $150 actual → discounted
        _resTypeName: 'Boarding | Executive Room (All Inclusive)',
      },
    ];
    const result = calcDiscountBreakdown(reservations);
    expect(result.atRack).toBe(1);
    expect(result.discounted).toBe(1);
    expect(result.totalRackRevenue).toBe(510); // $285 + $225
    expect(result.totalActualRevenue).toBe(435); // $285 + $150
    expect(result.totalDiscounts).toBe(75);
  });

  it('excludes cancelled reservations', () => {
    const reservations = [
      {
        id: '1', type: 'boarding', status: 'cancelled',
        checkIn: '2026-03-01', checkOut: '2026-03-04',
        pricing: { total: 285 },
        _resTypeName: 'Boarding | Luxury Suite (All Inclusive)',
      },
    ];
    const result = calcDiscountBreakdown(reservations);
    expect(result.atRack).toBe(0);
    expect(result.discounted).toBe(0);
    expect(result.totalRackRevenue).toBe(0);
  });

  it('handles unknown room type (0 rack rate)', () => {
    const reservations = [
      {
        id: '1', type: 'boarding', status: 'checked-out',
        checkIn: '2026-03-01', checkOut: '2026-03-04',
        pricing: { total: 200 },
        _resTypeName: 'Unknown Room Type',
      },
    ];
    const result = calcDiscountBreakdown(reservations);
    // With 0 rack rate, expectedRack is 0, so the condition `expectedRack > 0` is false → atRack
    expect(result.atRack).toBe(1);
    expect(result.discounted).toBe(0);
  });

  it('returns zero totals for empty reservations', () => {
    const result = calcDiscountBreakdown([]);
    expect(result.discounted).toBe(0);
    expect(result.atRack).toBe(0);
    expect(result.totalRackRevenue).toBe(0);
    expect(result.totalActualRevenue).toBe(0);
    expect(result.totalDiscounts).toBe(0);
  });
});

describe('Default Pricing Constants', () => {
  it('has correct Luxury Suite rate', () => {
    expect(LITE_DEF_PRICING.boardingRates["Luxury Suite"]).toBe(95);
  });

  it('has correct Executive Room rate', () => {
    expect(LITE_DEF_PRICING.boardingRates["Executive Room"]).toBe(75);
  });

  it('has correct Double Compartment rate', () => {
    expect(LITE_DEF_PRICING.boardingRates["Double Compartment"]).toBe(65);
  });

  it('has correct Single Compartment rate', () => {
    expect(LITE_DEF_PRICING.boardingRates["Single Compartment"]).toBe(55);
  });

  it('has correct daycare full-day rate', () => {
    expect(LITE_DEF_PRICING.daycareRates.fullDay).toBe(45);
  });

  it('has correct daycare half-day rate', () => {
    expect(LITE_DEF_PRICING.daycareRates.halfDay).toBe(30);
  });

  it('has correct half-day threshold', () => {
    expect(LITE_DEF_PRICING.halfDayThreshold).toBe(5);
  });

  it('has correct multi-dog discount', () => {
    expect(LITE_DEF_PRICING.multiDogDiscount).toBe(20);
  });
});

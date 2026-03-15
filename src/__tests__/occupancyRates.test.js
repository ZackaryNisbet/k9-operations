// Tests for occupancy rate and RevPAR calculations
// Extracted from DashboardPage.jsx and reportHelpers.js

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

// ─── Accrual Processing (same as in revenueCalculations.test.js) ───────────
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

// ─── Occupancy & RevPAR (from DashboardPage.jsx line 489-490) ──────────────
function calcOccupancyAndRevPAR(accrualResult, totalRoomCount) {
  const occupancyRate = totalRoomCount > 0 && accrualResult.days.length > 0
    ? (accrualResult.totals.roomsOccupied / (totalRoomCount * accrualResult.days.length)) * 100
    : 0;
  const revPAR = totalRoomCount > 0 && accrualResult.days.length > 0
    ? accrualResult.totals.boardingRevenue / (totalRoomCount * accrualResult.days.length)
    : 0;
  return { occupancyRate, revPAR };
}

// ─── Daily Report Occupancy (from reportHelpers.js lines 48-55) ────────────
function calcDailyReportOccupancy(activeBoarding, rooms) {
  let totalCapacity = 0;
  Object.values(rooms).forEach((roomList) => {
    if (Array.isArray(roomList)) totalCapacity += roomList.length;
  });
  const occupancyRate = totalCapacity > 0
    ? Math.round((activeBoarding.length / totalCapacity) * 100)
    : 0;
  return { occupancyRate, totalCapacity };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Occupancy Rate (Accrual-based)', () => {
  describe('basic occupancy', () => {
    it('calculates 100% occupancy when all rooms filled every night', () => {
      const totalRooms = 2;
      // 2 dogs boarding for 3 nights = 6 room-nights used, 2 rooms × 3 days = 6 capacity
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
        { id: '2', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 225 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, totalRooms);
      expect(occupancyRate).toBeCloseTo(100, 0);
    });

    it('calculates 50% occupancy correctly', () => {
      const totalRooms = 4;
      // 2 dogs in 4-room facility for 1 night
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
        { id: '2', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 75 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, totalRooms);
      expect(occupancyRate).toBeCloseTo(50, 0);
    });

    it('calculates 0% occupancy when no boarders', () => {
      const totalRooms = 10;
      const result = processAccrualDateRange([], '2026-03-01', '2026-03-07');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, totalRooms);
      expect(occupancyRate).toBe(0);
    });

    it('calculates 25% occupancy (1 of 4 rooms, 1 night)', () => {
      const totalRooms = 4;
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, totalRooms);
      expect(occupancyRate).toBeCloseTo(25, 0);
    });
  });

  describe('multi-day occupancy', () => {
    it('averages occupancy over multiple days', () => {
      const totalRooms = 2;
      // Day 1: 2 rooms occupied, Day 2: 1 room occupied, Day 3: 0 rooms
      // Total: 3 room-nights / (2 rooms × 3 days) = 50%
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-03', pricing: { total: 190 } }, // 2 nights
        { id: '2', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },  // 1 night
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, totalRooms);
      // Total room-nights: 2 (day 1) + 1 (day 2) + 0 (day 3) = 3
      // Available: 2 rooms × 3 days = 6
      expect(occupancyRate).toBeCloseTo(50, 0);
    });
  });

  describe('edge cases', () => {
    it('returns 0 when totalRoomCount is 0', () => {
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, 0);
      expect(occupancyRate).toBe(0);
    });

    it('daycare does not count toward room occupancy', () => {
      const totalRooms = 4;
      const reservations = [
        { id: '1', type: 'daycare', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-01', pricing: { total: 45 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, totalRooms);
      expect(occupancyRate).toBe(0);
    });

    it('can exceed 100% if more dogs than rooms (double occupancy)', () => {
      const totalRooms = 2;
      // 3 dogs in 2-room facility
      const reservations = [
        { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
        { id: '2', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 75 } },
        { id: '3', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 65 } },
      ];
      const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
      const { occupancyRate } = calcOccupancyAndRevPAR(result, totalRooms);
      expect(occupancyRate).toBeCloseTo(150, 0);
    });
  });
});

describe('RevPAR (Revenue Per Available Room)', () => {
  it('calculates RevPAR for single-night, single-room scenario', () => {
    const totalRooms = 1;
    const reservations = [
      { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
    ];
    const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
    const { revPAR } = calcOccupancyAndRevPAR(result, totalRooms);
    expect(revPAR).toBeCloseTo(95, 2);
  });

  it('divides revenue by total available room-nights', () => {
    const totalRooms = 4;
    // 1 dog for 1 night paying $95
    const reservations = [
      { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-02', pricing: { total: 95 } },
    ];
    const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
    const { revPAR } = calcOccupancyAndRevPAR(result, totalRooms);
    // RevPAR = $95 / (4 rooms × 1 day) = $23.75
    expect(revPAR).toBeCloseTo(23.75, 2);
  });

  it('calculates RevPAR over multi-day range', () => {
    const totalRooms = 2;
    // 1 dog, 3 nights at $285 total = $95/night boarding revenue
    const reservations = [
      { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
    ];
    const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
    const { revPAR } = calcOccupancyAndRevPAR(result, totalRooms);
    // RevPAR = $285 / (2 rooms × 3 days) = $47.50
    expect(revPAR).toBeCloseTo(47.50, 2);
  });

  it('returns 0 RevPAR when no boarding revenue', () => {
    const totalRooms = 4;
    const result = processAccrualDateRange([], '2026-03-01', '2026-03-07');
    const { revPAR } = calcOccupancyAndRevPAR(result, totalRooms);
    expect(revPAR).toBe(0);
  });

  it('returns 0 RevPAR when totalRoomCount is 0', () => {
    const reservations = [
      { id: '1', type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04', pricing: { total: 285 } },
    ];
    const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-03');
    const { revPAR } = calcOccupancyAndRevPAR(result, 0);
    expect(revPAR).toBe(0);
  });

  it('excludes daycare from RevPAR (boarding only)', () => {
    const totalRooms = 2;
    const reservations = [
      { id: '1', type: 'daycare', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-01', pricing: { total: 45 } },
    ];
    const result = processAccrualDateRange(reservations, '2026-03-01', '2026-03-01');
    const { revPAR } = calcOccupancyAndRevPAR(result, totalRooms);
    // Daycare revenue is NOT included in boarding revenue
    expect(revPAR).toBe(0);
  });
});

describe('Daily Report Occupancy (Point-in-Time)', () => {
  it('calculates occupancy from room counts', () => {
    const activeBoarding = [{ id: '1' }, { id: '2' }, { id: '3' }]; // 3 dogs boarding
    const rooms = {
      "Luxury Suite": ["LS1", "LS2"],
      "Executive Room": ["ER1", "ER2", "ER3"],
      "Single Compartment": ["SC1", "SC2", "SC3", "SC4", "SC5"],
    };
    const { occupancyRate, totalCapacity } = calcDailyReportOccupancy(activeBoarding, rooms);
    expect(totalCapacity).toBe(10);
    expect(occupancyRate).toBe(30); // 3/10 × 100 = 30%
  });

  it('returns 0% with no boarding dogs', () => {
    const rooms = { "Luxury Suite": ["LS1", "LS2"] };
    const { occupancyRate } = calcDailyReportOccupancy([], rooms);
    expect(occupancyRate).toBe(0);
  });

  it('returns 0% with no rooms', () => {
    const activeBoarding = [{ id: '1' }];
    const { occupancyRate, totalCapacity } = calcDailyReportOccupancy(activeBoarding, {});
    expect(totalCapacity).toBe(0);
    expect(occupancyRate).toBe(0);
  });

  it('returns 100% at full capacity', () => {
    const activeBoarding = [{ id: '1' }, { id: '2' }];
    const rooms = { "Luxury Suite": ["LS1", "LS2"] };
    const { occupancyRate } = calcDailyReportOccupancy(activeBoarding, rooms);
    expect(occupancyRate).toBe(100);
  });

  it('rounds to nearest integer', () => {
    const activeBoarding = [{ id: '1' }]; // 1 of 3 = 33.33%
    const rooms = { "Luxury Suite": ["LS1", "LS2", "LS3"] };
    const { occupancyRate } = calcDailyReportOccupancy(activeBoarding, rooms);
    expect(occupancyRate).toBe(33); // Math.round(33.33)
  });

  it('handles non-array room values gracefully', () => {
    const rooms = {
      "Luxury Suite": ["LS1", "LS2"],
      "Other": null, // not an array
    };
    const { totalCapacity } = calcDailyReportOccupancy([], rooms);
    expect(totalCapacity).toBe(2); // only counts array values
  });
});

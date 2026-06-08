import { todayStr, addDays } from "../../../shared/theme";

/* ═══════════════════════════════════════════════════════════════════════════
   Demo location data generator
   For real usage, this pulls from Supabase across location_ids.
   The structure mirrors the data object shape from the page contract.
   ═══════════════════════════════════════════════════════════════════════════ */
export function generateLocationData() {
  return [
    {
      id: "cherry-hill",
      name: "Adair Forsythe",
      region: "New Jersey",
      totalDogs: 47,
      boardingDogs: 32,
      daycareDogs: 15,
      arriving: 8,
      goingHome: 6,
      totalRooms: 42,
      occupiedRooms: 32,
      occupancyRate: 76.2,
      revenueTotal: 48720,
      revenuePrev: 42100,
      revenueTrend: 15.7,
      boardingRevenue: 35800,
      daycareRevenue: 12920,
      avgTransaction: 285,
      bookings: 171,
      bookingsPrev: 158,
      newLeads: 24,
      contacted: 18,
      newCustomers: 9,
      conversionRate: 37.5,
      churnRate: 4.2,
      avgLTV: 1850,
      opsCompletion: 92,
      staffCount: 14,
      revPAR: 38.50,
      revenueByDay: generateDailyRevenue(48720, 30, 0.85),
      occupancyByDay: generateDailyOccupancy(76.2, 30, 0.9),
    },
    {
      id: "mount-laurel",
      name: "Mount Laurel",
      region: "New Jersey",
      totalDogs: 38,
      boardingDogs: 25,
      daycareDogs: 13,
      arriving: 5,
      goingHome: 7,
      totalRooms: 36,
      occupiedRooms: 25,
      occupancyRate: 69.4,
      revenueTotal: 39450,
      revenuePrev: 36200,
      revenueTrend: 8.9,
      boardingRevenue: 28200,
      daycareRevenue: 11250,
      avgTransaction: 268,
      bookings: 147,
      bookingsPrev: 139,
      newLeads: 19,
      contacted: 14,
      newCustomers: 7,
      conversionRate: 36.8,
      churnRate: 5.1,
      avgLTV: 1720,
      opsCompletion: 88,
      staffCount: 12,
      revPAR: 34.20,
      revenueByDay: generateDailyRevenue(39450, 30, 0.78),
      occupancyByDay: generateDailyOccupancy(69.4, 30, 0.85),
    },
    {
      id: "princeton",
      name: "Princeton",
      region: "New Jersey",
      totalDogs: 52,
      boardingDogs: 38,
      daycareDogs: 14,
      arriving: 9,
      goingHome: 8,
      totalRooms: 48,
      occupiedRooms: 40,
      occupancyRate: 83.3,
      revenueTotal: 62100,
      revenuePrev: 54800,
      revenueTrend: 13.3,
      boardingRevenue: 46500,
      daycareRevenue: 15600,
      avgTransaction: 310,
      bookings: 200,
      bookingsPrev: 185,
      newLeads: 31,
      contacted: 25,
      newCustomers: 14,
      conversionRate: 45.2,
      churnRate: 2.8,
      avgLTV: 2100,
      opsCompletion: 96,
      staffCount: 16,
      revPAR: 42.70,
      revenueByDay: generateDailyRevenue(62100, 30, 0.92),
      occupancyByDay: generateDailyOccupancy(83.3, 30, 0.95),
    },
    {
      id: "moorestown",
      name: "Moorestown",
      region: "New Jersey",
      totalDogs: 28,
      boardingDogs: 18,
      daycareDogs: 10,
      arriving: 4,
      goingHome: 3,
      totalRooms: 30,
      occupiedRooms: 18,
      occupancyRate: 60.0,
      revenueTotal: 26300,
      revenuePrev: 28900,
      revenueTrend: -9.0,
      boardingRevenue: 18400,
      daycareRevenue: 7900,
      avgTransaction: 248,
      bookings: 106,
      bookingsPrev: 118,
      newLeads: 12,
      contacted: 8,
      newCustomers: 4,
      conversionRate: 33.3,
      churnRate: 7.8,
      avgLTV: 1540,
      opsCompletion: 74,
      staffCount: 9,
      revPAR: 28.40,
      revenueByDay: generateDailyRevenue(26300, 30, 0.65),
      occupancyByDay: generateDailyOccupancy(60.0, 30, 0.7),
    },
    {
      id: "hamilton",
      name: "Mercer",
      region: "New Jersey",
      totalDogs: 34,
      boardingDogs: 22,
      daycareDogs: 12,
      arriving: 6,
      goingHome: 5,
      totalRooms: 34,
      occupiedRooms: 24,
      occupancyRate: 70.6,
      revenueTotal: 35800,
      revenuePrev: 33100,
      revenueTrend: 8.2,
      boardingRevenue: 25600,
      daycareRevenue: 10200,
      avgTransaction: 272,
      bookings: 132,
      bookingsPrev: 125,
      newLeads: 17,
      contacted: 12,
      newCustomers: 6,
      conversionRate: 35.3,
      churnRate: 5.5,
      avgLTV: 1680,
      opsCompletion: 85,
      staffCount: 11,
      revPAR: 32.80,
      revenueByDay: generateDailyRevenue(35800, 30, 0.75),
      occupancyByDay: generateDailyOccupancy(70.6, 30, 0.82),
    },
  ];
}

export function generateDailyRevenue(total, days, consistency) {
  const avg = total / days;
  const result = [];
  const today = todayStr();
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const variance = 1 + (Math.sin(i * 0.8) * (1 - consistency));
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    const weekendBoost = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.15 : 1;
    result.push({ date, value: Math.round(avg * variance * weekendBoost) });
  }
  return result;
}

export function generateDailyOccupancy(avg, days, consistency) {
  const result = [];
  const today = todayStr();
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const variance = 1 + (Math.cos(i * 0.6) * (1 - consistency) * 0.5);
    const dayOfWeek = new Date(date + "T00:00:00").getDay();
    const weekendBoost = (dayOfWeek === 5 || dayOfWeek === 6) ? 1.08 : 1;
    result.push({ date, value: Math.min(100, Math.round(avg * variance * weekendBoost * 10) / 10) });
  }
  return result;
}

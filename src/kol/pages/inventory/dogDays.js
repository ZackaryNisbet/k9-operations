// Dog-day helpers extracted from InventoryPage.jsx.

import { addDateDays, computeDogDaysForRange } from "../inventoryDepletion";

export function getDogDaysForWeek(reservations, weekStart, cycleDays = 7) {
  const end = addDateDays(weekStart, Math.max(0, cycleDays - 1));
  return computeDogDaysForRange(reservations, weekStart, end);
}

export function getAvgDogsPerDay(reservations, weekStart, cycleDays = 7) {
  if (!reservations || !reservations.length) return 0;
  const start = new Date(weekStart + "T00:00:00");
  let total = 0;
  for (let d = 0; d < cycleDays; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const dayStr = day.toISOString().split('T')[0];
    const dogsThisDay = reservations.filter(r =>
      r.status !== "cancelled" && r.checkIn <= dayStr && r.checkOut >= dayStr
    ).length;
    total += dogsThisDay;
  }
  return Math.round(total / Math.max(1, cycleDays));
}

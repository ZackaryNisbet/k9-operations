function toDashboardCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

export function formatBoardingDaycareSubtext({ boarding, daycare, total, fallbackLabel }) {
  const boardingCount = toDashboardCount(boarding);
  const daycareCount = toDashboardCount(daycare);
  if (boardingCount !== null || daycareCount !== null) {
    return `${boardingCount ?? 0}B · ${daycareCount ?? 0}D`;
  }

  const totalCount = toDashboardCount(total);
  if (totalCount !== null) return `${totalCount} ${totalCount === 1 ? "dog" : "dogs"}`;
  return fallbackLabel;
}

export function formatRoomsOccupiedSubtext({ occupied, total, occupancyPct }) {
  const totalCount = toDashboardCount(total);
  let occupiedCount = toDashboardCount(occupied);
  if (occupiedCount === null && totalCount !== null) {
    const pct = Number(occupancyPct);
    if (Number.isFinite(pct)) {
      occupiedCount = Math.max(0, Math.round((pct / 100) * totalCount));
    }
  }

  if (occupiedCount !== null && totalCount !== null) return `${occupiedCount}/${totalCount} rooms occupied`;
  if (occupiedCount !== null) return `${occupiedCount} rooms occupied`;
  if (totalCount !== null) return `0/${totalCount} rooms occupied`;
  return "Rooms occupied";
}

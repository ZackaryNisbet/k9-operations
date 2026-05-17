export const SCHEDULING_MATRIX_BACKFILL_MAX_RANGE_DAYS = 370;
export const SCHEDULING_MATRIX_BACKFILL_STALE_AFTER_MS = 10 * 60 * 1000;

export function countDateSpanInclusive(dateFrom: string, dateTo: string) {
  const from = new Date(`${dateFrom}T12:00:00`).getTime();
  const to = new Date(`${dateTo}T12:00:00`).getTime();
  return Math.round((to - from) / 86400000) + 1;
}

export function isSchedulingBackfillRangeAllowed(dateFrom: string, dateTo: string) {
  return countDateSpanInclusive(dateFrom, dateTo) <= SCHEDULING_MATRIX_BACKFILL_MAX_RANGE_DAYS;
}

export function isGlobalSchedulingBackfillAdmin(role: string) {
  return ["owner", "enterprise_admin", "developer", "multi_location_admin"].includes(role);
}

export function hasSchedulingBackfillLocationAccess(profile: any, locationId: string, write = false) {
  const role = String(profile?.role || "");
  const profileLocationId = String(profile?.location_id || "");
  if (isGlobalSchedulingBackfillAdmin(role)) return true;
  if (write) return role === "location_admin" && profileLocationId === locationId;
  return profileLocationId === locationId;
}

export function isSchedulingBackfillRunStale(run: any, nowMs = Date.now()) {
  if (!["queued", "running"].includes(String(run?.status || ""))) return false;
  const updatedAt = Date.parse(String(run?.updated_at || run?.created_at || ""));
  if (!Number.isFinite(updatedAt)) return false;
  return nowMs - updatedAt > SCHEDULING_MATRIX_BACKFILL_STALE_AFTER_MS;
}

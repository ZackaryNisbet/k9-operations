export const BOH_SNAPSHOT_STALE_MS = 60 * 1000;

export function getBohSnapshotAgeMs(updatedAt, nowMs = Date.now()) {
  if (!updatedAt) return Infinity;
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedMs)) return Infinity;
  return Math.max(0, nowMs - updatedMs);
}

export function isBohSnapshotStale(updatedAt, nowMs = Date.now(), staleMs = BOH_SNAPSHOT_STALE_MS) {
  return getBohSnapshotAgeMs(updatedAt, nowMs) > staleMs;
}

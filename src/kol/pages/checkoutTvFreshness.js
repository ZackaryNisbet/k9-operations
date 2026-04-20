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

export function normalizeBohTransitionGroups({
  arrivals = [],
  departures = [],
  currentDogCount,
  previousDogCount,
} = {}) {
  const current = Number(currentDogCount);
  const previous = Number(previousDogCount);
  const hasReliableCounts = Number.isFinite(current) && Number.isFinite(previous);

  if (!hasReliableCounts || current === previous || (arrivals.length > 0 && departures.length > 0)) {
    return { arrivals, departures, correction: null };
  }

  if (current > previous && departures.length > 0 && arrivals.length === 0) {
    return {
      arrivals: departures,
      departures: [],
      correction: "count-increased-departures-treated-as-arrivals",
    };
  }

  if (current < previous && arrivals.length > 0 && departures.length === 0) {
    return {
      arrivals: [],
      departures: arrivals,
      correction: "count-decreased-arrivals-treated-as-departures",
    };
  }

  return { arrivals, departures, correction: null };
}

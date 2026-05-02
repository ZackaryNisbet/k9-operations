export const BOH_SNAPSHOT_STALE_MS = 60 * 1000;
export const PHOTO_SYNC_STALE_MS = 30 * 60 * 1000;

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

export function selectCheckoutPhotoUrl(row = {}) {
  const imageUrl = typeof row.image_url === "string" ? row.image_url.trim() : "";
  const localPhotoUrl = typeof row.local_photo_url === "string" ? row.local_photo_url.trim() : "";
  const photoSyncedFrom = typeof row.photo_synced_from === "string" ? row.photo_synced_from.trim() : "";

  if (localPhotoUrl && (!imageUrl || photoSyncedFrom === imageUrl)) {
    return localPhotoUrl;
  }

  return imageUrl;
}

export function derivePhotoSyncHealth(syncState, nowMs = Date.now(), staleMs = PHOTO_SYNC_STALE_MS) {
  if (!syncState) {
    return {
      status: "warning",
      error: null,
      lastSuccessAt: null,
      details: {
        "Server Photo Pull": "No sync state",
      },
    };
  }

  const errorMessage = typeof syncState.error_message === "string" ? syncState.error_message.trim() : "";
  if (syncState.status === "syncing") {
    return {
      status: "running",
      error: null,
      lastSuccessAt: syncState.last_sync_at || null,
      details: {
        "Server Photo Pull": "Running",
        "Last Photo Pull": syncState.last_sync_at || "In progress",
      },
    };
  }

  if (syncState.status === "error" || errorMessage) {
    return {
      status: "critical",
      error: errorMessage || "Server photo pull failed",
      lastSuccessAt: syncState.last_sync_at || null,
      details: {
        "Server Photo Pull": "Error",
        "Last Photo Pull": syncState.last_sync_at || "Never",
      },
    };
  }

  const ageMs = getBohSnapshotAgeMs(syncState.last_sync_at, nowMs);
  if (!Number.isFinite(ageMs) || ageMs > staleMs) {
    return {
      status: "warning",
      error: null,
      lastSuccessAt: syncState.last_sync_at || null,
      details: {
        "Server Photo Pull": "Stale",
        "Last Photo Pull": syncState.last_sync_at || "Never",
      },
    };
  }

  return {
    status: "healthy",
    error: null,
    lastSuccessAt: syncState.last_sync_at || null,
    details: {
      "Server Photo Pull": "Fresh",
      "Last Photo Pull": syncState.last_sync_at || "Never",
      "Photos Downloaded": Number(syncState.records_synced || 0),
    },
  };
}

// K9 Operations — Dashboard localStorage Cache
// Per-timeframe caching with stale-while-revalidate pattern.
// On load: show cached data instantly → fetch fresh in background → swap when ready.

const CACHE_PREFIX = 'k9_dash_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — fresh data
const STALE_TTL = 30 * 60 * 1000; // 30 minutes — stale but usable while revalidating

function cacheKey(locationId, dateFrom, dateTo) {
  return `${CACHE_PREFIX}${locationId}_${dateFrom}_${dateTo}`;
}

export function getCachedMetrics(locationId, dateFrom, dateTo) {
  try {
    const key = cacheKey(locationId, dateFrom, dateTo);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    if (age > STALE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return { data, isFresh: age <= CACHE_TTL, timestamp };
  } catch {
    return null;
  }
}

export function setCachedMetrics(locationId, dateFrom, dateTo, data) {
  try {
    const key = cacheKey(locationId, dateFrom, dateTo);
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
    // Prune old entries to prevent localStorage bloat (keep last 10)
    pruneOldEntries();
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function pruneOldEntries() {
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const { timestamp } = JSON.parse(raw);
          entries.push({ key, timestamp });
        }
      }
    }
    if (entries.length > 10) {
      entries.sort((a, b) => a.timestamp - b.timestamp);
      entries.slice(0, entries.length - 10).forEach(e => localStorage.removeItem(e.key));
    }
  } catch {}
}

// Legacy exports for backward compatibility
export function getCachedData() { return null; }
export function setCachedData() {}
export function clearCachedData() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {}
}

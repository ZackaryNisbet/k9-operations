// K9 Operations — Dashboard localStorage Cache
// Provides instant-load cached data with 5-min TTL.
// On page load: show cached → fetch fresh in background → update when ready.

const CACHE_KEY = 'k9_dashboard_cache';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes — matches default refresh interval

export function getCachedData() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function clearCachedData() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

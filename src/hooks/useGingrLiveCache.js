// Deprecated compatibility hook.
// Live GINGR reads are server-owned; browser dashboards read Supabase only.

/**
 * useGingrLiveCache(locationId)
 *
 * Returns:
 *   liveRows  — always empty; same-day freshness comes from server sync
 *   ready     — true
 */
export function useGingrLiveCache(locationId) {
  void locationId;
  return { liveRows: [], ready: true };
}

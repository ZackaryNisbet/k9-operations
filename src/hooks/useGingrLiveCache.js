// useGingrLiveCache.js — DEPRECATED (Phase 2)
// All reservation data now comes from Supabase (synced every 5 minutes).
// This hook is kept as a no-op to avoid breaking imports.

/**
 * useGingrLiveCache — no-op, returns empty rows and ready=true.
 */
export function useGingrLiveCache() {
  return { liveRows: [], ready: true };
}

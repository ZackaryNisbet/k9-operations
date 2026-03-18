// gingrLive.js — DEPRECATED (Phase 2)
// All reservation data now comes from Supabase (synced every 5 minutes by server-side cron).
// These functions are kept as no-ops to avoid breaking imports.

/**
 * fetchTodayGingrReservations — no-op, returns empty array.
 * Data is now fresh in gingr_reservations via 5-minute today-sync cron.
 */
export async function fetchTodayGingrReservations() {
  return [];
}

/**
 * mergeGingrLive — no-op, returns supabaseRows unchanged.
 * No live Gingr merge needed; Supabase data is fresh enough.
 */
export function mergeGingrLive(supabaseRows) {
  return supabaseRows || [];
}

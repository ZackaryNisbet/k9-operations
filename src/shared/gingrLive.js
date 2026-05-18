// Compatibility helpers for historical Dashboard code.
// Browser code must not call Gingr directly; same-day freshness is server-owned.

/**
 * mergeGingrLive(supabaseRows, gingrLiveRows)
 *
 * Merges Supabase rows with live Gingr rows, deduplicating by gingr_id.
 * Live rows take precedence (they're fresher).
 */
export function mergeGingrLive(supabaseRows, gingrLiveRows) {
  if (!gingrLiveRows || gingrLiveRows.length === 0) return supabaseRows || [];

  const existing = new Set((supabaseRows || []).map((r) => r.gingr_id));
  const newRows = gingrLiveRows.filter(
    (r) => r.cancelled_date == null && !existing.has(r.gingr_id)
  );
  return [...(supabaseRows || []), ...newRows];
}

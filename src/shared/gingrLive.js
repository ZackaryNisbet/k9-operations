// TODO: Remove this file once gingr-sync frequency is sufficient (target: <5 min).
// This calls the Gingr API directly from the browser, which violates the
// architecture rule (client should only read Supabase). It's kept as a
// best-effort merge layer for same-day reservations that haven't synced yet.
//
// Fetches today's reservations directly from Gingr API and converts
// them to the same row shape as gingr_reservations in Supabase.
// Used to supplement Supabase data when the sync hasn't run yet today,
// so that daycare/day-boarding (same-day reservations) appear immediately.

import { supabase } from "../supabaseClient";

/**
 * fetchTodayGingrReservations(locationId, today)
 *
 * 1. Loads Gingr credentials from lite_settings
 * 2. Calls the Gingr reservations API for today's date
 * 3. Returns rows in the same shape as gingr_reservations Supabase rows
 *
 * Returns [] on any error (best-effort; Supabase data is still the primary source).
 */
export async function fetchTodayGingrReservations(locationId, today) {
  try {
    // Load Gingr config
    const { data: cfgRows } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "gingr_config")
      .limit(1);

    const cfg = cfgRows?.[0]?.setting_value;
    if (!cfg?.api_key || !cfg?.subdomain) return [];

    // Fetch today's reservations from Gingr (all, not just checked-in)
    const resp = await fetch(
      `https://${cfg.subdomain}.gingrapp.com/api/v1/reservations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: new URLSearchParams({
          key: cfg.api_key,
          start_date: today,
          end_date: today,
        }),
      }
    );
    if (!resp.ok) return [];

    const json = await resp.json();
    const resData = json.data || {};
    const reservations = Object.values(resData);

    // Convert to Supabase row shape
    return reservations.map((r) => ({
      gingr_id: String(r.reservation_id),
      animal_name: r.animal?.name || null,
      owner_first_name: r.owner?.first_name?.trim() || null,
      owner_last_name: r.owner?.last_name?.trim() || null,
      reservation_type_name: r.reservation_type?.type || null,
      start_date: r.start_date || null,
      end_date: r.end_date || null,
      deposit: r.deposit || null,
      transaction: r.transaction || null,
      cancelled_date: r.cancelled_date || null,
      services: r.services || null,
    }));
  } catch (err) {
    console.warn("Failed to fetch live Gingr reservations:", err);
    return [];
  }
}

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

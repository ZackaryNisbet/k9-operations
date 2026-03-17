// Background polling cache for live Gingr reservations.
// Polls fetchTodayGingrReservations every 60s and caches the result.
// Instantiate once at the dashboard level; consumers read from the cache
// without blocking on their own fetches.

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTodayGingrReservations } from "../shared/gingrLive";

const POLL_INTERVAL = 60000; // 60 seconds

/**
 * useGingrLiveCache(locationId)
 *
 * Returns:
 *   liveRows  — cached Gingr reservation rows ([] until first fetch completes)
 *   ready     — true once the first fetch has completed
 */
export function useGingrLiveCache(locationId) {
  const [liveRows, setLiveRows] = useState([]);
  const [ready, setReady] = useState(false);
  const cancelledRef = useRef(false);

  const fetchLive = useCallback(async () => {
    if (!locationId) return;
    const today = new Date().toISOString().split("T")[0];
    const rows = await fetchTodayGingrReservations(locationId, today);
    if (!cancelledRef.current) {
      setLiveRows(rows);
      setReady(true);
    }
  }, [locationId]);

  useEffect(() => {
    cancelledRef.current = false;

    // Fetch immediately on mount
    fetchLive();

    // Then poll every 60s
    const interval = setInterval(fetchLive, POLL_INTERVAL);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [fetchLive]);

  return { liveRows, ready };
}

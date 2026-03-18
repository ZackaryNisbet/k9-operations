// K9 Operations — Realtime subscription for lite_daily_ops
// Subscribes to postgres_changes so cross-device updates appear in <3s.

import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * Subscribes to INSERT/UPDATE on lite_daily_ops for the given locationId.
 * Merges incoming rows into the local dailyOps state via setDailyOps.
 * Skips self-originated writes using a timestamp guard.
 */
export default function useRealtimeOps(locationId, setDailyOps) {
  // Track last local write timestamp to avoid double-applying our own changes
  const lastLocalWrite = useRef(0);

  useEffect(() => {
    if (!locationId) return;

    const channel = supabase
      .channel("ops-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lite_daily_ops",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          // Skip if this event arrived within 2s of our own write (likely our own echo)
          if (Date.now() - lastLocalWrite.current < 2000) return;

          if (payload.eventType === "DELETE") return; // soft-delete not used

          const updated = payload.new;
          if (!updated || !updated.id) return;

          // Transform DB row → in-memory shape (mirrors KolApp loadOpsData mapping)
          const entry = {
            id: updated.id,
            type: updated.type_sub || updated.type,
            typeSub: updated.type_sub,
            date: updated.date,
            locked: updated.locked,
            completedBy: updated.completed_by,
            items: updated.items || {},
            computed_items: updated.computed_items || null,
            sections: updated.sections,
            mentions: updated.mentions,
            history: updated.history || [],
          };

          setDailyOps((prev) => {
            const idx = prev.findIndex((e) => e.id === entry.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...entry };
              return next;
            }
            return [...prev, entry];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId, setDailyOps]);

  // Expose a function to mark local writes so realtime skips the echo
  return { markLocalWrite: () => { lastLocalWrite.current = Date.now(); } };
}

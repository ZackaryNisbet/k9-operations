import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  addMonths,
  filterEventsForMonth,
  getMonthEnd,
  getMonthStart,
  mergeEnrichmentEvents,
  normalizeEnrichmentEvent,
  prepareEventPayload,
} from "../kol/enrichments/enrichmentData";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

// Enrichment events are backed by the enrichment_events table (no hard-coded
// seeds): scope='global' are enterprise-mandated events shown at every location,
// scope='location' are a resort's own events. RLS restricts writes to the
// enterprise-admin grouping; the page also gates the edit UI.
export function useEnrichmentEvents(locationId, monthDate) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!locationId) {
        setEvents([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      const start = getMonthStart(addMonths(monthDate, -1));
      const end = getMonthEnd(addMonths(monthDate, 1));

      const { data, error: tableError } = await supabase
        .from("enrichment_events")
        .select("*")
        .or(`scope.eq.global,location_id.eq.${locationId}`)
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date", { ascending: true });

      if (cancelled) return;
      if (tableError) {
        console.error("enrichment_events load failed:", tableError);
        setError(tableError);
        setEvents([]);
      } else {
        setEvents(mergeEnrichmentEvents(data || [], [], locationId));
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, monthDate, refreshToken]);

  const visibleMonthEvents = useMemo(() => filterEventsForMonth(events, monthDate, "staff"), [events, monthDate]);

  const saveEvent = useCallback(async (event) => {
    if (!locationId) throw new Error("Missing location.");
    const payload = prepareEventPayload(event, locationId);
    payload.legacy_source_id = payload.legacy_source_id || event?.legacy_source_id || event?.id || `manual-${Date.now()}`;

    const existingId = typeof event?.id === "string" && UUID_RE.test(event.id) ? event.id : null;

    let query;
    if (existingId) {
      // Edit: never reassign scope/location_id, so editing a global (mandated)
      // event keeps it global instead of silently becoming location-scoped.
      delete payload.scope;
      delete payload.location_id;
      query = supabase.from("enrichment_events").update(payload).eq("id", existingId).select("*").single();
    } else {
      // New events created from a location view are that resort's own (location-scoped).
      payload.scope = "location";
      payload.location_id = locationId;
      query = supabase
        .from("enrichment_events")
        .upsert(payload, { onConflict: "location_id,legacy_source_id" })
        .select("*")
        .single();
    }

    const { data, error: saveError } = await query;
    if (saveError) throw saveError;
    setEvents((current) => mergeEnrichmentEvents([data], current, locationId));
    return normalizeEnrichmentEvent(data, locationId);
  }, [locationId]);

  const deleteEvent = useCallback(async (event) => {
    if (!event || !locationId) return;
    const normalized = normalizeEnrichmentEvent(event, locationId);
    if (!UUID_RE.test(normalized.id || "")) return;
    const { error: deleteError } = await supabase.from("enrichment_events").delete().eq("id", normalized.id);
    if (deleteError) throw deleteError;
    setEvents((current) => current.filter((item) => item.id !== normalized.id));
  }, [locationId]);

  return {
    events,
    visibleMonthEvents,
    loading,
    error,
    storageMode: "tables",
    refresh,
    saveEvent,
    deleteEvent,
  };
}

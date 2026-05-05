import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  SEED_ENRICHMENT_EVENTS,
  addMonths,
  eventKey,
  filterEventsForMonth,
  getMonthEnd,
  getMonthStart,
  mergeEnrichmentEvents,
  normalizeEnrichmentEvent,
  prepareEventPayload,
} from "../kol/enrichments/enrichmentData";

const SETTINGS_KEY = "enrichment_calendar";

function isMissingTableError(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("does not exist") || message.includes("schema cache");
}

function getSeedWindow(monthDate) {
  const previous = addMonths(monthDate, -1);
  const next = addMonths(monthDate, 1);
  const start = getMonthStart(previous);
  const end = getMonthEnd(next);
  return SEED_ENRICHMENT_EVENTS.filter((event) => event.event_date >= start && event.event_date <= end);
}

function normalizeSettingsPayload(value) {
  if (!value || typeof value !== "object") return { events: [], hiddenSeedIds: [] };
  return {
    events: Array.isArray(value.events) ? value.events : [],
    hiddenSeedIds: Array.isArray(value.hiddenSeedIds) ? value.hiddenSeedIds : [],
  };
}

async function loadSettingsEvents(locationId) {
  const { data, error } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", SETTINGS_KEY)
    .maybeSingle();

  if (error) throw error;
  return normalizeSettingsPayload(data?.setting_value);
}

async function saveSettingsEvents(locationId, payload) {
  const { error } = await supabase
    .from("lite_settings")
    .upsert({
      location_id: locationId,
      setting_key: SETTINGS_KEY,
      setting_value: payload,
    }, { onConflict: "location_id,setting_key" });
  if (error) throw error;
}

export function useEnrichmentEvents(locationId, monthDate) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [storageMode, setStorageMode] = useState("tables");
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const seedWindow = useMemo(() => getSeedWindow(monthDate), [monthDate]);

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

      try {
        const { data, error: tableError } = await supabase
          .from("enrichment_events")
          .select("*")
          .eq("location_id", locationId)
          .gte("event_date", start)
          .lte("event_date", end)
          .order("event_date", { ascending: true });

        if (tableError) throw tableError;
        if (cancelled) return;
        setStorageMode("tables");
        setEvents(mergeEnrichmentEvents(data || [], seedWindow, locationId));
      } catch (tableError) {
        if (!isMissingTableError(tableError)) {
          console.error("enrichment_events load failed:", tableError);
        }
        try {
          const settingsPayload = await loadSettingsEvents(locationId);
          const hidden = new Set(settingsPayload.hiddenSeedIds || []);
          const visibleSeeds = seedWindow.filter((event) => !hidden.has(event.id) && !hidden.has(event.legacy_source_id));
          if (cancelled) return;
          setStorageMode("settings");
          setEvents(mergeEnrichmentEvents(settingsPayload.events || [], visibleSeeds, locationId));
          setError(isMissingTableError(tableError) ? null : tableError);
        } catch (settingsError) {
          if (cancelled) return;
          console.error("enrichment fallback load failed:", settingsError);
          setStorageMode("seed");
          setEvents(seedWindow.map((event) => normalizeEnrichmentEvent(event, locationId)));
          setError(settingsError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, monthDate, refreshToken, seedWindow]);

  const visibleMonthEvents = useMemo(() => filterEventsForMonth(events, monthDate, "staff"), [events, monthDate]);

  const saveEvent = useCallback(async (event) => {
    if (!locationId) throw new Error("Missing location.");
    const payload = prepareEventPayload(event, locationId);
    const stableLegacyId = payload.legacy_source_id || event?.legacy_source_id || event?.id || `manual-${Date.now()}`;
    payload.legacy_source_id = stableLegacyId;

    if (storageMode === "tables") {
      const existingId = typeof event?.id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(event.id) ? event.id : null;
      const query = existingId
        ? supabase.from("enrichment_events").update(payload).eq("id", existingId).select("*").single()
        : supabase.from("enrichment_events").upsert(payload, { onConflict: "location_id,legacy_source_id" }).select("*").single();
      const { data, error: saveError } = await query;
      if (saveError) throw saveError;
      setEvents((current) => mergeEnrichmentEvents([data], current, locationId));
      return normalizeEnrichmentEvent(data, locationId);
    }

    const settingsPayload = await loadSettingsEvents(locationId);
    const normalized = normalizeEnrichmentEvent({
      ...payload,
      id: event?.id || stableLegacyId,
      legacy_source_id: stableLegacyId,
      updated_at: new Date().toISOString(),
    }, locationId);
    const nextEvents = [
      ...(settingsPayload.events || []).filter((item) => eventKey(normalizeEnrichmentEvent(item, locationId)) !== eventKey(normalized)),
      normalized,
    ];
    await saveSettingsEvents(locationId, { ...settingsPayload, events: nextEvents });
    setEvents((current) => mergeEnrichmentEvents(nextEvents, current, locationId));
    return normalized;
  }, [locationId, storageMode]);

  const deleteEvent = useCallback(async (event) => {
    if (!event || !locationId) return;
    const normalized = normalizeEnrichmentEvent(event, locationId);
    const isUuid = typeof normalized.id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(normalized.id);

    if (storageMode === "tables" && isUuid) {
      const { error: deleteError } = await supabase.from("enrichment_events").delete().eq("id", normalized.id);
      if (deleteError) throw deleteError;
      setEvents((current) => current.filter((item) => item.id !== normalized.id));
      return;
    }

    const settingsPayload = await loadSettingsEvents(locationId);
    const key = eventKey(normalized);
    const hiddenSeedIds = normalized.legacy_source_id?.startsWith("seed-") || normalized.id?.startsWith("seed-")
      ? [...new Set([...(settingsPayload.hiddenSeedIds || []), normalized.legacy_source_id || normalized.id])]
      : settingsPayload.hiddenSeedIds || [];
    const nextEvents = (settingsPayload.events || []).filter((item) => eventKey(normalizeEnrichmentEvent(item, locationId)) !== key);
    await saveSettingsEvents(locationId, { ...settingsPayload, events: nextEvents, hiddenSeedIds });
    setEvents((current) => current.filter((item) => eventKey(item) !== key));
  }, [locationId, storageMode]);

  return {
    events,
    visibleMonthEvents,
    loading,
    error,
    storageMode,
    refresh,
    saveEvent,
    deleteEvent,
  };
}

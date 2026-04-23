import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const DEFAULT_POLL_MS = 5_000;
const RECENT_EVENT_WINDOW_MS = 15 * 60_000;
export const PRESENCE_NOTICE_WINDOW_MS = 60_000;

function parseSnapshot(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePresenceCounts(counts = {}) {
  return {
    inHouse: normalizeCount(counts.in_house),
    boarding: normalizeCount(counts.boarding),
    daycare: normalizeCount(counts.daycare),
    dayboarding: normalizeCount(counts.dayboarding),
    evaluation: normalizeCount(counts.evaluation),
    goingHome: normalizeCount(counts.going_home),
    pendingArrivals: normalizeCount(counts.pending_arrivals),
    occupancyPct: normalizeCount(counts.occupancy_pct),
    duplicateAnimals: normalizeCount(counts.duplicate_animals),
  };
}

function normalizeEvent(event) {
  if (!event) return null;
  return {
    ...event,
    id: String(event.event_key || event.id || ""),
    eventType: event.event_type,
    animalGingrId: String(event.animal_gingr_id || ""),
    reservationGingrId: event.reservation_gingr_id ? String(event.reservation_gingr_id) : null,
    computedAt: event.computed_at || event.source_observed_at || null,
  };
}

function parseTimeMs(value) {
  if (!value) return Number.NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function isRoomEligiblePresenceType(value) {
  const type = String(value || "").toLowerCase();
  return type === "boarding" || type === "dayboarding" || type === "day_boarding";
}

export function getPresenceEventTransitionMs(event) {
  const normalized = normalizeEvent(event);
  if (!normalized?.eventType) return Number.NaN;
  const state = normalized.eventType === "checked_out"
    ? (event.previous_state || event)
    : (event.next_state || event);
  const candidates = normalized.eventType === "checked_in"
    ? [state?.check_in_date, event.check_in_date, event.source_observed_at, event.computed_at]
    : [state?.check_out_date, event.check_out_date, event.source_observed_at, event.computed_at];

  for (const candidate of candidates) {
    const ms = parseTimeMs(candidate);
    if (Number.isFinite(ms)) return ms;
  }
  return Number.NaN;
}

export function mapPresenceRowToReservation(row) {
  if (!row?.animal_gingr_id) return null;
  const reservationId = row.reservation_gingr_id || row.reservation_gingr_ids?.[0] || row.animal_gingr_id;
  const ownerName = [row.owner_first_name, row.owner_last_name].filter(Boolean).join(" ");
  const startDate = row.start_date ? String(row.start_date).split("T")[0] : "";
  const endDate = row.scheduled_check_out_date || row.end_date;
  const hasLodgingRoom = isRoomEligiblePresenceType(row.presence_type);

  return {
    id: `presence-${row.location_id}-${row.animal_gingr_id}`,
    gingrId: reservationId,
    animalGingrId: row.animal_gingr_id,
    animal_gingr_id: row.animal_gingr_id,
    clientId: row.owner_gingr_id ? `g${row.owner_gingr_id}` : null,
    dogId: `g${row.animal_gingr_id}`,
    dogIds: [`g${row.animal_gingr_id}`],
    type: row.presence_type || "other",
    checkIn: startDate,
    checkOut: endDate ? String(endDate).split("T")[0] : startDate,
    checkOutTime: endDate ? String(endDate).split("T")[1]?.slice(0, 5) : null,
    scheduledCheckOutTime: endDate ? String(endDate).split("T")[1]?.slice(0, 5) : null,
    status: "checked-in",
    room: hasLodgingRoom ? row.room_name || null : null,
    area: hasLodgingRoom ? row.area_name || null : null,
    _resTypeName: row.reservation_type_name,
    _animalName: row.animal_name,
    _ownerName: ownerName,
    _canonicalPresence: true,
    _presenceRow: row,
  };
}

export function mapPresenceEventToNoticeGroup(event, { firedAt = Date.now(), durationMs, nowMs = firedAt, recentWindowMs = null } = {}) {
  const normalized = normalizeEvent(event);
  if (!normalized?.id || !normalized.animalGingrId) return null;
  const state = normalized.eventType === "checked_out"
    ? (event.previous_state || event)
    : (event.next_state || event);
  const transitionMs = getPresenceEventTransitionMs(event);
  if (
    Number.isFinite(recentWindowMs)
    && Number.isFinite(transitionMs)
    && nowMs - transitionMs > recentWindowMs
  ) {
    return null;
  }
  const noticeFiredAt = Number.isFinite(transitionMs) ? Math.min(transitionMs, nowMs) : firedAt;
  const hasLodgingRoom = isRoomEligiblePresenceType(state?.presence_type || event.presence_type);
  const ownerLastName = state?.owner_last_name || event.owner_last_name || "";

  return {
    id: normalized.id,
    eventKey: normalized.id,
    firedAt: noticeFiredAt,
    transitionAt: Number.isFinite(transitionMs) ? new Date(transitionMs).toISOString() : null,
    durationMs,
    ownerLastName,
    dogs: [{
      id: state?.reservation_gingr_id || event.reservation_gingr_id || normalized.animalGingrId,
      animalGingrId: normalized.animalGingrId,
      animalName: state?.animal_name || event.animal_name || "Unknown",
      ownerLastName,
      breed: state?.animal_breed || event.animal_breed || "",
      room: hasLodgingRoom ? state?.room_name || event.room_name || "" : "",
      area: hasLodgingRoom ? state?.area_name || event.area_name || "" : "",
      resType: state?.presence_type || event.presence_type || "other",
    }],
  };
}

export function useFacilityPresence(locationId, {
  enabled = true,
  pollMs = DEFAULT_POLL_MS,
} = {}) {
  const [available, setAvailable] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const disabledRef = useRef(false);

  const loadSnapshot = useCallback(async () => {
    if (!locationId || !enabled || disabledRef.current) return null;
    const { data, error: rpcError } = await supabase.rpc("facility_presence_snapshot", {
      p_location_id: locationId,
    });
    if (rpcError) {
      disabledRef.current = true;
      setAvailable(false);
      setStatus("unavailable");
      setError(rpcError.message || "facility_presence_snapshot unavailable");
      return null;
    }

    const parsed = parseSnapshot(data);
    setSnapshot(parsed);
    setAvailable(true);
    setStatus("healthy");
    setError(null);
    setLastFetchedAt(new Date().toISOString());
    return parsed;
  }, [locationId, enabled]);

  useEffect(() => {
    disabledRef.current = false;
    setAvailable(false);
    setSnapshot(null);
    setStatus(enabled && locationId ? "loading" : "idle");
    setError(null);
  }, [locationId, enabled]);

  useEffect(() => {
    if (!locationId || !enabled) return undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await loadSnapshot();
    };

    tick();
    const interval = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [locationId, enabled, pollMs, loadSnapshot]);

  useEffect(() => {
    if (!locationId || !enabled || !available) return undefined;
    const channel = supabase
      .channel(`facility-presence-${locationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "facility_presence_events", filter: `location_id=eq.${locationId}` },
        (payload) => {
          const event = normalizeEvent(payload.new);
          if (!event?.id) return;
          const eventTime = event.computedAt ? new Date(event.computedAt).getTime() : Date.now();
          if (Date.now() - eventTime > RECENT_EVENT_WINDOW_MS) return;
          setSnapshot((current) => {
            if (!current) return current;
            const existing = new Set((current.recent_events || []).map((item) => String(item.event_key || item.id)));
            if (existing.has(event.id)) return current;
            return {
              ...current,
              recent_events: [payload.new, ...(current.recent_events || [])].slice(0, 50),
            };
          });
          loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "facility_presence_current", filter: `location_id=eq.${locationId}` },
        () => {
          loadSnapshot();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "facility_presence_sync_runs", filter: `location_id=eq.${locationId}` },
        () => {
          loadSnapshot();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId, enabled, available, loadSnapshot]);

  const counts = useMemo(() => normalizePresenceCounts(snapshot?.counts), [snapshot]);
  const current = useMemo(() => Array.isArray(snapshot?.current) ? snapshot.current : [], [snapshot]);
  const reservations = useMemo(
    () => current.map(mapPresenceRowToReservation).filter(Boolean),
    [current],
  );
  const recentEvents = useMemo(
    () => (Array.isArray(snapshot?.recent_events) ? snapshot.recent_events : []).map(normalizeEvent).filter(Boolean),
    [snapshot],
  );

  return {
    available,
    status,
    error,
    lastFetchedAt,
    latestSync: snapshot?.latest_sync || null,
    counts,
    current,
    reservations,
    recentEvents,
    refresh: loadSnapshot,
  };
}

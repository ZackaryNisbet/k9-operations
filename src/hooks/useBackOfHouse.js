// K9 Operations — Direct Gingr back_of_house polling hook
// Fetches checking_in / checking_out lists directly from Gingr API
// for near-real-time Checkout TV display. Bypasses 15-min Supabase sync.
//
// Data model (from Gingr):
//   checking_in  = dogs scheduled to arrive today but NOT yet checked in
//   checking_out = dogs that ARE checked in (here now), scheduled to leave today
//   → The TV only cares about checking_out (active dogs)
//
// Features:
//   - Configurable poll interval (default 10s)
//   - Business-hours-only polling (configurable)
//   - Page Visibility API pause — stops polling when tab is hidden
//   - Tracks recent arrivals (new in checking_out) and departures (removed from checking_out)
//   - 60-second highlight window for check-in / check-out transitions
//   - Persists config in lite_settings under "tv_poll_config"

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";

// ── Defaults ────────────────────────────────────────────────────────────────
const SETTING_KEY = "tv_poll_config";

const DEFAULTS = {
  pollIntervalSeconds: 10,
  businessHoursEnabled: true,
  businessHoursStart: "06:30",
  businessHoursEnd: "19:30",
};

const HIGHLIGHT_DURATION_MS = 60_000; // 60 seconds

// ── Gingr API config ────────────────────────────────────────────────────────
const GINGR_SUBDOMAIN = "your-gingr-subdomain";
const GINGR_API_KEY = "a0fec5e66b3c3be8b6085b2708b3806e";
const GINGR_LOCATION_ID = "1";

const BOH_URL = `https://${GINGR_SUBDOMAIN}.gingrapp.com/api/v1/back_of_house?key=${GINGR_API_KEY}&location_id=${GINGR_LOCATION_ID}&full_day=true&include_daycare=true`;

// ── Hook ────────────────────────────────────────────────────────────────────
export function useBackOfHouse(locationId, enabled = true) {
  // Active dogs = checking_out list (dogs that are here now)
  const [activeDogs, setActiveDogs] = useState([]);
  // Transition tracking: { id: { dog, type: "arrived"|"departed", timestamp } }
  const [recentEvents, setRecentEvents] = useState({});
  const [lastFetch, setLastFetch] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(DEFAULTS);
  const [configLoaded, setConfigLoaded] = useState(false);
  const timerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const visibleRef = useRef(true);
  const prevActiveIdsRef = useRef(null); // Set of IDs from previous poll
  const fetchCountRef = useRef(0);

  // ── Load config from Supabase ──────────────────────────────────────────
  useEffect(() => {
    if (!locationId) return;
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", SETTING_KEY)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row?.setting_value) {
          setConfig(prev => ({ ...prev, ...row.setting_value }));
        }
        setConfigLoaded(true);
      });
  }, [locationId]);

  // ── Save config to Supabase ────────────────────────────────────────────
  const saveConfig = useCallback(async (newConfig) => {
    const merged = { ...config, ...newConfig };
    setConfig(merged);
    if (!locationId) return;
    await supabase.from("lite_settings").upsert(
      { location_id: locationId, setting_key: SETTING_KEY, setting_value: merged },
      { onConflict: "location_id,setting_key" }
    );
  }, [config, locationId]);

  // ── Business hours check ───────────────────────────────────────────────
  const isWithinBusinessHours = useCallback(() => {
    if (!config.businessHoursEnabled) return true;
    const now = new Date();
    const [startH, startM] = config.businessHoursStart.split(":").map(Number);
    const [endH, endM] = config.businessHoursEnd.split(":").map(Number);
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= (startH * 60 + startM) && mins <= (endH * 60 + endM);
  }, [config.businessHoursEnabled, config.businessHoursStart, config.businessHoursEnd]);

  // ── Clean up expired highlights ────────────────────────────────────────
  useEffect(() => {
    highlightTimerRef.current = setInterval(() => {
      const now = Date.now();
      setRecentEvents(prev => {
        const next = {};
        let changed = false;
        for (const [id, evt] of Object.entries(prev)) {
          if (now - evt.timestamp < HIGHLIGHT_DURATION_MS) {
            next[id] = evt;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(highlightTimerRef.current);
  }, []);

  // ── Fetch back_of_house ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!enabled || !visibleRef.current || !isWithinBusinessHours()) return;

    try {
      const resp = await fetch(BOH_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const d = json.data || {};

      // Active dogs = checking_out (dogs that are HERE)
      const newActive = d.checking_out || [];
      const newActiveIds = new Set(newActive.map(dog => dog.id));

      // Detect transitions (skip on first fetch — no previous data to compare)
      if (prevActiveIdsRef.current !== null) {
        const prevIds = prevActiveIdsRef.current;
        const now = Date.now();
        const events = {};

        // New arrivals: in newActive but not in prev
        for (const dog of newActive) {
          if (!prevIds.has(dog.id)) {
            events[dog.id] = { dog, type: "arrived", timestamp: now };
          }
        }

        // Departures: in prev but not in newActive
        // We need the dog data from the previous active list for display
        for (const id of prevIds) {
          if (!newActiveIds.has(id)) {
            // Find dog data from previous active list (stored on state)
            const prevDog = (activeDogs || []).find(d => d.id === id);
            if (prevDog) {
              events[id] = { dog: prevDog, type: "departed", timestamp: now };
            }
          }
        }

        if (Object.keys(events).length > 0) {
          setRecentEvents(prev => ({ ...prev, ...events }));
        }
      }

      prevActiveIdsRef.current = newActiveIds;
      setActiveDogs(newActive);
      setLastFetch(new Date());
      setError(null);
      fetchCountRef.current += 1;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, isWithinBusinessHours, activeDogs]);

  // ── Page Visibility API ────────────────────────────────────────────────
  useEffect(() => {
    const onVisChange = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current && enabled) fetchData();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [enabled, fetchData]);

  // ── Polling loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !configLoaded) return;

    fetchData();

    const ms = (config.pollIntervalSeconds || 10) * 1000;
    timerRef.current = setInterval(fetchData, ms);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, configLoaded, config.pollIntervalSeconds, fetchData]);

  // ── Derived stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const classify = (d) => {
      const t = (d.type || "").toLowerCase();
      if (t.includes("daycare") || t.includes("day boarding") || t.includes("evaluation")) return "daycare";
      return "boarding";
    };
    const daycare = activeDogs.filter(d => classify(d) === "daycare");
    const boarding = activeDogs.filter(d => classify(d) === "boarding");

    return {
      total: activeDogs.length,
      daycareCount: daycare.length,
      boardingCount: boarding.length,
      fetchCount: fetchCountRef.current,
    };
  }, [activeDogs]);

  return {
    activeDogs,
    recentEvents,
    stats,
    lastFetch,
    error,
    loading,
    config,
    saveConfig,
    configLoaded,
    isWithinBusinessHours,
    fetchNow: fetchData,
  };
}

export { DEFAULTS as TV_POLL_DEFAULTS, SETTING_KEY as TV_POLL_SETTING_KEY };

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

// ── Hook ────────────────────────────────────────────────────────────────────
export function useBackOfHouse(locationId, enabled = true, gingrConfig = null) {
  // Active dogs = checking_out list (dogs that are here now)
  const [activeDogs, setActiveDogs] = useState([]);
  // Pending dogs = checking_in list (scheduled but not yet arrived)
  const [pendingDogs, setPendingDogs] = useState([]);
  // Transition tracking: { id: { dog, type: "arrived"|"departed", timestamp } }
  const [recentEvents, setRecentEvents] = useState({});
  const [lastFetch, setLastFetch] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(DEFAULTS);
  const [configLoaded, setConfigLoaded] = useState(false);
  // Supabase boarding dogs not in BOH (multi-night stays not going home today)
  const [supabaseBoardingCount, setSupabaseBoardingCount] = useState(0);
  // Gingr reservations API — authoritative in-house count
  const [gingrResCount, setGingrResCount] = useState({ total: 0, boarding: 0, daycare: 0, loaded: false });
  const bohAnimalIdsRef = useRef(new Set()); // Tracks current BOH animal IDs for Supabase dedup
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

  // ── Fetch Supabase boarding dogs (checked-in but not going home today) ─
  // BOH checking_out only has dogs going home today. Multi-night boarders
  // staying past today are only in Supabase. This fetch gets the count of
  // Supabase boarding dogs NOT already in BOH, for accurate dashboard stats.
  //
  // fetchSupaboarders is extracted as a ref-stable function so fetchData can
  // call it immediately after the first BOH fetch populates bohAnimalIdsRef,
  // avoiding a 30-second window where the count is wrong.
  const supaboarderTimerRef = useRef(null);
  const cancelledSupaRef = useRef(false);

  const fetchSupaboarders = useCallback(async () => {
    if (!locationId || cancelledSupaRef.current) return;
    try {
      // Only count boarding reservations whose scheduled end_date is AFTER today.
      // BOH checking_out already includes boarders going home today.
      // Without this filter, stale records (check_out_date never set by Gingr)
      // inflate the count with phantom dogs that left days/weeks ago.
      const todayDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
      const { data: rows } = await supabase
        .from("gingr_reservations")
        .select("animal_gingr_id")
        .eq("location_id", locationId)
        .not("check_in_date", "is", null)
        .is("check_out_date", null)
        .is("cancelled_date", null)
        .ilike("reservation_type_name", "%boarding%")
        .not("reservation_type_name", "ilike", "%day boarding%")
        .gt("end_date", todayDate + "T23:59:59");

      if (!cancelledSupaRef.current && rows) {
        const currentBohIds = bohAnimalIdsRef.current;
        const extraCount = rows.filter(r => !currentBohIds.has(String(r.animal_gingr_id))).length;
        setSupabaseBoardingCount(extraCount);
      }
    } catch (e) {
      // Silently ignore
    }
  }, [locationId]);

  useEffect(() => {
    if (!locationId || !enabled) return;
    cancelledSupaRef.current = false;

    // Don't fetch immediately on mount — wait for first BOH fetch to populate
    // bohAnimalIdsRef. The BOH fetchData will call fetchSupaboarders after it
    // populates the ref. After that, poll every 30s.
    supaboarderTimerRef.current = setInterval(fetchSupaboarders, 30000);
    return () => { cancelledSupaRef.current = true; if (supaboarderTimerRef.current) clearInterval(supaboarderTimerRef.current); };
  }, [locationId, enabled, fetchSupaboarders]);

  // ── Poll Gingr reservations API for authoritative in-house count ────────
  const gingrResCancelledRef = useRef(false);
  const gingrResTimerRef = useRef(null);

  const fetchGingrResCount = useCallback(async () => {
    if (gingrResCancelledRef.current || !gingrConfig?.subdomain || !gingrConfig?.api_key) return;
    try {
      const resUrl = `https://${gingrConfig.subdomain}.gingrapp.com/api/v1/reservations`;
      const resp = await fetch(resUrl, {
        method: "POST",
        body: new URLSearchParams({ key: gingrConfig.api_key, checked_in: "true" }),
      });
      if (!resp.ok || gingrResCancelledRef.current) return;
      const json = await resp.json();
      const resData = json.data || {};
      const entries = Object.values(resData);
      let boarding = 0;
      let daycare = 0;
      for (const r of entries) {
        const t = (r.reservation_type?.type || "").toLowerCase();
        if (t.includes("boarding") && !t.includes("day boarding") && !t.includes("daycare")) {
          boarding++;
        } else {
          daycare++;
        }
      }
      if (!gingrResCancelledRef.current) {
        setGingrResCount({ total: entries.length, boarding, daycare, loaded: true });
      }
    } catch (e) {
      // Silently ignore — will retry on next interval
    }
  }, [gingrConfig]);

  useEffect(() => {
    if (!enabled) return;
    gingrResCancelledRef.current = false;
    fetchGingrResCount();
    gingrResTimerRef.current = setInterval(fetchGingrResCount, 60000); // 60s poll
    return () => {
      gingrResCancelledRef.current = true;
      if (gingrResTimerRef.current) clearInterval(gingrResTimerRef.current);
    };
  }, [enabled, fetchGingrResCount]);

  // ── Fetch back_of_house ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!enabled || !visibleRef.current || !isWithinBusinessHours()) return;
    if (!gingrConfig?.subdomain || !gingrConfig?.api_key) return;

    const bohUrl = `https://${gingrConfig.subdomain}.gingrapp.com/api/v1/back_of_house?key=${gingrConfig.api_key}&location_id=${gingrConfig.location_id || "1"}&full_day=true&include_daycare=true`;

    try {
      const resp = await fetch(bohUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const d = json.data || {};

      // Active dogs = checking_out (dogs that are HERE)
      const newActive = d.checking_out || [];
      const newPending = d.checking_in || [];
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
      // Update bohAnimalIdsRef so the Supabase boarding query can dedup correctly
      bohAnimalIdsRef.current = new Set(newActive.map(d => String(d.animal_id)));
      setActiveDogs(newActive);
      setPendingDogs(newPending);
      setLastFetch(new Date());
      setError(null);
      fetchCountRef.current += 1;

      // After first BOH fetch, immediately recount Supabase boarders so the
      // dashboard doesn't show stale counts during the initial 30s window.
      if (fetchCountRef.current === 1) {
        fetchSupaboarders();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, isWithinBusinessHours, activeDogs, fetchSupaboarders, gingrConfig]);

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
  // Merges BOH active dogs with Supabase-only boarding dogs for accurate totals.
  // BOH checking_out only contains dogs going home today (~54). Supabase has
  // multi-night boarders not leaving today. We add them for the true in-house count.
  const stats = useMemo(() => {
    const classify = (d) => {
      const t = (d.type || "").toLowerCase();
      if (t.includes("daycare") || t.includes("day boarding") || t.includes("evaluation")) return "daycare";
      return "boarding";
    };
    const daycare = activeDogs.filter(d => classify(d) === "daycare");
    const bohBoarding = activeDogs.filter(d => classify(d) === "boarding");

    // When Gingr reservations API is available, use it as authoritative source.
    // Falls back to BOH + Supabase when API hasn't loaded yet.
    let totalInHouse, totalBoarding, totalDaycare;
    if (gingrResCount.loaded) {
      totalInHouse = gingrResCount.total;
      totalBoarding = gingrResCount.boarding;
      totalDaycare = gingrResCount.daycare;
    } else {
      totalInHouse = activeDogs.length + supabaseBoardingCount;
      totalBoarding = bohBoarding.length + supabaseBoardingCount;
      totalDaycare = daycare.length;
    }

    // Expected = in-house + not-yet-arrived
    const expectedCount = totalInHouse + pendingDogs.length;

    // Pending breakdown
    const pendingDaycare = pendingDogs.filter(d => classify(d) === "daycare").length;
    const pendingBoarding = pendingDogs.filter(d => classify(d) === "boarding").length;

    // Going Home = checked-in dogs whose end_date is today (not staying overnight)
    // Only applies to BOH dogs (Supabase-only boarders aren't going home today by definition)
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    const goingHomeCount = activeDogs.filter(d => {
      const endTs = parseInt(d.end_date, 10);
      if (!endTs) return false;
      const endDate = new Date(endTs * 1000).toLocaleDateString("en-CA");
      return endDate === todayStr;
    }).length;

    return {
      total: totalInHouse,
      daycareCount: totalDaycare,
      boardingCount: totalBoarding,
      expectedCount,
      pendingCount: pendingDogs.length,
      pendingDaycare,
      pendingBoarding,
      goingHomeCount,
      fetchCount: fetchCountRef.current,
    };
  }, [activeDogs, pendingDogs, supabaseBoardingCount, gingrResCount]);

  return {
    activeDogs,
    pendingDogs,
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

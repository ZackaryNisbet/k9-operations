// K9 Operations — Back-of-house hook (Supabase Realtime)
// Reads checking_in / checking_out lists from gingr_back_of_house table
// via Supabase Realtime subscription. ZERO direct Gingr API calls.
//
// Data model (from gingr_back_of_house table, synced by server-side cron):
//   status='checking_in'  = dogs scheduled to arrive today but NOT yet checked in
//   status='checking_out' = dogs that ARE checked in (here now), scheduled to leave today
//
// Features:
//   - Supabase Realtime subscription (INSERT/UPDATE/DELETE)
//   - Configurable business-hours-only gating
//   - Page Visibility API pause
//   - Tracks recent arrivals and departures (60s highlight window)
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
export function useBackOfHouse(locationId, enabled = true) {
  // Active dogs = checking_out (dogs that are here now)
  const [activeDogs, setActiveDogs] = useState([]);
  // Pending dogs = checking_in (scheduled but not yet arrived)
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
  // In-house count from gingr_reservations (authoritative)
  const [gingrResCount, setGingrResCount] = useState({ total: 0, boarding: 0, daycare: 0, loaded: false });
  const bohAnimalIdsRef = useRef(new Set());
  const highlightTimerRef = useRef(null);
  const visibleRef = useRef(true);
  const prevActiveIdsRef = useRef(null);
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

  // ── Convert a gingr_back_of_house row to the old Gingr API dog shape ──
  const rowToDog = useCallback((row) => ({
    id: row.gingr_reservation_id,
    animal_id: row.animal_id,
    a_first: row.animal_name,
    o_first: row.owner_name?.split(" ")[0] || "",
    o_last: row.owner_name?.split(" ").slice(1).join(" ") || "",
    type: row.reservation_type_name || "",
    start_date: row.check_in_time ? String(Math.floor(new Date(row.check_in_time).getTime() / 1000)) : null,
    end_date: row.check_out_time ? String(Math.floor(new Date(row.check_out_time).getTime() / 1000)) : null,
    run: row.room_name || "",
    area: row.area_name || "",
    _raw: row.raw_data,
  }), []);

  // ── Process BOH rows into active/pending + detect transitions ─────────
  const processBohRows = useCallback((rows) => {
    const checkingOut = rows.filter(r => r.status === "checking_out").map(rowToDog);
    const checkingIn = rows.filter(r => r.status === "checking_in").map(rowToDog);

    const newActiveIds = new Set(checkingOut.map(d => d.id));

    // Detect transitions (skip on first fetch)
    if (prevActiveIdsRef.current !== null) {
      const prevIds = prevActiveIdsRef.current;
      const now = Date.now();
      const events = {};

      for (const dog of checkingOut) {
        if (!prevIds.has(dog.id)) {
          events[dog.id] = { dog, type: "arrived", timestamp: now };
        }
      }

      setActiveDogs(prev => {
        for (const id of prevIds) {
          if (!newActiveIds.has(id)) {
            const prevDog = prev.find(d => d.id === id);
            if (prevDog) {
              events[id] = { dog: prevDog, type: "departed", timestamp: now };
            }
          }
        }
        if (Object.keys(events).length > 0) {
          setRecentEvents(p => ({ ...p, ...events }));
        }
        return checkingOut;
      });
    } else {
      setActiveDogs(checkingOut);
    }

    prevActiveIdsRef.current = newActiveIds;
    bohAnimalIdsRef.current = new Set(checkingOut.map(d => String(d.animal_id)));
    setPendingDogs(checkingIn);
    setLastFetch(new Date());
    setError(null);
    setLoading(false);
    fetchCountRef.current += 1;
  }, [rowToDog]);

  // ── Fetch BOH data from Supabase ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!enabled || !locationId) return;
    try {
      const { data: rows, error: err } = await supabase
        .from("gingr_back_of_house")
        .select("*")
        .eq("location_id", locationId);

      if (err) throw new Error(err.message);
      processBohRows(rows || []);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [enabled, locationId, processBohRows]);

  // ── Supabase Realtime subscription ────────────────────────────────────
  useEffect(() => {
    if (!enabled || !configLoaded || !locationId) return;

    // Initial fetch
    fetchData();

    // Subscribe to realtime changes on gingr_back_of_house
    const channel = supabase
      .channel(`boh-${locationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gingr_back_of_house",
          filter: `location_id=eq.${locationId}`,
        },
        () => {
          // On any INSERT/UPDATE/DELETE, re-fetch the full table for this location
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, configLoaded, locationId, fetchData]);

  // ── Page Visibility API ────────────────────────────────────────────────
  useEffect(() => {
    const onVisChange = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current && enabled) fetchData();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [enabled, fetchData]);

  // ── Fetch Supabase boarding dogs (checked-in but not going home today) ─
  const supaboarderTimerRef = useRef(null);
  const cancelledSupaRef = useRef(false);

  const fetchSupaboarders = useCallback(async () => {
    if (!locationId || cancelledSupaRef.current) return;
    try {
      const todayDate = new Date().toLocaleDateString("en-CA");
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
    fetchSupaboarders();
    supaboarderTimerRef.current = setInterval(fetchSupaboarders, 30000);
    return () => { cancelledSupaRef.current = true; if (supaboarderTimerRef.current) clearInterval(supaboarderTimerRef.current); };
  }, [locationId, enabled, fetchSupaboarders]);

  // ── Poll gingr_reservations for authoritative in-house count ──────────
  const gingrResCancelledRef = useRef(false);
  const gingrResTimerRef = useRef(null);

  const fetchGingrResCount = useCallback(async () => {
    if (!locationId || gingrResCancelledRef.current) return;
    try {
      const { data: rows, error: err } = await supabase
        .from("gingr_reservations")
        .select("reservation_type_name")
        .eq("location_id", locationId)
        .not("check_in_date", "is", null)
        .is("check_out_date", null)
        .is("cancelled_date", null);

      if (err || gingrResCancelledRef.current) return;

      let boarding = 0;
      let daycare = 0;
      for (const r of (rows || [])) {
        const t = (r.reservation_type_name || "").toLowerCase();
        if (t.includes("boarding") && !t.includes("day boarding") && !t.includes("daycare")) {
          boarding++;
        } else {
          daycare++;
        }
      }
      if (!gingrResCancelledRef.current) {
        setGingrResCount({ total: (rows || []).length, boarding, daycare, loaded: true });
      }
    } catch (e) {
      // Silently ignore — will retry on next interval
    }
  }, [locationId]);

  useEffect(() => {
    if (!enabled || !locationId) return;
    gingrResCancelledRef.current = false;
    fetchGingrResCount();
    gingrResTimerRef.current = setInterval(fetchGingrResCount, 60000);
    return () => {
      gingrResCancelledRef.current = true;
      if (gingrResTimerRef.current) clearInterval(gingrResTimerRef.current);
    };
  }, [enabled, locationId, fetchGingrResCount]);

  // ── Derived stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const classify = (d) => {
      const t = (d.type || "").toLowerCase();
      if (t.includes("daycare") || t.includes("day boarding") || t.includes("evaluation")) return "daycare";
      return "boarding";
    };
    const daycare = activeDogs.filter(d => classify(d) === "daycare");
    const bohBoarding = activeDogs.filter(d => classify(d) === "boarding");

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

    const expectedCount = totalInHouse + pendingDogs.length;
    const pendingDaycare = pendingDogs.filter(d => classify(d) === "daycare").length;
    const pendingBoarding = pendingDogs.filter(d => classify(d) === "boarding").length;

    const todayStr = new Date().toLocaleDateString("en-CA");
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

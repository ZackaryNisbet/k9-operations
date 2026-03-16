// K9 Operations — Direct Gingr back_of_house polling hook
// Fetches checking_in / checking_out lists directly from Gingr API
// for near-real-time Checkout TV display. Bypasses 15-min Supabase sync.
//
// Features:
//   - Configurable poll interval (default 10s)
//   - Business-hours-only polling (configurable)
//   - Page Visibility API pause — stops polling when tab is hidden
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

// ── Gingr API config (same as used elsewhere in the app) ────────────────────
const GINGR_SUBDOMAIN = "k9cherryhill";
const GINGR_API_KEY = "a0fec5e66b3c3be8b6085b2708b3806e";
const GINGR_LOCATION_ID = "1";

const BOH_URL = `https://${GINGR_SUBDOMAIN}.gingrapp.com/api/v1/back_of_house?key=${GINGR_API_KEY}&location_id=${GINGR_LOCATION_ID}&full_day=true`;

// ── Hook ────────────────────────────────────────────────────────────────────
export function useBackOfHouse(locationId, enabled = true) {
  const [checkingIn, setCheckingIn] = useState([]);
  const [checkingOut, setCheckingOut] = useState([]);
  const [lastFetch, setLastFetch] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(DEFAULTS);
  const [configLoaded, setConfigLoaded] = useState(false);
  const timerRef = useRef(null);
  const visibleRef = useRef(true);
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

  // ── Fetch back_of_house ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!enabled || !visibleRef.current || !isWithinBusinessHours()) return;

    try {
      const resp = await fetch(BOH_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const d = json.data || {};
      setCheckingIn(d.checking_in || []);
      setCheckingOut(d.checking_out || []);
      setLastFetch(new Date());
      setError(null);
      fetchCountRef.current += 1;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, isWithinBusinessHours]);

  // ── Page Visibility API ────────────────────────────────────────────────
  useEffect(() => {
    const onVisChange = () => {
      visibleRef.current = !document.hidden;
      // If becoming visible again, fetch immediately
      if (visibleRef.current && enabled) fetchData();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [enabled, fetchData]);

  // ── Polling loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !configLoaded) return;

    // Initial fetch
    fetchData();

    const ms = (config.pollIntervalSeconds || 10) * 1000;
    timerRef.current = setInterval(fetchData, ms);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, configLoaded, config.pollIntervalSeconds, fetchData]);

  // ── Derived data ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const allDogs = [...checkingIn, ...checkingOut];
    const checkedIn = allDogs.filter(d => d.check_in_stamp);
    const pending = allDogs.filter(d => !d.check_in_stamp);

    const daycare = allDogs.filter(d => {
      const t = (d.type || "").toLowerCase();
      return t.includes("daycare") || t.includes("day boarding") || t.includes("evaluation");
    });
    const boarding = allDogs.filter(d => {
      const t = (d.type || "").toLowerCase();
      return t.includes("boarding") && !t.includes("day boarding");
    });

    return {
      total: allDogs.length,
      checkedInCount: checkedIn.length,
      pendingCount: pending.length,
      daycareCount: daycare.length,
      boardingCount: boarding.length,
      fetchCount: fetchCountRef.current,
    };
  }, [checkingIn, checkingOut]);

  return {
    checkingIn,
    checkingOut,
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

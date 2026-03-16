// K9 Operations — Dashboard Refresh Settings Hook
// Reads refresh_interval and business_hours from lite_settings.
// Returns settings + a function to check if currently within business hours.

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";

const SETTING_KEY = "dashboard_refresh";

const DEFAULTS = {
  refreshIntervalMinutes: 15,
  businessHoursEnabled: true,
  businessHoursStart: "07:00",
  businessHoursEnd: "19:00",
};

export function useRefreshSettings(locationId) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // Load from lite_settings
  useEffect(() => {
    if (!locationId) return;
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", SETTING_KEY)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          setSettings((prev) => ({ ...prev, ...rows[0].setting_value }));
        }
        setLoaded(true);
      });
  }, [locationId]);

  // Check if current time is within business hours
  const isWithinBusinessHours = useCallback(() => {
    if (!settings.businessHoursEnabled) return true; // toggle off = always refresh
    const now = new Date();
    const [startH, startM] = settings.businessHoursStart.split(":").map(Number);
    const [endH, endM] = settings.businessHoursEnd.split(":").map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }, [settings.businessHoursEnabled, settings.businessHoursStart, settings.businessHoursEnd]);

  const refreshIntervalMs = useMemo(
    () => (settings.refreshIntervalMinutes || 15) * 60 * 1000,
    [settings.refreshIntervalMinutes]
  );

  return { settings, loaded, refreshIntervalMs, isWithinBusinessHours };
}

export { DEFAULTS as REFRESH_DEFAULTS, SETTING_KEY as REFRESH_SETTING_KEY };

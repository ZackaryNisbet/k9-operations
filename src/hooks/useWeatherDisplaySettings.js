import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export const WEATHER_DISPLAY_SETTING_KEY = "weather_display_preferences";

export const DEFAULT_WEATHER_DISPLAY_SETTINGS = Object.freeze({
  showDashboardWeather: false,
  showSchedulingWeather: false,
});

export function normalizeWeatherDisplaySettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    showDashboardWeather: source.showDashboardWeather === true || source.dashboard === true,
    showSchedulingWeather: source.showSchedulingWeather === true || source.scheduling === true,
  };
}

export function useWeatherDisplaySettings(locationId, options = {}) {
  const enabled = options?.enabled !== false;
  const [settings, setSettings] = useState(DEFAULT_WEATHER_DISPLAY_SETTINGS);
  const [loading, setLoading] = useState(Boolean(locationId && enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!enabled || !locationId) {
        setSettings(DEFAULT_WEATHER_DISPLAY_SETTINGS);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      const { data, error: queryError } = await supabase
        .from("lite_settings")
        .select("setting_value")
        .eq("location_id", locationId)
        .eq("setting_key", WEATHER_DISPLAY_SETTING_KEY)
        .maybeSingle();

      if (cancelled) return;
      if (queryError) {
        setSettings(DEFAULT_WEATHER_DISPLAY_SETTINGS);
        setError(queryError.message || "Unable to load weather display settings.");
      } else {
        setSettings(normalizeWeatherDisplaySettings(data?.setting_value));
      }
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled, locationId]);

  const saveSettings = useCallback(async (nextValue) => {
    const normalized = normalizeWeatherDisplaySettings(nextValue);
    setSettings(normalized);
    if (!locationId) return normalized;

    const { error: saveError } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: WEATHER_DISPLAY_SETTING_KEY,
      setting_value: normalized,
    }, { onConflict: "location_id,setting_key" });

    if (saveError) {
      setError(saveError.message || "Unable to save weather display settings.");
      throw saveError;
    }

    setError("");
    return normalized;
  }, [locationId]);

  return {
    settings,
    loading,
    error,
    saveSettings,
    showDashboardWeather: settings.showDashboardWeather,
    showSchedulingWeather: settings.showSchedulingWeather,
  };
}

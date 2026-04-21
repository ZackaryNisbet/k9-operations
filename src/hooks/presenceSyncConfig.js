import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

export const PRESENCE_SYNC_SETTING_KEY = "presence_sync_config_v1";
export const PRESENCE_ALLOWED_INTERVAL_SECONDS = [3, 5, 10, 15, 30];

export const PRESENCE_SYNC_DEFAULTS = {
  enabled: true,
  normalIntervalSeconds: 5,
  offHoursIntervalSeconds: 30,
  businessHoursEnabled: true,
  businessHoursStart: "06:30",
  businessHoursEnd: "19:30",
  peakEnabled: false,
  peakIntervalSeconds: 3,
  peakWindows: [
    { start: "07:00", end: "09:30" },
    { start: "16:00", end: "18:30" },
  ],
};

function isTimeValue(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeInterval(value, fallback) {
  const numeric = Number(value);
  return PRESENCE_ALLOWED_INTERVAL_SECONDS.includes(numeric) ? numeric : fallback;
}

export function sanitizePresenceSyncConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const windows = Array.isArray(source.peakWindows) ? source.peakWindows : PRESENCE_SYNC_DEFAULTS.peakWindows;
  return {
    enabled: source.enabled === false ? false : PRESENCE_SYNC_DEFAULTS.enabled,
    normalIntervalSeconds: normalizeInterval(source.normalIntervalSeconds, PRESENCE_SYNC_DEFAULTS.normalIntervalSeconds),
    offHoursIntervalSeconds: normalizeInterval(source.offHoursIntervalSeconds, PRESENCE_SYNC_DEFAULTS.offHoursIntervalSeconds),
    businessHoursEnabled: source.businessHoursEnabled === false ? false : PRESENCE_SYNC_DEFAULTS.businessHoursEnabled,
    businessHoursStart: isTimeValue(source.businessHoursStart) ? source.businessHoursStart : PRESENCE_SYNC_DEFAULTS.businessHoursStart,
    businessHoursEnd: isTimeValue(source.businessHoursEnd) ? source.businessHoursEnd : PRESENCE_SYNC_DEFAULTS.businessHoursEnd,
    peakEnabled: source.peakEnabled === true,
    peakIntervalSeconds: normalizeInterval(source.peakIntervalSeconds, PRESENCE_SYNC_DEFAULTS.peakIntervalSeconds),
    peakWindows: windows
      .map((window) => ({
        start: isTimeValue(window?.start) ? window.start : null,
        end: isTimeValue(window?.end) ? window.end : null,
      }))
      .filter((window) => window.start && window.end)
      .slice(0, 6),
  };
}

function minutesFromTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

function isWithinMinuteWindow(currentMinutes, start, end) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

export function getEffectivePresenceCadence(configValue, date = new Date()) {
  const config = sanitizePresenceSyncConfig(configValue);
  if (!config.enabled) {
    return { ...config, active: false, mode: "disabled", intervalSeconds: config.offHoursIntervalSeconds };
  }

  const currentMinutes = (date.getHours() * 60) + date.getMinutes();
  const withinBusinessHours = !config.businessHoursEnabled
    || isWithinMinuteWindow(currentMinutes, config.businessHoursStart, config.businessHoursEnd);
  if (!withinBusinessHours) {
    return { ...config, active: true, mode: "off-hours", intervalSeconds: config.offHoursIntervalSeconds };
  }

  const inPeakWindow = config.peakEnabled
    && config.peakWindows.some((window) => isWithinMinuteWindow(currentMinutes, window.start, window.end));

  return {
    ...config,
    active: true,
    mode: inPeakWindow ? "peak" : "normal",
    intervalSeconds: inPeakWindow ? config.peakIntervalSeconds : config.normalIntervalSeconds,
  };
}

export function computePresenceDailyCalls(configValue) {
  const config = sanitizePresenceSyncConfig(configValue);
  let normalMinutes = 0;
  let peakMinutes = 0;
  let offHoursMinutes = 0;

  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const withinBusinessHours = !config.businessHoursEnabled
      || isWithinMinuteWindow(minute, config.businessHoursStart, config.businessHoursEnd);
    if (!withinBusinessHours) {
      offHoursMinutes += 1;
      continue;
    }
    const withinPeakWindow = config.peakEnabled
      && config.peakWindows.some((window) => isWithinMinuteWindow(minute, window.start, window.end));
    if (withinPeakWindow) {
      peakMinutes += 1;
    } else {
      normalMinutes += 1;
    }
  }

  const normalCalls = Math.round((normalMinutes * 60) / Math.max(1, config.normalIntervalSeconds));
  const peakCalls = Math.round((peakMinutes * 60) / Math.max(1, config.peakIntervalSeconds));
  const offHoursCalls = Math.round((offHoursMinutes * 60) / Math.max(1, config.offHoursIntervalSeconds));
  return {
    normalMinutes,
    peakMinutes,
    offHoursMinutes,
    normalCalls,
    peakCalls,
    offHoursCalls,
    totalCalls: normalCalls + peakCalls + offHoursCalls,
  };
}

export function usePresenceSyncConfig(locationId) {
  const [config, setConfig] = useState(PRESENCE_SYNC_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!locationId) return undefined;
    let cancelled = false;
    setLoaded(false);
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", PRESENCE_SYNC_SETTING_KEY)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) setError(loadError.message || "Failed to load presence sync settings");
        setConfig(sanitizePresenceSyncConfig(data?.setting_value));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const saveConfig = useCallback(async (nextConfig) => {
    const sanitized = sanitizePresenceSyncConfig(nextConfig);
    setConfig(sanitized);
    if (!locationId) return sanitized;
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from("lite_settings").upsert(
      { location_id: locationId, setting_key: PRESENCE_SYNC_SETTING_KEY, setting_value: sanitized },
      { onConflict: "location_id,setting_key" },
    );
    setSaving(false);
    if (saveError) {
      setError(saveError.message || "Failed to save presence sync settings");
      throw saveError;
    }
    return sanitized;
  }, [locationId]);

  const effectiveCadence = useMemo(() => getEffectivePresenceCadence(config), [config]);

  return { config, setConfig, loaded, saving, error, saveConfig, effectiveCadence };
}

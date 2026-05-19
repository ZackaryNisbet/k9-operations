import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const MAX_WEATHER_RANGE_DAYS = 370;

function enumerateDates(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const dates = [];
  let current = startDate;
  while (current <= endDate && dates.length <= MAX_WEATHER_RANGE_DAYS) {
    dates.push(current);
    const dt = new Date(`${current}T12:00:00`);
    dt.setDate(dt.getDate() + 1);
    current = dt.toISOString().slice(0, 10);
  }
  return dates;
}

function normalizeDateRange(startDate, endDate) {
  if (!startDate) return { startDate: null, endDate: null, dates: [] };
  const normalizedEnd = endDate && endDate >= startDate ? endDate : startDate;
  const dates = enumerateDates(startDate, normalizedEnd);
  return { startDate, endDate: normalizedEnd, dates };
}

async function fetchCachedWeatherRows(locationId, startDate, endDate) {
  const { data, error } = await supabase
    .from("weather_daily_cache")
    .select("*")
    .eq("location_id", locationId)
    .gte("weather_date", startDate)
    .lte("weather_date", endDate)
    .order("weather_date", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export function useWeatherData(locationId, startDate, endDate, options = {}) {
  const refreshToken = options?.refreshToken || 0;
  const enabled = options?.enabled !== false;
  const { dates, startDate: normalizedStart, endDate: normalizedEnd } = useMemo(
    () => normalizeDateRange(startDate, endDate),
    [startDate, endDate],
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limitations, setLimitations] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const fetchIdRef = useRef(0);

  const fetchWeather = useCallback(async ({ refresh = false } = {}) => {
    if (!enabled || !locationId || !normalizedStart || !normalizedEnd || dates.length === 0) {
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }

    if (dates.length > MAX_WEATHER_RANGE_DAYS) {
      setRows([]);
      setLoading(false);
      setError(`Weather range is capped at ${MAX_WEATHER_RANGE_DAYS} days per request.`);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError("");

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("weather-daily", {
        body: {
          location_id: locationId,
          date_from: normalizedStart,
          date_to: normalizedEnd,
          refresh,
        },
      });
      if (fetchId !== fetchIdRef.current) return;
      if (invokeError || data?.ok === false) {
        throw new Error(data?.error || invokeError?.message || "Weather request failed.");
      }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setLimitations({
        ...(data?.limitations || {}),
        ...(Array.isArray(data?.warnings) && data.warnings.length ? { warnings: data.warnings } : {}),
      });
      setLastFetchedAt(new Date());
    } catch (weatherError) {
      if (fetchId !== fetchIdRef.current) return;
      try {
        const cachedRows = await fetchCachedWeatherRows(locationId, normalizedStart, normalizedEnd);
        if (fetchId !== fetchIdRef.current) return;
        if (cachedRows.length > 0) {
          setRows(cachedRows);
          setLimitations({ cache_fallback: "Showing cached weather because the live refresh failed." });
          setError("");
          setLastFetchedAt(new Date());
          return;
        }
      } catch {}
      setRows([]);
      setLimitations(null);
      setError(weatherError?.message || "Weather request failed.");
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [dates.length, enabled, locationId, normalizedEnd, normalizedStart]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather, refreshToken]);

  const rowsByDate = useMemo(() => {
    return new Map((rows || []).map((row) => [String(row.weather_date || "").slice(0, 10), row]));
  }, [rows]);

  const getWeatherForDate = useCallback((date) => rowsByDate.get(String(date || "").slice(0, 10)) || null, [rowsByDate]);

  return {
    rows,
    rowsByDate,
    getWeatherForDate,
    loading,
    error,
    limitations,
    lastFetchedAt,
    refresh: () => fetchWeather({ refresh: true }),
  };
}

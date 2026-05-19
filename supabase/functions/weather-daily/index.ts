import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_RANGE_DAYS = 370;
const MAX_BACKFILL_DAYS_PER_CALL = 45;
const OPENWEATHER_FORECAST_DAYS = 8;
const OPENWEATHER_LONG_RANGE_DAYS = 548;
const OPENWEATHER_PROVIDER = "openweather";
const OPENWEATHER_BASE = "https://api.openweathermap.org/data/3.0";

type WeatherLocationSettings = {
  location_id: string;
  display_name: string;
  latitude: number | string;
  longitude: number | string;
  timezone_id?: string | null;
  provider?: string | null;
  enabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type WeatherCacheRow = Record<string, unknown> & {
  location_id: string;
  weather_date: string;
  provider: string;
  source_kind: string;
  status: string;
  expires_at?: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJwtClaims(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

async function assertLocationAccess(req: Request, locationId: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw Object.assign(new Error("Missing Authorization header"), { status: 401 });
  }

  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

  if (bearerToken === serviceRoleKey || parseJwtClaims(bearerToken)?.role === "service_role") {
    return serviceClient;
  }

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw Object.assign(new Error("Unable to authenticate request"), { status: 401 });
  }

  const { data: liteProfiles, error: liteProfileError } = await serviceClient
    .from("lite_profiles")
    .select("location_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (liteProfileError) throw Object.assign(liteProfileError, { status: 500 });

  const hasLiteAccess = (liteProfiles || []).some((profile: any) => {
    const role = String(profile.role || "");
    return (
      ["owner", "enterprise_admin", "developer", "multi_location_admin"].includes(role) ||
      profile.location_id === locationId
    );
  });

  if (hasLiteAccess) return serviceClient;

  const { data: adminProfile, error: adminProfileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminProfileError) throw Object.assign(adminProfileError, { status: 500 });

  if (["owner", "role_owner"].includes(String(adminProfile?.role || ""))) {
    return serviceClient;
  }

  throw Object.assign(new Error("You do not have access to this location's weather."), { status: 403 });
}

function normalizeLocationId(value: unknown) {
  const text = String(value || "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function normalizeIsoDate(value: unknown) {
  const text = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const dt = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const dt = new Date(`${date}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function enumerateDates(startDate: string, endDate: string, maxDays = MAX_RANGE_DAYS) {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate && dates.length <= maxDays) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function dateInTimezone(timezoneId = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timezoneOffsetForDate(timezoneId: string, date: string) {
  const utcDate = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneId || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour === "24" ? "0" : values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const offsetMinutes = Math.round((asUtc - utcDate.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function addHoursIso(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mmToInches(value: unknown) {
  const numeric = toNumber(value);
  return numeric == null ? null : Number((numeric / 25.4).toFixed(3));
}

function metersToMiles(value: unknown) {
  const numeric = toNumber(value);
  return numeric == null ? null : Number((numeric / 1609.344).toFixed(2));
}

function windDirectionLabel(degrees: unknown) {
  const value = toNumber(degrees);
  if (value == null) return null;
  const labels = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return labels[Math.round(value / 22.5) % 16];
}

function conditionTypeFromOpenWeather(value: Record<string, unknown> | null | undefined) {
  const main = String(value?.main || "").toLowerCase();
  const description = String(value?.description || "").toLowerCase();
  const text = `${main} ${description}`;
  if (text.includes("thunder") || text.includes("storm")) return "thunderstorm";
  if (text.includes("snow") || text.includes("sleet") || text.includes("ice")) return "snow";
  if (text.includes("rain") || text.includes("drizzle") || text.includes("shower")) return "rain";
  if (text.includes("fog") || text.includes("mist") || text.includes("haze") || text.includes("smoke")) return "fog";
  if (text.includes("cloud") || text.includes("overcast")) return "cloudy";
  if (text.includes("clear") || text.includes("sun")) return "clear";
  return main || null;
}

function weatherIconUrl(icon: unknown) {
  const value = String(icon || "").trim();
  return value ? `https://openweathermap.org/img/wn/${value}@2x.png` : null;
}

function weatherMain(row: Record<string, unknown> | null | undefined) {
  const list = Array.isArray(row?.weather) ? row.weather as Record<string, unknown>[] : [];
  return list[0] || null;
}

function precipitationType(row: Record<string, unknown>) {
  if (row.snow) return "snow";
  if (row.rain) return "rain";
  const main = String(weatherMain(row)?.main || "").toLowerCase();
  return main.includes("snow") ? "snow" : main.includes("rain") || main.includes("drizzle") ? "rain" : null;
}

function sourceKindForDate(weatherDate: string, today: string) {
  if (weatherDate < today) return "historical_observation";
  if (weatherDate === today) return "current_conditions";
  if (weatherDate <= addDays(today, OPENWEATHER_FORECAST_DAYS - 1)) return "daily_forecast";
  return "statistical_forecast";
}

function expiresAtFor(sourceKind: string, status = "available") {
  if (status !== "available") return addHoursIso(12);
  if (sourceKind === "current_conditions") return addHoursIso(10 / 60);
  if (sourceKind === "daily_forecast") return addHoursIso(6);
  if (sourceKind === "statistical_forecast") return addHoursIso(24);
  if (sourceKind === "unavailable") return addHoursIso(12);
  return null;
}

function isCacheFresh(row: WeatherCacheRow | null | undefined, refresh: boolean) {
  if (!row || refresh) return false;
  if (!row.expires_at) return true;
  const expiresAt = new Date(String(row.expires_at));
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now();
}

function providerPriority(row: WeatherCacheRow) {
  let score = 0;
  if (row.status === "available") score += 100;
  if (row.provider === OPENWEATHER_PROVIDER) score += 30;
  if (row.source_kind === "current_conditions") score += 5;
  if (row.source_kind === "historical_observation") score += 4;
  if (row.source_kind === "daily_forecast") score += 3;
  if (row.source_kind === "statistical_forecast") score += 2;
  return score;
}

function chooseRowsByDate(rows: WeatherCacheRow[]) {
  const byDate = new Map<string, WeatherCacheRow>();
  for (const row of rows || []) {
    const date = String(row.weather_date || "").slice(0, 10);
    if (!date) continue;
    const existing = byDate.get(date);
    if (!existing || providerPriority(row) > providerPriority(existing)) {
      byDate.set(date, row);
    }
  }
  return byDate;
}

async function loadCachedRows(client: any, locationId: string, dateFrom: string, dateTo: string) {
  const { data, error } = await client
    .from("weather_daily_cache")
    .select("*")
    .eq("location_id", locationId)
    .gte("weather_date", dateFrom)
    .lte("weather_date", dateTo)
    .order("weather_date", { ascending: true })
    .order("fetched_at", { ascending: false });

  if (error) throw error;
  return (data || []) as WeatherCacheRow[];
}

async function fetchLocationSettings(client: any, locationId: string) {
  const { data, error } = await client
    .from("weather_location_settings")
    .select("*")
    .eq("location_id", locationId)
    .eq("enabled", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Weather is not configured for this location."), { status: 404 });
  }
  return data as WeatherLocationSettings;
}

function openWeatherKey() {
  const key = Deno.env.get("OPENWEATHER_API_KEY") || "";
  if (!key) throw new Error("OPENWEATHER_API_KEY is not configured.");
  return key;
}

async function fetchOpenWeather(path: string, params: Record<string, string | number | null | undefined>) {
  const url = new URL(`${OPENWEATHER_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("appid", openWeatherKey());
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenWeather request failed with HTTP ${response.status}: ${text.slice(0, 280)}`);
  }
  return JSON.parse(text);
}

function normalizeHourlyPoint(hour: Record<string, unknown>, timezoneId: string) {
  const dt = toNumber(hour.dt);
  const weather = weatherMain(hour);
  return {
    dt,
    iso: dt ? new Date(dt * 1000).toISOString() : null,
    local_label: dt
      ? new Intl.DateTimeFormat("en-US", { timeZone: timezoneId, weekday: "short", hour: "numeric" }).format(new Date(dt * 1000))
      : null,
    temp_f: toNumber(hour.temp),
    feels_like_f: toNumber(hour.feels_like),
    humidity_pct: toNumber(hour.humidity),
    dew_point_f: toNumber(hour.dew_point),
    pressure_millibars: toNumber(hour.pressure),
    uv_index: toNumber(hour.uvi),
    cloud_cover_pct: toNumber(hour.clouds),
    visibility_miles: metersToMiles(hour.visibility),
    wind_speed_mph: toNumber(hour.wind_speed),
    wind_gust_mph: toNumber(hour.wind_gust),
    wind_deg: toNumber(hour.wind_deg),
    wind_direction: windDirectionLabel(hour.wind_deg),
    precipitation_probability_pct: toNumber(hour.pop) == null ? null : Number((Number(hour.pop) * 100).toFixed(1)),
    rain_1h_in: mmToInches((hour.rain as Record<string, unknown> | undefined)?.["1h"]),
    snow_1h_in: mmToInches((hour.snow as Record<string, unknown> | undefined)?.["1h"]),
    condition: weather?.main || null,
    description: weather?.description || null,
    icon: weather?.icon || null,
    icon_url: weatherIconUrl(weather?.icon),
  };
}

function normalizeMinutelyPoint(point: Record<string, unknown>) {
  const dt = toNumber(point.dt);
  return {
    dt,
    iso: dt ? new Date(dt * 1000).toISOString() : null,
    precipitation_in_per_hour: mmToInches(point.precipitation),
  };
}

function mapOneCallDay(
  settings: WeatherLocationSettings,
  day: Record<string, unknown>,
  payload: Record<string, unknown>,
  today: string,
  overview: Record<string, unknown> | null,
) {
  const dt = toNumber(day.dt);
  if (!dt) return null;
  const timezoneId = settings.timezone_id || String(payload.timezone || "America/New_York");
  const weatherDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dt * 1000));
  const sourceKind = sourceKindForDate(weatherDate, today);
  const current = payload.current as Record<string, unknown> | undefined;
  const isToday = weatherDate === today;
  const temp = day.temp as Record<string, unknown> | undefined;
  const feels = day.feels_like as Record<string, unknown> | undefined;
  const weather = weatherMain(day);
  const summary = String(day.summary || overview?.weather_overview || weather?.description || weather?.main || "Weather available").trim();
  const hourly = Array.isArray(payload.hourly) ? payload.hourly as Record<string, unknown>[] : [];
  const minutely = Array.isArray(payload.minutely) ? payload.minutely as Record<string, unknown>[] : [];
  const alerts = Array.isArray(payload.alerts) ? payload.alerts as Record<string, unknown>[] : [];

  return {
    location_id: settings.location_id,
    weather_date: weatherDate,
    provider: OPENWEATHER_PROVIDER,
    source_kind: sourceKind,
    status: "available",
    summary,
    condition_type: conditionTypeFromOpenWeather(weather),
    icon_base_uri: weatherIconUrl(weather?.icon),
    timezone_id: timezoneId,
    high_temp_f: toNumber(temp?.max),
    low_temp_f: toNumber(temp?.min),
    current_temp_f: isToday ? toNumber(current?.temp ?? temp?.day) : toNumber(temp?.day),
    feels_like_temp_f: isToday ? toNumber(current?.feels_like ?? feels?.day) : toNumber(feels?.day),
    humidity_pct: toNumber(day.humidity),
    uv_index: toNumber(day.uvi),
    precipitation_probability_pct: toNumber(day.pop) == null ? null : Number((Number(day.pop) * 100).toFixed(1)),
    precipitation_quantity_in: mmToInches(day.rain ?? 0) ?? mmToInches(day.snow ?? 0),
    precipitation_type: precipitationType(day),
    thunderstorm_probability_pct: conditionTypeFromOpenWeather(weather) === "thunderstorm" ? 65 : null,
    wind_speed_mph: toNumber(day.wind_speed),
    wind_gust_mph: toNumber(day.wind_gust),
    wind_direction: windDirectionLabel(day.wind_deg),
    cloud_cover_pct: toNumber(day.clouds),
    visibility_miles: isToday ? metersToMiles(current?.visibility) : null,
    pressure_millibars: toNumber(day.pressure),
    sunrise_time: day.sunrise ? new Date(Number(day.sunrise) * 1000).toISOString() : null,
    sunset_time: day.sunset ? new Date(Number(day.sunset) * 1000).toISOString() : null,
    moonrise_time: day.moonrise ? new Date(Number(day.moonrise) * 1000).toISOString() : null,
    moonset_time: day.moonset ? new Date(Number(day.moonset) * 1000).toISOString() : null,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAtFor(sourceKind),
    details_json: {
      provider_source: "one_call_3",
      provider_icon: weather?.icon || null,
      openweather_weather_id: weather?.id || null,
      raw_daily: day,
      raw_current: isToday ? current || null : null,
      hourly_forecast: isToday ? hourly.map((hour) => normalizeHourlyPoint(hour, timezoneId)) : [],
      minutely_forecast: isToday ? minutely.map(normalizeMinutelyPoint) : [],
      alerts,
      overview: overview?.weather_overview || null,
      raw_overview: overview,
      moon_phase: day.moon_phase ?? null,
      temperature: temp || null,
      feels_like: feels || null,
      rain_total_mm: day.rain ?? null,
      snow_total_mm: day.snow ?? null,
    },
  };
}

function mapDaySummary(settings: WeatherLocationSettings, payload: Record<string, unknown>, today: string) {
  const weatherDate = normalizeIsoDate(payload.date);
  if (!weatherDate) return null;
  const timezoneId = settings.timezone_id || "America/New_York";
  const sourceKind = sourceKindForDate(weatherDate, today);
  const temperature = payload.temperature as Record<string, unknown> | undefined;
  const humidity = payload.humidity as Record<string, unknown> | undefined;
  const precipitation = payload.precipitation as Record<string, unknown> | undefined;
  const cloudCover = payload.cloud_cover as Record<string, unknown> | undefined;
  const pressure = payload.pressure as Record<string, unknown> | undefined;
  const wind = payload.wind as Record<string, any> | undefined;
  const windMax = wind?.max as Record<string, unknown> | undefined;

  return {
    location_id: settings.location_id,
    weather_date: weatherDate,
    provider: OPENWEATHER_PROVIDER,
    source_kind: sourceKind,
    status: "available",
    summary: weatherDate < today ? "Historical daily weather" : "Daily weather outlook",
    condition_type: null,
    icon_base_uri: null,
    timezone_id: timezoneId,
    high_temp_f: toNumber(temperature?.max),
    low_temp_f: toNumber(temperature?.min),
    current_temp_f: toNumber(temperature?.afternoon),
    feels_like_temp_f: null,
    humidity_pct: toNumber(humidity?.afternoon),
    uv_index: null,
    precipitation_probability_pct: null,
    precipitation_quantity_in: mmToInches(precipitation?.total),
    precipitation_type: Number(precipitation?.total || 0) > 0 ? "precipitation" : null,
    thunderstorm_probability_pct: null,
    wind_speed_mph: toNumber(windMax?.speed),
    wind_gust_mph: null,
    wind_direction: windDirectionLabel(windMax?.direction),
    cloud_cover_pct: toNumber(cloudCover?.afternoon),
    visibility_miles: null,
    pressure_millibars: toNumber(pressure?.afternoon),
    sunrise_time: null,
    sunset_time: null,
    moonrise_time: null,
    moonset_time: null,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAtFor(sourceKind),
    details_json: {
      provider_source: "daily_aggregation",
      raw_day_summary: payload,
      temperature: temperature || null,
      humidity: humidity || null,
      precipitation: precipitation || null,
      cloud_cover: cloudCover || null,
      pressure: pressure || null,
      wind: wind || null,
      tz: payload.tz || null,
      confidence_note: weatherDate < today
        ? "Historical daily aggregation from OpenWeather One Call 3.0."
        : "Long-range daily aggregation from OpenWeather One Call 3.0.",
    },
  };
}

async function fetchOneCallRows(settings: WeatherLocationSettings, dates: string[], today: string) {
  if (!dates.length) return [];
  const payload = await fetchOpenWeather("/onecall", {
    lat: settings.latitude,
    lon: settings.longitude,
    units: "imperial",
  });

  let overview: Record<string, unknown> | null = null;
  if (dates.includes(today) || dates.includes(addDays(today, 1))) {
    try {
      overview = await fetchOpenWeather("/onecall/overview", {
        lat: settings.latitude,
        lon: settings.longitude,
        units: "imperial",
      });
    } catch {
      overview = null;
    }
  }

  const needed = new Set(dates);
  return (Array.isArray(payload.daily) ? payload.daily : [])
    .map((day: Record<string, unknown>) => mapOneCallDay(settings, day, payload, today, overview))
    .filter((row: any) => row?.weather_date && needed.has(row.weather_date));
}

async function fetchDaySummaryRow(settings: WeatherLocationSettings, date: string, today: string) {
  const payload = await fetchOpenWeather("/onecall/day_summary", {
    lat: settings.latitude,
    lon: settings.longitude,
    date,
    tz: timezoneOffsetForDate(settings.timezone_id || "America/New_York", date),
    units: "imperial",
  });
  return mapDaySummary(settings, payload, today);
}

function splitDatesByOpenWeatherEndpoint(dates: string[], today: string) {
  const oneCallEnd = addDays(today, OPENWEATHER_FORECAST_DAYS - 1);
  const dailyAggregationEnd = addDays(today, OPENWEATHER_LONG_RANGE_DAYS);
  return {
    oneCallDates: dates.filter((date) => date >= today && date <= oneCallEnd),
    daySummaryDates: dates.filter((date) => date < today || (date > oneCallEnd && date <= dailyAggregationEnd)),
    unsupportedDates: dates.filter((date) => date > dailyAggregationEnd),
  };
}

function unavailableRow(settings: WeatherLocationSettings, date: string, reason: string) {
  return {
    location_id: settings.location_id,
    weather_date: date,
    provider: OPENWEATHER_PROVIDER,
    source_kind: "unavailable",
    status: "unavailable",
    summary: null,
    condition_type: null,
    icon_base_uri: null,
    timezone_id: settings.timezone_id || "America/New_York",
    high_temp_f: null,
    low_temp_f: null,
    current_temp_f: null,
    feels_like_temp_f: null,
    humidity_pct: null,
    uv_index: null,
    precipitation_probability_pct: null,
    precipitation_quantity_in: null,
    precipitation_type: null,
    thunderstorm_probability_pct: null,
    wind_speed_mph: null,
    wind_gust_mph: null,
    wind_direction: null,
    cloud_cover_pct: null,
    visibility_miles: null,
    pressure_millibars: null,
    sunrise_time: null,
    sunset_time: null,
    moonrise_time: null,
    moonset_time: null,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAtFor("unavailable", "unavailable"),
    details_json: { reason },
  };
}

async function fetchOpenWeatherRows(settings: WeatherLocationSettings, dates: string[], today: string, backfillLimit = MAX_BACKFILL_DAYS_PER_CALL) {
  const rows: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const { oneCallDates, daySummaryDates, unsupportedDates } = splitDatesByOpenWeatherEndpoint(dates, today);

  if (oneCallDates.length) {
    rows.push(...await fetchOneCallRows(settings, oneCallDates, today));
  }

  const limitedDaySummaryDates = daySummaryDates.slice(0, backfillLimit);
  for (const date of limitedDaySummaryDates) {
    const row = await fetchDaySummaryRow(settings, date, today);
    if (row) rows.push(row);
  }

  if (daySummaryDates.length > limitedDaySummaryDates.length) {
    warnings.push(`Daily aggregation fetch capped at ${limitedDaySummaryDates.length} dates for this request. Continue backfill with next_cursor.`);
  }

  for (const date of unsupportedDates) {
    rows.push(unavailableRow(
      settings,
      date,
      "OpenWeather One Call daily aggregation supports forecast dates up to about 1.5 years ahead.",
    ));
  }

  return { rows, warnings, processedDaySummaryDates: limitedDaySummaryDates };
}

async function upsertWeatherRows(client: any, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await client
    .from("weather_daily_cache")
    .upsert(rows, { onConflict: "location_id,weather_date,provider" });
  if (error) throw error;
}

async function handleWeatherRequest(client: any, body: Record<string, unknown>) {
  const locationId = normalizeLocationId(body.location_id);
  const refresh = body.refresh === true;
  const mode = String(body.mode || "range");

  if (!locationId) throw Object.assign(new Error("location_id required"), { status: 400 });
  const settings = await fetchLocationSettings(client, locationId);
  const today = dateInTimezone(settings.timezone_id || "America/New_York");
  let dateFrom = normalizeIsoDate(body.date_from || body.date || today);
  let dateTo = normalizeIsoDate(body.date_to || body.date_from || body.date || dateFrom);

  if (mode === "current_forecast" && !body.date && !body.date_from && !body.date_to) {
    dateFrom = today;
    dateTo = addDays(today, OPENWEATHER_FORECAST_DAYS - 1);
  }

  if (!dateFrom || !dateTo) throw Object.assign(new Error("Valid date_from/date_to required"), { status: 400 });
  if (dateTo < dateFrom) throw Object.assign(new Error("date_to must be on or after date_from"), { status: 400 });

  const maxDays = mode === "backfill_daily" ? 10000 : MAX_RANGE_DAYS;
  const dates = enumerateDates(dateFrom, dateTo, maxDays);

  if (mode !== "backfill_daily" && dates.length > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`Weather range is capped at ${MAX_RANGE_DAYS} days per request.`), { status: 400 });
  }

  let cachedRows = await loadCachedRows(client, locationId, dateFrom, dateTo);
  let rowsByDate = chooseRowsByDate(cachedRows);
  const neededDates = dates.filter((date) => !isCacheFresh(rowsByDate.get(date), refresh));
  const requestedBackfillLimit = Math.max(1, Math.min(Number(body.max_days || MAX_BACKFILL_DAYS_PER_CALL), MAX_BACKFILL_DAYS_PER_CALL));
  const targetDates = mode === "backfill_daily" ? neededDates.slice(0, requestedBackfillLimit) : neededDates;
  const warnings: string[] = [];
  let processedDaySummaryDates: string[] = [];

  if (targetDates.length) {
    const fetched = await fetchOpenWeatherRows(settings, targetDates, today, requestedBackfillLimit);
    warnings.push(...fetched.warnings);
    processedDaySummaryDates = fetched.processedDaySummaryDates;
    await upsertWeatherRows(client, fetched.rows);
    cachedRows = await loadCachedRows(client, locationId, dateFrom, dateTo);
    rowsByDate = chooseRowsByDate(cachedRows);
  }

  const responseDates = mode === "backfill_daily" ? targetDates : dates;
  const rows = responseDates.map((date) => rowsByDate.get(date) || unavailableRow(
    settings,
    date,
    "Weather is not cached for this date yet.",
  ));
  const remainingDates = neededDates.filter((date) => !targetDates.includes(date));

  return {
    ok: true,
    location_id: locationId,
    provider: OPENWEATHER_PROVIDER,
    rows,
    warnings,
    backfill: mode === "backfill_daily"
      ? {
        requested: neededDates.length,
        processed: targetDates.length,
        processed_day_summary_dates: processedDaySummaryDates,
        remaining: remainingDates.length,
        next_cursor: remainingDates[0] || null,
      }
      : null,
    limitations: {
      max_range_days: MAX_RANGE_DAYS,
      primary_provider: OPENWEATHER_PROVIDER,
      one_call_forecast_days: OPENWEATHER_FORECAST_DAYS,
      current_update_cadence_minutes: 10,
      historical_coverage: "OpenWeather One Call 3.0 daily aggregation covers historical daily weather back to 1979.",
      future_note: "Hourly forecast is strongest for the next 48 hours. Future daily aggregation extends about 1.5 years ahead.",
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const locationId = normalizeLocationId(body.location_id);
    if (!locationId) throw Object.assign(new Error("location_id required"), { status: 400 });
    const client = await assertLocationAccess(req, locationId);
    return jsonResponse(await handleWeatherRequest(client, body));
  } catch (error) {
    const status = Number(error?.status || 500);
    return jsonResponse({
      ok: false,
      error: error?.message || "Weather request failed.",
    }, Number.isFinite(status) ? status : 500);
  }
});

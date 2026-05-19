import { C } from "./theme";

export const WEATHER_TRUE_FORECAST_DAYS = 8;
export const WEATHER_CURRENT_REFRESH_MINUTES = 10;

export function isWeatherAvailable(row) {
  return Boolean(row && row.status === "available");
}

export function getWeatherDetails(row) {
  return row?.details_json || row?.details || {};
}

export function getWeatherIconUrl(row, { dark = false } = {}) {
  const base = row?.icon_base_uri || row?.iconBaseUri;
  if (!base) return "";
  if (base.endsWith(".svg") || base.endsWith(".png")) return base;
  return `${base}${dark ? "_dark" : ""}.svg`;
}

export function formatTemperature(value, fallback = "--") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return `${Math.round(parsed)}°`;
}

export function formatTemperatureRange(row) {
  if (!isWeatherAvailable(row)) return "--";
  const high = Number(row.high_temp_f);
  const low = Number(row.low_temp_f);
  if (Number.isFinite(high) && Number.isFinite(low)) {
    return `${Math.round(high)}° / ${Math.round(low)}°`;
  }
  if (Number.isFinite(Number(row.current_temp_f))) {
    return `${Math.round(Number(row.current_temp_f))}° now`;
  }
  return "--";
}

export function formatWeatherSummary(row) {
  if (!row) return "Weather unavailable";
  const details = getWeatherDetails(row);
  if (row.status !== "available") {
    return details.reason || "Weather unavailable";
  }
  return getWeatherCurrentOverview(row) || row.summary || "Weather available";
}

function formatLocalDateKey(value, timezoneId = "America/New_York") {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function isWeatherCurrentRead(row) {
  if (!isWeatherAvailable(row)) return false;
  const details = getWeatherDetails(row);
  const timezoneId = row?.timezone_id || details.timezone_id || "America/New_York";
  const fetchedDate = formatLocalDateKey(row?.fetched_at, timezoneId);
  const weatherDate = String(row?.weather_date || "").slice(0, 10);
  return row?.source_kind === "current_conditions" && Boolean(details.raw_current) && fetchedDate === weatherDate;
}

export function getWeatherCurrentOverview(row) {
  const details = getWeatherDetails(row);
  return isWeatherCurrentRead(row) ? details.overview || "" : "";
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRawWeather(row) {
  const details = getWeatherDetails(row);
  const rawDailyWeather = Array.isArray(details.raw_daily?.weather) ? details.raw_daily.weather[0] : null;
  const rawCurrentWeather = Array.isArray(details.raw_current?.weather) ? details.raw_current.weather[0] : null;
  return rawCurrentWeather || rawDailyWeather || null;
}

export function formatWeatherConditionLabel(row) {
  if (!isWeatherAvailable(row)) return "No weather";
  const rawWeather = getRawWeather(row);
  const description = rawWeather?.description || rawWeather?.main || row?.condition_type;
  if (description) return titleCase(description);
  const summary = String(row?.summary || "").trim();
  if (summary && summary.length <= 36) return titleCase(summary);
  return getWeatherTone(row).label;
}

export function formatWeatherBrief(row) {
  if (!isWeatherAvailable(row)) return formatWeatherSummary(row);
  const parts = [formatWeatherConditionLabel(row), formatTemperatureRange(row)].filter(Boolean);
  const rain = Number(row.precipitation_probability_pct);
  const wind = Number(row.wind_speed_mph);
  const humidity = Number(row.humidity_pct);
  if (Number.isFinite(rain)) parts.push(`${Math.round(rain)}% rain`);
  if (Number.isFinite(wind)) parts.push(`${Math.round(wind)} mph wind`);
  if (Number.isFinite(humidity)) parts.push(`${Math.round(humidity)}% humidity`);
  return parts.join(" · ");
}

export function getWeatherRiskLevel(row) {
  if (!isWeatherAvailable(row)) return "missing";
  const high = Number(row.high_temp_f);
  const low = Number(row.low_temp_f);
  const precip = Number(row.precipitation_probability_pct);
  const precipQuantity = Number(row.precipitation_quantity_in);
  const thunder = Number(row.thunderstorm_probability_pct);
  const wind = Math.max(Number(row.wind_speed_mph) || 0, Number(row.wind_gust_mph) || 0);
  const condition = String(row.condition_type || "").toLowerCase();
  const alerts = getWeatherAlerts(row);

  if (alerts.length || thunder >= 30 || condition.includes("thunder") || condition.includes("storm")) return "severe";
  if (precip >= 65 || precipQuantity >= 0.6 || condition.includes("snow") || condition.includes("ice") || wind >= 35) return "watch";
  if (Number.isFinite(high) && high >= 88) return "heat";
  if (Number.isFinite(low) && low <= 32) return "cold";
  if (precip >= 35 || precipQuantity >= 0.15 || wind >= 25) return "caution";
  return "clear";
}

export function getWeatherTone(row) {
  const level = getWeatherRiskLevel(row);
  const tones = {
    clear: { bg: "#F0FDF4", border: "#BBF7D0", color: C.suc, label: "Good" },
    caution: { bg: "#FFFBEB", border: "#FDE68A", color: C.warn, label: "Watch" },
    heat: { bg: "#FFFBEB", border: "#FDE68A", color: C.warn, label: "Heat" },
    cold: { bg: "#EFF6FF", border: "#BFDBFE", color: C.info, label: "Cold" },
    watch: { bg: "#FFFBEB", border: "#FDE68A", color: C.warn, label: "Risk" },
    severe: { bg: "#FFFBEB", border: "#FDE68A", color: C.warn, label: "Storm" },
    missing: { bg: "#F8FAFC", border: C.border, color: C.textMut, label: "No data" },
  };
  return tones[level] || tones.missing;
}

export function formatWeatherSource(row) {
  if (!row) return "Weather unavailable";
  if (row?.status === "unavailable") return "Weather unavailable";
  const provider = String(row?.provider || "");
  const source = String(row?.source_kind || "");
  if (provider === "openweather") {
    if (source === "current_conditions") return "OpenWeather live conditions";
    if (source === "historical_observation") return "OpenWeather historical daily aggregation";
    if (source === "daily_forecast") return "OpenWeather 8-day forecast";
    if (source === "statistical_forecast") return "OpenWeather long-range daily aggregation";
    return "OpenWeather cache";
  }
  if (provider === "visual_crossing") return "Visual Crossing forecast";
  if (provider === "open_meteo") return "Open-Meteo forecast";
  return "Cached weather";
}

export function formatFetchedAt(row) {
  if (!row?.fetched_at) return "";
  const dt = new Date(row.fetched_at);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatWeatherTimestamp(value, weatherDate = "") {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  let label = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  if (weatherDate && dateKey !== weatherDate) {
    const dateLabel = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    label = `${dateLabel}, ${label}`;
  }
  return label;
}

export function formatWeatherDateLabel(row, fallbackDate = "") {
  const value = String(row?.weather_date || fallbackDate || "").slice(0, 10);
  if (!value) return "date unknown";
  const dt = new Date(`${value}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function hasWeatherRefreshWarning(limitations) {
  return Boolean(
    limitations?.cache_fallback ||
    (Array.isArray(limitations?.warnings) && limitations.warnings.length > 0),
  );
}

export function getWeatherRefreshIssueLabel(limitations = null) {
  const messages = [
    limitations?.cache_fallback,
    ...(Array.isArray(limitations?.warnings) ? limitations.warnings : []),
  ].filter(Boolean).map((message) => String(message).toLowerCase());
  if (messages.some((message) => message.includes("429") || message.includes("temporary blocked") || message.includes("requests limitation") || message.includes("rate limit"))) {
    return "OpenWeather limit hit";
  }
  return hasWeatherRefreshWarning(limitations) ? "Refresh unavailable" : "";
}

export function formatWeatherFreshnessLabel(row, limitations = null) {
  const weatherDate = String(row?.weather_date || "").slice(0, 10);
  const fetchedLabel = formatWeatherTimestamp(row?.fetched_at, weatherDate);
  const issueLabel = getWeatherRefreshIssueLabel(limitations);
  if (issueLabel && row?.updated_at) {
    const updatedAt = new Date(row.updated_at);
    const fetchedAt = row?.fetched_at ? new Date(row.fetched_at) : null;
    if (!Number.isNaN(updatedAt.getTime()) && (!fetchedAt || Number.isNaN(fetchedAt.getTime()) || updatedAt > fetchedAt)) {
      const checkedLabel = formatWeatherTimestamp(row.updated_at, weatherDate);
      if (checkedLabel) return `Checked ${checkedLabel} · ${issueLabel}`;
    }
  }
  const staleSuffix = issueLabel ? ` · ${issueLabel}` : "";
  if (fetchedLabel) return `Cached ${fetchedLabel}${staleSuffix}`;
  if (issueLabel) return `Cached row · ${issueLabel}`;
  return "";
}

function metric(label, value, tone = "neutral") {
  if (value === null || value === undefined || value === "") return null;
  return { label, value, tone };
}

export function buildWeatherDetailMetrics(row) {
  if (!isWeatherAvailable(row)) return [];
  return [
    metric("Feels", formatTemperature(row.feels_like_temp_f)),
    metric("Rain", Number.isFinite(Number(row.precipitation_probability_pct)) ? `${Math.round(Number(row.precipitation_probability_pct))}%` : null, "caution"),
    metric("QPF", Number.isFinite(Number(row.precipitation_quantity_in)) ? `${Number(row.precipitation_quantity_in).toFixed(2)} in` : null),
    metric("Wind", Number.isFinite(Number(row.wind_speed_mph)) ? `${Math.round(Number(row.wind_speed_mph))} mph` : null),
    metric("Gust", Number.isFinite(Number(row.wind_gust_mph)) ? `${Math.round(Number(row.wind_gust_mph))} mph` : null, "caution"),
    metric("Humidity", Number.isFinite(Number(row.humidity_pct)) ? `${Math.round(Number(row.humidity_pct))}%` : null),
    metric("UV", Number.isFinite(Number(row.uv_index)) ? Math.round(Number(row.uv_index)) : null),
    metric("Clouds", Number.isFinite(Number(row.cloud_cover_pct)) ? `${Math.round(Number(row.cloud_cover_pct))}%` : null),
    metric("Vis", Number.isFinite(Number(row.visibility_miles)) ? `${Math.round(Number(row.visibility_miles))} mi` : null),
    metric("Alerts", getWeatherAlerts(row).length ? getWeatherAlerts(row).length : null, "caution"),
  ].filter(Boolean);
}

export function getWeatherOperationalNote(row) {
  if (!isWeatherAvailable(row)) return formatWeatherSummary(row);
  const currentOverview = getWeatherCurrentOverview(row);
  if (currentOverview) return currentOverview;
  if (row?.source_kind === "statistical_forecast") {
    return "Long-range weather is useful for planning pressure, not exact day-of operations.";
  }
  const level = getWeatherRiskLevel(row);
  if (level === "severe") return "Storm risk. Watch outdoor transitions, pickup timing, and play-yard exposure.";
  if (level === "watch") return "Weather risk likely affects outdoor play blocks and cleaning pace.";
  if (level === "heat") return "Heat watch. Build in water checks and shorter outdoor rotations.";
  if (level === "cold") return "Cold watch. Outdoor play and lobby traffic may need closer timing.";
  if (level === "caution") return "Some weather pressure. Keep an eye on play-yard and arrival flow.";
  return "No major weather pressure flagged for operations.";
}

export function getWeatherHourlyPoints(row) {
  const details = getWeatherDetails(row);
  const hourly = Array.isArray(details.hourly_forecast) ? details.hourly_forecast : [];
  return hourly
    .map((point, index) => ({
      index,
      dt: Number(point.dt),
      iso: point.iso || (point.dt ? new Date(Number(point.dt) * 1000).toISOString() : null),
      label: point.local_label || "",
      tempF: Number(point.temp_f),
      feelsLikeF: Number(point.feels_like_f),
      rainPct: Number(point.precipitation_probability_pct),
      rainIn: Number(point.rain_1h_in || 0),
      snowIn: Number(point.snow_1h_in || 0),
      windMph: Number(point.wind_speed_mph),
      gustMph: Number(point.wind_gust_mph),
      humidityPct: Number(point.humidity_pct),
      cloudCoverPct: Number(point.cloud_cover_pct),
      uvIndex: Number(point.uv_index),
      pressureMillibars: Number(point.pressure_millibars),
      visibilityMiles: Number(point.visibility_miles),
      condition: point.condition || point.description || "",
      description: point.description || point.condition || "",
      iconUrl: point.icon_url || "",
    }))
    .filter((point) => Number.isFinite(point.tempF));
}

function smoothStep(t) {
  const clamped = Math.max(0, Math.min(1, Number(t) || 0));
  return clamped * clamped * (3 - 2 * clamped);
}

function interpolateDailyTemp(hour, low, high, current, currentHour) {
  const morningLowHour = 6;
  const afternoonHighHour = 15;
  const nightLow = Number.isFinite(low) ? low + Math.min(4, Math.max(1, (high - low) * 0.16)) : low;
  const anchors = [
    { hour: 0, temp: Number.isFinite(nightLow) ? nightLow : low },
    { hour: morningLowHour, temp: low },
    { hour: afternoonHighHour, temp: high },
    { hour: 23, temp: Number.isFinite(nightLow) ? nightLow : low },
  ];

  if (Number.isFinite(current) && Number.isFinite(currentHour) && currentHour >= 0 && currentHour <= 23) {
    const existingAnchor = anchors.find((anchor) => anchor.hour === currentHour);
    if (existingAnchor) existingAnchor.temp = current;
    else anchors.push({ hour: currentHour, temp: current });
  }

  anchors.sort((a, b) => a.hour - b.hour);
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index];
    const right = anchors[index + 1];
    if (hour >= left.hour && hour <= right.hour) {
      const t = (hour - left.hour) / Math.max(1, right.hour - left.hour);
      return left.temp + (right.temp - left.temp) * smoothStep(t);
    }
  }
  return anchors.at(-1)?.temp ?? high ?? low ?? current;
}

export function getWeatherDerivedHourlyPoints(row, limit = 24) {
  if (!isWeatherAvailable(row)) return [];
  const high = Number(row.high_temp_f);
  const low = Number(row.low_temp_f);
  const current = Number(row.current_temp_f);
  const usableTemps = [high, low, current].filter(Number.isFinite);
  if (!usableTemps.length) return [];

  const safeHigh = Number.isFinite(high) ? high : Math.max(...usableTemps);
  const safeLow = Number.isFinite(low) ? low : Math.min(...usableTemps);
  const currentDate = row?.fetched_at ? new Date(row.fetched_at) : null;
  const dateValue = String(row?.weather_date || "").slice(0, 10);
  let currentHour = null;
  if (currentDate && !Number.isNaN(currentDate.getTime())) {
    const fetchedDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
    currentHour = !dateValue || fetchedDate === dateValue ? currentDate.getHours() : null;
  }
  const base = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return [];

  const description = row.summary || getWeatherCurrentOverview(row) || row.condition_type || "Cached daily weather";
  const feelsDelta = Number.isFinite(Number(row.feels_like_temp_f)) && Number.isFinite(current)
    ? Number(row.feels_like_temp_f) - current
    : 0;
  const count = Math.max(2, Math.min(24, Math.floor(Number(limit) || 24)));

  return Array.from({ length: count }, (_, index) => {
    const hour = index;
    const dt = new Date(base);
    dt.setHours(hour, 0, 0, 0);
    const tempF = interpolateDailyTemp(hour, safeLow, safeHigh, current, currentHour);
    return {
      index,
      dt: Math.floor(dt.getTime() / 1000),
      iso: dt.toISOString(),
      label: dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      tempF,
      feelsLikeF: tempF + feelsDelta,
      rainPct: Number(row.precipitation_probability_pct),
      rainIn: Number(row.precipitation_quantity_in || 0),
      snowIn: 0,
      windMph: Number(row.wind_speed_mph),
      gustMph: Number(row.wind_gust_mph),
      humidityPct: Number(row.humidity_pct),
      cloudCoverPct: Number(row.cloud_cover_pct),
      uvIndex: Number(row.uv_index),
      pressureMillibars: Number(row.pressure_millibars),
      visibilityMiles: Number(row.visibility_miles),
      condition: row.condition_type || row.summary || "",
      description,
      iconUrl: getWeatherIconUrl(row),
      derived: true,
    };
  });
}

export function getWeatherDisplayHourlyPoints(row, limit = 24) {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 24));
  const hourly = getWeatherHourlyPoints(row)
    .slice()
    .sort((a, b) => {
      const aTime = Number.isFinite(new Date(a.iso || 0).getTime()) ? new Date(a.iso || 0).getTime() : a.index;
      const bTime = Number.isFinite(new Date(b.iso || 0).getTime()) ? new Date(b.iso || 0).getTime() : b.index;
      return aTime - bTime;
    })
    .slice(0, safeLimit);
  if (hourly.length > 1) return hourly;
  return getWeatherDerivedHourlyPoints(row, safeLimit);
}

export function getWeatherMinutelyPoints(row) {
  const details = getWeatherDetails(row);
  return Array.isArray(details.minutely_forecast) ? details.minutely_forecast : [];
}

export function getWeatherAlerts(row) {
  const details = getWeatherDetails(row);
  return Array.isArray(details.alerts) ? details.alerts : [];
}

function formatTimeValue(value) {
  if (!value) return "No data";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "No data";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatNumber(value, suffix = "", digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "No data";
  return `${numeric.toFixed(digits)}${suffix}`;
}

export const WEATHER_MATRIX_ROWS = [
  { key: "weather.compact", label: "Weather Data", format: "text", aggregate: "text" },
  { key: "weather.source", label: "Weather Source", format: "text", aggregate: "text" },
  { key: "weather.summary", label: "Weather Summary", format: "text", aggregate: "text" },
  { key: "weather.high_temp_f", label: "High Temp", format: "temperature", aggregate: "max" },
  { key: "weather.low_temp_f", label: "Low Temp", format: "temperature", aggregate: "min" },
  { key: "weather.current_temp_f", label: "Current/Afternoon Temp", format: "temperature", aggregate: "avg" },
  { key: "weather.feels_like_temp_f", label: "Feels Like", format: "temperature", aggregate: "avg" },
  { key: "weather.humidity_pct", label: "Humidity", format: "percent_number", aggregate: "avg" },
  { key: "weather.precipitation_probability_pct", label: "Precip Probability", format: "percent_number", aggregate: "max" },
  { key: "weather.precipitation_quantity_in", label: "Precip Total", format: "inches", aggregate: "sum" },
  { key: "weather.precipitation_type", label: "Precip Type", format: "text", aggregate: "text" },
  { key: "weather.wind_speed_mph", label: "Wind Speed", format: "mph", aggregate: "avg" },
  { key: "weather.wind_gust_mph", label: "Wind Gust", format: "mph", aggregate: "max" },
  { key: "weather.wind_direction", label: "Wind Direction", format: "text", aggregate: "text" },
  { key: "weather.cloud_cover_pct", label: "Cloud Cover", format: "percent_number", aggregate: "avg" },
  { key: "weather.visibility_miles", label: "Visibility", format: "miles", aggregate: "avg" },
  { key: "weather.pressure_millibars", label: "Pressure", format: "millibars", aggregate: "avg" },
  { key: "weather.uv_index", label: "UV Index", format: "number", aggregate: "max" },
  { key: "weather.sunrise_time", label: "Sunrise", format: "time", aggregate: "text" },
  { key: "weather.sunset_time", label: "Sunset", format: "time", aggregate: "text" },
  { key: "weather.moonrise_time", label: "Moonrise", format: "time", aggregate: "text" },
  { key: "weather.moonset_time", label: "Moonset", format: "time", aggregate: "text" },
  { key: "weather.alert_count", label: "Weather Alerts", format: "number", aggregate: "sum" },
  { key: "weather.hourly_count", label: "Hourly Points Cached", format: "number", aggregate: "sum" },
  { key: "weather.ai_overview", label: "AI Weather Overview", format: "text", aggregate: "text" },
  { key: "weather.provider_raw", label: "Provider Raw Fields", format: "text", aggregate: "text" },
];

export function getWeatherMatrixValue(row, key) {
  if (!key || !key.startsWith("weather.")) return undefined;
  if (!isWeatherAvailable(row)) return null;
  const details = getWeatherDetails(row);
  const rawDay = details.raw_day_summary || details.raw_daily || {};
  switch (key) {
    case "weather.compact":
      return `${formatTemperatureRange(row)} · ${formatNumber(row.precipitation_probability_pct, "%")} rain · ${formatNumber(row.wind_speed_mph, " mph")} wind`;
    case "weather.source":
      return formatWeatherSource(row);
    case "weather.summary":
      return row.summary || formatWeatherSummary(row);
    case "weather.alert_count":
      return getWeatherAlerts(row).length;
    case "weather.hourly_count":
      return getWeatherHourlyPoints(row).length;
    case "weather.ai_overview":
      return getWeatherCurrentOverview(row) || null;
    case "weather.provider_raw":
      return Object.keys(rawDay).length ? Object.keys(rawDay).sort().join(", ") : null;
    default: {
      const field = key.replace("weather.", "");
      return row[field] ?? null;
    }
  }
}

export function formatWeatherMatrixValue(value, format) {
  if (value === null || value === undefined || value === "") return "No data";
  if (format === "text") return String(value);
  if (format === "temperature") return formatTemperature(value, "No data");
  if (format === "percent_number") return formatNumber(value, "%");
  if (format === "inches") return formatNumber(value, " in", 2);
  if (format === "mph") return formatNumber(value, " mph");
  if (format === "miles") return formatNumber(value, " mi");
  if (format === "millibars") return formatNumber(value, " mb");
  if (format === "time") return formatTimeValue(value);
  if (format === "number") return formatNumber(value);
  return formatNumber(value);
}

export function buildWeatherDataFields(row) {
  if (!isWeatherAvailable(row)) return [];
  const excluded = new Set(["weather.compact", "weather.provider_raw"]);
  return WEATHER_MATRIX_ROWS
    .filter((field) => !excluded.has(field.key))
    .map((field) => {
      const rawValue = getWeatherMatrixValue(row, field.key);
      return {
        key: field.key,
        label: field.label.replace(/^Weather\s+/, ""),
        value: formatWeatherMatrixValue(rawValue, field.format),
      };
    })
    .filter((field) => field.value && field.value !== "No data");
}

export function summarizeWeatherRows(rows = []) {
  const available = rows.filter(isWeatherAvailable);
  if (!available.length) return null;
  const high = Math.max(...available.map((row) => Number(row.high_temp_f)).filter(Number.isFinite));
  const low = Math.min(...available.map((row) => Number(row.low_temp_f)).filter(Number.isFinite));
  const maxPrecip = Math.max(...available.map((row) => Number(row.precipitation_probability_pct) || 0));
  return {
    availableDays: available.length,
    totalDays: rows.length,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    maxPrecip: Number.isFinite(maxPrecip) ? maxPrecip : null,
  };
}

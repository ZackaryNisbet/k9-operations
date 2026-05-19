import { describe, expect, it } from "vitest";
import {
  buildWeatherDetailMetrics,
  formatTemperatureRange,
  formatWeatherSource,
  formatWeatherSummary,
  formatWeatherMatrixValue,
  getWeatherHourlyPoints,
  getWeatherIconUrl,
  getWeatherMatrixValue,
  getWeatherOperationalNote,
  getWeatherRiskLevel,
  summarizeWeatherRows,
} from "../shared/weather";

const availableRow = {
  status: "available",
  source_kind: "daily_forecast",
  provider: "openweather",
  summary: "Light rain",
  icon_base_uri: "https://openweathermap.org/img/wn/10d@2x.png",
  high_temp_f: 81.4,
  low_temp_f: 62.2,
  feels_like_temp_f: 84.1,
  precipitation_probability_pct: 42,
  precipitation_quantity_in: 0.18,
  wind_speed_mph: 11.5,
  wind_gust_mph: 22.2,
  humidity_pct: 71,
  uv_index: 6,
  cloud_cover_pct: 68,
  visibility_miles: 9.7,
  details_json: {
    hourly_forecast: [
      { dt: 1779062400, temp_f: 70.1, precipitation_probability_pct: 20, wind_speed_mph: 7 },
      { dt: 1779066000, temp_f: 72.6, precipitation_probability_pct: 24, wind_speed_mph: 8 },
    ],
    raw_day_summary: {
      temperature: {},
      precipitation: {},
    },
  },
};

describe("weather shared helpers", () => {
  it("formats provider rows for compact date headers", () => {
    expect(formatTemperatureRange(availableRow)).toBe("81° / 62°");
    expect(formatWeatherSummary(availableRow)).toBe("Light rain");
    expect(formatWeatherSource(availableRow)).toBe("OpenWeather 8-day forecast");
    expect(getWeatherIconUrl(availableRow)).toBe("https://openweathermap.org/img/wn/10d@2x.png");
  });

  it("surfaces provider limits for unavailable fallback dates", () => {
    const row = {
      status: "unavailable",
      details_json: { reason: "OpenWeather has not cached this date yet." },
    };

    expect(formatTemperatureRange(row)).toBe("--");
    expect(formatWeatherSummary(row)).toContain("OpenWeather");
    expect(formatWeatherSource(row)).toBe("Weather unavailable");
    expect(getWeatherRiskLevel(row)).toBe("missing");
  });

  it("turns detail fields into expandable operational metrics", () => {
    const labels = buildWeatherDetailMetrics(availableRow).map((metric) => metric.label);

    expect(labels).toEqual(["Feels", "Rain", "QPF", "Wind", "Gust", "Humidity", "UV", "Clouds", "Vis"]);
    expect(getWeatherOperationalNote({ ...availableRow, thunderstorm_probability_pct: 40 })).toContain("Storm risk");
  });

  it("exposes hourly points and exportable weather matrix values", () => {
    expect(getWeatherHourlyPoints(availableRow)).toHaveLength(2);
    expect(getWeatherMatrixValue(availableRow, "weather.hourly_count")).toBe(2);
    expect(getWeatherMatrixValue(availableRow, "weather.provider_raw")).toBe("precipitation, temperature");
    expect(formatWeatherMatrixValue(availableRow.high_temp_f, "temperature")).toBe("81°");
  });

  it("summarizes multi-day weather segments without inventing unavailable data", () => {
    const summary = summarizeWeatherRows([
      availableRow,
      { ...availableRow, high_temp_f: 75, low_temp_f: 58, precipitation_probability_pct: 10 },
      { status: "unavailable" },
    ]);

    expect(summary).toMatchObject({
      availableDays: 2,
      totalDays: 3,
      high: 81.4,
      low: 58,
      maxPrecip: 42,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildWeatherDetailMetrics,
  buildWeatherDataFields,
  formatWeatherBrief,
  formatWeatherDateLabel,
  formatWeatherFreshnessLabel,
  formatTemperatureRange,
  getWeatherRefreshIssueLabel,
  formatWeatherSource,
  formatWeatherSummary,
  formatWeatherMatrixValue,
  getWeatherDisplayHourlyPoints,
  getWeatherHourlyPoints,
  getWeatherIconUrl,
  getWeatherMatrixValue,
  getWeatherOperationalNote,
  getWeatherRiskLevel,
  isWeatherCurrentRead,
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
    const fieldLabels = buildWeatherDataFields(availableRow).map((field) => field.label);

    expect(labels).toEqual(["Feels", "Rain", "QPF", "Wind", "Gust", "Humidity", "UV", "Clouds", "Vis"]);
    expect(fieldLabels).toContain("Hourly Points Cached");
    expect(getWeatherOperationalNote({ ...availableRow, thunderstorm_probability_pct: 40 })).toContain("Storm risk");
    expect(formatWeatherBrief(availableRow)).toBe("Light Rain · 81° / 62° · 42% rain · 12 mph wind · 71% humidity");
  });

  it("exposes hourly points and exportable weather matrix values", () => {
    expect(getWeatherHourlyPoints(availableRow)).toHaveLength(2);
    expect(getWeatherMatrixValue(availableRow, "weather.hourly_count")).toBe(2);
    expect(getWeatherMatrixValue(availableRow, "weather.provider_raw")).toBe("precipitation, temperature");
    expect(formatWeatherMatrixValue(availableRow.high_temp_f, "temperature")).toBe("81°");
  });

  it("limits graph display points to the next 24 sorted hourly readings", () => {
    const row = {
      ...availableRow,
      details_json: {
        hourly_forecast: Array.from({ length: 30 }, (_, index) => ({
          dt: 1779062400 + (29 - index) * 3600,
          temp_f: 65 + index,
          precipitation_probability_pct: index,
        })),
      },
    };

    const points = getWeatherDisplayHourlyPoints(row);

    expect(points).toHaveLength(24);
    expect(points[0].dt).toBe(1779062400);
    expect(points.at(-1).dt).toBe(1779062400 + 23 * 3600);
  });

  it("labels cached weather by the actual row date and freshness", () => {
    const row = {
      ...availableRow,
      weather_date: "2026-05-19",
      fetched_at: "2026-05-19T03:40:00.000Z",
    };

    expect(formatWeatherDateLabel(row)).toBe("Tue, May 19, 2026");
    expect(formatWeatherFreshnessLabel(row)).toContain("Cached");
    expect(formatWeatherFreshnessLabel(row)).toContain(":40");
    expect(formatWeatherFreshnessLabel(row, { warnings: ["refresh failed"] })).toContain("Refresh unavailable");
    expect(getWeatherRefreshIssueLabel({ warnings: ["OpenWeather request failed with HTTP 429: temporary blocked"] })).toBe("OpenWeather limit hit");
    expect(formatWeatherFreshnessLabel(row, { warnings: ["OpenWeather request failed with HTTP 429: temporary blocked"] })).toContain("OpenWeather limit hit");
    expect(formatWeatherFreshnessLabel({
      ...row,
      updated_at: "2026-05-19T14:36:00.000Z",
    }, { warnings: ["OpenWeather request failed with HTTP 429: temporary blocked"] })).toContain("Checked");
  });

  it("does not treat stale provider overview text as a current AI read", () => {
    const staleOverviewRow = {
      ...availableRow,
      weather_date: "2026-05-19",
      fetched_at: "2026-05-19T03:40:00.000Z",
      timezone_id: "America/New_York",
      source_kind: "daily_forecast",
      details_json: {
        overview: "Currently, the weather is stale.",
        raw_current: { temp: 78 },
      },
    };
    const currentOverviewRow = {
      ...staleOverviewRow,
      fetched_at: "2026-05-19T14:40:00.000Z",
      source_kind: "current_conditions",
      details_json: {
        overview: "Currently, the weather is live.",
        raw_current: { temp: 78 },
      },
    };

    expect(isWeatherCurrentRead(staleOverviewRow)).toBe(false);
    expect(formatWeatherSummary(staleOverviewRow)).toBe("Light rain");
    expect(getWeatherOperationalNote(staleOverviewRow)).not.toContain("stale");
    expect(getWeatherMatrixValue(staleOverviewRow, "weather.ai_overview")).toBe(null);
    expect(isWeatherCurrentRead(currentOverviewRow)).toBe(true);
    expect(formatWeatherSummary(currentOverviewRow)).toBe("Currently, the weather is live.");
  });

  it("builds a 24-hour display curve from daily cache fields when hourly points are missing", () => {
    const row = {
      ...availableRow,
      weather_date: "2026-05-19",
      details_json: {},
    };

    const points = getWeatherDisplayHourlyPoints(row);

    expect(points).toHaveLength(24);
    expect(points.every((point) => point.derived)).toBe(true);
    expect(points[0].label).toContain(":00");
    expect(Math.round(Math.max(...points.map((point) => point.tempF)))).toBe(81);
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

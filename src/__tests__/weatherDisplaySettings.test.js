import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEATHER_DISPLAY_SETTINGS,
  WEATHER_DISPLAY_SETTING_KEY,
  normalizeWeatherDisplaySettings,
} from "../hooks/useWeatherDisplaySettings";

describe("weather display settings", () => {
  it("defaults every front-end weather surface to hidden", () => {
    expect(WEATHER_DISPLAY_SETTING_KEY).toBe("weather_display_preferences");
    expect(normalizeWeatherDisplaySettings(null)).toEqual(DEFAULT_WEATHER_DISPLAY_SETTINGS);
    expect(normalizeWeatherDisplaySettings({})).toEqual({
      showDashboardWeather: false,
      showSchedulingWeather: false,
    });
  });

  it("normalizes explicit dashboard and scheduling opt-ins", () => {
    expect(normalizeWeatherDisplaySettings({
      showDashboardWeather: true,
      showSchedulingWeather: true,
    })).toEqual({
      showDashboardWeather: true,
      showSchedulingWeather: true,
    });
  });

  it("accepts legacy short keys without making them default-on", () => {
    expect(normalizeWeatherDisplaySettings({ dashboard: true })).toEqual({
      showDashboardWeather: true,
      showSchedulingWeather: false,
    });
    expect(normalizeWeatherDisplaySettings({ scheduling: true })).toEqual({
      showDashboardWeather: false,
      showSchedulingWeather: true,
    });
  });
});

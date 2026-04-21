import { describe, expect, it } from "vitest";
import {
  computePresenceDailyCalls,
  getEffectivePresenceCadence,
  sanitizePresenceSyncConfig,
} from "../hooks/presenceSyncConfig";

describe("presence sync config", () => {
  it("sanitizes cadence values to the approved interval set", () => {
    const config = sanitizePresenceSyncConfig({
      normalIntervalSeconds: 0.5,
      offHoursIntervalSeconds: 4,
      peakIntervalSeconds: 2,
      peakWindows: [
        { start: "07:00", end: "09:00" },
        { start: "bad", end: "10:00" },
      ],
    });

    expect(config.normalIntervalSeconds).toBe(5);
    expect(config.offHoursIntervalSeconds).toBe(30);
    expect(config.peakIntervalSeconds).toBe(3);
    expect(config.peakWindows).toEqual([{ start: "07:00", end: "09:00" }]);
  });

  it("uses peak cadence only inside approved peak windows", () => {
    const config = sanitizePresenceSyncConfig({
      normalIntervalSeconds: 5,
      businessHoursStart: "06:30",
      businessHoursEnd: "19:30",
      peakEnabled: true,
      peakIntervalSeconds: 3,
      peakWindows: [{ start: "07:00", end: "09:30" }],
    });

    expect(getEffectivePresenceCadence(config, new Date(2026, 3, 20, 7, 30))).toMatchObject({
      mode: "peak",
      intervalSeconds: 3,
    });
    expect(getEffectivePresenceCadence(config, new Date(2026, 3, 20, 11, 0))).toMatchObject({
      mode: "normal",
      intervalSeconds: 5,
    });
    expect(getEffectivePresenceCadence(config, new Date(2026, 3, 20, 22, 0))).toMatchObject({
      mode: "off-hours",
      intervalSeconds: 30,
    });
  });

  it("projects daily calls across business hours, peak windows, and off-hours", () => {
    const projection = computePresenceDailyCalls({
      normalIntervalSeconds: 5,
      offHoursIntervalSeconds: 30,
      businessHoursEnabled: true,
      businessHoursStart: "06:30",
      businessHoursEnd: "19:30",
      peakEnabled: true,
      peakIntervalSeconds: 3,
      peakWindows: [
        { start: "07:00", end: "09:30" },
        { start: "16:00", end: "18:30" },
      ],
    });

    expect(projection.peakMinutes).toBe(302);
    expect(projection.normalMinutes).toBe(479);
    expect(projection.offHoursMinutes).toBe(659);
    expect(projection.totalCalls).toBe(projection.peakCalls + projection.normalCalls + projection.offHoursCalls);
  });
});

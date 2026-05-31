import { describe, expect, it } from "vitest";
import {
  daysBetween,
  parseQualityOk,
  buildBridgeProbeEmail,
  bridgeOkFromResponse,
  computeIgniteHealth,
} from "../kol/onboarding/igniteHealth";

const wellFormed = { first_name: "A", last_name: "B", email: "a@b.com", phone: "1" };
const broken = { first_name: "", last_name: "", email: "", phone: "" };

describe("daysBetween", () => {
  it("counts whole days between timestamps", () => {
    expect(daysBetween("2026-05-01T00:00:00Z", "2026-05-08T00:00:00Z")).toBe(7);
    expect(daysBetween(null, "2026-05-08T00:00:00Z")).toBeNull();
  });
});

describe("parseQualityOk", () => {
  it("passes when most recent leads are well-formed", () => {
    expect(parseQualityOk([wellFormed, wellFormed, broken])).toBe(true);
  });
  it("fails when most recent leads are empty", () => {
    expect(parseQualityOk([broken, broken, wellFormed])).toBe(false);
  });
  it("has no signal with no leads", () => {
    expect(parseQualityOk([])).toBeNull();
  });
});

describe("buildBridgeProbeEmail", () => {
  it("builds a dry-run probe carrying the location slug", () => {
    const probe = buildBridgeProbeEmail("deerfield");
    expect(probe.dryRun).toBe(true);
    expect(probe.html).toContain("k9resorts.com/deerfield/");
    expect(probe.from).toContain("cloudbackend.net");
  });
  it("never omits dryRun", () => {
    expect(buildBridgeProbeEmail("").dryRun).toBe(true);
  });
});

describe("bridgeOkFromResponse", () => {
  it("is true only for a successful dry-run that routed", () => {
    expect(bridgeOkFromResponse({ ok: true, data: { success: true, dryRun: true, locationId: "x" } })).toBe(true);
    expect(bridgeOkFromResponse({ ok: true, data: { success: true, dryRun: true } })).toBe(false); // didn't route
    expect(bridgeOkFromResponse({ ok: false, data: {} })).toBe(false);
  });
});

describe("computeIgniteHealth", () => {
  const now = "2026-05-31T00:00:00Z";

  it("is unconfigured without an active config", () => {
    expect(computeIgniteHealth({ configured: false }).level).toBe("unconfigured");
  });

  it("is down when the bridge validation fails", () => {
    expect(computeIgniteHealth({ configured: true, bridgeOk: false, now }).level).toBe("down");
  });

  it("is down when arriving leads don't parse", () => {
    const h = computeIgniteHealth({ configured: true, recentLeads: [broken, broken], now });
    expect(h.level).toBe("down");
    expect(h.label).toMatch(/Parsing/);
  });

  it("warns when submissions have gone stale", () => {
    const h = computeIgniteHealth({ configured: true, lastLeadAt: "2026-05-01T00:00:00Z", now, recentLeads: [wellFormed] });
    expect(h.level).toBe("warn");
    expect(h.detail).toMatch(/forwarding/);
  });

  it("is ok and connected with no leads yet", () => {
    expect(computeIgniteHealth({ configured: true, now }).label).toBe("Connected");
  });

  it("is live with a recent well-formed submission", () => {
    const h = computeIgniteHealth({ configured: true, lastLeadAt: "2026-05-30T00:00:00Z", now, recentLeads: [wellFormed] });
    expect(h.level).toBe("ok");
    expect(h.label).toBe("Live");
  });
});

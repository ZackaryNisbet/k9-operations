import { describe, expect, it } from "vitest";
import {
  daysBetween,
  parseQualityOk,
  buildBridgeProbeEmail,
  bridgeOkFromResponse,
  computeIgniteHealth,
  isSnapshotFresh,
  healthFromSnapshot,
  formatAgo,
  formatUntil,
  formatClock,
  describeHealthBadge,
  healthChecks,
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

describe("snapshot helpers", () => {
  it("maps a stored snapshot to a badge verdict", () => {
    const h = healthFromSnapshot({ level: "warn", detail: "No forms in 51 days", checked_at: "2026-05-31T04:00:00Z" });
    expect(h.tone).toBe("warning");
    expect(h.label).toBe("No recent forms");
    expect(h.detail).toMatch(/51 days/);
    expect(healthFromSnapshot(null)).toBeNull();
  });

  it("judges snapshot freshness against a max age", () => {
    const now = Date.parse("2026-05-31T05:00:00Z");
    expect(isSnapshotFresh({ checked_at: "2026-05-31T04:30:00Z" }, 3 * 3600 * 1000, now)).toBe(true);
    expect(isSnapshotFresh({ checked_at: "2026-05-30T04:30:00Z" }, 3 * 3600 * 1000, now)).toBe(false);
    expect(isSnapshotFresh(null)).toBe(false);
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

describe("formatAgo / formatUntil", () => {
  const now = Date.parse("2026-05-31T05:00:00Z");
  it("formats elapsed time compactly", () => {
    expect(formatAgo("2026-05-31T04:59:30Z", now)).toBe("30s ago");
    expect(formatAgo("2026-05-31T04:57:00Z", now)).toBe("3m ago");
    expect(formatAgo("2026-05-31T03:00:00Z", now)).toBe("2h ago");
    expect(formatAgo("2026-05-29T05:00:00Z", now)).toBe("2d ago");
    expect(formatAgo(null, now)).toBeNull();
  });
  it("formats time remaining to the next run", () => {
    expect(formatUntil("2026-05-31T05:12:00Z", now)).toBe("in 12m");
    expect(formatUntil("2026-05-31T04:50:00Z", now)).toBe("due now");
    expect(formatUntil(null, now)).toBeNull();
  });
});

describe("formatClock", () => {
  it("renders a clock string for a valid time, null otherwise", () => {
    expect(typeof formatClock("2026-05-31T05:15:00Z")).toBe("string");
    expect(formatClock(null)).toBeNull();
    expect(formatClock("not-a-date")).toBeNull();
  });
});

describe("describeHealthBadge", () => {
  const now = Date.parse("2026-05-31T05:00:00Z");
  it("summarizes an ok snapshot with verified + next-run timing", () => {
    const b = describeHealthBadge(
      { level: "ok", checked_at: "2026-05-31T04:58:00Z", next_run_at: "2026-05-31T05:15:00Z", detail: "Pipeline validated" },
      now
    );
    expect(b.ok).toBe(true);
    expect(b.tone).toBe("success");
    expect(b.verifiedAgo).toBe("2m ago");
    expect(b.nextUntil).toBe("in 15m");
  });
  it("is not ok for warn, and is null without a snapshot", () => {
    expect(describeHealthBadge({ level: "warn", checked_at: "2026-05-31T04:58:00Z" }, now).ok).toBe(false);
    expect(describeHealthBadge(null)).toBeNull();
  });
});

describe("healthChecks", () => {
  it("lists the four dependency checks with latencies", () => {
    const rows = healthChecks({ bridge_ok: true, bridge_ms: 217, resend_ok: true, resend_ms: 98, db_ok: true, db_ms: 19, roundtrip_ok: null });
    expect(rows.map((r) => r.key)).toEqual(["bridge", "resend", "db", "roundtrip"]);
    expect(rows[0].ms).toBe(217);
    expect(rows[3].ok).toBeNull(); // round-trip idle when the canary is disabled
    expect(healthChecks(null)).toEqual([]);
  });
});

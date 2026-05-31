// Unit tests for the Ignite health-check EDGE function's pure decision logic,
// imported straight from the shared module the function deploys with.
import { describe, it, expect } from "vitest";
import { computeLevel, nextQuarterHour, STALE_DAYS } from "../../supabase/functions/_shared/ignite-health-logic.ts";

const base = { bridgeOk: true, resendOk: true, dbOk: true, roundtripOk: null, lastLeadAt: null, now: new Date("2026-05-31T12:00:00Z") };

describe("computeLevel (ignite-health-check edge logic)", () => {
  it("is down when the database write path fails", () => {
    expect(computeLevel({ ...base, dbOk: false }).level).toBe("down");
  });
  it("is down when the bridge dry-run fails", () => {
    expect(computeLevel({ ...base, bridgeOk: false }).level).toBe("down");
  });
  it("is down when Resend is unreachable", () => {
    expect(computeLevel({ ...base, resendOk: false }).level).toBe("down");
  });
  it("is down (and says so) when the synthetic round-trip misses", () => {
    const r = computeLevel({ ...base, roundtripOk: false });
    expect(r.level).toBe("down");
    expect(r.detail).toMatch(/round-trip/i);
  });
  it("stays ok when the round-trip lands, even with stale booking forms", () => {
    const r = computeLevel({ ...base, roundtripOk: true, lastLeadAt: "2026-03-01T00:00:00Z" });
    expect(r.level).toBe("ok");
    expect(r.detail).toMatch(/verified end-to-end/i);
  });
  it("warns on stale forms only when the round-trip is NOT confirming", () => {
    const r = computeLevel({ ...base, roundtripOk: null, lastLeadAt: "2026-03-01T00:00:00Z" });
    expect(r.level).toBe("warn");
    expect(r.detail).toMatch(/forwarding rule/i);
  });
  it("is ok and awaiting when there are no leads yet", () => {
    expect(computeLevel({ ...base }).detail).toMatch(/awaiting/i);
  });
});

describe("nextQuarterHour", () => {
  it("rounds up to the next :00/:15/:30/:45 boundary", () => {
    expect(nextQuarterHour(new Date("2026-05-31T12:07:30Z"))).toBe("2026-05-31T12:15:00.000Z");
    expect(nextQuarterHour(new Date("2026-05-31T12:15:00Z"))).toBe("2026-05-31T12:30:00.000Z"); // on a boundary → next
    expect(nextQuarterHour(new Date("2026-05-31T12:52:00Z"))).toBe("2026-05-31T13:00:00.000Z");
  });
  it("exposes the 7-day stale threshold", () => {
    expect(STALE_DAYS).toBe(7);
  });
});

import { describe, expect, it } from "vitest";
import {
  igniteWebhookUrl,
  WIZARD_STEPS,
  stepIndex,
  normalizeProfileId,
  validateProfileId,
  extractProfileId,
  inputLooksLikeUrl,
  canManageIgnite,
  validateInboundEmail,
  canAdvance,
  buildIgniteConfigPayload,
  buildLiteSettingsValue,
  deriveConfigStatus,
  patchSampleProfileId,
  buildTestEmail,
  friendlyTestError,
  interpretTestResult,
  TEST_SAMPLES,
  SAMPLE_PROFILE_TOKEN,
  IGNITE_SENDER_EMAIL,
} from "../kol/onboarding/igniteOnboarding";

describe("igniteWebhookUrl", () => {
  it("joins the project URL with the function path and trims slashes", () => {
    expect(igniteWebhookUrl("https://abc.supabase.co")).toBe("https://abc.supabase.co/functions/v1/ignite-webhook");
    expect(igniteWebhookUrl("https://abc.supabase.co/")).toBe("https://abc.supabase.co/functions/v1/ignite-webhook");
  });
});

describe("wizard steps", () => {
  it("are ordered intro → … → done", () => {
    expect(WIZARD_STEPS[0].id).toBe("intro");
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1].id).toBe("done");
    expect(stepIndex("activate")).toBe(3);
    expect(stepIndex("nope")).toBe(-1);
  });
});

describe("validation", () => {
  it("requires a profile id", () => {
    expect(validateProfileId("  ")).toEqual({ ok: false, error: expect.any(String) });
    expect(validateProfileId(" 156865 ")).toEqual({ ok: true, value: "156865" });
    expect(normalizeProfileId("  IGN-7842 ")).toBe("IGN-7842");
  });

  it("treats inbound email as optional but format-checked", () => {
    expect(validateInboundEmail("")).toEqual({ ok: true, value: "" });
    expect(validateInboundEmail("leads@x.resend.app")).toEqual({ ok: true, value: "leads@x.resend.app" });
    expect(validateInboundEmail("not-an-email").ok).toBe(false);
  });

  it("gates step advancement on the relevant field", () => {
    expect(canAdvance("intro", {})).toBe(true);
    expect(canAdvance("profile", { profileId: "" })).toBe(false);
    expect(canAdvance("profile", { profileId: "156865" })).toBe(true);
    expect(canAdvance("forwarding", { inboundEmail: "bad" })).toBe(false);
    expect(canAdvance("forwarding", { inboundEmail: "" })).toBe(true);
  });
});

describe("extractProfileId", () => {
  it("pulls the ID out of a pasted Ignite URL", () => {
    expect(extractProfileId("leads.idigitalstrategies.com/profile/156865/leads")).toBe("156865");
    expect(extractProfileId("https://leads.idigitalstrategies.com/profile/156865/leads")).toBe("156865");
    expect(extractProfileId("  https://leads.idigitalstrategies.com/profile/156865/dashboard  ")).toBe("156865");
  });

  it("accepts a bare numeric code", () => {
    expect(extractProfileId("156865")).toBe("156865");
    expect(extractProfileId(" 156865 ")).toBe("156865");
  });

  it("returns '' when there's nothing usable", () => {
    expect(extractProfileId("")).toBe("");
    expect(extractProfileId("not an id")).toBe("");
  });

  it("flags URL-shaped input", () => {
    expect(inputLooksLikeUrl("leads.idigitalstrategies.com/profile/156865/leads")).toBe(true);
    expect(inputLooksLikeUrl("156865")).toBe(false);
  });
});

describe("canManageIgnite", () => {
  it("allows location admins and up", () => {
    ["location_admin", "admin", "multi_location_admin", "regional", "enterprise_admin", "owner", "developer"].forEach((role) => {
      expect(canManageIgnite({ role })).toBe(true);
    });
  });

  it("blocks managers and below", () => {
    ["manager", "supervisor", "csr", "pct"].forEach((role) => {
      expect(canManageIgnite({ role })).toBe(false);
    });
    expect(canManageIgnite({})).toBe(false);
    expect(canManageIgnite(null)).toBe(false);
  });
});

describe("persistence payloads", () => {
  it("builds the ignite_config row the edge function reads", () => {
    expect(
      buildIgniteConfigPayload({ locationId: "loc-1", profileId: " 156865 ", inboundEmail: " leads@x.app ", isActive: true })
    ).toEqual({ location_id: "loc-1", ignite_profile_id: "156865", inbound_email: "leads@x.app", is_active: true });
  });

  it("nulls a blank inbound email", () => {
    expect(buildIgniteConfigPayload({ locationId: "loc-1", profileId: "156865", inboundEmail: "" }).inbound_email).toBeNull();
  });

  it("mirrors the legacy lite_settings shape", () => {
    expect(buildLiteSettingsValue({ profileId: "156865", inboundEmail: "leads@x.app", connected: true })).toEqual({
      profileNumber: "156865",
      emailForward: "leads@x.app",
      connected: true,
    });
  });

  it("derives a config status badge", () => {
    expect(deriveConfigStatus(null)).toBe("not_configured");
    expect(deriveConfigStatus({ is_active: true })).toBe("active");
    expect(deriveConfigStatus({ is_active: false })).toBe("inactive");
  });
});

describe("live test email", () => {
  it("swaps the sample profile token for the real id (token + parsed field)", () => {
    const html = patchSampleProfileId(TEST_SAMPLES.web_form.html, "156865");
    expect(html).not.toContain(SAMPLE_PROFILE_TOKEN);
    expect(html).toContain("156865");
    expect(html).toMatch(/data-field="ignite_profile_id"[^>]*>156865</);
  });

  it("builds a webhook body from a sample", () => {
    const body = buildTestEmail(TEST_SAMPLES.web_form, "156865");
    expect(body.from).toBe(IGNITE_SENDER_EMAIL);
    expect(body.headers.subject).toBe(TEST_SAMPLES.web_form.subject);
    expect(body.html).toContain("156865");
  });

  it("returns null for a missing sample", () => {
    expect(buildTestEmail(null, "156865")).toBeNull();
  });
});

describe("interpretTestResult", () => {
  it("reports success with the match status", () => {
    expect(interpretTestResult({ ok: true, status: 200, data: { success: true, matchStatus: "no_match", leadId: "x" } })).toEqual({
      success: true,
      message: expect.stringContaining("no_match"),
    });
  });

  it("maps a no-active-config error to a helpful message", () => {
    const r = interpretTestResult({ ok: false, status: 422, data: { error: "No active location configured for this Ignite profile" } });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/Profile ID/);
  });

  it("falls back to the raw error / HTTP status", () => {
    expect(interpretTestResult({ ok: false, status: 500, data: {} }).message).toBe("HTTP 500");
    expect(friendlyTestError("boom")).toBe("boom");
  });
});

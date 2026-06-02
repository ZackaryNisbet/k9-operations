import { describe, it, expect } from "vitest";
import { LEAD_TYPES } from "../ignite/constants.js";
import {
  CAMPAIGN_STATUSES,
  getCampaignStatusMeta,
  isEditableCampaign,
  isEmailableLead,
  resolveAudienceLeads,
  audienceCountsByStatus,
  audienceSummary,
  MERGE_TAG_KEYS,
  leadMergeData,
  applyMergeTags,
  isValidEmail,
  campaignBlockReason,
  canSendCampaign,
  campaignRates,
  makeBlankCampaign,
  buildCampaignPayload,
  buildTemplatePayload,
  buildCampaignRecipients,
  campaignHistoryEventLabel,
  campaignHistoryEventTone,
  groupCampaignHistoryByDay,
  K9_RESORTS_BRAND,
  EDITOR_BRAND_PALETTE,
} from "../kol/campaignsData.js";

// ── lead fixtures (mirror the shapes crmData expects) ────────────────────────
const bookingLead = (over = {}) => ({
  id: "b1",
  lead_type: LEAD_TYPES.WEB_FORM,
  lead_status: "new_lead_action_needed",
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  created_at: "2026-05-30T15:00:00+00:00",
  form_data: {
    desired_service: "Boarding",
    desired_date_of_boarding_or_day_care: "June 10",
    city: "Remy Calloway",
    state: "IL",
  },
  ...over,
});
const employmentLead = (over = {}) => ({
  id: "e1",
  lead_type: LEAD_TYPES.WEB_FORM,
  lead_status: "new_lead_action_needed",
  email: "applicant@example.com",
  created_at: "2026-05-30T15:00:00+00:00",
  form_data: { what_type_of_position_are_you_interested_in: "CSR" },
  ...over,
});
const appointmentLead = (over = {}) => ({
  id: "a1",
  lead_type: LEAD_TYPES.WEB_FORM,
  email: "appt@example.com",
  form_data: { estimated_total: 240 },
  ...over,
});
const noEmailLead = (over = {}) => ({
  id: "n1",
  lead_type: LEAD_TYPES.WEB_FORM,
  lead_status: "new_lead_action_needed",
  first_name: "No",
  last_name: "Mail",
  form_data: { desired_service: "Daycare" },
  ...over,
});

describe("campaign status vocabulary", () => {
  it("exposes a draft→sent lifecycle and resolves meta", () => {
    expect(CAMPAIGN_STATUSES.map((s) => s.value)).toEqual(
      ["draft", "scheduled", "sending", "sent", "failed", "canceled"],
    );
    expect(getCampaignStatusMeta("sent").label).toBe("Sent");
    expect(getCampaignStatusMeta("bogus").value).toBe("draft");
  });
  it("only allows editing drafts/scheduled", () => {
    expect(isEditableCampaign({ status: "draft" })).toBe(true);
    expect(isEditableCampaign({ status: "scheduled" })).toBe(true);
    expect(isEditableCampaign({ status: "sent" })).toBe(false);
    expect(isEditableCampaign({ status: "sending" })).toBe(false);
  });
});

describe("audience resolution (matches the CRM page rules)", () => {
  it("includes emailable booking leads, excludes appointments / no-email / employment by default", () => {
    expect(isEmailableLead(bookingLead())).toBe(true);
    expect(isEmailableLead(appointmentLead())).toBe(false);
    expect(isEmailableLead(noEmailLead())).toBe(false);
    const leads = [bookingLead(), employmentLead(), appointmentLead(), noEmailLead()];
    const resolved = resolveAudienceLeads(leads, {});
    expect(resolved.map((l) => l.id)).toEqual(["b1"]);
  });
  it("opts employment leads in when requested", () => {
    const leads = [bookingLead(), employmentLead()];
    const resolved = resolveAudienceLeads(leads, { includeEmployment: true });
    expect(resolved.map((l) => l.id).sort()).toEqual(["b1", "e1"]);
  });
  it("filters by pipeline stage", () => {
    const leads = [
      bookingLead({ id: "new1", lead_status: "new_lead_action_needed" }),
      bookingLead({ id: "talk1", lead_status: "contacted_talking", email: "t@example.com" }),
    ];
    const resolved = resolveAudienceLeads(leads, { statuses: ["contacted_talking"] });
    expect(resolved.map((l) => l.id)).toEqual(["talk1"]);
  });
  it("counts emailable leads per stage", () => {
    const leads = [
      bookingLead({ id: "1", lead_status: "new_lead_action_needed" }),
      bookingLead({ id: "2", lead_status: "new_lead_action_needed", email: "two@example.com" }),
      bookingLead({ id: "3", lead_status: "on_fence", email: "three@example.com" }),
      appointmentLead(),
    ];
    const counts = audienceCountsByStatus(leads);
    expect(counts.new_lead_action_needed).toBe(2);
    expect(counts.on_fence).toBe(1);
    expect(counts.booked_reservation).toBe(0);
  });
  it("summarizes the audience filter", () => {
    expect(audienceSummary({ statuses: [] })).toBe("All open leads · Booking");
    expect(audienceSummary({ statuses: ["new_lead_action_needed", "on_fence"], includeEmployment: true }))
      .toBe("New, On Fence · Booking + employment");
  });
});

describe("merge tags", () => {
  it("builds personalization data from a lead", () => {
    const data = leadMergeData(bookingLead());
    expect(data.first_name).toBe("Jane");
    expect(data.last_name).toBe("Doe");
    expect(data.full_name).toBe("Jane Doe");
    expect(data.email).toBe("jane@example.com");
    expect(data.desired_service).toBe("Boarding");
    expect(data.state).toBe("IL");
    expect(data.resort_name).toBe(K9_RESORTS_BRAND.name);
  });
  it("substitutes tags, collapses unknown/empty, and greets gracefully", () => {
    expect(applyMergeTags("Hi {{first_name}}!", { first_name: "Jane" })).toBe("Hi Jane!");
    expect(applyMergeTags("Hi {{ first_name }}", { first_name: "Jo" })).toBe("Hi Jo");
    expect(applyMergeTags("Hi {{first_name}}", {})).toBe("Hi there");
    expect(applyMergeTags("Call {{phone}}", {})).toBe("Call ");
    expect(applyMergeTags("{{bogus_tag}}", {})).toBe("");
  });
  it("every catalog key is resolvable from leadMergeData", () => {
    const data = leadMergeData(bookingLead());
    for (const key of MERGE_TAG_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key)).toBe(true);
    }
  });
});

describe("send readiness + rates", () => {
  it("validates emails", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
  it("explains why a campaign can't send, and clears when ready", () => {
    const base = { subject: "", compiled_html: "", from_email: "marketing@k9operations.com" };
    expect(campaignBlockReason(base, 0)).toBe("Add a subject line");
    expect(campaignBlockReason({ ...base, subject: "Hi" }, 0)).toBe("Design the email first");
    expect(campaignBlockReason({ ...base, subject: "Hi", compiled_html: "<p>x</p>" }, 0)).toBe("No recipients match this audience");
    const ready = { subject: "Hi", compiled_html: "<p>x</p>", from_email: "marketing@k9operations.com" };
    expect(campaignBlockReason(ready, 5)).toBeNull();
    expect(canSendCampaign(ready, 5)).toBe(true);
  });
  it("computes open/click/bounce rates", () => {
    const rates = campaignRates({ sent_count: 100, delivered_count: 90, opened_count: 45, clicked_count: 9, bounced_count: 10, unsubscribed_count: 3 });
    expect(rates.openRate).toBe(50);
    expect(rates.clickRate).toBe(10);
    expect(rates.bounceRate).toBe(10);
    expect(rates.unsubscribeRate).toBe(3.3);
  });
  it("rates are zero with no sends", () => {
    expect(campaignRates({}).openRate).toBe(0);
  });
});

describe("payload builders", () => {
  it("builds a campaign payload, stamps actor on create, drops UI keys", () => {
    const draft = { ...makeBlankCampaign("loc-1"), name: "Spring promo", subject: "Save 20%", audience: { statuses: ["new_lead_action_needed"], includeEmployment: false } };
    const payload = buildCampaignPayload(draft, "loc-1", { userId: "u1", name: "Skyler" });
    expect(payload.location_id).toBe("loc-1");
    expect(payload.from_name).toBe("K9 Resorts");
    expect(payload.from_email).toBe("marketing@k9operations.com");
    expect(payload.audience_summary).toBe("New · Booking");
    expect(payload.created_by_user_id).toBe("u1");
    expect(payload.updated_by_name).toBe("Skyler");
    expect(payload).not.toHaveProperty("isDraft");
  });
  it("does not stamp created_by on an edit", () => {
    const payload = buildCampaignPayload({ name: "x", subject: "y", isDraft: false }, "loc-1", { userId: "u2", name: "Pat" });
    expect(payload.created_by_user_id).toBeUndefined();
    expect(payload.updated_by_user_id).toBe("u2");
  });
  it("builds a template payload", () => {
    const payload = buildTemplatePayload({ name: "Welcome", subject: "Hi", design: { html: "<x>", css: "" }, isDraft: true }, "loc-1", { userId: "u1", name: "Skyler" });
    expect(payload.name).toBe("Welcome");
    expect(payload.design).toEqual({ html: "<x>", css: "" });
    expect(payload.created_by_name).toBe("Skyler");
  });
});

describe("recipient resolution + suppression", () => {
  it("snapshots recipients, dedupes, and drops suppressed addresses", () => {
    const leads = [
      bookingLead({ id: "1", email: "jane@example.com" }),
      bookingLead({ id: "2", email: "JANE@example.com" }),   // dup (case-insensitive)
      bookingLead({ id: "3", email: "supp@example.com" }),    // suppressed
      bookingLead({ id: "4", email: "ok@example.com" }),
      employmentLead(),                                        // excluded (booking-only)
    ];
    const { rows, suppressedCount, matchedCount } = buildCampaignRecipients(leads, {}, ["supp@example.com"]);
    expect(matchedCount).toBe(4);                  // 4 booking leads matched
    expect(suppressedCount).toBe(1);               // one was on the suppression list
    expect(rows.map((r) => r.email).sort()).toEqual(["jane@example.com", "ok@example.com"]);
    expect(rows[0].merge_data.first_name).toBe("Jane");
    expect(rows[0].lead_id).toBe("1");
  });
});

describe("history", () => {
  it("labels + tones events", () => {
    expect(campaignHistoryEventLabel("sent")).toBe("Sent");
    expect(campaignHistoryEventLabel("weird")).toBe("Changed");
    expect(campaignHistoryEventTone("sent")).toBe("success");
    expect(campaignHistoryEventTone("canceled")).toBe("danger");
  });
  it("groups history by local day, newest first", () => {
    const rows = [
      { id: "1", event_at: "2026-05-31T15:00:00+00:00", event_type: "created" },
      { id: "2", event_at: "2026-06-01T16:00:00+00:00", event_type: "sent" },
    ];
    const grouped = groupCampaignHistoryByDay(rows);
    expect(grouped[0].day > grouped[1].day).toBe(true);
    expect(grouped.length).toBe(2);
  });
});

describe("brand kit", () => {
  it("exposes the K9 Resorts palette pulled from the logo", () => {
    expect(K9_RESORTS_BRAND.navy).toBe("#183661");
    expect(K9_RESORTS_BRAND.gold).toBe("#AF8D54");
    expect(EDITOR_BRAND_PALETTE.find((c) => c.value === "#183661")).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import {
  leadTypeLabel,
  isWebForm,
  classifySubmissionCategory,
  countByCategory,
  filterSubmissions,
  cleanLeadName,
  leadSortName,
  formatPhonePretty,
  humanizeFieldKey,
  buildFormFieldEntries,
  groupUpdatesByLead,
  summarizeUpdates,
  deriveFollowUp,
  buildUpdatePayload,
  followUpState,
  recommendedFollowUp,
  updateTypeLabel,
  SUBMISSION_CATEGORIES,
  LIVE_CATEGORY_IDS,
} from "../kol/crmData";

const bookingLead = {
  id: "l1",
  lead_type: "web_form",
  first_name: "Janelle",
  last_name: "Martinez",
  email: "JMBMartinez.jmm@gmail.com",
  phone: "8567018139",
  raw_email_subject: "New Booking Form Submission Received",
  form_data: {
    zip_code: "08003",
    desired_service: "Dog Boarding",
    desired_date_of_boarding_or_day_care: "June 25th to July 1st",
    details: "1 dog, email or text is good",
    form_name: "Booking",
    ignite_lead_id: "232458871", // noise — hidden
  },
};

const phoneLead = { id: "l2", lead_type: "phone_call", first_name: "Carl", last_name: "Trimbach" };
const employmentLead = { id: "l3", lead_type: "web_form", first_name: "Devon", last_name: "Reyes", form_data: { message: "I'd like to apply for a job" } };

describe("lead type", () => {
  it("labels and identifies web forms", () => {
    expect(leadTypeLabel("web_form")).toBe("Web Form");
    expect(isWebForm(bookingLead)).toBe(true);
    expect(isWebForm(phoneLead)).toBe(false);
  });
});

describe("categories", () => {
  it("defaults to booking, detects employment", () => {
    expect(classifySubmissionCategory(bookingLead)).toBe("booking");
    expect(classifySubmissionCategory(employmentLead)).toBe("employment");
  });

  it("counts only web forms per live category", () => {
    expect(countByCategory([bookingLead, phoneLead, employmentLead])).toEqual({ booking: 1, employment: 1 });
  });

  it("filters out phone calls and off-category leads", () => {
    expect(filterSubmissions([bookingLead, phoneLead, employmentLead], { category: "booking" })).toEqual([bookingLead]);
    expect(filterSubmissions([bookingLead, phoneLead], { category: "booking" }).every(isWebForm)).toBe(true);
  });

  it("exposes exactly the booking + employment subtabs", () => {
    expect(LIVE_CATEGORY_IDS).toEqual(["booking", "employment"]);
    expect(SUBMISSION_CATEGORIES.find((c) => c.id === "booking").label).toBe("Booking Availability Form");
    expect(SUBMISSION_CATEGORIES.some((c) => c.id === "partnerships" || c.id === "events")).toBe(false);
  });
});

describe("name + phone presentation", () => {
  it("combines first+last and collapses stray spaces", () => {
    expect(cleanLeadName(bookingLead)).toBe("Janelle Martinez");
    expect(cleanLeadName({ first_name: "  Pa ", last_name: "  Hazleton " })).toBe("Pa Hazleton");
    expect(cleanLeadName({ first_name: "Liacouras", last_name: null })).toBe("Liacouras");
    expect(leadSortName(bookingLead)).toBe("martinez janelle");
  });

  it("formats phone as cc (area) three - four", () => {
    expect(formatPhonePretty("8567018139")).toBe("1 (856) 701 - 8139");
    expect(formatPhonePretty("18567018139")).toBe("1 (856) 701 - 8139");
    expect(formatPhonePretty("+1 (856) 701-8139")).toBe("1 (856) 701 - 8139");
    expect(formatPhonePretty("")).toBe("");
    expect(formatPhonePretty("12345")).toBe("12345"); // unknown → passthrough
  });
});

describe("web-form details", () => {
  it("humanizes keys", () => {
    expect(humanizeFieldKey("desired_service")).toBe("Desired Service");
    expect(humanizeFieldKey("zip_code")).toBe("Zip Code");
  });

  it("lists email first then every distinct field, hiding noise", () => {
    const entries = buildFormFieldEntries(bookingLead);
    const labels = entries.map((e) => e.label);
    expect(labels[0]).toBe("Email");
    expect(labels).toContain("Desired Service");
    expect(labels).toContain("Zip Code");
    expect(labels).toContain("Details");
    expect(labels).not.toContain("Ignite Lead Id"); // hidden noise
  });

  it("returns [] when there's nothing to show", () => {
    expect(buildFormFieldEntries({})).toEqual([]);
  });
});

describe("updates (relational follow-up log)", () => {
  const updates = [
    { id: "u1", lead_id: "l1", update_type: "call", notes: "left vm", next_follow_up_date: "2026-06-01", created_at: "2026-05-28T10:00:00Z" },
    { id: "u2", lead_id: "l1", update_type: "text", notes: "texted", next_follow_up_date: "2026-06-03", created_at: "2026-05-30T10:00:00Z" },
    { id: "u3", lead_id: "l2", update_type: "note", notes: "n", next_follow_up_date: null, created_at: "2026-05-29T10:00:00Z" },
  ];

  it("groups by lead", () => {
    const map = groupUpdatesByLead(updates);
    expect(map.l1).toHaveLength(2);
    expect(map.l2).toHaveLength(1);
  });

  it("summarizes count + latest", () => {
    const map = groupUpdatesByLead(updates);
    const s = summarizeUpdates(map.l1);
    expect(s.count).toBe(2);
    expect(s.latest.id).toBe("u2");
    expect(summarizeUpdates([])).toEqual({ count: 0, latest: null });
  });

  it("derives the pending follow-up from the newest update", () => {
    const map = groupUpdatesByLead(updates);
    expect(deriveFollowUp(map.l1)).toBe("2026-06-03");
    expect(deriveFollowUp(map.l2)).toBe(""); // no date set
    expect(deriveFollowUp([])).toBe("");
  });

  it("builds an insert payload with a normalized type", () => {
    expect(
      buildUpdatePayload({ leadId: "l1", locationId: "loc", type: "call", notes: "  hi  ", nextFollowUp: "2026-06-02", createdByName: "Pat" })
    ).toEqual({
      lead_id: "l1",
      location_id: "loc",
      update_type: "call",
      notes: "hi",
      next_follow_up_date: "2026-06-02",
      created_by_user_id: null,
      created_by_name: "Pat",
    });
    expect(buildUpdatePayload({ leadId: "l1", locationId: "loc", type: "smoke" }).update_type).toBe("note");
    expect(buildUpdatePayload({ leadId: "l1", locationId: "loc", notes: "" }).notes).toBeNull();
    expect(updateTypeLabel("email")).toBe("Email");
  });
});

describe("follow-up timing", () => {
  it("classifies relative to today", () => {
    const today = "2026-05-30";
    expect(followUpState("", today)).toBe("none");
    expect(followUpState("2026-05-29", today)).toBe("overdue");
    expect(followUpState("2026-05-30", today)).toBe("today");
    expect(followUpState("2026-06-01", today)).toBe("scheduled");
  });

  it("recommends +1 booking / +2 employment", () => {
    const addDays = (d, n) => {
      const dt = new Date(d + "T12:00:00");
      dt.setDate(dt.getDate() + n);
      return dt.toISOString().split("T")[0];
    };
    expect(recommendedFollowUp("booking", "2026-05-30", addDays)).toBe("2026-05-31");
    expect(recommendedFollowUp("employment", "2026-05-30", addDays)).toBe("2026-06-01");
  });
});

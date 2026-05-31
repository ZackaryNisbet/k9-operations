import { describe, expect, it } from "vitest";
import {
  leadTypeLabel,
  isWebForm,
  classifySubmissionCategory,
  isAppointment,
  isCrmSubmission,
  countByCategory,
  filterSubmissions,
  cleanLeadName,
  leadSortName,
  formatPhonePretty,
  leadPhone,
  leadEmail,
  humanizeFieldKey,
  canonicalFormFields,
  groupedFormFields,
  populatedFieldCount,
  groupUpdatesByLead,
  summarizeUpdates,
  deriveFollowUp,
  receivedDate,
  receivedTime,
  leadAttachments,
  fmtFileSize,
  capturedUpdate,
  leadUpdates,
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

  it("formats phone as (area) prefix-line", () => {
    expect(formatPhonePretty("8567018139")).toBe("(856) 701-8139");
    expect(formatPhonePretty("18567018139")).toBe("(856) 701-8139");
    expect(formatPhonePretty("+1 (856) 701-8139")).toBe("(856) 701-8139");
    expect(formatPhonePretty("")).toBe("");
    expect(formatPhonePretty("12345")).toBe("12345"); // unknown → passthrough
  });
});

describe("isAppointment — Gingr appointments excluded from the CRM", () => {
  const appt = { id: "a1", lead_type: "web_form", raw_email_subject: "New Appointment Received | Cherry Hill", form_data: { estimated_subtotal: "435.00", estimated_tax: "22.26" } };
  const booking = { id: "b1", lead_type: "web_form", raw_email_subject: "New Booking Form Submission Received", form_data: { desired_service: "Boarding", form_name: "Booking" } };
  const webform = { id: "w1", lead_type: "web_form", raw_email_subject: "New Web Form Received | Cherry Hill", form_data: { desired_service: "Daycare" } };

  it("flags appointment confirmations, not form submissions", () => {
    expect(isAppointment(appt)).toBe(true);
    expect(isAppointment(booking)).toBe(false);
    expect(isAppointment(webform)).toBe(false);
  });
  it("keeps real form submissions, drops appointments from the CRM + counts", () => {
    const leads = [appt, booking, webform];
    expect(filterSubmissions(leads, { category: "booking" }).map((l) => l.id)).toEqual(["b1", "w1"]);
    expect(countByCategory(leads).booking).toBe(2);
    expect(isCrmSubmission(appt)).toBe(false);
  });
});

describe("captured baseline — 1 log entry + follow-up = received date", () => {
  const lead = { id: "l9", lead_type: "web_form", created_at: "2026-05-20T14:30:00Z", raw_email_subject: "New Booking Form Submission Received" };

  it("receivedDate is the date part of created_at", () => {
    expect(receivedDate(lead)).toBe("2026-05-20");
    expect(receivedDate({})).toBe("");
  });
  it("capturedUpdate records the source + seeds follow-up to the received date", () => {
    const u = capturedUpdate(lead);
    expect(u.next_follow_up_date).toBe("2026-05-20");
    expect(u.notes).toMatch(/booking form/i);
    expect(u.system).toBe(true);
  });
  it("every lead has exactly one update when there are no real ones", () => {
    const updates = leadUpdates(lead, {});
    expect(updates.length).toBe(1);
    expect(summarizeUpdates(updates).count).toBe(1);
    expect(deriveFollowUp(updates)).toBe("2026-05-20");
  });
  it("real updates take precedence for follow-up; the baseline still counts", () => {
    const byLead = { l9: [{ id: "r1", lead_id: "l9", created_at: "2026-05-25T00:00:00Z", next_follow_up_date: "2026-06-01" }] };
    const updates = leadUpdates(lead, byLead);
    expect(updates.length).toBe(2);
    expect(deriveFollowUp(updates)).toBe("2026-06-01");
  });
});

describe("received time + résumé attachments", () => {
  it("receivedTime is a clock string for a valid timestamp, '' otherwise", () => {
    const t = receivedTime({ created_at: "2026-05-31T14:32:00Z" });
    expect(typeof t).toBe("string");
    expect(t.length).toBeGreaterThan(0);
    expect(receivedTime({})).toBe("");
    expect(receivedTime({ created_at: "nonsense" })).toBe("");
  });
  it("leadAttachments keeps only rows with a storage path", () => {
    expect(leadAttachments({})).toEqual([]);
    expect(leadAttachments({ attachments: "x" })).toEqual([]);
    const files = [
      { filename: "resume.pdf", path: "loc/lead/resume.pdf", size: 84000 },
      { filename: "no-path.pdf" },
    ];
    const kept = leadAttachments({ attachments: files });
    expect(kept).toHaveLength(1);
    expect(kept[0].filename).toBe("resume.pdf");
  });
  it("fmtFileSize is human readable", () => {
    expect(fmtFileSize(512)).toBe("512 B");
    expect(fmtFileSize(84000)).toBe("82 KB");
    expect(fmtFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(fmtFileSize(0)).toBe("");
    expect(fmtFileSize("nope")).toBe("");
  });
});

describe("cleanLeadName — falls back to a form_data name field", () => {
  it("uses first/last when present", () => {
    expect(cleanLeadName({ first_name: "Jane", last_name: "Doe" })).toBe("Jane Doe");
  });
  it("falls back to full_name when first/last are empty", () => {
    expect(cleanLeadName({ form_data: { full_name: "Audrey Bodnar" } })).toBe("Audrey Bodnar");
    expect(leadSortName({ form_data: { full_name: "Audrey Bodnar" } })).toBe("audrey bodnar");
  });
  it("falls back to form_data first_name + last_name (top-level columns empty)", () => {
    expect(cleanLeadName({ form_data: { first_name: "Roger", last_name: "Fay" } })).toBe("Roger Fay");
    expect(leadSortName({ form_data: { first_name: "Roger", last_name: "Fay" } })).toBe("fay roger");
  });
  it("never surfaces the name in the field list (it's promoted to its own column)", () => {
    const fields = canonicalFormFields({ form_data: { full_name: "Audrey Bodnar", zip: "08002" } });
    expect(fields.some((f) => String(f.value).includes("Audrey"))).toBe(false);
    expect(fields.find((f) => f.key === "zip").value).toBe("08002");
  });
});

describe("phone/email resolve from top-level OR form_data (row matches detail)", () => {
  it("leadPhone prefers the top-level column, then form_data phone / phone_number", () => {
    expect(leadPhone({ phone: "8567018139" })).toBe("8567018139");
    expect(leadPhone({ form_data: { phone: "6093673008" } })).toBe("6093673008");
    expect(leadPhone({ form_data: { phone_number: "6093673008" } })).toBe("6093673008");
    expect(leadPhone({})).toBe("");
  });
  it("leadEmail prefers the top-level column, then form_data", () => {
    expect(leadEmail({ email: "a@b.com" })).toBe("a@b.com");
    expect(leadEmail({ form_data: { email_address: "c@d.com" } })).toBe("c@d.com");
    expect(leadEmail({})).toBe("");
  });
  it("the row Phone column and the canonical Phone field agree", () => {
    const lead = { lead_type: "web_form", form_data: { phone: "6093673008", email: "rf@gmail.com" } };
    const rowPhone = formatPhonePretty(leadPhone(lead)); // what the row column renders
    const detailPhone = canonicalFormFields(lead).find((f) => f.key === "phone").value; // expanded detail
    expect(rowPhone).toBe("(609) 367-3008");
    expect(detailPhone).toBe(rowPhone);
  });
});

describe("canonical form fields — one defined list per category", () => {
  it("humanizes keys (utility)", () => {
    expect(humanizeFieldKey("desired_service")).toBe("Desired Service");
    expect(humanizeFieldKey("zip_code")).toBe("Zip Code");
  });

  it("booking renders one fixed, ordered list, normalizing synonym keys", () => {
    const fields = canonicalFormFields(bookingLead);
    expect(fields.map((f) => f.label)).toEqual([
      "Email", "Phone", "Preferred time to reach", "ZIP", "City", "State",
      "Desired service", "Desired date(s)", "Details",
    ]);
    expect(fields.find((f) => f.key === "email").value).toBe("JMBMartinez.jmm@gmail.com");
    expect(fields.find((f) => f.key === "phone").value).toBe("(856) 701-8139");
    expect(fields.find((f) => f.key === "zip").value).toBe("08003"); // zip_code synonym → ZIP
    expect(fields.find((f) => f.key === "desired_service").value).toBe("Dog Boarding");
  });

  it("keeps the SAME structure when a record is sparse (missing → '')", () => {
    const sparseLead = { lead_type: "web_form", form_data: { email_address: "a@b.com", zip: "08002" } };
    const sparse = canonicalFormFields(sparseLead);
    expect(sparse.map((f) => f.label)).toEqual(canonicalFormFields(bookingLead).map((f) => f.label));
    expect(sparse.find((f) => f.key === "email").value).toBe("a@b.com"); // email_address synonym → Email
    expect(sparse.find((f) => f.key === "city").value).toBe("");
    expect(populatedFieldCount(sparseLead)).toBe(2);
  });

  it("employment uses its own defined list", () => {
    const labels = canonicalFormFields(employmentLead).map((f) => f.label);
    expect(labels).toContain("Position of interest");
    expect(labels).toContain("About the applicant");
    expect(labels).not.toContain("Desired service");
  });

  it("groups Contact → Location → Request, emphasizing the request", () => {
    const groups = groupedFormFields(bookingLead);
    expect(groups.map((g) => g.id)).toEqual(["contact", "location", "request"]);
    expect(groups.map((g) => g.label)).toEqual(["Contact", "Location", "Request"]);
    expect(groups[0].fields.map((f) => f.key)).toEqual(["email", "phone", "preferred_time"]);
    expect(groups[1].fields.map((f) => f.key)).toEqual(["zip", "city", "state"]);
    expect(groups[2].fields.map((f) => f.key)).toEqual(["desired_service", "desired_dates", "details"]);
    expect(groups[2].fields.find((f) => f.key === "desired_service").emphasis).toBe(true);
  });

  it("employment's last section is the Application", () => {
    expect(groupedFormFields(employmentLead).map((g) => g.label)).toEqual(["Contact", "Location", "Application"]);
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

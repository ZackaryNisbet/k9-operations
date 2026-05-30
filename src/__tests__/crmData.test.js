import { describe, expect, it } from "vitest";
import {
  leadTypeLabel,
  matchStatusMeta,
  statusBucket,
  confidencePct,
  classifySubmissionCategory,
  buildClassifierHaystack,
  countByCategory,
  countByStatusBucket,
  leadDisplayName,
  leadSortName,
  leadPrimaryInterest,
  humanizeFieldKey,
  buildFormDataEntries,
  getOutreachLog,
  outreachCount,
  latestOutreach,
  currentFollowUp,
  makeOutreachEntry,
  appendOutreachEntry,
  followUpState,
  recommendedFollowUp,
  filterSubmissions,
  SUBMISSION_CATEGORIES,
  LIVE_CATEGORY_IDS,
} from "../kol/crmData";

const bookingLead = {
  id: "l1",
  first_name: "Sarah",
  last_name: "Johnson",
  email: "sarah.johnson@gmail.com",
  phone: "(856) 555-0142",
  lead_type: "web_form",
  raw_email_subject: "New Web Form Submission - K9 Operations Cherry Hill",
  match_status: "no_match",
  form_data: { service_interest: "Doggy Daycare", dog_name: "Max", dog_breed: "Golden Retriever", message: "Tour?" },
};

const employmentLead = {
  id: "l2",
  first_name: "Devon",
  last_name: "Reyes",
  email: "devon@example.com",
  phone: "8565550199",
  lead_type: "web_form",
  raw_email_subject: "New Careers Application - Kennel Technician",
  match_status: "matched",
  match_confidence: 0.95,
  form_data: { position: "Kennel Technician", availability: "Weekends" },
};

describe("leadTypeLabel", () => {
  it("maps known enum values and falls back", () => {
    expect(leadTypeLabel("web_form")).toBe("Web Form");
    expect(leadTypeLabel("phone_call")).toBe("Phone Call");
    expect(leadTypeLabel("ad_click")).toBe("Ad Click");
    expect(leadTypeLabel("mystery")).toBe("Submission");
  });
});

describe("matchStatusMeta + statusBucket", () => {
  it("resolves pill meta for known statuses", () => {
    expect(matchStatusMeta("matched")).toEqual({ label: "Matched", tone: "success" });
    expect(matchStatusMeta("review")).toEqual({ label: "Needs Review", tone: "warning" });
    expect(matchStatusMeta("no_match")).toEqual({ label: "New Lead", tone: "info" });
  });

  it("falls back to a neutral humanized label", () => {
    expect(matchStatusMeta("weird_state")).toEqual({ label: "Weird State", tone: "neutral" });
  });

  it("buckets statuses into new / matched / review", () => {
    expect(statusBucket({ match_status: "matched" })).toBe("matched");
    expect(statusBucket({ match_status: "review" })).toBe("review");
    expect(statusBucket({ match_status: "no_match" })).toBe("new");
    expect(statusBucket({ match_status: "new" })).toBe("new");
    expect(statusBucket({})).toBe("new");
  });
});

describe("confidencePct", () => {
  it("converts a 0–1 score to a whole percentage", () => {
    expect(confidencePct(0.95)).toBe(95);
    expect(confidencePct(1)).toBe(100);
    expect(confidencePct(0)).toBe(0);
  });

  it("returns null for missing / non-numeric values", () => {
    expect(confidencePct(null)).toBeNull();
    expect(confidencePct(undefined)).toBeNull();
    expect(confidencePct("nope")).toBeNull();
  });
});

describe("classifySubmissionCategory", () => {
  it("defaults a booking inquiry to booking", () => {
    expect(classifySubmissionCategory(bookingLead)).toBe("booking");
  });

  it("detects employment from the subject", () => {
    expect(classifySubmissionCategory(employmentLead)).toBe("employment");
  });

  it("detects employment from form-data values", () => {
    const lead = { raw_email_subject: "New Web Form Submission", form_data: { message: "I'd like to apply for a job" } };
    expect(classifySubmissionCategory(lead)).toBe("employment");
  });

  it("is case-insensitive and tolerant of missing fields", () => {
    expect(classifySubmissionCategory({ source_detail: "CAREER PAGE" })).toBe("employment");
    expect(classifySubmissionCategory({})).toBe("booking");
    expect(classifySubmissionCategory(null)).toBe("booking");
  });

  it("builds a lowercased haystack from subject, source, and form data", () => {
    const hay = buildClassifierHaystack(employmentLead);
    expect(hay).toContain("careers application");
    expect(hay).toContain("kennel technician");
    expect(hay).toBe(hay.toLowerCase());
  });
});

describe("counts", () => {
  it("counts by live category", () => {
    const counts = countByCategory([bookingLead, employmentLead, bookingLead]);
    expect(counts).toEqual({ booking: 2, employment: 1 });
  });

  it("counts by status bucket including an all total", () => {
    expect(countByStatusBucket([bookingLead, employmentLead])).toEqual({ all: 2, new: 1, matched: 1, review: 0 });
  });

  it("keeps every live category id present even at zero", () => {
    expect(Object.keys(countByCategory([])).sort()).toEqual([...LIVE_CATEGORY_IDS].sort());
  });
});

describe("name + interest helpers", () => {
  it("formats display and sort names", () => {
    expect(leadDisplayName(bookingLead)).toBe("Sarah Johnson");
    expect(leadDisplayName({})).toBe("Unknown contact");
    expect(leadSortName(bookingLead)).toBe("johnson sarah");
  });

  it("picks a representative interest / role", () => {
    expect(leadPrimaryInterest(bookingLead)).toBe("Doggy Daycare");
    expect(leadPrimaryInterest(employmentLead)).toBe("Kennel Technician");
    expect(leadPrimaryInterest({ form_data: {} })).toBe("");
  });
});

describe("humanizeFieldKey + buildFormDataEntries", () => {
  it("humanizes snake and camel case keys", () => {
    expect(humanizeFieldKey("service_interest")).toBe("Service Interest");
    expect(humanizeFieldKey("dogBreed")).toBe("Dog Breed");
    expect(humanizeFieldKey("call_recording_url")).toBe("Call Recording Url");
  });

  it("flattens form_data, hiding redundant keys and blanks", () => {
    const entries = buildFormDataEntries(bookingLead);
    const labels = entries.map((e) => e.label);
    expect(labels).toContain("Service Interest");
    expect(labels).toContain("Dog Name");
    expect(labels).not.toContain("Email"); // hidden — shown as a dedicated field
  });

  it("returns [] for a missing or non-object form_data", () => {
    expect(buildFormDataEntries({})).toEqual([]);
    expect(buildFormDataEntries({ form_data: null })).toEqual([]);
  });
});

describe("outreach log", () => {
  it("treats a missing log as empty", () => {
    expect(getOutreachLog({})).toEqual([]);
    expect(outreachCount({})).toBe(0);
    expect(latestOutreach({})).toBeNull();
    expect(currentFollowUp({})).toBe("");
  });

  it("builds an entry with a normalized channel and trimmed notes", () => {
    const entry = makeOutreachEntry({
      channel: "call",
      notes: "  Left a voicemail  ",
      nextFollowUp: "2026-06-01",
      previousFollowUp: "2026-05-30",
      loggedBy: "Pat Lee",
      now: new Date("2026-05-30T15:00:00Z"),
    });
    expect(entry.channel).toBe("call");
    expect(entry.notes).toBe("Left a voicemail");
    expect(entry.newFollowUp).toBe("2026-06-01");
    expect(entry.previousFollowUp).toBe("2026-05-30");
    expect(entry.loggedBy).toBe("Pat Lee");
    expect(entry.loggedAt).toBe("2026-05-30T15:00:00.000Z");
    expect(entry.id).toMatch(/^out_/);
  });

  it("falls back to the note channel for unknown channels", () => {
    expect(makeOutreachEntry({ channel: "smoke-signal" }).channel).toBe("note");
  });

  it("appends without mutating the original lead", () => {
    const entry = makeOutreachEntry({ channel: "note", notes: "x", now: new Date("2026-05-30T12:00:00Z") });
    const next = appendOutreachEntry(bookingLead, entry);
    expect(next).toHaveLength(1);
    expect(getOutreachLog(bookingLead)).toEqual([]); // original untouched
  });

  it("reads the latest entry and its pending follow-up", () => {
    const lead = {
      outreach_log: [
        { id: "a", loggedAt: "2026-05-28T10:00:00Z", newFollowUp: "2026-05-29" },
        { id: "b", loggedAt: "2026-05-30T10:00:00Z", newFollowUp: "2026-06-02" },
      ],
    };
    expect(latestOutreach(lead).id).toBe("b");
    expect(currentFollowUp(lead)).toBe("2026-06-02");
    expect(outreachCount(lead)).toBe(2);
  });
});

describe("followUpState", () => {
  const today = "2026-05-30";
  it("classifies relative to today", () => {
    expect(followUpState("", today)).toBe("none");
    expect(followUpState("2026-05-29", today)).toBe("overdue");
    expect(followUpState("2026-05-30", today)).toBe("today");
    expect(followUpState("2026-06-01", today)).toBe("scheduled");
  });
});

describe("recommendedFollowUp", () => {
  const addDays = (d, n) => {
    const dt = new Date(d + "T12:00:00");
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().split("T")[0];
  };
  it("uses +1 for booking (high-intent) and +2 for employment", () => {
    expect(recommendedFollowUp("booking", "2026-05-30", addDays)).toBe("2026-05-31");
    expect(recommendedFollowUp("employment", "2026-05-30", addDays)).toBe("2026-06-01");
  });
});

describe("filterSubmissions", () => {
  const leads = [bookingLead, employmentLead];
  it("filters by category", () => {
    expect(filterSubmissions(leads, { category: "booking" })).toEqual([bookingLead]);
    expect(filterSubmissions(leads, { category: "employment" })).toEqual([employmentLead]);
  });

  it("filters by status bucket and combines with category", () => {
    expect(filterSubmissions(leads, { category: "employment", status: "matched" })).toEqual([employmentLead]);
    expect(filterSubmissions(leads, { category: "booking", status: "matched" })).toEqual([]);
    expect(filterSubmissions(leads, { status: "new" })).toEqual([bookingLead]);
  });
});

describe("SUBMISSION_CATEGORIES", () => {
  it("exposes two live subtabs and at least one coming-soon tab", () => {
    expect(LIVE_CATEGORY_IDS).toEqual(["booking", "employment"]);
    expect(SUBMISSION_CATEGORIES.some((c) => !c.live)).toBe(true);
    SUBMISSION_CATEGORIES.forEach((c) => {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.explainer).toBeTruthy();
    });
  });
});
